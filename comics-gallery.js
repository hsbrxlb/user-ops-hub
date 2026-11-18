(() => {
  const filter = (type, button) => {
    const group = button.closest('.cg-filter');
    group.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === button)));
    document.querySelectorAll('.cg-works .cg-piece').forEach((piece) => {
      piece.hidden = type !== 'all' && piece.dataset.type !== type;
    });
    document.querySelectorAll('.cg-set').forEach((set) => {
      const visible = set.querySelector('.cg-piece:not([hidden])');
      set.querySelector('.cg-empty').hidden = Boolean(visible);
    });
  };

  document.addEventListener('click', (event) => {
    const filterButton = event.target.closest('.cg-filter button');
    if (filterButton) filter(filterButton.dataset.filter, filterButton);
  });
})();
