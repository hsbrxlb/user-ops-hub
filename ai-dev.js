// AI 开发成果：嵌入演示、问卷回放、Discord 对话回放、检查清单回放。
(function () {
  'use strict';
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, reduce ? 0 : ms));
  const esc = (value) => String(value).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const readJson = (root) => {
    const node = root.querySelector('script[type="application/json"]');
    try { return node ? JSON.parse(node.textContent) : null; } catch (error) { return null; }
  };

  // 嵌入页面：选页面、切电脑／手机宽度、点击后才加载外部演示
  document.querySelectorAll('[data-frame]').forEach((frame) => {
    const iframe = frame.querySelector('iframe');
    const open = frame.querySelector('[data-open]');
    const setSrc = (src) => {
      if (!iframe || !src) return;
      iframe.src = src;
      if (open) open.href = src.replace(/([?&])embed=1&?/, '$1').replace(/[?&]$/, '');
    };
    frame.querySelectorAll('[data-src]').forEach((button) => button.addEventListener('click', () => {
      frame.querySelectorAll('[data-src]').forEach((other) => other.setAttribute('aria-pressed', String(other === button)));
      setSrc(button.dataset.src);
    }));
    frame.querySelectorAll('[data-device]').forEach((button) => button.addEventListener('click', () => {
      frame.dataset.device = button.dataset.device;
      frame.querySelectorAll('[data-device]').forEach((other) => other.setAttribute('aria-pressed', String(other === button)));
    }));
    const go = frame.querySelector('[data-go]');
    if (go) go.addEventListener('click', () => {
      const poster = frame.querySelector('.aidev-poster');
      const waiting = frame.querySelector('.aidev-wait');
      if (waiting) waiting.hidden = false;
      iframe.addEventListener('load', () => { if (waiting) waiting.hidden = true; }, { once: true });
      setSrc(go.dataset.go);
      if (poster) poster.hidden = true;
    });
  });

  // 问卷回放
  document.querySelectorAll('[data-survey]').forEach((root) => {
    const steps = readJson(root);
    if (!steps) return;
    const body = root.querySelector('.fs-body');
    const count = root.querySelector('[data-count]');
    const bar = root.querySelector('.fs-progress i');
    const send = root.querySelector('.fs-send');
    const foot = root.querySelector('.fs-foot');
    let index = 0;
    let phase = 0; // 0 主问题，1 追问
    const history = [];
    const render = () => {
      if (index >= steps.length) {
        count.textContent = String(steps.length);
        bar.style.width = '100%';
        body.innerHTML = '<div class="fs-done fs-bubble"><h2>Your answers are saved.</h2><p>Thank you for your time.</p><button type="button" class="fs-send" data-again>Replay</button></div>';
        foot.hidden = true;
        body.querySelector('[data-again]').addEventListener('click', () => { index = 0; phase = 0; history.length = 0; foot.hidden = false; render(); });
        return;
      }
      const step = steps[index];
      const probe = phase === 1;
      count.textContent = String(index + 1);
      bar.style.width = ((index + (probe ? .6 : .1)) / steps.length * 100) + '%';
      const question = probe ? step.probe.q : step.q;
      let input = '';
      if (!probe && step.options) {
        input = '<ul class="fs-opts' + (step.rank ? ' is-rank' : '') + '">' + step.options.map((option) => '<li>' + esc(option) + '</li>').join('') + '</ul>';
      } else {
        input = '<label class="fs-label">Your answer</label><div class="fs-box is-empty" aria-live="polite">&nbsp;</div>';
      }
      const past = history.length ? '<div class="fs-hist">' + history.slice(-3).map((item) => '<div><b>' + esc(item.q) + '</b>' + esc(item.a) + '</div>').join('') + '</div>' : '';
      body.innerHTML = '<div class="fs-bubble"><p class="fs-q' + (probe ? ' is-probe' : '') + '">' + esc(question) + '</p>' + input + past + '</div>';
      send.textContent = 'Send sample answer';
      body.scrollTop = 0;
    };
    send.addEventListener('click', () => {
      if (index >= steps.length) return;
      const step = steps[index];
      const probe = phase === 1;
      const box = body.querySelector('.fs-box');
      const list = body.querySelector('.fs-opts');
      const answer = probe ? step.probe.a : step.a;
      if (box) { box.classList.remove('is-empty'); box.textContent = answer; }
      if (list && !probe) {
        const items = [...list.children];
        if (step.rank) {
          const order = step.pick.map((i) => items[i]);
          const rest = items.filter((item) => !order.includes(item));
          [...order, ...rest].forEach((item) => list.append(item));
          order.forEach((item) => item.classList.add('is-picked'));
        } else {
          items[step.pick].classList.add('is-picked');
        }
      }
      history.push({ q: probe ? step.probe.q : step.q, a: step.rank && !probe ? step.pick.map((i) => step.options[i]).slice(0, 2).join(' / ') + ' …' : (step.options && !probe ? step.options[step.pick] : answer) });
      send.disabled = true;
      setTimeout(() => {
        send.disabled = false;
        if (!probe && step.probe) { phase = 1; } else { phase = 0; index += 1; }
        render();
      }, reduce ? 0 : 750);
    });
    render();
  });

  // Discord 对话回放
  document.querySelectorAll('[data-discord]').forEach((root) => {
    const data = readJson(root);
    if (!data) return;
    const feed = root.querySelector('.dc-feed');
    const ctrl = root.querySelector('.dc-ctrl');
    const avatar = root.dataset.avatar;
    let busy = false;
    let last = -1;
    const scroll = () => { feed.scrollTop = feed.scrollHeight; };
    const mentions = (text) => esc(text).replace(/@(\w+)/g, '<span class="dc-mention">@$1</span>').replace(/#([a-z-]+)/g, '<span class="dc-mention">#$1</span>');
    const botMessage = (text) => {
      const el = document.createElement('div');
      el.className = 'dc-msg';
      el.innerHTML = '<img src="' + esc(avatar) + '" alt="" width="40" height="40"><div><div class="dc-meta"><b>Bruno</b><span class="dc-tag">APP</span><i>Today</i></div><p class="dc-text">' + mentions(text) + '</p></div>';
      feed.append(el);
    };
    const userMessage = (name, text) => {
      const el = document.createElement('div');
      el.className = 'dc-msg';
      el.innerHTML = '<div class="dc-av" aria-hidden="true" style="background:' + esc(name.color) + '">' + esc(name.name[0]) + '</div><div><div class="dc-meta"><b>' + esc(name.name) + '</b><i>Today</i></div><p class="dc-text">' + mentions(text) + '</p></div>';
      feed.append(el);
    };
    const typing = async () => {
      const el = document.createElement('div');
      el.className = 'dc-typing';
      el.innerHTML = '<i></i><i></i><i></i> Bruno is typing';
      feed.append(el); scroll();
      await wait(900);
      el.remove();
    };
    const run = async (task) => {
      if (busy) return;
      busy = true;
      ctrl.querySelectorAll('button').forEach((b) => { b.disabled = true; });
      try { await task(); } finally {
        busy = false;
        ctrl.querySelectorAll('button').forEach((b) => { b.disabled = false; });
      }
      scroll();
    };
    // 初始：频道里已有一条置顶的人类说明，不放示例人名
    const welcome = ctrl.querySelector('[data-welcome]');
    if (welcome) welcome.addEventListener('click', () => run(async () => {
      const member = data.members[Math.floor(Math.random() * data.members.length)];
      const sys = document.createElement('div');
      sys.className = 'dc-sys';
      sys.innerHTML = '<span aria-hidden="true">→</span><span><b>' + esc(member) + '</b> joined the server.</span>';
      feed.append(sys); scroll();
      await typing();
      let pick;
      do { pick = Math.floor(Math.random() * data.welcome.length); } while (data.welcome.length > 1 && pick === last);
      last = pick;
      botMessage(data.welcome[pick].replaceAll('{member}', '@' + member));
    }));
    ctrl.querySelectorAll('[data-ask]').forEach((button) => button.addEventListener('click', () => run(async () => {
      const item = data.faq[Number(button.dataset.ask)];
      userMessage(data.asker, item.q); scroll();
      await typing();
      botMessage(item.a);
    })));
    const clear = ctrl.querySelector('[data-clear]');
    if (clear) clear.addEventListener('click', () => { feed.innerHTML = ''; last = -1; });
  });

  // 检查清单回放
  document.querySelectorAll('[data-gate]').forEach((root) => {
    const checks = readJson(root);
    if (!checks) return;
    const log = root.querySelector('.gate-log');
    const bar = root.querySelector('.gate-bar i');
    const button = root.querySelector('[data-run]');
    const status = root.querySelector('[data-status]');
    let running = false;
    button.addEventListener('click', async () => {
      if (running) return;
      running = true; button.disabled = true;
      log.innerHTML = '<div class="dim">$ scripts/qa-local.sh</div>';
      bar.style.width = '0';
      for (let i = 0; i < checks.length; i += 1) {
        await wait(110);
        const row = document.createElement('div');
        row.innerHTML = '<span class="ok">✓</span><span>' + esc(checks[i]) + '</span>';
        log.append(row);
        log.scrollTop = log.scrollHeight;
        bar.style.width = ((i + 1) / checks.length * 100) + '%';
        if (status) status.textContent = (i + 1) + ' / ' + checks.length;
      }
      const end = document.createElement('div');
      end.className = 'dim';
      end.textContent = '全部通过，允许推送。';
      log.append(end);
      log.scrollTop = log.scrollHeight;
      running = false; button.disabled = false; button.textContent = '再回放一次';
    });
  });
})();
