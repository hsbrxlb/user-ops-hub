#!/usr/bin/env python3
"""Apply verified Schedule rows to a Hub feed, or verify them on GitHub Pages."""
import argparse
from collections import defaultdict
from datetime import date
from html import escape, unescape
import json
from pathlib import Path
import re
import subprocess
import sys
from tempfile import NamedTemporaryFile, TemporaryDirectory
from time import time
from urllib.error import HTTPError, URLError
from urllib.parse import parse_qs, urlsplit
from urllib.request import Request, urlopen

SITE = "https://hsbrxlb.github.io/user-ops-hub/"
PLATFORMS = ("Instagram", "Facebook", "X", "Threads")
STATUSES = {
    "In review": ("review", "待审", "In review"),
    "In review – do not post yet": ("review", "待审", "In review"),
    "Ready to post": ("ready", "可发", "Ready to post"),
    "Scheduled": ("scheduled", "已定时", "Scheduled"),
    "Posted": ("posted", "已发布", "Posted"),
    "Published": ("posted", "已发布", "Published"),
}
HOLD = {"Artwork in production", "Withdrawn for artwork correction", "Needs rework", "Needs artwork rework"}
PRODUCTS = {"cozeware": {"cozeware-ac", "freshflow"}, "oedro": {"oedro"}}
DAYS = re.compile(r'<section class="feed-day" data-date="([^"]+)"[^>]*>.*?</section>', re.S)
POSTS = re.compile(r'<article class="post" data-post="([^"]+)" data-purpose="([^"]*)"[^>]*>.*?</article>', re.S)
WEEK = "一二三四五六日"


def public_url(url, allowed=None):
    parsed = urlsplit(url)
    private_param = re.compile(r"token|secret|password|auth|signature|^sig$|^(?:api_?)?key$", re.I)
    if (parsed.scheme != "https" or not parsed.hostname or
            (allowed is not None and parsed.netloc not in allowed) or
            parsed.username or parsed.password or
            any(private_param.search(key) for key in parse_qs(parsed.query, keep_blank_values=True))):
        raise ValueError("Expected a public HTTPS URL")
    return url


def get(url, limit=32_000_000):
    request = Request(url, headers={"User-Agent": "Hub-Schedule-Sync/1.0"})
    with urlopen(request, timeout=20) as response:
        data = response.read(limit + 1)
    if len(data) > limit:
        raise ValueError("Response exceeds expected size")
    return data


def captions(url):
    source = url
    if url.startswith("https://"):
        public_url(url, {"docs.google.com"})
        match = re.fullmatch(r"/document/d/([\w-]+)(?:/(?:edit|view))?/?", urlsplit(url).path)
        if not match:
            raise ValueError("Expected a native Google Docs captions link")
        source = get(f"https://docs.google.com/document/d/{match[1]}/export?format=txt", 250_000).decode("utf-8-sig")
    parts = re.split(r"(?m)^[ \t]*(?:#{1,6}[ \t]+)?(Instagram|Facebook|X|Threads)[ \t]*:?[ \t]*$",
                     source.replace("\r\n", "\n").replace("\r", "\n"))
    labels = parts[1::2]
    result = {tag: value.strip() for tag, value in zip(labels, parts[2::2])}
    if len(labels) != len(PLATFORMS) or set(result) != set(PLATFORMS) or not all(result.values()):
        raise ValueError("Captions must contain one nonempty section per Schedule platform")
    return result


def drive_file(url):
    public_url(url, {"drive.google.com"})
    match = re.fullmatch(r"/file/d/([\w-]+)(?:/view|/edit)?/?", urlsplit(url).path)
    if not match:
        raise ValueError("Expected a public Drive file link")
    return match[1]


def hub_image(url):
    return url.startswith(SITE) and bool(re.fullmatch(
        r"assets/feed/[A-Za-z0-9_/-]+\.(?:jpe?g|png|webp)", url[len(SITE):], re.I))


def is_webp(data):
    return data.startswith(b"RIFF") and data[8:12] == b"WEBP"


def image_bytes(url):
    data = get(url if hub_image(url) else "https://drive.google.com/uc?export=download&id=" + drive_file(url))
    if not (data.startswith((b"\xff\xd8\xff", b"\x89PNG\r\n\x1a\n", b"GIF8")) or is_webp(data)):
        raise ValueError("Drive did not return a supported image")
    return data


def public_text(text):
    if re.search(r"[\u3400-\u9fff]|[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}", text):
        raise ValueError("Public Schedule text must use English and exclude email addresses")
    return escape(text)


