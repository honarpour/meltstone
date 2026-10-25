// Document structure + theme -> a complete standalone HTML page.

import { parse, allBlocks, imagesIn, plainText } from './parser.js';
import { classify, KIND_LABELS, TITLED_ITEM_RE, DATE_RE, EMAIL_RE } from './classify.js';
import { chooseTheme, describe } from './themes.js';

// `seed` and `mood` pin the theme choice (see chooseTheme); omit them to derive both from the content.
// For export, `urlMap` swaps image URLs (as written in the Markdown) for local paths or data URLs,
// and `fontHref` / `fontCss` replace the Google Fonts link with a local file or inline CSS.
// `overrides` are Style panel settings (same keys as front matter, see STYLE_OPTIONS).
export function build(source, options = {}) {
  const { html, report } = buildSite({ pages: [{ slug: '', name: '', source }] }, options);
  return { html, report };
}

// A site is a list of pages ({ slug, name, source }); the first is Home (slug ''). All pages share one
// theme. Returns every page's HTML plus `html`/`report` for the `current` page. `standalone` builds
// `current` as a lone page that keeps the site's look but has no page nav or links (single-file export). Local paths in
// `urlMap`/`fontHref` are written relative to the site root; pages in a subfolder get a "../" prefix.
export function buildSite({ pages }, { current = 0, standalone = false, remix = 0, seed, mood, overrides = {}, assets = {}, urlMap = {}, fontHref = '', fontCss = '' } = {}) {
  const docs = pages.map(p => parse(p.source));
  const home = docs[0];
  const multi = pages.length > 1 && !standalone;
  const cur = Math.min(current, pages.length - 1);
  const corpus = docs.map(d => d.sections.map(s => s.title + ' ' + allBlocks(s).map(b => b.text || '').join(' ')).join(' ')).join(' ');
  const theme = chooseTheme(home, { remix, seed, mood, overrides }, corpus);

  const prepared = docs.map(doc => {
    const used = new Set();
    const sections = doc.sections.map((s, i) => {
      const kind = classify(s);
      let id = slug(plainText(s.title)) || 'section';
      while (used.has(id)) id += '-' + i;
      used.add(id);
      return { ...s, kind, id, index: i };
    });
    return { doc, sections };
  });
  const entries = multi ? pages.map((p, i) => ({ slug: p.slug, key: p.slug || 'home', label: p.name || (i === 0 ? 'Home' : docs[i].title) })) : null;

  // Rough width the nav needs (≈ 8.5px per character plus gaps), so links hide before they wrap.
  const navLabels = multi ? entries.map(e => e.label)
    : prepared[cur].sections.filter(s => s.kind !== 'contact' && plainText(s.title).length <= 22).slice(0, 5).map(s => plainText(s.title));
  const navChars = navLabels.reduce((n, l) => n + l.length, 0);
  theme.navBreak = Math.max(820, Math.round(plainText(home.title).length * 11 + navChars * 8.5 + navLabels.length * 24 + 260));

  const results = prepared.map(({ doc, sections }, i) => {
    const ctx = {
      assets, urlMap, fontHref, fontCss, theme, splitCount: 0,
      prefix: multi && pages[i].slug ? '../' : '', pages: entries, current: pages[i].slug, siteTitle: home.title,
    };
    return { slug: pages[i].slug, html: page(doc, sections, theme, ctx) };
  });

  const { doc, sections } = prepared[cur];
  return {
    pages: results,
    html: results[cur].html,
    report: {
      title: home.title,
      mood: theme.mood,
      detectedMood: theme.detectedMood,
      fontsUrl: fontsUrl(theme),
      palette: theme.palette.name,
      fonts: theme.fonts.name,
      hero: theme.hero,
      style: describe(theme),
      autoStyle: theme.auto,
      sections: sections.map(s => ({ title: plainText(s.title), kind: KIND_LABELS[s.kind] || s.kind })),
    },
  };
}

// ---------- inline markdown ----------

