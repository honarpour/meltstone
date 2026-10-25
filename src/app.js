import { buildSite as buildPages } from './render.js';
import { createEditor } from './editor.js';
import { previewRuntime } from './preview-runtime.js';
import { exportSite } from './export.js';
import { createStylePanel } from './style-panel.js';
import { SAMPLE_SITE, CHEATSHEET } from './sample.js';
import {
  store, onStoreError, openSites, listSites, switchSite, createSite, duplicateSite, deleteSite,
  addPage, renamePage, deletePage, movePage, selectPage, currentPage, saveMeta, saveDoc, saveAssets, buildInput,
} from './sites.js';

const $ = sel => document.querySelector(sel);
const frame = $('#preview');

let site = openSites(SAMPLE_SITE);

const state = {
  live: store.get('live', true),
  lastBuilt: null,
  frameReady: false,
  pendingHtml: null,
  shownPage: '', // which page the preview currently shows, to reset scroll when it changes
};

onStoreError(() => toast("Couldn't save: the browser's storage is full. Export your site, or remove images you don't need.", 9000));

let liveTimer;
let loadingPage = false;
const editor = createEditor({
  parent: $('#editor'),
  doc: site.docs[currentPage(site).id],
  resolveAsset: src => (src.startsWith('asset:') ? site.assets[src.slice(6)] || '' : src),
  onChange(text) {
    if (loadingPage) return;
    if (saveDoc(site, site.currentPage, text)) renderSidebar();
    if (state.live) {
      clearTimeout(liveTimer);
      liveTimer = setTimeout(update, 250);
    } else {
      setStale(text !== state.lastBuilt);
    }
  },
  onSubmit: () => update(),
  onFiles: files => addImages(files),
  pickImage: () => pickImage(),
  getPages: () => site.pages,
});

// ---------- preview ----------

function siteOptions() {
  const s = site.style || {};
  return { remix: site.remix, seed: s.seed, mood: s.mood, overrides: s.overrides || {}, assets: site.assets };
}

function buildCurrent() {
  const idx = site.pages.findIndex(p => p.id === site.currentPage);
  return buildPages(buildInput(site), { ...siteOptions(), current: Math.max(0, idx) });
}

// Fixes the style to the document as it is now: its title seeds the theme and its detected mood is kept.
function lockStyle(report) {
  site.style = { ...site.style, seed: report.title, mood: report.detectedMood };
  saveMeta(site);
}

// The first build loads the page with the runtime script; later builds are
// posted to it and patched in place.
function showInPreview(html) {
  const key = site.id + ':' + site.currentPage;
  const reset = key !== state.shownPage;
  state.shownPage = key;
  if (state.frameReady) {
    frame.contentWindow.postMessage({ meltstoneHtml: html, reset }, '*');
    return;
  }
  state.pendingHtml = html;
  if (!frame.srcdoc) {
    frame.srcdoc = html.replace('</body>', `<script id="meltstone-runtime">(${previewRuntime})()<\/script></body>`);
  }
}

addEventListener('message', e => {
  if (e.source !== frame.contentWindow || !e.data) return;
  if (e.data.meltstoneReady) {
    state.frameReady = true;
    if (state.pendingHtml) showInPreview(state.pendingHtml);
    state.pendingHtml = null;
  } else if (typeof e.data.meltstonePage === 'string') {
    // A page link was clicked in the preview.
    const key = e.data.meltstonePage;
    const page = key === 'home' ? site.pages[0] : site.pages.find(p => p.slug === key);
    if (page) switchPage(page.id);
  }
});

function update() {
  clearTimeout(liveTimer);
  const text = editor.getValue();
  let result = buildCurrent();
  if (!site.style && result.report.title !== 'Untitled') {
    lockStyle(result.report);
    result = buildCurrent();
  }
  showInPreview(result.html);
  state.lastBuilt = text;
  renderReport(result.report);
  syncStylePanel(result.report.style, result.report.autoStyle, site.style?.overrides || {});
  setStale(false);
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

function renderReport(r) {
  $('#style-summary').innerHTML =
    `<b>${esc(r.palette)}</b> · ${esc(r.fonts)} · ${esc(cap(r.hero))} hero${site.remix ? ` · Style ${site.remix + 1}` : ''}`;
}

function setStale(stale) {
  $('#status-text').textContent = state.live ? 'Live preview' : stale ? 'Changes not previewed' : 'Up to date';
  $('#status').classList.toggle('stale', !state.live && stale);
}

function setLive(live) {
  state.live = live;
  store.set('live', live);
  $('#update').hidden = live;
  $('#live-check').textContent = live ? '✓' : '';
  if (live) update();
  else setStale(editor.getValue() !== state.lastBuilt);
}

$('#update').addEventListener('click', update);
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') { e.preventDefault(); update(); }
});

