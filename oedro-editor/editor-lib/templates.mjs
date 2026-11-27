import { publicationMetadata } from './editorial.mjs';
const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));
const icon = (name, className = '') => `<img class="design-icon ${className}" src="assets/figma-${name}.svg" alt="" aria-hidden="true">`;
const arrow = icon('arrow-blue');
const categories = [ ['bed-covers', 'Bed covers'], ['running-boards', 'Running boards'], ['floor-mats', 'Floor mats'], ['bumpers', 'Bumpers'], ['ownership', 'Ownership'] ];
const href = article => `${esc(article.slug)}.html`;
const date = value => new Intl.DateTimeFormat('en-US', { month:'long', day:'numeric', year:'numeric', timeZone:'UTC' }).format(new Date(value));
const topic = article => article.categoryLabel || categories.find(([id]) => id === article.category)?.[1] || article.category;
const external = (url, title, className = '') => `<a class="${className}" href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(title)} ${arrow}<span class="sr-only"> (opens in a new tab)</span></a>`;
const meta = article => `<div class="story-meta"><span>${esc(topic(article))}</span><span>${esc(article.readingMinutes)} min read</span></div>`;
const coverClass = article => article.cover.presentation === 'contain' ? ' media--contain' : '';
const storeIcon = (name, assetPrefix) => `<img src="${esc(assetPrefix)}assets/figma-store-${name}.svg" alt="" aria-hidden="true">`;

function previewHeader(active, assetPrefix) {
  const current = name => active === name ? ' aria-current="page"' : '';
  return `<header class="site-header"><div class="header-inner">
      <button class="menu-toggle" type="button" aria-label="Open navigation" aria-expanded="false" aria-controls="primary-navigation">${storeIcon('menu', assetPrefix)}</button>
      <a class="brand" href="${esc(assetPrefix)}index.html" aria-label="OEDRO home">${storeIcon('logo', assetPrefix)}</a>
      <div class="store-search" aria-disabled="true"><span>Search by make, model, year or part number</span>${storeIcon('search', assetPrefix)}</div>
      <button class="store-vehicle" disabled>${storeIcon('vehicle', assetPrefix)}<span>Select your vehicle</span></button>
      <div class="store-actions"><button disabled aria-label="Account">${storeIcon('user', assetPrefix)}</button><button disabled aria-label="Cart">${storeIcon('cart', assetPrefix)}</button></div>
    </div><nav id="primary-navigation" class="primary-navigation" aria-label="Main navigation"><span class="store-category">Recovery Running Boards</span><span class="store-category">Exterior</span><span class="store-category">Interior</span><span class="store-category">Lighting</span><span class="store-category">Fork Mounted</span><a href="${esc(assetPrefix)}blog.html"${current('blog')}>Blog</a><a href="${esc(assetPrefix)}faq.html"${current('faq')}>FAQ</a><a class="mobile-store-link" href="https://www.oedro.com/" target="_blank" rel="noopener noreferrer">Visit the official store<span class="sr-only"> (opens in a new tab)</span></a></nav></header>`;
}

function story(article, { compact = false, filter = false } = {}) {
  return `<article class="story${compact ? ' story--compact' : ''}"${filter ? ` data-filter-item data-category="${esc(article.category)}" data-search="${esc([article.title, article.description, topic(article), (article.bodyHtml || '').replace(/<[^>]*>/g, ' ')].join(' ').replace(/\s+/g, ' ').trim().toLowerCase())}"` : ''}>
    <a class="story-image${coverClass(article)}" href="${href(article)}" tabindex="-1" aria-hidden="true"><img src="${esc(article.cover.src)}" alt="" loading="lazy" width="720" height="480"></a>
    <div class="story-copy">${meta(article)}<h3><a href="${href(article)}">${esc(article.title)}</a></h3>${compact ? '' : `<p>${esc(article.description)}</p>`}<a class="text-link" href="${href(article)}" aria-label="Read guide: ${esc(article.title)}">Read guide ${icon('arrow-dark')}</a></div>
  </article>`;
}

