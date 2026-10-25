// Popovers for editing links and images without exposing their Markdown.
// - Caret inside a link: a small chip with the URL, Edit and Remove.
// - Edit (or clicking an image thumbnail): a form for text/URL or URL/description.
// Edits are written back as plain Markdown, so the document stays the source of truth.

import { ViewPlugin, syntaxTree } from '../vendor/codemirror.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// Spaces and parentheses would end the Markdown URL early.
const cleanUrl = u => u.trim().replace(/\s/g, '%20').replace(/\(/g, '%28').replace(/\)/g, '%29');
const cleanText = t => t.replace(/[[\]]/g, '').replace(/\s*\n\s*/g, ' ').trim();

function nodeAt(state, pos, name) {
  for (const side of [1, -1]) {
    for (let n = syntaxTree(state).resolveInner(pos, side); n; n = n.parent) {
      if (n.name === name) return n;
    }
  }
  return null;
}

function readLink(state, node) {
  const marks = node.getChildren('LinkMark');
  const url = node.getChild('URL');
  if (marks.length < 2 || !url) return null;
  return {
    kind: 'link', from: node.from, to: node.to,
    textFrom: marks[0].to, textTo: marks[1].from,
    text: state.sliceDoc(marks[0].to, marks[1].from),
    url: state.sliceDoc(url.from, url.to),
  };
}

function readImage(state, node) {
  const url = node.getChild('URL');
  if (!url) return null;
  const raw = state.sliceDoc(node.from, node.to);
  return {
    kind: 'image', from: node.from, to: node.to,
    alt: (raw.match(/^!\[([^\]]*)\]/) || [])[1] || '',
    url: state.sliceDoc(url.from, url.to),
  };
}

