// Sites and pages, and how they're kept in localStorage.
// A site is an ordered list of pages (one Markdown document each; the first is Home) that share
// a style and a set of uploaded images. Keys are split so typing only rewrites the current page:
//   sites                 { sites: [{ id, name }], current }
//   site:<id>:meta        { name, pages: [{ id, name, slug }], currentPage, style, remix }
//   site:<id>:doc:<page>  the page's Markdown
//   site:<id>:assets      { <asset id>: data URL }

const PREFIX = 'meltstone:';

let onError = () => {};
export const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(PREFIX + key); return v === null ? fallback : JSON.parse(v); } catch { return fallback; }
  },
  set(key, value) {
    try { localStorage.setItem(PREFIX + key, JSON.stringify(value)); return true; } catch (err) { onError(err); return false; }
  },
  remove(key) {
    try { localStorage.removeItem(PREFIX + key); } catch { /* storage disabled */ }
  },
};
// Called when a write fails (usually the browser's storage quota).
export function onStoreError(fn) { onError = fn; }

const newId = () => Math.random().toString(36).slice(2, 8);
const RESERVED = new Set(['home', 'images', 'fonts']);

export function slugify(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'page';
}

function uniqueSlug(site, name, exceptId) {
  const base = slugify(name);
  const taken = new Set(site.pages.filter(p => p.id !== exceptId).map(p => p.slug));
  let slug = RESERVED.has(base) ? base + '-page' : base;
  for (let i = 2; taken.has(slug); i++) slug = `${base}-${i}`;
  return slug;
}

