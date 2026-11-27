import { contentStatuses } from './editorial.mjs';
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const categories = new Set(['bed-covers','running-boards','floor-mats','bumpers','ownership']);
const articleKeys = new Set(['slug','title','category','description','intro','bodyHtml','related','factNotes','id','seoTitle','categoryLabel','author','publishedAt','modifiedAt','readingMinutes','cover','sections','sources','productLinks','status','sortOrder','publication','approval','featureImage','featuredLinkLabel','navigationLabel']);
const faqKeys = new Set(['id','category','question','answerHtml','related','sources','status','sortOrder','approval']);
const faqCategories = new Set(['Buying & fitment','Care & troubleshooting','Installation & safety','Measuring','Orders','Returns & warranty','Shipping']);
const tags = new Set(['p','h2','h3','a','ul','ol','li','strong','em','br','blockquote','figure','figcaption','img']);
const attributes = new Set(['id','href','target','rel','src','alt','width','height','loading']);
// Body images are local site assets inside a figure; size attributes keep the layout stable.
const imageAttributes = new Set(['src','alt','width','height','loading']);
function requireText(value, label) {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`Missing text: ${label}`);
}
function calendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return NaN;
  const time=Date.parse(value+'T00:00:00Z');
  return Number.isFinite(time) && new Date(time).toISOString().slice(0,10)===value ? time : NaN;
}
function httpsURL(value) {
  if (typeof value !== 'string' || /[\s\\]/.test(value)) throw new Error('Invalid source URL');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password) throw new Error('Only credential-free HTTPS source links are allowed');
}
function validateLinks(links, label, required = false) {
  if (!Array.isArray(links) || (required && !links.length)) throw new Error(`Missing sources: ${label}`);
  for (const link of links) { requireText(link.title,label); httpsURL(link.url); }
}
function validateHTML(html, label) {
  requireText(html, label);
  if (/<!--|<!|<\?|\/Users\/|127\.0\.0\.1|file:\/\//i.test(html)) throw new Error(`Unsafe HTML: ${label}`);
  const htmlIds = new Set();
  for (const match of html.matchAll(/<([^<>]+)>/g)) {
    const token = match[1];
    const name = token.match(/^\/?([a-z][a-z0-9]*)\b/i)?.[1]?.toLowerCase();
    if (!tags.has(name)) throw new Error(`Unsupported HTML tag: ${label}`);
    const opening = !token.startsWith('/');
    if (!opening) { if (!/^\/[a-z][a-z0-9]*\s*$/i.test(token)) throw new Error(`Malformed closing tag: ${label}`); continue; }
    let rest = token.slice(name.length).trim().replace(/\/$/,'').trim();
    const seen = new Set();
    while (rest) {
      const attr = rest.match(/^([a-z][a-z0-9-]*)\s*=\s*(["'])(.*?)\2\s*/i);
      if (!attr || !attributes.has(attr[1].toLowerCase()) || seen.has(attr[1].toLowerCase())) throw new Error(`Unsupported HTML attribute: ${label}`);
      const key = attr[1].toLowerCase(), value = attr[3];
      seen.add(key);
      if (key === 'href') {
        const decoded = value.replace(/&amp;/g,'&');
        if (/[\x00-\x20\\]/.test(decoded) || /&(?:#|[a-z]+;)/i.test(decoded)) throw new Error(`Encoded or unsafe URL: ${label}`);
        if (!/^#[a-z0-9-]+$/.test(decoded) && !/^[a-z0-9-]+\.html(?:#[a-z0-9-]+)?$/.test(decoded)) httpsURL(decoded);
      }
      if (key === 'id') {
        if (!slugPattern.test(value) || htmlIds.has(value) || ['main','primary-navigation','sources-title'].includes(value)) throw new Error(`Invalid or duplicate HTML id: ${label}`);
        htmlIds.add(value);
      }
      if (key === 'target' && value !== '_blank') throw new Error(`Unsupported link target: ${label}`);
      if (key === 'rel' && !value.split(/\s+/).every(part=>['noopener','noreferrer'].includes(part))) throw new Error(`Unsupported link relation: ${label}`);
      if (imageAttributes.has(key) !== (name === 'img')) throw new Error(`Unsupported HTML attribute: ${label}`);
      if (key === 'src' && !/^assets\/[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|svg|webp)$/.test(value)) throw new Error(`Invalid body image path: ${label}`);
      if ((key === 'width' || key === 'height') && !/^[1-9][0-9]{0,4}$/.test(value)) throw new Error(`Invalid body image size: ${label}`);
      if (key === 'loading' && value !== 'lazy') throw new Error(`Unsupported image loading: ${label}`);
      rest = rest.slice(attr[0].length);
    }
    if (name === 'img' && !['src','alt','width','height'].every(key=>seen.has(key))) throw new Error(`Body image needs src, alt, width and height: ${label}`);
  }
  if (html.replace(/<[^<>]+>/g,'').includes('<')) throw new Error(`Malformed HTML: ${label}`);
}
export function bodyImages(html) {
  return [...String(html || '').matchAll(/<img\b[^>]*\bsrc="([^"]+)"/g)].map(match=>match[1]);
}
export function validateCollections(articles, faqs) {
  if (!Array.isArray(articles) || !articles.length || !Array.isArray(faqs)) throw new Error('Non-empty article and FAQ collections are required');
  const slugs = new Set(['index','blog','faq','404','editor','admin']);
  const ids = new Set();
  const articleIds = new Set();
  const seoTitles = new Set(), seoDescriptions = new Set();
  for (const article of articles) {
    for (const key of Object.keys(article)) if (!articleKeys.has(key)) throw new Error(`Unknown article field: ${key}`);
    if (!slugPattern.test(article.slug) || slugs.has(article.slug)) throw new Error(`Invalid, reserved or duplicate slug: ${article.slug}`);
    slugs.add(article.slug);
    if (!slugPattern.test(article.id) || articleIds.has(article.id)) throw new Error(`Invalid or duplicate article ID: ${article.id}`);
    articleIds.add(article.id); validateState(article,article.id);
    if (article.status === 'draft') {
      requireText(article.title,`${article.id}.title`);
      validateDraft(article,article.id);
      continue;
    }
    for (const field of ['title','description','intro','seoTitle','categoryLabel']) requireText(article[field],`${article.slug}.${field}`);
    if (seoTitles.has(article.seoTitle) || seoDescriptions.has(article.description)) throw new Error(`Duplicate article search title or description: ${article.id}`);
    seoTitles.add(article.seoTitle); seoDescriptions.add(article.description);
    if (!categories.has(article.category)) throw new Error(`Unknown article category: ${article.slug}`);
    if (!Number.isInteger(article.readingMinutes) || article.readingMinutes < 1) throw new Error(`Invalid reading time: ${article.slug}`);
    const start=article.publishedAt == null ? null : calendarDate(article.publishedAt), end=article.modifiedAt == null ? null : calendarDate(article.modifiedAt);
    if ((start !== null && !Number.isFinite(start)) || (end !== null && !Number.isFinite(end)) || (start !== null && end !== null && end < start)) throw new Error(`Invalid historical dates: ${article.slug}`);
    validateImage(article.cover, article.slug);
    if (article.featureImage) validateImage(article.featureImage, `${article.slug}.featureImage`);
    if (article.navigationLabel !== undefined) requireText(article.navigationLabel,`${article.slug}.navigationLabel`);
    if (article.featuredLinkLabel !== undefined) requireText(article.featuredLinkLabel,`${article.slug}.featuredLinkLabel`);
    const confirmation=article.publication;
    if (!confirmation || Object.keys(confirmation).some(k=>!['authorConfirmed','publishedAtConfirmed','modifiedAtConfirmed'].includes(k)) || ['authorConfirmed','publishedAtConfirmed','modifiedAtConfirmed'].some(k=>typeof confirmation[k]!=='boolean')) throw new Error(`Invalid publication confirmation: ${article.id}`);
    if (article.author != null) {
      requireText(article.author.name,`${article.id}.author.name`);
      if (!['Person','Organization'].includes(article.author.type)) throw new Error(`Invalid author type: ${article.id}`);
    }
    if ((confirmation.authorConfirmed && !article.author) || (confirmation.publishedAtConfirmed && start === null) || (confirmation.modifiedAtConfirmed && end === null)) throw new Error(`Missing confirmed publication value: ${article.id}`);
    validateHTML(article.bodyHtml,article.slug);
    validateLinks(article.sources,article.slug,true);
    validateLinks(article.productLinks || [],article.slug);
    const sectionIds = new Set();
    if (!Array.isArray(article.sections) || !article.sections.length) throw new Error(`Missing contents: ${article.slug}`);
    for (const section of article.sections) {
      if (!slugPattern.test(section.id) || sectionIds.has(section.id) || !article.bodyHtml.includes(`id="${section.id}"`)) throw new Error(`Missing or duplicate section: ${article.slug}`);
      sectionIds.add(section.id); requireText(section.title,article.slug);
    }
  }
  const actualSlugs = new Set(articles.map(article=>article.slug));
  for (const article of articles) if (article.status !== 'draft' || article.related !== undefined) validateRelated(article.related, actualSlugs, article.slug, article.id);
  for (const faq of faqs) {
    for (const key of Object.keys(faq)) if (!faqKeys.has(key)) throw new Error(`Unknown FAQ field: ${key}`);
    if (!slugPattern.test(faq.id) || ids.has(faq.id) || faq.id === 'main' || faq.id === 'primary-navigation') throw new Error(`Invalid or duplicate FAQ id: ${faq.id}`);
    ids.add(faq.id); validateState(faq,faq.id); requireText(faq.question,faq.id);
    if (faq.status === 'draft') {
      validateDraft(faq,faq.id);
      if (faq.related !== undefined) validateRelated(faq.related,actualSlugs,null,faq.id);
      continue;
    }
    if (!faqCategories.has(faq.category)) throw new Error(`Unknown FAQ category: ${faq.id}`);
    validateHTML(faq.answerHtml,faq.id); validateLinks(faq.sources,faq.id,true);
    validateRelated(faq.related,actualSlugs,null,faq.id);
  }
}

function validateImage(image,label) {
  if (!/^assets\/[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|svg|webp)$/.test(image?.src)) throw new Error(`Invalid image path: ${label}`);
  requireText(image.alt,`${label}.alt`);
  if (![image.width,image.height].every(v=>Number.isInteger(v)&&v>0)) throw new Error(`Invalid image dimensions: ${label}`);
}
function validateState(record,label) {
  if (!contentStatuses.has(record.status)) throw new Error(`Invalid content status: ${label}`);
  if (record.sortOrder !== undefined && !Number.isSafeInteger(record.sortOrder)) throw new Error(`Invalid sortOrder: ${label}`);
  if (record.status === 'approved') requireText(record.approval?.reference,`${label}.approval.reference`);
}
function validateRelated(related,slugs,self,label) {
  if (!Array.isArray(related) || new Set(related).size!==related.length) throw new Error(`Invalid or duplicate related targets: ${label}`);
  for (const slug of related) if (!slugs.has(slug) || slug===self) throw new Error(`Missing or self-related article: ${label} -> ${slug}`);
}
export function validateEditorial(config,articles) {
  const keys=new Set(['featuredArticleId','secondaryArticleId','relatedLimit','footerArticleIds','vehicleLinks']);
  if (!config || Object.keys(config).some(k=>!keys.has(k))) throw new Error('Unknown editorial configuration');
  if (!Number.isInteger(config.relatedLimit) || config.relatedLimit<0 || config.relatedLimit>6) throw new Error('relatedLimit must be between 0 and 6');
  const ids=new Set(articles.map(a=>a.id));
  for (const key of ['featuredArticleId','secondaryArticleId']) if (config[key] != null && !ids.has(config[key])) throw new Error(`Missing ${key} target`);
  if (!Array.isArray(config.footerArticleIds) || new Set(config.footerArticleIds).size!==config.footerArticleIds.length || config.footerArticleIds.some(id=>!ids.has(id))) throw new Error('Invalid footer article targets');
  if (!Array.isArray(config.vehicleLinks) || new Set(config.vehicleLinks.map(v=>v.articleId)).size!==config.vehicleLinks.length) throw new Error('Invalid or duplicate vehicle targets');
  for (const item of config.vehicleLinks) {
    if (!ids.has(item.articleId) || Object.keys(item).some(k=>!['articleId','label','image'].includes(k)) || !/^assets\/[a-zA-Z0-9_-]+\.(?:png|webp)$/.test(item.image)) throw new Error('Invalid vehicle guide');
    requireText(item.label,'vehicle label');
  }
}

function validateDraft(record,label) {
  if (record.bodyHtml) validateHTML(record.bodyHtml,label);
  if (record.answerHtml) validateHTML(record.answerHtml,label);
  if (record.sources !== undefined) validateLinks(record.sources,label);
  if (record.productLinks !== undefined) validateLinks(record.productLinks,label);
  if (record.cover?.src && !/^assets\/[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|svg|webp)$/.test(record.cover.src)) throw new Error(`Invalid draft cover path: ${label}`);
  for (const field of ['publishedAt','modifiedAt']) if (record[field]!=null && !Number.isFinite(calendarDate(record[field]))) throw new Error(`Invalid draft date: ${label}.${field}`);
}
