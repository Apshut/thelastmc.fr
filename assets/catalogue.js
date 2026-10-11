/* The Last — la fenêtre « Liste d'objets » de la taverne (boutique.html) : tout ce qu'on obtient en jeu, et son prix.
   Le menu des balances libre-service : un écran de grosses tuiles (les catégories), puis les objets de la catégorie,
   une recherche sur tout le catalogue, et la fiche d'un objet. Deux options, désactivées à l'ouverture :
   « Détail en paquets » (le panier de paquets le moins cher pour chaque objet, son prix en euros et le reste) et
   « Calculer ton budget » (le « plateau » façon afficheur de balance : la calculatrice euros ⇄ Braises, ou la pesée
   de l'objet dont la fiche est ouverte).
   Données : window.THE_LAST.shop (categories, inGame, products) et window.TL_SIMU (assets/simulateur-calc.js).
   Aucun prix ni nom d'objet écrit ici. Seule image chargée : assets/mc/items.png, à la première ouverture.
   Aucun stockage. La taverne 3D se fige tant que la fenêtre est ouverte (html.tv-pause, lu par tavern.js).
   Liens et essais : ?simu=1 ouvre la fenêtre ; &cat=<id> une catégorie (tout = tout voir) ; &q=<texte> remplit la
   recherche ; &conv=1 active le détail en paquets ; &budget=1 la calculatrice ; &item=<id> ouvre la fiche d'un objet. */
(() => {
'use strict';

const D = document, root = D.documentElement;
const CFG = window.THE_LAST || {}, SHOP = CFG.shop || {}, SIMU = window.TL_SIMU, MC = window.MC || { items: {}, font: {} };
const $ = s => D.querySelector(s);
const dlg = $('#cb'), openBtn = $('#cb-open');
if (!dlg || !openBtn || typeof dlg.showModal !== 'function') return;
const title = $('#cb-t'), qIn = $('#cb-q'), sw = $('#cb-sw'), bsw = $('#cb-bsw'), xBtn = $('#cb-x');
const plate = $('#cb-plate'), main = $('#cb-main'), scrim = $('#cb-scrim'), fiche = $('#cb-fiche'), foot = $('#cb-foot'), live = $('#cb-live');
const QS = new URLSearchParams(location.search);
const PHONE = matchMedia('(max-width: 599px)'), COARSE = matchMedia('(pointer: coarse)');
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)');

function h(tag, attrs, ...kids) {
  const e = D.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k]; if (v == null || v === false) continue;
    if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k === 'on') for (const ev in v) e.addEventListener(ev, v[ev]); else e.setAttribute(k, v === true ? '' : v);
  }
  kids.forEach(c => { if (c != null && c !== false) e.appendChild(typeof c === 'string' ? D.createTextNode(c) : c); });
  return e;
}

/* ---------- chiffres : tout passe par TL_SIMU ---------- */
// espace fine insécable (U+202F) des milliers : absente des polices du site, on met une espace insécable classique
const nbsp = t => String(t).replace(/ /g, ' ');
const fe = c => nbsp(SIMU ? SIMU.fmtEuros(c) : (c / 100).toFixed(2).replace('.', ',') + ' €');
const fb = n => nbsp(SIMU ? SIMU.fmtBraises(n) : String(n));
const PACKS = SIMU ? SIMU.paquets(CFG) : [];
const REF = PACKS.slice().sort((a, b) => a.braises - b.braises || a.cents - b.cents)[0] || null;   // le plus petit paquet : la Poignée
const plur = (w, n) => n > 1 && !/[sx]$/i.test(w) ? w + 's' : w;
const nObjets = n => n + (n > 1 ? ' objets' : ' objet');
const basketTxt = r => r.lignes.map(l => l.n + ' ' + plur(l.pack.short, l.n)).join(' + ');
const cachePanier = new Map();
function panier(br) {                                            // le panier le moins cher qui donne au moins br Braises
  if (!SIMU || !PACKS.length) return null;
  if (!cachePanier.has(br)) {
    const r = SIMU.pourBraises(PACKS, br);
    cachePanier.set(br, r && r.lignes.length ? { txt: basketTxt(r), cents: r.cents, braises: r.braises, reste: r.surplus } : null);
  }
  return cachePanier.get(br);
}

/* ---------- le catalogue ---------- */
const norm = s => String(s == null ? '' : s).toLowerCase().replace(/œ/g, 'oe').replace(/æ/g, 'ae')
  .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
