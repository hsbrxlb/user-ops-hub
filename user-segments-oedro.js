// 图表悬停与键盘聚焦时显示占比。
(() => {
  const tip = document.querySelector('.seg-tip');
  const root = document.querySelector('.segments');
  if (!tip || !root) return;
  const place = (x, y) => {
    const width = tip.offsetWidth;
    const height = tip.offsetHeight;
    tip.style.left = `${Math.max(8, Math.min(x + 14, window.innerWidth - width - 8))}px`;
    tip.style.top = `${Math.max(8, y - height - 12)}px`;
  };
  const show = (target, x, y) => {
    tip.textContent = target.dataset.tip;
    tip.hidden = false;
    place(x, y);
  };
  const hide = () => { tip.hidden = true; };
  root.addEventListener('pointermove', (event) => {
    const target = event.target.closest('[data-tip]');
    if (!target) return hide();
    show(target, event.clientX, event.clientY);
  });
  root.addEventListener('pointerleave', hide);
  root.addEventListener('focusin', (event) => {
    const target = event.target.closest('[data-tip]');
    if (!target) return;
    const box = target.getBoundingClientRect();
    show(target, box.left + Math.min(box.width / 2, 120), box.top);
  });
  root.addEventListener('focusout', hide);
  window.addEventListener('scroll', hide, { passive: true });
})();
