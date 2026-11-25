#!/usr/bin/env node
// Writes the shared sidebar (data/content.json, rendered by navMarkup in app.js) into every
// Hub page, so each page has working navigation before JavaScript runs.
// Usage: node scripts/build-nav.js          rewrite pages
//        node scripts/build-nav.js --check  fail if any page is out of date
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.resolve(process.env.PUBLIC_SITE_ROOT || path.join(__dirname, '..'));
const read = (name) => fs.readFileSync(path.join(root, name), 'utf8');
// Bump these when a shared stylesheet or script changes so browsers fetch the new files.
const ASSET_VERSIONS = { 'app.js': 'hub28', 'hub-refresh.css': 'hub28', 'theme.css': 'hub27', 'base.css': 'hub27', 'image-viewer.css': 'hub27', 'image-viewer.js': 'hub27', 'post-feed.css': 'hub28', 'post-feed.js': 'hub27', 'ai-dev.css': 'hub28', 'ai-dev.js': 'hub28', 'daily-ops.css': 'hub28', 'fullweb.css': 'hub28', 'fullweb.js': 'hub28' };
// mascot.html carries its own snapshot markers; scripts/build-mascot-page.js rebuilds it.
const SKIP = new Set(['mascot.html']);

function loadRenderer() {
  const app = read('app.js');
  const source = ['escapeHtml', 'navMarkup'].map((name) => {
    const match = app.match(new RegExp(`function ${name}\\([^]*?\\n}`, 'm'));
    if (!match) throw new Error(`app.js is missing ${name}`);
    return match[0];
  }).join('\n');
  const context = {};
  vm.createContext(context);
  vm.runInContext(`${source}\nthis.navMarkup = navMarkup;`, context);
  return context.navMarkup;
}

function buildPage(html, nav, navMarkup) {
  const body = html.match(/<body\b[^>]*>/)?.[0] || '';
  const pageId = body.match(/data-page="([^"]*)"/)?.[1] || '';
  const parentId = body.match(/data-nav-parent="([^"]*)"/)?.[1] || '';
  let next = html.replace(/(<nav\b[^>]*id="nav-list"[^>]*>)[^]*?(<\/nav>)/, (_, open, close) => open + navMarkup(nav, pageId, parentId) + close);
  for (const [file, version] of Object.entries(ASSET_VERSIONS)) {
    next = next.replace(new RegExp(`(["'])${file.replace('.', '\\.')}(?:\\?v=[^"']*)?\\1`, 'g'), (_, quote) => `${quote}${file}?v=${version}${quote}`);
  }
  return next;
}

function build({ check = false } = {}) {
  const nav = JSON.parse(read('data/content.json')).nav;
  const navMarkup = loadRenderer();
  const stale = [];
  for (const name of fs.readdirSync(root).filter((file) => file.endsWith('.html')).sort()) {
    if (SKIP.has(name)) continue;
    const html = read(name);
    if (!/<nav\b[^>]*id="nav-list"/.test(html)) continue;
    const next = buildPage(html, nav, navMarkup);
    if (next === html) continue;
    stale.push(name);
    if (!check) fs.writeFileSync(path.join(root, name), next);
  }
  return stale;
}

if (require.main === module) {
  const check = process.argv.includes('--check');
  const stale = build({ check });
  if (check && stale.length) {
    console.error(`Sidebar is out of date in: ${stale.join(', ')}\nRun node scripts/build-nav.js`);
    process.exitCode = 1;
  } else {
    console.log(check ? 'Sidebar markup is synchronized on every page.' : `Sidebar written to ${stale.length} page(s).`);
  }
}

module.exports = { build, buildPage, loadRenderer, ASSET_VERSIONS };
