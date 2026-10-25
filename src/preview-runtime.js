// Runs inside the sandboxed preview iframe (injected as an inline script, so it
// must not import anything). The app posts each new build here and the page
// is patched in place: unchanged nodes, images and fonts are left alone, so
// updates don't flash or lose the scroll position.

export function previewRuntime() {
  function morph(from, to) {
    if (from.nodeType !== to.nodeType || from.nodeName !== to.nodeName) {
      from.replaceWith(to);
      return;
    }
    if (from.nodeType !== 1) {
      if (from.nodeValue !== to.nodeValue) from.nodeValue = to.nodeValue;
      return;
    }
    for (const { name } of [...from.attributes]) {
      // Keep FAQ items the reader opened.
      if (!to.hasAttribute(name) && !(name === 'open' && from.nodeName === 'DETAILS')) from.removeAttribute(name);
    }
    for (const { name, value } of [...to.attributes]) {
      if (from.getAttribute(name) !== value) from.setAttribute(name, value);
    }
    morphChildren(from, to);
  }

  function morphChildren(from, to) {
    const byId = new Map();
    for (const n of from.childNodes) if (n.id) byId.set(n.id, n);
    const next = [...to.childNodes];
    for (let i = 0; i < next.length; i++) {
      const want = next[i];
      let cur = from.childNodes[i];
      // Sections carry ids, so a moved or inserted section doesn't shift every node after it.
      const keyed = want.id && byId.get(want.id);
      if (keyed && keyed !== cur) {
        from.insertBefore(keyed, cur || null);
        cur = keyed;
      }
      if (!cur) from.appendChild(want);
      else morph(cur, want);
    }
    while (from.childNodes.length > next.length) from.lastChild.remove();
  }

  function apply(html) {
    const doc = new DOMParser().parseFromString(html, 'text/html');
    document.title = doc.title;
    const style = document.querySelector('style');
    const newStyle = doc.querySelector('style');
    if (style && newStyle && style.textContent !== newStyle.textContent) style.textContent = newStyle.textContent;
    const font = document.querySelector('link[rel=stylesheet]');
    const newFont = doc.querySelector('link[rel=stylesheet]');
    if (font && newFont && font.href !== newFont.href) font.href = newFont.href;
    const runtime = document.getElementById('meltstone-runtime');
    morph(document.body, doc.body);
    if (runtime && !runtime.isConnected) document.body.append(runtime);
  }

  addEventListener('message', e => {
    if (e.source !== parent || !e.data) return;
    if (typeof e.data.meltstoneHtml === 'string') apply(e.data.meltstoneHtml);
    if (typeof e.data.meltstoneScroll === 'string') {
      document.getElementById(e.data.meltstoneScroll)?.scrollIntoView({ behavior: 'smooth' });
    }
  });

  // The iframe is sandboxed without same-origin, so in-page anchors are handled here.
  document.addEventListener('click', e => {
    const a = e.target.closest('a[href^="#"]');
    if (!a) return;
    e.preventDefault();
    const id = a.getAttribute('href').slice(1);
    const el = id === 'top' ? document.body : document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  });

  parent.postMessage({ meltstoneReady: true }, '*');
}
