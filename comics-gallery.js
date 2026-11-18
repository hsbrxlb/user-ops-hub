(() => {
  const filters = document.querySelector('.cg-filter');
  if (!filters) return;
  filters.addEventListener('click', (event) => {
    const control = event.target.closest('button[data-filter]');
    if (!control) return;
    const type = control.dataset.filter;
    for (const button of filters.querySelectorAll('button')) {
      button.setAttribute('aria-pressed', String(button === control));
    }
    for (const group of document.querySelectorAll('.cg-brand')) {
      let visible = false;
      for (const story of group.querySelectorAll('.cg-story')) {
        story.hidden = type !== 'all' && story.dataset.type !== type;
        if (!story.hidden) visible = true;
      }
      group.hidden = !visible;
    }
  });
})();
