(() => {
  const labels = {"dialog": "图片查看器", "close": "关闭", "previous": "上一张", "next": "下一张", "fit": "适应窗口", "original": "查看原图", "download": "保存图片", "unavailable": "图片暂时无法显示", "open": "查看大图"};
  const selector = 'main img, [data-page="product-library"] img';
  const excluded = 'nav, .topbar, [data-no-zoom], .masthead, .site-logo, .brand-logo';
  const frameSelector = 'iframe.email-frame, iframe.newsletter-frame';
  const originalLink = /\.(?:avif|gif|jpe?g|png|svg|webp)$/i;
  const rendered = new WeakMap();
  const seenFrames = new WeakMap();
  const triggers = '.hub-image-trigger, [data-pages]';
  const scriptURL = document.currentScript.src;
  let viewer, stage, image, error, counter, thumbnailBar, controls, opener, items, index, scroll, scrollLock;

  function button(className, label, icon) {
    const control = document.createElement('button');
    control.type = 'button';
    control.className = className;
    control.setAttribute('aria-label', label);
    if (icon) {
      control.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + icon + '</svg>';
    }
    return control;
  }

  function mount() {
    viewer = document.createElement('dialog');
    viewer.className = 'hub-image-viewer';
    viewer.setAttribute('aria-label', labels.dialog);

    stage = document.createElement('div');
    stage.className = 'hub-image-stage';
    image = document.createElement('img');
    image.decoding = 'async';
    const zoom = button('hub-image-zoom', labels.original);
    zoom.setAttribute('aria-pressed', 'false');
    zoom.append(image);
    zoom.addEventListener('click', toggleZoom);
    error = document.createElement('p');
    error.className = 'hub-image-error';
    error.setAttribute('role', 'status');
    error.textContent = labels.unavailable;
    error.hidden = true;
    stage.append(zoom, error);

    const top = document.createElement('div');
    top.className = 'hub-image-top';
    const close = button('hub-image-close', labels.close, '<path d="m6 6 12 12M18 6 6 18"/>');
    close.addEventListener('click', () => viewer.close());
    top.append(close);

    const previous = button('hub-image-previous', labels.previous, '<path d="m15 5-7 7 7 7"/>');
    const next = button('hub-image-next', labels.next, '<path d="m9 5 7 7-7 7"/>');
    previous.addEventListener('click', () => select((index + items.length - 1) % items.length));
    next.addEventListener('click', () => select((index + 1) % items.length));
    counter = document.createElement('output');
    counter.className = 'hub-image-count';
    counter.setAttribute('aria-live', 'polite');
    const navigation = document.createElement('div');
    navigation.className = 'hub-image-navigation';
    navigation.append(previous, counter, next);
    thumbnailBar = document.createElement('div');
    thumbnailBar.className = 'hub-image-thumbnails';
    const footer = document.createElement('div');
    footer.className = 'hub-image-footer';
    footer.append(navigation, thumbnailBar);
    viewer.append(top, stage, footer);
    controls = { close, zoom, footer };

    viewer.addEventListener('click', (event) => {
      if (event.target === viewer || event.target === stage || event.target === top || event.target === footer) viewer.close();
    });
    viewer.addEventListener('keydown', (event) => {
      if (items.length < 2) return;
      const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      if (!delta) return;
      event.preventDefault();
      select((index + delta + items.length) % items.length);
    });
    viewer.addEventListener('close', () => {
      document.documentElement.style.overflow = scrollLock;
      if (opener?.isConnected) opener.focus({ preventScroll: true });
      window.scrollTo({ left: scroll.x, top: scroll.y, behavior: 'instant' });
      opener = null;
      image.removeAttribute('src');
      thumbnailBar.replaceChildren();
    });
    image.addEventListener('error', () => {
      error.hidden = false;
      zoom.hidden = true;
    });
    document.body.append(viewer);
  }

  function resetZoom() {
    stage.classList.remove('is-original');
    controls.zoom.setAttribute('aria-label', labels.original);
    controls.zoom.setAttribute('aria-pressed', 'false');
    stage.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }

  function toggleZoom(event) {
    const box = event.currentTarget.getBoundingClientRect();
    const original = stage.classList.toggle('is-original');
    controls.zoom.setAttribute('aria-label', original ? labels.fit : labels.original);
    controls.zoom.setAttribute('aria-pressed', String(original));
    if (!original) resetZoom();
    else if (event.detail) {
      stage.scrollTo({
        left: Math.max(0, (event.clientX - box.left) / box.width * image.naturalWidth - stage.clientWidth / 2),
        top: Math.max(0, (event.clientY - box.top) / box.height * image.naturalHeight - stage.clientHeight / 2),
        behavior: 'instant'
      });
    }
  }

  function select(position) {
    index = position;
    resetZoom();
    const current = items[index];
    error.hidden = true;
    controls.zoom.hidden = false;
    image.alt = current.alt;
    image.src = current.src;
    counter.textContent = (index + 1) + ' / ' + items.length;
    for (const [i, thumb] of Array.from(thumbnailBar.children).entries()) {
      if (i === index) {
        thumb.setAttribute('aria-current', 'true');
        const strip = thumbnailBar.getBoundingClientRect();
        const bounds = thumb.getBoundingClientRect();
        if (bounds.left < strip.left) thumbnailBar.scrollLeft += bounds.left - strip.left;
        if (bounds.right > strip.right) thumbnailBar.scrollLeft += bounds.right - strip.right;
      } else thumb.removeAttribute('aria-current');
    }
  }

  function open(trigger) {
    let data = rendered.get(trigger);
    if (!data && trigger.dataset.pages) {
      const picture = trigger.querySelector('img');
      data = {
        items: trigger.dataset.pages.split('|').filter(Boolean).map((src, i) => ({
          src, alt: i === 0 ? picture?.alt || '' : trigger.dataset.title || picture?.alt || ''
        })),
        position: Number(trigger.dataset.imageIndex) || 0
      };
    }
    if (!data?.items.length) return;
    if (!viewer) mount();
    if (viewer.open) return;
    opener = trigger;
    items = data.items;
    scroll = { x: window.scrollX, y: window.scrollY };
    scrollLock = document.documentElement.style.overflow;
    document.documentElement.style.overflow = 'hidden';
    controls.footer.hidden = items.length === 1;
    thumbnailBar.replaceChildren(...(items.length === 1 ? [] : items.map((item, i) => {
      const thumb = button('hub-image-thumbnail', (i + 1) + ' / ' + items.length);
      const preview = document.createElement('img');
      preview.src = item.src;
      preview.alt = '';
      thumb.append(preview);
      thumb.addEventListener('click', () => select(i));
      return thumb;
    })));
    viewer.showModal();
    controls.close.focus({ preventScroll: true });
    select(data.position);
  }

  function source(img) {
    const anchor = img.closest('a[href]');
    const src = img.dataset.fullImage ||
      (anchor && originalLink.test(new URL(anchor.href).pathname) ? anchor.href : img.src || img.currentSrc);
    return { src, alt: img.alt };
  }

  function decorate(img, inFrame = false) {
    if (!img.getAttribute('src') || img.closest(excluded) || img.closest(triggers)) return;
    if (inFrame && !img.classList.contains('email-image') && (!img.alt || Number(img.width) < 160)) return;
    const anchor = img.closest('a[href]');
    const host = img.closest('picture') || img;
    if (!host.parentNode) return;
    const target = source(img);
    const group = img.closest('[data-image-group], .evo-gallery, .media-strip');
    const siblings = group ? [...group.querySelectorAll('img')].filter((candidate) => !candidate.closest(excluded)) : [img];
    const data = { items: siblings.map(source), position: siblings.indexOf(img) };
    let trigger;
    if (anchor && !anchor.hasAttribute('download') && originalLink.test(new URL(anchor.href).pathname) && !anchor.textContent.trim()) {
      trigger = anchor;
      trigger.setAttribute('role', 'button');
      if (!trigger.getAttribute('aria-label')) trigger.setAttribute('aria-label', [labels.open, target.alt].filter(Boolean).join(' · '));
    } else {
      const markup = button('hub-image-trigger', [labels.open, target.alt].filter(Boolean).join(' · '));
      trigger = inFrame ? img.ownerDocument.adoptNode(markup) : markup;
      if (anchor) {
        if (!anchor.classList.contains('hub-image-linked')) {
          const wrap = anchor.ownerDocument.createElement('span');
          wrap.className = 'hub-image-linked';
          anchor.replaceWith(wrap);
          wrap.append(anchor);
        }
        trigger.classList.add('hub-image-aux');
        trigger.innerHTML = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="10" cy="10" r="5.5"/><path d="m14 14 5 5M7 10h6m-3-3v6"/></svg>';
        anchor.parentElement.append(trigger);
        img.dataset.hubImageTarget = 'true';
        img.addEventListener('click', (event) => {
          event.preventDefault();
          open(trigger);
        });
      } else {
        host.replaceWith(trigger);
        trigger.append(host);
      }
    }
    trigger.classList.add('hub-image-trigger');
    rendered.set(trigger, data);
  }

  function activate(event) {
    const trigger = event.target.closest?.(triggers);
    if (!trigger || !rendered.has(trigger) && !trigger.dataset.pages) return;
    if (event.type === 'keydown' && (event.key !== ' ' || trigger.tagName !== 'A')) return;
    event.preventDefault();
    open(trigger);
  }

  function decorateFrame(frame) {
    const ready = () => {
      try {
        const doc = frame.contentDocument;
        if (!doc?.body || seenFrames.get(frame) === doc) return;
        seenFrames.set(frame, doc);
        const style = doc.createElement('link');
        style.rel = 'stylesheet';
        style.href = new URL('image-viewer.css?v=hub15', scriptURL);
        doc.head.append(style);
        doc.querySelectorAll('img').forEach((img) => decorate(img, true));
        doc.addEventListener('click', activate);
        doc.addEventListener('keydown', activate);
      } catch (exception) {
        if (exception.name !== 'SecurityError') throw exception;
      }
    };
    frame.addEventListener('load', ready);
    ready();
  }

  const frames = new WeakSet();
  const scan = () => {
    document.querySelectorAll(selector).forEach((img) => decorate(img));
    for (const frame of document.querySelectorAll(frameSelector)) {
      if (frames.has(frame)) continue;
      frames.add(frame);
      decorateFrame(frame);
    }
  };

  document.addEventListener('click', activate);
  document.addEventListener('keydown', activate);
  scan();
  new MutationObserver(scan).observe(document.body, { childList: true, subtree: true });
})();
