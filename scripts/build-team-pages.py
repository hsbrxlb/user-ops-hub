#!/usr/bin/env python3
"""Build the unlisted, English-only posting-team pages from the live feed pages (see team-pages.json).

Usage: build-team-pages.py <built-site-dir>
The output has no sidebar, breadcrumb, Chinese text or link to any other Hub page. Never edit it by hand.
"""
import json, re, sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
dest = Path(sys.argv[1])
cfg = json.loads((root / 'team-pages.json').read_text())

CJK = re.compile('[　-〿一-鿿＀-￯]')
MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
WEEKS = {'日': 'Sun', '一': 'Mon', '二': 'Tue', '三': 'Wed', '四': 'Thu', '五': 'Fri', '六': 'Sat'}
HTML_WORDS = {
    '复制配文': 'Copy caption', 'Instagram 原帖': 'Original Instagram post', '跳到正文': 'Skip to content',
    '按日期跳转': 'Jump to date', 'Instagram 竖图': 'Instagram portrait image', 'Facebook 和 X 方图': 'Facebook and X square image', '按用途筛选': 'Filter by purpose', '查看大图': 'View larger', '平台': 'Platform', '用途': 'Purpose',
}
JS_WORDS = {
    "'周日', '周一', '周二', '周三', '周四', '周五', '周六'": "'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'",
    "setAttribute('aria-label', '用途')": "setAttribute('aria-label', 'Purpose')",
    "pages + ' 张'": "pages + ' images'",
    '`<span class="schedule-month" aria-hidden="true">${m}月</span>`': '`<span class="schedule-month" aria-hidden="true">${MONTHS[m - 1]}</span>`',
    'aria-label="${m}月${date}日 ${week}"': 'aria-label="${MONTHS[m - 1]} ${date} ${week}"',
    '<span class="day-month">${m}月</span>': '<span class="day-month">${MONTHS[m - 1]}</span>',
    '全部<span lang="en">All</span>': '<span lang="en">All</span>',
    "scheduled + ' 条排期'": "scheduled + (scheduled === 1 ? ' post' : ' posts')",
    "scheduled + ' 条'": "scheduled",
    '`${PURPOSES[active][0]} ${PURPOSES[active][1]}：${shown} 条帖子`': "`${PURPOSES[active][1]}: ${shown} ${shown === 1 ? 'post' : 'posts'}`",
    '`共 ${shown} 条帖子，${days.length} 天`': '`${shown} posts across ${days.length} days`',
    "'已复制'": "'Copied'", "'已选中，按复制键'": "'Selected, press Copy'", "'复制配文'": "'Copy caption'",
}
BRANDS = {'oedro': ('oedro-logo-official.png', 320, 96), 'cozeware': ('cozeware-logo-official.webp', 640, 92)}
BRAND_BG = {'oedro': '#eef1f5', 'cozeware': '#f3f2ef'}
# Team-only styles, layered over post-feed.css. One reading column, brand colours, thumb-sized controls.
TEAM_CSS = '''
.team-page{--t-bg:#eef1f5;--t-card:#fff;--t-ink:#121821;--t-muted:#4f5a68;--t-line:#d9dfe7;--t-accent:#0d4d95;--t-accent-hover:#0a3d77;--t-on:#fff;--t-soft:#e3eaf4;
  --topbar-height:0px;background:var(--t-bg);color:var(--t-ink)}
.team-cozeware{--t-bg:#f3f2ef;--t-ink:#141a1e;--t-muted:#565d62;--t-line:#e0ded8;--t-accent:#1c2a31;--t-accent-hover:#33444d;--t-soft:#e8e6e0}
html:has(.team-oedro){background:#eef1f5}
html:has(.team-cozeware){background:#f3f2ef}
.team-page::before,.team-page::after{display:none!important}
.team-page .app-shell{display:block!important;background:none}
.team-page .workspace{margin:0!important;width:100%!important;max-width:none!important}
.team-page #content.main-content{width:min(1040px,100%);margin:0 auto!important;padding:0 32px 96px}
.team-page ::selection{background:var(--t-soft);color:var(--t-ink)}
.team-page :focus-visible{outline:2px solid var(--t-accent);outline-offset:2px}

.team-head{display:flex;align-items:center;gap:20px;padding:40px 0 28px}
.team-head .brand-logo{display:block;height:44px;width:auto;box-shadow:none;border-radius:0}
.team-cozeware .team-head .brand-logo{height:24px}
.team-page #content .team-head h1{margin:0;padding:0 0 0 20px;border-left:1px solid var(--t-line);color:var(--t-ink);font-family:var(--font-body);font-size:22px;font-weight:600;letter-spacing:-.01em;line-height:1.3}

.team-page #content .schedule-filter{display:flex;flex-wrap:wrap;gap:8px;margin:0;padding:0}
.team-page .schedule-filter button{min-height:44px;padding:0 8px 0 16px;background:var(--t-card);box-shadow:inset 0 0 0 1px var(--t-line);color:var(--t-ink);font-size:15px}
.team-page .schedule-filter button:hover{box-shadow:inset 0 0 0 1px var(--t-muted);background:var(--t-card)}
.team-page .schedule-filter button[aria-pressed="true"]{background:var(--t-accent);box-shadow:none;color:var(--t-on)}
.team-page .schedule-filter [lang="en"]{color:inherit;font-size:15px;font-weight:500}
.team-page .filter-count{background:var(--t-bg);color:var(--t-muted);font-size:14px}
.team-page .schedule-filter button[aria-pressed="true"] .filter-count{background:rgba(255,255,255,.18);color:var(--t-on)}
.team-page #content .schedule-status{margin:16px 0 0;color:var(--t-muted);font-size:15px}

.team-page .schedule-bar{position:sticky;top:0;z-index:20;display:block;margin:12px -32px 0;padding:10px 32px;background:var(--t-bg);border-bottom:1px solid var(--t-line)}
.team-page .schedule-dates{gap:6px;padding:0 24px 0 0;margin:0;-webkit-mask-image:linear-gradient(90deg,#000 calc(100% - 32px),transparent);mask-image:linear-gradient(90deg,#000 calc(100% - 32px),transparent)}
.team-page .schedule-month{color:var(--t-muted);writing-mode:horizontal-tb;padding:0 6px 0 0;font-size:15px;letter-spacing:0}
.team-page #content .schedule-dates a{width:52px;min-height:58px;padding:6px 2px;border-radius:12px;background:var(--t-card);box-shadow:inset 0 0 0 1px var(--t-line);color:var(--t-ink);gap:0}
.team-page #content .schedule-dates a:hover{transform:none;box-shadow:inset 0 0 0 1px var(--t-muted)}
.team-page .schedule-dates .date-week{color:var(--t-muted);font-size:13px}
.team-page .schedule-dates .date-num{font-size:24px}
.team-page .schedule-dates .date-count{display:none}
.team-page #content .schedule-dates a[aria-current]{background:var(--t-accent);color:var(--t-on);box-shadow:none}
.team-page #content .schedule-dates a[aria-current] .date-week{color:rgba(255,255,255,.8)}
.team-page #content .schedule-dates a,.team-page #content .schedule-dates a *{transition:none}
.team-page #content .schedule-dates a[data-today]::after{background:var(--t-accent)}
.team-page #content .schedule-dates a[aria-current][data-today]::after{background:#fff}

.team-page .feed-day{scroll-margin-top:96px}
.team-page #content .feed-day > h2{margin:48px 0 16px;gap:12px;align-items:center}
.team-page #content .feed-day:first-of-type > h2{margin-top:32px}
.team-page .day-numeral{font-size:52px;color:var(--t-ink)}
.team-page .day-stack .day-month{color:var(--t-ink);font-size:17px}
.team-page .day-stack .day-week{color:var(--t-muted);font-size:16px}
.team-page .feed-day[data-today] .day-numeral{color:var(--t-accent)}
.team-page .day-count{background:none;padding:0;color:var(--t-muted);font-size:15px;font-weight:500}

.team-page .post{grid-template-columns:minmax(0,min(380px,42%)) minmax(0,1fr);gap:24px 32px;padding:20px;border-radius:16px;background:var(--t-card);box-shadow:0 1px 2px rgba(18,24,33,.06),0 8px 24px -16px rgba(18,24,33,.18)}
.team-page .post + .post{margin-top:16px}
.team-page .post-media{top:96px}
.team-page #content .post .feed-large{border-radius:10px;box-shadow:none;background:var(--t-bg)}
.team-page #content .post .feed-large:hover img{transform:none}
.team-page .post-purpose{display:none}
.team-page #content .post-context{order:-1;display:flex;flex-wrap:wrap;align-items:center;gap:4px 8px;margin:0 0 12px;color:var(--t-muted);font-size:15px;line-height:1.5}
.team-page .post-status{margin:0;padding:5px 12px 5px 10px;font-size:15px}
.team-page #content .post-context > span:not(.post-status):not(.post-time){flex-basis:100%}
.team-page #content .post-context > span.post-placement,.team-page #content .post-context > span:not([class]):not([lang]){flex-basis:auto}
.team-page .post-time{color:var(--t-ink);font-weight:600;font-variant-numeric:tabular-nums}
.team-page #content .post h3{margin:0 0 18px;font-size:clamp(21px,2vw,25px);color:var(--t-ink)}
.team-page .post-body{display:flex;flex-direction:column}
.team-page .post-platforms{display:grid;grid-template-columns:minmax(0,1fr);gap:10px}
.team-page .post-platform-switch{display:flex;width:100%;background:var(--t-bg);box-shadow:none;padding:4px;border-radius:12px}
.team-page .post-platform-switch button{flex:1 1 0;min-width:0;min-height:44px;padding:0 6px;border-radius:9px;font-size:15px;color:var(--t-muted)}
.team-page .post-platform-switch button[aria-pressed="true"]{background:var(--t-card);color:var(--t-ink);box-shadow:0 1px 3px rgba(18,24,33,.12)}
.team-page .post-copy{width:100%;min-height:52px;padding:0 28px;border-radius:12px;background:var(--t-accent);color:var(--t-on);font-size:16px;font-weight:600}
.team-page .post-copy:hover{background:var(--t-accent-hover);transform:none}
.team-page .post-caption{margin-top:16px;padding-top:16px;border-top:1px solid var(--t-line)}
.team-page #content .post-caption .feed-caption{font-size:16.5px;line-height:1.65;max-width:62ch}
.team-page .post-thumbs img{width:52px;height:64px}
.team-page .post-links{margin-top:12px;font-size:15px}
.team-page .post-links a{display:inline-flex;align-items:center;min-height:44px;color:var(--t-accent);font-weight:600}

@media (max-width:760px){
  .team-page #content.main-content{padding:0 16px 72px}
  .team-head{gap:14px;padding:24px 0 20px}
  .team-head .brand-logo{height:34px}
  .team-cozeware .team-head .brand-logo{height:18px}
  .team-page #content .team-head h1{padding-left:14px;font-size:18px}
  .team-page #content .schedule-filter{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;margin:0 -16px;padding:0 16px;-webkit-mask-image:none;mask-image:none}
  .team-page .schedule-filter button{flex:none}
  .team-page .schedule-bar{margin:12px -16px 0;padding:8px 16px}
  .team-page .feed-day{scroll-margin-top:88px}
  .team-page #content .feed-day > h2{margin:36px 0 12px}
  .team-page .day-numeral{font-size:44px}
  .team-page .post{display:flex;flex-direction:column;gap:0;padding:12px 12px 16px;border-radius:14px}
  .team-page .post-body{display:flex;padding:14px 4px 0}
  .team-page .post-media{position:static}
  .team-page .post-thumbs{display:flex}
  .team-page #content .post h3{font-size:20px;margin-bottom:14px}
}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}}
'''
IV_WORDS = {'图片查看器': 'Image viewer', '关闭': 'Close', '上一张': 'Previous', '下一张': 'Next', '适应窗口': 'Fit to window',
            '查看原图': 'Actual size', '保存图片': 'Save image', '图片暂时无法显示': 'Image unavailable', '查看大图': 'View larger'}


