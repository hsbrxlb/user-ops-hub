// OEDRO Guides editor. Runs as static files; drafts stay in this browser (IndexedDB).
// The preview and the publish package use the same templates and render code as the site build.
import { Editor, Node, Extension, mergeAttributes, generateJSON, StarterKit, Link, Placeholder, Suggestion, PluginKey, zipSync, strToU8, marked } from './editor-lib/vendor.js';
import * as A from './editor-lib/article.mjs';
import { shell, articlePage } from './editor-lib/templates.mjs';
import { renderSite } from './editor-lib/site-render.mjs';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = A.esc;
const debounce = (fn, ms) => { let t; const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; d.flush = () => { clearTimeout(t); fn(); }; return d; };
const newId = p => `${p}${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const timeLabel = t => new Date(t).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
const dayLabel = t => { const d = new Date(t), n = new Date(); return d.toDateString() === n.toDateString() ? `今天 ${timeLabel(t)}` : `${d.getMonth() + 1}月${d.getDate()}日 ${timeLabel(t)}`; };
const SAMPLE_COVERS = { 'tonneau-cover-car-wash.md': 'assets/tonneau-cover-troubleshooting.jpg', 'running-boards-nerf-bars-rock-sliders.md': 'assets/how-to-choose-running-boards-fitment.jpg' };
const PLACEHOLDER_COVER = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900"><rect width="1200" height="900" fill="#e9edf1"/><g fill="none" stroke="#9aa6b2" stroke-width="10"><rect x="480" y="360" width="240" height="180" rx="18"/><path d="M480 500l70-70 70 70 40-40 60 60"/></g></svg>');

let D = {};             // site data: catalog, faqs, editorial, site, provenance, designAssets, config
let drafts = [];
let current = null;
let editor = null;
let storage = null;
let lastPreview = '';
let built = null;       // latest buildRecord result for the current draft

/* ================= storage ================= */
function openStore() {
  return new Promise(resolve => {
    try {
      const req = indexedDB.open('oedro-guides-editor', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('drafts', { keyPath: 'id' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch { resolve(null); }
  });
}
const tx = (mode, fn) => new Promise((resolve, reject) => {
  const t = storage.transaction('drafts', mode); const s = t.objectStore('drafts');
  const r = fn(s); t.oncomplete = () => resolve(r?.result); t.onerror = () => reject(t.error); t.onabort = () => reject(t.error);
});
async function loadDrafts() { if (!storage) return []; try { return (await tx('readonly', s => s.getAll())) || []; } catch { return []; } }
const savedEl = () => $('#saved');
async function saveNow() {
  if (!current) return;
  current.doc = editor.getJSON();
  current.updatedAt = Date.now();
  try { localStorage.setItem('oedro-guides-editor-current', current.id); } catch {}
  if (!storage) { savedEl().textContent = '浏览器不允许本机存储，关闭页面前请先下载'; savedEl().dataset.state = 'bad'; return; }
  try {
    await tx('readwrite', s => s.put(JSON.parse(JSON.stringify(current))));
    savedEl().textContent = `已保存 ${timeLabel(current.updatedAt)}`; savedEl().dataset.state = 'ok';
  } catch {
    savedEl().textContent = '没能保存到本机：浏览器空间不足'; savedEl().dataset.state = 'bad';
  }
}
const saveSoon = debounce(saveNow, 500);
function dirty() { savedEl().textContent = '正在保存…'; savedEl().dataset.state = ''; saveSoon(); }
async function removeDraft(id) { if (storage) try { await tx('readwrite', s => s.delete(id)); } catch {} }

function newDraft(fields = A.blankFields(), doc = { type: 'doc', content: [{ type: 'paragraph' }] }) {
  const now = Date.now();
  return { id: newId('d'), createdAt: now, updatedAt: now, sourceId: null, fields, doc, images: {} };
}

/* ================= editor schema ================= */
const HeadingId = Extension.create({
  name: 'headingId',
  addGlobalAttributes() {
    return [{ types: ['heading'], attributes: { id: { default: null, parseHTML: el => el.getAttribute('data-id') || el.getAttribute('id') || null, renderHTML: a => a.id ? { 'data-id': a.id } : {} } } }];
  }
});

function imageAttrs(img, caption) {
  const src = img.getAttribute('src') || '';
  if (!/^assets\/[a-zA-Z0-9_-]+\.(?:jpg|jpeg|png|svg|webp)$/.test(src)) return false;
  return { src, imageId: '', alt: img.getAttribute('alt') || '', caption: caption || '', width: Number(img.getAttribute('width')) || 1200, height: Number(img.getAttribute('height')) || 800 };
}
const imageSrcFor = attrs => attrs.imageId && current?.images?.[attrs.imageId] ? current.images[attrs.imageId].data : attrs.src;

const Figure = Node.create({
  name: 'figure', group: 'block', atom: true, draggable: true, selectable: true,
  addAttributes() { return { src: { default: '' }, imageId: { default: '' }, alt: { default: '' }, caption: { default: '' }, width: { default: 0 }, height: { default: 0 } }; },
  parseHTML() {
    return [
      { tag: 'figure', getAttrs: el => { const img = el.querySelector('img'); return img ? imageAttrs(img, el.querySelector('figcaption')?.textContent?.trim()) : false; } },
      { tag: 'img[src]', getAttrs: img => imageAttrs(img, '') }
    ];
  },
  renderHTML({ node }) {
    const a = node.attrs;
    return ['figure', {}, ['img', mergeAttributes({ src: a.src, alt: a.alt, width: a.width, height: a.height })], ...(a.caption ? [['figcaption', {}, a.caption]] : [])];
  },
  addNodeView() {
    return ({ node, getPos, editor: ed }) => {
      let attrs = node.attrs;
      const dom = document.createElement('figure');
      dom.className = 'fig';
      dom.innerHTML = `<div class="fig-media" data-drag-handle><img alt=""><button type="button" class="fig-remove" aria-label="删除这张图片"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15"/></svg></button></div>
        <label class="fig-line"><span>图片说明</span><input class="fig-alt" maxlength="200" placeholder="描述图片内容（必填，给看不到图片的读者）"></label>
        <label class="fig-line"><span>图注</span><input class="fig-caption" maxlength="240" placeholder="可选，显示在图片下方"></label>`;
      const img = $('img', dom), alt = $('.fig-alt', dom), cap = $('.fig-caption', dom);
      const paint = () => {
        img.src = imageSrcFor(attrs) || PLACEHOLDER_COVER;
        if (document.activeElement !== alt) alt.value = attrs.alt || '';
        if (document.activeElement !== cap) cap.value = attrs.caption || '';
        dom.classList.toggle('needs-alt', !String(attrs.alt || '').trim());
      };
      const set = patch => {
        const pos = getPos(); if (typeof pos !== 'number') return;
        ed.view.dispatch(ed.view.state.tr.setNodeMarkup(pos, undefined, { ...attrs, ...patch }));
      };
      alt.addEventListener('input', () => set({ alt: alt.value }));
      cap.addEventListener('input', () => set({ caption: cap.value }));
      for (const input of [alt, cap]) input.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ed.commands.focus(); } });
      $('.fig-remove', dom).addEventListener('click', () => { const pos = getPos(); if (typeof pos === 'number') ed.chain().focus().deleteRange({ from: pos, to: pos + 1 }).run(); });
      paint();
      return {
        dom,
        update(next) { if (next.type.name !== 'figure') return false; attrs = next.attrs; paint(); return true; },
        stopEvent: e => Boolean(e.target.closest?.('input,button')),
        ignoreMutation: () => true,
        selectNode() { dom.classList.add('is-selected'); },
        deselectNode() { dom.classList.remove('is-selected'); }
      };
    };
  }
});

/* ---------- slash menu ---------- */
const SLASH = [
  { key: 'h2', label: '小标题', hint: '##', words: 'h2 heading title biaoti xiaobiaoti 标题 小标题', run: c => c.setNode('heading', { level: 2 }).run() },
  { key: 'h3', label: '子标题', hint: '###', words: 'h3 subheading zibiaoti 子标题', run: c => c.setNode('heading', { level: 3 }).run() },
  { key: 'p', label: '正文段落', hint: '', words: 'p paragraph text zhengwen 正文 段落', run: c => c.setParagraph().run() },
  { key: 'ul', label: '项目列表', hint: '-', words: 'ul list bullet liebiao 列表 项目', run: c => c.toggleBulletList().run() },
  { key: 'ol', label: '编号列表', hint: '1.', words: 'ol ordered number bianhao 编号 列表 步骤', run: c => c.toggleOrderedList().run() },
  { key: 'quote', label: '引用', hint: '>', words: 'quote blockquote yinyong 引用 提示', run: c => c.toggleBlockquote().run() },
  { key: 'img', label: '图片', hint: '', words: 'image img picture tupian 图片 照片', run: c => { c.run(); pickImage(); } },
  { key: 'guide', label: '链接到其他指南', hint: '', words: 'link guide lianjie 链接 指南 文章', run: c => { c.run(); openLink({ insert: true }); } }
];
const ICONS = {
  h2: '<b>H2</b>', h3: '<b>H3</b>', p: '<b>¶</b>',
  ul: '<svg viewBox="0 0 20 20"><path d="M8 5h9M8 10h9M8 15h9"/><circle cx="4" cy="5" r="1.2"/><circle cx="4" cy="10" r="1.2"/><circle cx="4" cy="15" r="1.2"/></svg>',
  ol: '<svg viewBox="0 0 20 20"><path d="M8 5h9M8 10h9M8 15h9M3 3.5h1.5V7M3 12.5c.4-.6 2.4-.8 2 .6L3 16h2.5"/></svg>',
  quote: '<svg viewBox="0 0 20 20"><path d="M4 4v12M8 6h8M8 10h8M8 14h5"/></svg>',
  img: '<svg viewBox="0 0 20 20"><rect x="2.5" y="4" width="15" height="12" rx="2"/><path d="M2.5 13l4-4 4 4 2-2 5 5"/></svg>',
  guide: '<svg viewBox="0 0 20 20"><path d="M8.5 11.5a3 3 0 0 0 4.2 0l2.8-2.8a3 3 0 0 0-4.2-4.2l-1 1M11.5 8.5a3 3 0 0 0-4.2 0l-2.8 2.8a3 3 0 0 0 4.2 4.2l1-1"/></svg>'
};
function slashRenderer() {
  const box = $('#slash');
  let items = [], active = 0, props = null;
  const draw = () => {
    box.innerHTML = items.length
      ? items.map((it, i) => `<button type="button" role="option" class="slash-item" data-i="${i}" aria-selected="${i === active}"><span class="slash-icon" aria-hidden="true">${ICONS[it.key]}</span><span>${it.label}</span>${it.hint ? `<kbd>${it.hint}</kbd>` : ''}</button>`).join('')
      : '<p class="slash-empty">没有匹配的内容</p>';
    box.querySelector('[aria-selected=true]')?.scrollIntoView({ block: 'nearest' });
  };
  const place = () => {
    const r = props.clientRect?.(); if (!r) return;
    box.hidden = false;
    const h = box.offsetHeight, w = box.offsetWidth;
    const below = r.bottom + 6 + h < innerHeight;
    box.style.top = `${Math.max(8, below ? r.bottom + 6 : r.top - h - 6)}px`;
    box.style.left = `${Math.max(8, Math.min(r.left, innerWidth - w - 8))}px`;
  };
  box.onmousedown = e => e.preventDefault();
  box.onclick = e => { const b = e.target.closest('[data-i]'); if (b) props.command(items[Number(b.dataset.i)]); };
  return {
    onStart: p => { props = p; items = p.items; active = 0; draw(); place(); },
    onUpdate: p => { props = p; items = p.items; active = Math.min(active, Math.max(0, items.length - 1)); draw(); place(); },
    onKeyDown: ({ event }) => {
      if (event.key === 'ArrowDown') { active = (active + 1) % Math.max(1, items.length); draw(); return true; }
      if (event.key === 'ArrowUp') { active = (active - 1 + items.length) % Math.max(1, items.length); draw(); return true; }
      if (event.key === 'Enter' || event.key === 'Tab') { if (items[active]) props.command(items[active]); return true; }
      if (event.key === 'Escape') { box.hidden = true; return true; }
      return false;
    },
    onExit: () => { box.hidden = true; box.innerHTML = ''; }
  };
}
const Slash = Extension.create({
  name: 'slash',
  addProseMirrorPlugins() {
    return [Suggestion({
      editor: this.editor, char: '/', pluginKey: new PluginKey('slash'), allowSpaces: false,
      allow: ({ state, range }) => state.doc.resolve(range.from).parent.type.name === 'paragraph',
      items: ({ query }) => { const q = query.toLowerCase().trim(); return SLASH.filter(it => !q || it.words.includes(q) || it.label.includes(q)); },
      command: ({ editor: ed, range, props: item }) => item.run(ed.chain().focus().deleteRange(range)),
      render: slashRenderer
    })];
  },
  addKeyboardShortcuts() { return { 'Mod-k': () => { openLink(); return true; } }; }
});

/* ---------- paste and drop ---------- */
let pasteNote = '';
function cleanPastedHTML(html) {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  let cleaned = 0, dropped = 0;
  doc.querySelectorAll('style,script,meta,link,title,noscript,iframe,object,svg,video,audio,canvas,button,input,select,textarea').forEach(n => { n.remove(); cleaned++; });
  doc.querySelectorAll('b[id^="docs-internal-guid"]').forEach(b => b.replaceWith(...b.childNodes));
  doc.querySelectorAll('span[style],font[style],p[style] > span').forEach(s => {
    const st = s.getAttribute('style') || '';
    const bold = /font-weight:\s*(bold|[6-9]00)/i.test(st), italic = /font-style:\s*italic/i.test(st);
    let inner = s;
    if (bold) { const b = doc.createElement('strong'); b.append(...inner.childNodes); inner.append(b); inner = b; }
    if (italic) { const i = doc.createElement('em'); i.append(...inner.childNodes); inner.append(i); }
  });
  // Google Docs marks ordinary text as <b style="font-weight:normal">.
  doc.querySelectorAll('b[style*="font-weight:normal"],b[style*="font-weight: normal"],strong[style*="font-weight:normal"]').forEach(b => b.replaceWith(...b.childNodes));
  doc.querySelectorAll('h1').forEach(h => { const n = doc.createElement('h2'); n.append(...h.childNodes); h.replaceWith(n); cleaned++; });
  doc.querySelectorAll('h4,h5,h6').forEach(h => { const n = doc.createElement('h3'); n.append(...h.childNodes); h.replaceWith(n); cleaned++; });
  doc.querySelectorAll('img').forEach(img => { if (!/^assets\//.test(img.getAttribute('src') || '')) { img.remove(); dropped++; } });
  doc.querySelectorAll('*').forEach(el => {
    for (const a of [...el.attributes]) {
      if (['href', 'src', 'alt', 'width', 'height'].includes(a.name) && ['A', 'IMG'].includes(el.tagName)) continue;
      if ((el.tagName === 'H2' || el.tagName === 'H3') && a.name === 'id') continue;
      el.removeAttribute(a.name); cleaned++;
    }
  });
  pasteNote = dropped ? `已整理格式；${dropped} 张网络图片没有带过来，请把图片文件直接拖进正文` : cleaned ? '已整理粘贴内容的格式' : '';
  return doc.body.innerHTML;
}
const looksLikeMarkdown = t => /^(#{1,6} |[-*+] |\d+\. |> )/m.test(t) || /\*\*[^*\n]+\*\*/.test(t) || /\[[^\]\n]+\]\([^)\s]+\)/.test(t);

async function readImage(file) {
  if (!/^image\/(jpeg|png|webp|gif|avif)$/.test(file.type)) throw new Error('type');
  if (file.size > 25 * 1024 * 1024) throw new Error('size');
  const bmp = await createImageBitmap(file);
  const s = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(bmp.width * s)); canvas.height = Math.max(1, Math.round(bmp.height * s));
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return { data: canvas.toDataURL('image/jpeg', 0.84), width: canvas.width, height: canvas.height, name: file.name || 'image.jpg' };
}
const imageFiles = list => [...(list || [])].filter(f => f.type?.startsWith('image/'));
async function insertImages(files, pos) {
  for (const file of files) {
    try {
      const img = await readImage(file);
      const id = newId('i');
      current.images[id] = img;
      const node = { type: 'figure', attrs: { imageId: id, src: '', alt: '', caption: '', width: img.width, height: img.height } };
      if (typeof pos === 'number') editor.chain().focus().insertContentAt(pos, node).run();
      else editor.chain().focus().insertContent(node).run();
      toast('图片已加入，请在图片下方写一句图片说明');
    } catch (e) {
      toast(e.message === 'size' ? '图片超过 25 MB，请换一张小一点的' : '这个文件不是可用的图片（支持 JPG、PNG、WebP）');
    }
  }
}
let imageTarget = null;
function pickImage() { imageTarget = editor.state.selection.from; $('#image-file').click(); }

/* ================= editor ================= */
const EXTENSIONS = [
      StarterKit.configure({
        heading: { levels: [2, 3] }, code: false, codeBlock: false, horizontalRule: false, strike: false, underline: false, link: false
      }),
      // typing right after a link must not extend it
      Link.extend({ inclusive: () => false }).configure({ openOnClick: false, autolink: true, linkOnPaste: true, defaultProtocol: 'https', protocols: ['https'], HTMLAttributes: { rel: null, target: null } }),
      HeadingId, Figure, Slash,
      Placeholder.configure({ placeholder: ({ node }) => node.type.name === 'heading' ? '小标题' : '输入正文，或输入 / 插入标题、列表、图片', includeChildren: false })
];
function makeEditor() {
  editor = new Editor({
    element: $('#body'),
    extensions: EXTENSIONS,
    content: '',
    editorProps: {
      attributes: { class: 'prose', 'aria-label': '正文', 'aria-multiline': 'true', role: 'textbox', spellcheck: 'true', lang: 'en' },
      transformPastedHTML: cleanPastedHTML,
      handlePaste: (view, event) => {
        const files = imageFiles(event.clipboardData?.files);
        if (files.length) { insertImages(files); return true; }
        const html = event.clipboardData?.getData('text/html');
        const text = event.clipboardData?.getData('text/plain') || '';
        if (!html && looksLikeMarkdown(text)) {
          editor.chain().focus().insertContent(cleanPastedHTML(marked.parse(text)), { parseOptions: { preserveWhitespace: false } }).run();
          toast('已把 Markdown 转成文章格式'); return true;
        }
        if (html) setTimeout(() => { if (pasteNote) toast(pasteNote); pasteNote = ''; }, 0);
        return false;
      },
      handleDrop: (view, event, slice, moved) => {
        const files = imageFiles(event.dataTransfer?.files);
        if (moved || !files.length) return false;
        event.preventDefault();
        const pos = view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos;
        insertImages(files, pos);
        return true;
      }
    },
    onUpdate: () => { refresh(); dirty(); },
    onSelectionUpdate: paintToolbar,
    onTransaction: paintToolbar
  });
}

/* ---------- toolbar ---------- */
const CMDS = {
  paragraph: c => c.setParagraph(), h2: c => c.toggleHeading({ level: 2 }), h3: c => c.toggleHeading({ level: 3 }),
  bold: c => c.toggleBold(), italic: c => c.toggleItalic(), bullet: c => c.toggleBulletList(), ordered: c => c.toggleOrderedList(),
  quote: c => c.toggleBlockquote(), undo: c => c.undo(), redo: c => c.redo()
};
$('#toolbar').addEventListener('mousedown', e => { if (e.target.closest('button[data-cmd]')) e.preventDefault(); });
$('#toolbar').addEventListener('click', e => {
  const b = e.target.closest('[data-cmd]'); if (!b) return;
  const cmd = b.dataset.cmd;
  if (cmd === 'link') return openLink();
  if (cmd === 'image') return pickImage();
  CMDS[cmd](editor.chain().focus()).run();
});
function paintToolbar() {
  if (!editor) return;
  const is = {
    paragraph: editor.isActive('paragraph') && !editor.isActive('bulletList') && !editor.isActive('orderedList') && !editor.isActive('blockquote'),
    h2: editor.isActive('heading', { level: 2 }), h3: editor.isActive('heading', { level: 3 }), bold: editor.isActive('bold'), italic: editor.isActive('italic'),
    link: editor.isActive('link'), bullet: editor.isActive('bulletList'), ordered: editor.isActive('orderedList'), quote: editor.isActive('blockquote')
  };
  for (const b of $$('#toolbar [data-cmd]')) {
    const c = b.dataset.cmd;
    if (c in is) b.setAttribute('aria-pressed', String(is[c]));
    if (c === 'undo') b.disabled = !editor.can().undo();
    if (c === 'redo') b.disabled = !editor.can().redo();
  }
}

/* ---------- link popover ---------- */
const linkPop = $('#linkpop'), linkInput = $('#link-input');
let linkMode = { insert: false };
function guideList(q) {
  const t = q.toLowerCase().trim();
  return D.catalog.filter(a => a.status !== 'draft' && a.slug !== built?.record.slug && (!t || a.title.toLowerCase().includes(t) || a.slug.includes(t))).slice(0, 6);
}
function paintSuggest() {
  const v = linkInput.value;
  const show = !/^https?:/i.test(v);
  const list = show ? guideList(v) : [];
  $('#link-suggest').innerHTML = list.map(a => `<li><button type="button" data-guide="${esc(a.slug)}"><b>${esc(a.title)}</b><span>${esc(a.slug)}.html</span></button></li>`).join('');
}
function openLink({ insert = false } = {}) {
  linkMode = { insert };
  const href = editor.getAttributes('link').href || '';
  linkInput.value = href;
  $('#link-error').hidden = true;
  $('#link-remove').hidden = !href;
  paintSuggest();
  const { from } = editor.state.selection;
  const c = editor.view.coordsAtPos(from);
  linkPop.hidden = false;
  const w = linkPop.offsetWidth;
  linkPop.style.left = `${Math.max(8, Math.min(c.left, innerWidth - w - 8))}px`;
  linkPop.style.top = `${Math.min(c.bottom + 8, innerHeight - linkPop.offsetHeight - 8)}px`;
  linkInput.focus(); linkInput.select();
}
function closeLink() { linkPop.hidden = true; }
function applyLink(href, text) {
  href = href.trim();
  if (/^http:\/\//i.test(href)) href = href.replace(/^http:/i, 'https:');
  if (/^www\./i.test(href)) href = `https://${href}`;
  const problem = A.linkProblem(href);
  if (problem) { $('#link-error').textContent = problem; $('#link-error').hidden = false; return; }
  const chain = editor.chain().focus();
  if (editor.state.selection.empty && !editor.isActive('link')) {
    chain.insertContent({ type: 'text', text: text || href, marks: [{ type: 'link', attrs: { href } }] }).run();
  } else chain.extendMarkRange('link').setLink({ href }).run();
  closeLink();
}
linkInput.addEventListener('input', paintSuggest);
linkInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') { e.preventDefault(); const first = $('#link-suggest [data-guide]'); if (first && linkInput.value && !/^https?:|\.html/.test(linkInput.value)) first.click(); else applyLink(linkInput.value); }
  if (e.key === 'Escape') { closeLink(); editor.commands.focus(); }
});
$('#link-suggest').addEventListener('click', e => {
  const b = e.target.closest('[data-guide]'); if (!b) return;
  const a = D.catalog.find(x => x.slug === b.dataset.guide);
  applyLink(`${a.slug}.html`, a.title);
});
$('#link-apply').addEventListener('click', () => applyLink(linkInput.value));
$('#link-remove').addEventListener('click', () => { editor.chain().focus().extendMarkRange('link').unsetLink().run(); closeLink(); });