// Remix and reset re-read the mood from the current content.
$('#remix').addEventListener('click', () => {
  const { report } = buildPages(buildInput(site), {});
  site.style = { ...site.style, seed: site.style?.seed ?? report.title, mood: report.detectedMood };
  setRemix(site.remix + 1);
});

function setRemix(n) {
  site.remix = n;
  saveMeta(site);
  update();
}

function resetStyle() {
  site.style = null;
  saveMeta(site);
  setRemix(0);
}

for (const [id, mobile] of [['#vw-desktop', false], ['#vw-mobile', true]]) {
  $(id).addEventListener('click', () => {
    $('#frame-wrap').classList.toggle('mobile', mobile);
    $('#vw-desktop').classList.toggle('on', !mobile);
    $('#vw-mobile').classList.toggle('on', mobile);
  });
}

$('#export-menu').addEventListener('click', async e => {
  const btn = e.target.closest('[data-export]');
  if (!btn) return;
  closeMenus();
  const exportBtn = $('#export');
  exportBtn.disabled = true;
  toast('Downloading images and fonts…');
  try {
    const options = { ...siteOptions(), current: Math.max(0, site.pages.findIndex(p => p.id === site.currentPage)) };
    const { blob, filename, failed, fontsOk } = await exportSite(buildInput(site), options, btn.dataset.export);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    const notes = [];
    if (btn.dataset.export === 'html' && site.pages.length > 1) notes.push(`This file has only the “${currentPage(site).name}” page; links to other pages don't work in it.`);
    if (failed.length) notes.push(`${failed.length} image${failed.length > 1 ? 's' : ''} couldn't be downloaded (the host blocks it) and still link${failed.length > 1 ? '' : 's'} to the original address.`);
    if (!fontsOk) notes.push("Fonts couldn't be downloaded, so the site will use system fonts.");
    toast(`Saved ${filename}. ${notes.join(' ')}`, notes.length ? 9000 : 3500);
  } catch (err) {
    toast(`Export failed: ${err.message}`, 8000);
  } finally {
    exportBtn.disabled = false;
  }
});

// ---------- style panel ----------

function setOverride(key, value) {
  const overrides = { ...(site.style?.overrides || {}) };
  if (value === undefined) delete overrides[key];
  else overrides[key] = value;
  if (!site.style) lockStyle(buildCurrent().report);
  site.style = { ...site.style, overrides };
  saveMeta(site);
  update();
}

const syncStylePanel = createStylePanel($('#style-panel'), {
  onChange: setOverride,
  onResetAll: () => {
    site.style = { ...site.style, overrides: {} };
    saveMeta(site);
    update();
  },
});

function toggleStylePanel(open) {
  $('#style-panel').hidden = !open;
  $('#style-toggle').setAttribute('aria-expanded', String(open));
  store.set('stylePanel', open);
}
$('#style-toggle').addEventListener('click', () => toggleStylePanel($('#style-panel').hidden));
toggleStylePanel(store.get('stylePanel', false));

// ---------- resizable editor / preview split ----------
// Stored as a percentage so it scales with the window; CSS clamps it so
// neither side can be squeezed too small.

const panes = $('.panes');
const divider = $('#divider');
const DEFAULT_SPLIT = 44;

function setSplit(percent, save = true) {
  const p = Math.round(Math.max(15, Math.min(85, percent)) * 10) / 10;
  panes.style.setProperty('--editor-w', p + '%');
  divider.setAttribute('aria-valuenow', String(Math.round(p)));
  if (save) store.set('split', p);
}

function currentSplit() {
  return ($('.editor-pane').getBoundingClientRect().width / panes.getBoundingClientRect().width) * 100;
}

