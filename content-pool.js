(() => {
  // Content pool: renders data/content-pool.json. To add a post, append an object to "items" in that file
  // (id, brand "OEDRO" | "Cozeware", type, status "review" | "ready", title, zh, image, w, h, meme, product, captions).
  const root = document.getElementById('pool-sections');
  const brandBar = document.querySelector('.pool-brands');
  const typeBar = document.querySelector('.pool-types');
  const statusLine = document.querySelector('.schedule-status');
  if (!root) return;

  const BRANDS = ['OEDRO', 'Cozeware'];
  const PLATFORMS = ['Instagram', 'Facebook', 'X', 'Threads'];
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  let data = null;
  const state = { brand: null, type: null };
  const params = new URLSearchParams(location.search);
  state.brand = BRANDS.includes(params.get('brand')) ? params.get('brand') : null;
  state.type = params.get('type') || null;

  const typeOf = (id) => data.types.find((t) => t.id === id) || { id, zh: id, en: id };

  function card(item) {
    const type = typeOf(item.type);
    const status = data.statuses[item.status] || data.statuses.review;
    const platforms = PLATFORMS.filter((name) => item.captions && item.captions[name]);
    const sources = (item.meme?.sources || []).map((s) => `<a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)} ↗</a>`).join('');
    const product = item.product ? `<a href="${esc(item.product.url)}" target="_blank" rel="noopener">${esc(item.product.name)} ↗</a>` : '';
    return `<article class="pool-card" id="pool-${esc(item.id)}" data-brand="${esc(item.brand)}" data-type="${esc(item.type)}">
<button class="feed-large" type="button" aria-label="查看大图" data-title="${esc(item.title)}" data-pages="${esc(item.image)}" style="--feed-ratio:${item.w / item.h}"><img src="${esc(item.image)}" alt="${esc(item.title)}" width="${item.w}" height="${item.h}" loading="lazy"></button>
<ul class="pool-meta"><li class="pool-brand-pill">${esc(item.brand)}</li><li class="pool-type-pill">${esc(type.zh)}<span lang="en">${esc(type.en)}</span></li><li class="post-status" data-status="${esc(item.status)}">${esc(status.zh)} <span lang="en">${esc(status.en)}</span></li><li class="pool-id">${esc(item.id)}</li></ul>
<h4 lang="en">${esc(item.title)}</h4>
<p class="pool-story">${esc(item.zh)}</p>
${item.meme ? `<dl class="pool-meme"><dt>借的梗</dt><dd>${esc(item.meme.name)}${item.meme.date ? `（${esc(item.meme.date)}）` : ''}</dd><dt>怎么避开抄袭</dt><dd>${esc(item.meme.how)}</dd><dt>来源</dt><dd>${sources}</dd>${product ? `<dt>产品</dt><dd>${product}</dd>` : ''}</dl>` : ''}
<div class="post-platforms"><div class="post-platform-switch" role="group" aria-label="平台">${platforms.map((name, i) => `<button type="button" data-platform="${name}" aria-pressed="${i === 0}">${name}</button>`).join('')}</div><button type="button" class="post-copy">复制配文</button></div>
${platforms.map((name, i) => `<div class="post-caption" data-feed-platform="${name}"${i ? ' hidden' : ''}><p class="feed-caption" lang="en">${esc(item.captions[name])}</p></div>`).join('')}
</article>`;
  }

  function render() {
    const items = data.items.filter((i) => (!state.brand || i.brand === state.brand) && (!state.type || i.type === state.type));
    const brands = BRANDS.filter((b) => items.some((i) => i.brand === b));
    root.innerHTML = brands.map((brand) => {
      const mine = items.filter((i) => i.brand === brand);
      const types = data.types.filter((t) => mine.some((i) => i.type === t.id));
      return `<section class="pool-section" id="brand-${brand.toLowerCase()}" aria-label="${brand}"><h2>${brand}<span class="pool-count">${mine.length} 条</span></h2>${types.map((t) => {
        const group = mine.filter((i) => i.type === t.id);
        return `<div class="pool-type" data-type="${t.id}"><h3>${esc(t.zh)}<span lang="en">${esc(t.en)}</span><span class="pool-count">${group.length}</span></h3><div class="pool-grid">${group.map(card).join('')}</div></div>`;
      }).join('')}</section>`;
    }).join('') || '<p class="pool-empty">这个组合下还没有内容。</p>';
    statusLine.textContent = `共 ${items.length} 条`;
    for (const b of brandBar.querySelectorAll('button')) b.setAttribute('aria-pressed', String((b.dataset.brand || null) === state.brand));
    for (const b of typeBar.querySelectorAll('button')) b.setAttribute('aria-pressed', String((b.dataset.type || null) === state.type));
  }

  function bars() {
    const brandCount = (b) => data.items.filter((i) => !b || i.brand === b).length;
    brandBar.innerHTML = `<button type="button" data-brand="" aria-pressed="false">全部<span class="filter-count">${brandCount(null)}</span></button>`
      + BRANDS.map((b) => `<button type="button" data-brand="${b}" aria-pressed="false">${b}<span class="filter-count">${brandCount(b)}</span></button>`).join('');
    const counts = new Map();
    for (const i of data.items) counts.set(i.type, (counts.get(i.type) || 0) + 1);
    typeBar.innerHTML = `<button type="button" data-type="" aria-pressed="false">全部<span lang="en">All</span><span class="filter-count">${data.items.length}</span></button>`
      + data.types.map((t) => `<button type="button" data-type="${t.id}" aria-pressed="false">${esc(t.zh)}<span lang="en">${esc(t.en)}</span><span class="filter-count">${counts.get(t.id) || 0}</span></button>`).join('');
  }

  function sync() {
    const p = new URLSearchParams();
    if (state.brand) p.set('brand', state.brand);
    if (state.type) p.set('type', state.type);
    const q = p.toString();
    history.replaceState(null, '', location.pathname + (q ? '?' + q : '') + location.hash);
  }

  brandBar.addEventListener('click', (event) => {
    const b = event.target.closest('button[data-brand]');
    if (!b) return;
    state.brand = b.dataset.brand || null;
    sync(); render();
  });
  typeBar.addEventListener('click', (event) => {
    const b = event.target.closest('button[data-type]');
    if (!b) return;
    state.type = b.dataset.type && b.dataset.type !== state.type ? b.dataset.type : null;
    sync(); render();
  });

  document.addEventListener('click', async (event) => {
    const platform = event.target.closest('.post-platform-switch button[data-platform]');
    if (platform) {
      const card = platform.closest('.pool-card');
      for (const b of card.querySelectorAll('.post-platform-switch button')) b.setAttribute('aria-pressed', String(b === platform));
      for (const c of card.querySelectorAll('[data-feed-platform]')) c.hidden = c.dataset.feedPlatform !== platform.dataset.platform;
      return;
    }
    const copy = event.target.closest('.pool-card .post-copy');
    if (copy) {
      const caption = copy.closest('.pool-card').querySelector('[data-feed-platform]:not([hidden]) .feed-caption');
      try {
        await navigator.clipboard.writeText(caption.innerText);
        copy.textContent = '已复制';
      } catch {
        const range = document.createRange();
        range.selectNodeContents(caption);
        const sel = getSelection();
        sel.removeAllRanges();
        sel.addRange(range);
        copy.textContent = '已选中，按复制键';
      }
      clearTimeout(copy._reset);
      copy._reset = setTimeout(() => { copy.textContent = '复制配文'; }, 1800);
    }
  });

  function toAnchor() {
    if (!location.hash.startsWith('#pool-')) return;
    const target = document.getElementById(location.hash.slice(1));
    if (target) target.scrollIntoView({ block: 'start' });
  }

  fetch('data/content-pool.json?v=' + Date.now(), { cache: 'no-store' })
    .then((r) => r.json())
    .then((json) => {
      data = json;
      // A linked card must be visible even if a stored filter would hide it.
      const linked = location.hash.startsWith('#pool-') ? data.items.find((i) => 'pool-' + i.id === location.hash.slice(1)) : null;
      if (linked) { state.brand = null; state.type = null; }
      bars(); render(); toAnchor();
      document.fonts?.ready.then(toAnchor);
      window.addEventListener('load', toAnchor, { once: true });
      window.addEventListener('hashchange', toAnchor);
    })
    .catch(() => { root.innerHTML = '<p class="pool-empty">内容池数据没有加载出来，刷新再试。</p>'; });
})();
