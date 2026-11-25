(() => {
  const labels = {"dialog": "图片查看器", "close": "关闭", "previous": "上一张", "next": "下一张", "fit": "适应窗口", "original": "查看原图", "download": "保存图片", "unavailable": "图片暂时无法显示", "open": "查看大图"};
  const selector = 'main img, [data-page="product-library"] img';
  const excluded = 'nav, .topbar, [data-no-zoom], .masthead, .site-logo, .brand-logo';
  const frameSelector = 'iframe.email-frame, iframe.newsletter-frame';
  const originalLink = /\.(?:avif|gif|jpe?g|png|svg|webp)$/i;
  const rendered = new WeakMap();
  const decorated = new WeakSet();
  const seenFrames = new WeakMap();
  const triggers = '.hub-image-trigger, [data-pages]';
  const scriptURL = document.currentScript.src;
  let viewer, stage, image, error, counter, caption, thumbnailBar, controls, opener, items, index, scroll, scrollLock;
  let swiped = false;

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

    const top = document.createElement('div');
    top.className = 'hub-image-top';
    caption = document.createElement('p');
    caption.className = 'hub-image-caption';
    counter = document.createElement('output');
    counter.className = 'hub-image-count';
    counter.setAttribute('aria-live', 'polite');
    const close = button('hub-image-close', labels.close, '<path d="M6 6l12 12M18 6 6 18"/>');
    close.addEventListener('click', () => shut());
    top.append(caption, counter, close);

    stage = document.createElement('div');
    stage.className = 'hub-image-stage';
    image = document.createElement('img');
    image.decoding = 'async';
    image.draggable = false;
    const zoom = button('hub-image-zoom', labels.original);
    zoom.setAttribute('aria-pressed', 'false');
    zoom.append(image);
    zoom.addEventListener('click', (event) => { if (!swiped) toggleZoom(event); });
    error = document.createElement('p');
    error.className = 'hub-image-error';
    error.setAttribute('role', 'status');
    error.textContent = labels.unavailable;
    error.hidden = true;
    stage.append(zoom, error);

    const previous = button('hub-image-previous', labels.previous, '<path d="m15 5-7 7 7 7"/>');
    const next = button('hub-image-next', labels.next, '<path d="m9 5 7 7-7 7"/>');
    previous.addEventListener('click', () => step(-1));
    next.addEventListener('click', () => step(1));

    thumbnailBar = document.createElement('div');
    thumbnailBar.className = 'hub-image-thumbnails';
    const footer = document.createElement('div');
    footer.className = 'hub-image-footer';
    footer.append(thumbnailBar);
    viewer.append(top, stage, previous, next, footer);
    controls = { close, zoom, footer, previous, next };

    viewer.addEventListener('click', (event) => {
      if (swiped) return;
      if (event.target === viewer || event.target === stage || event.target === top || event.target === footer) shut();
    });
    viewer.addEventListener('keydown', (event) => {
      if (items.length < 2) return;
      const delta = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
      if (!delta) return;
      event.preventDefault();
      step(delta);
    });
    viewer.addEventListener('cancel', (event) => { event.preventDefault(); shut(); });
    viewer.addEventListener('close', () => {
      viewer.classList.remove('is-open', 'is-closing');
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

    // Touch: swipe sideways for the next picture, drag down to close.
    let start = null;
    stage.addEventListener('pointerdown', (event) => {
      if (event.pointerType === 'mouse' || stage.classList.contains('is-original')) return;
      start = { x: event.clientX, y: event.clientY, id: event.pointerId };
      swiped = false;
    });
    stage.addEventListener('pointermove', (event) => {
      if (!start || event.pointerId !== start.id) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      if (!swiped && Math.hypot(dx, dy) > 10) swiped = true;
      if (!swiped) return;
      const down = Math.max(0, dy);
      const sideways = Math.abs(dx) > Math.abs(dy) && items.length > 1;
      viewer.style.setProperty('--drag-x', (sideways ? dx : 0) + 'px');
      viewer.style.setProperty('--drag-y', (sideways ? 0 : down) + 'px');
      viewer.style.setProperty('--drag-fade', sideways ? 1 : Math.max(.35, 1 - down / 420));
      viewer.classList.add('is-dragging');
    });
    const release = (event) => {
      if (!start || event.pointerId !== start.id) return;
      const dx = event.clientX - start.x;
      const dy = event.clientY - start.y;
      start = null;
      viewer.classList.remove('is-dragging');
      viewer.style.setProperty('--drag-x', '0px');
      viewer.style.setProperty('--drag-y', '0px');
      viewer.style.setProperty('--drag-fade', 1);
      if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 60 && items.length > 1) step(dx < 0 ? 1 : -1);
      else if (dy > 90 && dy > Math.abs(dx)) shut();
      setTimeout(() => { swiped = false; }, 0);
    };
    stage.addEventListener('pointerup', release);
    stage.addEventListener('pointercancel', release);
    document.body.append(viewer);
  }

  function shut() {
    if (!viewer?.open || viewer.classList.contains('is-closing')) return;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { viewer.close(); return; }
    viewer.classList.add('is-closing');
    setTimeout(() => viewer.close(), 200);
  }

  function step(delta) {
    select((index + delta + items.length) % items.length);
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
    caption.textContent = current.alt || '';
    counter.textContent = items.length > 1 ? (index + 1) + ' / ' + items.length : '';
    stage.classList.remove('is-entering');
    void stage.offsetWidth;
    stage.classList.add('is-entering');
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
          src, alt: i === 0 ? picture?.alt || trigger.dataset.title || '' : trigger.dataset.title || picture?.alt || ''
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
    const single = items.length === 1;
    controls.footer.hidden = single;
    controls.previous.hidden = single;
    controls.next.hidden = single;
    thumbnailBar.replaceChildren(...(single ? [] : items.map((item, i) => {
      const thumb = button('hub-image-thumbnail', (i + 1) + ' / ' + items.length);
      const preview = document.createElement('img');
      preview.src = item.src;
      preview.alt = '';
      thumb.append(preview);
      thumb.addEventListener('click', () => select(i));
      return thumb;
    })));
    viewer.showModal();
    requestAnimationFrame(() => viewer.classList.add('is-open'));
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
    if (decorated.has(img) || !img.getAttribute('src') || img.closest(excluded) || img.closest(triggers)) return;
    if (inFrame && !img.classList.contains('email-image') && (!img.alt || Number(img.width) < 160)) return;
    const anchor = img.closest('a[href]');
    const host = img.closest('picture') || img;
    if (!host.parentNode) return;
    decorated.add(img);
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
        if (!anchor.parentElement.classList.contains('hub-image-linked')) {
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
        style.href = new URL('image-viewer.css?v=hub27', scriptURL);
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