const OBJS = (SHOP.inGame || []).filter(o => o && o.id && o.braises > 0).slice().sort((a, b) => a.braises - b.braises || String(a.name).localeCompare(b.name, 'fr'));
OBJS.forEach(o => {
  o._n = norm(o.name);
  o._w = norm([o.name, o.lore, (o.tags || []).join(' ')].join(' ')).split(' ').filter(Boolean);
  o._h = ' ' + o._w.join(' ') + ' ';
  o._f = norm([o.name, (o.tags || []).join(' ')].join(' ')).split(' ').filter(Boolean);   // la faute tolérée : nom et synonymes seulement
});
let CATS = (Array.isArray(SHOP.categories) ? SHOP.categories : []).filter(c => c && c.id && c.name).map(c => Object.assign({}, c, { items: [] }));
const byCat = new Map(CATS.map(c => [c.id, c]));
if (CATS.length) {
  const autres = { id: 'autres', name: 'Autres', icon: null, desc: 'Ce qui ne rentre dans aucune autre catégorie.', items: [] };
  OBJS.forEach(o => { const c = byCat.get(o.cat) || autres; o._c = c; c.items.push(o); });
  if (autres.items.length && !byCat.has('autres')) { CATS.push(autres); byCat.set('autres', autres); }
  CATS = CATS.filter(c => c.items.length);                       // une catégorie vide n'est pas affichée
}
const FLAT = CATS.length === 0;                                  // sans catégories (vraie config actuelle) : une seule liste
const isGrade = o => (o._c && (o._c.paliers || o._c.id === 'grades')) || /^grade(-|$)/i.test(o.id);
const range = list => {
  if (!list.length) return '';
  const a = list[0].braises, b = list[list.length - 1].braises;
  return a === b ? fb(a) + ' Braises' : 'de ' + fb(a) + ' à ' + fb(b) + ' Braises';
};

/* ---------- police du jeu (glyphes de mc.js), pour les titres et l'afficheur ---------- */
function pxSvg(text) {
  let d = '', x = 0;
  for (const ch of text) {
    const g = MC.font && (MC.font[ch] || MC.font['?']); if (!g) continue;
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
/* texte en pixels : un svg par mot (retour à la ligne possible), et le vrai texte pour les lecteurs d'écran */
function px(text, cls, oneBlock) {
  text = String(text).replace(/[  ]/g, ' ').trim();
  const box = h('span', { class: 'cb-px' + (cls ? ' ' + cls : ''), 'aria-hidden': 'true' });
  if (!MC.font || !MC.font.a) { box.textContent = text; box.classList.add('cb-px-txt'); return [h('span', { class: 'sr', text }), box]; }
  (oneBlock ? [text] : text.split(' ').filter(Boolean)).forEach(w => box.appendChild(pxSvg(w)));
  return [h('span', { class: 'sr', text }), box];
}
const pxEl = (tag, attrs, text, cls, one) => { const e = h(tag, attrs); px(text, cls, one).forEach(n => e.appendChild(n)); return e; };

/* ---------- la pièce de Braise (même dessin que tavern.js : disque de braise, jamais une pièce d'or) ---------- */
const COIN_ROWS = ['................', '.....rrrrrr.....', '...rrOOOOOOrr...', '..rOOhhOOOOOOr..', '..rOhhOOyOOOOr..', '.rOOhOOyYyOOOOr.', '.rOOOOyYYyOOOOr.', '.rOOOyYYYYyOOOr.',
  '.rOOOyYYYYyOOOr.', '.rOOOOyYYyOOOdr.', '.rOOOOOyyOOOddr.', '..rOOOOOOOOddr..', '..rOOOOOOOdddr..', '...rrOOOdddrr...', '.....rrrrrr.....', '................'];
const COIN_PAL = { r: '#6e1d08', O: '#e2541a', h: '#ff9a52', d: '#b13a10', y: '#ffb347', Y: '#ffe6a6' };
/* une petite balance en pixels, pour le bouton d'ouverture */
const SCALE_ROWS = ['................', '.......kk.......', '.......yy.......', '.yyyyyyyyyyyyyy.', '.k.....yy.....k.', '.k.....yy.....k.', 'k.k....yy....k.k', 'k.k....yy....k.k',
  'k..k...yy...k..k', 'yyyyy..yy..yyyyy', '.yyy...yy...yyy.', '.......yy.......', '.......yy.......', '.....yyyyyy.....', '....kkkkkkkk....', '................'];
const SCALE_PAL = { k: '#7a4a12', y: '#ffb547' };
function art(rows, pal) {
  const c = D.createElement('canvas'); c.width = rows[0].length; c.height = rows.length;
  const g = c.getContext('2d');
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (pal[r[x]]) { g.fillStyle = pal[r[x]]; g.fillRect(x, y, 1, 1); } });
  return c.toDataURL();
}
try {
  root.style.setProperty('--cb-coin', 'url(' + art(COIN_ROWS, COIN_PAL) + ')');
  root.style.setProperty('--cb-scale', 'url(' + art(SCALE_ROWS, SCALE_PAL) + ')');
} catch (e) { /* sans canvas : pas d'icône */ }
const coin = () => h('span', { class: 'cb-coin', 'aria-hidden': 'true' });

