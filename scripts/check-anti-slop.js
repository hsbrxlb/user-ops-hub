#!/usr/bin/env node

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');

const repoRoot = path.resolve(__dirname, '..');
const root = process.env.PUBLIC_SITE_ROOT ? path.resolve(repoRoot, process.env.PUBLIC_SITE_ROOT) : repoRoot;
const errors = [];
const identityBackground = 'assets/hub-light.webp';
const identityBackgroundSha256 = 'f0a17d43f6ee15e600e5e6553c4c2fdde7906c130c6f39ce0b4df8de6b5f1ac3';
const runtimeExtensions = new Set(['.html', '.js', '.css', '.json']);
const highRiskCopy = [
  ['只…不…', /只[^。！？\n]{0,80}不/],
  // Chronological steps are valid operational copy and are reviewed in context.
  ['不是…而是…', /不是[^。！？\n]{0,80}而是/],
  ['不只…还/更…', /不只[^。！？\n]{0,80}(?:还|更)/],
  ['not just…but…', /\bnot\s+just\b.{0,100}\bbut\b/is],
  ['not…but…', /\bnot\b.{1,80}\bbut\b/is]
];

function walk(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

const files = [
  ...fs.readdirSync(root).filter((name) => ['.html', '.js', '.css'].includes(path.extname(name))).map((name) => path.join(root, name)),
  ...walk(path.join(root, 'data')),
  ...walk(path.join(root, 'preview')),
  ...walk(path.join(root, 'assets/email'))
].filter((file) => runtimeExtensions.has(path.extname(file)));

for (const file of files) {
  const relative = path.relative(root, file);
  const source = fs.readFileSync(file, 'utf8');
  if (path.extname(file) !== '.css') {
    const rejectedCopy = /示意图为\s*AI\s*生成|未使用真实用户照片|OEDRO订阅原有10%优惠|导入邮件系统用文件|Company mailing address|成员总数包含机器人|成员与在线状态为当时快照/;
    if (rejectedCopy.test(source)) errors.push(`${relative}: 被用户退回的过程说明或占位文案重新出现`);
    const officialProductSnapshot = /^data\/products\/category-\d+\.json$/.test(relative);
    if (!officialProductSnapshot) {
      for (const [label, pattern] of /^data\/(?:products\/category-\d+\.json|cozeware-products\/|product-library\/)/.test(relative) ? [] : highRiskCopy) {
        // These exact phrases carry product scope, permissions or atomic redemption rules.
        // Keep scanning the rest of each page for unrelated defensive copy.
        const factualConditions = [
          '只表达空气顾虑，不', '只展示实际档位、测距和底噪条件，不',
          '只表达顾虑和使用场景，不', '只写实用用车内容，每期完整、可照做，邮件里不',
          '只用于只读核对，不', '只读核对，不', '只表达空气方面的顾虑，不', '只写实用用车内容，每期完整、可照做，邮件中不', '只加载出说明，刷新后恢复正常；同一辆车选择到SuperCrew／无储物后未进入商品页，因此不', '只能消耗一次，兑券扣分后不', '只作表外历史实验，不'
        ];
        const checkedSource = factualConditions.reduce((text, phrase) => text.replaceAll(phrase, ''), source);
        const match = checkedSource.match(pattern);
        if (match) errors.push(`${relative}: 高风险模板句式 ${label}: ${match[0]}`);
      }
    }
    if (path.extname(file) === '.html') {
      const pending = source.replace(/<script[\s\S]*?<\/script>/gi, '').match(/待核|待确认|待验证|待查证|未核实|未经核实|仍需验证|有待(?:核|确认|验证)|to be confirmed|to be verified|pending verification/i);
      if (pending) errors.push(`${relative}: 给别人看的页面不写“待核、待确认、未核实”这类措辞，没把握的内容留空或不写: ${pending[0]}`);
    }
    const helperCount = ['<small', 'section-note', 'helper-text', 'class="muted"'].reduce((count, marker) => count + source.split(marker).length - 1, 0);
    if (helperCount >= 5) errors.push(`${relative}: 同页解释性小字标记达到 ${helperCount} 处`);
  } else {
    if (/text-shadow\s*:/i.test(source)) errors.push(`${relative}: 禁止文字阴影`);
    if (/backdrop-filter\s*:/i.test(source)) errors.push(`${relative}: 禁止装饰性模糊滤镜`);
    for (const match of source.matchAll(/font-size\s*:\s*([0-9.]+)px/gi)) {
      if (Number(match[1]) < 12) errors.push(`${relative}: 可见字号低于12px: ${match[0]}`);
    }
    if (relative !== 'theme.css' && /--identity-background|var\(--identity-background\)/.test(source)) errors.push(`${relative}: 固定背景变量不得在其他页面覆盖或复用`);
    for (const match of source.matchAll(/url\([^)]*(?:background\.(?:png|avif)|hub-(?:dark|light)\.webp)[^)]*\)/gi)) {
      const canonical = relative === 'theme.css' && match[0] === `url('${identityBackground}')`;
      if (!canonical) {
        errors.push(`${relative}: 只有 theme.css 的 Hub 选定浅色背景可以作为全页背景`);
      }
    }
    if (/@import\s+url\([^)]*fonts\./i.test(source)) errors.push(`${relative}: 字体不得通过CSS @import加载`);
  }
}

