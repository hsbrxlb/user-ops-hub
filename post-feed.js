(() => {
  const setImageRatio = (button, width, height) => {
    if (width > 0 && height > 0) button.style.setProperty('--feed-ratio', width / height);
  };
  for (const button of document.querySelectorAll('.feed-large')) {
    const image = button.querySelector('img');
    setImageRatio(button, Number(image.getAttribute('width')), Number(image.getAttribute('height')));
  }

  const calendar = document.querySelector('.feed-calendar');
  const picker = document.querySelector('#feed-date-select');
  const days = [...document.querySelectorAll('.feed-day')];
  if (calendar && picker && days.length) {
    const keys = days.map(day => day.dataset.date);
    const months = [...new Set(keys.map(key => key.slice(0, 7)))];
    const available = new Set(keys);
    const dateKey = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Shanghai' });
    const now = Date.parse(dateKey.format(Date.now()));
    const closest = keys.reduce((best, key) =>
      Math.abs(Date.parse(key) - now) < Math.abs(Date.parse(best) - now) ? key : best);
    let selected = closest;
    let month = months.indexOf(selected.slice(0, 7));

    function drawMonth() {
      const [year, number] = months[month].split('-').map(Number);
      const grid = calendar.querySelector('.feed-calendar-grid');
      calendar.querySelector('.feed-calendar-month').textContent = `${year}年${number}月`;
      calendar.querySelector('[data-month-step="-1"]').disabled = month === 0;
      calendar.querySelector('[data-month-step="1"]').disabled = month === months.length - 1;
      const cells = [];
      const offset = (new Date(Date.UTC(year, number - 1, 1)).getUTCDay() + 6) % 7;
      for (let i = 0; i < offset; i++) cells.push('<span aria-hidden="true"></span>');
      const count = new Date(Date.UTC(year, number, 0)).getUTCDate();
      for (let date = 1; date <= count; date++) {
        const key = months[month] + '-' + String(date).padStart(2, '0');
        if (!available.has(key)) {
          cells.push(`<span aria-hidden="true">${date}</span>`);
          continue;
        }
        const label = picker.querySelector(`option[value="${key}"]`).textContent;
        const current = key === selected ? ' aria-current="date"' : '';
        cells.push(`<a href="#day-${key}" data-date="${key}" aria-label="${label}"${current}>${date}</a>`);
      }
      grid.innerHTML = cells.join('');
    }

    function select(key) {
      selected = key;
      month = months.indexOf(key.slice(0, 7));
      picker.value = key;
      drawMonth();
    }

    function go(key, align) {
      if (!available.has(key)) return;
      select(key);
      if (align) document.getElementById('day-' + key).scrollIntoView({ block: 'start', behavior: 'instant' });
    }

    calendar.addEventListener('click', (event) => {
      const arrow = event.target.closest('[data-month-step]');
      if (!arrow || arrow.disabled) return;
      month += Number(arrow.dataset.monthStep);
      drawMonth();
    });
    picker.addEventListener('change', () => {
      const key = picker.value;
      history.replaceState(null, '', '#day-' + key);
      go(key, true);
    });
    window.addEventListener('hashchange', () => go(location.hash.slice(5), true));
    const initial = location.hash.slice(5);
    go(available.has(initial) ? initial : closest, false);
    let manualNavigation = false;
    for (const type of ['pointerdown', 'wheel', 'touchstart', 'keydown', 'hashchange']) {
      window.addEventListener(type, () => { manualNavigation = true; }, { once: true, passive: true });
    }
    const alignInitialDate = () => {
      if (!manualNavigation) requestAnimationFrame(() => {
        if (!manualNavigation) go(selected, true);
      });
    };
    alignInitialDate();
    document.fonts?.ready.then(alignInitialDate);
    if (document.readyState !== 'complete') window.addEventListener('load', alignInitialDate, { once: true });
  }

  const updateImage = (entry, position) => {
    const large = entry.querySelector('.feed-large');
    const pictures = large.dataset.pages.split('|');
    const index = (position + pictures.length) % pictures.length;
    large.dataset.imageIndex = index;
    const image = large.querySelector('img');
    const thumbs = [...entry.querySelectorAll('[data-feed-thumb]')];
    const dimensions = thumbs[index].querySelector('img');
    image.width = Number(dimensions.getAttribute('width'));
    image.height = Number(dimensions.getAttribute('height'));
    setImageRatio(large, Number(image.getAttribute('width')), Number(image.getAttribute('height')));
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