// The first "# Heading" after any front matter.
export function titleOf(markdown) {
  const body = String(markdown).replace(/^---\n[\s\S]*?\n---[ \t]*(\n|$)/, '');
  return (body.match(/^#[ \t]+(.+?)[ \t]*#*[ \t]*$/m) || [])[1] || '';
}

let index = { sites: [], current: '' };
function saveIndex() { store.set('sites', index); }

// ---------- loading and saving ----------

function readSite(id) {
  const meta = store.get(`site:${id}:meta`, null);
  if (!meta) return null;
  const docs = {};
  for (const p of meta.pages) docs[p.id] = store.get(`site:${id}:doc:${p.id}`, '');
  return {
    id, name: meta.name, pages: meta.pages, currentPage: meta.currentPage || meta.pages[0].id,
    style: meta.style || null, remix: meta.remix || 0, assets: store.get(`site:${id}:assets`, {}), docs,
  };
}

export function saveMeta(site) {
  store.set(`site:${site.id}:meta`, {
    name: site.name, pages: site.pages, currentPage: site.currentPage, style: site.style, remix: site.remix,
  });
  const entry = index.sites.find(s => s.id === site.id);
  if (entry && entry.name !== site.name) { entry.name = site.name; saveIndex(); }
}

// Returns true when this changed the site's name (so the sidebar needs redrawing).
export function saveDoc(site, pageId, text) {
  site.docs[pageId] = text;
  store.set(`site:${site.id}:doc:${pageId}`, text);
  // The site is named after its Home page title.
  if (pageId === site.pages[0].id) {
    const title = titleOf(text);
    if (title && title !== site.name) { site.name = title; saveMeta(site); return true; }
  }
  return false;
}

export function saveAssets(site) { store.set(`site:${site.id}:assets`, site.assets); }

// ---------- sites ----------

// Opens the stored sites. A document saved before sites existed becomes the first site; a
// completely fresh start gets `starter` ({ pages: [{ name, source }] }).
export function openSites(starter) {
  index = store.get('sites', null) || { sites: [], current: '' };
  if (!index.sites.length) {
    const legacy = store.get('doc', null);
    const site = legacy === null
      ? createSite(starter, { switchTo: false })
      : createSite({ pages: [{ name: 'Home', source: legacy }], style: store.get('style', null), remix: store.get('remix', 0), assets: store.get('assets', {}) }, { switchTo: false });
    index.current = site.id;
    saveIndex();
    // The copy is complete, so the old keys would only double the storage used (images are large).
    const copy = legacy !== null && readSite(site.id);
    if (copy && copy.docs[site.pages[0].id] === legacy && Object.keys(copy.assets).length === Object.keys(site.assets).length) {
      for (const key of ['doc', 'style', 'remix', 'assets']) store.remove(key);
    }
  }
  return switchSite(index.current);
}

export const listSites = () => index.sites.map(s => ({ ...s, current: s.id === index.current }));

export function switchSite(id) {
  let site = readSite(id);
  if (!site) {
    // A missing site (cleared storage) falls back to any other.
    index.sites = index.sites.filter(s => s.id !== id);
    const other = index.sites[0];
    site = other ? readSite(other.id) : null;
    if (!site) site = createSite({ pages: [{ name: 'Home', source: '# My site\n\nA short description.\n\n## About\n\nTell people what you do.' }] }, { switchTo: false });
  }
  index.current = site.id;
  saveIndex();
  return site;
}

// spec: { name?, pages: [{ name, source }], style?, remix?, assets? }
export function createSite(spec, { switchTo = true } = {}) {
  const id = newId();
  const site = {
    id, name: '', pages: [], currentPage: '', style: spec.style || null, remix: spec.remix || 0, assets: spec.assets || {}, docs: {},
  };
  spec.pages.forEach((p, i) => {
    const page = { id: newId(), name: p.name || (i === 0 ? 'Home' : 'New page'), slug: '' };
    page.slug = i === 0 ? '' : uniqueSlug(site, page.name);
    site.pages.push(page);
    site.docs[page.id] = p.source;
    store.set(`site:${id}:doc:${page.id}`, p.source);
  });
  site.currentPage = site.pages[0].id;
  site.name = spec.name || titleOf(site.docs[site.pages[0].id]) || 'Untitled site';
  saveMeta(site);
  saveAssets(site);
  index.sites.push({ id, name: site.name });
  if (switchTo) index.current = id;
  saveIndex();
  return site;
}

export function duplicateSite(site) {
  return createSite({
    pages: site.pages.map(p => ({ name: p.name, source: site.docs[p.id] })),
    style: site.style, remix: site.remix, assets: { ...site.assets },
  });
}

// Returns the site to show afterwards.
export function deleteSite(site) {
  for (const p of site.pages) store.remove(`site:${site.id}:doc:${p.id}`);
  store.remove(`site:${site.id}:meta`);
  store.remove(`site:${site.id}:assets`);
  index.sites = index.sites.filter(s => s.id !== site.id);
  if (!index.sites.length) return createSite({ pages: [{ name: 'Home', source: '# My site\n\nA short description.' }] });
  return switchSite(index.sites[0].id);
}

// ---------- pages ----------

export const currentPage = site => site.pages.find(p => p.id === site.currentPage) || site.pages[0];

export function addPage(site, name = 'New page') {
  const page = { id: newId(), name, slug: '' };
  page.slug = uniqueSlug(site, name);
  site.pages.push(page);
  site.docs[page.id] = `# ${name}\n\n`;
  store.set(`site:${site.id}:doc:${page.id}`, site.docs[page.id]);
  site.currentPage = page.id;
  saveMeta(site);
  return page;
}

// The slug follows the name, and links to the old one are updated across the site.
export function renamePage(site, pageId, name) {
  const page = site.pages.find(p => p.id === pageId);
  name = name.trim();
  if (!page || !name) return;
  page.name = name;
  if (page.slug) {
    const old = page.slug;
    page.slug = uniqueSlug(site, name, page.id);
    if (old !== page.slug) {
      const re = new RegExp(`\\]\\(\\s*page:${old}(?=[\\s)])`, 'gi');
      for (const p of site.pages) {
        const next = site.docs[p.id].replace(re, `](page:${page.slug}`);
        if (next !== site.docs[p.id]) saveDoc(site, p.id, next);
      }
    }
  }
  saveMeta(site);
}

export function deletePage(site, pageId) {
  const i = site.pages.findIndex(p => p.id === pageId);
  if (i <= 0) return; // Home stays
  site.pages.splice(i, 1);
  delete site.docs[pageId];
  store.remove(`site:${site.id}:doc:${pageId}`);
  if (site.currentPage === pageId) site.currentPage = site.pages[Math.min(i, site.pages.length - 1)].id;
  saveMeta(site);
}

// Moves a page to a new position among the pages after Home.
export function movePage(site, pageId, to) {
  const from = site.pages.findIndex(p => p.id === pageId);
  if (from <= 0) return;
  const [page] = site.pages.splice(from, 1);
  site.pages.splice(Math.max(1, Math.min(to, site.pages.length)), 0, page);
  saveMeta(site);
}

export function selectPage(site, pageId) {
  if (!site.pages.some(p => p.id === pageId)) return;
  site.currentPage = pageId;
  saveMeta(site);
}

// What buildSite() takes.
export const buildInput = site => ({
  pages: site.pages.map(p => ({ slug: p.slug, name: p.name, source: site.docs[p.id] ?? '' })),
});
