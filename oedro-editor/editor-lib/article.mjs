// Turns an editor draft into the exact records the site build reads.
// Pure functions only: the browser editor and the Node tests share this file.

export const CATEGORIES = [
  ['bed-covers', 'Bed Covers', '货箱盖'],
  ['running-boards', 'Running Boards', '侧踏板'],
  ['floor-mats', 'Floor Mats', '脚垫'],
  ['bumpers', 'Bumpers', '保险杠'],
  ['ownership', 'Ownership', '用车保养']
];
export const RESERVED_SLUGS = new Set(['index', 'blog', 'faq', '404', 'editor', 'admin']);
const RESERVED_IDS = new Set(['main', 'primary-navigation', 'sources-title']);
export const AUTHOR = { name: 'OEDRO Editorial', type: 'Organization' };
export const RIGHTS = {
  official: 'Official OEDRO product imagery, added through the OEDRO Guides editor.',
  own: 'Photographed or created by OEDRO for this guide.',
  licensed: 'Used with permission from the rights holder.'
};

export const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const slugify = v => String(v || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '')
  .replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 72).replace(/-+$/, '');
export const isSlug = v => /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(v || '');
export const today = () => new Date().toISOString().slice(0, 10);

/** Link targets the site accepts: https URLs, another guide (slug.html#anchor) or an anchor. */
export function linkProblem(href) {
  const v = String(href || '').trim();
  if (!v) return '链接地址是空的';
  if (/^#[a-z0-9-]+$/.test(v) || /^[a-z0-9-]+\.html(?:#[a-z0-9-]+)?$/.test(v)) return '';
  if (/[\s\\]/.test(v)) return '链接地址里不能有空格';
  try {
    const url = new URL(v);
    if (url.protocol !== 'https:') return '外部链接要以 https:// 开头';
    if (url.username || url.password) return '链接里不能带账号密码';
    return '';
  } catch { return '链接地址格式不对'; }
}

/* ---------- document → site HTML ---------- */

function inlineHtml(nodes = [], ctx) {
  let out = '';
  let i = 0;
  while (i < nodes.length) {
    const node = nodes[i];
    const link = node.marks?.find(m => m.type === 'link');
    if (link) {
      const href = String(link.attrs?.href || '').trim();
      let inner = '';
      while (i < nodes.length && nodes[i].marks?.find(m => m.type === 'link')?.attrs?.href === link.attrs?.href) inner += leaf(nodes[i++]);
      if (linkProblem(href)) { ctx.badLinks.push(href); out += inner; continue; }
      const ext = /^https:/i.test(href);
      ctx.links.push(href);
      out += `<a href="${esc(href)}"${ext ? ' target="_blank" rel="noopener noreferrer"' : ''}>${inner}</a>`;
      continue;
    }
    out += leaf(node);
    i++;
  }
  return out;
}
function leaf(node) {
  if (node.type === 'hardBreak') return '<br>';
  if (node.type !== 'text') return '';
  let s = esc(node.text);
  const marks = new Set((node.marks || []).map(m => m.type));
  if (marks.has('italic')) s = `<em>${s}</em>`;
  if (marks.has('bold')) s = `<strong>${s}</strong>`;
  return s;
}
const textOf = node => (node.content || []).map(n => n.type === 'text' ? n.text : n.type === 'hardBreak' ? ' ' : textOf(n)).join('');

function blockHtml(node, ctx) {
  switch (node.type) {
    case 'paragraph': {
      const inner = inlineHtml(node.content, ctx);
      return inner.replace(/<br>/g, '').trim() ? `<p>${inner}</p>` : '';
    }
    case 'heading': {
      const level = node.attrs?.level === 3 ? 3 : 2;
      const title = textOf(node).trim();
      if (!title) return '';
      const wanted = isSlug(node.attrs?.id) ? node.attrs.id : (slugify(title) || 'section');
      let id = wanted, n = 2;
      while (ctx.ids.has(id)) id = `${wanted}-${n++}`;
      ctx.ids.add(id);
      ctx.headings.push(level);
      if (level === 2) ctx.sections.push({ id, title });
      return `<h${level} id="${id}">${inlineHtml(node.content, ctx)}</h${level}>`;
    }
    case 'bulletList':
    case 'orderedList': {
      const tag = node.type === 'bulletList' ? 'ul' : 'ol';
      const items = (node.content || []).map(item => {
        const parts = [], nested = [];
        for (const child of item.content || []) {
          if (child.type === 'paragraph') { const inner = inlineHtml(child.content, ctx); if (inner) parts.push(inner); }
          else nested.push(blockHtml(child, ctx));
        }
        const html = parts.join('<br>') + nested.join('');
        return html ? `<li>${html}</li>` : '';
      }).join('');
      return items ? `<${tag}>${items}</${tag}>` : '';
    }
    case 'blockquote': {
      const inner = (node.content || []).map(child => blockHtml(child, ctx)).join('');
      return inner ? `<blockquote>${inner}</blockquote>` : '';
    }
    case 'figure': {
      const a = node.attrs || {};
      const src = ctx.imageSrc(a);
      if (!src) return '';
      const w = Math.round(Number(a.width)) || 1200, h = Math.round(Number(a.height)) || 800;
      const alt = String(a.alt || '').trim();
      ctx.images.push({ src, alt, imageId: a.imageId || '' });
      const caption = String(a.caption || '').trim();
      return `<figure><img src="${esc(src)}" alt="${esc(alt)}" width="${w}" height="${h}" loading="lazy">${caption ? `<figcaption>${esc(caption)}</figcaption>` : ''}</figure>`;
    }
    default:
      return (node.content || []).map(child => blockHtml(child, ctx)).join('');
  }
}

/**
 * Serialises the editor document into the HTML subset the site validator accepts.
 * imageSrc(attrs) returns the published path (or a preview URL) for a figure.
 */
export function docToHtml(doc, { imageSrc = a => a.src } = {}) {
  const ctx = { ids: new Set(RESERVED_IDS), sections: [], headings: [], images: [], links: [], badLinks: [], imageSrc };
  const html = (doc?.content || []).map(node => blockHtml(node, ctx)).filter(Boolean).join('\n');
  return { html, sections: ctx.sections, headings: ctx.headings, images: ctx.images, links: ctx.links, badLinks: ctx.badLinks };
}

export const plainText = html => String(html).replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ');
export const countWords = text => Math.round((String(text).match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g) || []).length + (String(text).match(/[一-鿿]/g) || []).length / 2);

