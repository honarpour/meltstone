// Packages a built site so it works offline: every image (uploaded or remote)
// and the Google Fonts files are downloaded and either written next to
// index.html in a zip, or embedded as data URLs in a single HTML file.

import { build } from './render.js';
import { zip } from './zip.js';

const IMG_RE = /!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"[^"]*")?\s*\)/g;
const EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/gif': 'gif', 'image/svg+xml': 'svg', 'image/avif': 'avif' };
// Only the subsets an English/European site needs; the full set is dozens of files.
const FONT_SUBSETS = ['latin', 'latin-ext'];

// format: 'zip' | 'html'. Returns the file to download plus the images that couldn't be fetched.
export async function exportSite(source, options, format) {
  const { report } = build(source, options);
  const slug = report.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'site';

  const [images, fonts] = await Promise.all([collectImages(source, options.assets), collectFonts(report.fontsUrl)]);
  const failed = images.filter(i => !i.blob).map(i => i.src);
  const ok = images.filter(i => i.blob);

  if (format === 'html') {
    const urlMap = {};
    for (const img of ok) urlMap[img.src] = await dataUrl(img.blob);
    let fontCss = '';
    if (fonts) {
      fontCss = fonts.css;
      for (const f of fonts.files) fontCss = fontCss.split(f.url).join(await dataUrl(f.blob));
    }
    const { html } = build(source, { ...options, urlMap, fontCss });
    return { blob: new Blob([html], { type: 'text/html' }), filename: `${slug}.html`, failed, fontsOk: !!fonts };
  }

  const urlMap = {};
  const files = [];
  const used = new Set();
  for (const img of ok) {
    const name = uniqueName(used, img.name, EXT[img.blob.type] || 'jpg');
    urlMap[img.src] = `images/${name}`;
    files.push({ name: `${slug}/images/${name}`, data: new Uint8Array(await img.blob.arrayBuffer()) });
  }
  let fontHref = '';
  if (fonts) {
    let css = fonts.css;
    for (const [i, f] of fonts.files.entries()) {
      const ext = (f.url.match(/\.(woff2?|ttf|otf)(?:$|\?)/) || [, 'woff2'])[1];
      const name = `${f.family.toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${i + 1}.${ext}`;
      css = css.split(f.url).join(name);
      files.push({ name: `${slug}/fonts/${name}`, data: new Uint8Array(await f.blob.arrayBuffer()) });
    }
    files.push({ name: `${slug}/fonts/fonts.css`, data: css });
    fontHref = 'fonts/fonts.css';
  }
  const { html } = build(source, { ...options, urlMap, fontHref });
  files.unshift({ name: `${slug}/index.html`, data: html });
  return { blob: zip(files), filename: `${slug}.zip`, failed, fontsOk: !!fonts };
}

async function collectImages(source, assets) {
  const seen = new Map();
  for (const m of source.matchAll(IMG_RE)) {
    const [, alt, src] = m;
    if (seen.has(src)) continue;
    let href = src;
    if (src.startsWith('asset:')) href = assets[src.slice(6)] || '';
    else if (/^[\w.-]+\.[a-z]{2,}\//i.test(src)) href = 'https://' + src;
    // Relative paths are left alone: they already point next to the page.
    if (!/^(https?:|data:image\/)/i.test(href)) continue;
    seen.set(src, { src, href, name: baseName(alt, src) });
  }
  return Promise.all([...seen.values()].map(async img => {
    try {
      const res = await fetch(img.href);
      if (!res.ok) throw new Error(res.status);
      const blob = await res.blob();
      if (!blob.type.startsWith('image/')) throw new Error('not an image');
      return { ...img, blob };
    } catch {
      return img; // usually a host that doesn't allow cross-origin downloads
    }
  }));
}

async function collectFonts(cssUrl) {
  try {
    const res = await fetch(cssUrl);
    if (!res.ok) return null;
    const blocks = (await res.text()).split(/(?=\/\*\s*[\w-]+\s*\*\/)/);
    const subsetOf = b => (b.match(/^\/\*\s*([\w-]+)\s*\*\//) || [])[1];
    // Without subset markers (some user agents get a single file per weight) keep everything.
    const kept = blocks.some(subsetOf) ? blocks.filter(b => FONT_SUBSETS.includes(subsetOf(b))) : blocks;
    const css = kept.join('');
    const refs = [...css.matchAll(/font-family:\s*'([^']+)'[\s\S]*?url\((https:[^)]+)\)/g)];
    const unique = [...new Map(refs.map(m => [m[2], { family: m[1], url: m[2] }])).values()];
    const files = await Promise.all(unique.map(async f => ({ ...f, blob: await (await fetch(f.url)).blob() })));
    return { css, files };
  } catch {
    return null; // offline: the exported site falls back to system fonts
  }
}

function baseName(alt, src) {
  const fromAlt = alt.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
  if (fromAlt) return fromAlt;
  const file = src.split(/[?#]/)[0].split('/').pop().replace(/\.[a-z0-9]+$/i, '');
  return file.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'image';
}

function uniqueName(used, base, ext) {
  let name = `${base}.${ext}`;
  for (let i = 2; used.has(name); i++) name = `${base}-${i}.${ext}`;
  used.add(name);
  return name;
}

function dataUrl(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = reject;
    r.readAsDataURL(blob);
  });
}
