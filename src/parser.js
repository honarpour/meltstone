// Markdown -> document structure.
// Deliberately small: we only need the subset of Markdown that maps to website
// sections, and we need the *structure* (not just HTML) to make layout decisions.

const LIST_RE = /^(\s*)([-*+]|\d+[.)])\s+(.*)$/;
const HEADING_RE = /^(#{1,6})\s+(.*?)\s*#*\s*$/;
const HR_RE = /^\s*(-{3,}|\*{3,}|_{3,})\s*$/;
const IMG_RE = /!\[([^\]]*)\]\(\s*([^)\s]+)(?:\s+"([^"]*)")?\s*\)/g;
const LINK_RE = /\[([^\]]+)\]\(\s*([^)\s]+)(?:\s+"([^"]*)")?\s*\)/g;

export function parse(source) {
  let md = String(source || '').replace(/\r\n?/g, '\n');
  const meta = {};
  const fm = md.match(/^---\n([\s\S]*?)\n---[ \t]*(\n|$)/);
  if (fm) {
    for (const line of fm[1].split('\n')) {
      const m = line.match(/^\s*([\w-]+)\s*:\s*(.*?)\s*$/);
      if (m) meta[m[1].toLowerCase()] = m[2].replace(/^["']|["']$/g, '');
    }
    md = md.slice(fm[0].length);
  }
  return structure(tokenize(md.split('\n')), meta);
}

const TABLE_SEP_RE = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

function splitRow(line) {
  let s = line.trim();
  if (s.startsWith('|')) s = s.slice(1);
  if (s.endsWith('|') && !s.endsWith('\\|')) s = s.slice(0, -1);
  return s.split(/(?<!\\)\|/).map(c => c.replace(/\\\|/g, '|').trim());
}

// A table is a pipe row followed by a delimiter row with the same column count.
export function isTableStart(lines, i) {
  const head = lines[i];
  const sep = lines[i + 1];
  if (!head || !sep || !head.includes('|') || !sep.includes('-') || !TABLE_SEP_RE.test(sep)) return false;
  return splitRow(head).length === splitRow(sep).length;
}

// Reads the table starting at lines[i] (see isTableStart); next is the first line after it.
export function readTable(lines, i) {
  const head = splitRow(lines[i]);
  const align = splitRow(lines[i + 1]).map(c => (c.startsWith(':') ? (c.endsWith(':') ? 'center' : 'left') : c.endsWith(':') ? 'right' : ''));
  const rows = [];
  i += 2;
  while (i < lines.length && lines[i].trim() && lines[i].includes('|') && !isBlockStart(lines[i])) {
    const cells = splitRow(lines[i++]).slice(0, head.length);
    while (cells.length < head.length) cells.push('');
    rows.push(cells);
  }
  return { block: { type: 'table', head, align, rows }, next: i };
}

function isBlockStart(line) {
  return HEADING_RE.test(line) || LIST_RE.test(line) || /^\s*>/.test(line) ||
    /^\s*```/.test(line) || HR_RE.test(line);
}

function tokenize(lines) {
  const blocks = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i];
    if (!line.trim()) { i++; continue; }

    const fence = line.match(/^\s*```\s*(\S*)/);
    if (fence) {
      const body = [];
      i++;
      while (i < lines.length && !/^\s*```/.test(lines[i])) body.push(lines[i++]);
      i++;
      blocks.push({ type: 'code', lang: fence[1], text: body.join('\n') });
      continue;
    }

    const h = line.match(HEADING_RE);
    if (h) {
      blocks.push({ type: 'heading', level: h[1].length, text: h[2] });
      i++;
      continue;
    }

    if (HR_RE.test(line)) { blocks.push({ type: 'hr' }); i++; continue; }

    if (/^\s*>/.test(line)) {
      const body = [];
      while (i < lines.length && /^\s*>/.test(lines[i])) body.push(lines[i++].replace(/^\s*>\s?/, ''));
      blocks.push(quoteBlock(body));
      continue;
    }

    if (LIST_RE.test(line)) {
      const ordered = /\d/.test(line.match(LIST_RE)[2]);
      const items = [];
      while (i < lines.length) {
        const m = lines[i].match(LIST_RE);
        if (m) { items.push(m[3]); i++; continue; }
        // Indented continuation of the previous item.
        if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && items.length) {
          items[items.length - 1] += ' ' + lines[i].trim();
          i++;
          continue;
        }
        break;
      }
      blocks.push({ type: 'list', ordered, items });
      continue;
    }

    if (isTableStart(lines, i)) {
      const t = readTable(lines, i);
      blocks.push(t.block);
      i = t.next;
      continue;
    }

    const body = [];
    while (i < lines.length && lines[i].trim() && !(body.length && (isBlockStart(lines[i]) || isTableStart(lines, i)))) {
      body.push(lines[i++].trim());
    }
    blocks.push(paragraphBlock(body.join('\n')));
  }
  return blocks;
}

function quoteBlock(lines) {
  // A trailing "— Name" line becomes the citation.
  let cite = '';
  const last = lines.length ? lines[lines.length - 1].trim() : '';
  const m = last.match(/^(?:—|–|--|-)\s*(.+)$/);
  if (m && lines.length > 1) { cite = m[1]; lines = lines.slice(0, -1); }
  return { type: 'quote', text: lines.join(' ').trim(), cite };
}

function paragraphBlock(text) {
  const images = [...text.matchAll(IMG_RE)].map(m => ({ alt: m[1], src: m[2], title: m[3] || '' }));
  const withoutImages = text.replace(IMG_RE, '').trim();
  if (images.length && !withoutImages) return { type: 'images', items: images };

  // A paragraph that is nothing but links (optionally separated by | · or commas)
  // is treated as a row of buttons.
  const links = [...withoutImages.matchAll(LINK_RE)].map(m => ({ text: m[1], href: m[2] }));
  const rest = withoutImages.replace(LINK_RE, '').replace(/[\s|·•,/]+/g, '');
  if (links.length && !rest && !images.length) return { type: 'links', items: links };

  if (images.length) return { type: 'para', text: withoutImages, images };
  return { type: 'para', text };
}

function structure(blocks, meta) {
  const doc = { meta, title: meta.title || '', tagline: '', hero: [], sections: [] };
  let current = null;
  let sub = null;

  for (const b of blocks) {
    if (b.type === 'heading' && b.level === 1 && !doc.title) { doc.title = b.text; continue; }
    if (b.type === 'heading' && b.level <= 2) {
      // "## Our work {gallery}" forces a layout for this section.
      const forced = b.text.match(/\s*\{\.?([\w-]+)\}\s*$/);
      const title = forced ? b.text.slice(0, forced.index) : b.text;
      current = { title, intro: [], subsections: [], meta: forced ? { layout: forced[1] } : {} };
      sub = null;
      doc.sections.push(current);
      continue;
    }
    if (!current) {
      if (b.type === 'para' && !doc.tagline && !b.images) { doc.tagline = b.text; continue; }
      doc.hero.push(b);
      continue;
    }
    if (b.type === 'heading') {
      sub = { title: b.text, blocks: [] };
      current.subsections.push(sub);
      continue;
    }
    (sub ? sub.blocks : current.intro).push(b);
  }

  if (!doc.title) doc.title = doc.sections.length ? doc.sections[0].title : 'Untitled';
  return doc;
}

// Helpers shared by the classifier and renderer.
export function allBlocks(section) {
  return [...section.intro, ...section.subsections.flatMap(s => s.blocks)];
}

export function imagesIn(blocks) {
  return blocks.flatMap(b => b.type === 'images' ? b.items : (b.images || []));
}

export function plainText(md) {
  return String(md || '')
    .replace(IMG_RE, '')
    .replace(LINK_RE, '$1')
    .replace(/[*_`~]/g, '')
    .trim();
}