function filterControls({ type, options = categories }) {
  const name = type === 'faq' ? 'questions' : 'guides';
  const available = [['all', 'All topics'], ...options];
  return `<div class="filter-bar">
    <div class="topic-tabs" aria-label="Filter by topic">${available.map(([id, label], index) => `<button type="button" data-filter="${esc(id)}" aria-pressed="${index === 0}">${esc(label)}</button>`).join('')}</div>
    <label class="topic-select"><span class="sr-only">${available.length > 5 ? 'All topics and more' : 'Topic'}</span><select data-topic-select>${available.map(([id,label]) => `<option value="${esc(id)}">${esc(label)}</option>`).join('')}</select></label>
    <div class="search-field"><label class="sr-only" for="search-${type}">Search ${name}</label>${icon(type === 'faq' ? 'search-faq' : 'search')}<input id="search-${type}" type="search" data-search-input placeholder="Search ${name}" autocomplete="off">${type === 'faq' ? '' : '<button class="search-submit" type="button" data-search-submit>Search</button>'}</div>
  </div><p class="filter-status sr-only" data-filter-status aria-live="polite" aria-atomic="true"></p>`;
}

export function shell({ title, description, body, active = '', head = '', assetPrefix = './', editionLabel = 'OEDRO editorial', embedded = false, footerArticles = [] }) {
  if (embedded) return `<div class="oedro-editorial">${body}</div>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(description)}"><meta name="theme-color" content="#0d4d95">${head}<link rel="icon" href="${esc(assetPrefix)}assets/logo.png"><link rel="preload" href="${esc(assetPrefix)}assets/figma-roboto.woff2" as="font" type="font/woff2" crossorigin><link rel="stylesheet" href="${esc(assetPrefix)}site.css"><script type="module" src="${esc(assetPrefix)}site.js"></script></head><body class="oedro-editorial">
    <a class="skip-link" href="#main">Skip to content</a>
    ${previewHeader(active, assetPrefix)}
    <main id="main" tabindex="-1">${body}</main>
    <footer class="site-footer"><div class="footer-main container"><div class="footer-column"><h2>Contact us</h2>${external('https://www.oedro.com/', 'Official store & support')}<p>For current fitment, prices and order help, use the official store.</p></div><div class="footer-column"><h2>Information</h2><a href="${esc(assetPrefix)}blog.html">Blog</a><a href="${esc(assetPrefix)}blog.html?topic=ownership">Product care</a></div><div class="footer-column"><h2>Support</h2><a href="${esc(assetPrefix)}faq.html">FAQ</a><a href="${esc(assetPrefix)}faq.html?topic=Orders">Orders</a><a href="${esc(assetPrefix)}faq.html?topic=Returns%20%26%20warranty">Returns &amp; warranty</a></div><div class="footer-column"><h2>Start here</h2>${footerArticles.map(article=>`<a href="${esc(assetPrefix)}${href(article)}">${esc(article.navigationLabel || article.title)}</a>`).join('')}</div></div><div class="footer-bottom container"><p>${esc(editionLabel)}</p><a href="#main">Back to top ↑</a></div></footer>
  </body></html>`;
}