const assetRoot = path.join(root, 'assets');
for (const file of walk(assetRoot)) {
  const relative = path.relative(root, file);
  if (relative !== identityBackground && fs.statSync(file).size > 1024 * 1024) errors.push(`${relative}: 单个公开素材超过1MB`);
}

const identityBackgroundPath = path.join(root, identityBackground);
if (!fs.existsSync(identityBackgroundPath)) {
  errors.push(`${identityBackground}: Hub 选定浅色背景缺失`);
} else {
  const actualHash = crypto.createHash('sha256').update(fs.readFileSync(identityBackgroundPath)).digest('hex');
  if (actualHash !== identityBackgroundSha256) errors.push(`${identityBackground}: 选定浅色背景被替换`);
}

if (!process.env.PUBLIC_SITE_ROOT && !fs.existsSync(path.join(root, 'design.md'))) errors.push('缺少 design.md');
const navigation = JSON.parse(fs.readFileSync(path.join(root, 'data/content.json'), 'utf8'));
if (navigation.nav.some(item => item.id === 'overview') || navigation.overview) errors.push('禁止恢复重复总览');
const emailRenderer = fs.readFileSync(path.join(root, 'email-templates.js'), 'utf8');
if (/discord-member-offer|email-files|email-proposal/.test(emailRenderer)) errors.push('邮件页不得恢复未批准优惠预览或技术说明区');
const theme = fs.readFileSync(path.join(root, 'theme.css'), 'utf8');
const identityReferences = theme.match(/url\('assets\/hub-light\.webp'\)/g) || [];
const bodyBefore = theme.match(/body::before\s*\{([^}]*)\}/s)?.[1] || '';
if (identityReferences.length !== 1 || !theme.includes(`--identity-background: url('${identityBackground}')`) || !bodyBefore.includes('var(--identity-background)')) {
  errors.push(`theme.css: 选定浅色图 必须作为唯一背景变量默认值，由 body::before 引用`);
}
if (/display\s*:\s*none|visibility\s*:\s*hidden|opacity\s*:\s*0(?:\D|$)/i.test(bodyBefore)) {
  errors.push('theme.css: Hub 选定浅色背景不得隐藏');
}

function rgbaAlpha(token) {
  const match = theme.match(new RegExp(`${token}:\\s*rgba\\([^,]+,[^,]+,[^,]+,\\s*([0-9]*\\.?[0-9]+)\\s*\\)`));
  return match ? Number(match[1]) : null;
}

for (const token of ['--workspace-surface', '--content-surface']) {
  if (!theme.includes(token + ': transparent;')) errors.push(`theme.css: ${token} 必须透明，让原画贯穿正文`);
}
for (const token of ['--canvas-shade', '--sidebar-bg']) {
  const alpha = rgbaAlpha(token);
  if (alpha === null || alpha <= 0 || alpha >= 1) errors.push(`theme.css: ${token} 必须保留背景可见性`);
}
const shell = fs.readFileSync(path.join(root, 'base.css'), 'utf8');
if (!/\.workspace\s*\{[^}]*background\s*:\s*var\(--workspace-surface\)/s.test(shell)) {
  errors.push('base.css: 工作区必须引用透明背景 token');
}
if (!/\.main-content\s*\{[^}]*background\s*:\s*var\(--content-surface\)/s.test(shell)) {
  errors.push('base.css: 正文必须引用透明背景 token');
}
for (const token of ['--surface:', '--touch-size:', '--content-max:', '--content-wide:', '--content-gallery:', '--sidebar-width:', '--topbar-height:', '--type-h1:', '--space-8:', '--motion-slow:', '--radius-control:']) {
  if (!theme.includes(token)) errors.push(`theme.css 缺少设计token ${token}`);
}

if (errors.length) {
  console.error('Hub anti-slop 检查失败');
  errors.forEach((error) => console.error(`- ${error}`));
  process.exitCode = 1;
} else {
  console.log(`Hub anti-slop 检查通过（${files.length} 个运行时文件）`);
}
