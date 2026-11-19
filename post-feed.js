(() => {
  const dates = document.querySelector('.feed-dates');
  const days = document.querySelector('.feed-days');
  if (dates && days) {
    const zone = 'Asia/Shanghai';
    const iso = new Intl.DateTimeFormat('sv-SE', { timeZone: zone });
    const monthDay = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', timeZone: zone });
    const now = Date.now();
    const today = iso.format(now);
    const tomorrow = iso.format(now + 86400000);
    const sortDates = (a, b) => {
      const [first, second] = [a.dataset.date, b.dataset.date];
      if (first >= today && second >= today) return first.localeCompare(second);
      if (first < today && second < today) return second.localeCompare(first);
      return first >= today ? -1 : 1;
    };
    const label = (key) => {
      const date = monthDay.format(new Date(key + 'T12:00:00+08:00'));
      if (key === today) return '今天 ' + date;
      if (key === tomorrow) return '明天 ' + date;
      return date;
    };
    for (const link of [...dates.children].sort(sortDates)) {
      link.textContent = label(link.dataset.date);
      dates.append(link);
    }
    for (const section of [...days.children].sort(sortDates)) {
      section.querySelector('h2').textContent = label(section.dataset.date);
      days.append(section);
    }
    function markDate() {
      const key = location.hash || dates.firstElementChild?.hash;
      for (const link of dates.children) {
        if (link.hash === key) link.setAttribute('aria-current', 'location');
        else link.removeAttribute('aria-current');
      }
    }
    markDate();
    window.addEventListener('hashchange', markDate);
  }

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