divider.addEventListener('pointerdown', e => {
  e.preventDefault();
  divider.setPointerCapture(e.pointerId);
  document.body.classList.add('resizing');
  const rect = panes.getBoundingClientRect();
  const move = ev => setSplit(((ev.clientX - rect.left) / rect.width) * 100, false);
  const up = () => {
    divider.removeEventListener('pointermove', move);
    document.body.classList.remove('resizing');
    // Save what's actually on screen, in case CSS clamped it.
    setSplit(currentSplit());
  };
  divider.addEventListener('pointermove', move);
  divider.addEventListener('pointerup', up, { once: true });
  divider.addEventListener('pointercancel', up, { once: true });
});
divider.addEventListener('dblclick', () => setSplit(DEFAULT_SPLIT));
divider.addEventListener('keydown', e => {
  const step = e.shiftKey ? 10 : 2;
  if (e.key === 'ArrowLeft') setSplit(currentSplit() - step);
  else if (e.key === 'ArrowRight') setSplit(currentSplit() + step);
  else return;
  e.preventDefault();
});
setSplit(store.get('split', DEFAULT_SPLIT), false);

let toastTimer;
function toast(message, ms = 0) {
  const el = $('#toast');
  el.textContent = message;
  el.hidden = false;
  clearTimeout(toastTimer);
  if (ms) toastTimer = setTimeout(() => { el.hidden = true; }, ms);
}

$('#guide-text').textContent = CHEATSHEET;

// ---------- dialogs ----------
// The browser's own prompt() and confirm() aren't available everywhere (Electron-based apps drop prompt),
// so questions are asked in a small dialog. Both resolve instead of blocking.

const askDialog = $('#ask');
function openAsk({ title, message = '', value = null, ok = 'OK', danger = false }) {
  return new Promise(resolve => {
    $('#ask-title').textContent = title;
    $('#ask-message').textContent = message;
    const input = $('#ask-input');
    input.hidden = value === null;
    input.value = value ?? '';
    const okBtn = $('#ask-ok');
    okBtn.textContent = ok;
    okBtn.classList.toggle('danger', danger);
    const done = result => {
      askDialog.removeEventListener('close', onClose);
      $('#ask-cancel').removeEventListener('click', onCancel);
      resolve(result);
    };
    const onClose = () => done(askDialog.returnValue === 'ok' ? (value === null ? true : input.value.trim()) : null);
    const onCancel = () => { askDialog.returnValue = ''; askDialog.close(); };
    askDialog.addEventListener('close', onClose);
    $('#ask-cancel').addEventListener('click', onCancel);
    askDialog.returnValue = '';
    askDialog.showModal();
    if (value !== null) { input.focus(); input.select(); } else okBtn.focus();
  });
}
// Resolves to the entered text, or null if cancelled or left empty.
const ask = (title, value = '', ok = 'Save') => openAsk({ title, value, ok }).then(v => v || null);
const confirmAction = (title, message, ok = 'Delete') => openAsk({ title, message, ok, danger: true }).then(Boolean);

// ---------- menus ----------

function closeMenus(except) {
  document.querySelectorAll('.menu').forEach(m => { if (m !== except) m.hidden = true; });
}

document.addEventListener('click', e => {
  const trigger = e.target.closest('[data-menu]');
  if (trigger) {
    const menu = document.getElementById(trigger.dataset.menu);
    closeMenus(menu);
    menu.hidden = !menu.hidden;
    // The formatting toolbar scrolls, which would clip an absolutely positioned menu.
    if (!menu.hidden && menu.closest('.toolbar')) {
      const r = trigger.getBoundingClientRect();
      menu.style.left = Math.max(8, Math.min(r.left, innerWidth - menu.offsetWidth - 8)) + 'px';
      menu.style.top = r.bottom + 6 + 'px';
    }
    return;
  }
  closeMenus();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenus(); });

const ACTIONS = {
  guide: () => $('#guide').showModal(),
  'reset-style': resetStyle,
  live: () => setLive(!state.live),
  sample: () => openSite(createSite(SAMPLE_SITE)),
};

$('#more-menu').addEventListener('click', e => {
  const btn = e.target.closest('[data-action]');
  if (btn) ACTIONS[btn.dataset.action]();
});

// ---------- formatting toolbar ----------

const COMMANDS = {
  h1: () => editor.prefixLines('# '),
  h2: () => editor.prefixLines('## '),
  h3: () => editor.prefixLines('### '),
  bold: () => editor.wrap('**', '**', 'bold text'),
  italic: () => editor.wrap('*', '*', 'italic text'),
  list: () => editor.prefixLines('- '),
  quote: () => editor.prefixLines('> '),
  table: () => editor.insertTable(),
  link: async () => {
    const href = await ask('Link URL', '', 'Add link');
    if (href) editor.wrap('[', `](${href})`, 'Link text');
  },
  image: async () => {
    const src = await ask('Image URL', '', 'Add image');
    if (src) editor.insertBlock(`![Describe the image](${src})`);
  },
  upload: () => $('#file').click(),
};

