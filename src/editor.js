// Live-preview Markdown editor (Obsidian style) on CodeMirror 6.
// The document is always plain Markdown; formatting marks are only hidden on
// lines the cursor isn't on, so what the site generator reads is exactly what
// the user typed.

import {
  EditorView, Decoration, ViewPlugin, WidgetType, keymap, drawSelection, placeholder,
  EditorState, EditorSelection, defaultKeymap, history, historyKeymap, indentWithTab,
  syntaxTree, markdown, markdownLanguage, StateField, StateEffect, undo, redo,
} from '../vendor/codemirror.js';
import { mdPopover } from './md-popover.js';
import { readTable, isTableStart } from './parser.js';

const LAYOUT_TAG = /\s*\{\.?([\w-]+)\}\s*$/;
const FRONT_MATTER = /^---\n[\s\S]*?\n---(?=\n|$)/;

class ImageWidget extends WidgetType {
  constructor(src, alt) { super(); this.src = src; this.alt = alt; }
  eq(other) { return other.src === this.src && other.alt === this.alt; }
  toDOM() {
    const wrap = document.createElement('span');
    wrap.className = 'cm-image';
    const img = document.createElement('img');
    img.src = this.src;
    img.alt = this.alt;
    img.title = this.alt;
    img.onerror = () => wrap.classList.add('broken');
    if (!this.src) wrap.classList.add('broken');
    wrap.append(img);
    if (this.alt) {
      const cap = document.createElement('span');
      cap.className = 'cm-image-alt';
      cap.textContent = this.alt;
      wrap.append(cap);
    }
    return wrap;
  }
  ignoreEvent() { return false; }
}

class TextWidget extends WidgetType {
  constructor(text, cls) { super(); this.text = text; this.cls = cls; }
  eq(other) { return other.text === this.text && other.cls === this.cls; }
  toDOM() {
    const el = document.createElement('span');
    el.className = this.cls;
    el.textContent = this.text;
    return el;
  }
  ignoreEvent() { return false; }
}