def removed(row):
    return row.get("withdrawn") or row.get("removed")


def validate_rows(rows, brand):
    if not isinstance(rows, list) or not rows:
        raise ValueError("Provide a nonempty array of changed Schedule rows")
    seen = set()
    for row in rows:
        ident = row["id"]
        if (not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}", ident) or
                ident.casefold() in seen):
            raise ValueError("Schedule requires unique, safe Post IDs")
        seen.add(ident.casefold())
        if row.get("previous_id") and not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{0,63}", row["previous_id"]):
            raise ValueError(f"{ident}: invalid previous Hub card ID")
        for flag in ("withdrawn", "removed", "status_only"):
            if flag in row and not isinstance(row[flag], bool):
                raise ValueError(f"{ident}: {flag} must be a boolean")
        if row.get("removed"):
            continue
        if date.fromisoformat(row["date"]).isoformat() != row["date"]:
            raise ValueError(f"{ident}: expected an ISO Schedule date")
        if row.get("withdrawn"):
            if row.get("images") not in HOLD:
                raise ValueError(f"{ident}: use the verified Schedule withdrawal reason")
            continue
        if row.get("status_only"):
            if row["status"] not in {"In review", "In review – do not post yet"}:
                raise ValueError(f"{ident}: status-only is for an existing card on hold")
            continue
        if row["product"] not in PRODUCTS[brand]:
            raise ValueError(f"{ident}: unexpected brand or product")
        tags = row["tags"]
        if not re.fullmatch(r"[a-z0-9-]+(?: [a-z0-9-]+)*", tags):
            raise ValueError(f"{ident}: expected space-separated purpose slugs")
        product_tag = {"freshflow": "freshflow", "cozeware-ac": "ac"}.get(row["product"])
        if product_tag and product_tag not in tags.split():
            raise ValueError(f"{ident}: missing the product purpose tag")
        if row["status"] not in STATUSES:
            raise ValueError(f"{ident}: unexpected Schedule status")
        if row.get("platforms") != list(PLATFORMS):
            raise ValueError(f"{ident}: expected Instagram, Facebook, X and Threads")
        if not row["title"].strip():
            raise ValueError(f"{ident}: missing Schedule title")


def media_urls(row):
    if hub_image(row["images"]):
        if row.get("image_files", [row["images"]]) != [row["images"]]:
            raise ValueError(f'{row["id"]}: image list disagrees with the Hub image link')
        return [row["images"]]
    url = public_url(row["images"], {"drive.google.com"})
    files = row.get("image_files", [])
    if re.fullmatch(r"/drive/(?:u/\d+/)?folders/[\w-]+/?", urlsplit(url).path):
        if not isinstance(files, list) or not files:
            raise ValueError(f'{row["id"]}: supply the ordered public images in the Drive folder')
    else:
        if files and files != [url]:
            raise ValueError(f'{row["id"]}: image list disagrees with the Schedule file link')
        files = [url]
    if len({drive_file(item) for item in files}) != len(files):
        raise ValueError(f'{row["id"]}: duplicate Drive image')
    return files


def check_schedule_changes(brand, rows, original):
    sections = list(DAYS.finditer(original))
    matched = matching_card_ids(sections, rows)
    frozen = "2026-11-24" if brand == "cozeware" else None
    if frozen:
        old_ids = {p[1] for day in sections if day[1] == frozen for p in POSTS.finditer(day[0])}
        if any(row.get("date") == frozen for row in rows) or old_ids.intersection(matched):
            raise ValueError("This daily feed is locked after visual approval")
    requests = []
    for row in rows:
        candidate = dict(row)
        if not removed(row) and row["status"] == "Ready to post":
            candidate["image_files"] = media_urls(row)
        for old_id, source in matched.items():
            if source is row and old_id != row["id"]:
                candidate["previous_id"] = old_id
        requests.append(candidate)
    gate = Path.home() / "AI/scripts/agent_bus/bus.py"
    if not gate.is_file():
        raise ValueError("Schedule changes require the Content Plan approval service")
    result = subprocess.run(
        [sys.executable, "-B", str(gate), "--root", str(gate.parent),
         "content", "check-hub", {"cozeware": "Cozeware", "oedro": "OEDRO"}[brand]],
        input=json.dumps(requests), text=True, capture_output=True, timeout=150,
    )
    if result.returncode:
        try:
            issues = "; ".join(json.loads(result.stdout)["errors"])
        except (ValueError, KeyError, TypeError):
            issues = ""
        raise ValueError(issues or "Could not verify Content Plan release approval")


