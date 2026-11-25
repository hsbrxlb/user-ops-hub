// 全网讨论：加载 data/fullweb 下的分块数据，在浏览器内筛选和全文搜索。
(function () {
  const PAGE = 40;
  const KIND = { post: '帖子', comment: '评论', video: '视频', article: '文章', official: '官方账号' };
  const REL = { direct: '直接提到品牌', context: '相关讨论', official: '官方账号' };
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const state = { q: '', type: new Set(['用户讨论']), brand: new Set(), source: new Set(), topic: new Set(), kind: new Set(), rel: new Set(), from: '', to: '', undated: true, sort: 'new', shown: PAGE };
  let all = [];

  const dims = {
    type: { label: '内容性质', get: (i) => [i.y || '商家内容'] },
    brand: { label: '品牌', get: (i) => [i.b] },
    source: { label: '来源', get: (i) => [i.f || i.s] },
    topic: { label: '话题', get: (i) => i.g },
    kind: { label: '内容类型', get: (i) => [KIND[i.k] || i.k] },
    rel: { label: '与品牌的关系', get: (i) => [REL[i.r] || i.r] }
  };
  const hay = (i) => `${i.t || ''} ${i.x || ''} ${i.c || ''} ${i.s} ${i.b} ${i.g.join(' ')}`.toLowerCase();

  function matches(i, skip) {
    if (state.q) {
      const h = i._h;
      for (const w of state.q.toLowerCase().split(/\s+/).filter(Boolean)) if (!h.includes(w)) return false;
    }
    for (const k of Object.keys(dims)) {
      if (k === skip || !state[k].size) continue;
      if (!dims[k].get(i).some((v) => state[k].has(v))) return false;
    }
    if (skip !== 'date') {
      if (!i.d) { if (state.from || state.to ? !state.undated : false) return false; }
      else { if (state.from && i.d < state.from) return false; if (state.to && i.d > state.to) return false; }
    }
    return true;
  }
  function facet(k) {
    const m = new Map();
    for (const i of all) if (matches(i, k)) for (const v of dims[k].get(i)) m.set(v, (m.get(v) || 0) + 1);
    for (const v of state[k]) if (!m.has(v)) m.set(v, 0);
    return [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh'));
  }
  function mark(text, q) {
    const words = q.split(/\s+/).filter(Boolean).map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
    const safe = esc(text);
    if (!words.length) return safe;
    return safe.replace(new RegExp(`(${words.map(esc).join('|')})`, 'gi'), '<mark>$1</mark>');
  }
  function fmtDate(d) { return d ? d : '日期未知'; }

  function render(root) {
    const list = all.filter((i) => matches(i)).sort((a, b) => {
      if (!a.d !== !b.d) return a.d ? -1 : 1;
      const c = state.sort === 'new' ? b.d.localeCompare(a.d) : a.d.localeCompare(b.d);
      return c || a.i - b.i;
    });
    const filtersHtml = Object.keys(dims).map((k) => {
      const rows = facet(k);
      return `<fieldset class="fw-facet"><legend>${dims[k].label}</legend>${rows.map(([v, n]) => `<label class="fw-opt${n ? '' : ' is-zero'}"><input type="checkbox" data-dim="${k}" value="${esc(v)}"${state[k].has(v) ? ' checked' : ''}><span class="fw-opt-name">${esc(v)}</span><span class="fw-opt-n">${n}</span></label>`).join('')}</fieldset>`;
    }).join('');
    const dateHtml = `<fieldset class="fw-facet"><legend>发布日期</legend>
      <div class="fw-dates"><label>从<input type="date" id="fw-from" value="${state.from}" min="${root._meta.min_date}" max="${root._meta.max_date}"></label><label>到<input type="date" id="fw-to" value="${state.to}" min="${root._meta.min_date}" max="${root._meta.max_date}"></label></div>
      <div class="fw-presets">${[['近 30 天', 30], ['近 90 天', 90], ['全部', 0]].map(([l, n]) => `<button type="button" data-preset="${n}">${l}</button>`).join('')}</div>
      <label class="fw-opt"><input type="checkbox" id="fw-undated"${state.undated ? ' checked' : ''}><span class="fw-opt-name">同时显示日期未知的记录</span><span class="fw-opt-n">${all.filter((i) => !i.d && matches(i, 'date')).length}</span></label></fieldset>`;
    const chips = [];
    for (const k of Object.keys(dims)) for (const v of state[k]) chips.push(`<button type="button" class="fw-chip" data-rm="${k}" data-v="${esc(v)}">${esc(v)} <span aria-hidden="true">×</span><span class="sr-only">移除筛选</span></button>`);
    if (state.from || state.to) chips.push(`<button type="button" class="fw-chip" data-rm="date">${esc(state.from || '最早')} 至 ${esc(state.to || '最新')} <span aria-hidden="true">×</span><span class="sr-only">移除日期筛选</span></button>`);
    const shown = list.slice(0, state.shown);
    const rows = shown.map((i) => {
      const title = i.t || i.c || '';
      const body = i.c || i.x || '';
      return `<article class="fw-item"><div class="fw-meta"><time${i.d ? ` datetime="${i.d}"` : ''}>${fmtDate(i.d)}</time><span>${esc(i.s)}</span><span class="fw-brand fw-brand-${i.b === 'Cozeware' ? 'cz' : 'oe'}">${esc(i.b)}</span></div>
      <div class="fw-body">${title ? `<h2><a href="${esc(i.u)}" target="_blank" rel="noopener noreferrer">${mark(title, state.q)}</a></h2>` : ''}${body && body !== title ? `<p>${mark(body, state.q)}</p>` : ''}${i.x && i.c ? `<p class="fw-orig">${mark(i.x, state.q)}</p>` : ''}
      <div class="fw-tags"><span class="fw-kind">${esc(i.y || '商家内容')}</span><span class="fw-kind">${esc(KIND[i.k] || i.k)}</span>${i.g.map((g) => `<span>${esc(g)}</span>`).join('')}</div></div>
      <a class="fw-open" href="${esc(i.u)}" target="_blank" rel="noopener noreferrer" aria-label="在${esc(i.s)}查看原帖：${esc((title || body).slice(0, 40))}">查看原帖 <span aria-hidden="true">↗</span></a></article>`;
    }).join('');
    const active = chips.length + (state.q ? 1 : 0);
    root.querySelector('.fw-rail-body').innerHTML = filtersHtml + dateHtml;
    root.querySelector('.fw-chips').innerHTML = chips.join('') + (chips.length ? '<button type="button" class="fw-clear">清除全部筛选</button>' : '');
    root.querySelector('.fw-count').innerHTML = `<strong>${list.length}</strong> / ${all.length} 条${state.q ? `，包含“${esc(state.q)}”` : ''}`;
    root.querySelector('.fw-toggle-n').textContent = chips.length ? `（${chips.length}）` : '';
    root.querySelector('.fw-list').innerHTML = rows || '<div class="fw-empty"><p>没有符合当前条件的记录。</p><button type="button" class="fw-clear">清除全部筛选</button></div>';
    const more = root.querySelector('.fw-more');
    more.hidden = list.length <= state.shown;
    more.textContent = `再显示 ${Math.min(PAGE, list.length - state.shown)} 条`;
    root.querySelector('.fw-sheet-apply').textContent = `查看 ${list.length} 条结果`;
    return active;
  }

  async function init() {
    const main = document.querySelector('#content');
    const base = 'data/fullweb/';
    const meta = await (await fetch(base + 'index.json', { cache: 'no-store' })).json();
    const parts = await Promise.all(Array.from({ length: meta.chunks }, (_, n) => fetch(`${base}items-${n + 1}.json`, { cache: 'no-store' }).then((r) => { if (!r.ok) throw new Error('数据加载失败'); return r.json(); })));
    all = parts.flat();
    for (const i of all) i._h = hay(i);
    main.innerHTML = `<header class="page-heading"><h1>全网讨论</h1><p>OEDRO 与 Cozeware 在公开网页上被提到的帖子、评论、视频和文章，共 ${meta.total} 条，发布日期 ${meta.min_date} 至 ${meta.max_date}。每条都能点回原网址。默认只显示用户讨论，在“内容性质”里可以切换到用户视频、媒体评测和商家内容。</p></header>
    <div class="fw" id="fw">
      <div class="fw-bar">
        <label class="fw-search"><span class="sr-only">搜索全文</span><input type="search" id="fw-q" placeholder="搜索关键词，如 leak、fit、脚垫" autocomplete="off" enterkeyhint="search"></label>
        <label class="fw-sort"><span class="sr-only">排序</span><select id="fw-sort"><option value="new">日期从新到旧</option><option value="old">日期从旧到新</option></select></label>
        <button type="button" class="fw-toggle" aria-controls="fw-rail">筛选<span class="fw-toggle-n"></span></button>
      </div>
      <div class="fw-layout">
        <aside class="fw-rail" id="fw-rail" aria-label="筛选"><div class="fw-sheet-head"><strong>筛选</strong><button type="button" class="fw-sheet-close" aria-label="关闭筛选">×</button></div><div class="fw-rail-body"></div><div class="fw-sheet-foot"><button type="button" class="fw-clear">清除</button><button type="button" class="fw-sheet-apply"></button></div></aside>
        <section class="fw-results" aria-live="polite"><div class="fw-status"><span class="fw-count"></span></div><div class="fw-chips"></div><div class="fw-list"></div><button type="button" class="fw-more" hidden></button></section>
      </div></div>`;
    const root = main.querySelector('#fw');
    root._meta = meta;
    const rerender = () => render(root);
    const reset = () => { state.shown = PAGE; rerender(); };
    root.querySelector('#fw-q').addEventListener('input', (e) => { state.q = e.target.value.trim(); reset(); });
    root.querySelector('#fw-sort').addEventListener('change', (e) => { state.sort = e.target.value; reset(); });
    const rail = root.querySelector('.fw-rail'), toggle = root.querySelector('.fw-toggle');
    toggle.setAttribute('aria-expanded', 'false');
    const setSheet = (open) => { rail.classList.toggle('is-open', open); toggle.setAttribute('aria-expanded', String(open)); document.body.classList.toggle('fw-lock', open); if (open) rail.querySelector('input')?.focus(); else if (matchMedia('(max-width: 860px)').matches) toggle.focus(); };
    toggle.addEventListener('click', () => setSheet(!rail.classList.contains('is-open')));
    root.querySelector('.fw-sheet-close').addEventListener('click', () => setSheet(false));
    root.querySelector('.fw-sheet-apply').addEventListener('click', () => setSheet(false));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && rail.classList.contains('is-open')) setSheet(false); });
    root.addEventListener('change', (e) => {
      const t = e.target;
      if (t.dataset.dim) { const s = state[t.dataset.dim]; t.checked ? s.add(t.value) : s.delete(t.value); reset(); }
      else if (t.id === 'fw-from') { state.from = t.value; reset(); }
      else if (t.id === 'fw-to') { state.to = t.value; reset(); }
      else if (t.id === 'fw-undated') { state.undated = t.checked; reset(); }
    });
    root.addEventListener('click', (e) => {
      const b = e.target.closest('button'); if (!b) return;
      if (b.dataset.preset !== undefined) {
        const n = Number(b.dataset.preset);
        if (!n) { state.from = ''; state.to = ''; } else { const end = new Date(meta.max_date + 'T00:00:00Z'); const st = new Date(end.getTime() - n * 864e5); state.from = st.toISOString().slice(0, 10); state.to = meta.max_date; }
        reset();
      } else if (b.dataset.rm) {
        if (b.dataset.rm === 'date') { state.from = ''; state.to = ''; } else state[b.dataset.rm].delete(b.dataset.v);
        reset();
      } else if (b.classList.contains('fw-clear')) {
        for (const k of Object.keys(dims)) state[k].clear();
        state.from = state.to = ''; state.q = ''; state.undated = true; root.querySelector('#fw-q').value = ''; reset();
      } else if (b.classList.contains('fw-more')) { state.shown += PAGE; rerender(); }
    });
    rerender();
  }
  window.initFullweb = init;
})();