/* ---------- icônes du jeu : bande verticale de cases 16 x 16, chargée à la première ouverture ---------- */
let sheet = null, sheetP = null;
function loadSheet() {
  if (!sheetP) sheetP = new Promise(ok => { const i = new Image(); i.onload = () => { sheet = i; ok(true); }; i.onerror = () => ok(false); i.src = 'assets/mc/items.png'; });
  return sheetP;
}
function icon(name, size) {
  const k = name && MC.items ? MC.items[name] : undefined;
  if (!sheet || typeof k !== 'number') return h('span', { class: 'cb-ic none', style: '--s:' + size + 'px', 'aria-hidden': 'true' });
  const c = D.createElement('canvas'); c.width = c.height = 16; c.className = 'cb-ic'; c.style.setProperty('--s', size + 'px'); c.setAttribute('aria-hidden', 'true');
  const g = c.getContext('2d'); g.imageSmoothingEnabled = false; g.drawImage(sheet, 0, k * 16, 16, 16, 0, 0, 16, 16);
  return c;
}
const coinIcon = size => h('span', { class: 'cb-ic cb-ic-coin', style: '--s:' + size + 'px', 'aria-hidden': 'true' });

/* ---------- les deux options : « Détail en paquets » et « Calculer ton budget » (rien n'est mémorisé) ---------- */
let conv = false;
function setConv(v) { conv = v; sw.setAttribute('aria-checked', v ? 'true' : 'false'); }
if (!PACKS.length) { sw.hidden = true; bsw.hidden = true; }     // sans paquets, rien à détailler ni à calculer

(function () { const t = title.textContent; title.textContent = ''; px(t).forEach(n => title.appendChild(n)); })();

/* ---------- état ---------- */
// view : 'cats' (écran 1), 'cat' (une catégorie), 'all' (tout voir) ; la recherche (q) passe par-dessus
let view = FLAT ? 'all' : 'cats', catId = null, q = '', ficheId = null;
const levels = [];                                               // pas d'historique poussés : 'open' | 'cat' | 'fiche'

function itemTile(o, showCat) {
  const pa = conv ? panier(o.braises) : null;
  return h('button', { class: 'cb-it', type: 'button', 'data-id': o.id, on: { click: () => openFiche(o.id, true) } },
    icon(o.icon, 40),
    h('span', { class: 'cb-it-n', text: o.name }),
    showCat && o._c ? h('span', { class: 'cb-it-k', text: o._c.name }) : null,
    h('span', { class: 'cb-it-p' }, h('b', { text: fb(o.braises) }), coin(), ' Braises'),
    pa ? h('span', { class: 'cb-it-pk' }, h('span', { class: 'sr', text: ', en paquets : ' }), pa.txt + ' · ' + fe(pa.cents) + ' · reste ' + fb(pa.reste)) : null);
}
const grid = (list, showCat) => h('div', { class: 'cb-grid cb-grid-it' }, ...list.map(o => itemTile(o, showCat)));

function catTile(c) {
  return h('button', { class: 'cb-cat', type: 'button', 'data-cat': c.id, on: { click: () => openCat(c.id, true) } },
    c.icon ? icon(c.icon, 48) : coinIcon(48),
    pxEl('span', { class: 'cb-cat-n' }, c.name),
    h('span', { class: 'cb-cat-c', text: nObjets(c.items.length) }),
    h('span', { class: 'cb-cat-r', text: range(c.items) }));
}
function allTile() {
  return h('button', { class: 'cb-cat cb-all', type: 'button', 'data-cat': '*', on: { click: () => openAll(true) } },
    coinIcon(48),
    pxEl('span', { class: 'cb-cat-n' }, 'Tout voir'),
    h('span', { class: 'cb-cat-c', text: nObjets(OBJS.length) }),
    h('span', { class: 'cb-cat-r', text: range(OBJS) }));
}
function bar(label, current) {                                     // « ← Catégories › Titres », collant en haut de la liste
  if (FLAT && !q.trim()) return null;                              // une seule liste : rien à remonter
  const back = FLAT ? () => { clearQ(); render(false); title.focus({ preventScroll: true }); } : backToCats;
  return h('div', { class: 'cb-bar' },
    h('button', { class: 'cb-back', type: 'button', on: { click: back } }, h('span', { 'aria-hidden': 'true', text: '← ' }), FLAT ? 'Tous les objets' : label || 'Catégories'),
    current ? h('span', { class: 'cb-crumb', 'aria-hidden': 'true' }, h('i', { text: '›' }), current) : null);
}
function emptyCatalogue() {
  return h('div', { class: 'cb-empty' }, coinIcon(48),
    h('p', { text: "Le tavernier n'a encore rien posé sur l'étal. Les objets arriveront avant l'ouverture." }));
}