/* ================= title, intro, cover ================= */
const titleEl = $('#title'), introEl = $('#intro');
const autosize = el => { el.style.height = 'auto'; el.style.height = `${el.scrollHeight}px`; };
for (const [el, key, next] of [[titleEl, 'title', () => introEl.focus()], [introEl, 'intro', () => editor.commands.focus('start')]]) {
  el.addEventListener('input', () => { el.value = el.value.replace(/\n/g, ' '); current.fields[key] = el.value; autosize(el); refresh(); dirty(); });
  el.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); next(); } });
}

const coverDrop = $('#cover-drop');
function paintCover() {
  const c = current.fields.cover;
  const src = c ? (c.kind === 'upload' ? c.data : c.src) : '';
  $('#cover-img').hidden = !src; $('#cover-tools').hidden = !src; $('#cover-empty').hidden = Boolean(src);
  if (src) $('#cover-img').src = src; else $('#cover-img').removeAttribute('src');
  coverDrop.classList.toggle('has-image', Boolean(src));
  coverDrop.setAttribute('aria-label', src ? '封面图：可以更换或移除' : '添加封面图：点击选择、拖入或粘贴图片');
  $('#f-coverAlt').value = c?.alt || ''; $('#f-coverCaption').value = c?.caption || '';
  $('#f-coverAlt').disabled = $('#f-coverCaption').disabled = !c;
}
async function setCoverFile(file) {
  try {
    const img = await readImage(file);
    const old = current.fields.cover;
    const staleAlt = old?.kind === 'library' && old.alt === D.catalog.find(a => a.cover.src === old.src)?.cover.alt;
    current.fields.cover = { kind: 'upload', ...img, alt: staleAlt ? '' : old?.alt || '', caption: old?.caption || '' };
    paintCover(); refresh(); dirty();
    toast(current.fields.cover.alt ? `封面已更新（${img.width}×${img.height}）` : '封面已更新，请到“设置”里写一句图片说明');
  } catch (e) { toast(e.message === 'size' ? '图片超过 25 MB，请换一张小一点的' : '这个文件不是可用的图片（支持 JPG、PNG、WebP）'); }
}
coverDrop.addEventListener('click', e => {
  if (e.target.closest('#cover-library-btn')) { e.stopPropagation(); return openLibrary(); }
  if (e.target.closest('#cover-remove')) { current.fields.cover = null; paintCover(); refresh(); dirty(); return; }
  if (e.target.closest('#cover-change') || !current.fields.cover) $('#cover-file').click();
});
coverDrop.addEventListener('keydown', e => { if ((e.key === 'Enter' || e.key === ' ') && e.target === coverDrop) { e.preventDefault(); $('#cover-file').click(); } });
coverDrop.addEventListener('paste', e => { const f = imageFiles(e.clipboardData?.files)[0]; if (f) { e.preventDefault(); setCoverFile(f); } });
for (const type of ['dragenter', 'dragover']) coverDrop.addEventListener(type, e => { e.preventDefault(); coverDrop.classList.add('is-over'); });
for (const type of ['dragleave', 'drop']) coverDrop.addEventListener(type, () => coverDrop.classList.remove('is-over'));
coverDrop.addEventListener('drop', e => { e.preventDefault(); const f = imageFiles(e.dataTransfer?.files)[0]; if (f) setCoverFile(f); });
$('#cover-file').addEventListener('change', e => { const f = e.target.files[0]; e.target.value = ''; if (f) setCoverFile(f); });
$('#image-file').addEventListener('change', e => {
  const picked = e.target.files.length, files = imageFiles(e.target.files); e.target.value = '';
  if (picked && !files.length) return toast('这个文件不是可用的图片（支持 JPG、PNG、WebP）');
  insertImages(files, imageTarget);
});

