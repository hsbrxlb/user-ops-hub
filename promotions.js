(() => {
  // Offers & promotions: renders data/promotions.json. To add an offer, append an object to "items":
  // id, brand "OEDRO" | "Cozeware", name, type (an id from "types"), offer, how_to_get, scope_include, scope_exclude,
  // min_spend, stacking, start, end (YYYY-MM-DD), channel_links [{label, url}], status running | scheduled | ended.
  // Empty fields are left out of the card. "source" and "verified" stay in the file and never render.
  const root = document.getElementById('promo-sections');
  const brandBar = document.querySelector('.promo-brands');
  const typeBar = document.querySelector('.promo-types');
  const statusLine = document.querySelector('.schedule-status');
  if (!root) return;

  const BRANDS = ['OEDRO', 'Cozeware'];
  const GROUPS = [
    { id: 'running', zh: '进行中' },
    { id: 'scheduled', zh: '即将开始' },
    { id: 'ended', zh: '已结束' }
  ];
  const STATE_LABEL = { running: '进行中', scheduled: '即将开始', ended: '已结束' };
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const filled = (value) => Array.isArray(value) ? value.some(filled) : value !== null && value !== undefined && String(value).trim() !== '';
  const list = (value) => (Array.isArray(value) ? value : [value]).filter(filled);
  const slug = (text) => String(text).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

  let data = null;
  const state = { brand: null, type: null };
  const params = new URLSearchParams(location.search);
  state.brand = BRANDS.includes(params.get('brand')) ? params.get('brand') : null;
  state.type = params.get('type') || null;

  const now = new Date();
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const toDate = (iso) => new Date(`${iso}T00:00:00`);
  const dayDiff = (a, b) => Math.round((toDate(b) - toDate(a)) / 86400000);
  const isoDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(String(value || '')) ? String(value) : '';

  // Dates decide the group once they pass, so an expired offer never sits under 进行中.
  function statusOf(item) {
    const start = isoDate(item.start);
    const end = isoDate(item.end);
    if (item.status === 'ended' || (end && end < today)) return 'ended';
    if (start && start > today) return 'scheduled';
    if (item.status === 'scheduled' && !start) return 'scheduled';
    return 'running';
  }

  function dateParts(value) {
    const iso = isoDate(value);
    if (!iso) return filled(value) ? esc(value) : '';
    const [y, m, d] = iso.split('-').map(Number);
    const year = y !== now.getFullYear() ? `<small>${y}</small>` : '';
    return `${m}月${d}日${year}`;
  }

  const typeOf = (id) => data.types.find((t) => t.id === id) || { id, zh: id, en: '' };
  const idOf = (item) => item.id || slug(`${item.brand}-${item.name}`);

  function money(value) {
    if (!filled(value)) return '';
    return typeof value === 'number' ? `$${value}` : esc(value);
  }

  // Codes written in backticks inside how_to_get render as a code chip.
  const rich = (text) => esc(text).replace(/`([^`]+)`/g, '<code>$1</code>');

  function term(label, value, render = rich) {
    const values = list(value);
    if (!values.length) return '';
    const body = values.length > 1 ? `<ul>${values.map((v) => `<li>${render(v)}</li>`).join('')}</ul>` : render(values[0]);
    return `<dt>${label}</dt><dd>${body}</dd>`;
  }

  function links(item) {
    const entries = list(item.channel_links).map((link) => typeof link === 'string' ? { url: link, label: link.replace(/^https?:\/\/(www\.)?/, '').replace(/\/.*$/, '') } : link).filter((link) => link && /^https?:\/\//.test(link.url || ''));
    if (!entries.length) return '';
    return `<ul class="ticket-links">${entries.map((link) => `<li><a href="${esc(link.url)}" target="_blank" rel="noopener">${esc(link.label || link.url)}</a></li>`).join('')}</ul>`;
  }

  function stub(item, status) {
    const start = dateParts(item.start);
    const end = dateParts(item.end);
    const dates = [start && `<div><dt>开始</dt><dd>${start}</dd></div>`, end && `<div><dt>截止</dt><dd>${end}</dd></div>`].filter(Boolean).join('');
    let left = '';
    if (status === 'running' && isoDate(item.end)) {
      const days = dayDiff(today, item.end);
      left = days === 0 ? '<p class="ticket-left">今天截止</p>' : `<p class="ticket-left">还剩 <strong>${days}</strong> 天</p>`;
    } else if (status === 'scheduled' && isoDate(item.start)) {
      left = `<p class="ticket-left"><strong>${dayDiff(today, item.start)}</strong> 天后开始</p>`;
    }
    return `<div class="ticket-stub"><span class="ticket-state" data-status="${status}">${STATE_LABEL[status]}</span>${dates ? `<dl class="ticket-dates">${dates}</dl>` : ''}${left}</div>`;
  }

  function card(item) {
    const status = statusOf(item);
    const type = typeOf(item.type);
    const terms = [
      term('怎么领', item.how_to_get),
      term('适用', item.scope_include),
      term('不适用', item.scope_exclude),
      term('最低消费', item.min_spend, money),
      term('叠加', item.stacking)
    ].join('');
    const heading = filled(item.offer) ? item.offer : item.name;
    const subtitle = filled(item.offer) && filled(item.name) ? `<h3 class="ticket-name">${esc(item.name)}</h3>` : '';
    return `<div class="promo-item" id="promo-${esc(idOf(item))}">
<article class="promo-ticket" data-brand="${esc(item.brand)}" data-type="${esc(item.type)}" aria-label="${esc(item.brand)} ${esc(item.name || item.offer)}">
<div class="ticket-main">
<p class="ticket-kicker"><span class="ticket-brand">${esc(item.brand)}</span>${type.zh ? `<span class="ticket-type">${esc(type.zh)}</span>` : ''}</p>
<p class="ticket-offer" lang="en">${esc(heading)}</p>
${subtitle}
${terms ? `<dl class="ticket-terms">${terms}</dl>` : ''}
${links(item)}
</div>
${stub(item, status)}
</article>
</div>`;
  }

  // Running and upcoming offers that end soonest come first; ended offers show the latest first.
  function ordered(items, group) {
    const key = (i) => group === 'scheduled' ? (isoDate(i.start) || '9999') : (isoDate(i.end) || '9999');
    return [...items].sort((a, b) => group === 'ended' ? key(b).localeCompare(key(a)) : key(a).localeCompare(key(b)));
  }

  function visible() { return data.items.filter((i) => i.verified !== false && BRANDS.includes(i.brand)); }

  function render() {
    const items = visible().filter((i) => (!state.brand || i.brand === state.brand) && (!state.type || i.type === state.type));
    const html = GROUPS.map((group) => {
      const mine = ordered(items.filter((i) => statusOf(i) === group.id), group.id);
      if (!mine.length && group.id !== 'running') return '';
      const body = mine.length ? `<div class="promo-list">${mine.map(card).join('')}</div>` : '<p class="promo-empty">这个筛选下现在没有进行中的活动。</p>';
      if (group.id === 'ended') {
        const linked = mine.some((i) => location.hash === `#promo-${idOf(i)}`);
        return `<details class="promo-group promo-ended"${linked ? ' open' : ''}><summary><h2>${group.zh}<span class="promo-count">${mine.length} 项</span><span class="promo-toggle"></span></h2></summary>${body}</details>`;
      }
      return `<section class="promo-group" aria-label="${group.zh}"><h2>${group.zh}<span class="promo-count">${mine.length} 项</span></h2>${body}</section>`;
    }).join('');
    root.innerHTML = html;
    const running = items.filter((i) => statusOf(i) === 'running').length;
    statusLine.textContent = `共 ${items.length} 项，进行中 ${running} 项`;
    for (const b of brandBar.querySelectorAll('button')) b.setAttribute('aria-pressed', String((b.dataset.brand || null) === state.brand));
    for (const b of typeBar.querySelectorAll('button')) b.setAttribute('aria-pressed', String((b.dataset.type || null) === state.type));
  }

  function bars() {
    const all = visible();
    const brandCount = (b) => all.filter((i) => !b || i.brand === b).length;
    brandBar.innerHTML = `<button type="button" data-brand="" aria-pressed="false">全部<span class="filter-count">${brandCount(null)}</span></button>`
      + BRANDS.map((b) => `<button type="button" data-brand="${b}" aria-pressed="false">${b}<span class="filter-count">${brandCount(b)}</span></button>`).join('');
    const counts = new Map();
    for (const i of all) counts.set(i.type, (counts.get(i.type) || 0) + 1);
    const types = data.types.filter((t) => counts.get(t.id));
    for (const id of counts.keys()) if (!types.some((t) => t.id === id)) types.push(typeOf(id));
    typeBar.hidden = types.length < 2;
    typeBar.innerHTML = `<button type="button" data-type="" aria-pressed="false">全部类型<span class="filter-count">${all.length}</span></button>`
      + types.map((t) => `<button type="button" data-type="${esc(t.id)}" aria-pressed="false">${esc(t.zh)}${t.en ? `<span lang="en">${esc(t.en)}</span>` : ''}<span class="filter-count">${counts.get(t.id)}</span></button>`).join('');
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

  function toAnchor() {
    if (!location.hash.startsWith('#promo-')) return;
    const target = document.getElementById(location.hash.slice(1));
    if (!target) return;
    const folded = target.closest('details:not([open])');
    if (folded) folded.open = true;
    target.scrollIntoView({ block: 'start' });
  }

  fetch('data/promotions.json?v=' + Date.now(), { cache: 'no-store' })
    .then((r) => r.json())
    .then((json) => {
      data = { types: json.types || [], items: json.items || [] };
      // A linked offer must be visible even if a filter in the address would hide it.
      if (location.hash.startsWith('#promo-') && data.items.some((i) => '#promo-' + idOf(i) === location.hash)) { state.brand = null; state.type = null; }
      bars(); render(); toAnchor();
      document.fonts?.ready.then(toAnchor);
      window.addEventListener('hashchange', () => { render(); toAnchor(); });
    })
    .catch(() => { root.innerHTML = '<p class="promo-empty">活动数据没有加载出来，刷新再试。</p>'; });
})();