/* ---------- la recherche : sans accents ni casse, une faute tolérée sur les mots de 5 lettres ou plus ---------- */
function lev1(a, b) {
  if (a === b) return true;
  const la = a.length, lb = b.length; if (Math.abs(la - lb) > 1) return false;
  let i = 0, j = 0, e = 0;
  while (i < la && j < lb) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++e > 1) return false;
    if (la > lb) i++; else if (lb > la) j++; else { i++; j++; }
  }
  return e + (la - i) + (lb - j) <= 1;
}
function search(raw) {
  const toks = norm(raw).split(' ').filter(Boolean);
  if (!toks.length) return [];
  const out = [];
  OBJS.forEach(o => {
    let score = 0;
    for (const t of toks) {
      if (o._n.includes(t)) continue;                                  // dans le nom : le meilleur
      if (o._h.includes(t)) { score = Math.max(score, 1); continue; }  // texte ou synonymes
      if (t.length >= 5 && o._f.some(w => lev1(t, w) || (w.length > t.length && lev1(t, w.slice(0, t.length))))) { score = Math.max(score, 2); continue; }
      return;
    }
    out.push({ o, score });
  });
  return out.sort((a, b) => a.score - b.score || a.o.braises - b.o.braises).map(r => r.o);
}
const exactCat = raw => { const n = norm(raw); return n ? CATS.find(c => norm(c.name) === n || c.id === n) : null; };
const nearCat = raw => { const n = norm(raw); return n.length >= 3 ? CATS.find(c => { const m = norm(c.name); return m.startsWith(n) || n.startsWith(m) || lev1(n, m); }) : null; };

/* ---------- l'écran ---------- */
let lastAnnounce = '';
function announce(t) { if (t === lastAnnounce) { live.textContent = ''; } lastAnnounce = t; setTimeout(() => { live.textContent = t; }, 30); }

