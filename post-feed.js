(() => {
  // Purpose vocabulary. English labels match the content schedule drop-down options.
  const PURPOSES = {
    'product-promo': ['产品宣传', 'Product promo'],
    'discord-invite': ['社群引流', 'Discord invite'],
    'exclusive-discount': ['专属折扣', 'Exclusive discount'],
    'user-campaign': ['用户活动', 'User campaign'],
    giveaway: ['抽奖', 'Giveaway'],
    'user-story': ['用户故事', 'User story'],
    'how-to': ['使用技巧', 'How-to'],
    education: ['科普', 'Education'],
    comic: ['漫画', 'Comic'],
    trend: ['蹭热点', 'Trend'],
    seasonal: ['应季场景', 'Seasonal'],
    'holiday-sale': ['节日促销', 'Holiday sale'],
    brand: ['品牌形象', 'Brand'],
    'creator-collab': ['达人合作', 'Creator collab'],
    'new-arrival': ['新品', 'New arrival'],
    'floor-mats': ['脚垫', 'Floor mats'],
    'tonneau-cover': ['货箱盖', 'Tonneau cover'],
    'running-boards': ['踏板', 'Running boards'],
    bumper: ['保险杠', 'Bumper'],
    'under-seat-storage': ['座椅下储物盒', 'Under-seat storage'],
    'truck-bed-toolbox': ['货箱工具箱', 'Truck bed toolbox'],
    fitment: ['车型适配', 'Fitment'],
    ac: ['空调', 'AC'],
    freshflow: ['新风机', 'FreshFlow'],
    installation: ['安装', 'Installation']
  };
  const PRODUCT = new Set(['floor-mats', 'tonneau-cover', 'running-boards', 'bumper', 'under-seat-storage', 'truck-bed-toolbox', 'fitment', 'ac', 'freshflow', 'installation']);
  const ORDER = Object.keys(PURPOSES);
  const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

  const days = [...document.querySelectorAll('.feed-day')];
  const posts = [...document.querySelectorAll('.post')];
  const dateNav = document.querySelector('.schedule-dates');
  const filterBar = document.querySelector('.schedule-filter');
  const status = document.querySelector('.schedule-status');
  const bar = document.querySelector('.schedule-bar');
  const tagsOf = (post) => (post.dataset.purpose || '').split(/\s+/).filter((tag) => PURPOSES[tag])
    .sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  const pill = (tag) => `<li data-tag="${tag}"${PRODUCT.has(tag) ? ' class="is-product"' : ''}>${PURPOSES[tag][0]}<span lang="en">${PURPOSES[tag][1]}</span></li>`;

  // Purpose pills are drawn from data-purpose so a copied post only needs that attribute.
  for (const post of posts) {
    let list = post.querySelector('.post-purpose');
    if (!list) {
      list = document.createElement('ul');
      list.className = 'post-purpose';
      list.setAttribute('aria-label', '用途');
      post.querySelector('.post-body')?.prepend(list);
    }
    list.innerHTML = tagsOf(post).map(pill).join('');
  }

  for (const button of document.querySelectorAll('.feed-large')) {
    const image = button.querySelector('img');
    const w = Number(image.getAttribute('width'));
    const h = Number(image.getAttribute('height'));
    if (w > 0 && h > 0) button.style.setProperty('--feed-ratio', w / h);
    const pages = (button.dataset.pages || '').split('|').filter(Boolean).length;
    if (pages > 1) button.dataset.count = pages + ' 张';
  }

  // Date strip
  const label = (key) => {
    const [y, m, d] = key.split('-').map(Number);
    return { month: m, day: d, week: WEEK[new Date(Date.UTC(y, m - 1, d)).getUTCDay()] };
  };
  const keys = days.map((day) => day.dataset.date);
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' }).format(Date.now());
  const focus = keys.find((key) => key >= today) || keys[keys.length - 1];
  if (dateNav) {
    dateNav.innerHTML = days.map((day) => {
      const key = day.dataset.date;
      const { month, day: date, week } = label(key);
      return `<a href="#day-${key}" data-date="${key}" aria-label="${month}月${date}日 ${week}"><span class="date-num">${month}/${date}</span><span class="date-meta">${week}<span class="date-count"></span></span></a>`;
    }).join('');
  }
  for (const day of days) {
    const heading = day.querySelector('h2');
    if (heading && !heading.querySelector('.day-count')) heading.insertAdjacentHTML('beforeend', '<span class="day-count"></span>');
  }

  function markCurrent(key) {
    if (!dateNav) return;
    for (const link of dateNav.querySelectorAll('a')) {
      if (link.dataset.date === key) {
        link.setAttribute('aria-current', 'date');
        const strip = dateNav.getBoundingClientRect();
        const box = link.getBoundingClientRect();
        if (box.left < strip.left || box.right > strip.right) {
          dateNav.scrollLeft += box.left - strip.left - (strip.width - box.width) / 2;
        }
      } else link.removeAttribute('aria-current');
    }
  }

  function barOffset() {
    const topbar = document.querySelector('.topbar');
    return (topbar?.offsetHeight || 0) + (bar?.offsetHeight || 0) + 12;
  }

  function goTo(key, smooth) {
    const section = document.getElementById('day-' + key);
    if (!section || section.hidden) return;
    markCurrent(key);
    const top = section.getBoundingClientRect().top + window.scrollY - barOffset();
    window.scrollTo({ top, behavior: smooth && !matchMedia('(prefers-reduced-motion: reduce)').matches ? 'smooth' : 'instant' });
  }

  dateNav?.addEventListener('click', (event) => {
    const link = event.target.closest('a[data-date]');
    if (!link) return;
    event.preventDefault();
    history.replaceState(null, '', location.search + '#day-' + link.dataset.date);
    goTo(link.dataset.date, true);
  });

  // Keep the strip in step with scrolling.
  let ticking = false;
  window.addEventListener('scroll', () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      const line = barOffset() + 24;
      let current = null;
      for (const day of days) {
        if (day.hidden) continue;
        if (day.getBoundingClientRect().top <= line) current = day.dataset.date;
      }
      const visible = days.filter((day) => !day.hidden);
      if (!current && visible.length) current = visible[0].dataset.date;
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 2 && visible.length) {
        current = visible[visible.length - 1].dataset.date;
      }
      if (current) markCurrent(current);
    });
  }, { passive: true });

  // Purpose filter
  const counts = new Map();
  for (const post of posts) for (const tag of tagsOf(post)) counts.set(tag, (counts.get(tag) || 0) + 1);
  const used = ORDER.filter((tag) => counts.has(tag));
  let active = new URLSearchParams(location.search).get('purpose');
  if (!counts.has(active)) active = null;
  if (filterBar) {
    filterBar.innerHTML = `<button type="button" data-filter="" aria-pressed="false">全部<span lang="en">All</span><span class="filter-count">${posts.length}</span></button>`
      + used.map((tag) => `<button type="button" data-filter="${tag}"${PRODUCT.has(tag) ? ' class="is-product"' : ''} aria-pressed="false">${PURPOSES[tag][0]}<span lang="en">${PURPOSES[tag][1]}</span><span class="filter-count">${counts.get(tag)}</span></button>`).join('');
  }

  function applyFilter() {
    let shown = 0;
    for (const post of posts) {
      const match = !active || tagsOf(post).includes(active);
      post.hidden = !match;
      if (match) shown += 1;
    }
    for (const day of days) {
      const n = day.querySelectorAll('.post:not([hidden])').length;
      day.hidden = n === 0;
      const count = day.querySelector('.day-count');
      if (count) count.textContent = n + ' 条';
      const link = dateNav?.querySelector(`a[data-date="${day.dataset.date}"]`);
      if (link) {
        link.hidden = n === 0;
        link.querySelector('.date-count').textContent = ' · ' + n + ' 条';
      }
    }
    for (const button of filterBar?.querySelectorAll('button') || []) {
      const pressed = (button.dataset.filter || null) === active;
      button.setAttribute('aria-pressed', String(pressed));
      if (pressed && filterBar.scrollWidth > filterBar.clientWidth) {
        filterBar.scrollLeft = button.offsetLeft - filterBar.offsetLeft - 8;
      }
    }
    if (status) {
      status.textContent = active
        ? `${PURPOSES[active][0]} ${PURPOSES[active][1]}：${shown} 条帖子`
        : `共 ${shown} 条帖子，${days.length} 天`;
    }
  }

  filterBar?.addEventListener('click', (event) => {
    const button = event.target.closest('button[data-filter]');
    if (!button) return;
    const next = button.dataset.filter || null;
    active = next === active ? null : next;
    const params = new URLSearchParams(location.search);
    if (active) params.set('purpose', active); else params.delete('purpose');
    const query = params.toString();
    history.replaceState(null, '', location.pathname + (query ? '?' + query : ''));
    applyFilter();
    const first = days.find((day) => !day.hidden && day.dataset.date >= today) || days.find((day) => !day.hidden);
    if (first) goTo(first.dataset.date, false);
  });

  applyFilter();

  // Initial position: the linked date, or the first date from today onward.
  const fromHash = location.hash.startsWith('#day-') ? location.hash.slice(5) : '';
  const start = keys.includes(fromHash) && !document.getElementById('day-' + fromHash).hidden
    ? fromHash
    : (days.find((day) => !day.hidden && day.dataset.date >= today) || days.filter((day) => !day.hidden).pop())?.dataset.date;
  if (start) {
    let moved = false;
    for (const type of ['pointerdown', 'wheel', 'touchstart', 'keydown']) {
      window.addEventListener(type, () => { moved = true; }, { once: true, passive: true });
    }
    const align = () => { if (!moved) goTo(start, false); };
    markCurrent(start);
    if (start !== keys[0]) {
      requestAnimationFrame(align);
      document.fonts?.ready.then(align);
      if (document.readyState !== 'complete') window.addEventListener('load', align, { once: true });
    }
  }
  window.addEventListener('hashchange', () => {
    if (location.hash.startsWith('#day-')) goTo(location.hash.slice(5), false);
  });

  // Platform switch, caption copy and gallery thumbnails
  document.addEventListener('click', async (event) => {
    const platform = event.target.closest('.post-platform-switch button[data-platform]');
    if (platform) {
      const post = platform.closest('.post');
      for (const button of post.querySelectorAll('.post-platform-switch button')) {
        button.setAttribute('aria-pressed', String(button === platform));
      }
      for (const caption of post.querySelectorAll('[data-feed-platform]')) {
        caption.hidden = caption.dataset.feedPlatform !== platform.dataset.platform;
      }
      return;
    }

    const copy = event.target.closest('.post-copy');
    if (copy) {
      const caption = copy.closest('.post').querySelector('[data-feed-platform]:not([hidden]) .feed-caption');
      try {
        await navigator.clipboard.writeText(caption.innerText);
        copy.textContent = '已复制';
      } catch {
        const range = document.createRange();
        range.selectNodeContents(caption);
        const selection = getSelection();
        selection.removeAllRanges();
        selection.addRange(range);
        copy.textContent = '已选中，按复制键';
      }
      clearTimeout(copy._reset);
      copy._reset = setTimeout(() => { copy.textContent = '复制配文'; }, 1800);
      return;
    }

    const thumb = event.target.closest('[data-feed-thumb]');
    if (thumb) {
      const post = thumb.closest('.post');
      const large = post.querySelector('.feed-large');
      const index = Number(thumb.dataset.feedThumb);
      const pictures = large.dataset.pages.split('|');
      const source = thumb.querySelector('img');
      const image = large.querySelector('img');
      const w = Number(source.getAttribute('width'));
      const h = Number(source.getAttribute('height'));
      image.setAttribute('width', w);
      image.setAttribute('height', h);
      large.style.setProperty('--feed-ratio', w / h);
      image.src = pictures[index];
      large.dataset.imageIndex = index;
      for (const other of post.querySelectorAll('[data-feed-thumb]')) {
        if (other === thumb) other.setAttribute('aria-current', 'true');
        else other.removeAttribute('aria-current');
      }
    }
  });
})();