function openLibrary() {
  const seen = new Set();
  $('#library-grid').innerHTML = D.catalog.filter(a => a.cover && !seen.has(a.cover.src) && seen.add(a.cover.src))
    .map(a => `<button type="button" data-src="${esc(a.cover.src)}" aria-label="${esc(a.cover.alt)}"><img src="${esc(a.cover.src)}" alt="" loading="lazy"></button>`).join('');
  $('#library').showModal();
}
$('#library-grid').addEventListener('click', e => {
  const b = e.target.closest('[data-src]'); if (!b) return;
  const a = D.catalog.find(x => x.cover.src === b.dataset.src);
  const old = current.fields.cover;
  current.fields.cover = { kind: 'library', src: a.cover.src, width: a.cover.width, height: a.cover.height, alt: old?.alt && old.kind !== 'library' ? old.alt : a.cover.alt, caption: old?.caption || '' };
  $('#library').close(); paintCover(); refresh(); dirty();
});

/* ================= settings ================= */
const form = $('#settings');
function rowsHTML(list, name) {
  return (list.length ? list : []).map((l, i) => `<li class="row" data-i="${i}">
    <label><span class="sr-only">名称</span><input data-k="title" value="${esc(l.title)}" placeholder="${name === 'sources' ? '来源名称，例如 Ford: 2024 F-150 specifications' : '产品名称'}"></label>
    <label><span class="sr-only">网址</span><input data-k="url" value="${esc(l.url)}" placeholder="https://…" inputmode="url" spellcheck="false"></label>
    <button type="button" class="icon-btn" data-remove aria-label="删除这一条"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 5l10 10M15 5L5 15"/></svg></button></li>`).join('');
}
function paintRows() { for (const name of ['sources', 'productLinks']) $(`#${name}`).innerHTML = rowsHTML(current.fields[name], name); }
function paintRelated() {
  const f = current.fields, slug = built?.record.slug;
  const options = D.catalog.filter(a => a.status !== 'draft' && a.slug !== slug && a.id !== current.sourceId);
  $('#related').innerHTML = options.map(a => `<label class="rel"><input type="checkbox" value="${esc(a.slug)}"${f.related.includes(a.slug) ? ' checked' : ''}${!f.related.includes(a.slug) && f.related.length >= 3 ? ' disabled' : ''}><span>${esc(a.title)}<small>${esc(A.CATEGORIES.find(([id]) => id === a.category)?.[2] || '')}</small></span></label>`).join('');
}
function fillSettings() {
  const f = current.fields;
  $('#f-category').value = f.category;
  $('#f-slug').value = f.slug; $('#f-slugAuto').checked = f.slugAuto; $('#f-slugAuto').closest('.check').hidden = Boolean(current.sourceId);
  for (const k of ['seoTitle', 'description', 'publishedAt', 'approvalRef', 'rightsNote']) $(`#f-${k}`).value = f[k] || '';
  $('#f-rights').value = f.rights; $('#f-pinTop').checked = f.pinTop;
  $('#pin-field').hidden = Boolean(current.sourceId);
  const original = originalRecord();
  $('#status-legacy').hidden = original?.status !== 'legacy-demo';
  for (const r of form.elements.status) r.checked = r.value === f.status;
  paintRows(); paintCover(); paintRelated(); paintStatus();
}
function paintStatus() {
  const f = current.fields;
  $('#approval-field').hidden = f.status !== 'approved';
  $('#rights-note-field').hidden = f.rights !== 'licensed';
}
form.addEventListener('input', e => {
  const el = e.target, f = current.fields;
  const row = el.closest('.row');
  if (row) { const list = f[row.parentElement.dataset.list]; list[Number(row.dataset.i)][el.dataset.k] = el.value; }
  else if (el.name === 'slug') { el.value = el.value.toLowerCase().replace(/\s+/g, '-'); f.slug = el.value; f.slugAuto = false; $('#f-slugAuto').checked = false; }
  else if (el.name === 'slugAuto') { f.slugAuto = el.checked; if (el.checked) { f.slug = A.slugify(f.title); el.form.elements.slug.value = f.slug; } }
  else if (el.name === 'coverAlt' && f.cover) f.cover.alt = el.value;
  else if (el.name === 'coverCaption' && f.cover) f.cover.caption = el.value;
  else if (el.name === 'status') { f.status = el.value; paintStatus(); }
  else if (el.name === 'pinTop') f.pinTop = el.checked;
  else if (el.closest('#related')) {
    f.related = $$('#related input:checked').map(i => i.value);
    paintRelated();
  } else if (el.name in f) { f[el.name] = el.value; if (el.name === 'rights') paintStatus(); }
  refresh(); dirty();
});
form.addEventListener('submit', e => e.preventDefault());
form.addEventListener('click', e => {
  const add = e.target.closest('[data-add]');
  if (add) {
    const name = add.dataset.add; current.fields[name].push({ title: '', url: '' }); paintRows();
    $(`#${name} .row:last-child input`).focus(); dirty(); return;
  }
  const rm = e.target.closest('[data-remove]');
  if (rm) { const row = rm.closest('.row'); current.fields[row.parentElement.dataset.list].splice(Number(row.dataset.i), 1); paintRows(); refresh(); dirty(); }
});

