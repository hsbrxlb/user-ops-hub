#!/usr/bin/env python3
"""Build the unlisted posting-team pages from the live feed pages (see team-pages.json).

Usage: build-team-pages.py <built-site-dir>
The output has no sidebar, breadcrumb or link to any other Hub page. Never edit it by hand.
"""
import json, re, sys
from pathlib import Path

root = Path(__file__).resolve().parent.parent
dest = Path(sys.argv[1])
cfg = json.loads((root / 'team-pages.json').read_text())


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
    # Keep the layout without the sidebar.
    html = html.replace('</head>', '<style>.team-page .app-shell{display:block!important}.team-page .workspace{margin:0!important;width:100%!important;max-width:none!important}.team-page .main-content{margin:0 auto!important}</style>\n</head>', 1)
    # Guards: no link may reach another Hub page, no internal wording.
    for href in re.findall(r'<a\b[^>]*\bhref="([^"]*)"', html):
        if href.startswith('#') or href.startswith('http'):
            if 'hsbrxlb' in href:
                sys.exit(f'build-team-pages: {page["path"]} still links to {href}')
            continue
        if re.search(r'\.html|index|topic', href):
            sys.exit(f'build-team-pages: {page["path"]} still links to {href}')
    for bad in ('Hub', 'KAM', '待核', '内部', '海外用户运营', 'sidebar'):
        if bad in html:
            sys.exit(f'build-team-pages: {page["path"]} contains "{bad}"')
    out = dest / page['path']
    out.mkdir(parents=True, exist_ok=True)
    (out / 'index.html').write_text(html)
