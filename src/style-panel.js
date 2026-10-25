// The Style panel: one control per global style setting. Each control shows the
// automatic choice until the user picks something, and "Auto" clears the pick.

import { PALETTES, FONTS } from './themes.js';

const GROUPS = [
  ['Colors', [
    { key: 'palette', label: 'Palette', type: 'swatches' },
    { key: 'accent', label: 'Accent color', type: 'color' },
  ]],
  ['Typography', [
    { key: 'font', label: 'Fonts', type: 'select', options: FONTS.map(f => [f.name, f.name]) },
    { key: 'scale', label: 'Heading size', type: 'seg', options: [['1.2', 'Small'], ['1.25', 'Medium'], ['1.333', 'Large']] },
  ]],
  ['Shape', [
    { key: 'radius', label: 'Corner radius', type: 'range', min: 0, max: 32 },
    { key: 'buttons', label: 'Buttons', type: 'seg', options: [['square', 'Square'], ['rounded', 'Rounded'], ['pill', 'Pill']] },
    { key: 'cards', label: 'Cards', type: 'seg', options: [['outlined', 'Outline'], ['filled', 'Filled'], ['elevated', 'Shadow']] },
  ]],
  ['Layout', [
    { key: 'hero', label: 'Hero', type: 'seg', options: [['centered', 'Centered'], ['split', 'Split'], ['banner', 'Banner'], ['bigtype', 'Big type']] },
    { key: 'rhythm', label: 'Section backgrounds', type: 'seg', options: [['alternate', 'Alternate'], ['lines', 'Lines'], ['plain', 'Plain']] },
    { key: 'align', label: 'Section headings', type: 'seg', options: [['left', 'Left'], ['center', 'Center']] },
    { key: 'nav', label: 'Navigation', type: 'seg', options: [['bar', 'Bar'], ['pill', 'Floating']] },
    { key: 'numbers', label: 'Section numbers', type: 'seg', options: [['on', 'Show'], ['off', 'Hide']] },
    { key: 'spacing', label: 'Spacing', type: 'seg', options: [['compact', 'Compact'], ['normal', 'Normal'], ['airy', 'Airy']] },
  ]],
];

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// onChange(key, value) sets an override; value undefined clears it.
export function createStylePanel(root, { onChange, onResetAll }) {
  root.innerHTML = `
    <div class="sp-head"><b>Style</b><button class="sp-reset-all" type="button">Reset all to auto</button></div>
    ${GROUPS.map(([title, controls]) => `
      <section class="sp-group"><h3>${title}</h3>${controls.map(controlHtml).join('')}</section>`).join('')}
    <p class="sp-note">Settings apply to this site only. Remix still changes anything left on auto.</p>`;

  root.querySelector('.sp-reset-all').addEventListener('click', onResetAll);
  root.addEventListener('click', e => {
    const auto = e.target.closest('[data-auto]');
    if (auto) return onChange(auto.dataset.auto, undefined);
    const opt = e.target.closest('[data-set]');
    if (opt) onChange(opt.closest('[data-key]').dataset.key, opt.dataset.set);
  });
  root.addEventListener('input', e => {
    const key = e.target.closest('[data-key]')?.dataset.key;
    if (key && (e.target.type === 'range' || e.target.type === 'color')) onChange(key, e.target.type === 'range' ? Number(e.target.value) : e.target.value);
  });
  root.addEventListener('change', e => {
    const key = e.target.closest('[data-key]')?.dataset.key;
    if (key && e.target.tagName === 'SELECT') onChange(key, e.target.value || undefined);
  });

  // Reflects the current style without rebuilding the DOM, so a slider being dragged keeps working.
  return function sync(current, auto, overrides) {
    for (const el of root.querySelectorAll('[data-key]')) {
      const key = el.dataset.key;
      const set = overrides[key] !== undefined;
      el.classList.toggle('is-set', set);
      const autoLabel = el.querySelector('.sp-auto-value');
      // An unset accent follows whichever palette is active, not the automatic palette.
      const autoValue = key === 'accent' ? current.accent : auto[key];
      if (autoLabel) autoLabel.textContent = `Auto · ${label(key, autoValue)}`;
      for (const opt of el.querySelectorAll('[data-set]')) {
        opt.classList.toggle('on', opt.dataset.set === String(current[key]));
        opt.classList.toggle('auto-pick', !set && opt.dataset.set === String(auto[key]));
      }
      const input = el.querySelector('input, select');
      if (!input || input === document.activeElement) continue;
      if (input.type === 'range') { input.value = current.radius; el.querySelector('output').textContent = current.radius + 'px'; }
      if (input.type === 'color') input.value = normalizeHex(current.accent);
      if (input.tagName === 'SELECT') input.value = set ? current.font : '';
    }
    const range = root.querySelector('input[type=range]');
    if (range && range === document.activeElement) range.nextElementSibling.textContent = range.value + 'px';
  };
}

function controlHtml(c) {
  const head = `<div class="sp-label"><span>${c.label}</span><span class="sp-auto-value"></span><button type="button" class="sp-clear" data-auto="${c.key}">Auto</button></div>`;
  let body = '';
  if (c.type === 'seg') {
    body = `<div class="sp-seg">${c.options.map(([v, l]) => `<button type="button" data-set="${v}">${l}</button>`).join('')}</div>`;
  } else if (c.type === 'swatches') {
    body = `<div class="sp-swatches">${PALETTES.map(p => `
      <button type="button" data-set="${esc(p.name)}" title="${esc(p.name)}" aria-label="${esc(p.name)} palette"
        style="--sw-bg:${p.bg};--sw-accent:${p.accent};--sw-text:${p.text}"><span></span></button>`).join('')}</div>`;
  } else if (c.type === 'color') {
    body = `<input type="color" aria-label="Accent color">`;
  } else if (c.type === 'range') {
    body = `<div class="sp-range"><input type="range" min="${c.min}" max="${c.max}" step="1" aria-label="${c.label}"><output></output></div>`;
  } else if (c.type === 'select') {
    body = `<select aria-label="${c.label}"><option value="">Auto</option>${c.options.map(([v, l]) => `<option value="${esc(v)}">${esc(l)}</option>`).join('')}</select>`;
  }
  return `<div class="sp-control sp-type-${c.type}" data-key="${c.key}">${head}${body}</div>`;
}

const LABELS = { bigtype: 'Big type', pill: 'Pill', elevated: 'Shadow', outlined: 'Outline', alternate: 'Alternate', on: 'Show', off: 'Hide', '1.2': 'Small', '1.25': 'Medium', '1.333': 'Large' };

function label(key, value) {
  if (value === undefined || value === null) return '';
  if (key === 'radius') return value + 'px';
  if (key === 'nav' && value === 'pill') return 'Floating';
  if (key === 'accent') return String(value).toUpperCase();
  const v = String(value);
  return LABELS[v] || v.charAt(0).toUpperCase() + v.slice(1);
}

function normalizeHex(hex) {
  let h = String(hex || '#000000').replace('#', '');
  if (h.length === 3) h = h.split('').map(c => c + c).join('');
  return '#' + h.slice(0, 6);
}