function render(focusHead) {
  main.textContent = '';
  const scroll = h('div', { class: 'cb-scroll', id: 'cb-scroll' });
  let focusEl = null;
  if (!OBJS.length) { scroll.appendChild(emptyCatalogue()); main.appendChild(scroll); return; }
  const qq = q.trim();
  const ex = qq ? exactCat(qq) : null;
  if (qq && !ex) {                                                  // résultats, toutes catégories
    const res = search(qq);
    const nc = nearCat(qq);
    { const b = bar('Catégories', 'Résultats'); if (b) scroll.appendChild(b); }
    const hd = h('h3', { class: 'cb-h', tabindex: '-1' }, 'Résultats pour « ' + qq + ' »', h('small', { text: ' · ' + nObjets(res.length) }));
    scroll.appendChild(hd); focusEl = hd;
    if (nc) scroll.appendChild(h('p', { class: 'cb-hint' }, h('button', { class: 'cb-chip', type: 'button', on: { click: () => { clearQ(); openCat(nc.id, true); } } }, 'Voir la catégorie ' + nc.name + ' (' + nObjets(nc.items.length) + ')')));
    if (res.length) scroll.appendChild(grid(res, !FLAT));
    else {
      scroll.appendChild(h('div', { class: 'cb-empty' },
        h('p', { text: 'Aucun objet ne correspond à « ' + qq + ' ». Essaie : titre, couleur, compagnon.' }),
        h('p', { class: 'cb-empty-b' },
          h('button', { class: 'btn btn-sm', type: 'button', on: { click: () => { clearQ(); qIn.focus(); } } }, 'Effacer la recherche'),
          FLAT ? null : h('button', { class: 'btn btn-sm', type: 'button', on: { click: () => { clearQ(); backToCats(); } } }, 'Voir les catégories'))));
    }
    announce(res.length ? nObjets(res.length) + (res.length > 1 ? ' trouvés' : ' trouvé') : 'Aucun objet trouvé');
  } else if (ex || view === 'cat') {
    const c = ex || byCat.get(catId);
    { const b = bar('Catégories', c.name); if (b) scroll.appendChild(b); }
    const hd = h('h3', { class: 'cb-h cb-h-px', tabindex: '-1' });
    px(ex ? 'Catégorie ' + c.name : c.name).forEach(n => hd.appendChild(n));
    hd.appendChild(h('small', { text: ex ? '(' + nObjets(c.items.length) + ')' : nObjets(c.items.length) }));
    scroll.appendChild(hd); focusEl = hd;
    if (c.desc) scroll.appendChild(h('p', { class: 'cb-desc', text: c.desc }));
    scroll.appendChild(grid(c.items, false));
    if (ex) announce('Catégorie ' + c.name + ', ' + nObjets(c.items.length));
  } else if (view === 'all') {
    { const b = bar('Catégories', 'Tout voir'); if (b) scroll.appendChild(b); }
    const hd = h('h3', { class: 'cb-h cb-h-px', tabindex: '-1' });
    px(FLAT ? 'Tous les objets' : 'Tout voir').forEach(n => hd.appendChild(n));
    hd.appendChild(h('small', { text: nObjets(OBJS.length) + ', du moins cher au plus cher' }));
    scroll.appendChild(hd); focusEl = hd;
    if (FLAT) scroll.appendChild(grid(OBJS, false));
    else CATS.forEach(c => {
      scroll.appendChild(h('h4', { class: 'cb-h4' }, c.name, h('small', { text: ' · ' + nObjets(c.items.length) })));
      scroll.appendChild(grid(c.items, false));
    });
  } else {                                                          // écran 1 : les catégories
    // « Tout voir » à part, en bas de la fenêtre (catalogue.css : .cb-scroll-cats)
    scroll.classList.add('cb-scroll-cats');
    const lab = h('p', { class: 'cb-lab', id: 'cb-lab', text: 'Catégorie :' });
    scroll.appendChild(lab);
    scroll.appendChild(h('div', { class: 'cb-grid cb-grid-cat', role: 'group', 'aria-labelledby': 'cb-lab' }, ...CATS.map(catTile)));
    scroll.appendChild(allTile());
  }
  main.appendChild(scroll);
  const bh = scroll.querySelector('.cb-bar');
  scroll.style.scrollPaddingTop = (bh ? bh.offsetHeight + 12 : 12) + 'px';
  if (focusHead && focusEl) focusEl.focus({ preventScroll: true });
}

function setView(v, id) { view = v; catId = id || null; }
function push(kind) {
  levels.push(kind);
  try { history.pushState({ cb: levels.length }, ''); } catch (e) { /* sans historique : tant pis */ }
}
function openCat(id, user) {
  if (!byCat.has(id)) return;
  if (levels[levels.length - 1] !== 'cat') push('cat');
  setView('cat', id); render(user);
  main.querySelector('.cb-scroll').scrollTop = 0;
}
function openAll(user) {
  if (levels[levels.length - 1] !== 'cat') push('cat');
  setView('all'); render(user);
}
/* revenir aux catégories : par l'historique si on y a laissé un pas, sinon directement */
function backToCats() {
  if (levels[levels.length - 1] === 'cat') { history.back(); return; }
  undoCat();
}
function undoCat() {
  const was = catId || (view === 'all' ? '*' : null);
  if (q) { q = ''; qIn.value = ''; }
  setView(FLAT ? 'all' : 'cats'); render(false);
  const t = was && main.querySelector('[data-cat="' + (window.CSS && CSS.escape ? CSS.escape(was) : was) + '"]');
  if (t) t.focus({ preventScroll: false }); else title.focus({ preventScroll: true });
}

