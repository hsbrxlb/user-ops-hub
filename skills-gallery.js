// 技能画廊：卡片印记、页内阅读 Markdown、复制与下载。
(() => {
  const gallery = document.querySelector('#sg-gallery');
  const detail = document.querySelector('#sg-detail');
  if (!gallery || !detail) return;

  // 由技能名生成固定的印记：几道同心弧加一个落点，像一枚手盖的章。
  const hash = (text) => [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
  const glyph = (seed) => {
    let h = hash(seed);
    const rand = () => { h = (h * 1103515245 + 12345) >>> 0; return (h >>> 8) / 16777216; };
    const rings = 3 + Math.floor(rand() * 3);
    let paths = '';
    for (let i = 0; i < rings; i += 1) {
      const r = 10 + i * (30 / rings) + rand() * 3;
      const start = rand() * Math.PI * 2;
      const sweep = Math.PI * (0.6 + rand() * 1.2);
      const x1 = 50 + r * Math.cos(start);
      const y1 = 50 + r * Math.sin(start);
      const x2 = 50 + r * Math.cos(start + sweep);
      const y2 = 50 + r * Math.sin(start + sweep);
      const width = (0.8 + rand() * 1.8).toFixed(2);
      paths += `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} A${r.toFixed(1)} ${r.toFixed(1)} 0 ${sweep > Math.PI ? 1 : 0} 1 ${x2.toFixed(1)} ${y2.toFixed(1)}" stroke-width="${width}"/>`;
    }
    const angle = rand() * Math.PI * 2;
    const dist = 8 + rand() * 30;
    const dot = `<circle cx="${(50 + dist * Math.cos(angle)).toFixed(1)}" cy="${(50 + dist * Math.sin(angle)).toFixed(1)}" r="${(2.5 + rand() * 3).toFixed(1)}" fill="currentColor" stroke="none"/>`;
    return `<svg viewBox="0 0 100 100" fill="none" stroke="currentColor" stroke-linecap="round">${paths}${dot}</svg>`;
  };
  document.querySelectorAll('.sg-glyph').forEach((el) => { el.innerHTML = glyph(el.dataset.seed); });

  let index = null;
  const loadIndex = async () => {
    if (index) return index;
    const response = await fetch('skills/index.json', { cache: 'no-store' });
    if (!response.ok) throw new Error('index');
    index = await response.json();
    return index;
  };

  const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
  const stripFrontmatter = (text) => text.replace(/^---\n[\s\S]*?\n---\n+/, '');
  const render = (markdown) => {
    const body = stripFrontmatter(markdown).replace(/^# .*\n+/, '');
    if (window.marked?.parse) return window.marked.parse(body, { gfm: true });
    return `<pre><code>${escapeHtml(body)}</code></pre>`;
  };

  let rawText = '';
  const paint = (md) => {
    md.innerHTML = render(rawText);
    md.querySelectorAll('table').forEach((table) => {
      const wrap = document.createElement('div');
      wrap.className = 'sg-table';
      table.replaceWith(wrap);
      wrap.append(table);
    });
  };
  let galleryScroll = 0;

  const showGallery = () => {
    detail.hidden = true;
    gallery.hidden = false;
    document.title = '技能画廊｜海外用户运营 Hub';
    window.scrollTo(0, galleryScroll);
  };

  const showDetail = async (name) => {
    galleryScroll = gallery.hidden ? galleryScroll : window.scrollY;
    gallery.hidden = true;
    detail.hidden = false;
    window.scrollTo(0, 0);
    const md = detail.querySelector('#sg-md');
    md.innerHTML = '<p class="sg-loading">正在载入…</p>';
    let meta;
    try {
      meta = (await loadIndex()).skills.find((s) => s.name === name);
    } catch (error) { meta = null; }
    if (!meta) {
      detail.querySelector('#sg-detail-title').textContent = '没有找到这个技能';
      md.innerHTML = '<p><a href="#">回到全部技能</a></p>';
      return;
    }
    const shelf = index.shelves.find((s) => s.id === meta.shelf);
    detail.querySelector('#sg-detail-title').textContent = meta.title;
    detail.querySelector('#sg-detail-does').textContent = meta.does;
    const [y, m, d] = meta.updated.split('-');
    detail.querySelector('#sg-detail-meta').textContent = `${meta.name}.md · ${shelf ? shelf.title : ''} · ${meta.tags.join(' · ')} · 更新于 ${Number(m)}月${Number(d)}日`;
    const download = detail.querySelector('#sg-download');
    download.href = `skills/${meta.name}.md`;
    download.setAttribute('download', `${meta.name}.md`);
    detail.querySelector('#sg-copied').textContent = '';
    document.title = `${meta.title}｜技能画廊`;
    detail.querySelector('#sg-detail-title').setAttribute('tabindex', '-1');
    detail.querySelector('#sg-detail-title').focus({ preventScroll: true });
    try {
      const response = await fetch(`skills/${meta.name}.md`, { cache: 'no-store' });
      if (!response.ok) throw new Error('md');
      rawText = await response.text();
      paint(md);
    } catch (error) {
      rawText = '';
      md.innerHTML = `<p>文件暂时无法载入。可以直接<a href="skills/${meta.name}.md">打开原文件</a>。</p>`;
    }
  };

  const route = () => {
    const match = location.hash.match(/^#\/([a-z0-9-]+)$/);
    if (match) showDetail(match[1]);
    else if (!gallery.hidden && detail.hidden) return;
    else showGallery();
  };

  detail.querySelector('.sg-back').addEventListener('click', (event) => {
    event.preventDefault();
    history.pushState('', document.title, location.pathname + location.search);
    showGallery();
  });

  detail.querySelector('#sg-copy').addEventListener('click', async () => {
    const status = detail.querySelector('#sg-copied');
    if (!rawText) { status.textContent = '内容还没载入'; return; }
    try {
      await navigator.clipboard.writeText(rawText);
    } catch (error) {
      const area = document.createElement('textarea');
      area.value = rawText;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.append(area);
      area.select();
      document.execCommand('copy');
      area.remove();
    }
    status.textContent = '已复制';
  });

  window.addEventListener('hashchange', route);
  window.addEventListener('popstate', route);
  // marked 延迟加载；详情页若先于它打开，载入后重新渲染。
  window.addEventListener('load', () => { if (!detail.hidden && rawText && window.marked) paint(detail.querySelector('#sg-md')); });
  route();
})();