def english_only_text(html):
    """Cut every text node at its first CJK character (the Chinese half of a bilingual label)."""
    def node(m):
        t = m.group(1)
        k = CJK.search(t)
        if k:
            return '>' + t[:k.start()].rstrip(' ·:') + '<'
        return m.group(0)
    return re.sub(r'>([^<>]+)<', node, html)


def patch_js(name, words, prefix=''):
    src = (root / name).read_text()
    src = re.sub(r'^\s*//.*$', '', src, flags=re.M)
    for old, new in words.items():
        if old not in src:
            sys.exit(f'build-team-pages: {name} no longer contains {old!r}; update the generator')
        src = src.replace(old, new)
    # Purpose names: keep only the English half.
    src = re.sub(r"\['[^'\x00-\x7f]+', ('[^']*')\]", r"['', \1]", src)
    left = [l for l in src.splitlines() if CJK.search(l)]
    if left:
        sys.exit(f'build-team-pages: Chinese left in {name}: {left[0][:120]}')
    return prefix + src


def strip_block(html, pattern, what):
    new, n = re.subn(pattern, '', html, count=1, flags=re.S)
    if n != 1:
        sys.exit(f'build-team-pages: could not find {what}')
    return new


for page in cfg['pages']:
    html = (root / page['source']).read_text()
    rel = '../' * len(Path(page['path']).parts)
    html = strip_block(html, r'<aside\b.*?</aside>\s*', 'sidebar')
    html = strip_block(html, r'<div class="mobile-overlay"[^>]*></div>\s*', 'mobile overlay')
    html = strip_block(html, r'<header class="topbar">.*?</header>\s*', 'topbar')
    html = strip_block(html, r'<script src="app\.js[^"]*"></script>\s*', 'app.js')
    html = re.sub(r'<!--.*?-->', '', html, flags=re.S)
    html = re.sub(r'<meta[^>]*name="robots"[^>]*>', '', html)
    html = re.sub(r'<meta[^>]*name="description"[^>]*>', '', html)
    html = html.replace('<head>', '<head>\n<meta name="robots" content="noindex,nofollow">', 1)
    html = re.sub(r'<title>.*?</title>', f'<title>{page["title"]}</title>', html, count=1, flags=re.S)
    html = html.replace('<body data-page="', '<body class="team-page" data-page="team-', 1)
    # The Hub's own absolute asset URLs become relative; every local path gets the depth prefix.
    html = html.replace('https://hsbrxlb.github.io/user-ops-hub/', rel)
    html = re.sub(r'(<link[^>]*href=")(?!https?:|data:|#|/)', lambda m: m.group(1) + rel, html)
    html = re.sub(r'(<script[^>]*src=")(?!https?:|data:|#|/)', lambda m: m.group(1) + rel, html)
    html = re.sub(r'(?<![\w/.-])assets/', rel + 'assets/', html)

    # English only: remove the Chinese, translate the interface.
    html = re.sub(r'<span class="schedule-zh">.*?</span>', '', html)
    html = re.sub(r'<span class="day-date">(\d+)月(\d+)日</span><span class="day-week">周?(.)</span>',
                  lambda m: f'<span class="day-date">{MONTHS[int(m.group(1)) - 1]} {int(m.group(2))}</span><span class="day-week">{WEEKS[m.group(3)]}</span>', html)
    for zh, en in HTML_WORDS.items():
        html = html.replace('>' + zh + '<', '>' + en + '<').replace('"' + zh + '"', '"' + en + '"')
    # Raw image-file links expose asset paths; the lightbox already opens every image.
    html = re.sub(r'<a href="' + re.escape(rel) + r'assets/[^"]*"[^>]*>[^<]*</a>(?: · )?', '', html)
    html = re.sub(r'<p class="post-links">(?:\s|·)*</p>\s*', '', html)
    html = english_only_text(html)
    html = re.sub(r'<p class="post-context">(?:\s|·)*</p>\s*', '', html)
    html = html.replace('</span></span><span lang="en">', '</span></span> · <span lang="en">')
    html = html.replace('<html lang="zh-CN">', '<html lang="en">')
    # Own copies of the scripts with English interface text.
    html = html.replace(f'src="{rel}post-feed.js?v=hub28"', 'src="post-feed.js"').replace(f'src="{rel}image-viewer.js?v=hub27"', 'src="image-viewer.js"')
    iv = (root / 'image-viewer.js').read_text()
    for zh, en in IV_WORDS.items():
        iv = iv.replace('"' + zh + '"', '"' + en + '"')
    iv = iv.replace("new URL('image-viewer.css?v=hub27', scriptURL)", f"new URL('{rel}image-viewer.css?v=hub27', scriptURL)")
    iv = re.sub(r'^\s*//.*$', '', iv, flags=re.M)
    if CJK.search(iv):
        sys.exit('build-team-pages: Chinese left in image-viewer.js')
    feed_js = patch_js('post-feed.js', JS_WORDS, f'const MONTHS = {MONTHS!r};\n')

    # Team layout: brand header, filter above a sticky date strip, readable status and time on each post.
    brand = 'oedro' if 'oedro' in page['source'] else 'cozeware'
    logo, lw, lh = BRANDS[brand]
    html = strip_block(html, r'<header class="page-heading schedule-heading">.*?</header>',
                       'page heading').replace(
        '<div class="schedule-bar">',
        f'<header class="team-head"><img class="brand-logo" data-no-zoom src="{rel}assets/brand/{logo}" alt="{brand.upper()}" width="{lw}" height="{lh}"><h1>Post Schedule</h1></header>\n<div class="schedule-bar">', 1)
    html, n = re.subn(r'<div class="schedule-bar">\s*(<nav class="schedule-dates"[^>]*></nav>)\s*(<div class="schedule-filter"[^>]*></div>)\s*</div>\s*(<p class="schedule-status"[^>]*></p>)',
                      r'\2\n\3\n<div class="schedule-bar">\1</div>', html, count=1)
    if n != 1:
        sys.exit('build-team-pages: could not find the schedule bar')

    def context(m):
        body = m.group(1).replace('</span><span lang="en">', '</span> · <span lang="en">')
        def when(t):
            y, mo, d, rest = t.groups()
            return f'<span class="post-time">{MONTHS[int(mo) - 1]} {int(d)}, {rest}</span>'
        body = re.sub(r'<span lang="en">(\d{4})-(\d\d)-(\d\d) ([^<]+)</span>', when, body)
        body = re.sub(r'<span lang="en">(\d\d?:\d\d [A-Z]{2,4})</span>', r'<span class="post-time">\1</span>', body)
        # Flex gaps separate the parts; bare text gets its own span.
        body = ''.join(t if t.startswith('<') else f'<span>{t}</span>' for t in body.split(' · ') if t.strip())
        return '<p class="post-context">' + body + '</p>'
    html = re.sub(r'<p class="post-context">(.*?)</p>', context, html)
    html = html.replace('loading="lazy">', 'loading="lazy" decoding="async">')
    html = re.sub(r'<meta content="[^"]*" name="theme-color"/?>', f'<meta content="{BRAND_BG[brand]}" name="theme-color">', html)
    html = html.replace('</head>', '<style>' + TEAM_CSS + '</style>\n</head>', 1)
    html = html.replace('<body class="team-page"', f'<body class="team-page team-{brand}"', 1)

    # Guards: no link to another Hub page, no Chinese, no internal wording.
    for href in re.findall(r'<a\b[^>]*\bhref="([^"]*)"', html):
        if href.startswith('#') or href.startswith('http'):
            if 'hsbrxlb' in href:
                sys.exit(f'build-team-pages: {page["path"]} still links to {href}')
            continue
        if re.search(r'\.html|index|topic|assets/', href):
            sys.exit(f'build-team-pages: {page["path"]} still links to {href}')
    m = CJK.search(html)
    if m:
        sys.exit(f'build-team-pages: Chinese left in {page["path"]}: ' + html[max(0, m.start() - 80):m.start() + 40])
    for bad in ('Hub', 'KAM', 'sidebar'):
        if bad in html:
            sys.exit(f'build-team-pages: {page["path"]} contains "{bad}"')

    out = dest / page['path']
    out.mkdir(parents=True, exist_ok=True)
    (out / 'index.html').write_text(html)
    (out / 'post-feed.js').write_text(feed_js)
    (out / 'image-viewer.js').write_text(iv)