/* ---------- le plateau : afficheur de balance ---------- */
let mode = 'eur', plateOpen = false;                             // calculatrice : 'eur' (budget) ou 'br' (Braises voulues)
const cell = (label, ...kids) => h('div', { class: 'cb-cell' }, h('span', { class: 'cb-cell-l', text: label }), ...kids);
const lcd = (text, sr) => h('span', { class: 'cb-lcd' }, h('span', { class: 'sr', text: sr || text }), ...px(text, 'cb-lcd-d', true).slice(1));
let calcIn = null, calcOut = null, calcVal = '';                 // la saisie survit à la pesée d'un objet
function drawCalc() {
  plate.dataset.mode = 'calc';
  plate.textContent = '';
  if (!SIMU || !PACKS.length) { plate.appendChild(h('p', { class: 'cb-plate-msg', text: 'Les paquets ne sont pas encore fixés.' })); return; }
  const eur = mode === 'eur';
  calcIn = h('input', { id: 'cb-in', type: 'text', inputmode: eur ? 'decimal' : 'numeric', autocomplete: 'off', spellcheck: 'false', placeholder: eur ? 'ex : 10' : 'ex : 2 000' });
  calcIn.value = calcVal;
  calcIn.addEventListener('input', () => { calcVal = calcIn.value; calc(); });
  calcOut = h('output', { class: 'cb-out', for: 'cb-in', 'aria-live': 'polite' });
  plate.append(
    h('div', { class: 'cb-cell cb-cell-in' },
      h('span', { class: 'cb-lrow' },
        h('label', { class: 'cb-cell-l', for: 'cb-in', text: eur ? 'Ton budget' : 'Tu veux' }),
        h('button', { class: 'cb-link', type: 'button', on: { click: () => { mode = eur ? 'br' : 'eur'; calcVal = ''; drawCalc(); calcIn.focus(); } } },
          eur ? 'ou partir d\'un nombre de Braises' : 'ou partir d\'un budget en euros')),
      h('span', { class: 'cb-inbox' }, calcIn, h('span', { class: 'cb-unit', 'aria-hidden': 'true', text: eur ? '€' : 'Braises' }))),
    calcOut);
  calc();
}
function calc() {
  const raw = calcIn.value, eur = mode === 'eur';
  calcOut.textContent = '';
  const v = raw.trim() ? (eur ? SIMU.lireEuros(raw) : SIMU.lireBraises(raw)) : null;
  const put = (a, b, c) => calcOut.append(cell(a, b), c);
  if (!raw.trim()) {
    put(eur ? '= Braises' : '= À payer', lcd(eur ? '0' : '0,00 €', eur ? '0 Braises' : '0 €'),
      cell('En paquets', h('span', { class: 'cb-cell-t dim', text: eur ? 'Écris un montant : je te dis ce que ça donne en paquets.' : 'Écris un nombre de Braises : je te dis le moins cher.' })));
    return;
  }
  if (v == null || v === 0) {
    put(eur ? '= Braises' : '= À payer', lcd('----', '—'),
      cell('En paquets', h('span', { class: 'cb-cell-t', text: v === 0 ? 'Écris un nombre plus grand que 0.' : 'Je ne lis pas « ' + raw.trim() + ' ». Écris par exemple ' + (eur ? '10 ou 12,50.' : '2000.') })));
    return;
  }
  if (eur) {
    const r = SIMU.pourEuros(PACKS, v);
    if (!r.braises) { put('= Braises', lcd('0', '0 Braises'), cell('En paquets', h('span', { class: 'cb-cell-t', text: 'Pas de paquet : le plus petit (' + REF.short + ') coûte ' + fe(REF.cents) + '.' }))); return; }
    put('= Braises', h('span', { class: 'cb-lcd-row' }, lcd(fb(r.braises), fb(r.braises) + ' Braises'), coinIcon(22)),
      cell('En paquets', h('span', { class: 'cb-cell-t' }, h('b', { text: basketTxt(r) }), ' (' + fe(r.cents) + ')',
        r.reste > 0 ? h('small', { text: ' · non dépensé : ' + fe(r.reste) }) : null,
        r.plafond ? h('small', { text: ' · calcul arrêté à ' + fe(SIMU.MAX_CENTS) }) : null)));
  } else {
    const r = SIMU.pourBraises(PACKS, v);
    put('= À payer', lcd(fe(r.cents), fe(r.cents)),
      cell('En paquets', h('span', { class: 'cb-cell-t' }, h('b', { text: basketTxt(r) }), ', pour ' + fb(r.braises) + ' Braises',
        r.surplus > 0 ? h('small', { text: ' · ' + fb(r.surplus) + ' de plus que voulu' }) : null,
        r.plafond ? h('small', { text: ' · calcul arrêté à ' + fb(SIMU.MAX_BRAISES) + ' Braises' }) : null)));
  }
}
function drawPesee(o) {
  plate.dataset.mode = 'pese';
  plate.textContent = '';
  const pa = panier(o.braises);
  plate.append(
    h('div', { class: 'cb-cell cb-cell-obj' }, h('span', { class: 'cb-cell-l', text: 'Sur le plateau' }), h('span', { class: 'cb-obj' }, icon(o.icon, 32), h('b', { text: o.name }))),
    cell('Prix en jeu', h('span', { class: 'cb-lcd-row' }, lcd(fb(o.braises), fb(o.braises) + ' Braises'), coinIcon(22))),
    pa ? cell('En paquets', h('span', { class: 'cb-cell-t' }, h('b', { text: pa.txt + ' = ' + fe(pa.cents) }), pa.reste ? ', il te restera ' + fb(pa.reste) + ' Braises' : ', il ne te restera rien')) : null);
}
function setPlate(open) {
  plateOpen = open; bsw.setAttribute('aria-checked', open ? 'true' : 'false');
  dlg.classList.toggle('cb-plate-on', open);
  plate.hidden = !open;
}

