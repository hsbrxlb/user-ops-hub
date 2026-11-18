// 漫画画廊：保留静态正文、类型筛选、多页灯箱。
(() => {
  const lightbox = () => document.querySelector('.cg-lightbox');
  let pages = [];
  let index = 0;
  let opener = null;

  const show = () => {
    const box = lightbox();
    let img = box.querySelector('img');
    if (!img) {
      img = document.createElement('img');
      box.querySelector('.cg-lb-stage').insertBefore(img, box.querySelector('.cg-lb-next'));
    }
    img.src = pages[index];
    img.alt = `${box.dataset.title}，第 ${index + 1} 页，共 ${pages.length} 页`;
    box.querySelector('.cg-lb-count').textContent = pages.length > 1 ? `${index + 1} / ${pages.length}` : '';
    box.querySelector('.cg-lb-prev').hidden = pages.length < 2 || index === 0;
    box.querySelector('.cg-lb-next').hidden = pages.length < 2 || index === pages.length - 1;
    if (index + 1 < pages.length) new Image().src = pages[index + 1];
  };

  const open = (button) => {
    const box = lightbox();
    if (!box) return;
    opener = button;
    pages = button.dataset.pages.split('|');
    index = 0;
    box.dataset.title = button.dataset.title;
    box.querySelector('.cg-lb-title').textContent = button.dataset.title;
    box.querySelector('.cg-lb-meta').textContent = button.dataset.meta || '';
    show();
    box.showModal();
    box.querySelector(pages.length > 1 ? '.cg-lb-next' : '.cg-lb-close').focus();
  };

  const step = (delta) => {
    const next = index + delta;
    if (next < 0 || next >= pages.length) return;
    index = next;
    show();
    const box = lightbox();
    const target = box.querySelector(delta > 0 ? '.cg-lb-next' : '.cg-lb-prev');
    (target.hidden ? box.querySelector(delta > 0 ? '.cg-lb-prev' : '.cg-lb-next') : target).focus();
  };

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
    const openButton = event.target.closest('.cg-open');
    if (openButton) return open(openButton);
    const filterButton = event.target.closest('.cg-filter button');
    if (filterButton) return filter(filterButton.dataset.filter, filterButton);
    const box = event.target.closest('.cg-lightbox');
    if (!box) return;
    if (event.target.closest('.cg-lb-close')) return box.close();
    if (event.target.closest('.cg-lb-prev')) return step(-1);
    if (event.target.closest('.cg-lb-next')) return step(1);
    if (event.target === box || event.target.classList.contains('cg-lb-stage')) box.close();
  });

  document.addEventListener('keydown', (event) => {
    const box = lightbox();
    if (!box || !box.open) return;
    if (event.key === 'ArrowRight') { event.preventDefault(); step(1); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); step(-1); }
  });

  document.addEventListener('close', (event) => {
    if (event.target.classList?.contains('cg-lightbox') && opener) opener.focus();
  }, true);
})();