/* ================= derived state, preview, checks ================= */
const originalRecord = () => current?.sourceId ? D.catalog.find(a => a.id === current.sourceId) || null : null;
function refresh() {
  const original = originalRecord();
  current.doc = editor.getJSON();
  built = A.buildRecord(current, { catalog: D.catalog, original, preview: true, previewSrc: id => current.images[id]?.data });
  const f = current.fields, rec = built.record;
  if (f.slugAuto && !original) { f.slug = rec.slug; if (document.activeElement !== $('#f-slug')) $('#f-slug').value = rec.slug; }
  $('#kicker').textContent = rec.categoryLabel;
  $('#docs-name').textContent = rec.title || '未命名文章';
  document.title = `${rec.title || '未命名文章'} · OEDRO 文章编辑器`;
  $('#word-count').textContent = `${built.words.toLocaleString('en-US')} 词 · ${rec.readingMinutes} 分钟`;
  $('#reading').textContent = `${rec.readingMinutes} 分钟`;
  paintPreview(rec);
  paintChecks(rec);
}
const refreshSoon = debounce(() => refresh(), 150);

function previewHTML(rec) {
  const c = current.fields.cover;
  const cover = rec.cover ? { ...rec.cover, src: c.kind === 'upload' ? c.data : rec.cover.src } : { src: PLACEHOLDER_COVER, alt: '', width: 1200, height: 900 };
  const shown = { ...rec, title: rec.title || 'Untitled guide', intro: rec.intro || 'Your intro answers the reader’s question in one or two sentences.', displayDate: D.site.launchDate, cover };
  const visible = D.catalog.filter(a => a.status !== 'draft' && a.id !== rec.id);
  const related = (rec.related.length ? rec.related.map(s => visible.find(a => a.slug === s)).filter(Boolean)
    : visible.filter(a => a.category === rec.category)).slice(0, D.editorial.relatedLimit);
  const footer = D.editorial.footerArticleIds.map(id => D.catalog.find(a => a.id === id)).filter(Boolean);
  const page = articlePage({ article: shown, articles: [], relatedArticles: related, editorialPreview: rec.status !== 'approved' });
  return shell({ ...page, active: 'blog', assetPrefix: '', footerArticles: footer, head: '<meta name="robots" content="noindex">' });
}
const frame = $('#preview');
function paintPreview(rec) {
  const html = previewHTML(rec);
  if (html === lastPreview) return;
  lastPreview = html;
  const doc = frame.contentDocument;
  if (frame.dataset.ready && doc?.querySelector('main')) {
    const next = new DOMParser().parseFromString(html, 'text/html');
    doc.title = next.title;
    doc.querySelector('main').innerHTML = next.querySelector('main').innerHTML;
  } else frame.srcdoc = html;
}
frame.addEventListener('load', () => {
  frame.dataset.ready = '1';
  frame.contentDocument.addEventListener('click', e => {
    const a = e.target.closest('a'); if (!a) return;
    const href = a.getAttribute('href') || '';
    e.preventDefault();
    if (href.startsWith('#')) { frame.contentDocument.getElementById(decodeURIComponent(href.slice(1)))?.scrollIntoView({ behavior: 'smooth' }); return; }
    toast('预览里的链接不跳转，发布后可以正常打开');
  });
});