// Cell text with the few inline marks a table cell is likely to hold.
function cellContent(text) {
  const frag = document.createDocumentFragment();
  const re = /\*\*([^*]+)\*\*|\*([^*]+)\*|`([^`]+)`|\[([^\]]+)\]\([^)]*\)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    frag.append(text.slice(last, m.index));
    const el = document.createElement(m[1] ? 'strong' : m[2] ? 'em' : m[3] ? 'code' : 'span');
    if (m[4]) el.className = 'cm-link';
    el.textContent = m[1] || m[2] || m[3] || m[4];
    frag.append(el);
    last = m.index + m[0].length;
  }
  frag.append(text.slice(last));
  return frag;
}

const ALIGN_CYCLE = ['', 'left', 'center', 'right'];
const ALIGN_SEP = { '': '---', left: ':---', center: ':---:', right: '---:' };
const cellMd = t => t.replace(/\s*\n\s*/g, ' ').replace(/\|/g, '\\|').trim();
const tableMd = ({ head, align, rows }) => [
  head, align.map(a => ALIGN_SEP[a] || '---'), ...rows,
].map(r => '| ' + r.map(c => (c === undefined ? '' : /^:?-{3}:?$/.test(c) ? c : cellMd(c))).join(' | ') + ' |').join('\n');
const sameTable = (a, b) => JSON.stringify([a.head, a.align, a.rows]) === JSON.stringify([b.head, b.align, b.rows]);

// Cell to focus once the table has been rebuilt after a structural edit or undo.
let pendingFocus = null;

// The rendered table is edited in place. Cells show their rendered text until focused,
// then the raw Markdown; every change is written straight back into the document.
class TableWidget extends WidgetType {
  constructor(source) {
    super();
    this.source = source;
    this.block = readTable(source.split('\n'), 0).block;
  }
  eq(other) { return sameTable(this.block, other.block); }
  ignoreEvent() { return true; }

  toDOM(view) {
    const model = {
      head: [...this.block.head], align: [...this.block.align], rows: this.block.rows.map(r => [...r]),
    };
    const rowsOf = () => [model.head, ...model.rows]; // index 0 is the header
    let active = { r: 0, c: 0 };

    const wrap = document.createElement('div');
    wrap.className = 'cm-table-widget';
    const scroll = document.createElement('div');
    scroll.className = 'cm-table-scroll';
    const table = document.createElement('table');
    scroll.append(table);
    wrap.append(scroll);

    const tableRange = () => {
      const from = view.posAtDOM(wrap);
      for (let n = syntaxTree(view.state).resolveInner(from, 1); n; n = n.parent) {
        if (n.name === 'Table') return { from: n.from, to: n.to };
      }
      return null;
    };
    const commit = () => {
      const range = tableRange();
      if (range) view.dispatch({ changes: { ...range, insert: tableMd(model) }, userEvent: 'input.table' });
    };
    // Structural edits rebuild the widget, so say which cell should get focus afterwards.
    const commitAndFocus = (r, c) => { pendingFocus = { r, c }; commit(); };
    const cells = () => [...table.rows].map(tr => [...tr.cells]);
    const focusCell = (r, c) => cells()[r]?.[c]?.focus();

    const rawOf = (r, c) => rowsOf()[r][c] || '';
    const show = cell => { cell.replaceChildren(cellContent(rawOf(+cell.dataset.r, +cell.dataset.c))); };

    const build = () => {
      table.replaceChildren();
      rowsOf().forEach((row, r) => {
        const tr = table.insertRow();
        row.forEach((_, c) => {
          const cell = document.createElement(r === 0 ? 'th' : 'td');
          tr.append(cell);
          cell.contentEditable = 'true';
          cell.spellcheck = false;
          cell.dataset.r = r;
          cell.dataset.c = c;
          if (model.align[c]) cell.style.textAlign = model.align[c];
          show(cell);
          cell.addEventListener('focus', () => {
            active = { r, c };
            const raw = rawOf(r, c);
            // Show the Markdown source while editing (bold marks, links…).
            if (cell.textContent !== raw) {
              cell.textContent = raw;
              const sel = getSelection();
              sel.selectAllChildren(cell);
              sel.collapseToEnd();
            }
            wrap.classList.add('editing');
            syncTools();
          });
          cell.addEventListener('blur', () => {
            show(cell);
            setTimeout(() => { if (!wrap.contains(document.activeElement)) wrap.classList.remove('editing'); });
          });
          cell.addEventListener('input', () => {
            rowsOf()[r][c] = cell.textContent.replace(/\s*\n\s*/g, ' ');
            // Keep this widget in step with the DOM so the rebuilt table compares equal
            // and the focused cell is left alone.
            this.block = { head: [...model.head], align: [...model.align], rows: model.rows.map(row => [...row]) };
            commit();
          });
          cell.addEventListener('paste', e => {
            e.preventDefault();
            document.execCommand('insertText', false, (e.clipboardData.getData('text/plain') || '').replace(/\s*\n\s*/g, ' '));
          });
          cell.addEventListener('keydown', e => onKey(e, r, c));
        });
      });
    };

    const addRow = (after, c) => {
      model.rows.splice(after, 0, model.head.map(() => ''));
      commitAndFocus(after + 1, c);
    };
    const onKey = (e, r, c) => {
      const mod = e.metaKey || e.ctrlKey;
      const last = rowsOf().length - 1;
      const cols = model.head.length;
      if (mod && /^[biuk]$/i.test(e.key)) return e.preventDefault(); // no rich-text shortcuts
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        pendingFocus = { r, c };
        (e.shiftKey ? redo : undo)(view);
        return;
      }
      if (e.key === 'Tab') {
        e.preventDefault();
        if (e.shiftKey) {
          if (c > 0) focusCell(r, c - 1); else if (r > 0) focusCell(r - 1, cols - 1);
        } else if (c < cols - 1) focusCell(r, c + 1);
        else if (r < last) focusCell(r + 1, 0);
        else addRow(r, 0);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (r < last) focusCell(r + 1, c); else addRow(r, c);
      } else if (e.key === 'ArrowDown' && r < last) {
        e.preventDefault();
        focusCell(r + 1, c);
      } else if (e.key === 'ArrowUp' && r > 0) {
        e.preventDefault();
        focusCell(r - 1, c);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        leave();
      }
    };

    // Puts the caret on the line after the table and hands the keyboard back to the editor.
    const leave = () => {
      const range = tableRange();
      if (!range) return;
      const atEnd = range.to === view.state.doc.length;
      view.dispatch({
        changes: atEnd ? { from: range.to, insert: '\n' } : undefined,
        selection: { anchor: Math.min(range.to + 1, view.state.doc.length + (atEnd ? 1 : 0)) },
      });
      view.focus();
    };

    const tools = document.createElement('div');
    tools.className = 'cm-table-tools';
    const btn = (act, label, title) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.dataset.act = act;
      b.textContent = label;
      b.title = title;
      tools.append(b);
      return b;
    };
    btn('row', '+ Row', 'Add a row below');
    btn('col', '+ Column', 'Add a column to the right');
    btn('del-row', '− Row', 'Remove this row');
    btn('del-col', '− Column', 'Remove this column');
    btn('align', 'Align', 'Cycle column alignment');
    btn('md', 'Markdown', 'Edit as Markdown');
    wrap.append(tools);
    const syncTools = () => {
      tools.querySelector('[data-act=del-row]').disabled = active.r === 0;
      tools.querySelector('[data-act=del-col]').disabled = model.head.length <= 1;
    };
    // Keep the cell focused while using the tools.
    tools.addEventListener('mousedown', e => e.preventDefault());
    tools.addEventListener('click', e => {
      const act = e.target.closest('button')?.dataset.act;
      const { r, c } = active;
      if (act === 'row') addRow(r, c);
      else if (act === 'col') {
        model.head.splice(c + 1, 0, '');
        model.align.splice(c + 1, 0, '');
        model.rows.forEach(row => row.splice(c + 1, 0, ''));
        commitAndFocus(r, c + 1);
      } else if (act === 'del-row' && r > 0) {
        model.rows.splice(r - 1, 1);
        commitAndFocus(Math.min(r, model.rows.length), c);
      } else if (act === 'del-col' && model.head.length > 1) {
        model.head.splice(c, 1);
        model.align.splice(c, 1);
        model.rows.forEach(row => row.splice(c, 1));
        commitAndFocus(r, Math.min(c, model.head.length - 1));
      } else if (act === 'align') {
        model.align[c] = ALIGN_CYCLE[(ALIGN_CYCLE.indexOf(model.align[c]) + 1) % ALIGN_CYCLE.length];
        commitAndFocus(r, c);
      } else if (act === 'md') {
        const range = tableRange();
        if (range) view.dispatch({ selection: { anchor: range.from } });
        view.focus();
      }
    });

    build();
    if (pendingFocus) {
      const { r, c, select } = pendingFocus;
      pendingFocus = null;
      requestAnimationFrame(() => {
        const cell = cells()[r]?.[c];
        if (!cell) return;
        cell.focus();
        if (select) getSelection().selectAllChildren(cell);
      });
    }
    return wrap;
  }
}

const focusEffect = StateEffect.define();

// Tables render as a real table until the caret enters them. Block widgets have to
// come from a state field, not the view plugin the rest of the live preview uses.
const tableField = StateField.define({
  create: state => buildTables(state, false),
  update(deco, tr) {
    const focusEff = tr.effects.find(e => e.is(focusEffect));
    if (!tr.docChanged && !tr.selection && !focusEff && syntaxTree(tr.startState) === syntaxTree(tr.state)) return deco;
    return buildTables(tr.state, focusEff ? focusEff.value : deco.focused);
  },
  provide: f => EditorView.decorations.from(f, v => v.set),
});

function buildTables(state, focused) {
  const doc = state.doc;
  const ranges = [];
  syntaxTree(state).iterate({
    enter(node) {
      if (node.name !== 'Table') return;
      const touched = focused && state.selection.ranges.some(r => r.from <= node.to && r.to >= node.from);
      const text = doc.sliceString(node.from, node.to);
      if (!touched && isTableStart(text.split('\n'), 0)) {
        ranges.push(Decoration.replace({ widget: new TableWidget(text), block: true }).range(node.from, node.to));
      }
      return false;
    },
  });
  return { set: Decoration.set(ranges, true), focused };
}

const hide = Decoration.replace({});
const mark = cls => Decoration.mark({ class: cls });
const line = cls => Decoration.line({ class: cls });

function buildDecorations(view, resolveAsset) {
  const { state } = view;
  const doc = state.doc;
  const ranges = [];
  const atomic = []; // hidden Markdown the caret should skip over as one unit
  const add = (from, to, deco) => {
    if (from > to) return;
    ranges.push(deco.range(from, to));
    if (deco.spec.widget || deco === hide) atomic.push(hide.range(from, to));
  };

  // Lines holding a cursor/selection show raw Markdown. While unfocused, render everything.
  const active = new Set();
  if (view.hasFocus) {
    for (const r of state.selection.ranges) {
      for (let n = doc.lineAt(r.from).number; n <= doc.lineAt(r.to).number; n++) active.add(n);
    }
  }
  const isActive = pos => active.has(doc.lineAt(pos).number);

  const fm = doc.sliceString(0, Math.min(doc.length, 2000)).match(FRONT_MATTER);
  const fmEnd = fm ? fm[0].length : -1;
  if (fm) {
    for (let n = 1; n <= doc.lineAt(fmEnd).number; n++) add(doc.line(n).from, doc.line(n).from, line('cm-frontmatter'));
  }

  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from, to,
      enter(node) {
        if (node.from < fmEnd) return node.name === 'Document' ? undefined : false;
        const name = node.name;

        const heading = name.match(/^ATXHeading(\d)$/);
        if (heading) {
          const ln = doc.lineAt(node.from);
          add(ln.from, ln.from, line(`cm-h cm-h${heading[1]}`));
          const tag = ln.text.match(LAYOUT_TAG);
          if (tag) {
            const start = ln.from + tag.index;
            if (isActive(start)) add(start, ln.to, mark('cm-tag-raw'));
            else add(start, ln.to, Decoration.replace({ widget: new TextWidget(tag[1], 'cm-tag') }));
          }
          return;
        }
        if (name === 'HeaderMark') {
          if (isActive(node.from)) add(node.from, node.to, mark('cm-mark'));
          else add(node.from, Math.min(node.to + 1, doc.lineAt(node.from).to), hide);
          return;
        }

        if (name === 'Emphasis') add(node.from, node.to, mark('cm-em'));
        if (name === 'StrongEmphasis') add(node.from, node.to, mark('cm-strong'));
        if (name === 'Strikethrough') add(node.from, node.to, mark('cm-strike'));
        if (name === 'InlineCode') add(node.from, node.to, mark('cm-code'));
        if (name === 'EmphasisMark' || name === 'StrikethroughMark' || (name === 'CodeMark' && node.node.parent?.name === 'InlineCode')) {
          add(node.from, node.to, isActive(node.from) ? mark('cm-mark') : hide);
          return;
        }

        if (name === 'Image') {
          const n = node.node;
          const urlNode = n.getChild('URL');
          const text = doc.sliceString(node.from, node.to);
          const alt = (text.match(/^!\[([^\]]*)\]/) || [])[1] || '';
          // Always shown as a thumbnail; clicking it opens the image popover.
          if (urlNode) {
            const src = resolveAsset(doc.sliceString(urlNode.from, urlNode.to));
            add(node.from, node.to, Decoration.replace({ widget: new ImageWidget(src, alt) }));
          }
          return false;
        }

        if (name === 'Link') {
          const n = node.node;
          const marks = n.getChildren('LinkMark');
          // Complete links always show just their text; the link popover edits the URL.
          // Half-typed ones stay raw so they can be finished.
          if (marks.length < 2 || !n.getChild('URL')) {
            add(node.from, node.to, mark('cm-link-raw'));
          } else {
            const close = marks[1]; // the "]" that ends the link text
            add(node.from, marks[0].to, hide);
            add(marks[0].to, close.from, mark('cm-link'));
            add(close.from, node.to, hide);
          }
          return false;
        }

        if (name === 'Blockquote') {
          for (let p = node.from; p <= node.to;) {
            const ln = doc.lineAt(p);
            add(ln.from, ln.from, line('cm-quote'));
            p = ln.to + 1;
          }
        }
        if (name === 'QuoteMark') {
          const end = doc.sliceString(node.to, node.to + 1) === ' ' ? node.to + 1 : node.to;
          add(node.from, end, isActive(node.from) ? mark('cm-mark') : hide);
          return;
        }

        if (name === 'ListMark') {
          const bullet = node.node.parent?.parent?.name === 'BulletList';
          if (bullet && !isActive(node.from)) add(node.from, node.to, Decoration.replace({ widget: new TextWidget('•', 'cm-bullet') }));
          else add(node.from, node.to, mark('cm-listmark'));
          return;
        }

        if (name === 'HorizontalRule') {
          const ln = doc.lineAt(node.from);
          add(ln.from, ln.from, line('cm-hr'));
          if (!isActive(node.from)) add(node.from, node.to, mark('cm-hr-text'));
          return;
        }

        if (name === 'Table') {
          for (let p = node.from, n = 0; p <= node.to; n++) {
            const ln = doc.lineAt(p);
            add(ln.from, ln.from, line(n === 0 ? 'cm-table cm-table-head' : n === 1 ? 'cm-table cm-table-sep' : 'cm-table'));
            p = ln.to + 1;
          }
        }

        if (name === 'FencedCode') {
          for (let p = node.from; p <= node.to;) {
            const ln = doc.lineAt(p);
            add(ln.from, ln.from, line('cm-codeblock'));
            p = ln.to + 1;
          }
          return false;
        }
      },
    });
  }
  return { decorations: Decoration.set(ranges, true), atomic: Decoration.set(atomic, true) };
}

function livePreview(resolveAsset) {
  const plugin = ViewPlugin.fromClass(class {
    constructor(view) { ({ decorations: this.decorations, atomic: this.atomic } = buildDecorations(view, resolveAsset)); }
    update(u) {
      if (u.docChanged || u.viewportChanged || u.selectionSet || u.focusChanged ||
          syntaxTree(u.startState) !== syntaxTree(u.state)) {
        ({ decorations: this.decorations, atomic: this.atomic } = buildDecorations(u.view, resolveAsset));
      }
    }
  }, { decorations: v => v.decorations });
  return [plugin, EditorView.atomicRanges.of(view => view.plugin(plugin)?.atomic ?? Decoration.none)];
}

const theme = EditorView.theme({
  '&': { height: '100%', fontSize: '15px', color: 'var(--text)', backgroundColor: 'var(--field)' },
  '&.cm-focused': { outline: 'none' },
  '.cm-scroller': { fontFamily: 'var(--editor-font)', lineHeight: '1.7', overflow: 'auto' },
  '.cm-content': { maxWidth: '720px', margin: '0 auto', padding: '28px 32px 40vh', caretColor: 'var(--accent)' },
  '.cm-line': { padding: '0' },
  '.cm-cursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
  '&.cm-focused .cm-selectionBackground, .cm-selectionBackground, ::selection': { backgroundColor: 'var(--selection) !important' },
  '.cm-placeholder': { color: 'var(--muted)' },
});

export function createEditor({ parent, doc, onChange, onSubmit, onFiles, resolveAsset, pickImage }) {
  const view = new EditorView({
    parent,
    state: EditorState.create({
      doc,
      extensions: [
        history(),
        drawSelection(),
        EditorView.lineWrapping,
        markdown({ base: markdownLanguage }),
        livePreview(resolveAsset),
        tableField,
        EditorView.focusChangeEffect.of((state, focusing) => focusEffect.of(focusing)),
        mdPopover({ resolveAsset, pickImage }),
        placeholder('# Your site name\n\nA one-line description…\n\n## A section'),
        keymap.of([
          { key: 'Mod-Enter', run: () => { onSubmit(); return true; } },
          { key: 'Mod-b', run: v => (wrap(v, '**', '**', 'bold text'), true) },
          { key: 'Mod-i', run: v => (wrap(v, '*', '*', 'italic text'), true) },
          { key: 'Mod-k', run: v => (wrap(v, '[', '](https://)', 'link text'), true) },
          ...defaultKeymap, ...historyKeymap, indentWithTab,
        ]),
        EditorView.updateListener.of(u => { if (u.docChanged) onChange(u.state.doc.toString()); }),
        EditorView.domEventHandlers({
          paste(e) {
            const files = [...(e.clipboardData?.files || [])].filter(f => f.type.startsWith('image/'));
            if (!files.length) return false;
            e.preventDefault();
            onFiles(files);
            return true;
          },
          drop(e, v) {
            const files = [...(e.dataTransfer?.files || [])].filter(f => f.type.startsWith('image/'));
            if (!files.length) return false;
            e.preventDefault();
            const pos = v.posAtCoords({ x: e.clientX, y: e.clientY });
            if (pos !== null) v.dispatch({ selection: { anchor: pos } });
            onFiles(files);
            return true;
          },
        }),
        theme,
      ],
    }),
  });

  return {
    view,
    getValue: () => view.state.doc.toString(),
    setValue(text) { view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: text } }); },
    focus: () => view.focus(),
    wrap: (before, after, ph) => wrap(view, before, after, ph),
    prefixLines: prefix => prefixLines(view, prefix),
    insertBlock: text => insertBlock(view, text),
    insertTable() {
      pendingFocus = { r: 0, c: 0, select: true };
      insertBlock(view, '| Column 1 | Column 2 | Column 3 |\n| --- | --- | --- |\n| Cell | Cell | Cell |\n| Cell | Cell | Cell |');
    },
  };
}

function wrap(view, before, after, ph) {
  view.dispatch(view.state.changeByRange(range => {
    const text = view.state.sliceDoc(range.from, range.to) || ph;
    const insert = before + text + after;
    const start = range.from + before.length;
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.range(start, start + text.length),
    };
  }));
  view.focus();
}

// Applies a line prefix (heading, list, quote). Applying the same one again removes it.
function prefixLines(view, prefix) {
  const { state } = view;
  const changes = [];
  const seen = new Set();
  const existing = /^(#{1,6}\s+|[-*+]\s+|>\s?)/;
  for (const r of state.selection.ranges) {
    for (let n = state.doc.lineAt(r.from).number; n <= state.doc.lineAt(r.to).number; n++) {
      if (seen.has(n)) continue;
      seen.add(n);
      const ln = state.doc.line(n);
      const cur = (ln.text.match(existing) || [''])[0];
      const toggleOff = cur.trim() === prefix.trim();
      changes.push({ from: ln.from, to: ln.from + cur.length, insert: toggleOff ? '' : prefix });
    }
  }
  view.dispatch({ changes });
  view.focus();
}

function insertBlock(view, text) {
  const { state } = view;
  const pos = state.selection.main.head;
  const ln = state.doc.lineAt(pos);
  // Put the block on its own paragraph after the current line.
  const at = ln.text.trim() ? ln.to : ln.from;
  const prev = at > 0 ? state.doc.sliceString(Math.max(0, at - 2), at) : '\n\n';
  const lead = ln.text.trim() ? '\n\n' : (prev.endsWith('\n\n') || at === 0 ? '' : '\n');
  const insert = lead + text + '\n';
  view.dispatch({ changes: { from: at, to: at, insert }, selection: { anchor: at + insert.length } });
  view.focus();
}
