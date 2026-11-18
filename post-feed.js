(() => {
  const updateImage = (entry, position) => {
    const large = entry.querySelector('.feed-large');
    const pictures = large.dataset.pages.split('|');
    const index = (position + pictures.length) % pictures.length;
    large.dataset.imageIndex = index;
    const image = large.querySelector('img');
    const thumbs = [...entry.querySelectorAll('[data-feed-thumb]')];
    const dimensions = thumbs[index].querySelector('img');
    image.width = dimensions.width;
    image.height = dimensions.height;
    image.src = pictures[index];
    for (const [i, thumb] of thumbs.entries()) {
      if (i === index) thumb.setAttribute('aria-current', 'true');
      else thumb.removeAttribute('aria-current');
    }
    entry.querySelector('.feed-count').value = (index + 1) + ' / ' + pictures.length;
  };

  document.addEventListener('change', (event) => {
    const entry = event.target.closest('.feed-entry');
    if (!entry || event.target.tagName !== 'SELECT') return;
    for (const caption of entry.querySelectorAll('[data-feed-platform]')) {
      caption.hidden = caption.dataset.feedPlatform !== event.target.value;
    }
  });

  document.addEventListener('click', (event) => {
    const button = event.target.closest('.feed-prev, .feed-next, [data-feed-thumb]');
    if (!button) return;
    const entry = button.closest('.feed-entry');
    const current = Number(entry.querySelector('.feed-large').dataset.imageIndex || 0);
    const position = button.hasAttribute('data-feed-thumb')
      ? Number(button.dataset.feedThumb)
      : current + (button.classList.contains('feed-prev') ? -1 : 1);
    updateImage(entry, position);
  });
})();