const viewport = $('#viewport'), device = $('#device');
function layout() {
  const vw = viewport.clientWidth, vh = viewport.clientHeight;
  if (!vw || !vh) return;
  if (viewport.dataset.device === 'desktop') {
    const w = 1280, s = Math.min(1, vw / w);
    frame.style.width = `${w}px`; frame.style.height = `${Math.max(400, vh / s)}px`;
    device.style.transform = `scale(${s})`; device.style.left = `${Math.max(0, (vw - w * s) / 2)}px`;
  } else {
    const w = 390, h = 844, s = Math.min(1, (vh - 24) / (h + 24), (vw - 16) / (w + 24));
    frame.style.width = `${w}px`; frame.style.height = `${h}px`;
    device.style.transform = `scale(${s})`; device.style.left = `${Math.max(0, (vw - (w + 24) * s) / 2)}px`;
  }
}
new ResizeObserver(layout).observe(viewport);
$$('[data-device]').forEach(b => b.addEventListener('click', () => {
  $$('[data-device]').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
  viewport.dataset.device = b.dataset.device; layout();
}));

function audit(rec) {
  const checks = [];
  const add = (weight, level, title, detail, field) => checks.push({ weight, level, title, detail, field });
  const t = rec.seoTitle.length;
  add(20, !t ? 'bad' : t >= 30 && t <= 60 ? 'ok' : t >= 20 && t <= 70 ? 'warn' : 'bad', `SEO 标题 ${t} 字符`, t >= 30 && t <= 60 ? '长度合适，搜索结果里能完整显示' : t > 60 ? '超过 60 字符，搜索结果可能截断' : '偏短，建议 30–60 字符，写清主题', 'seoTitle');
  const d = rec.description.length;
  add(20, !d ? 'bad' : d >= 70 && d <= 160 ? 'ok' : (d >= 50 && d < 70) || (d > 160 && d <= 180) ? 'warn' : 'bad', `SEO 描述 ${d} 字符`, d >= 70 && d <= 160 ? '长度合适' : d > 160 ? '超过 160 字符，可能被截断' : '建议 70–160 字符，说明读者能得到什么', 'description');
  const slug = rec.slug, dup = D.catalog.some(a => a.slug === slug && a.id !== current.sourceId);
  const slugOk = A.isSlug(slug) && !A.RESERVED_SLUGS.has(slug) && !dup && slug.length <= 60;
  add(15, slugOk ? 'ok' : 'bad', '文章网址', !slug ? '还没有网址' : dup ? '和已有文章的网址重复' : A.RESERVED_SLUGS.has(slug) ? '这是站点保留的网址，请换一个' : slug.length > 60 ? '超过 60 字符，建议精简' : slugOk ? `/guides/${slug}.html` : '只用小写字母、数字和单个连字符', 'slug');
  const missingAlt = built.body.images.filter(i => !i.alt).length, coverAlt = rec.cover?.alt?.length || 0;
  add(15, !rec.cover ? 'bad' : coverAlt < 5 || missingAlt ? 'warn' : 'ok', '图片说明', !rec.cover ? '还没有封面' : coverAlt < 5 ? '封面缺少图片说明' : missingAlt ? `正文有 ${missingAlt} 张图片缺少说明` : `封面${built.body.images.length ? `和正文 ${built.body.images.length} 张图片` : ''}都有说明`, rec.cover ? 'coverAlt' : 'cover');
  const h2 = built.body.headings.filter(x => x === 2).length;
  let skip = false, prev = 1; for (const lv of built.body.headings) { if (lv > prev + 1) skip = true; prev = lv; }
  add(15, skip || h2 < 2 ? (h2 ? 'warn' : 'bad') : 'ok', '小节结构', skip ? '子标题前面要先有小标题' : h2 < 2 ? '至少用 2 个小标题，会自动生成文章目录' : `${h2} 个小节，结构清楚`, 'body');
  const w = built.words;
  add(10, w >= 300 ? 'ok' : w >= 150 ? 'warn' : 'bad', `正文 ${w} 词`, w >= 300 ? '内容量足够' : '建议至少 300 词，把问题回答完整', 'body');
  const internal = built.body.links.some(h => /^[a-z0-9-]+\.html/.test(h));
  add(5, internal ? 'ok' : 'warn', '站内链接', internal ? '已链接到其他指南' : '链接一篇相关指南，方便读者继续看（输入 / 选“链接到其他指南”）', 'body');
  const score = Math.round(checks.reduce((s, c) => s + (c.level === 'ok' ? c.weight : c.level === 'warn' ? c.weight / 2 : 0), 0));
  return { checks, score };
}
function paintChecks(rec) {
  const { checks, score } = audit(rec);
  $$('[data-score]').forEach(el => { el.textContent = score; el.dataset.level = score >= 85 ? 'ok' : score >= 60 ? 'warn' : 'bad'; });
  const meter = $('#score-meter');
  meter.style.strokeDashoffset = String(119.4 * (1 - score / 100));
  meter.style.stroke = score >= 85 ? 'var(--ok)' : score >= 60 ? 'var(--warn)' : 'var(--bad)';
  $('#score').setAttribute('aria-label', `SEO 得分 ${score} / 100`);
  $('#checks').innerHTML = checks.map(c => `<li class="${c.level}"><button type="button" data-field="${c.field}"><b>${esc(c.title)}</b><span>${esc(c.detail)}</span></button></li>`).join('');
  const cut = (s, n) => s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s;
  $('#serp-url').textContent = `www.oedro.com › guides › ${rec.slug || '…'}`;
  $('#serp-title').textContent = cut(rec.seoTitle || '页面标题', 60);
  $('#serp-desc').textContent = cut(rec.description || '页面描述会显示在这里。', 160);
  const counter = (name, len, lo, hi) => { const el = $(`[data-count=${name}]`); el.textContent = `${len} / ${hi}`; el.className = len >= lo && len <= hi ? 'is-ok' : len > hi ? 'is-bad' : ''; };
  counter('seoTitle', rec.seoTitle.length, 30, 60);
  counter('description', rec.description.length, 70, 160);
  const problems = A.publishProblems(current, built, { catalog: D.catalog, originalId: current.sourceId });
  $('#problems').innerHTML = problems.length
    ? problems.map(p => `<li><button type="button" data-field="${p.field}">${esc(p.text)}</button></li>`).join('')
    : '<li class="done">都齐了，可以发布</li>';
  $('#publish-btn').dataset.ready = String(!problems.length);
}

