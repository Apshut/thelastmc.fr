/* The Last — les pages légales (confidentialite, cgu, mentions-legales et leurs jumelles anglaises privacy, terms,
   legal-notice), dans le style du reste du site : la police du jeu sur l'en-tête et le titre, le fond de briques du
   Nether. Aucun appel externe. */
(() => {
'use strict';
const MC = window.MC || { blocks: {}, font: {} }, D = document, root = D.documentElement;
const $$ = (s, r) => Array.from((r || D).querySelectorAll(s));

function h(tag, attrs, ...kids) {
  const e = D.createElement(tag);
  if (attrs) for (const k in attrs) { if (k === 'class') e.className = attrs[k]; else if (k === 'text') e.textContent = attrs[k]; else e.setAttribute(k, attrs[k]); }
  kids.forEach(c => { if (c) e.appendChild(typeof c === 'string' ? D.createTextNode(c) : c); });
  return e;
}

/* ---------- police du jeu (mêmes glyphes que l'accueil, voir mc.js) ---------- */
function pxWord(word) {
  let d = '', x = 0;
  for (const ch of word) {
    const g = MC.font[ch] || MC.font['?']; if (!g) continue;
    const y0 = 10 - g.a;
    g.r.forEach((row, j) => { let run = 0; for (let i = 0; i <= row.length; i++) { if (row[i] === '#') run++; else if (run) { d += 'M' + (x + i - run) + ' ' + (y0 + j) + 'h' + run + 'v1h-' + run + 'z'; run = 0; } } });
    x += g.w + 1;
  }
  const w = Math.max(1, x - 1), svg = D.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 ' + w + ' 12'); svg.setAttribute('shape-rendering', 'crispEdges'); svg.setAttribute('aria-hidden', 'true');
  svg.style.setProperty('--w', w);
  svg.innerHTML = '<path fill="currentColor" d="' + d + '"/>';
  return svg;
}
function pxText(el) {
  const txt = el.textContent.trim(); el.textContent = '';
  if (el.dataset.fs) el.style.setProperty('--fs', el.dataset.fs + 'px');
  el.appendChild(h('span', { class: 'sr', text: txt }));
  txt.split(' ').filter(Boolean).forEach(w => el.appendChild(pxWord(w)));
}
function pxLabel(el, text) {
  text = String(text).trim(); el.textContent = '';
  const box = h('span', { class: 'pxl', 'aria-hidden': 'true' });
  text.split(' ').filter(Boolean).forEach(w => box.appendChild(pxWord(w)));
  el.append(h('span', { class: 'sr', text }), box); el.classList.add('pxl-host');
}

/* ---------- le fond : briques du Nether du jeu, assombries (comme le chantier et le compte) ---------- */
function fond() {
  const m = MC.blocks.nether_bricks; if (!m) return;
  const im = new Image();
  im.onload = () => {
    const c = D.createElement('canvas'); c.width = c.height = 16;
    c.getContext('2d').drawImage(im, 0, m[0] * 16, 16, 16, 0, 0, 16, 16);
    root.style.setProperty('--ch-bg', 'url(' + c.toDataURL() + ')');
  };
  im.src = '/assets/mc/blocks.png';
}

$$('.top .tbtn').forEach(b => { if (b.classList.contains('lang-sw')) $$('a', b).forEach(a => pxLabel(a, a.textContent)); else pxLabel(b, b.textContent); });   // FR | EN : chaque moitié
$$('h1.px').forEach(pxText);
fond();
})();
