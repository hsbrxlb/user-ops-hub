(() => {
  const brands = document.querySelectorAll('.cg-brand');

  function filterWorks(brand, tag) {
    let visible = 0;
    for (const story of brand.querySelectorAll('.cg-story')) {
      story.hidden = tag !== 'all' && !story.dataset.tags.split(' ').includes(tag);
      if (!story.hidden) visible += 1;
    }
    for (const button of brand.querySelectorAll('.cg-filter button')) {
      button.setAttribute('aria-pressed', String(button.dataset.filter === tag));
    }
    brand.querySelector('.cg-filter-count').textContent = `显示 ${visible} 组作品`;
  }

  for (const brand of brands) {
    brand.querySelector('.cg-filter').addEventListener('click', (event) => {
      const selected = event.target.closest('button[data-filter]');
      if (selected) filterWorks(brand, selected.dataset.filter);
    });
  }

  function openLinkedWork() {
    const target = document.getElementById(location.hash.slice(1));
    if (!target?.matches('.cg-story')) return;

    if (target.hidden) filterWorks(target.closest('.cg-brand'), 'all');
    target.scrollIntoView({ block: 'start', behavior: 'instant' });
    target.focus({ preventScroll: true });
  }

  window.addEventListener('hashchange', openLinkedWork);
  openLinkedWork();
})();