/* ---------- jump to a field ---------- */
const FIELD_TARGETS = {
  title: ['write', '#title'], intro: ['write', '#intro'], body: ['write', null], cover: ['write', '#cover-drop'],
  slug: ['settings', '#f-slug'], seoTitle: ['settings', '#f-seoTitle'], description: ['settings', '#f-description'], coverAlt: ['settings', '#f-coverAlt'],
  sources: ['settings', '#sources'], productLinks: ['settings', '#productLinks'], approvalRef: ['settings', '#f-approvalRef'], rights: ['settings', '#f-rightsNote']
};
function goField(field) {
  const [view, sel] = FIELD_TARGETS[field] || ['write', null];
  setView(view);
  requestAnimationFrame(() => {
    if (field === 'body') return editor.commands.focus();
    if (field === 'sources' && !current.fields.sources.length) { $('[data-add=sources]').click(); return; }
    const el = $(sel); const input = el?.matches('input,textarea,select,[tabindex]') ? el : el?.querySelector('input');
    (input || el)?.scrollIntoView({ block: 'center' }); (input || el)?.focus();
  });
}
document.addEventListener('click', e => { const b = e.target.closest('[data-field]'); if (b && !b.closest('#publish')) goField(b.dataset.field); });

/* ================= views ================= */
const desk = $('.desk');
const wide = matchMedia('(min-width: 1100px)');
function setView(view) {
  if (wide.matches && view === 'write') view = desk.dataset.panel || 'preview';
  desk.dataset.view = view;
  if (view !== 'write') desk.dataset.panel = view;
  const panel = desk.dataset.panel || 'preview';
  for (const b of $$('.views [data-view]')) b.setAttribute('aria-pressed', String(b.dataset.view === view));
  for (const b of $$('.panel-tabs [data-view]')) b.setAttribute('aria-pressed', String(b.dataset.view === panel));
  for (const name of ['preview', 'settings', 'checks']) $(`#pane-${name}`).hidden = (wide.matches ? panel : view) !== name;
  requestAnimationFrame(layout);
}
$$('[data-view]').forEach(b => b.addEventListener('click', () => setView(b.dataset.view)));
wide.addEventListener('change', () => setView(desk.dataset.view));

/* ================= drafts menu ================= */
const docsBtn = $('#docs-btn'), docsMenu = $('#docs-menu');
function paintDocs() {
  const sorted = [...drafts].sort((a, b) => b.updatedAt - a.updatedAt);
  $('#doc-list').innerHTML = sorted.map(d => `<li class="${d.id === current.id ? 'is-current' : ''}"><button type="button" data-open="${d.id}"><b>${esc(d.fields.title.trim() || '未命名文章')}</b><span>${d.sourceId ? '修改已有文章 · ' : ''}${dayLabel(d.updatedAt)}</span></button><button type="button" class="icon-btn" data-delete="${d.id}" aria-label="删除草稿：${esc(d.fields.title.trim() || '未命名文章')}"><svg viewBox="0 0 20 20" aria-hidden="true"><path d="M5 6h10M8 6V4h4v2M6.5 6l.7 10h5.6l.7-10"/></svg></button></li>`).join('');
  $('#site-list').innerHTML = D.catalog.map(a => `<li><button type="button" data-edit="${esc(a.id)}"><b>${esc(a.title)}</b><span>${esc(a.slug)}.html</span></button></li>`).join('');
}
function toggleDocs(open = docsMenu.hidden) {
  docsMenu.hidden = !open; docsBtn.setAttribute('aria-expanded', String(open));
  if (open) { paintDocs(); $('#new-doc').focus(); }
}
docsBtn.addEventListener('click', e => { e.stopPropagation(); toggleDocs(); });
document.addEventListener('click', e => {
  if (!docsMenu.hidden && !e.target.closest('.docs')) toggleDocs(false);
  if (!linkPop.hidden && !e.target.closest('#linkpop') && !e.target.closest('[data-cmd=link]')) closeLink();
});
document.addEventListener('keydown', e => {
  if (e.key !== 'Escape') return;
  if (!docsMenu.hidden) { toggleDocs(false); docsBtn.focus(); }
  if (!linkPop.hidden) { closeLink(); editor.commands.focus(); }
});
async function switchTo(d) {
  if (current) await saveNow();
  current = d; lastPreview = '';
  editor.commands.setContent(d.doc, { emitUpdate: false });
  titleEl.value = d.fields.title; introEl.value = d.fields.intro;
  requestAnimationFrame(() => { autosize(titleEl); autosize(introEl); });
  refresh(); fillSettings(); paintToolbar();
  try { localStorage.setItem('oedro-guides-editor-current', d.id); } catch {}
}
$('#new-doc').addEventListener('click', async () => {
  const d = newDraft(); drafts.push(d); toggleDocs(false); await switchTo(d); await saveNow(); setView('write'); titleEl.focus();
});
docsMenu.addEventListener('click', async e => {
  const open = e.target.closest('[data-open]'), del = e.target.closest('[data-delete]'), edit = e.target.closest('[data-edit]'), sample = e.target.closest('[data-sample]');
  if (open) { toggleDocs(false); await switchTo(drafts.find(d => d.id === open.dataset.open)); }
  if (del) {
    const d = drafts.find(x => x.id === del.dataset.delete);
    if (!confirm(`删除草稿“${d.fields.title.trim() || '未命名文章'}”？删除后无法恢复。`)) return;
    drafts = drafts.filter(x => x !== d); await removeDraft(d.id);
    if (d === current) { if (!drafts.length) drafts.push(newDraft()); current = null; await switchTo(drafts.sort((a, b) => b.updatedAt - a.updatedAt)[0]); }
    paintDocs(); toast('草稿已删除');
  }
  if (edit) {
    toggleDocs(false);
    const existing = drafts.find(d => d.sourceId === edit.dataset.edit);
    if (existing) { await switchTo(existing); toast('已打开这篇文章的修改稿'); return; }
    const d = draftFromRecord(D.catalog.find(a => a.id === edit.dataset.edit));
    drafts.push(d); await switchTo(d); await saveNow(); toast('已打开，修改后在“发布”里生成新文件');
  }
  if (sample) {
    toggleDocs(false);
    try {
      const res = await fetch(`editor-lib/samples/${sample.dataset.sample}`); if (!res.ok) throw new Error();
      const d = draftFromMarkdown(await res.text(), SAMPLE_COVERS[sample.dataset.sample]);
      drafts.push(d); await switchTo(d); await saveNow(); toast('示例已载入为新草稿');
    } catch { toast('示例没有载入，请刷新页面后再试'); }
  }
});
$('#import-md').addEventListener('change', async e => {
  const file = e.target.files[0]; e.target.value = ''; toggleDocs(false);
  if (!file) return;
  if (file.size > 1024 * 1024) return toast('文件超过 1 MB，请拆分后导入');
  const d = draftFromMarkdown(await file.text()); drafts.push(d); await switchTo(d); await saveNow(); toast(`已导入 ${file.name}`);
});