$('.toolbar').addEventListener('mousedown', e => {
  // Keep the editor's selection when clicking toolbar buttons.
  if (e.target.closest('button')) e.preventDefault();
});
$('.toolbar').addEventListener('click', e => {
  const btn = e.target.closest('button[data-cmd]');
  if (!btn) return;
  closeMenus();
  COMMANDS[btn.dataset.cmd]();
});

// ---------- local images (upload, drop, paste) ----------
// Stored as data URLs and referenced as asset:<id> so the editor text stays readable.

async function storeImage(file) {
  const id = Math.random().toString(36).slice(2, 8);
  site.assets[id] = await downscale(file);
  saveAssets(site);
  return `asset:${id}`;
}

const altFromName = file => file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ');

async function addImages(files) {
  const lines = [];
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    lines.push(`![${altFromName(file)}](${await storeImage(file)})`);
  }
  if (lines.length) editor.insertBlock(lines.join('\n'));
}

// For the image popover's "Upload…": resolves to an asset: URL, or null if cancelled.
function pickImage() {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.addEventListener('change', async () => {
      const file = input.files[0];
      resolve(file && file.type.startsWith('image/') ? await storeImage(file) : null);
    });
    input.addEventListener('cancel', () => resolve(null));
    input.click();
  });
}

// Big photos would blow the localStorage quota and bloat the export.
function downscale(file, max = 1600) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(img.src);
      resolve(canvas.toDataURL(file.type === 'image/png' ? 'image/png' : 'image/jpeg', 0.85));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

$('#file').addEventListener('change', e => { addImages([...e.target.files]); e.target.value = ''; });
const editorEl = $('#editor');
editorEl.addEventListener('dragover', e => { if (e.dataTransfer.types.includes('Files')) editorEl.classList.add('drop'); });
editorEl.addEventListener('dragleave', () => editorEl.classList.remove('drop'));
editorEl.addEventListener('drop', () => editorEl.classList.remove('drop'));

// ---------- sites and pages ----------

const newSiteSource = name => `# ${name}\n\nA short description of what you do.\n\n## About\n\nTell people more here.\n`;

function renderSidebar() {
  $('#site-name').textContent = site.name;
  $('#site-menu').innerHTML = listSites().map(s =>
    `<button type="button" data-site="${esc(s.id)}"><span class="sb-label">${esc(s.name)}</span>${s.current ? '<span class="check">✓</span>' : ''}</button>`).join('') +
    `<hr><button type="button" data-site-action="new">New site…</button>
     <button type="button" data-site-action="duplicate">Duplicate site</button>
     <button type="button" data-site-action="delete">Delete site…</button>`;
  $('#page-list').innerHTML = site.pages.map((p, i) => `
    <li class="${p.id === site.currentPage ? 'on' : ''}" data-id="${esc(p.id)}"${i ? ' draggable="true"' : ''}>
      <button type="button" class="pg" data-page="${esc(p.id)}"><span class="pg-name">${esc(p.name)}</span><span class="pg-slug">/${esc(p.slug)}${p.slug ? '/' : ''}</span></button>
      <button type="button" class="pg-more" data-more="${esc(p.id)}" title="Page options" aria-label="Page options"><svg><use href="#i-more"/></svg></button>
    </li>`).join('');
  // A single HTML file can only hold one page, so say which.
  $('#export-html-note').textContent = site.pages.length > 1
    ? `Current page only (“${currentPage(site).name}”), with images and fonts embedded. Use the folder for the whole site.`
    : 'Images and fonts embedded. Easy to share as one file.';
}

function loadCurrentPage() {
  loadingPage = true;
  editor.setValue(site.docs[site.currentPage] ?? '');
  loadingPage = false;
  editor.view.scrollDOM.scrollTop = 0;
}

function openSite(next) {
  site = next;
  state.shownPage = '';
  loadCurrentPage();
  renderSidebar();
  update();
}

function switchPage(id) {
  if (id === site.currentPage) return;
  selectPage(site, id);
  loadCurrentPage();
  renderSidebar();
  update();
}

// Links to a renamed page are rewritten in other pages, so the open one may have changed too.
function syncEditorWithSite() {
  if (editor.getValue() !== site.docs[site.currentPage]) loadCurrentPage();
  renderSidebar();
  update();
}