/* ---------- la fiche d'un objet ---------- */
function openFiche(id, user) {
  const o = OBJS.find(x => x.id === id); if (!o) return;
  if (levels[levels.length - 1] !== 'fiche') push('fiche');
  ficheId = id;
  const pa = panier(o.braises);
  fiche.textContent = '';
  const name = h('h3', { class: 'cb-f-n', id: 'cb-f-n', tabindex: '-1', text: o.name });
  fiche.append(
    h('div', { class: 'cb-f-top' },
      icon(o.icon, 64),
      h('div', null, name, o._c ? h('p', { class: 'cb-f-k', text: o._c.name }) : null),
      h('button', { class: 'cb-x cb-f-x', type: 'button', 'aria-label': 'Fermer la fiche', on: { click: backFromFiche } }, h('span', { 'aria-hidden': 'true' }))),
    o.lore ? h('p', { class: 'cb-f-lore', text: o.lore }) : null,
    h('div', { class: 'cb-f-price' },
      h('p', { class: 'cb-f-br' }, h('b', { text: fb(o.braises) }), coin(), ' Braises'),
      pa ? h('p', { class: 'cb-f-pk' }, 'Le moins cher en paquets : ', h('b', { text: pa.txt + ' = ' + fe(pa.cents) }), ' pour ' + fb(pa.braises) + ' Braises.',
        pa.reste ? ' Il te restera ' + fb(pa.reste) + ' Braises.' : ' Il ne te restera rien.') : null),
    h('ul', { class: 'cb-f-notes' },
      h('li', { text: 'Purement visuel : aucun avantage en jeu.' }),
      isGrade(o) ? h('li', { text: 'Un seul grade à la fois.' }) : null,
      h('li', { text: 'Se règle en jeu, au comptoir du tavernier.' })));
  fiche.hidden = false; scrim.hidden = false;
  main.inert = true; plate.inert = true;
  dlg.classList.add('cb-fiche-on');
  drawPesee(o);
  if (user !== false) name.focus({ preventScroll: true });
}
function backFromFiche() {
  if (levels[levels.length - 1] === 'fiche') { history.back(); return; }
  undoFiche();
}
function undoFiche(keepFocus) {
  if (!ficheId) return;
  const id = ficheId; ficheId = null;
  fiche.hidden = true; scrim.hidden = true; fiche.textContent = '';
  main.inert = false; plate.inert = false;
  dlg.classList.remove('cb-fiche-on');
  drawCalc();
  if (keepFocus) return;
  const t = main.querySelector('.cb-it[data-id="' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]');
  if (t) t.focus(); else title.focus({ preventScroll: true });
}
/* fermer la fiche sans attendre l'historique (on tape dans la recherche) : on retire aussi son pas d'historique */
function dropFiche() {
  if (!ficheId) return;
  if (levels[levels.length - 1] === 'fiche') { levels.pop(); ignorePop++; try { history.back(); } catch (e) { ignorePop--; } }
  undoFiche(true);
}
scrim.addEventListener('click', backFromFiche);

/* ---------- le pied, toujours visible ---------- */
function drawFoot() {
  foot.textContent = '';
  foot.append(
    h('p', null, h('b', { text: 'Tarifs indicatifs' }), ' · Rien n\'est encore en vente. Pas de cape, aucun avantage en jeu : uniquement de l\'apparence.'),
    h('p', null, 'Les Braises n\'ont pas de valeur monétaire : ni convertibles en argent, ni transférables.',
      PACKS.length ? ' On n\'achète que des paquets entiers.' : ''));
}