function esc(s) {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function unesc(s) {
  return String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&');
}

// Local files are written relative to the site root; pages in a subfolder reach them through ctx.prefix.
function local(path, ctx) {
  return /^(data:|https?:|\/)/i.test(path) ? path : ctx.prefix + path;
}

// Path from the current page to another page of the site, by key ('home' or a slug).
function pageHref(ctx, key) {
  const to = ctx.pages?.find(p => p.key === key);
  if (!to) return key === 'home' ? '#top' : '#';
  if (to.slug === ctx.current) return './';
  return (ctx.current ? '../' : '') + (to.slug ? to.slug + '/' : '');
}

// Links to other pages are written [text](page:slug); data-page lets the preview switch pages.
function pageAttr(href) {
  const m = unesc(href).trim().match(/^page:([\w-]+)$/i);
  return m ? ` data-page="${m[1].toLowerCase()}"` : '';
}

function url(raw, ctx) {
  const u = unesc(raw).trim();
  const pm = u.match(/^page:([\w-]+)$/i);
  if (pm) return esc(pageHref(ctx, pm[1].toLowerCase()));
  if (Object.hasOwn(ctx.urlMap, u)) return esc(local(ctx.urlMap[u], ctx));
  if (u.startsWith('asset:')) return esc(ctx.assets[u.slice(6)] || '');
  if (/^(https?:|mailto:|tel:|#|\/|\.\/|\.\.\/)/i.test(u)) return esc(u);
  if (/^data:image\//i.test(u)) return esc(u);
  if (/^[\w.-]+\.[a-z]{2,}(\/|$)/i.test(u)) return esc('https://' + u);
  if (!/^[a-z][\w+.-]*:/i.test(u)) return esc(u); // relative path
  return '#'; // javascript: and other schemes
}

function external(href) {
  return /^https?:/i.test(unesc(href)) ? ' target="_blank" rel="noopener"' : '';
}

function inline(text, ctx) {
  const codes = [];
  let s = esc(text).replace(/`([^`]+)`/g, (_, c) => `\u0000${codes.push(c) - 1}\u0000`);
  s = s.replace(/!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+&quot;.*?&quot;)?\s*\)/g,
    (_, alt, src) => `<img src="${url(src, ctx)}" alt="${alt}" loading="lazy">`);
  s = s.replace(/\[([^\]]+)\]\(\s*([^)\s]+)(?:\s+&quot;.*?&quot;)?\s*\)/g,
    (_, t, href) => `<a href="${url(href, ctx)}"${external(href)}${pageAttr(href)}>${t}</a>`);
  s = s.replace(/(^|[\s(])(https?:\/\/[^\s<]+[^\s<.,;:!?)])/g, (_, pre, u) => `${pre}<a href="${url(u, ctx)}" target="_blank" rel="noopener">${u.replace(/^https?:\/\//, '')}</a>`);
  s = s.replace(/(^|[\s(])([\w.+-]+@[\w-]+\.[\w.-]*\w)/g, '$1<a href="mailto:$2">$2</a>');
  s = s.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/__(.+?)__/g, '<strong>$1</strong>');
  s = s.replace(/(^|[^*\w])\*(?!\s)(.+?)\*(?!\w)/g, '$1<em>$2</em>').replace(/(^|[^_\w])_(?!\s)(.+?)_(?!\w)/g, '$1<em>$2</em>');
  s = s.replace(/~~(.+?)~~/g, '<del>$1</del>');
  s = s.replace(/\n/g, '<br>');
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[i]}</code>`);
}

function slug(s) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

// ---------- blocks ----------

function figure(img, ctx, cls = '') {
  const cap = img.title || '';
  return `<figure class="${cls}"><img src="${url(esc(img.src), ctx)}" alt="${esc(img.alt)}" loading="lazy">${cap ? `<figcaption>${inline(cap, ctx)}</figcaption>` : ''}</figure>`;
}

function buttons(links, ctx, primaryFirst = true) {
  return `<div class="btns">${links.map((l, i) =>
    `<a class="btn ${i === 0 && primaryFirst ? 'btn-primary' : 'btn-ghost'}" href="${url(esc(l.href), ctx)}"${external(esc(l.href))}${pageAttr(esc(l.href))}>${inline(l.text, ctx)}</a>`).join('')}</div>`;
}

function blocks(list, ctx, opts = {}) {
  return list.map(b => {
    switch (b.type) {
      case 'para': return `<p>${inline(b.text, ctx)}</p>` + (b.images && !opts.skipImages ? b.images.map(i => figure(i, ctx)).join('') : '');
      case 'images':
        if (opts.skipImages) return '';
        return b.items.length === 1 ? figure(b.items[0], ctx, 'solo') : `<div class="mini-grid">${b.items.map(i => figure(i, ctx)).join('')}</div>`;
      case 'links': return buttons(b.items, ctx, !opts.ghostButtons);
      case 'list': {
        const tag = b.ordered ? 'ol' : 'ul';
        return `<${tag}${opts.checks ? ' class="checks"' : ''}>${b.items.map(t => `<li>${inline(t, ctx)}</li>`).join('')}</${tag}>`;
      }
      case 'quote': return `<blockquote><p>${inline(b.text, ctx)}</p>${b.cite ? `<cite>${inline(b.cite, ctx)}</cite>` : ''}</blockquote>`;
      case 'code': return `<pre><code>${esc(b.text)}</code></pre>`;
      case 'hr': return '<hr>';
      case 'table': {
        const cell = (tag, t, i) => `<${tag}${b.align[i] ? ` style="text-align:${b.align[i]}"` : ''}>${inline(t, ctx)}</${tag}>`;
        return `<div class="table-wrap"><table><thead><tr>${b.head.map((t, i) => cell('th', t, i)).join('')}</tr></thead>` +
          `<tbody>${b.rows.map(r => `<tr>${r.map((t, i) => cell('td', t, i)).join('')}</tr>`).join('')}</tbody></table></div>`;
      }
      case 'heading': return `<h4>${inline(b.text, ctx)}</h4>`;
      default: return '';
    }
  }).join('\n');
}

function withoutImages(list) {
  return list.filter(b => b.type !== 'images').map(b => (b.images ? { ...b, images: undefined } : b)).filter(b => b.type !== 'para' || b.text);
}

// ---------- sections ----------

function head(s, ctx, introBlocks = s.intro, extraClass = '') {
  const eyebrow = ctx.theme.eyebrow ? `<span class="eyebrow">${String(s.index + 1).padStart(2, '0')}</span>` : '';
  const intro = blocks(introBlocks, ctx);
  return `<header class="sec-head ${extraClass}">${eyebrow}<h2>${inline(s.title, ctx)}</h2>${intro ? `<div class="lede">${intro}</div>` : ''}</header>`;
}

const RENDER = {
  prose(s, ctx) {
    const subs = s.subsections.map(sub => `<h3>${inline(sub.title, ctx)}</h3>${blocks(sub.blocks, ctx)}`).join('');
    return `${head(s, ctx, [])}<div class="prose">${blocks(s.intro, ctx)}${subs}</div>`;
  },

  split(s, ctx) {
    const all = allBlocks(s);
    const img = imagesIn(all)[0];
    const flip = ctx.splitCount++ % 2 === 1;
    const subs = s.subsections.map(sub => `<h3>${inline(sub.title, ctx)}</h3>${blocks(withoutImages(sub.blocks), ctx)}`).join('');
    return `<div class="split ${flip ? 'flip' : ''}">
      <div class="split-text">${head(s, ctx, [])}<div class="prose">${blocks(withoutImages(s.intro), ctx)}${subs}</div></div>
      <div class="split-media">${figure(img, ctx)}</div>
    </div>`;
  },

  gallery(s, ctx) {
    const all = allBlocks(s);
    const imgs = imagesIn(all);
    const text = withoutImages(s.intro);
    const n = imgs.length;
    const layout = n === 2 ? 'g-two' : n === 3 ? 'g-three' : n >= 5 ? 'g-feature' : 'g-grid';
    return `${head(s, ctx, text)}<div class="gallery ${layout}">${imgs.map(i => figure(i, ctx)).join('')}</div>`;
  },

  cards(s, ctx) {
    const n = s.subsections.length;
    const cols = n === 4 ? 2 : Math.min(n, 3);
    const cards = s.subsections.map(sub => {
      const img = imagesIn(sub.blocks)[0];
      return `<article class="card">${img ? `<div class="card-media">${figure(img, ctx)}</div>` : ''}
        <div class="card-body"><h3>${inline(sub.title, ctx)}</h3>${blocks(withoutImages(sub.blocks), ctx, { ghostButtons: true })}</div></article>`;
    }).join('');
    return `${head(s, ctx)}<div class="cards" style="--cols:${cols}">${cards}</div>`;
  },

  listCards(s, ctx) {
    const list = s.intro.find(b => b.type === 'list');
    const rest = s.intro.filter(b => b !== list);
    const n = list.items.length;
    const cols = n === 4 ? 2 : Math.min(n, 3);
    const cards = list.items.map((t, i) => {
      const m = t.match(TITLED_ITEM_RE);
      return `<article class="card"><div class="card-body"><span class="num">${String(i + 1).padStart(2, '0')}</span><h3>${inline(m[1], ctx)}</h3><p>${inline(m[2], ctx)}</p></div></article>`;
    }).join('');
    return `${head(s, ctx, rest)}<div class="cards" style="--cols:${cols}">${cards}</div>`;
  },

  pricing(s, ctx) {
    const PRICE = /[$€£¥]\s?\d[\d.,]*(?:\s*(?:\/|per)\s*\w+)?/i;
    const plans = s.subsections.map((sub, i) => {
      let name = sub.title;
      let price = '';
      let body = sub.blocks;
      const inTitle = name.match(PRICE);
      if (inTitle) {
        price = inTitle[0];
        name = name.replace(inTitle[0], '').replace(/[\s—–:|-]+$/, '').replace(/^[\s—–:|-]+/, '');
      } else {
        const idx = body.findIndex(b => b.type === 'para' && PRICE.test(b.text));
        if (idx >= 0) {
          price = body[idx].text.match(PRICE)[0];
          const remaining = body[idx].text.replace(PRICE, '').trim();
          body = body.slice();
          if (remaining && plainText(remaining)) body[idx] = { ...body[idx], text: remaining };
          else body.splice(idx, 1);
        }
      }
      const featured = /popular|recommended|best|★|⭐/i.test(sub.title) ||
        (s.subsections.length === 3 && i === 1 && !s.subsections.some(x => /popular|recommended|best|★|⭐/i.test(x.title)));
      name = name.replace(/\(?\s*(most popular|popular|recommended|best value)\s*\)?/i, '').replace(/[★⭐]/g, '').replace(/^[\s—–:|-]+|[\s—–:|-]+$/g, '');
      const [amount, period] = price.split(/\s*(?:\/|per)\s*/i);
      return `<article class="card plan ${featured ? 'featured' : ''}">${featured ? '<span class="badge">Popular</span>' : ''}
        <div class="card-body"><h3>${inline(name, ctx)}</h3>
        ${price ? `<div class="price"><span>${esc(amount)}</span>${period ? `<small>/ ${esc(period)}</small>` : ''}</div>` : ''}
        ${blocks(body, ctx, { checks: true, ghostButtons: !featured })}</div></article>`;
    }).join('');
    return `${head(s, ctx, s.intro, 'center')}<div class="cards plans" style="--cols:${Math.min(s.subsections.length, 3)}">${plans}</div>`;
  },

  faq(s, ctx) {
    const items = s.subsections.map(sub =>
      `<details><summary>${inline(sub.title, ctx)}</summary><div class="answer">${blocks(sub.blocks, ctx)}</div></details>`).join('');
    return `<div class="faq-layout">${head(s, ctx)}<div class="faq">${items}</div></div>`;
  },

  stats(s, ctx) {
    const list = s.intro.find(b => b.type === 'list');
    const rest = s.intro.filter(b => b !== list);
    const NUM = /^\**\s*([~≈]?[$€£¥]?\d[\d.,]*\s*[%+kKmMbBx×]*\+?)\**\s*(?:[—–:-]\s*)?(.*)$/;
    const stats = list.items.map(t => {
      // A bolded lead ("**36h** ferment") is the number as written; otherwise parse it.
      const m = t.match(/^\*\*(.+?)\*\*\s*(?:[—–:-]\s*)?(.*)$/) || t.match(NUM);
      return `<div class="stat"><strong>${esc(m[1].trim())}</strong><span>${inline(m[2], ctx)}</span></div>`;
    }).join('');
    return `${head(s, ctx, rest)}<div class="stats" style="--cols:${Math.min(list.items.length, 4)}">${stats}</div>`;
  },

  timeline(s, ctx) {
    let entries;
    if (s.subsections.length >= 2) {
      entries = s.subsections.map(sub => {
        const padded = sub.title + ' —';
        const m = padded.match(DATE_RE);
        const rest = padded.slice(m[0].length).replace(/\s*—$/, '').trim();
        return { date: m[1], title: rest, body: blocks(sub.blocks, ctx) };
      });
    } else {
      const list = s.intro.find(b => b.type === 'list');
      entries = list.items.map(t => {
        const m = t.match(DATE_RE);
        if (!m) return { date: '', title: '', body: `<p>${inline(t, ctx)}</p>` };
        return { date: m[1], title: '', body: `<p>${inline(t.slice(m[0].length).trim(), ctx)}</p>` };
      });
    }
    const intro = s.subsections.length >= 2 ? s.intro : s.intro.filter(b => b.type !== 'list');
    const items = entries.map(e => `<li><time>${esc(e.date)}</time><div>${e.title ? `<h3>${inline(e.title, ctx)}</h3>` : ''}${e.body}</div></li>`).join('');
    return `${head(s, ctx, intro)}<ol class="timeline">${items}</ol>`;
  },

  testimonials(s, ctx) {
    const all = allBlocks(s);
    const quotes = all.filter(b => b.type === 'quote');
    const rest = s.intro.filter(b => b.type !== 'quote');
    const one = quotes.length === 1;
    return `${head(s, ctx, rest, one ? 'center' : '')}<div class="quotes ${one ? 'one' : ''}">${quotes.map(q =>
      `<blockquote class="card"><p>${inline(q.text, ctx)}</p>${q.cite ? `<cite>${inline(q.cite, ctx)}</cite>` : ''}</blockquote>`).join('')}</div>`;
  },

  contact(s, ctx) {
    const all = allBlocks(s);
    const raw = all.map(b => b.text || (b.items || []).join(' ')).join(' ');
    const email = (plainText(raw).match(EMAIL_RE) || [])[0];
    const hasButtons = all.some(b => b.type === 'links');
    return `<div class="contact card">
      ${head(s, ctx, [])}
      <div class="contact-body">${blocks(all, ctx)}${email && !hasButtons ? buttons([{ text: 'Email ' + email, href: 'mailto:' + email }], ctx) : ''}</div>
    </div>`;
  },

  cta(s, ctx) {
    return `<div class="cta">${head(s, ctx, s.intro.filter(b => b.type !== 'links'), 'center')}${blocks(allBlocks(s).filter(b => b.type === 'links'), ctx)}</div>`;
  },
};

// ---------- page ----------

function hero(doc, theme, ctx) {
  const heroImg = imagesIn(doc.hero)[0];
  const links = doc.hero.filter(b => b.type === 'links').flatMap(b => b.items);
  const others = withoutImages(doc.hero.filter(b => b.type !== 'links'));
  const title = `<h1>${inline(doc.title, ctx)}</h1>`;
  const tagline = doc.tagline ? `<p class="tagline">${inline(doc.tagline, ctx)}</p>` : '';
  const extra = others.length ? `<div class="hero-extra">${blocks(others, ctx)}</div>` : '';
  const btns = links.length ? buttons(links, ctx) : '';
  let variant = theme.hero;
  if (!heroImg && (variant === 'split' || variant === 'banner')) variant = 'centered';

  if (variant === 'banner') {
    return `<header class="hero hero-banner" style="--hero-img:url('${url(esc(heroImg.src), ctx)}')">
      <div class="wrap">${title}${tagline}${extra}${btns}</div></header>`;
  }
  if (variant === 'split') {
    return `<header class="hero hero-split"><div class="wrap split">
      <div class="split-text">${title}${tagline}${extra}${btns}</div>
      <div class="split-media">${figure(heroImg, ctx)}</div></div></header>`;
  }
  if (variant === 'bigtype') {
    return `<header class="hero hero-bigtype"><div class="wrap">${title}
      <div class="hero-row">${tagline}<div>${extra}${btns}</div></div>
      ${heroImg ? `<div class="hero-wide">${figure(heroImg, ctx)}</div>` : ''}</div></header>`;
  }
  return `<header class="hero hero-centered"><div class="wrap">${title}${tagline}${extra}${btns}
    ${heroImg ? `<div class="hero-wide">${figure(heroImg, ctx)}</div>` : ''}</div></header>`;
}

function nav(doc, sections, theme, ctx) {
  const contact = sections.find(s => s.kind === 'contact');
  const cta = contact ? `<a class="btn btn-primary btn-sm" href="#${contact.id}">${esc(plainText(contact.title))}</a>` : '';
  const brandText = esc(plainText(ctx.siteTitle));
  if (!ctx.pages) {
    const items = sections.filter(s => s !== contact && plainText(s.title).length <= 22).slice(0, 5);
    const links = items.map(s => `<a href="#${s.id}">${esc(plainText(s.title))}</a>`).join('');
    return `<nav class="nav nav-${theme.nav}"><div class="wrap nav-inner">
    <a class="brand" href="#top">${brandText}</a>
    <div class="nav-links">${links}</div>${cta}</div></nav>`;
  }
  // Several pages: pages in the bar (a second strip on narrow screens), this page's sections underneath.
  const pageLinks = ctx.pages.map(p =>
    `<a href="${pageHref(ctx, p.key)}" data-page="${p.key}"${p.slug === ctx.current ? ' aria-current="page"' : ''}>${esc(p.label)}</a>`).join('');
  const items = sections.filter(s => s !== contact && plainText(s.title).length <= 22).slice(0, 8);
  const subnav = items.length >= 2
    ? `<div class="subnav subnav-sections"><div class="wrap">${items.map(s => `<a href="#${s.id}">${esc(plainText(s.title))}</a>`).join('')}</div></div>` : '';
  return `<nav class="nav nav-${theme.nav}"><div class="wrap nav-inner">
    <a class="brand" href="${pageHref(ctx, 'home')}" data-page="home">${brandText}</a>
    <div class="nav-links">${pageLinks}</div>${cta}</div>
    <div class="subnav subnav-pages"><div class="wrap">${pageLinks}</div></div>${subnav}</nav>`;
}

function page(doc, sections, theme, ctx) {
  const body = sections.map((s, i) => {
    const render = RENDER[s.kind] || RENDER.prose;
    const alt = theme.rhythm === 'alternate' && i % 2 === 0 && s.kind !== 'cta' ? ' alt' : '';
    return `<section id="${s.id}" class="sec sec-${s.kind}${alt}"><div class="wrap">${render(s, ctx)}</div></section>`;
  }).join('\n');

  const footerLinks = ctx.pages
    ? ctx.pages.map(p => `<a href="${pageHref(ctx, p.key)}" data-page="${p.key}">${esc(p.label)}</a>`).join('')
    : sections.slice(0, 6).map(s => `<a href="#${s.id}">${esc(plainText(s.title))}</a>`).join('');
  const siteName = esc(plainText(ctx.siteTitle));
  const pageTitle = ctx.pages && ctx.current ? `${esc(plainText(doc.title))} · ${siteName}` : siteName;
  const description = plainText(doc.tagline).slice(0, 160);

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${ctx.pages && ctx.current ? pageTitle : esc(plainText(doc.title))}</title>
${description ? `<meta name="description" content="${esc(description)}">` : ''}
${fontTags(theme, ctx)}
<style>${css(theme)}</style>
</head><body id="top" class="rhythm-${theme.rhythm} cards-${theme.cardStyle} align-${theme.headingAlign}">
${nav(doc, sections, theme, ctx)}
${hero(doc, theme, ctx)}
<main>${body}</main>
<footer class="footer"><div class="wrap footer-inner">
  <span class="brand">${siteName}</span>
  <div class="footer-links">${footerLinks}</div>
  <small>© ${new Date().getFullYear()} ${siteName}</small>
</div></footer>
</body></html>`;
}

function fontsUrl(theme) {
  return `https://fonts.googleapis.com/css2?${theme.fonts.query}&display=swap`;
}

function fontTags(theme, ctx) {
  if (ctx.fontCss) return `<style>${ctx.fontCss}</style>`;
  if (ctx.fontHref) return `<link rel="stylesheet" href="${esc(local(ctx.fontHref, ctx))}">`;
  return `<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="${fontsUrl(theme)}">`;
}

function css(t) {
  const p = t.palette;
  const f = t.fonts;
  const r = t.radius;
  const k = t.scale;
  const hs = f.headScale || 1;
  const navBreak = t.navBreak;
  // Buttons follow the corner radius unless a shape was chosen.
  const shape = t.buttons || (r >= 16 ? 'pill' : 'match');
  const btnRadius = { square: '0', rounded: `${Math.max(6, Math.min(r, 12))}px`, pill: '999px', match: 'var(--r)' }[shape];
  const space = { compact: 0.65, normal: 1, airy: 1.35 }[t.spacing] || 1;
  const shadow = p.dark ? '0 1px 0 rgba(255,255,255,.04), 0 12px 32px rgba(0,0,0,.35)' : '0 1px 2px rgba(0,0,0,.04), 0 12px 32px rgba(0,0,0,.07)';
  return `
:root{--bg:${p.bg};--surface:${p.surface};--text:${p.text};--muted:${p.muted};--border:${p.border};--accent:${p.accent};--on-accent:${p.onAccent};--link:${p.link};
--r:${r}px;--r-lg:${Math.round(r * 1.5)}px;--r-btn:${btnRadius};--space:${space};--shadow:${shadow};
--head:'${f.head}',Georgia,serif;--body:'${f.body}',system-ui,-apple-system,sans-serif;
--h1:clamp(${(2.4 * hs).toFixed(2)}rem,${(5.5 * hs).toFixed(2)}vw,${(k ** 6 * hs).toFixed(2)}rem);--h2:clamp(${(1.7 * hs).toFixed(2)}rem,${(3.2 * hs).toFixed(2)}vw,${(k ** 4 * hs).toFixed(2)}rem);--h3:${(k * hs).toFixed(2)}rem;
color-scheme:${p.dark ? 'dark' : 'light'}}
*,*::before,*::after{box-sizing:border-box}
html{scroll-behavior:smooth;-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--text);font:400 1.0625rem/1.65 var(--body);-webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility}
img{max-width:100%;display:block}
a{color:var(--link);text-underline-offset:.2em;text-decoration-thickness:1px}
a:hover{text-decoration-thickness:2px}
h1,h2,h3,h4{font-family:var(--head);font-weight:${f.weight};letter-spacing:${f.tracking};line-height:1.1;margin:0 0 .5em;text-wrap:balance}
h1{font-size:var(--h1);line-height:1.02}
h2{font-size:var(--h2)}
h3{font-size:var(--h3);line-height:1.25}
p{margin:0 0 1em;text-wrap:pretty}
.wrap{width:min(1120px,100% - 40px);margin-inline:auto}
figure{margin:0}
figure img{width:100%;height:100%;object-fit:cover;border-radius:var(--r);background:var(--surface)}
figcaption{font-size:.875rem;color:var(--muted);margin-top:.6em}
code{font:.9em ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--surface);padding:.1em .35em;border-radius:4px}
pre{background:var(--surface);border:1px solid var(--border);padding:1rem 1.25rem;border-radius:var(--r);overflow:auto}
pre code{background:none;padding:0}
hr{border:0;border-top:1px solid var(--border);margin:2rem 0}
.table-wrap{overflow-x:auto;margin:1.5rem 0;border:1px solid var(--border);border-radius:var(--r)}
table{width:100%;border-collapse:collapse;font-size:.95rem}
th,td{padding:.7em 1em;text-align:left;border-bottom:1px solid var(--border);vertical-align:top}
th{font-weight:600;background:var(--surface);white-space:nowrap}
tbody tr:last-child td{border-bottom:0}
ul,ol{padding-left:1.25em;margin:0 0 1em}
li{margin:.3em 0}
li::marker{color:var(--accent)}
blockquote{margin:1.5rem 0;padding-left:1.25rem;border-left:3px solid var(--accent);font-size:1.15rem}
blockquote p{margin:0}
cite{display:block;font-style:normal;font-size:.9rem;color:var(--muted);margin-top:.75em}
cite::before{content:'— '}

.btns{display:flex;flex-wrap:wrap;gap:.75rem;margin-top:1.5rem}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:.4em;padding:.8em 1.4em;border-radius:var(--r-btn);font-weight:600;font-size:.95rem;text-decoration:none;line-height:1.1;transition:transform .15s,background .15s,border-color .15s;border:1.5px solid transparent}
.btn:hover{transform:translateY(-1px);text-decoration:none}
.btn-primary{background:var(--accent);color:var(--on-accent)}
.btn-ghost{border-color:var(--border);color:var(--text)}
.btn-ghost:hover{border-color:var(--text)}
.btn-sm{padding:.55em 1.05em;font-size:.875rem}

/* nav */
.nav{position:sticky;top:0;z-index:10;background:color-mix(in srgb,var(--bg) 82%,transparent);backdrop-filter:saturate(1.4) blur(12px);-webkit-backdrop-filter:saturate(1.4) blur(12px);border-bottom:1px solid var(--border)}
.nav-pill{background:transparent;border:0;padding-top:12px;backdrop-filter:none;-webkit-backdrop-filter:none}
.nav-pill .nav-inner{background:color-mix(in srgb,var(--surface) 85%,transparent);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);border:1px solid var(--border);border-radius:999px;padding:8px 8px 8px 20px}
.nav-inner{display:flex;align-items:center;gap:2rem;min-height:64px}
.nav-pill .nav-inner{min-height:0}
.brand{flex:none;max-width:60%;font-family:var(--head);font-weight:${f.weight};font-size:1.15rem;letter-spacing:${f.tracking};color:var(--text);text-decoration:none;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.nav-links{display:flex;gap:1.5rem;margin-left:auto}
.nav-links a{color:var(--muted);text-decoration:none;font-size:.925rem;font-weight:500;white-space:nowrap}
.nav-links a:hover{color:var(--text)}
.nav-links:empty+.btn,.nav-links:empty{margin-left:auto}
.nav-links a[aria-current=page],.subnav a[aria-current=page]{color:var(--text)}
.subnav{border-top:1px solid var(--border)}
.nav-pill .subnav{border:0;padding-top:4px}
.subnav .wrap{display:flex;gap:1.25rem;overflow-x:auto;padding:.5rem 0;scrollbar-width:none}
.subnav a{color:var(--muted);font-size:.85rem;font-weight:500;white-space:nowrap;text-decoration:none}
.subnav a:hover{color:var(--text)}
.subnav-pages{display:none}

/* hero */
.hero{padding:calc(clamp(4rem,10vw,8rem)*var(--space)) 0 calc(clamp(3rem,8vw,6rem)*var(--space))}
.tagline{font-size:clamp(1.15rem,1.8vw,1.4rem);color:var(--muted);max-width:40ch;line-height:1.5}
.hero-extra{color:var(--muted);max-width:60ch}
.hero-centered{text-align:center}
.hero-centered h1,.hero-centered .tagline,.hero-centered .hero-extra{margin-inline:auto;max-width:22ch}
.hero-centered .tagline,.hero-centered .hero-extra{max-width:46ch}
.hero-centered .btns{justify-content:center}
.hero-wide{margin-top:clamp(2.5rem,6vw,4.5rem)}
.hero-wide img{aspect-ratio:21/9;border-radius:var(--r-lg)}
.hero-bigtype h1{font-size:clamp(3rem,11vw,9rem);line-height:.92;margin-bottom:.4em;max-width:14ch}
.hero-row{display:grid;grid-template-columns:1fr 1fr;gap:2rem;align-items:end;border-top:1px solid var(--border);padding-top:1.5rem}
.hero-row .btns{margin-top:0;justify-content:flex-end}
.hero-banner{position:relative;min-height:min(86vh,760px);display:flex;align-items:flex-end;color:#fff;background:linear-gradient(180deg,rgba(0,0,0,.05) 20%,rgba(0,0,0,.7)),var(--hero-img) center/cover no-repeat,var(--surface)}
.hero-banner h1{max-width:16ch;color:#fff}
.hero-banner .tagline,.hero-banner .hero-extra{color:rgba(255,255,255,.88)}
.hero-banner .btn-ghost{color:#fff;border-color:rgba(255,255,255,.5)}
.hero-banner .btn-ghost:hover{border-color:#fff}
.hero-split .split-media img{aspect-ratio:4/5;border-radius:var(--r-lg)}

/* sections */
.sec{padding:calc(clamp(4rem,9vw,7rem)*var(--space)) 0}
.sec.alt{background:var(--surface)}
.rhythm-lines .sec+.sec{border-top:1px solid var(--border)}
.sec-head{margin-bottom:calc(clamp(2rem,4vw,3rem)*var(--space));max-width:60ch}
.align-center .sec-head,.sec-head.center{text-align:center;margin-inline:auto}
.align-center .split .sec-head,.align-center .faq-layout .sec-head,.align-center .contact .sec-head{text-align:left;margin-inline:0}
.lede{color:var(--muted);font-size:1.1rem}
.lede .btns{justify-content:inherit}
.eyebrow{display:block;font:600 .8rem/1 var(--body);letter-spacing:.14em;color:var(--accent);margin-bottom:1rem}
.prose{max-width:68ch}
.align-center .sec-prose .prose{margin-inline:auto}
.prose h3{margin-top:2rem}
.solo{margin:2rem 0}
.mini-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:1.5rem 0}
.mini-grid img{aspect-ratio:1}

.split{display:grid;grid-template-columns:1.05fr 1fr;gap:clamp(2rem,6vw,5rem);align-items:center}
.split.flip .split-media{order:-1}
.split .sec-head{margin-bottom:1.25rem}
.split-media img{aspect-ratio:4/3;border-radius:var(--r-lg)}

.gallery{display:grid;gap:clamp(10px,1.5vw,18px)}
.gallery img{aspect-ratio:4/3}
.g-two{grid-template-columns:1fr 1fr}
.g-grid{grid-template-columns:repeat(auto-fill,minmax(240px,1fr))}
.g-three{grid-template-columns:1.4fr 1fr;grid-template-rows:1fr 1fr}
.g-three figure:first-child{grid-row:span 2}
.g-three img{height:100%;aspect-ratio:auto;min-height:200px}
.g-feature{grid-template-columns:repeat(3,1fr)}
.g-feature figure:first-child{grid-column:span 2;grid-row:span 2}
.g-feature figure:first-child img{height:100%;aspect-ratio:auto}

.cards{display:grid;grid-template-columns:repeat(var(--cols),1fr);gap:clamp(14px,2vw,24px)}
.card{border-radius:var(--r-lg);overflow:hidden;display:flex;flex-direction:column;margin:0}
.cards-outlined .card{border:1px solid var(--border)}
.cards-filled .card{background:var(--surface)}
.cards-filled .alt .card{background:var(--bg)}
.cards-elevated .card{background:${p.dark ? 'var(--surface)' : 'var(--bg)'};box-shadow:var(--shadow);${p.dark ? 'border:1px solid var(--border);' : ''}}
.cards-elevated .alt .card{background:var(--bg)}
.card-body{padding:clamp(1.25rem,2.5vw,2rem);flex:1;display:flex;flex-direction:column}
.card-body>:last-child{margin-bottom:0}
.card-body .btns{margin-top:auto;padding-top:1rem}
.card-media img{aspect-ratio:16/10;border-radius:0}
.card p{color:var(--muted)}
.num{font:600 .85rem/1 var(--body);color:var(--accent);margin-bottom:1.25rem;letter-spacing:.08em}

.plans{align-items:stretch}
.plan{position:relative}
.plan.featured{outline:2px solid var(--accent);outline-offset:-2px}
.badge{position:absolute;top:1rem;right:1rem;background:var(--accent);color:var(--on-accent);font:600 .72rem/1 var(--body);letter-spacing:.06em;text-transform:uppercase;padding:.45em .7em;border-radius:999px}
.price{display:flex;align-items:baseline;gap:.35rem;margin:.25rem 0 1.25rem}
.price span{font-family:var(--head);font-size:2.6rem;font-weight:${f.weight};letter-spacing:${f.tracking};line-height:1}
.price small{color:var(--muted)}
.checks{list-style:none;padding:0}
.checks li{padding-left:1.6em;position:relative;color:var(--text)}
.checks li::before{content:'';position:absolute;left:0;top:.45em;width:.95em;height:.55em;border-left:2px solid var(--accent);border-bottom:2px solid var(--accent);transform:rotate(-45deg) scale(.8)}
.plan .btns .btn{flex:1}

.faq-layout{display:grid;grid-template-columns:1fr 1.6fr;gap:clamp(2rem,6vw,5rem);align-items:start}
.faq details{border-bottom:1px solid var(--border);padding:1.1rem 0}
.faq details:first-child{border-top:1px solid var(--border)}
.faq summary{cursor:pointer;list-style:none;font-weight:600;font-size:1.1rem;display:flex;justify-content:space-between;gap:1rem}
.faq summary::-webkit-details-marker{display:none}
.faq summary::after{content:'+';color:var(--accent);font-size:1.4rem;line-height:1;transition:transform .2s}
.faq details[open] summary::after{transform:rotate(45deg)}
.answer{color:var(--muted);padding-top:.75rem}
.answer>:last-child{margin-bottom:0}

.stats{display:grid;grid-template-columns:repeat(var(--cols),1fr);gap:1px;background:var(--border);border:1px solid var(--border);border-radius:var(--r-lg);overflow:hidden}
.stat{background:var(--bg);padding:clamp(1.5rem,3vw,2.5rem);display:flex;flex-direction:column;gap:.5rem}
.alt .stat{background:var(--surface)}
.stat strong{font-family:var(--head);font-size:clamp(2.2rem,4.5vw,3.4rem);font-weight:${f.weight};letter-spacing:${f.tracking};line-height:1;color:var(--accent)}
${p.onAccent === '#1d1a12' || p.name === 'Mono' ? '.stat strong{color:var(--text)}' : ''}
.stat span{color:var(--muted)}

.timeline{list-style:none;padding:0;margin:0;max-width:760px;position:relative}
.timeline li{display:grid;grid-template-columns:140px 1fr;gap:2rem;padding:0 0 2.25rem;margin:0;position:relative}
.timeline li::before{content:'';position:absolute;left:140px;margin-left:1rem;top:.55em;width:9px;height:9px;border-radius:50%;background:var(--accent);transform:translateX(-50%)}
.timeline li::after{content:'';position:absolute;left:140px;margin-left:1rem;top:1.4em;bottom:0;width:1px;background:var(--border)}
.timeline li:last-child::after{display:none}
.timeline time{font-weight:600;color:var(--accent);font-variant-numeric:tabular-nums;text-align:right}
${p.onAccent === '#1d1a12' ? '.timeline time,.eyebrow,.num{color:var(--link)}' : ''}
.timeline li>div{padding-left:1rem}
.timeline h3{font-size:1.15rem;margin-bottom:.3em}
.timeline p{color:var(--muted);margin:0}

.quotes{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:clamp(14px,2vw,24px)}
.quotes blockquote{margin:0;border-left:0;padding:clamp(1.5rem,3vw,2.25rem);font-size:1.05rem}
.quotes blockquote p::before{content:'“';display:block;font:400 3.5rem/0.6 var(--head);color:var(--accent);margin:.2em 0 .1em}
.quotes.one{grid-template-columns:1fr;max-width:820px;margin-inline:auto;text-align:center}
.quotes.one blockquote{font-family:var(--head);font-size:clamp(1.4rem,2.6vw,2rem);line-height:1.3;border:0;box-shadow:none;background:none}

.contact{display:grid;grid-template-columns:1fr 1.2fr;gap:clamp(2rem,5vw,4rem);padding:clamp(2rem,5vw,4rem)}
.cards-outlined .contact{border:1px solid var(--border)}
.contact .sec-head{margin:0}
.contact-body{font-size:1.1rem}
.contact-body ul{list-style:none;padding:0}
.contact-body>:last-child{margin-bottom:0}
.contact .btns{margin-top:1rem}

.sec-cta{background:var(--accent);color:var(--on-accent)}
.sec-cta .eyebrow,.sec-cta .lede,.sec-cta a:not(.btn){color:var(--on-accent)}
.sec-cta .lede{opacity:.85}
.sec-cta .btn-primary{background:var(--on-accent);color:var(--accent)}
.sec-cta .btn-ghost{color:var(--on-accent);border-color:color-mix(in srgb,var(--on-accent) 40%,transparent)}
.cta{text-align:center}
.cta .sec-head{margin-inline:auto;margin-bottom:0}
.cta .btns{justify-content:center}

.footer{border-top:1px solid var(--border);padding:2.5rem 0;color:var(--muted);font-size:.9rem}
.footer-inner{display:flex;flex-wrap:wrap;align-items:center;gap:1rem 2rem}
.footer .brand{font-size:1rem}
.footer-links{display:flex;flex-wrap:wrap;gap:1.25rem;margin-right:auto}
.footer-links a{color:var(--muted);text-decoration:none}
.footer-links a:hover{color:var(--text)}

@media (max-width:820px){
  .split,.faq-layout,.contact,.hero-row{grid-template-columns:1fr}
  .split.flip .split-media{order:0}
  .hero-split .split-media{order:-1}
  .hero-split .split-media img{aspect-ratio:4/3}
  .hero-row .btns{justify-content:flex-start}
  .cards,.stats{grid-template-columns:repeat(min(var(--cols),2),1fr)}
  .g-feature{grid-template-columns:1fr 1fr}
}
@media (max-width:${navBreak}px){
  .nav-links{display:none}
  .subnav-pages{display:block}
  .nav-inner>.btn{margin-left:auto}
}
@media (max-width:560px){
  .cards{grid-template-columns:1fr}
  .g-two,.g-three,.g-feature{grid-template-columns:1fr;grid-template-rows:none}
  .g-three figure:first-child,.g-feature figure:first-child{grid-row:auto;grid-column:auto}
  .timeline li{grid-template-columns:1fr;gap:.25rem;padding-left:1.5rem}
  .timeline li::before,.timeline li::after{left:0;margin-left:4px}
  .timeline time{text-align:left}
  .timeline li>div{padding-left:0}
}
@media (prefers-reduced-motion:reduce){html{scroll-behavior:auto}.btn{transition:none}}
`;
}
