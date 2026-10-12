/* The Last — page 404 « Sous la bedrock » : vu d'en dessous.
   La caméra est dans le vide, sous la bedrock, et regarde vers le haut. En haut de l'écran, le dessous du plafond de
   bedrock, en légère perspective, avec le trou par lequel le visiteur est passé. Au-dessus du trou, la lave du Nether :
   un faisceau chaud descend et s'éteint dans le noir. Des braises tombent du trou et s'éteignent ; de fines poussières
   remontent, comme si la chute continuait.
   Rendu : canvas 2D seulement. Le plafond est un plan texturé dessiné ligne par ligne (une ligne d'écran = une
   profondeur), une seule fois par taille d'écran. Les parois du trou sont des tranches du même plan, empilées.
   La lave (texture animée du jeu, /assets/mc/blocks.png) est un petit canvas derrière le plafond, redessiné ~12 fois par
   seconde. Faisceau et particules : un canvas par-dessus, à chaque requestAnimationFrame (donc en pause onglet caché).
   « Réduire les animations » : une seule image fixe. Essais en local seulement : ?t=3 fige l'animation à 3 secondes.
   Sans JavaScript, ou si la texture ne charge pas, le CSS montre un plafond sombre et la lueur du trou. */
(() => {
'use strict';

const D = document, W = window, root = D.documentElement;
const MC = W.MC || { blocks: {}, font: {} };
const $ = (s, r) => (r || D).querySelector(s), $$ = (s, r) => Array.from((r || D).querySelectorAll(s));
const Q = new URLSearchParams(location.search);
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const REDUIT = !!(W.matchMedia && W.matchMedia('(prefers-reduced-motion: reduce)').matches);
const T_FIXE = LOCAL && Q.has('t') ? Math.max(0, parseFloat(Q.get('t')) || 0) : (REDUIT ? 3.2 : null);

function h(tag, attrs) {
  const e = D.createElement(tag);
  if (attrs) for (const k in attrs) { if (k === 'class') e.className = attrs[k]; else if (k === 'text') e.textContent = attrs[k]; else e.setAttribute(k, attrs[k]); }
  return e;
}

/* ---------- police du jeu (mêmes glyphes que le reste du site, voir assets/mc/mc.js) ---------- */
function pxWord(word) {
  let d = '', x = 0;
  for (const ch of word) {
    const g = MC.font[ch === '\u00a0' ? ' ' : ch] || MC.font['?']; if (!g) continue;   // espace insécable : les mots restent ensemble
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
  el.classList.add('pxd');
}
function pxLabel(el, text) {
  text = String(text).trim(); el.textContent = '';
  const box = h('span', { class: 'pxl', 'aria-hidden': 'true' });
  text.split(' ').filter(Boolean).forEach(w => box.appendChild(pxWord(w)));
  el.append(h('span', { class: 'sr', text }), box); el.classList.add('pxl-host');
}
if (MC.font && MC.font.A) {
  $$('.top .tbtn').forEach(b => pxLabel(b, b.textContent));
  $$('.v-sorties .btn').forEach(b => pxLabel(b, b.textContent));
  $$('h1.px').forEach(pxText);
}

/* ---------- « Tu cherchais peut-être » : seulement si l'adresse ressemble à une vraie page ---------- */
let chemin = location.pathname;
try { chemin = decodeURIComponent(chemin); } catch (e) { /* adresse mal encodée : on la compare telle quelle */ }
const PAGES = [
  ['/', 'Accueil', ['accueil', 'index', 'home']],
  ['/boutique', 'Boutique', ['boutique', 'shop', 'taverne']],
  ['/chantier', 'Chantier', ['chantier', 'journal']],
  ['/#volkar', 'Demande à Volkar', ['faq', 'aide', 'volkar']],
  ['/en', 'English', ['en', 'english']],
  ['/confidentialite', 'Confidentialité', ['confidentialite', 'vie-privee']],
  ['/cgu', "Conditions d'utilisation", ['cgu', 'cgv', 'conditions']],
  ['/mentions-legales', 'Mentions légales', ['mentions-legales', 'mentions']],
  ['/compte/achats', "Historique d'achat", ['achats', 'historique']],
  ['/compte/parametres', 'Paramètres du compte', ['parametres', 'reglages']],
  ['/discord/', 'Discord', ['discord']]
];
function lev(a, b) {
  const m = a.length, n = b.length; let p = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const c = [i];
    for (let j = 1; j <= n; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    p = c;
  }
  return p[n];
}
function devine(path) {
  const seg = path.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\/+$/, '')
    .split('/').pop().replace(/\.html?$/, '').trim();
  if (!seg) return null;
  const tol = seg.length <= 3 ? 0 : seg.length <= 5 ? 1 : 2;
  let best = null, bd = Infinity;
  PAGES.forEach(p => p[2].forEach(a => { const d = lev(seg, a); if (d < bd) { bd = d; best = p; } }));
  return bd <= tol ? best : null;
}
{
  const p = devine(chemin);
  if (p) { const a = $('.v-lien'); a.href = p[0]; a.textContent = p[1]; $('.v-peut').hidden = false; }
}

/* ---------- la scène ---------- */
const ciel = $('.v-ciel');
if (!ciel || !W.HTMLCanvasElement) return;
const cLave = h('canvas', { class: 'v-lave' }), cPlaf = h('canvas', { class: 'v-plaf' }), cFx = h('canvas', { class: 'v-fx', 'aria-hidden': 'true' });
const boite = h('div', { class: 'v-fxbox', 'aria-hidden': 'true' }); boite.appendChild(cFx);
ciel.append(cLave, cPlaf); D.body.insertBefore(boite, ciel.nextSibling);
const gL = cLave.getContext('2d'), gP = cPlaf.getContext('2d'), gF = cFx.getContext('2d');
if (!gL || !gP || !gF) return;

const mk = (w, hh) => { const c = D.createElement('canvas'); c.width = Math.max(1, Math.ceil(w)); c.height = Math.max(1, Math.ceil(hh)); return c; };
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const hash = (i, j, s) => { let x = (i * 374761393 + j * 668265263 + s * 974634581) | 0; x = Math.imul(x ^ (x >>> 13), 1274126177); x ^= x >>> 16; return (x >>> 0) / 4294967296; };
function mulberry(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

/* Le trou : des blocs entiers manquants (i = gauche-droite, j = proche-loin), centré sur (0, 0). */
const TROU = new Set(['-1,-2', '0,-2', '-2,-1', '-1,-1', '0,-1', '1,-1', '-2,0', '-1,0', '0,0', '1,0', '2,0', '-1,1', '0,1', '1,1', '2,1']);
const estTrou = (i, j) => TROU.has(i + ',' + j);
const BLOCS = Array.from(TROU, k => k.split(',').map(Number));
function dTrou(X, Z) {   // distance (en blocs) d'un point du plafond au bord du trou
  let d = Infinity;
  for (const b of BLOCS) { const dx = Math.max(b[0] - X, 0, X - b[0] - 1), dz = Math.max(b[1] - Z, 0, Z - b[1] - 1); d = Math.min(d, Math.hypot(dx, dz)); }
  return d;
}
const EP = 1.25;              // épaisseur de la bedrock percée, en blocs
const HAUT = 7;               // le plafond est à 7 blocs au-dessus de la caméra
const ZONE = [-6, 6, -5, 5];  // blocs autour du trou dessinés pour les parois et la lave

let IMG = null, BED = null, BEDPX = null;
const G = {};                 // géométrie, recalculée à chaque taille

/* Une ligne de l'écran (en pixels réels) regarde le plan Y = hp à une profondeur Z, avec une échelle s (pixels par bloc). */
function ligne(y, hp) {
  const v = G.cy - y, dY = v * G.c + G.f * G.s, dZ = G.f * G.c - v * G.s;
  if (dY <= 0) return null;
  return { s: dY / hp, z: hp * dZ / dY - G.zh };
}
function plan(g, src, i0, j0, hp, y0, y1) {
  for (let y = y0; y < y1; y++) {
    const a = ligne(y + .5, hp), b = ligne(y + 1.5, hp); if (!a || !b) continue;
    const ty = (a.z - j0) * 16; if (ty < 0 || ty >= src.height) continue;
    const th = Math.max(.02, Math.abs(b.z - a.z) * 16);
    const x0 = (0 - G.cx) / a.s - i0, x1 = (G.W - G.cx) / a.s - i0;
    const sx = Math.max(0, x0 * 16), ex = Math.min(src.width, x1 * 16); if (ex <= sx) continue;
    const dx = G.cx + (sx / 16 + i0) * a.s, dw = (ex - sx) / 16 * a.s;
    g.drawImage(src, sx, Math.floor(ty), ex - sx, Math.min(th, src.height - Math.floor(ty)), dx, y, dw, 1);
  }
}

/* Une plaque de bedrock vue de dessous (blocs tournés au hasard, toujours les mêmes), éclairée texel par texel. */
function plaque(i0, i1, j0, j1, tuile, lum) {
  const w = (i1 - i0) * 16, hh = (j1 - j0) * 16, c = mk(w, hh), g = c.getContext('2d');
  for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
    if (estTrou(i, j)) continue;
    g.drawImage(tuile(i, j), (i - i0) * 16, (j - j0) * 16);
  }
  const id = g.getImageData(0, 0, w, hh), d = id.data, m = [1, 1, 1];
  for (let y = 0; y < hh; y++) {
    const Z = j0 + (y + .5) / 16;
    for (let x = 0; x < w; x++) {
      const k = (y * w + x) * 4; if (!d[k + 3]) continue;
      lum(i0 + (x + .5) / 16, Z, m);
      d[k] = Math.min(255, d[k] * m[0]); d[k + 1] = Math.min(255, d[k + 1] * m[1]); d[k + 2] = Math.min(255, d[k + 2] * m[2]);
    }
  }
  g.putImageData(id, 0, 0);
  return c;
}
const TUILES = {};
function tuileDessous(i, j) {        // la face du dessous d'un bloc : la texture, tournée
  const r = hash(i, j, 1) * 4 | 0; if (TUILES['d' + r]) return TUILES['d' + r];
  const c = mk(16, 16), g = c.getContext('2d');
  g.translate(8, 8); g.rotate(r * Math.PI / 2); g.drawImage(BED, -8, -8);
  return TUILES['d' + r] = c;
}
function tuileTranche(rang) {        // coupe d'un bloc à une hauteur : ses bords montrent la ligne `rang` de la face de côté
  return (i, j) => {
    const off = hash(i, j, 2) * 16 | 0, key = 't' + rang + ':' + off; if (TUILES[key]) return TUILES[key];
    const c = mk(16, 16), g = c.getContext('2d'), id = g.createImageData(16, 16);
    for (let w = 0; w < 16; w++) for (let u = 0; u < 16; u++) {
      const du = Math.min(u, 15 - u), dw = Math.min(w, 15 - w), col = dw <= du ? (u + off) & 15 : (w + off) & 15;
      const s = (rang * 16 + col) * 4, t = (w * 16 + u) * 4;
      id.data[t] = BEDPX[s]; id.data[t + 1] = BEDPX[s + 1]; id.data[t + 2] = BEDPX[s + 2]; id.data[t + 3] = 255;
    }
    g.putImageData(id, 0, 0);
    return TUILES[key] = c;
  };
}

/* ---------- le plafond (une fois par taille) ---------- */
function plafond() {
  const g = gP, Bh = G.Bh;
  g.setTransform(1, 0, 0, 1, 0, 0); g.clearRect(0, 0, G.W, Bh); g.imageSmoothingEnabled = false;
  if (!BED) return;
  // les parois : des tranches de la bedrock, de la plus haute (près de la lave) à la plus basse
  const n = Math.round(EP * 16), [i0, i1, j0, j1] = ZONE;
  for (let k = n - 1; k >= 1; k--) {
    const hk = k / 16, p = hk / EP, rang = 15 - (k % 16);
    const a = .4 + 1.05 * p * p, m0 = a * 1.08, m1 = a * .62, m2 = a * .34;   // assez sombre : une paroi de roche, pas une bande de lumière
    const tr = plaque(i0, i1, j0, j1, tuileTranche(rang), (X, Z, m) => { m[0] = m0; m[1] = m1; m[2] = m2; });
    plan(g, tr, i0, j0, HAUT + hk, 0, Bh);
  }
  // le dessous du plafond : sombre, réchauffé près du trou, perdu dans le noir au loin
  const xr = Math.ceil((G.W / 2) / ligne(Bh, HAUT).s) + 2;
  const zA = Math.floor(ligne(0, HAUT).z) - 1, zB = Math.ceil(ligne(Bh, HAUT).z) + 1;
  const dessous = plaque(-xr, xr, zA, zB, tuileDessous, (X, Z, m) => {
    const d = dTrou(X, Z), r = Math.hypot(X - .5, Z);
    const amb = .2 + .16 * Math.exp(-r * r / 90);
    const chaud = 1.25 * Math.exp(-d * d / 5.5) + (d < .5 ? .5 * (1 - d / .5) : 0);
    m[0] = amb * .92 + chaud * 1.05; m[1] = amb * .9 + chaud * .55; m[2] = amb * .98 + chaud * .3;
  });
  plan(g, dessous, -xr, zA, HAUT, 0, Bh);
  // le bas du plafond se perd dans le vide (un dégradé de la couleur du fond : le plafond reste opaque devant la lave)
  const fd = g.createLinearGradient(0, Bh * .55, 0, Bh);
  fd.addColorStop(0, 'rgba(5,3,4,0)'); fd.addColorStop(1, 'rgba(5,3,4,1)');
  g.fillStyle = fd; g.fillRect(0, Bh * .55, G.W, Bh * .45 + 1);
  // les lignes de la lave, pour ne redessiner qu'elles
  let y0 = Bh, y1 = 0;
  for (let y = 0; y < Bh; y++) { const a = ligne(y + .5, HAUT + EP); if (a && a.z > -4 && a.z < 4) { y0 = Math.min(y0, y); y1 = Math.max(y1, y + 1); } }
  G.lave = [y0, y1];
}

/* ---------- la lave, derrière le trou ---------- */
let laveImg = -1, LAVE = null;
function lave(t) {
  if (!IMG || !G.lave) return;
  const m = MC.blocks.lava_still; if (!m) return;
  const f = Math.floor(t / .085) % m[1]; if (f === laveImg) return; laveImg = f;
  const [i0, i1, j0, j1] = ZONE;
  if (!LAVE) LAVE = mk((i1 - i0) * 16, (j1 - j0) * 16);
  const g = LAVE.getContext('2d');
  for (let j = 0; j < j1 - j0; j++) for (let i = 0; i < i1 - i0; i++) g.drawImage(IMG, 0, (m[0] + f) * 16, 16, 16, i * 16, j * 16, 16, 16);
  const [y0, y1] = G.lave;
  gL.setTransform(1, 0, 0, 1, 0, 0); gL.imageSmoothingEnabled = false;
  gL.clearRect(0, y0, G.W, y1 - y0);
  plan(gL, LAVE, i0, j0, HAUT + EP, y0, y1);
}

/* ---------- faisceau et particules ---------- */
let FAIS = null;
const R = mulberry(404);
let poussieres = [], braises = [], prochaine = .3, temps = 0;
function faisceau() {
  const dpr = G.dpr, w = G.cw, top = G.yHaut, bas = G.finFais, l0 = G.lTrou, l1 = G.lTrou * 2.7;
  // le faisceau s'allume peu à peu sur toute la hauteur du trou (pas de bord net, pas de voile sur la lave)
  // et n'atteint sa pleine force qu'au bord bas, d'où partent les rayons
  const fondu = clamp((G.yBas - top) / (bas - top), .02, .3);
  const c = mk(w * dpr, (bas + 10) * dpr), g = c.getContext('2d'); g.scale(dpr, dpr);
  g.globalCompositeOperation = 'lighter';
  for (let k = 0; k < 9; k++) {
    const e = .5 + k * .11, a = .07 - k * .005;
    const gr = g.createLinearGradient(0, top, 0, bas);
    gr.addColorStop(0, 'rgba(255,176,90,0)'); gr.addColorStop(fondu, 'rgba(255,176,90,' + a + ')');
    gr.addColorStop(.35, 'rgba(255,128,50,' + a * .55 + ')'); gr.addColorStop(1, 'rgba(255,90,30,0)');
    g.fillStyle = gr; g.beginPath();
    g.moveTo(G.cx0 - l0 * e / 2, top); g.lineTo(G.cx0 + l0 * e / 2, top); g.lineTo(G.cx0 + l1 * e / 2, bas); g.lineTo(G.cx0 - l1 * e / 2, bas); g.closePath(); g.fill();
  }
  // quelques rayons plus nets, qui partent du trou en s'écartant
  const R2 = mulberry(7);
  for (let k = 0; k < 7; k++) {
    const u = (k + .5) / 7 - .5 + (R2() - .5) * .08, w = l0 * (.05 + R2() * .07), a = .05 + R2() * .045, fin = top + (bas - top) * (.55 + R2() * .4);
    const gr = g.createLinearGradient(0, top, 0, fin);
    gr.addColorStop(0, 'rgba(255,200,120,0)'); gr.addColorStop(clamp((G.yBas - top) / (fin - top), .02, .45), 'rgba(255,200,120,' + a + ')');
    gr.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = gr; g.beginPath();
    const x0 = G.cx0 + u * l0 * .8, x1 = G.cx0 + u * l1 * .8 * (fin - top) / (bas - top) + u * l0 * .8 * (1 - (fin - top) / (bas - top));
    g.moveTo(x0 - w / 2, top); g.lineTo(x0 + w / 2, top); g.lineTo(x1 + w, fin); g.lineTo(x1 - w, fin); g.closePath(); g.fill();
  }
  return c;
}
function lumiere(x, y) {       // 0..1 : combien le faisceau éclaire ce point
  const top = G.yTrou, bas = G.finFais; if (y < top || y > bas) return 0;
  const t = (y - top) / (bas - top), half = (G.lTrou + (G.lTrou * 2.7 - G.lTrou) * t) / 2, dx = Math.abs(x - G.cx0) / half;
  return Math.pow(1 - t, 1.3) * clamp((1.05 - dx) / .6, 0, 1);
}
function semer() {
  const n = Math.round(clamp(G.cw * G.dh / 13000, 40, 170));
  poussieres = [];
  for (let k = 0; k < n; k++) poussieres.push({ x: R() * G.cw, y: R() * G.dh, z: .25 + R() * .75, p: R() * 6.28 });
}
function avance(dt) {
  temps += dt;
  for (const q of poussieres) {
    q.y -= (8 + 34 * q.z) * dt; q.x += Math.sin(temps * .6 + q.p) * 3 * q.z * dt;
    if (q.y < -4) { q.y = G.dh + 4; q.x = R() * G.cw; }
  }
  prochaine -= dt;
  if (prochaine <= 0) {
    prochaine = .45 + R() * 1.1;
    braises.push({ x: G.cx0 - G.bloc * .5 + (R() - .5) * G.bloc * 2.2, y: G.yBas - R() * G.bloc * .9, vx: (R() - .5) * 14, vy: 8 + R() * 18,
      vie: 0, fin: 3.2 + R() * 2, t: 5 + (R() * 3 | 0), px: [] });
  }
  for (const b of braises) { b.px.unshift(b.x, b.y); if (b.px.length > 10) b.px.length = 10; b.vie += dt; b.vy = (b.vy + 52 * dt) * (1 - .55 * dt); b.x += b.vx * dt; b.y += b.vy * dt; b.vx *= 1 - .8 * dt; }
  braises = braises.filter(b => b.vie < b.fin && b.y < G.yTexte);
}
const COUL = [[255, 240, 180], [255, 204, 96], [255, 140, 50], [226, 76, 24], [110, 22, 8]];
function teinte(p) {
  const s = clamp(p, 0, .999) * (COUL.length - 1), i = s | 0, f = s - i, a = COUL[i], b = COUL[i + 1];
  return [a[0] + (b[0] - a[0]) * f | 0, a[1] + (b[1] - a[1]) * f | 0, a[2] + (b[2] - a[2]) * f | 0];
}
function dessine() {
  const g = gF, dpr = G.dpr;
  g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, G.cw, G.dh);
  const souffle = .9 + .07 * Math.sin(temps * 1.7) + .04 * Math.sin(temps * 4.3 + 1);
  // la lueur de la lave dans le trou, puis le faisceau
  g.globalCompositeOperation = 'lighter';
  const r = G.lTrou * 1.15, lg = g.createRadialGradient(G.cx0, G.yTrou, 0, G.cx0, G.yTrou, r);
  lg.addColorStop(0, 'rgba(255,170,80,' + .38 * souffle + ')'); lg.addColorStop(.45, 'rgba(255,110,40,' + .14 * souffle + ')'); lg.addColorStop(1, 'rgba(255,90,30,0)');
  g.fillStyle = lg; g.fillRect(G.cx0 - r, G.yTrou - r, r * 2, r * 2);
  if (FAIS) { g.globalAlpha = souffle; g.drawImage(FAIS, 0, 0, G.cw, FAIS.height / dpr); g.globalAlpha = 1; }
  g.globalCompositeOperation = 'source-over';
  // les poussières qui remontent : grises dans le noir, dorées dans le faisceau
  for (const q of poussieres) {
    const b = lumiere(q.x, q.y), haut = clamp((q.y - G.Bhc * .45) / (G.Bhc * .5), 0, 1);
    const a = (.1 + .22 * q.z) * (.75 + 2.2 * b) * haut; if (a < .01) continue;
    const c0 = 150 + 105 * b, c1 = 138 + 52 * b, c2 = 132 - 22 * b, s = q.z > .72 ? 2 : 1;
    g.fillStyle = 'rgba(' + (c0 | 0) + ',' + (c1 | 0) + ',' + (c2 | 0) + ',' + Math.min(.9, a) + ')';
    g.fillRect(Math.round(q.x), Math.round(q.y), s, s);
  }
  // les braises qui tombent du trou et s'éteignent
  for (const b of braises) {
    const p = b.vie / b.fin, c = teinte(p), al = (p < .06 ? p / .06 : 1 - Math.pow(p, 2.4)) * clamp((G.yTexte - b.y) / 70, 0, 1), s = Math.max(2, Math.round(b.t * (1 - p * .55)));
    const rgb = c[0] + ',' + c[1] + ',' + c[2], x = Math.round(b.x - s / 2), y = Math.round(b.y - s / 2);
    for (let k = 2; k < b.px.length; k += 2) {     // une petite traînée : la goutte tombe
      const ts = Math.max(1, s - k / 2 | 0);
      g.fillStyle = 'rgba(' + rgb + ',' + al * (.34 - k * .03) + ')'; g.fillRect(Math.round(b.px[k] - ts / 2), Math.round(b.px[k + 1] - ts / 2), ts, ts);
    }
    g.fillStyle = 'rgba(' + rgb + ',' + al * .2 + ')'; g.fillRect(x - s, y - s, s * 3, s * 3);
    g.fillStyle = 'rgba(' + rgb + ',' + al + ')'; g.fillRect(x, y, s, s);
    if (p < .5) { g.fillStyle = 'rgba(255,245,200,' + al * (1 - p * 2) + ')'; g.fillRect(x + 1, y + 1, Math.max(1, s - 2), Math.max(1, s - 2)); }
  }
}

/* ---------- taille ---------- */
function mesureCiel() {
  const dpr = Math.min(2, W.devicePixelRatio || 1), cw = ciel.clientWidth, Bhc = ciel.clientHeight;
  G.dpr = dpr; G.cw = cw; G.Bhc = Bhc;
  // géométrie du plafond, en pixels réels
  const Wd = Math.round(cw * dpr), Bh = Math.round(Bhc * dpr);
  const bloc = clamp(cw * .026, 24, 46), yh = 60 + (Bhc - 60) * .44;
  G.W = Wd; G.Bh = Bh; G.cx = Wd / 2 - bloc * dpr * .5; G.cy = yh * dpr;
  const F = bloc * dpr * HAUT, P = 1.6;
  const c = clamp(F * (P - 1) / (G.cy * (1 - P) + P * Bh), .08, .95), s = Math.sqrt(1 - c * c);
  G.c = c; G.s = s; G.f = F / s; G.zh = HAUT * c / s;
  for (const k of [cLave, cPlaf]) { k.width = Wd; k.height = Bh; }
  G.bloc = bloc; G.cx0 = cw / 2; G.yTrou = yh; G.lTrou = bloc * 4.2;
  G.yBas = yh + bloc * 1.5;     // le bord bas du trou (le plus loin), d'où tombent les braises
  for (let y = G.cy; y < Bh; y++) { const a = ligne(y, HAUT); if (a && a.z >= 2) { G.yBas = y / dpr; break; } }
  G.yHaut = yh - bloc * 1.5;    // le bord haut du trou : le faisceau part de là, pour éclairer tout le trou
  for (let y = 0; y < G.cy; y++) { const a = ligne(y, HAUT); if (a && a.z >= -2) { G.yHaut = y / dpr; break; } }
  laveImg = -1;
  plafond(); lave(temps);
}
function mesureFx() {          // le faisceau et les poussières couvrent toute la page
  const vh = W.innerHeight, dh = Math.max(D.body.offsetHeight, vh);
  const titre = $('.v-titre'), yt = titre ? titre.getBoundingClientRect().top + W.scrollY : G.Bhc + 40;
  const sur = $('.v-sur'); G.yTexte = sur ? sur.getBoundingClientRect().top + W.scrollY - 8 : yt - 40;   // les braises s'éteignent avant le texte
  G.finFais = Math.min(dh - 20, Math.max(yt + 170, G.yTrou + vh * .5));
  cFx.width = Math.round(G.cw * G.dpr); cFx.height = Math.round(dh * G.dpr); cFx.style.height = dh + 'px';
  FAIS = faisceau();
  if (Math.abs(dh - (G.dh || 0)) > 1 || !poussieres.length) { G.dh = dh; semer(); }
}
function mesure() { mesureCiel(); mesureFx(); }

let enCours = false, dernier = 0;
function boucle(now) {
  const dt = dernier ? Math.min(.05, (now - dernier) / 1000) : 1 / 60; dernier = now;
  avance(dt); lave(temps); dessine();
  W.requestAnimationFrame(boucle);
}
function demarre() {
  largeur = ciel.clientWidth; mesure();
  if (T_FIXE !== null) { while (temps < T_FIXE) avance(1 / 30); lave(temps); dessine(); return; }
  for (let k = 0; k < 75; k++) avance(1 / 30);  // la scène est déjà vivante à l'arrivée
  if (!enCours) { enCours = true; W.requestAnimationFrame(boucle); }
}
let attente = 0, largeur = 0;
function retaille() {
  W.cancelAnimationFrame(attente);
  attente = W.requestAnimationFrame(() => {
    if (ciel.clientWidth !== largeur || Math.round(ciel.clientHeight) !== Math.round(G.Bhc)) { largeur = ciel.clientWidth; mesureCiel(); }
    mesureFx();
    if (T_FIXE !== null) { lave(temps); dessine(); }
  });
}
W.addEventListener('resize', retaille);
if (W.ResizeObserver) new ResizeObserver(retaille).observe(D.body);   // polices chargées, suggestion affichée…

const m = MC.blocks && MC.blocks.bedrock;
const img = new Image();
img.onload = () => {
  IMG = img;
  BED = mk(16, 16); const g = BED.getContext('2d'); g.drawImage(img, 0, m[0] * 16, 16, 16, 0, 0, 16, 16);
  BEDPX = g.getImageData(0, 0, 16, 16).data;
  root.classList.add('ciel-ok');
  demarre();
};
img.onerror = () => { demarre(); };   // sans texture : le plafond en CSS reste, le faisceau et les particules vivent quand même
if (m) img.src = '/assets/mc/blocks.png'; else demarre();
})();