/* ---------- drafts ---------- */

export function blankFields() {
  return {
    title: '', intro: '', category: 'bed-covers', slug: '', slugAuto: true, seoTitle: '', description: '',
    publishedAt: '', status: 'approved', approvalRef: '', pinTop: true,
    cover: null, rights: 'official', rightsNote: '',
    sources: [], productLinks: [], related: []
  };
}

/** Published file names for every uploaded image in a draft. */
export function assetPlan(draft, slug) {
  const plan = new Map();
  const base = slug || 'new-guide';
  if (draft.fields.cover?.kind === 'upload') plan.set('cover', `assets/${base}.jpg`);
  let n = 1;
  const walk = node => {
    if (node.type === 'figure' && node.attrs?.imageId && draft.images?.[node.attrs.imageId] && !plan.has(node.attrs.imageId)) plan.set(node.attrs.imageId, `assets/${base}-${n++}.jpg`);
    (node.content || []).forEach(walk);
  };
  walk(draft.doc || { content: [] });
  return plan;
}

/**
 * Builds the article record in the same shape and key order as content/articles.json.
 * original: the existing record when the draft edits a published guide.
 */
export function buildRecord(draft, { catalog = [], original = null, preview = false, previewSrc } = {}) {
  const f = draft.fields;
  const slug = (f.slugAuto && !original ? slugify(f.title) : f.slug) || '';
  const plan = assetPlan(draft, slug);
  const imageSrc = a => {
    if (a.imageId && draft.images?.[a.imageId]) return preview && previewSrc ? previewSrc(a.imageId) : plan.get(a.imageId);
    return a.src && /^assets\//.test(a.src) ? a.src : '';
  };
  const body = docToHtml(draft.doc, { imageSrc });
  const words = countWords(plainText(body.html)) + countWords(f.intro);
  const title = f.title.trim();
  const intro = f.intro.trim();
  const category = CATEGORIES.some(([id]) => id === f.category) ? f.category : 'ownership';
  const status = f.status === 'legacy-demo' && original?.status === 'legacy-demo' ? 'legacy-demo' : f.status === 'approved' ? 'approved' : 'draft';
  const approved = status === 'approved';
  const cover = f.cover ? {
    src: f.cover.kind === 'upload' ? plan.get('cover') : f.cover.src,
    alt: String(f.cover.alt || '').trim(),
    ...(String(f.cover.caption || '').trim() ? { caption: f.cover.caption.trim() } : {}),
    width: Math.round(f.cover.width) || 1200,
    height: Math.round(f.cover.height) || 900,
    ...(original?.cover?.presentation && f.cover.src === original.cover.src ? { presentation: original.cover.presentation } : {})
  } : null;
  const publishedAt = /^\d{4}-\d{2}-\d{2}$/.test(f.publishedAt) ? f.publishedAt : null;
  let modifiedAt = original ? (original.modifiedAt ?? null) : null;
  if (original && approved) modifiedAt = today();
  if (modifiedAt && publishedAt && modifiedAt < publishedAt) modifiedAt = publishedAt;
  const links = list => (list || []).map(l => ({ title: String(l.title || '').trim(), url: String(l.url || '').trim() })).filter(l => l.title || l.url);
  const maxOrder = catalog.reduce((m, a) => Math.max(m, Number(a.sortOrder) || 0), 0);
  const sortOrder = original ? (original.sortOrder ?? 0) : f.pinTop ? maxOrder + 10 : 0;
  const record = {
    slug,
    title,
    category,
    description: f.description.trim() || intro,
    intro,
    bodyHtml: body.html,
    related: (f.related || []).filter(s => s !== slug && catalog.some(a => a.slug === s)).slice(0, 3),
    factNotes: original?.factNotes || [],
    id: original?.id || slug,
    seoTitle: f.seoTitle.trim() || (title ? `${title} | OEDRO` : ''),
    categoryLabel: CATEGORIES.find(([id]) => id === category)[1],
    author: original?.author || { ...AUTHOR },
    publishedAt: original && !f.publishedAt ? (original.publishedAt ?? null) : publishedAt,
    modifiedAt,
    readingMinutes: Math.max(1, Math.ceil(words / 200)),
    cover,
    sections: body.sections,
    sources: links(f.sources),
    productLinks: links(f.productLinks),
    status,
    sortOrder,
    publication: {
      authorConfirmed: approved ? true : Boolean(original?.publication?.authorConfirmed),
      publishedAtConfirmed: approved ? Boolean(publishedAt) : Boolean(original?.publication?.publishedAtConfirmed),
      modifiedAtConfirmed: approved ? Boolean(original && modifiedAt) : Boolean(original?.publication?.modifiedAtConfirmed)
    }
  };
  if (approved) record.approval = { reference: f.approvalRef.trim() };
  for (const key of ['featureImage', 'featuredLinkLabel', 'navigationLabel']) if (original && original[key] !== undefined) record[key] = original[key];
  return { record, body, words, plan };
}

