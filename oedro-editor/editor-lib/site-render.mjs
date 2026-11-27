// Page rendering shared by the build command and the browser editor, so both produce byte-identical files.
import { validateCollections, validateEditorial, bodyImages } from './validate.mjs';
import { selectEditorial, publicationMetadata } from './editorial.mjs';
import { shell, blogPage, faqPage, articlePage } from './templates.mjs';

export function renderSite({ articles: sourceArticles, faqs: sourceFaqs, config, launchDate, provenance, designAssets, mode, origin, base }) {
const allArticles = structuredClone(sourceArticles);
const allFaqs = structuredClone(sourceFaqs);
validateCollections(allArticles, allFaqs);
if (!/^\d{4}-\d{2}-\d{2}$/.test(launchDate) || Number.isNaN(Date.parse(launchDate + 'T00:00:00Z'))) throw new Error('launchDate must be YYYY-MM-DD');
for (const article of allArticles) article.displayDate = launchDate;
validateEditorial(config, allArticles);
const selected = selectEditorial(allArticles, allFaqs, config, mode);
const {articles, faqs, footerArticles} = selected;
for (const article of articles) if (!provenance.some(item => item.src === article.cover.src)) throw new Error(`Missing cover provenance: ${article.slug}`);
for (const article of articles) for (const src of bodyImages(article.bodyHtml)) if (!provenance.some(item => item.src === src)) throw new Error(`Missing body image provenance: ${article.slug} -> ${src}`);
if (!Array.isArray(designAssets.files) || designAssets.files.some(path => !/^assets\/[a-zA-Z0-9_-]+\.(?:svg|png|jpg|jpeg|webp|woff2|ttf|txt)$/.test(path))) throw new Error('Design asset manifest contains an unsafe public path.');
const publicAssets = new Set(['assets/logo.png', 'assets/bed-measurement.svg', 'assets/fitment-decision.svg', ...articles.flatMap(article => [article.cover.src, ...(article.featureImage ? [article.featureImage.src] : []), ...bodyImages(article.bodyHtml)]), ...selected.vehicles.map(v=>v.image), ...designAssets.files]);
for (const article of articles) {
  if (article.slug === 'how-to-measure-truck-bed-for-tonneau-cover') {
    article.bodyHtml = article.bodyHtml.replace('<h2 id="measure-the-bed">', '<span id="measure-between-the-two-inside-faces"></span><h2 id="measure-the-bed">');
    article.bodyHtml = article.bodyHtml.replace('<h2 id="understand-size-labels">', '<figure class="article-diagram"><img src="assets/bed-measurement.svg" alt="Top view of a truck bed with a straight measurement arrow from A at the front wall to B at the closed tailgate" width="360" height="360" loading="lazy"><figcaption>A: Inside front wall (bulkhead). B: Inside of closed tailgate. Top view, not to scale. Follow the selected cover instructions for mounting measurements.</figcaption></figure><h2 id="understand-size-labels">');
  }
  if (article.slug === 'ford-f150-accessory-fitment-guide') {
    let headings = 0;
    article.bodyHtml = article.bodyHtml.replace(/<h2 /g, match => ++headings === 2 ? '<figure class="article-diagram"><img src="assets/fitment-decision.svg" alt="Check vehicle, configuration, exact product, instructions and exclusions" width="360" height="340" loading="lazy"><figcaption>Resolve any mismatch before ordering. The sections below explain the cab, bed, seating and storage details for each accessory.</figcaption></figure>' + match : match);
  }
}
const absolute = path => new URL(base + path, origin).href;
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const jsonLD = value => JSON.stringify(value).replace(/</g,'\\u003c');
function head(page, path, article) {
  const image = absolute(article?.cover.src || selected.lead.cover.src);
  const graph = [{ '@context':'https://schema.org', '@type':'BreadcrumbList', itemListElement:[
    { '@type':'ListItem', position:1, name:'OEDRO', item:'https://www.oedro.com/' },
    { '@type':'ListItem', position:2, name:article ? 'Blog' : path === 'faq.html' ? 'FAQ' : 'Blog', item:absolute(article ? 'blog.html' : path) },
    ...(article ? [{ '@type':'ListItem', position:3, name:article.title, item:absolute(path) }] : [])
  ] }];
  if (article) graph.push({'@context':'https://schema.org','@type':'BlogPosting',headline:article.title,description:article.description,url:absolute(path),mainEntityOfPage:absolute(path),image,...publicationMetadata(article)});
  return `<link rel="canonical" href="${escape(absolute(path))}"><meta property="og:type" content="${article ? 'article' : 'website'}"><meta property="og:site_name" content="OEDRO"><meta property="og:title" content="${escape(page.title)}"><meta property="og:description" content="${escape(page.description)}"><meta property="og:url" content="${escape(absolute(path))}"><meta property="og:image" content="${escape(image)}"><meta property="og:image:alt" content="${escape(article?.cover.alt || selected.lead.cover.alt)}"><meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="${escape(page.title)}"><meta name="twitter:description" content="${escape(page.description)}"><meta name="twitter:image" content="${escape(image)}"><meta name="twitter:image:alt" content="${escape(article?.cover.alt || selected.lead.cover.alt)}"><script type="application/ld+json">${jsonLD(graph)}</script>`;
}
// All local attributes use the same mount prefix; external URLs and fragments remain intact.
function mountedHTML(html) {
  return html.replace(/\b(href|src)=("[^"]*"|'[^']*')/g, (whole,key,quoted) => {
    const ref=quoted.slice(1,-1);
    if (!ref || ref.startsWith('#') || ref.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(ref)) return whole;
    return `${key}=${quoted[0]}${base}${ref.replace(/^\.\//,'')}${quoted[0]}`;
  });
}
const pages = [['blog.html', blogPage(selected), 'blog'], ['faq.html', faqPage(selected), 'faq'], ...articles.map(article => [`${article.slug}.html`, articlePage({article,articles,relatedArticles:selected.relatedFor(article),editorialPreview:article.status!=='approved'}), 'blog', article])];
const rendered=pages.map(([path,page,active,article]) => [path,mountedHTML(shell({...page, active, assetPrefix:base, footerArticles, head:head(page,path,article),editionLabel:'OEDRO editorial'}))]);
rendered.push(['404.html',mountedHTML(shell({title:'Page not found | OEDRO',description:'Search the OEDRO Blog or FAQ.',assetPrefix:base,footerArticles,editionLabel:'OEDRO editorial',body:`<section class="container page-heading"><h1>Page not found</h1><p>Find a guide in the Blog, or search the FAQ.</p><a class="button" href="${escape(base)}blog.html">Browse guides →</a></section>`}))]);
const files = new Map(rendered);
files.set('index.html', files.get('blog.html'));
files.set('sitemap.xml', `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${pages.map(([path,,,article])=>`<url><loc>${escape(absolute(path))}</loc>${article && publicationMetadata(article).dateModified ? `<lastmod>${publicationMetadata(article).dateModified}</lastmod>` : ''}</url>`).join('')}</urlset>`);
return { files, publicAssets, routes: ['index.html', ...pages.map(([path]) => path), '404.html'], articleCount: articles.length, faqCount: faqs.length };
}
