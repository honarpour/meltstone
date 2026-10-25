import { build } from './render.js';
import { createEditor } from './editor.js';
import { previewRuntime } from './preview-runtime.js';
import { exportSite } from './export.js';
import { createStylePanel } from './style-panel.js';
import { SAMPLE, CHEATSHEET } from './sample.js';

const $ = sel => document.querySelector(sel);
const frame = $('#preview');

const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem('meltstone:' + key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem('meltstone:' + key, JSON.stringify(value)); } catch { /* quota or disabled */ }
  },
};

const state = {
  remix: store.get('remix', 0),
  // { seed, mood, overrides } fixed per document so the look doesn't change while typing;
  // overrides are the Style panel settings.
  style: store.get('style', null),
  live: store.get('live', true),
  assets: store.get('assets', {}),
  lastBuilt: null,
  frameReady: false,
  pendingHtml: null,
};

let liveTimer;
const editor = createEditor({
  parent: $('#editor'),
  doc: store.get('doc', SAMPLE),
  resolveAsset: src => (src.startsWith('asset:') ? state.assets[src.slice(6)] || '' : src),
  onChange(text) {
    store.set('doc', text);
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
});

// ---------- preview ----------

function siteOptions() {
  const s = state.style || {};
  return { remix: state.remix, seed: s.seed, mood: s.mood, overrides: s.overrides || {}, assets: state.assets };
}

function buildSite(text) {
  return build(text, siteOptions());
}

// Fixes the style to the document as it is now: its title seeds the theme and its detected mood is kept.
function lockStyle(report) {
  state.style = { ...state.style, seed: report.title, mood: report.detectedMood };
  store.set('style', state.style);
}

// The first build loads the page with the runtime script; later builds are
// posted to it and patched in place.
function showInPreview(html) {
  if (state.frameReady) {
    frame.contentWindow.postMessage({ meltstoneHtml: html }, '*');
    return;
  }
  state.pendingHtml = html;
  if (!frame.srcdoc) {
    frame.srcdoc = html.replace('</body>', `<script id="meltstone-runtime">(${previewRuntime})()<\/script></body>`);
  }
}

addEventListener('message', e => {
  if (e.source !== frame.contentWindow || !e.data?.meltstoneReady) return;
  state.frameReady = true;
  if (state.pendingHtml) showInPreview(state.pendingHtml);
  state.pendingHtml = null;
});

function update() {
  clearTimeout(liveTimer);
  const text = editor.getValue();
  let result = buildSite(text);
  if (!state.style && result.report.title !== 'Untitled') {
    lockStyle(result.report);
    result = buildSite(text);
  }
  showInPreview(result.html);
  state.lastBuilt = text;
  renderReport(result.report);
  syncStylePanel(result.report.style, result.report.autoStyle, state.style?.overrides || {});
  setStale(false);
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

function renderReport(r) {
  $('#style-summary').innerHTML =
    `<b>${esc(r.palette)}</b> · ${esc(r.fonts)} · ${esc(cap(r.hero))} hero${state.remix ? ` · Style ${state.remix + 1}` : ''}`;
  $('#sections-btn').innerHTML = `${r.sections.length} section${r.sections.length === 1 ? '' : 's'}<svg class="chev"><use href="#i-chevron"/></svg>`;
  $('#sections-menu').innerHTML =
    r.sections.map(s => `<button type="button" class="row" data-id="${esc(s.id)}"><span>${esc(s.title)}</span><span>${esc(s.kind)}</span></button>`).join('') +
    `<div class="hint">Layouts are picked from each section's content. Override with <code>## Title {gallery}</code></div>`;
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
  const { report } = build(editor.getValue());
  state.style = { ...state.style, seed: state.style?.seed ?? report.title, mood: report.detectedMood };
  store.set('style', state.style);
  setRemix(state.remix + 1);
});

function setRemix(n) {
  state.remix = n;
  store.set('remix', n);
  update();
}

function resetStyle() {
  state.style = null;
  store.set('style', null);
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
    const options = siteOptions();
    const { blob, filename, failed, fontsOk } = await exportSite(editor.getValue(), options, btn.dataset.export);
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    const notes = [];
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
  const overrides = { ...(state.style?.overrides || {}) };
  if (value === undefined) delete overrides[key];
  else overrides[key] = value;
  if (!state.style) lockStyle(buildSite(editor.getValue()).report);
  state.style = { ...state.style, overrides };
  store.set('style', state.style);
  update();
}

const syncStylePanel = createStylePanel($('#style-panel'), {
  onChange: setOverride,
  onResetAll: () => {
    state.style = { ...state.style, overrides: {} };
    store.set('style', state.style);
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
    return;
  }
  if (!e.target.closest('.menu.sections')) closeMenus();
});
$('#sections-menu').addEventListener('click', e => {
  const row = e.target.closest('.row[data-id]');
  if (!row) return;
  frame.contentWindow?.postMessage({ meltstoneScroll: row.dataset.id }, '*');
  closeMenus();
});
document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenus(); });

const ACTIONS = {
  guide: () => $('#guide').showModal(),
  'reset-style': resetStyle,
  live: () => setLive(!state.live),
  sample: () => {
    if (editor.getValue().trim() && !confirm('Replace your content with the example?')) return;
    editor.setValue(SAMPLE);
    resetStyle();
  },
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
  link: () => {
    const href = prompt('Link URL (https://…, mailto:…, or #section)');
    if (href) editor.wrap('[', `](${href.trim()})`, 'Link text');
  },
  image: () => {
    const src = prompt('Image URL');
    if (src) editor.insertBlock(`![Describe the image](${src.trim()})`);
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
  state.assets[id] = await downscale(file);
  store.set('assets', state.assets);
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

setLive(state.live);
if (!state.live) update();
