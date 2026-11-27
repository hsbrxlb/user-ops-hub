// One selection pipeline supplies pages, recommendations and the sitemap.
export const contentStatuses = new Set(['legacy-demo', 'draft', 'approved']);
export const buildModes = new Set(['preview', 'test', 'release']);
const compareDates = (a, b) => {
  const ad = a.publication?.publishedAtConfirmed ? a.publishedAt ?? '' : '';
  const bd = b.publication?.publishedAtConfirmed ? b.publishedAt ?? '' : '';
  return ad < bd ? 1 : ad > bd ? -1 : 0;
};
const compareId = (a, b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
export function sortContent(records) {
  return [...records].sort((a, b) => (b.sortOrder ?? 0) - (a.sortOrder ?? 0)
    || compareDates(a, b)
    || compareId(a, b));
}
export function visibleIn(record, mode) {
  return record.status === 'approved' || (mode !== 'release' && record.status === 'legacy-demo');
}
export function publicationMetadata(article) {
  if (article.status !== 'approved') return {};
  return {
    ...(article.publication?.authorConfirmed && article.author ? {author: {'@type':article.author.type, name:article.author.name}} : {}),
    ...(article.publication?.publishedAtConfirmed && article.publishedAt ? {datePublished: article.publishedAt} : {}),
    ...(article.publication?.modifiedAtConfirmed && article.modifiedAt ? {dateModified: article.modifiedAt} : {}),
  };
}
export function selectEditorial(articles, faqs, config, mode = 'preview') {
  if (!buildModes.has(mode)) throw new Error('BUILD_MODE must be preview, test or release');
  const selected = sortContent(articles.filter(a => visibleIn(a, mode)));
  const questions = sortContent(faqs.filter(f => visibleIn(f, mode)));
  if (!selected.length) throw new Error(`No displayable articles in ${mode} mode; company approval is required for release`);
  const byId = new Map(selected.map(a => [a.id, a]));
  const bySlug = new Map(selected.map(a => [a.slug, a]));
  const allById = new Map(articles.map(a => [a.id, a]));
  function configuredArticle(id, label) {
    if (!id) return null;
    if (!allById.has(id)) throw new Error(`Missing ${label} target: ${id}`);
    if (!byId.has(id)) throw new Error(`Non-displayable ${label} target: ${id}`);
    return byId.get(id);
  }
  const lead = configuredArticle(config.featuredArticleId, 'featured') || selected[0];
  const secondary = configuredArticle(config.secondaryArticleId, 'secondary recommendation') || selected.find(a => a.id !== lead.id);
  if (secondary?.id === lead.id) throw new Error('Featured and secondary recommendations must be different');
  for (const record of [...selected, ...questions]) {
    for (const slug of record.related || []) if (!bySlug.has(slug)) throw new Error(`Non-displayable related target: ${record.id} -> ${slug}`);
    const html = record.bodyHtml || record.answerHtml || '';
    for (const match of html.matchAll(/href=["']([a-z0-9-]+)\.html(?:#[a-z0-9-]+)?["']/g)) {
      if (!['index','blog','faq','404'].includes(match[1]) && !bySlug.has(match[1])) throw new Error(`Non-displayable body link: ${record.id} -> ${match[1]}`);
    }
  }
  const relatedFor = article => (article.related?.length
    ? article.related.map(slug => bySlug.get(slug))
    : selected.filter(a => a.id !== article.id && a.category === article.category)).slice(0, config.relatedLimit);
  const vehicles = (config.vehicleLinks || []).map(item => ({...item, article:configuredArticle(item.articleId, 'vehicle guide')}));
  const footerArticles = (config.footerArticleIds || []).map(id => configuredArticle(id, 'footer guide'));
  return {articles:selected, faqs:questions, lead, secondary, relatedFor, vehicles, footerArticles};
}