function docFromHTML(html) { return generateJSON(html || '<p></p>', EXTENSIONS); }
function draftFromMarkdown(text, coverSrc) {
  const { fields, markdown } = A.parseMarkdownFile(text);
  let md = markdown;
  const tail = md.match(/\n##\s+(Sources|Sources & further reading|References|参考来源)\s*\n([\s\S]*)$/i);
  if (tail) {
    const links = [...tail[2].matchAll(/\[([^\]]+)\]\((https:[^)\s]+)\)/g)].map(m => ({ title: m[1], url: m[2] }));
    if (links.length) { fields.sources = links; md = md.slice(0, tail.index) + '\n'; }
  }
  const cover = coverSrc && D.catalog.find(a => a.cover.src === coverSrc)?.cover;
  if (cover) fields.cover = { kind: 'library', src: cover.src, alt: cover.alt, caption: '', width: cover.width, height: cover.height };
  return newDraft(fields, docFromHTML(cleanPastedHTML(marked.parse(md))));
}
function draftFromRecord(a) {
  const f = A.blankFields();
  Object.assign(f, {
    title: a.title, intro: a.intro, category: a.category, slug: a.slug, slugAuto: false,
    seoTitle: a.seoTitle === `${a.title} | OEDRO` ? '' : a.seoTitle, description: a.description === a.intro ? '' : a.description,
    publishedAt: a.publishedAt || '', status: a.status, approvalRef: a.approval?.reference || '', pinTop: false,
    cover: a.cover ? { kind: 'library', src: a.cover.src, alt: a.cover.alt, caption: a.cover.caption || '', width: a.cover.width, height: a.cover.height } : null,
    sources: structuredClone(a.sources || []), productLinks: structuredClone(a.productLinks || []), related: [...(a.related || [])]
  });
  const d = newDraft(f, docFromHTML(a.bodyHtml));
  d.sourceId = a.id;
  return d;
}
function migrateV1() {
  try {
    const raw = localStorage.getItem('oedro-guides-editor-v1');
    if (!raw || localStorage.getItem('oedro-guides-editor-v1-moved')) return [];
    const old = JSON.parse(raw).drafts || [];
    localStorage.setItem('oedro-guides-editor-v1-moved', '1');
    return old.filter(o => o.fields?.title || o.fields?.body).map(o => {
      const f = A.blankFields(), of = o.fields;
      Object.assign(f, { title: of.title || '', intro: of.intro || '', category: of.category || 'ownership', slug: of.slug || '', slugAuto: of.slugAuto !== false, seoTitle: of.seoTitle || '', description: of.description || '', publishedAt: of.publishedAt || '', status: 'draft' });
      if (of.coverData) f.cover = { kind: 'upload', data: of.coverData, width: of.coverW, height: of.coverH, alt: of.coverAlt || '', caption: '', name: 'cover.jpg' };
      else if (of.coverSrc) { const c = D.catalog.find(a => a.cover.src === of.coverSrc)?.cover; if (c) f.cover = { kind: 'library', src: c.src, width: c.width, height: c.height, alt: of.coverAlt || c.alt, caption: '' }; }
      return newDraft(f, docFromHTML(cleanPastedHTML(marked.parse(of.body || ''))));
    });
  } catch { return []; }
}