/* ---------- ouvrir, fermer, revenir en arrière ---------- */
let ignorePop = 0;
function open() {
  if (dlg.open) return;
  q = ''; qIn.value = ''; setView(FLAT ? 'all' : 'cats'); ficheId = null;
  setConv(false); setPlate(false); mode = 'eur'; calcVal = ''; drawCalc(); drawFoot(); render(false);
  root.classList.add('cb-lock', 'tv-pause');                     // la taverne 3D se fige dessous (tavern.js)
  dlg.showModal();
  push('open');
  loadSheet().then(ok => { if (ok && dlg.open) { const s = main.querySelector('.cb-scroll'), y = s ? s.scrollTop : 0; render(false); const s2 = main.querySelector('.cb-scroll'); if (s2) s2.scrollTop = y; if (ficheId) openFiche(ficheId, false); } });
  if (PHONE.matches || COARSE.matches) title.focus({ preventScroll: true });   // pas de clavier qui surgit sur téléphone
  else qIn.focus({ preventScroll: true });
}
function cleanup() {
  root.classList.remove('cb-lock', 'tv-pause');
  fiche.hidden = true; scrim.hidden = true; main.inert = false; plate.inert = false; dlg.classList.remove('cb-fiche-on');
  ficheId = null;
  if (levels.length) { const n = levels.length; levels.length = 0; ignorePop++; try { history.go(-n); } catch (e) { ignorePop--; } }
  openBtn.focus({ preventScroll: true });
}
openBtn.addEventListener('click', open);
xBtn.addEventListener('click', () => dlg.close());
dlg.addEventListener('close', cleanup);
dlg.addEventListener('click', e => {                              // clic sur le fond (hors de la fenêtre) : on ferme
  if (e.target !== dlg) return;
  const r = dlg.getBoundingClientRect();
  if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dlg.close();
});
/* Échap : d'abord le champ rempli, puis la fiche, puis la fenêtre */
dlg.addEventListener('keydown', e => {
  if (e.key !== 'Escape' || e.defaultPrevented) return;
  e.preventDefault();
  const t = e.target;
  if (t && t.tagName === 'INPUT' && t.value) {
    t.value = '';
    if (t === qIn) { clearTimeout(qTimer); q = ''; render(false); announce(''); }
    else calc();
    return;
  }
  if (ficheId) { backFromFiche(); return; }
  dlg.close();
});
/* demande de fermeture du système (retour d'Android) : un pas en arrière d'abord */
dlg.addEventListener('cancel', e => {
  if (ficheId) { e.preventDefault(); backFromFiche(); return; }
  if (!FLAT && (view !== 'cats' || q)) { e.preventDefault(); if (q) { clearQ(); } else backToCats(); }
});
addEventListener('popstate', e => {
  if (ignorePop) { ignorePop--; return; }
  if (!dlg.open) return;
  const target = (e.state && e.state.cb) || 0;
  while (levels.length > target) {
    const k = levels.pop();
    if (k === 'fiche') undoFiche();
    else if (k === 'cat') undoCat();
    else if (k === 'open') { levels.length = 0; dlg.close(); return; }
  }
});

/* ---------- la recherche en direct ---------- */
let qTimer = 0;
function clearQ() { clearTimeout(qTimer); q = ''; qIn.value = ''; }
qIn.addEventListener('input', () => {
  clearTimeout(qTimer);
  qTimer = setTimeout(() => {
    dropFiche();
    const had = !!q.trim(); q = qIn.value;
    if (!q.trim() && had) announce(view === 'cats' ? 'Catégories' : '');
    render(false);
  }, 150);
});
qIn.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); clearTimeout(qTimer); q = qIn.value; render(false); const f = main.querySelector('.cb-it, .cb-cat'); if (f && q.trim()) f.focus(); } });

/* ---------- les deux interrupteurs ---------- */
sw.addEventListener('click', () => {
  setConv(!conv);
  const s = main.querySelector('.cb-scroll'), y = s ? s.scrollTop : 0;
  render(false);
  const s2 = main.querySelector('.cb-scroll'); if (s2) s2.scrollTop = y;
});
bsw.addEventListener('click', () => { setPlate(!plateOpen); if (plateOpen && calcIn && !ficheId) calcIn.focus(); });

/* ---------- liens directs et essais ---------- */
if (QS.get('simu') === '1') {
  const go = () => {
    open();
    if (QS.get('conv') === '1') { setConv(true); render(false); }
    if (QS.get('budget') === '1') setPlate(true);
    const c = QS.get('cat'), it = QS.get('item'), qq = QS.get('q');
    if (c === '*' || c === 'tout') openAll(false);
    else if (c && byCat.has(c)) openCat(c, false);
    else if (it && !FLAT) { const o = OBJS.find(x => x.id === it); if (o && o._c) openCat(o._c.id, false); }
    if (qq) { qIn.value = qq; q = qq; render(false); }
    if (it) openFiche(it, false);
  };
  if (D.readyState === 'complete') go(); else addEventListener('load', go);
}
})();