def render(row, scratch, assets, repo=None):
    ident = row["id"]
    title = public_text(row["title"])
    status = row["status"]
    status_slug, status_zh, status_en = STATUSES[status]
    copy = captions(row["captions"])
    paths, sizes = [], []
    for number, url in enumerate(media_urls(row), 1):
        path = f'assets/feed/{row["product"]}-{ident.lower()}/{number}.webp'
        staged = repo / path if repo else None
        if (status in {"In review", "In review – do not post yet"} and url == SITE + path
                and staged and staged.is_file() and staged.resolve().is_relative_to(repo.resolve())):
            result = staged
        else:
            source = scratch / "source.image"
            result = scratch / "converted.webp"
            source.write_bytes(image_bytes(url))
            subprocess.run(["cwebp", "-quiet", "-q", "88", "-size", "580000", str(source), "-o", str(result)],
                           check=True, timeout=60, capture_output=True)
        info = subprocess.check_output(["sips", "-g", "pixelWidth", "-g", "pixelHeight", str(result)],
                                       text=True, timeout=20)
        sizes.append(tuple(int(re.search(key + r": (\d+)", info)[1])
                           for key in ("pixelWidth", "pixelHeight")))
        data = result.read_bytes()
        if not is_webp(data) or len(data) > 600_000:
            raise ValueError(f"{ident}: Hub image must be WebP under 600 KB")
        assets[path] = data
        paths.append(path)

    def img(index, alt, zoom=""):
        width, height = sizes[index]
        return (f'<img src="{paths[index]}" alt="{alt}" width="{width}" height="{height}" '
                f'loading="lazy"{zoom}>')

    gallery = []
    if len(paths) > 1:
        for index in range(len(paths)):
            current = str(index == 0).lower()
            gallery.append(f'<button type="button" data-feed-thumb="{index}" '
                           f'aria-label="{index + 1} / {len(paths)}" aria-current="{current}">'
                           f'{img(index, "", " data-no-zoom")}</button>')
        gallery = ['<div class="post-thumbs">' + "".join(gallery) + '</div>']

    buttons, blocks = [], []
    for index, name in enumerate(PLATFORMS):
        current = str(index == 0).lower()
        hidden = " hidden" if index else ""
        buttons.append(f'<button type="button" data-platform="{name}" aria-pressed="{current}">{name}</button>')
        blocks.append(f'<div class="post-caption" data-feed-platform="{name}"{hidden}>'
                      f'<p class="feed-caption" lang="en">{public_text(copy[name])}</p></div>')

    clock = public_text(row.get("time", ""))
    timing = f' · <span lang="en">{clock}</span>' if clock else ""
    links = [f'<a href="{escape(row["images"])}" lang="en">Images</a>']
    if row["captions"].startswith("https://"):
        links.append(f'<a href="{escape(row["captions"])}" lang="en">Captions</a>')
    if row.get("published"):
        links.append(f'<a href="{escape(public_url(row["published"]))}" lang="en">Published post</a>')
    schedule_link = []
    if row.get("url"):
        url = escape(public_url(row["url"]))
        schedule_link.append('<p class="feed-schedule-link"><span class="feed-schedule-link-label">链接</span>'
                             f'<a href="{url}" target="_blank" rel="noopener noreferrer">{url}'
                             '<span aria-hidden="true"> ↗</span></a></p>')
    return "\n".join([
        f'<article class="post" data-post="{ident}" data-purpose="{row["tags"]}" data-schedule-status="{status}">',
        '<div class="post-media">',
        f'<button class="feed-large" type="button" aria-label="查看大图" data-title="{title}" '
        f'data-pages="{"|".join(paths)}">{img(0, title)}</button>',
        *gallery, '</div>', '<div class="post-body">', f'<h3 lang="en">{title}</h3>',
        f'<p class="post-context"><span class="post-status" data-status="{status_slug}">{status_zh} '
        f'<span lang="en">{status_en}</span></span>{timing}</p>',
        f'<div class="post-platforms"><div class="post-platform-switch" role="group" aria-label="平台">'
        f'{"".join(buttons)}</div><button type="button" class="post-copy">复制配文</button></div>',
        *blocks, f'<p class="post-links">{" · ".join(links)}</p>', *schedule_link,
        '</div>', '</article>',
    ])


