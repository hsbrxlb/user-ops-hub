(() => {
  const compact = matchMedia('(max-width: 640px)');
  for (const card of document.querySelectorAll('.email-review')) {
    const shell = card.querySelector('.email-preview-shell');
    const frame = card.querySelector('.email-frame');
    const controls = [...card.querySelectorAll('[data-email-width]')];
    let selected = compact.matches ? 'mobile' : 'desktop';

    const resize = () => {
      const width = selected === 'mobile' ? 390 : 760;
      const scale = Math.min(1, shell.clientWidth / width);
      if (!scale) return;
      const innerHeight = Math.round(Math.min(window.innerHeight * .6, 620) / scale);
      frame.style.width = width + 'px';
      frame.style.height = innerHeight + 'px';
      frame.style.transform = 'scale(' + scale + ')';
      shell.style.height = Math.round(innerHeight * scale) + 'px';
      for (const button of controls) button.setAttribute('aria-pressed', String(button.dataset.emailWidth === selected));
    };
    for (const button of controls) {
      button.addEventListener('click', () => {
        selected = button.dataset.emailWidth;
        resize();
      });
    }
    new ResizeObserver(resize).observe(shell);
    resize();
  }
})();