/* ---------- checks before publishing ---------- */

/** Plain-language problems that stop the publish package, in the order a writer meets them. */
export function publishProblems(draft, { record, body }, { catalog = [], originalId = null } = {}) {
  const f = draft.fields;
  const out = [];
  const add = (field, text) => out.push({ field, text });
  if (!record.title) add('title', '写一个标题');
  if (!record.intro) add('intro', '写一段导语，放在标题下方');
  if (!record.slug) add('slug', '填写文章网址');
  else if (!isSlug(record.slug)) add('slug', '网址只能用小写字母、数字和单个连字符');
  else if (RESERVED_SLUGS.has(record.slug)) add('slug', '这个网址是站点保留的，请换一个');
  else if (catalog.some(a => a.slug === record.slug && a.id !== originalId)) add('slug', '已有文章在用这个网址，请换一个');
  if (!record.bodyHtml) add('body', '正文还是空的');
  else if (!record.sections.length) add('body', '正文至少要有一个小标题，用来生成文章目录');
  if (body.badLinks.length) add('body', `正文里有 ${body.badLinks.length} 个链接地址不对：${body.badLinks.slice(0, 2).join('、')}`);
  const noAlt = body.images.filter(i => !i.alt).length;
  if (noAlt) add('body', `正文里有 ${noAlt} 张图片还没写图片说明`);
  if (record.status === 'draft') return out;
  if (!record.cover) add('cover', '添加一张封面图');
  else if (!record.cover.alt) add('coverAlt', '为封面写一句图片说明');
  if (!record.description) add('description', '填写 SEO 描述，或先写导语');
  else if (catalog.some(a => a.description === record.description && a.id !== record.id)) add('description', 'SEO 描述和另一篇文章重复了');
  if (catalog.some(a => a.seoTitle === record.seoTitle && a.id !== record.id)) add('seoTitle', 'SEO 标题和另一篇文章重复了');
  if (!record.sources.length) add('sources', '至少填一条参考来源');
  for (const [name, list] of [['sources', record.sources], ['productLinks', record.productLinks]]) {
    for (const l of list) {
      if (!l.title) add(name, `${name === 'sources' ? '参考来源' : '产品链接'}缺少名称`);
      const p = linkProblem(l.url);
      if (p || !/^https:/.test(l.url)) add(name, `${name === 'sources' ? '参考来源' : '产品链接'}「${l.title || l.url || '未命名'}」：${p || '要用 https:// 开头的完整网址'}`);
    }
  }
  for (const href of body.links) {
    const m = href.match(/^([a-z0-9-]+)\.html/);
    if (m && !['index', 'blog', 'faq'].includes(m[1]) && !catalog.some(a => a.slug === m[1] && a.status !== 'draft')) add('body', `正文链接到的「${m[1]}」不是已上线的指南`);
  }
  if (record.status === 'approved' && !f.approvalRef.trim()) add('approvalRef', '填写审核记录，例如审核日期和审核方式');
  if (f.cover?.kind === 'upload' || body.images.some(i => i.imageId)) {
    if (f.rights === 'licensed' && !f.rightsNote.trim()) add('rights', '写明图片的授权来源');
  }
  return out;
}