def matching_card_ids(sections, rows):
    cards = {}
    for section in sections:
        for post in POSTS.finditer(section[0]):
            if post[1] in cards:
                raise ValueError(f"{post[1]}: duplicate Hub card")
            heading = re.search(r"<h3\b[^>]*>(.*?)</h3>", post[0], re.S)
            title = unescape(re.sub(r"<[^>]+>", "", heading[1])) if heading else ""
            cards[post[1]] = (section[1], " ".join(title.split()).casefold())
    claimed = {}
    for row in rows:
        ident = row["id"]
        previous = row.get("previous_id")
        title = " ".join(row.get("title", "").split()).casefold()
        matches = {key for key, info in cards.items()
                   if key in (ident, previous) or (title and info == (row.get("date"), title)
                                                  and not re.match(r"^[\dA-Z]", key))}
        if len(matches) > 1 or any(key in claimed for key in matches):
            raise ValueError(f"{ident}: ambiguous Hub card match")
        if row.get("status_only") and not matches:
            raise ValueError(f"{ident}: supply the existing Hub card ID or its matching date and title")
        for key in matches:
            claimed[key] = row
    return claimed


def hold_card(card, row):
    ident, status = row["id"], row["status"]
    slug, label_zh, label_en = STATUSES[status]
    opening, end, body = card.partition(">")
    opening = re.sub(r' data-post="[^"]+"', f' data-post="{ident}"', opening)
    opening = re.sub(r' data-schedule-status="[^"]+"', "", opening)
    badge = (f'<p class="post-context"><span class="post-status" data-status="{slug}">'
             f'{label_zh} <span lang="en">{label_en}</span></span></p>')
    body, count = re.subn(r'<p class="post-context">.*?</p>', badge, body, count=1, flags=re.S)
    if not count:
        body, count = re.subn(r'(</h3>)', r'\1' + badge, body, count=1)
    if not count:
        raise ValueError(f"{ident}: existing Hub card has no status or heading")
    return opening + f' data-schedule-status="{status}"' + end + body


def render_feed(original, rows, scratch, assets, repo=None):
    sections = list(DAYS.finditer(original))
    if not sections:
        raise ValueError("Hub feed layout has changed")
    # A day section consists of its heading and cards. Keep unrelated sections intact.
    updates = matching_card_ids(sections, rows)
    replacements = {row["id"]: render(row, scratch, assets, repo) for row in rows
                    if not removed(row) and not row.get("status_only")}
    pending = defaultdict(list)
    for row in rows:
        if row["id"] in replacements:
            pending[row["date"]].append(row["id"])
    output = {}
    for section in sections:
        day = section[1]
        def replace(post):
            row = updates.get(post[1])
            if row is None:
                return post[0]
            if row.get("status_only"):
                if row["date"] != day:
                    raise ValueError(f'{row["id"]}: existing Hub card is on another date')
                return hold_card(post[0], row)
            if removed(row) or row["date"] != day:
                return ""
            pending[day].remove(row["id"])
            return replacements[row["id"]]
        body = POSTS.sub(replace, section[0])
        if pending[day]:
            body = body[:-len("</section>")] + "\n".join(replacements[ident] for ident in pending.pop(day)) + "\n</section>"
        if POSTS.search(body):
            output[day] = body
    for key, ids in pending.items():
        if not ids:
            continue
        day = date.fromisoformat(key)
        output[key] = (f'<section class="feed-day" data-date="{key}" id="day-{key}" aria-labelledby="title-{key}">\n'
                       f'<h2 id="title-{key}"><span class="day-date">{day.month}月{day.day}日</span>'
                       f'<span class="day-week">周{WEEK[day.weekday()]}</span></h2>\n'
                       + "\n".join(replacements[ident] for ident in ids) + "\n</section>")
    return original[:sections[0].start()] + "\n".join(output[key] for key in sorted(output)) + original[sections[-1].end():]