export function blogPage({ articles, lead = articles[0], secondary, vehicles = [], categoryOptions = categories }) {
  const featured = secondary;
  const image = lead.featureImage || lead.cover;
  return {
    title:'Truck Buying, Installation & Care Guides | OEDRO Blog',
    description:'Explore practical guides to truck bed covers, running boards, floor mats and bumpers. Search by topic to plan your next project.',
    body:`<div class="container"><nav class="breadcrumbs page-breadcrumbs" aria-label="Breadcrumb"><a href="https://www.oedro.com/" target="_blank" rel="noopener noreferrer">Home<span class="sr-only"> (opens in a new tab)</span></a><span aria-hidden="true">/</span><span>Blog</span></nav><header class="page-heading blog-heading"><div><p class="eyebrow">The OEDRO journal</p><h1>A better fit. A better everyday.</h1></div><p>Practical answers for your truck. From the first measurement to the next repair.</p></header><section class="guide-library" aria-label="Browse guides" data-filter-root data-filter-kind="guides">${filterControls({type:'blog', options:categoryOptions})}<section class="blog-feature" data-editorial-feature aria-label="Featured guides"><a class="blog-feature-image" href="${href(lead)}" aria-label="Read ${esc(lead.title)}"><img src="${esc(image.src)}" alt="${esc(image.alt)}" width="${image.width}" height="${image.height}" fetchpriority="high"></a><div class="blog-feature-copy"><div class="feature-mobile-meta"><span>${esc(topic(lead))}</span><span>${esc(lead.readingMinutes)} min read</span></div><p class="eyebrow">The starting point</p><h2><a href="${href(lead)}">${esc(lead.title)}</a></h2><p>${esc(lead.description)}</p><a class="button measurement-link" href="${href(lead)}">${esc(lead.featuredLinkLabel || 'Read guide')} ${icon('arrow-white')}</a>${featured ? `<div class="feature-second"><span>Also worth a read</span><a href="${href(featured)}">${esc(featured.title)}</a></div>` : ''}</div></section><div class="results-heading" data-results-heading hidden><h2>Showing Results for <span data-results-label></span></h2></div><div class="section-heading library-heading" data-latest-heading><h2>Latest guides</h2><a class="text-link" href="faq.html">Looking for a quick answer? FAQ ${icon('arrow-dark')}</a></div><div class="story-grid library-grid">${articles.map(article => story(article, {filter:true})).join('')}</div><div class="empty-state" data-empty-state hidden><h2>No guides match that search.</h2><p>Try a shorter phrase or choose another topic.</p><button class="button" type="button" data-reset-filters>Clear filters</button></div></section><section class="scenario-links" data-editorial-feature aria-labelledby="scenario-heading"><h2 id="scenario-heading">Start with your truck.</h2><div>${vehicles.map(({article,label,image})=>`<a href="${href(article)}"><img class="truck-image" src="${esc(image)}" alt="" width="120" height="120" loading="lazy">${esc(label)}</a>`).join('')}</div></section></div>`
  };
}

function faqItem(faq, articles) {
  const related = (faq.related || []).map(slug => articles.find(article => article.slug === slug)).filter(Boolean);
  const search = [faq.question, faq.answerHtml.replace(/<[^>]*>/g, ' '), faq.category].join(' ').toLowerCase();
  return `<details class="faq-item" id="${esc(faq.id)}" data-filter-item data-category="${esc(faq.category)}" data-search="${esc(search)}"><summary>${esc(faq.question)}<span class="faq-symbol" aria-hidden="true">${icon('faq-minus', 'faq-open-icon')}${icon('faq-plus', 'faq-closed-icon')}</span></summary><div class="faq-answer">${faq.answerHtml}${related.length ? `<p class="faq-related">Read more: ${related.map(article => `<a href="${href(article)}">${esc(article.title)}</a>`).join(' · ')}</p>` : ''}${faq.sources?.length ? `<div class="faq-sources"><span>Sources</span>${faq.sources.map(source => external(source.url, source.title)).join('')}</div>` : ''}</div></details>`;
}

export function faqPage({ faqs, articles }) {
  const options = [...new Set(faqs.map(faq => faq.category))].map(id => [id, categories.find(([key]) => key === id)?.[1] || id.replace(/-/g, ' ').replace(/^./, char => char.toUpperCase())]);
  return {
    title:'Truck Accessories FAQ: Fitment, Installation & Care | OEDRO',
    description:'Answers to common questions about truck accessory fitment, installation, maintenance, shipping and support. Search the OEDRO FAQ.',
    body:`<div class="container"><nav class="breadcrumbs page-breadcrumbs" aria-label="Breadcrumb"><a href="https://www.oedro.com/" target="_blank" rel="noopener noreferrer">Home<span class="sr-only"> (opens in a new tab)</span></a><span aria-hidden="true">/</span><span>FAQ</span></nav><header class="page-heading faq-heading"><p class="eyebrow">Owner resources</p><h1>What would you like to know?</h1><p>Find an answer about fit, installation and looking after your gear.</p></header><section class="faq-library" aria-label="Frequently asked questions" data-filter-root data-filter-kind="questions">${filterControls({type:'faq', options})}<div class="faq-layout"><aside class="faq-note"><h2>Need help with an order?</h2><p>Have your order number and vehicle details ready when you contact the official store.</p>${external('https://www.oedro.com/', 'Visit OEDRO', 'text-link')}</aside><div class="faq-list">${faqs.map(faq => faqItem(faq, articles)).join('')}<div class="empty-state" data-empty-state hidden><h2>No questions match that search.</h2><p>Try a product name such as “floor mats” or choose another topic.</p><button class="button" type="button" data-reset-filters>Clear filters</button></div></div></div></section></div>`
  };
}