/* ---------- publish package ---------- */

export function mergeArticles(catalog, record) {
  const i = catalog.findIndex(a => a.id === record.id);
  const next = catalog.map(a => a);
  if (i >= 0) next[i] = record; else next.push(record);
  return next;
}

export function provenanceEntry({ slug, src, name, alt, caption, bytes, sha256, rights, rightsNote }) {
  return {
    slug,
    source: name || src.split('/').pop(),
    alt,
    ...(caption ? { caption } : {}),
    file: `public/${src}`,
    src,
    bytes,
    sha256,
    transform: 'Resized to at most 1600px and exported as JPEG by the OEDRO Guides editor',
    verifiedAt: today(),
    rightsBasis: rights === 'licensed' ? `${RIGHTS.licensed} ${String(rightsNote || '').trim()}`.trim() : RIGHTS[rights] || RIGHTS.official
  };
}

export function mergeProvenance(list, entries) {
  const next = list.filter(item => !entries.some(e => e.src === item.src));
  return next.concat(entries);
}

export const jsonFile = value => JSON.stringify(value, null, 2) + '\n';

/* ---------- Markdown import ---------- */

export function guessCategory(text) {
  const t = String(text).toLowerCase();
  if (/tonneau|bed cover|truck bed/.test(t)) return 'bed-covers';
  if (/running board|nerf|rock slider|side step/.test(t)) return 'running-boards';
  if (/floor mat|floor liner/.test(t)) return 'floor-mats';
  if (/bumper/.test(t)) return 'bumpers';
  return 'ownership';
}

/** Splits a Markdown file (optional front matter, # title, first paragraph) into fields and body Markdown. */
export function parseMarkdownFile(text) {
  const fields = blankFields();
  let rest = String(text).replace(/\r\n/g, '\n');
  const meta = {};
  const fm = rest.match(/^---\n([\s\S]*?)\n---\n?/);
  if (fm) {
    for (const line of fm[1].split('\n')) {
      const m = line.match(/^([A-Za-z_]+):\s*(.*)$/);
      if (m) { let v = m[2].trim(); if (/^".*"$/.test(v) || /^'.*'$/.test(v)) v = v.slice(1, -1); meta[m[1]] = v === 'null' ? '' : v; }
    }
    rest = rest.slice(fm[0].length);
  }
  const h1 = rest.match(/^\s*#\s+(.+)\n/);
  if (h1) { fields.title = h1[1].trim(); rest = rest.slice(rest.indexOf(h1[0]) + h1[0].length); }
  const intro = rest.match(/^\s*([^#\n][^\n]*(?:\n[^\n#][^\n]*)*)\n*/);
  if (intro && !/^\s*[-*>!]/.test(intro[1])) { fields.intro = intro[1].trim(); rest = rest.slice(intro[0].length); }
  if (meta.proposed_slug || meta.slug) { fields.slug = meta.proposed_slug || meta.slug; fields.slugAuto = false; }
  fields.seoTitle = meta.seo_title || '';
  fields.description = meta.meta_description || meta.description || '';
  fields.publishedAt = /^\d{4}-\d{2}-\d{2}$/.test(meta.published_at || '') ? meta.published_at : '';
  fields.category = CATEGORIES.some(([id]) => id === meta.category) ? meta.category : guessCategory(`${fields.title} ${fields.seoTitle}`);
  return { fields, markdown: rest.trim() + '\n' };
}