def verify(html, rows):
    current = {}
    sections = list(DAYS.finditer(html))
    aliases = matching_card_ids(sections, rows)
    for day in sections:
        for card in POSTS.finditer(day[0]):
            if card[1] in current:
                raise ValueError(f"{card[1]}: duplicate Hub card")
            current[card[1]] = (day[1], card[0])
    for row in rows:
        ident = row["id"]
        if removed(row):
            if any(match is row for match in aliases.values()):
                raise ValueError(f"{ident}: withdrawn card still present")
            continue
        if ident not in current:
            raise ValueError(f"{ident}: missing Hub card")
        day, card = current[ident]
        if day != row["date"] or f'data-schedule-status="{row["status"]}"' not in card:
            raise ValueError(f"{ident}: Hub date or status differs")
        if row.get("status_only"):
            continue
        if f'<h3 lang="en">{public_text(row["title"])}</h3>' not in card:
            raise ValueError(f"{ident}: Hub title differs")
        for field in ("images", "captions", "published", "url"):
            if row.get(field, "").startswith("https://") and f'href="{escape(row[field])}"' not in card:
                raise ValueError(f"{ident}: Hub {field} link differs")
        if bool(row.get("url")) != ('class="feed-schedule-link"' in card):
            raise ValueError(f"{ident}: Hub Schedule Link presence differs")
        if not all(f'data-feed-platform="{platform}"' in card for platform in PLATFORMS):
            raise ValueError(f"{ident}: missing platform caption")
    return current


def verify_live(feed, rows, repo):
    page = get(f"{SITE}{feed}?schedule_check={int(time())}").decode("utf-8")
    current = verify(page, rows)
    for row in rows:
        ident = row["id"]
        if removed(row):
            print(f"{ident}: absent from {SITE}{feed}")
            continue
        if row.get("status_only"):
            print(f'{SITE}{feed}#day-{row["date"]} · {ident} · {row["status"]}')
            continue
        _, card = current[ident]
        for platform, value in captions(row["captions"]).items():
            match = re.search(r'data-feed-platform="' + re.escape(platform) + r'"[^>]*><p[^>]*>(.*?)</p>', card, re.S)
            if not match or unescape(match[1]) != value:
                raise ValueError(f"{ident}: live {platform} caption differs")
        pages = re.search(r'data-pages="([^"]+)"', card)
        expected = [f'assets/feed/{row["product"]}-{ident.lower()}/{number}.webp'
                    for number in range(1, len(media_urls(row)) + 1)]
        if not pages or pages[1].split("|") != expected:
            raise ValueError(f"{ident}: live media list differs")
        for path in expected:
            data = get(f"{SITE}{path}?schedule_check={int(time())}", 600_000)
            if not is_webp(data) or (repo and data != (repo / path).read_bytes()):
                raise ValueError(f"{ident}: live image differs or is unavailable")
        print(f'{SITE}{feed}#day-{row["date"]} · {ident} · {row["status"]}')


def write_changed(path, data):
    if path.is_file() and path.read_bytes() == data:
        return
    path.parent.mkdir(parents=True, exist_ok=True)
    with NamedTemporaryFile(dir=path.parent, delete=False) as file:
        temp_path = Path(file.name)
        try:
            file.write(data)
            file.close()
            temp_path.chmod(0o644)
            temp_path.replace(path)
        finally:
            temp_path.unlink(missing_ok=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("brand", choices=PRODUCTS)
    parser.add_argument("--repo", type=Path, help="isolated Hub checkout")
    parser.add_argument("--scratch", type=Path, help="owned temporary directory")
    parser.add_argument("--verify-live", action="store_true")
    options = parser.parse_args()
    try:
        rows = json.load(sys.stdin)
        validate_rows(rows, options.brand)
        feed = f"feed-{options.brand}.html"
        if options.verify_live:
            verify_live(feed, rows, options.repo)
            return
        if not options.repo or not options.scratch or not options.scratch.is_dir():
            parser.error("provide --repo and an existing --scratch directory")
        path = options.repo / feed
        original = path.read_text(encoding="utf-8")
        check_schedule_changes(options.brand, rows, original)
        assets = {}
        with TemporaryDirectory(prefix="hub-schedule-", dir=options.scratch) as scratch:
            changed = render_feed(original, rows, Path(scratch), assets, options.repo)
        verify(changed, rows)
        if path.read_text(encoding="utf-8") != original:
            raise ValueError("Hub feed changed during rendering. Refresh the checkout and retry")
        for asset, data in assets.items():
            write_changed(options.repo / asset, data)
        write_changed(path, changed.encode("utf-8"))
        print(f"{feed}: verified {len(rows)} changed Schedule rows")
    except HTTPError as error:
        parser.exit(1, f"Schedule sync: public URL returned HTTP {error.code}\n")
    except URLError:
        parser.exit(1, "Schedule sync: could not reach the public asset or Hub site\n")
    except (KeyError, TypeError, ValueError, OSError, subprocess.SubprocessError) as error:
        detail = str(error) if isinstance(error, (KeyError, ValueError)) else type(error).__name__
        parser.exit(1, f"Schedule sync: {detail}\n")


if __name__ == "__main__":
    main()