/* ================= publish ================= */
const dataURLBytes = url => { const b = atob(url.split(',')[1]); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u; };
async function sha256(bytes) { const h = await crypto.subtle.digest('SHA-256', bytes); return [...new Uint8Array(h)].map(x => x.toString(16).padStart(2, '0')).join(''); }
const kb = n => n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`;

async function preparePackage() {
  const original = originalRecord();
  const result = A.buildRecord(current, { catalog: D.catalog, original });
  const problems = A.publishProblems(current, result, { catalog: D.catalog, originalId: current.sourceId });
  if (problems.length) return { problems, result };
  const { record, plan } = result;
  const images = [];
  for (const [key, src] of plan) {
    const img = key === 'cover' ? current.fields.cover : current.images[key];
    const bytes = dataURLBytes(img.data);
    const alt = key === 'cover' ? record.cover.alt : (built.body.images.find(i => i.imageId === key)?.alt || '');
    const caption = key === 'cover' ? record.cover.caption : '';
    images.push({ src, bytes, entry: A.provenanceEntry({ slug: record.slug, src, name: img.name, alt, caption, bytes: bytes.length, sha256: await sha256(bytes), rights: current.fields.rights, rightsNote: current.fields.rightsNote }) });
  }
  const articles = A.mergeArticles(D.catalog, record);
  const provenance = A.mergeProvenance(D.provenance, images.map(i => i.entry));
  const site = renderSite({ articles, faqs: D.faqs, config: D.editorial, launchDate: D.site.launchDate, provenance, designAssets: D.designAssets, ...D.config });
  const files = new Map();
  files.set('content/articles.json', strToU8(A.jsonFile(articles)));
  if (images.length) files.set('internal/asset-provenance.json', strToU8(A.jsonFile(provenance)));
  for (const i of images) files.set(`public/${i.src}`, i.bytes);
  for (const [path, content] of site.files) files.set(`dist/${path}`, strToU8(content));
  for (const i of images) if (site.publicAssets.has(i.src)) files.set(`dist/${i.src}`, i.bytes);
  return { result, record, images, files, site, isNew: !original };
}

const publishDlg = $('#publish');
async function openPublish() {
  await saveNow();
  let pkg;
  try { pkg = await preparePackage(); }
  catch (err) { pkg = { error: err.message }; }
  const body = $('#publish-body');
  if (pkg.error) {
    body.innerHTML = `<p class="publish-lede">生成站点文件时没有通过检查：</p><p class="publish-error">${esc(pkg.error)}</p><p class="muted">请检查正文里的链接和图片，或把这段提示发给开发同事。</p>`;
  } else if (pkg.problems) {
    body.innerHTML = `<p class="publish-lede">还差 ${pkg.problems.length} 项就能发布：</p><ul class="problems in-dialog">${pkg.problems.map(p => `<li><button type="button" data-goto="${p.field}">${esc(p.text)}</button></li>`).join('')}</ul>
      ${exportLinks(pkg.result.record)}`;
  } else {
    const r = pkg.record, distPages = [...pkg.site.files.keys()].length;
    const statusText = r.status === 'approved' ? '审核通过，生成后站点会显示这篇文章' : r.status === 'legacy-demo' ? '演示状态：测试站显示，正式站不显示' : '草稿：文件里保留这篇文章，站点暂不显示';
    const rows = [
      ['content/articles.json', pkg.isNew ? `新增这篇文章，共 ${D.catalog.length + 1} 篇` : '更新这篇文章'],
      ...(pkg.images.length ? [['internal/asset-provenance.json', `登记 ${pkg.images.length} 张图片的来源`]] : []),
      ...pkg.images.map(i => [`public/${i.src}`, `${i.src.endsWith(`${r.slug}.jpg`) ? '封面' : '正文图片'} · ${kb(i.bytes.length)}`]),
      [`dist/`, `重新生成的站点页面 ${distPages} 个文件${pkg.images.length ? '和新图片' : ''}，可以直接上线`]
    ];
    body.innerHTML = `
      <div class="publish-card">
        <img src="${esc(current.fields.cover?.kind === 'upload' ? current.fields.cover.data : r.cover?.src || PLACEHOLDER_COVER)}" alt="">
        <div><p class="publish-cat">${esc(r.categoryLabel)}</p><h3>${esc(r.title)}</h3><p class="publish-url">/guides/${esc(r.slug)}.html</p><p class="publish-status" data-status="${r.status}">${statusText}</p></div>
      </div>
      <h3 class="publish-h">发布包里的文件</h3>
      <ul class="manifest">${rows.map(([p, d]) => `<li><code>${esc(p)}</code><span>${esc(d)}</span></li>`).join('')}</ul>
      <div class="publish-actions">
        <button type="button" class="btn-primary" id="download-pack">下载发布包</button>
        <p class="muted">把发布包解压到代码仓库的根目录，同名文件直接替换，然后像平常一样提交上线。</p>
      </div>
      <section class="gitlab" aria-labelledby="gitlab-title">
        <div class="gitlab-head"><h3 id="gitlab-title">提交到公司 GitLab</h3><span class="soon">接入后开放</span></div>
        <p>接入后，点一下就会把上面这些文件提交到 GitLab 的内容分支，并发起合并请求，开发确认后上线。提交由公司服务器完成，编辑器里不保存任何密钥。</p>
        <div class="gitlab-row">
          <label><span>目标分支</span><input value="content/guides-${esc(r.slug)}" disabled></label>
          <button type="button" class="btn-secondary" disabled aria-disabled="true">提交到 GitLab</button>
        </div>
      </section>
      ${exportLinks(r)}`;
    $('#download-pack').addEventListener('click', () => {
      const entries = {}; for (const [p, bytes] of pkg.files) entries[p] = [bytes, { level: /\.(jpe?g|png|webp)$/.test(p) ? 0 : 6 }];
      const stamp = A.today().replace(/-/g, '');
      download(`oedro-guides-${r.slug}-${stamp}.zip`, new Blob([zipSync(entries, { mtime: new Date() })], { type: 'application/zip' }));
      toast('发布包已下载');
    });
  }
  publishDlg.showModal();
}
function exportLinks(rec) {
  if (!rec.title || !rec.slug) return '';
  return `<details class="more-exports"><summary>其他导出</summary><div><button type="button" class="link-btn" data-export="json">只下载这篇文章的数据（.json）</button><button type="button" class="link-btn" data-export="md">导出 Markdown（.md）</button></div></details>`;
}
publishDlg.addEventListener('click', e => {
  const go = e.target.closest('[data-goto]');
  if (go) { publishDlg.close(); goField(go.dataset.goto); return; }
  const ex = e.target.closest('[data-export]');
  if (!ex) return;
  const { record } = A.buildRecord(current, { catalog: D.catalog, original: originalRecord() });
  if (ex.dataset.export === 'json') { download(`${record.slug}.json`, new Blob([A.jsonFile(record)], { type: 'application/json' })); toast('已下载文章数据'); }
  else { download(`${record.slug}.md`, new Blob([toMarkdown(record)], { type: 'text/markdown' })); toast('已导出 Markdown'); }
});
$('#publish-btn').addEventListener('click', openPublish);

function toMarkdown(r) {
  const q = v => JSON.stringify(v ?? '');
  const inline = html => html.replace(/<strong>(.*?)<\/strong>/g, '**$1**').replace(/<em>(.*?)<\/em>/g, '*$1*')
    .replace(/<a href="([^"]+)"[^>]*>(.*?)<\/a>/g, '[$2]($1)').replace(/<br>/g, '  \n').replace(/<[^>]+>/g, '')
    .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const body = r.bodyHtml
    .replace(/<figure><img src="([^"]+)" alt="([^"]*)"[^>]*>(?:<figcaption>(.*?)<\/figcaption>)?<\/figure>/g, (m, s, a, c) => `![${a}](${s})${c ? `\n*${c}*` : ''}\n\n`)
    .replace(/<h2[^>]*>(.*?)<\/h2>/g, '## $1\n\n').replace(/<h3[^>]*>(.*?)<\/h3>/g, '### $1\n\n')
    .replace(/<blockquote>(.*?)<\/blockquote>/gs, (m, x) => x.replace(/<p>(.*?)<\/p>/g, '> $1\n') + '\n')
    .replace(/<ul>(.*?)<\/ul>/gs, (m, x) => x.replace(/<li>(.*?)<\/li>/g, '- $1\n') + '\n')
    .replace(/<ol>(.*?)<\/ol>/gs, (m, x) => { let n = 0; return x.replace(/<li>(.*?)<\/li>/g, (mm, y) => `${++n}. ${y}\n`) + '\n'; })
    .replace(/<p>(.*?)<\/p>/g, '$1\n\n');
  const front = ['---', `status: ${r.status}`, `proposed_slug: ${r.slug}`, `seo_title: ${q(r.seoTitle)}`, `meta_description: ${q(r.description)}`, `category: ${r.category}`, `published_at: ${r.publishedAt || 'null'}`, '---', ''];
  const sources = r.sources.length ? `\n## Sources\n\n${r.sources.map(s => `- [${s.title}](${s.url})`).join('\n')}\n` : '';
  return `${front.join('\n')}\n# ${r.title}\n\n${r.intro}\n\n${inline(body).replace(/\n{3,}/g, '\n\n').trim()}\n${sources}`;
}
function download(name, blob) {
  const url = URL.createObjectURL(blob);
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

/* ================= dialogs, keys, toast ================= */
for (const dlg of $$('dialog')) {
  dlg.addEventListener('click', e => { if (e.target === dlg || e.target.closest('[data-close]')) dlg.close(); });
}
$('#keys-btn').addEventListener('click', () => $('#keys').showModal());
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); saveSoon.flush(); toast('已保存到本机'); }
});
let toastTimer;
function toast(msg) {
  const el = $('#toast'); el.textContent = msg; el.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
}
addEventListener('pagehide', () => saveSoon.flush());
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') saveSoon.flush(); });

/* ================= start ================= */
new ResizeObserver(([entry]) => document.documentElement.style.setProperty('--head', `${Math.round(entry.target.getBoundingClientRect().height)}px`)).observe($('.top'));

async function start() {
  const get = async name => {
    for (let attempt = 0; ; attempt++) {
      try { const r = await fetch(`editor-lib/data/${name}.json`); if (r.ok) return await r.json(); throw new Error(r.status); }
      catch (err) { if (attempt >= 2) throw err; await new Promise(r => setTimeout(r, 400 * (attempt + 1))); }
    }
  };
  const [catalog, faqs, editorial, site, provenance, designAssets, config] = await Promise.all(['articles', 'faqs', 'editorial', 'site', 'asset-provenance', 'design-assets', 'site-config'].map(get));
  D = { catalog, faqs, editorial, site, provenance, designAssets, config };
  $('#f-category').innerHTML = A.CATEGORIES.map(([id, en, zh]) => `<option value="${id}">${zh}（${en}）</option>`).join('');
  makeEditor();
  storage = await openStore();
  drafts = await loadDrafts();
  drafts.push(...migrateV1());
  let id = null; try { id = localStorage.getItem('oedro-guides-editor-current'); } catch {}
  let first = drafts.find(d => d.id === id) || [...drafts].sort((a, b) => b.updatedAt - a.updatedAt)[0];
  if (!first) {
    try { first = draftFromMarkdown(await (await fetch('editor-lib/samples/tonneau-cover-car-wash.md')).text(), SAMPLE_COVERS['tonneau-cover-car-wash.md']); }
    catch { first = newDraft(); }
    drafts.push(first);
  }
  // forget body images no longer used by the draft
  for (const d of drafts) {
    const used = new Set(); const walk = n => { if (n.attrs?.imageId) used.add(n.attrs.imageId); (n.content || []).forEach(walk); }; walk(d.doc || {});
    for (const k of Object.keys(d.images || {})) if (!used.has(k)) delete d.images[k];
    d.images ||= {};
  }
  await switchTo(first);
  await saveNow();
  savedEl().textContent = storage ? (drafts.length > 1 || first.updatedAt < Date.now() - 2000 ? '已恢复本机草稿' : '草稿会自动保存在这台电脑') : '浏览器不允许本机存储，关闭页面前请先下载';
  setView(wide.matches ? 'preview' : 'write');
  if (!wide.matches) { $$('[data-device=mobile]')[0].click(); }
  document.body.dataset.ready = '1';
}
start().catch(err => { console.error(err); document.body.dataset.ready = 'error'; toast('编辑器没有启动，请刷新页面'); });