export function articlePage({ article, articles, relatedArticles = [], editorialPreview = false }) {
  const sections = article.sections || [];
  const related = relatedArticles;
  const confirmed = publicationMetadata(article);
  const contents = `<ol>${sections.map(section => `<li><a href="#${esc(section.id)}">${esc(section.title)}</a></li>`).join('')}</ol>`;
  // Display date: a confirmed publishedAt wins; otherwise the build-wide launch date (content/site.json or LAUNCH_DATE).
  const shownDate = (article.publication?.publishedAtConfirmed && article.publishedAt) ? article.publishedAt : article.displayDate;
  const published = shownDate ? `<span>Published <time datetime="${esc(shownDate)}">${date(shownDate)}</time></span>` : '';
  const byline = editorialPreview
    ? `${article.author?.name ? `<span>${esc(article.author.name)}</span>` : ''}${published}<span>${esc(article.readingMinutes)} min read</span>`
    : `${confirmed.author ? `<span>${esc(confirmed.author.name)}</span>` : ''}${published}${confirmed.dateModified ? `<span>Updated <time datetime="${esc(confirmed.dateModified)}">${date(confirmed.dateModified)}</time></span>` : ''}<span>${esc(article.readingMinutes)} min read</span>`;
  return {
    title:article.seoTitle || `${article.title} | OEDRO`, description:article.description,
    body:`<article class="article-page container"><nav class="breadcrumbs" aria-label="Breadcrumb"><a href="blog.html">Blog</a><span aria-hidden="true">/</span><a href="blog.html?topic=${esc(article.category)}">${esc(topic(article))}</a></nav><header class="article-header"><div class="article-heading"><p class="eyebrow">${esc(topic(article))}</p><h1>${esc(article.title)}</h1><p class="article-deck article-answer">${esc(article.intro || article.description)}</p><div class="article-byline">${byline}</div></div><figure class="article-cover${coverClass(article)}"><img src="${esc(article.cover.src)}" alt="${esc(article.cover.alt)}" width="${article.cover.width}" height="${article.cover.height}" fetchpriority="high">${article.cover.caption ? `<figcaption>${esc(article.cover.caption)}</figcaption>` : ''}</figure></header><div class="article-layout"><aside class="article-toc" aria-label="On this page"><div class="toc-inner"><h2>On this page</h2>${contents}<a class="toc-top" href="#main">Back to top ↑</a></div></aside><div class="article-reading"><details class="mobile-toc"><summary>On this page</summary>${contents}</details><div class="article-body">${article.bodyHtml}</div>${article.productLinks?.length ? `<aside class="product-reference"><h2>Check your vehicle fit</h2><p>Confirm the exact year, model and configuration on the product page before ordering.</p>${article.productLinks.map(link => external(link.url, link.title, 'text-link')).join('')}</aside>` : ''}${article.sources?.length ? `<section class="article-sources" aria-labelledby="sources-title"><h2 id="sources-title">Sources &amp; further reading</h2><ul>${article.sources.map(source => `<li>${external(source.url, source.title)}</li>`).join('')}</ul></section>` : ''}<div class="article-end"><a class="text-link" href="blog.html">← All guides</a><a class="text-link" href="faq.html">More questions? Visit the FAQ →</a></div></div></div></article>${related.length ? `<section class="related-section"><div class="container"><div class="section-heading"><h2>For your next project.</h2></div><div class="story-grid">${related.map(item => story(item, {compact:true})).join('')}</div></div></section>` : ''}`
  };
}
