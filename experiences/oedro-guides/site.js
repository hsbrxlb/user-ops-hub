document.documentElement.classList.add('js');

// Mobile menu
const menu = document.querySelector('.menu-toggle');
const navigation = document.querySelector('.main-nav');
if (menu && navigation) {
  const setOpen = open => {
    menu.setAttribute('aria-expanded', String(open));
    menu.setAttribute('aria-label', open ? 'Close menu' : 'Open menu');
    navigation.classList.toggle('is-open', open);
  };
  menu.addEventListener('click', () => setOpen(menu.getAttribute('aria-expanded') !== 'true'));
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape' && menu.getAttribute('aria-expanded') === 'true') { setOpen(false); menu.focus(); }
  });
  document.addEventListener('click', event => { if (!event.target.closest('.site-header')) setOpen(false); });
  matchMedia('(min-width: 900px)').addEventListener('change', () => setOpen(false));
}

// Guides and FAQ filtering
const root = document.querySelector('[data-filter-root]');
if (root) {
  const kind = root.dataset.filterKind;
  const input = root.querySelector('[data-search-input]');
  const buttons = [...root.querySelectorAll('[data-filter]')];
  const items = [...root.querySelectorAll('[data-filter-item]')];
  const groups = [...root.querySelectorAll('[data-group]')];
  const groupLinks = [...root.querySelectorAll('[data-group-link]')];
  const status = root.querySelector('[data-filter-status]');
  const empty = root.querySelector('[data-empty-state]');
  const headerSearch = document.querySelector('#site-search');
  const params = new URLSearchParams(location.search);
  const topics = buttons.map(button => button.dataset.filter);
  let category = topics.includes(params.get('topic')) ? params.get('topic') : 'all';
  input.value = params.get('q') || '';
  if (headerSearch && kind === 'guides') headerSearch.value = input.value;

  const apply = (updateURL = true) => {
    const terms = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
    let visible = 0;
    items.forEach(item => {
      const inTopic = category === 'all' || !item.dataset.category || item.dataset.category === category;
      const match = inTopic && terms.every(term => item.dataset.search.includes(term));
      item.hidden = !match;
      if (match) visible += 1;
    });
    groups.forEach(group => { group.hidden = ![...group.querySelectorAll('[data-filter-item]')].some(item => !item.hidden); });
    groupLinks.forEach(link => {
      const group = groups.find(g => g.dataset.group === link.dataset.groupLink);
      link.parentElement.hidden = Boolean(group?.hidden);
    });
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.filter === category)));
    empty.hidden = visible > 0;
    document.querySelectorAll('[data-editorial-feature]').forEach(feature => { feature.hidden = terms.length > 0 || category !== 'all'; });
    status.textContent = visible ? `${visible} ${kind} shown.` : `No matching ${kind}.`;
    if (updateURL) {
      const url = new URL(location.href);
      category === 'all' ? url.searchParams.delete('topic') : url.searchParams.set('topic', category);
      terms.length ? url.searchParams.set('q', input.value.trim()) : url.searchParams.delete('q');
      url.hash = '';
      history.replaceState(null, '', url);
    }
  };
  input.addEventListener('input', () => apply());
  buttons.forEach(button => button.addEventListener('click', () => { category = button.dataset.filter; apply(); }));
  root.querySelector('[data-reset-filters]')?.addEventListener('click', () => { category = 'all'; input.value = ''; apply(); input.focus(); });
  apply(false);
  if (kind === 'guides' && (input.value || category !== 'all')) root.scrollIntoView({ block: 'start' });

  // FAQ: older links use ?topic=Category; open #question links directly.
  if (kind === 'questions') {
    const legacy = params.get('topic');
    const target = legacy && groups.find(group => group.dataset.group === legacy);
    if (target) requestAnimationFrame(() => target.scrollIntoView({ block: 'start' }));
    const openHashQuestion = () => {
      let id;
      try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
      const question = id && document.getElementById(id);
      if (question?.matches('.faq-item')) {
        input.value = ''; apply(false); question.open = true;
        requestAnimationFrame(() => question.scrollIntoView({ block: 'start' }));
      }
    };
    openHashQuestion();
    window.addEventListener('hashchange', openHashQuestion);
    if ('IntersectionObserver' in window && groupLinks.length) {
      const observer = new IntersectionObserver(entries => {
        const top = entries.filter(entry => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (top) groupLinks.forEach(link => link.dataset.groupLink === top.target.dataset.group ? link.setAttribute('aria-current', 'true') : link.removeAttribute('aria-current'));
      }, { rootMargin: '-10% 0px -70% 0px' });
      groups.forEach(group => observer.observe(group));
    }
  }
}

// Article contents: highlight the section being read.
const tocLinks = [...document.querySelectorAll('.toc a[href^="#"]')];
const headings = tocLinks.map(link => document.getElementById(decodeURIComponent(link.hash.slice(1)))).filter(Boolean);
if (headings.length) {
  let ticking = false;
  const update = () => {
    ticking = false;
    const line = innerHeight * 0.3;
    let current = null;
    headings.forEach(heading => { if (heading.getBoundingClientRect().top <= line) current = heading; });
    tocLinks.forEach(link => {
      current && decodeURIComponent(link.hash.slice(1)) === current.id ? link.setAttribute('aria-current', 'location') : link.removeAttribute('aria-current');
    });
  };
  addEventListener('scroll', () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } }, { passive: true });
  update();
}
document.querySelector('.toc-mobile')?.addEventListener('click', event => {
  if (event.target.closest('a')) event.currentTarget.open = false;
});