$('#site-menu').addEventListener('click', async e => {
  const btn = e.target.closest('button');
  if (!btn) return;
  const action = btn.dataset.siteAction;
  if (btn.dataset.site) {
    if (btn.dataset.site !== site.id) openSite(switchSite(btn.dataset.site));
  } else if (action === 'new') {
    const name = await ask('New site', '', 'Create');
    if (name) openSite(createSite({ pages: [{ name: 'Home', source: newSiteSource(name) }] }));
  } else if (action === 'duplicate') {
    openSite(duplicateSite(site));
  } else if (action === 'delete' && await confirmAction(`Delete “${site.name}”?`, "The site and all its pages will be removed. This can't be undone.")) {
    openSite(deleteSite(site));
  }
});

$('#add-page').addEventListener('click', async () => {
  const name = await ask('New page', '', 'Add page');
  if (!name) return;
  addPage(site, name);
  loadCurrentPage();
  renderSidebar();
  update();
  editor.focus();
});

const pageList = $('#page-list');
const pageMenu = $('#page-menu');
let menuPage = '';

pageList.addEventListener('click', e => {
  const more = e.target.closest('[data-more]');
  if (more) {
    e.stopPropagation();
    closeMenus();
    menuPage = more.dataset.more;
    const i = site.pages.findIndex(p => p.id === menuPage);
    pageMenu.querySelector('[data-page-action=delete]').hidden = i === 0;
    pageMenu.querySelector('[data-page-action=up]').hidden = i <= 1;
    pageMenu.querySelector('[data-page-action=down]').hidden = i === 0 || i === site.pages.length - 1;
    const r = more.getBoundingClientRect();
    pageMenu.style.left = Math.min(r.left, innerWidth - 190) + 'px';
    pageMenu.style.top = r.bottom + 4 + 'px';
    pageMenu.hidden = false;
    return;
  }
  const pg = e.target.closest('[data-page]');
  if (pg) switchPage(pg.dataset.page);
});

pageMenu.addEventListener('click', async e => {
  const action = e.target.closest('button')?.dataset.pageAction;
  const i = site.pages.findIndex(p => p.id === menuPage);
  const page = site.pages[i];
  if (!action || !page) return;
  if (action === 'rename') {
    const name = await ask('Rename page', page.name);
    if (name) { renamePage(site, page.id, name); syncEditorWithSite(); }
  } else if (action === 'up' || action === 'down') {
    movePage(site, page.id, i + (action === 'up' ? -1 : 1));
    renderSidebar();
    update();
  } else if (action === 'delete' && await confirmAction(`Delete “${page.name}”?`, "The page will be removed. This can't be undone.")) {
    const wasCurrent = page.id === site.currentPage;
    deletePage(site, page.id);
    if (wasCurrent) loadCurrentPage();
    renderSidebar();
    update();
  }
});

// Drag pages to reorder; Home stays first.
let dragId = '';
pageList.addEventListener('dragstart', e => {
  const li = e.target.closest('li[data-id]');
  if (!li) return;
  dragId = li.dataset.id;
  e.dataTransfer.effectAllowed = 'move';
  e.dataTransfer.setData('text/plain', dragId);
});
pageList.addEventListener('dragover', e => {
  if (!dragId) return;
  e.preventDefault();
  pageList.querySelectorAll('.over').forEach(li => li.classList.remove('over'));
  e.target.closest('li[data-id]')?.classList.add('over');
});
pageList.addEventListener('drop', e => {
  e.preventDefault();
  const li = e.target.closest('li[data-id]');
  if (li && dragId) {
    movePage(site, dragId, site.pages.findIndex(p => p.id === li.dataset.id));
    renderSidebar();
    update();
  }
  dragId = '';
});
pageList.addEventListener('dragend', () => { dragId = ''; pageList.querySelectorAll('.over').forEach(li => li.classList.remove('over')); });

function setSidebar(open) {
  document.body.classList.toggle('sb-closed', !open);
  $('#sidebar-toggle').setAttribute('aria-expanded', String(open));
  store.set('sidebar', open);
}
$('#sidebar-toggle').addEventListener('click', () => setSidebar(document.body.classList.contains('sb-closed')));
setSidebar(store.get('sidebar', innerWidth >= 1000));

renderSidebar();

setLive(state.live);
if (!state.live) update();
