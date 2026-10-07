/* The Last — le chantier (chantier.html) : tout le journal du site, du launcher et du jeu, par année et par mois, avec un
   filtre par projet. assets/journal.json est réécrit toutes les heures par une tâche GitHub (.github/journal/build.mjs) à
   partir des lignes « Journal(…): » des commits des projets ; l'accueil n'en montre que les 5 dernières entrées.
   Le filtre se retrouve dans l'adresse (?p=site,jeu) : on peut partager une vue. Aucun stockage, aucun appel externe. */
(() => {
'use strict';

const MC = window.MC || { blocks: {}, font: {} }, D = document, root = D.documentElement;
const $ = (s, r) => (r || D).querySelector(s), $$ = (s, r) => Array.from((r || D).querySelectorAll(s));
const PROJETS = { site: 'Site', launcher: 'Launcher', jeu: 'Jeu' };
const MOIS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

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
function pxText(el, txt) {
  txt = (txt === undefined ? el.textContent : txt).trim(); el.textContent = '';
  if (el.dataset.fs) el.style.setProperty('--fs', el.dataset.fs + 'px');
  el.appendChild(h('span', { class: 'sr', text: txt }));
  txt.split(' ').filter(Boolean).forEach(w => el.appendChild(pxWord(w)));
  return el;
}
function pxLabel(el, text) {
  text = String(text).trim(); el.textContent = '';
  const box = h('span', { class: 'pxl', 'aria-hidden': 'true' });
  text.split(' ').filter(Boolean).forEach(w => box.appendChild(pxWord(w)));
  el.append(h('span', { class: 'sr', text }), box); el.classList.add('pxl-host');
}

/* ---------- le fond : briques du Nether du jeu, assombries ---------- */
function fond() {
  const m = MC.blocks.nether_bricks; if (!m) return;
  const im = new Image();
  im.onload = () => {
    const c = D.createElement('canvas'); c.width = c.height = 16; const g = c.getContext('2d');
    g.drawImage(im, 0, m[0] * 16, 16, 16, 0, 0, 16, 16);
    root.style.setProperty('--ch-bg', 'url(' + c.toDataURL() + ')');
  };
  im.src = 'assets/mc/blocks.png';
}

/* ---------- le journal ---------- */
const box = $('#histoire');
let entries = [];
const actifs = () => $$('.ch-f').filter(b => b.getAttribute('aria-pressed') === 'true').map(b => b.dataset.p);
function rendre() {
  const on = actifs(), list = entries.filter(e => on.includes(e.p));
  box.textContent = '';
  if (!on.length) { box.appendChild(h('p', { class: 'ch-vide', text: 'Choisis au moins un projet : Site, Launcher ou Jeu.' })); return; }
  if (!list.length) { box.appendChild(h('p', { class: 'ch-vide', text: 'Rien pour l\'instant de ce côté du chantier.' })); return; }
  let annee = null, mois = null, ol = null;
  list.forEach(e => {
    const d = new Date(e.d), y = d.getFullYear(), m = d.getMonth();
    if (y !== annee) { annee = y; mois = null; box.appendChild(pxText(h('h2', { class: 'px ch-annee', 'data-fs': '4' }), String(y))); }
    if (m !== mois) {
      mois = m; const n = list.filter(x => { const q = new Date(x.d); return q.getFullYear() === y && q.getMonth() === m; }).length;
      const sec = h('section', { class: 'ch-mois', 'aria-label': MOIS[m] + ' ' + y });
      sec.appendChild(h('h3', { class: 'ch-mt' }, h('span', { text: MOIS[m] + ' ' + y }), h('small', { text: n + (n > 1 ? ' nouvelles' : ' nouvelle') })));
      ol = h('ol', { class: 'journal' }); sec.appendChild(ol); box.appendChild(sec);
    }
    ol.appendChild(h('li', { class: 'j-e', 'data-p': e.p },
      h('span', { class: 'j-p' }, PROJETS[e.p]), h('span', { class: 'j-t', text: e.t }),
      h('time', { class: 'j-d', datetime: e.d, text: d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }) })));
  });
}
function filtres() {
  const qs = new URLSearchParams(location.search).get('p');
  if (qs) { const want = qs.split(',').filter(p => PROJETS[p]); if (want.length) $$('.ch-f').forEach(b => b.setAttribute('aria-pressed', want.includes(b.dataset.p) ? 'true' : 'false')); }
  $$('.ch-f').forEach(b => {
    const n = entries.filter(e => e.p === b.dataset.p).length;
    pxLabel(b, PROJETS[b.dataset.p]); b.appendChild(h('span', { class: 'ch-n', text: String(n) }));
    b.setAttribute('aria-label', PROJETS[b.dataset.p] + ' : ' + n + (n > 1 ? ' nouvelles' : ' nouvelle'));
    b.addEventListener('click', () => {
      b.setAttribute('aria-pressed', b.getAttribute('aria-pressed') === 'true' ? 'false' : 'true');
      const on = actifs(), u = new URL(location.href);
      if (on.length === 3) u.searchParams.delete('p'); else u.searchParams.set('p', on.join(','));
      history.replaceState(null, '', u);
      rendre();
    });
  });
}

$$('.top .tbtn').forEach(b => pxLabel(b, b.textContent));
$$('h1.px').forEach(el => pxText(el));
fond();
fetch('assets/journal.json', { cache: 'no-cache' })
  .then(r => { if (!r.ok) throw new Error('journal ' + r.status); return r.json(); })
  .then(j => {
    entries = (j.entries || []).filter(e => PROJETS[e.p] && e.t && e.d).sort((a, b) => b.d.localeCompare(a.d));
    filtres(); rendre();
  })
  .catch(e => { box.textContent = ''; box.appendChild(h('p', { class: 'ch-vide', text: 'Le journal est indisponible pour le moment. Reviens dans un instant.' })); if (window.console) console.warn(e); });
})();
