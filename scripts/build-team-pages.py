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
    html = re.sub(r'<span class="day-date">(\d+)月(\d+)日</span><span class="day-week">(.)</span>',
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

    # Keep the layout without the sidebar.
    html = html.replace('</head>', '<style>.team-page .app-shell{display:block!important}.team-page .workspace{margin:0!important;width:100%!important;max-width:none!important}.team-page .main-content{margin:0 auto!important}</style>\n</head>', 1)

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