// "#section" targets for the link URL field, matching how the renderer builds ids.
function sectionAnchors(state) {
  const ids = [];
  for (const line of state.doc.toString().split('\n')) {
    const m = line.match(/^##\s+(.*?)\s*(?:\{\.?[\w-]+\})?\s*$/);
    if (!m) continue;
    const title = m[1].replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1').replace(/[*_`~]/g, '');
    const id = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
    if (id) ids.push({ id: '#' + id, title });
  }
  return ids;
}

export function mdPopover({ resolveAsset, pickImage }) {
  return ViewPlugin.fromClass(class {
    constructor(view) {
      this.view = view;
      this.target = null; // { kind, from, to, ..., mode: 'chip' | 'edit' }
      this.dom = document.createElement('div');
      this.dom.className = 'md-pop';
      this.dom.hidden = true;
      this.dom.addEventListener('mousedown', e => {
        // Keep the editor's selection when clicking buttons, but let inputs take focus.
        if (!e.target.closest('input')) e.preventDefault();
      });
      this.dom.addEventListener('click', e => this.onClick(e));
      this.dom.addEventListener('keydown', e => this.onKey(e));
      document.body.append(this.dom);

      this.reposition = () => this.place();
      this.outside = e => {
        if (this.target && !this.dom.contains(e.target) && !view.dom.contains(e.target)) this.close(false);
      };
      view.scrollDOM.addEventListener('scroll', this.reposition, { passive: true });
      addEventListener('resize', this.reposition);
      document.addEventListener('mousedown', this.outside, true);
    }

    update(u) {
      if (this.target && u.docChanged) {
        const pos = u.changes.mapPos(this.target.from, 1);
        const node = nodeAt(u.state, pos, this.target.kind === 'link' ? 'Link' : 'Image');
        const fresh = node && (this.target.kind === 'link' ? readLink(u.state, node) : readImage(u.state, node));
        if (!fresh) return this.close(false);
        // The form keeps what the user is typing; only positions are refreshed.
        Object.assign(this.target, { from: fresh.from, to: fresh.to, textFrom: fresh.textFrom, textTo: fresh.textTo });
        if (this.target.mode === 'chip') Object.assign(this.target, fresh, { mode: 'chip' });
      }
      if (u.selectionSet && !(this.target?.mode === 'edit' && this.dom.contains(document.activeElement))) {
        this.syncWithCaret(u.state);
      }
      if (this.target) this.place();
    }

    // Shows the link chip while the caret is inside a link's text.
    syncWithCaret(state) {
      const sel = state.selection.main;
      const node = sel.empty ? nodeAt(state, sel.head, 'Link') : null;
      const link = node && readLink(state, node);
      const inside = link && sel.head >= link.textFrom && sel.head <= link.textTo;
      if (inside) {
        if (this.target?.kind === 'link' && this.target.from === link.from && this.target.mode === 'edit') return;
        this.open({ ...link, mode: 'chip' });
      } else if (this.target && !(this.target.kind === 'image' && sel.head === this.target.from)) {
        this.close(false);
      }
    }

    // Called from the editor's mousedown handler when an image thumbnail is clicked.
    openImageAt(pos) {
      const node = nodeAt(this.view.state, pos, 'Image');
      const img = node && readImage(this.view.state, node);
      if (!img) return false;
      this.open({ ...img, mode: 'edit' });
      this.dom.querySelector('input[name=alt]')?.focus();
      return true;
    }

    open(target) {
      this.target = target;
      this.pendingUrl = null;
      this.render();
      this.dom.hidden = false;
      this.place();
    }

    close(refocus = true) {
      if (!this.target) return;
      this.target = null;
      this.dom.hidden = true;
      this.dom.innerHTML = '';
      if (refocus) this.view.focus();
    }

    render() {
      const t = this.target;
      if (t.kind === 'link' && t.mode === 'chip') {
        const external = /^(https?:|mailto:|tel:)/i.test(t.url);
        const shown = t.url.replace(/^https?:\/\//, '').replace(/^mailto:/, '');
        this.dom.className = 'md-pop md-pop-chip';
        this.dom.innerHTML = `
          ${external ? `<a class="md-pop-url" href="${esc(t.url)}" target="_blank" rel="noopener" title="Open ${esc(t.url)}">${esc(shown)}</a>`
                     : `<span class="md-pop-url" title="${esc(t.url)}">${esc(shown)}</span>`}
          <button type="button" data-act="edit">Edit</button>
          <button type="button" data-act="unlink">Remove</button>`;
        return;
      }
      if (t.kind === 'link') {
        const anchors = sectionAnchors(this.view.state);
        this.dom.className = 'md-pop md-pop-form';
        this.dom.innerHTML = `
          <label>Text<input name="text" value="${esc(t.text)}" autocomplete="off"></label>
          <label>Link<input name="url" value="${esc(t.url)}" placeholder="https://…, mailto:… or #section" list="md-pop-anchors" autocomplete="off"></label>
          <datalist id="md-pop-anchors">${anchors.map(a => `<option value="${esc(a.id)}">${esc(a.title)}</option>`).join('')}</datalist>
          <div class="md-pop-row">
            <button type="button" class="danger" data-act="unlink">Remove link</button>
            <span class="grow"></span>
            <button type="button" data-act="cancel">Cancel</button>
            <button type="button" class="primary" data-act="apply">Save</button>
          </div>`;
        return;
      }
      const uploaded = t.url.startsWith('asset:');
      const preview = resolveAsset(this.pendingUrl || t.url);
      this.dom.className = 'md-pop md-pop-form md-pop-image';
      this.dom.innerHTML = `
        <div class="md-pop-thumb">${preview ? `<img src="${esc(preview)}" alt="">` : ''}</div>
        <label>Image
          <span class="md-pop-inline">
            <input name="url" value="${uploaded || this.pendingUrl ? '' : esc(t.url)}" placeholder="${uploaded || this.pendingUrl ? 'Uploaded image · paste a URL to replace' : 'https://…'}" autocomplete="off">
            <button type="button" data-act="upload">Upload…</button>
          </span>
        </label>
        <label>Description<input name="alt" value="${esc(t.alt)}" placeholder="Caption, also read by screen readers" autocomplete="off"></label>
        <div class="md-pop-row">
          <button type="button" class="danger" data-act="remove-image">Remove image</button>
          <span class="grow"></span>
          <button type="button" data-act="cancel">Cancel</button>
          <button type="button" class="primary" data-act="apply">Save</button>
        </div>`;
    }

    async onClick(e) {
      const act = e.target.closest('[data-act]')?.dataset.act;
      if (!act) return;
      const t = this.target;
      if (act === 'edit') {
        t.mode = 'edit';
        this.render();
        this.place();
        // Selected so typing or pasting replaces the old URL.
        const url = this.dom.querySelector('input[name=url]');
        url.focus();
        url.select();
      } else if (act === 'cancel') {
        this.close();
      } else if (act === 'unlink') {
        this.replace(t.from, t.to, t.text, t.from + t.text.length);
      } else if (act === 'remove-image') {
        this.removeImage();
      } else if (act === 'upload') {
        const src = await pickImage();
        if (!src || this.target !== t) return;
        this.pendingUrl = src;
        const alt = this.dom.querySelector('input[name=alt]').value;
        this.render();
        this.place();
        this.dom.querySelector('input[name=alt]').value = alt;
      } else if (act === 'apply') {
        this.apply();
      }
    }

    onKey(e) {
      if (e.key === 'Escape') { e.preventDefault(); this.close(); }
      if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); this.apply(); }
    }

    apply() {
      const t = this.target;
      const field = name => this.dom.querySelector(`input[name=${name}]`)?.value ?? '';
      if (t.kind === 'link') {
        const url = cleanUrl(field('url'));
        const text = cleanText(field('text')) || url.replace(/^https?:\/\/|^mailto:/, '');
        if (!url) return this.replace(t.from, t.to, text, t.from + text.length);
        const md = `[${text}](${url})`;
        return this.replace(t.from, t.to, md, t.from + md.length);
      }
      const url = cleanUrl(field('url')) || this.pendingUrl || t.url;
      const md = `![${cleanText(field('alt'))}](${url})`;
      this.replace(t.from, t.to, md, t.from + md.length);
    }

    removeImage() {
      const { state } = this.view;
      const t = this.target;
      const line = state.doc.lineAt(t.from);
      // Drop the whole line if the image was alone on it.
      const alone = !state.sliceDoc(line.from, t.from).trim() && !state.sliceDoc(t.to, line.to).trim();
      const from = alone ? line.from : t.from;
      const to = alone ? Math.min(line.to + 1, state.doc.length) : t.to;
      this.replace(from, to, '', from);
    }

    replace(from, to, insert, cursor) {
      this.close(false);
      this.view.dispatch({ changes: { from, to, insert }, selection: { anchor: cursor }, userEvent: 'input' });
      this.view.focus();
    }

    // Positions the popover under its link/image; flips above when there's no room.
    place() {
      const t = this.target;
      if (!t) return;
      this.view.requestMeasure({
        read: view => {
          const start = view.coordsAtPos(t.kind === 'link' ? t.textFrom : t.from, 1);
          const end = view.coordsAtPos(t.kind === 'link' ? t.textTo : t.to, -1);
          const scroller = view.scrollDOM.getBoundingClientRect();
          return { start, end, scroller };
        },
        write: ({ start, end, scroller }) => {
          if (!this.target) return;
          const visible = start && start.bottom > scroller.top && start.top < scroller.bottom;
          this.dom.style.visibility = visible ? '' : 'hidden';
          if (!visible) return;
          const bottom = Math.max(start.bottom, end?.bottom ?? 0);
          const { offsetWidth: w, offsetHeight: h } = this.dom;
          const left = Math.max(8, Math.min(start.left, innerWidth - w - 8));
          const below = bottom + 6;
          const top = below + h > innerHeight - 8 ? Math.max(8, start.top - h - 6) : below;
          this.dom.style.left = left + 'px';
          this.dom.style.top = top + 'px';
        },
      });
    }

    destroy() {
      this.view.scrollDOM.removeEventListener('scroll', this.reposition);
      removeEventListener('resize', this.reposition);
      document.removeEventListener('mousedown', this.outside, true);
      this.dom.remove();
    }
  }, {
    eventHandlers: {
      mousedown(e, view) {
        const img = e.target.closest('.cm-image');
        if (!img) return false;
        e.preventDefault();
        return this.openImageAt(view.posAtDOM(img));
      },
      keydown(e) {
        if (e.key === 'Escape' && this.target) { this.close(); return true; }
        return false;
      },
    },
  });
}
