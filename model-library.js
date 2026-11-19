(() => {
  const viewer = document.querySelector('dialog.viewer');
  if (!viewer || typeof viewer.showModal !== 'function') return;
  const image = viewer.querySelector('.selected');
  const caption = viewer.querySelector('figcaption');
  const previous = viewer.querySelector('.back');
  const next = viewer.querySelector('.forward');
  const close = viewer.querySelector('.dismiss');
  let group = [];
  let index = 0;
  let opener;

  function show(i) {
    if (i < 0 || i >= group.length) return;
    index = i;
    const source = group[index];
    const alt = source.querySelector('img').alt;
    image.src = source.href;
    image.alt = alt;
    caption.textContent = alt;
    previous.disabled = index === 0;
    next.disabled = index === group.length - 1;
  }

  document.addEventListener('click', (event) => {
    const link = event.target.closest('a.image-view');
    if (!link || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    opener = link;
    group = Array.from(link.closest('[data-gallery]').querySelectorAll('a.image-view'));
    show(group.indexOf(link));
    viewer.showModal();
    close.focus({preventScroll:true});
  });
  previous.addEventListener('click', () => show(index - 1));
  next.addEventListener('click', () => show(index + 1));
  close.addEventListener('click', () => viewer.close());
  viewer.addEventListener('click', (event) => { if (event.target === viewer) viewer.close(); });
  viewer.addEventListener('close', () => { if (opener) opener.focus({preventScroll:true}); });
  viewer.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      event.preventDefault();
      show(index + (event.key === 'ArrowLeft' ? -1 : 1));
    }
  });
})();
