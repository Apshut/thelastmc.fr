/* The Last — la FAQ (faq.html) : la forge en toile de fond, et la mise en forme autour du chat (faq.js reste intact).
   Moteur WebGL2 copié de assets/tavern.js puis réduit : une petite forge en voxels (textures du jeu, lumière propagée sur
   quatre canaux : lanternes, lave, feu du foyer, lingot), l'occlusion ambiante, deux objets en boîtes (le lingot
   incandescent et le marteau), des braises, de rares étincelles et un halo. Aucun stockage, aucun appel externe.
   La scène est décorative (aria-hidden) : elle s'arrête quand l'onglet est caché ou qu'elle sort de l'écran, et se fige
   avec prefers-reduced-motion. Un clic dans la forge fait jaillir des étincelles. Sur grand écran (1200 px et plus), elle
   reste en toile de fond fixe et se range dans la marge de droite quand on descend lire ; plus petit, elle reste en tête.
   La forge suit Gromaur sans toucher à faq.js : elle regarde le fil du chat (« Gromaur réfléchit » = elle s'active).
   Essais : ?shot=1 (image figée) &t=6 &y=<px> (défilement) &ouvre=<n> (question n ouverte) &gm=1 (cadré sur Gromaur)
   &etat=pense (« Gromaur réfléchit », figé, sans réseau) ; ?fps=1 (coût par image) ; ?nogl=1 (sans 3D : l'image de
   repli) ; &poster=1 (la scène seule, pour refaire faq-forge.jpg). */
(() => {
'use strict';

const MC = window.MC || { blocks: {}, items: {}, font: {} };
const D = document, root = D.documentElement;
const QS = new URLSearchParams(location.search), SHOT = QS.has('shot');
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v, lerp = (a, b, t) => a + (b - a) * t;
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function mk(w, hh) { const c = D.createElement('canvas'); c.width = w; c.height = hh; return c; }

/* ================= Matrices (rangées par colonnes) ================= */
function mmul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return o;
}
function persp(fovy, asp, n, f) {
  const t = 1 / Math.tan(fovy / 2), o = new Float32Array(16);
  o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f);
  return o;
}
function look(e, c) {
  let zx = e[0] - c[0], zy = e[1] - c[1], zz = e[2] - c[2], l = Math.hypot(zx, zy, zz); zx /= l; zy /= l; zz /= l;
  let xx = zz, xz = -zx; l = Math.hypot(xx, xz); xx /= l; xz /= l;
  const yx = zy * xz, yy = zz * xx - zx * xz, yz = -zy * xx, o = new Float32Array(16);
  o[0] = xx; o[4] = 0; o[8] = xz; o[12] = -(xx * e[0] + xz * e[2]);
  o[1] = yx; o[5] = yy; o[9] = yz; o[13] = -(yx * e[0] + yy * e[1] + yz * e[2]);
  o[2] = zx; o[6] = zy; o[10] = zz; o[14] = -(zx * e[0] + zy * e[1] + zz * e[2]);
  o[15] = 1;
  return { m: o, right: [xx, 0, xz], up: [yx, yy, yz] };
}
const ident = () => { const o = new Float32Array(16); o[0] = o[5] = o[10] = o[15] = 1; return o; };
function trans(x, y, z) { const o = ident(); o[12] = x; o[13] = y; o[14] = z; return o; }
function rotX(a) { const o = ident(), c = Math.cos(a), s = Math.sin(a); o[5] = c; o[6] = s; o[9] = -s; o[10] = c; return o; }
function rotY(a) { const o = ident(), c = Math.cos(a), s = Math.sin(a); o[0] = c; o[2] = -s; o[8] = s; o[10] = c; return o; }
function rotZ(a) { const o = ident(), c = Math.cos(a), s = Math.sin(a); o[0] = c; o[1] = s; o[4] = -s; o[5] = c; return o; }
function scale(x, y, z) { const o = ident(); o[0] = x; o[5] = y; o[10] = z; return o; }
function tp(m, x, y, z) { return [m[0] * x + m[4] * y + m[8] * z + m[12], m[1] * x + m[5] * y + m[9] * z + m[13], m[2] * x + m[6] * y + m[10] * z + m[14]]; }
const IDENT = ident(), Z3 = [0, 0, 0];
const P16 = scale(1 / 16, -1 / 16, -1 / 16);           // repère des objets (comme le jeu : y vers le bas) -> monde

/* ================= Blocs ================= */
const BL = [null], ID = {};
function def(name, tex, o) {
  const b = Object.assign({ id: BL.length, name, light: 0, ch: 0, emit: 0, cut: false }, o || {});
  const t = typeof tex === 'string' ? [tex, tex, tex] : tex;       // dessus, dessous, côtés
  b.t = t.map(n => MC.blocks[n] || [0, 1]);
  BL.push(b); ID[name] = b.id;
}
def('pbb', 'polished_blackstone_bricks');
def('cpbb', 'cracked_polished_blackstone_bricks');
def('polished', 'polished_blackstone');
def('chiseled', 'chiseled_polished_blackstone');
def('gilded', 'gilded_blackstone');
def('blackstone', ['blackstone_top', 'blackstone_top', 'blackstone']);
def('basalt', ['polished_basalt_top', 'polished_basalt_top', 'polished_basalt_side']);
def('nbricks', 'nether_bricks');
def('netherrack', 'netherrack');
def('gold', 'gold_block');
def('rawgold', 'raw_gold_block');
def('debris', ['ancient_debris_top', 'ancient_debris_top', 'ancient_debris_side']);
def('netherite', 'netherite_block');
def('magma', 'magma', { light: 7, ch: 1, emit: .55 });
def('lava', 'lava_still', { light: 15, ch: 1, emit: 1 });
def('lavafall', 'lava_flow', { light: 15, ch: 1, emit: .85 });
def('bars', 'iron_bars', { cut: true });

/* ================= La forge ================= */
const WX = 21, WY = 9, WZ = 17, OX = 10, OZ = 8, CEIL = 7;   // x : -10..10, y : 0..8, z : -8..8
const FACES = [                                               // normale, axe U, axe V (V = haut de la texture)
  [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
  [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]]
];
const CORN = [[-1, -1], [1, -1], [1, 1], [-1, 1]], AOF = [1, .8, .62, .46];
const blv = l => { const f = l / 15; return f / (4 - 3 * f); };
const ANVIL_TOP = 2, AX = .5, AZ = .5;                        // l'enclume occupe la case (0, 1, 0) : x 0..1, z 0..1
const FXB = -2;                                               // le foyer (bloc central de la bouche)

function forge(a) {
  const R = a.R;
  // sol : briques de pierre noire polie, quelques fêlures ; dalle lisse sous l'enclume ; plafond de pierre noire
  a.fill(-10, 0, -8, 10, 0, 8, (x, y, z) => (x + 40) % 4 === 0 || (z + 40) % 4 === 0 ? (R() < .2 ? 'cpbb' : 'pbb') : 'polished');
  a.fill(-10, CEIL, -8, 10, CEIL + 1, 8, 'blackstone');
  // murs : soubassement poli, briques au-dessus ; piliers de basalte poli
  const wall = (x, y) => y === 1 ? 'polished' : R() < .1 ? 'cpbb' : R() < .035 ? 'gilded' : 'pbb';
  a.fill(-10, 1, -6, 10, CEIL - 1, -6, wall);
  a.fill(-9, 1, -6, -9, CEIL - 1, 8, wall);
  a.fill(9, 1, -6, 9, CEIL - 1, 8, wall);
  [-9, 9].forEach(x => [-1, 4].forEach(z => a.fill(x, 1, z, x, CEIL - 1, z, 'basalt')));

  // le foyer, derrière l'enclume (vu de la caméra) : une bouche de pierre noire, le feu dedans, une hotte en gradins
  const FX = FXB;                                                 // centre du foyer
  [FX - 3, FX + 3].forEach(x => a.fill(x, 1, -5, x, CEIL - 1, -5, 'basalt'));
  a.fill(FX - 2, 1, -5, FX + 2, 4, -4, 'pbb');
  a.fill(FX - 1, 1, -5, FX + 1, 2, -4, null);                     // la bouche
  a.fill(FX - 1, 1, -6, FX + 1, 2, -6, 'magma');                   // au fond de la bouche, du magma
  a.fill(FX - 1, 0, -5, FX + 1, 0, -5, 'netherrack'); a.fill(FX - 1, 0, -4, FX + 1, 0, -4, 'magma');
  [-1, 0, 1].forEach((d, i) => { a.cross(FX + d, 1, -5, i % 2 ? 'fire_1' : 'fire_0', { emit: 1 }); a.light(FX + d, 1, -5, 15, 2); });
  [-1, 1].forEach((d, i) => a.cross(FX + d, 1, -4, i ? 'fire_0' : 'fire_1', { emit: 1 }));
  a.fill(FX - 2, 1, -4, FX - 2, 2, -4, 'polished'); a.fill(FX + 2, 1, -4, FX + 2, 2, -4, 'polished');
  a.fill(FX - 2, 3, -4, FX + 2, 3, -4, 'polished'); a.set(FX, 3, -4, 'chiseled');   // le linteau, une seule clé sculptée
  a.fill(FX - 1, 5, -5, FX + 1, 5, -5, 'pbb'); a.fill(FX - 1, 5, -4, FX + 1, 5, -4, null);
  a.fill(FX - 1, 6, -5, FX + 1, CEIL - 1, -5, 'pbb');             // la cheminée
  a.box(FX - 2.06, 4.94, -4.06, FX + 2.06, 5.06, -3.94, 'polished_blackstone');   // corniche
  // la rigole de lave, au pied du foyer, à fleur de sol
  a.fill(FX - 1, 0, -3, FX + 1, 0, -3, 'lava');
  a.set(FX - 2, 0, -3, 'chiseled'); a.set(FX + 2, 0, -3, 'chiseled');

  // à droite, au fond : une chute de lave derrière des barreaux
  a.fill(3, 2, -6, 4, 4, -6, 'bars');
  a.fill(2, 0, -8, 5, CEIL - 1, -8, 'blackstone'); a.fill(2, 0, -7, 2, CEIL - 1, -7, 'blackstone'); a.fill(5, 0, -7, 5, CEIL - 1, -7, 'blackstone');
  a.fill(3, 1, -7, 4, CEIL - 1, -7, 'lavafall'); a.fill(3, 0, -7, 4, 0, -7, 'lava');
  a.fill(2, 1, -6, 2, 5, -6, 'polished'); a.fill(5, 1, -6, 5, 5, -6, 'polished'); a.fill(3, 5, -6, 4, 5, -6, 'polished'); a.fill(3, 1, -6, 4, 1, -6, 'gilded');

  // à gauche : la réserve du forgeron, des matières nobles
  a.set(-8, 1, -5, 'netherite'); a.set(-7, 1, -5, 'debris'); a.set(-8, 2, -5, 'gold'); a.set(-8, 1, -4, 'debris');

  // lanternes d'âmes suspendues : une lumière froide qui rend à l'enclume son gris d'acier face au feu ; chaînes nues
  [[-6, 4.8, -1.5]].forEach(p => a.lantern(p[0], p[1], p[2], 'soul_lantern', true, 12, 0));
  [[-2.6, 3.9, -.6], [-.9, 4.6, 3.4], [1.9, 4.9, 2.6]].forEach(p => a.light(p[0], p[1], p[2], 12, 0));   // près de l'enclume : la lueur seule (une lanterne surgirait au bord du cadre quand la forge glisse dans la marge)
  [[.2, 4.4, -2.6], [-4.4, 4.2, .8]].forEach(p => a.chain(p[0], p[1], p[2]));
  a.light(-1, 2, 0, 13, 0);                                        // une lueur d'âme, à gauche de l'enclume (sans lanterne visible) : son liseré froid
  // la lueur du lingot (canal à part : elle respire)
  a.light(AX, 2, AZ, 7, 3);
}

/* L'enclume du jeu (modèle anvil.json), tournée pour montrer son profil : 16 px de long sur x. */
function anvil(a, cx, cy, cz) {
  const s = 1 / 16, X = v => cx - .5 + v * s, Y = v => cy + v * s, Z = v => cz - .5 + v * s;
  const part = (x0, y0, z0, x1, y1, z1, top) => a.mbox(X(x0), Y(y0), Z(z0), X(x1), Y(y1), Z(z1), { up: top ? 'anvil_top' : 'anvil', side: 'anvil', down: 'anvil' },
    { up: top ? [[z0, x0], [z0, x1], [z1, x1], [z1, x0]] : [x0, z0, x1, z1], down: [x0, z0, x1, z1], side: [x0, 16 - y1, x1, 16 - y0], end: [z0, 16 - y1, z1, 16 - y0] }, { shade: top ? .9 : .72 });
  part(2, 0, 2, 14, 4, 14);
  part(3, 4, 4, 13, 5, 12);
  part(4, 5, 6, 12, 10, 10);
  part(0, 10, 3, 16, 16, 13, true);
}

function buildForge() {
  const N = WX * WY * WZ, vox = new Uint8Array(N), lit = [0, 1, 2, 3].map(() => new Uint8Array(N)), R = rng(2026);
  const inb = (x, y, z) => x >= -OX && x < WX - OX && y >= 0 && y < WY && z >= -OZ && z < WZ - OZ;
  const ix = (x, y, z) => (y * WZ + (z + OZ)) * WX + (x + OX);
  const getId = (x, y, z) => inb(x, y, z) ? vox[ix(x, y, z)] : 0;
  const solid = (x, y, z) => { const id = getId(x, y, z); return id !== 0 && !BL[id].cut; };
  const boxes = [], quads = [], lights = [];
  const q = (p, tex, uv, o) => quads.push({ p, tex, uv: uv || [0, 0, 16, 16], o: o || {} });
  const a = {
    R,
    set(x, y, z, n) { if (inb(x, y, z)) vox[ix(x, y, z)] = n ? ID[n] || 0 : 0; },
    fill(x0, y0, z0, x1, y1, z1, n) {
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
        const v = typeof n === 'function' ? n(x, y, z) : n; if (v !== undefined) a.set(x, y, z, v);
      }
    },
    box(x0, y0, z0, x1, y1, z1, tex, o) { boxes.push({ a: [x0, y0, z0], b: [x1, y1, z1], tex, o: o || {} }); },
    cross(x, y, z, tex, o) { [[0, 0, 1, 1], [0, 1, 1, 0]].forEach(d => q([[x + d[0], y + 1, z + d[1]], [x + d[2], y + 1, z + d[3]], [x + d[2], y, z + d[3]], [x + d[0], y, z + d[1]]], tex, null, o)); },
    light(x, y, z, l, ch) { lights.push([Math.floor(x), Math.floor(y), Math.floor(z), l, ch || 0]); },
    /* boîte aux faces texturées à la manière des modèles de blocs du jeu (uv en texels 0..16) ; tex : nom ou {up, side, down} */
    mbox(x0, y0, z0, x1, y1, z1, tex, f, o) {
      const T = typeof tex === 'string' ? { up: tex, side: tex, down: tex } : tex, s = f.side, e = f.end || s;
      q([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], T.up, f.up, o);
      q([[x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0]], T.down, f.down, o);
      q([[x1, y1, z0], [x0, y1, z0], [x0, y0, z0], [x1, y0, z0]], T.side, s, o);
      q([[x0, y1, z1], [x1, y1, z1], [x1, y0, z1], [x0, y0, z1]], T.side, s, o);
      q([[x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [x0, y0, z0]], T.side, e, o);
      q([[x1, y1, z1], [x1, y1, z0], [x1, y0, z0], [x1, y0, z1]], T.side, e, o);
    },
    chain(cx, by, cz) {
      const s = 1 / 16, c45 = Math.SQRT1_2, rot = (u, w) => [cx + (u - 8) * s * c45 - (w - 8) * s * c45, cz + (u - 8) * s * c45 + (w - 8) * s * c45];
      for (let y = by; y < CEIL; y += 1) {
        const top = Math.min(CEIL, y + 1), v0 = 16 - (top - y) * 16;
        const p1 = rot(6.5, 8), p2 = rot(9.5, 8), p3 = rot(8, 6.5), p4 = rot(8, 9.5);
        q([[p1[0], top, p1[1]], [p2[0], top, p2[1]], [p2[0], y, p2[1]], [p1[0], y, p1[1]]], 'iron_chain', [0, v0, 3, 16], {});
        q([[p3[0], top, p3[1]], [p4[0], top, p4[1]], [p4[0], y, p4[1]], [p3[0], y, p3[1]]], 'iron_chain', [3, v0, 6, 16], {});
      }
    },
    /* lanterne du jeu (template_hanging_lantern), avec sa chaîne jusqu'au plafond */
    lantern(cx, by, cz, tex, hanging, l, ch) {
      const s = 1 / 16, X = v => cx - .5 + v * s, Y = v => by + v * s, Z = v => cz - .5 + v * s, o = { emit: 1 }, y0 = hanging ? 1 : 0;
      a.mbox(X(5), Y(y0), Z(5), X(11), Y(y0 + 7), Z(11), tex, { up: [0, 9, 6, 15], down: [0, 9, 6, 15], side: [0, 2, 6, 9] }, o);
      a.mbox(X(6), Y(y0 + 7), Z(6), X(10), Y(y0 + 9), Z(10), tex, { up: [1, 10, 5, 14], down: [1, 10, 5, 14], side: [1, 0, 5, 2] }, o);
      const c45 = Math.SQRT1_2, rot = (u, w) => [cx + (u - 8) * s * c45 - (w - 8) * s * c45, cz + (u - 8) * s * c45 + (w - 8) * s * c45];
      const plane = (u0, w0, u1, w1, ya, yb, uv) => { const p = rot(u0, w0), r = rot(u1, w1); q([[p[0], Y(yb), p[1]], [r[0], Y(yb), r[1]], [r[0], Y(ya), r[1]], [p[0], Y(ya), p[1]]], tex, uv, o); };
      if (hanging) { plane(6.5, 8, 9.5, 8, 11, 15, [11, 1, 14, 5]); plane(8, 6.5, 8, 9.5, 10, 16, [11, 6, 14, 12]); a.chain(cx, by + 1, cz); }
      a.light(cx, by + .3, cz, l, ch);
    }
  };
  forge(a);
  anvil(a, AX, 1, AZ);

  /* lumière : propagation case par case, un canal par couleur */
  const qu = new Int32Array(N), SY = WX * WZ;
  for (let c = 0; c < 4; c++) {
    const L = lit[c]; let qh = 0, qt = 0;
    const seed1 = (i, l) => { if (L[i] < l) { L[i] = l; qu[qt++] = i; } };
    for (let i = 0; i < N; i++) { const id = vox[i]; if (id && BL[id].light && BL[id].ch === c) seed1(i, BL[id].light); }
    lights.forEach(l => { if (l[4] === c && inb(l[0], l[1], l[2])) seed1(ix(l[0], l[1], l[2]), l[3]); });
    while (qh < qt) {
      const i = qu[qh++], l = L[i] - 1; if (l <= 0) continue;
      const x = i % WX, z = ((i / WX) | 0) % WZ, y = (i / SY) | 0;
      const go = j => { const id = vox[j]; if (L[j] < l && (!id || BL[id].cut || BL[id].light)) { L[j] = l; qu[qt++] = j; } };
      if (x > 0) go(i - 1); if (x < WX - 1) go(i + 1);
      if (z > 0) go(i - WX); if (z < WZ - 1) go(i + WX);
      if (y > 0) go(i - SY); if (y < WY - 1) go(i + SY);
    }
  }
  const lv = (c, x, y, z) => inb(x, y, z) ? lit[c][ix(x, y, z)] : 0;

  /* maillage : position, uv, couche, nb d'images, 4 canaux de lumière, ombrage, émission */
  const ST = 13; let cap = 1 << 18, buf = new Float32Array(cap), n = 0, nq = 0; const flips = [];
  const push = (x, y, z, u, v, t, l, sh, e) => {
    if (n + ST > cap) { cap *= 2; const nb = new Float32Array(cap); nb.set(buf); buf = nb; }
    buf[n++] = x; buf[n++] = y; buf[n++] = z; buf[n++] = u; buf[n++] = v; buf[n++] = t[0]; buf[n++] = t[1];
    buf[n++] = l[0]; buf[n++] = l[1]; buf[n++] = l[2]; buf[n++] = l[3]; buf[n++] = sh; buf[n++] = e;
  };
  const dirShade = N => N[1] > .5 ? 1 : N[1] < -.5 ? .55 : Math.abs(N[2]) > .5 ? .84 : .68;
  for (let y = 0; y < WY; y++) for (let z = -OZ; z < WZ - OZ; z++) for (let x = -OX; x < WX - OX; x++) {
    const id = vox[ix(x, y, z)]; if (!id) continue;
    const b = BL[id];
    for (let f = 0; f < 6; f++) {
      const F = FACES[f], Nn = F[0], U = F[1], V = F[2], bx = x + Nn[0], by = y + Nn[1], bz = z + Nn[2];
      if (!inb(bx, by, bz)) continue;
      const nid = vox[ix(bx, by, bz)];
      if (nid && (!BL[nid].cut || nid === id)) continue;
      const t = b.t[f === 0 ? 0 : f === 1 ? 1 : 2], ao4 = [], ds = dirShade(Nn);
      for (let k = 0; k < 4; k++) {
        const su = CORN[k][0], sv = CORN[k][1];
        const ax = bx + su * U[0], ay = by + su * U[1], az = bz + su * U[2], cx2 = bx + sv * V[0], cy2 = by + sv * V[1], cz2 = bz + sv * V[2];
        const s1 = solid(ax, ay, az), s2 = solid(cx2, cy2, cz2);
        const dx = bx + su * U[0] + sv * V[0], dy = by + su * U[1] + sv * V[1], dz = bz + su * U[2] + sv * V[2], sc = solid(dx, dy, dz);
        const ao = s1 && s2 ? 3 : (s1 ? 1 : 0) + (s2 ? 1 : 0) + (sc ? 1 : 0);
        const L4 = [0, 0, 0, 0];
        for (let c = 0; c < 4; c++) {
          let sum = lv(c, bx, by, bz), cnt = 1;
          if (!s1) { sum += lv(c, ax, ay, az); cnt++; }
          if (!s2) { sum += lv(c, cx2, cy2, cz2); cnt++; }
          if (!sc && !(s1 && s2)) { sum += lv(c, dx, dy, dz); cnt++; }
          L4[c] = blv(sum / cnt);
        }
        push(x + .5 + (Nn[0] + su * U[0] + sv * V[0]) / 2, y + .5 + (Nn[1] + su * U[1] + sv * V[1]) / 2, z + .5 + (Nn[2] + su * U[2] + sv * V[2]) / 2,
          (su + 1) / 2, (1 - sv) / 2, t, L4, AOF[ao] * ds, b.emit);
        ao4.push(ao);
      }
      flips.push(ao4[0] + ao4[2] > ao4[1] + ao4[3] ? 1 : 0); nq++;
    }
  }
  const layerOf = (tex, f) => { const nm = Array.isArray(tex) ? tex[f === 0 ? 0 : f === 1 ? 1 : 2] : tex; return MC.blocks[nm] || [0, 1]; };
  const cornerLight = (p, c0, Nn) => {
    const px = p[0] + (c0[0] - p[0]) * .02 + Nn[0] * .45, py = p[1] + (c0[1] - p[1]) * .02 + Nn[1] * .45, pz = p[2] + (c0[2] - p[2]) * .02 + Nn[2] * .45;
    const X = Math.floor(px), Y = Math.floor(py), Z = Math.floor(pz);
    return [blv(lv(0, X, Y, Z)), blv(lv(1, X, Y, Z)), blv(lv(2, X, Y, Z)), blv(lv(3, X, Y, Z))];
  };
  boxes.forEach(bx => {
    const A = bx.a, B = bx.b, e = bx.o.emit || 0;
    const c0 = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2, (A[2] + B[2]) / 2], hs = [(B[0] - A[0]) / 2, (B[1] - A[1]) / 2, (B[2] - A[2]) / 2];
    for (let f = 0; f < 6; f++) {
      const F = FACES[f], Nn = F[0], U = F[1], V = F[2], t = layerOf(bx.tex, f), ds = dirShade(Nn);
      const fc = [c0[0] + Nn[0] * hs[0], c0[1] + Nn[1] * hs[1], c0[2] + Nn[2] * hs[2]];
      for (let k = 0; k < 4; k++) {
        const su = CORN[k][0], sv = CORN[k][1];
        const p = [c0[0] + (Nn[0] + su * U[0] + sv * V[0]) * hs[0], c0[1] + (Nn[1] + su * U[1] + sv * V[1]) * hs[1], c0[2] + (Nn[2] + su * U[2] + sv * V[2]) * hs[2]];
        push(p[0], p[1], p[2], p[0] * U[0] + p[1] * U[1] + p[2] * U[2], -(p[0] * V[0] + p[1] * V[1] + p[2] * V[2]), t, cornerLight(p, fc, Nn), ds, e);
      }
      flips.push(0); nq++;
    }
  });
  quads.forEach(qd => {
    const p = qd.p, t = MC.blocks[qd.tex] || [0, 1], e = qd.o.emit || 0, uv = qd.uv;
    const ax = p[1][0] - p[0][0], ay = p[1][1] - p[0][1], az = p[1][2] - p[0][2], bx = p[3][0] - p[0][0], by = p[3][1] - p[0][1], bz = p[3][2] - p[0][2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const c0 = [(p[0][0] + p[2][0]) / 2, (p[0][1] + p[2][1]) / 2, (p[0][2] + p[2][2]) / 2];
    const both = Math.abs(ny) < .5 && !qd.o.oneSide;
    const Nn = both ? [0, 0, 0] : [nx, ny, nz], ds = both ? .9 : dirShade([nx, ny, nz]);
    const UV = Array.isArray(uv[0]) ? uv : [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]];
    const sh = ds * (qd.o.shade || 1);
    for (let k = 0; k < 4; k++) push(p[k][0], p[k][1], p[k][2], UV[k][0] / 16, UV[k][1] / 16, t, cornerLight(p[k], c0, Nn), sh, e);
    flips.push(0); nq++;
  });
  const idxs = new Uint32Array(nq * 6);
  for (let i = 0; i < nq; i++) { const o = i * 4, k = i * 6; if (flips[i]) { idxs[k] = o + 1; idxs[k + 1] = o + 2; idxs[k + 2] = o + 3; idxs[k + 3] = o + 1; idxs[k + 4] = o + 3; idxs[k + 5] = o; } else { idxs[k] = o; idxs[k + 1] = o + 1; idxs[k + 2] = o + 2; idxs[k + 3] = o; idxs[k + 4] = o + 2; idxs[k + 5] = o + 3; } }
  return { verts: buf.subarray(0, n), idxs, quads: nq, light: (x, y, z) => { const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z); return [0, 1, 2, 3].map(c => blv(lv(c, X, Y, Z))); } };
}

/* ================= Peau des objets (dessinée par code, 64 x 32) : le lingot incandescent ================= */
function objSkin() {
  const c = mk(64, 32), g = c.getContext('2d'), R = rng(91);
  const px = (x, y, col) => { if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); } };
  const box = (u, v, w, hh, d, fn) => {
    const F = { top: [u + d, v, w, d], bottom: [u + d + w, v, w, d], right: [u, v + d, d, hh], front: [u + d, v + d, w, hh], left: [u + d + w, v + d, d, hh], back: [u + d + w + d, v + d, w, hh] };
    for (const k in F) { const f = F[k]; for (let y = 0; y < f[3]; y++) for (let x = 0; x < f[2]; x++) px(f[0] + x, f[1] + y, fn(k, x, y, f[2], f[3])); }
  };
  // lingot 10 x 2 x 4 : cœur presque blanc, orange vers les bords, une croûte rouge sombre aux extrémités
  const HOT = ['#fff6d8', '#ffe39a', '#ffc05a', '#ff9a34', '#f2681c', '#c43f10', '#7e2208'];
  box(0, 0, 10, 2, 4, (f, x, y, w, hh) => {
    const ex = Math.min(x, w - 1 - x) / (w / 2), ey = f === 'top' || f === 'bottom' ? Math.min(y, hh - 1 - y) / (hh / 2) : .35;
    let k = (1 - Math.min(1, ex * 1.6)) * 3.6 + (1 - Math.min(1, ey * 1.4)) * 1.2 + (f === 'top' ? 0 : f === 'bottom' ? 2.4 : 1.1) + (R() - .5) * 1.2;
    k = clamp(Math.round(k), 0, HOT.length - 1);
    return HOT[k];
  });
  return c;
}
/* les objets, au format des modèles du jeu (pixels, y vers le bas) */
const INGOT = [{ n: 'i', p: [0, 0, 0], b: [{ o: [-5, -2, -2], s: [10, 2, 4], uv: [0, 0], e: 1 }] }];
/* le marteau du forgeron, posé sur l'enclume à côté du lingot */
const HAMMER = [{ n: 'h', p: [0, 0, 0], b: [
  { o: [-3.4, -3, -1.6], s: [6.8, 3, 3.2], col: [.2, .19, .22] },         // la tête, en fer noirci, en travers
  { o: [-3.6, -3.2, -1.8], s: [1, 3.4, 3.6], col: [.12, .11, .13] },      // la panne
  { o: [-.7, -2.3, -11.5], s: [1.4, 1.4, 10], col: [.36, .21, .11] },     // le manche, vers nous
  { o: [-.9, -2.5, -14], s: [1.8, 1.8, 3], col: [.14, .09, .06] }         // la poignée, cuir sombre
] }];

/* ================= Construction des quads d'un modèle (copié de tavern.js) ================= */
function Sink() {
  const S = { f: new Float32Array(12 * 6 * 256), n: 0 };
  S.quad = (P, a, b, c, d, uv, cen, lit, tint, e) => {
    if (S.n + 72 > S.f.length) { const nf = new Float32Array(S.f.length * 2); nf.set(S.f); S.f = nf; }
    const A = P[a], B = P[b], C = P[d];
    const ax = B[0] - A[0], ay = B[1] - A[1], az = B[2] - A[2], bx = C[0] - A[0], by = C[1] - A[1], bz = C[2] - A[2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const fx = (P[a][0] + P[c][0]) / 2 - cen[0], fy = (P[a][1] + P[c][1]) / 2 - cen[1], fz = (P[a][2] + P[c][2]) / 2 - cen[2];
    if (nx * fx + ny * fy + nz * fz < 0) { nx = -nx; ny = -ny; nz = -nz; }
    const L = lit(nx, ny, nz), q = [a, b, c, a, c, d], f = S.f;
    for (let i = 0; i < 6; i++) {
      const p = P[q[i]], k = i === 0 || i === 3 ? 0 : i === 1 ? 1 : i === 2 || i === 4 ? 2 : 3;
      f[S.n++] = p[0]; f[S.n++] = p[1]; f[S.n++] = p[2];
      if (uv) { f[S.n++] = uv[k][0]; f[S.n++] = uv[k][1]; } else { f[S.n++] = -1; f[S.n++] = -1; }
      f[S.n++] = L[0]; f[S.n++] = L[1]; f[S.n++] = L[2]; f[S.n++] = e;
      f[S.n++] = tint[0]; f[S.n++] = tint[1]; f[S.n++] = tint[2];
    }
  };
  return S;
}
const WHITE = [1, 1, 1];
function boxQ(M, bx, tw, th, S, lit, glow) {
  const o = bx.o, s = bx.s, x0 = o[0], y0 = o[1], z0 = o[2], x1 = x0 + s[0], y1 = y0 + s[1], z1 = z0 + s[2];
  const us = bx.us || s, u = bx.uv ? bx.uv[0] : 0, v = bx.uv ? bx.uv[1] : 0, dx = us[0], dy = us[1], dz = us[2];
  const P = [tp(M, x0, y0, z0), tp(M, x1, y0, z0), tp(M, x1, y1, z0), tp(M, x0, y1, z0), tp(M, x0, y0, z1), tp(M, x1, y0, z1), tp(M, x1, y1, z1), tp(M, x0, y1, z1)];
  const cen = tp(M, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), e = (bx.e || 0) * glow, tint = bx.col || WHITE, col = !!bx.col;
  const Q = (a, b, c, d, u0, v0, u1, v1) => S.quad(P, a, b, c, d, col ? null : [[u0 / tw, v0 / th], [u1 / tw, v0 / th], [u1 / tw, v1 / th], [u0 / tw, v1 / th]], cen, lit, tint, e);
  Q(4, 5, 1, 0, u + dz, v, u + dz + dx, v + dz);
  Q(3, 2, 6, 7, u + dz + dx, v + dz, u + dz + dx + dx, v);
  Q(4, 0, 3, 7, u, v + dz, u + dz, v + dz + dy);
  Q(0, 1, 2, 3, u + dz, v + dz, u + dz + dx, v + dz + dy);
  Q(1, 5, 6, 2, u + dz + dx, v + dz, u + dz + dx + dz, v + dz + dy);
  Q(5, 4, 7, 6, u + dz + dx + dz, v + dz, u + dz + dx + dz + dx, v + dz + dy);
}
function model(parts, tw, th, base, S, lit, glow) {
  const walk = (part, parent) => {
    const r = part.r || Z3;
    let m = mmul(parent, trans(part.p[0], part.p[1], part.p[2]));
    if (r[2]) m = mmul(m, rotZ(r[2])); if (r[1]) m = mmul(m, rotY(r[1])); if (r[0]) m = mmul(m, rotX(r[0]));
    const M = mmul(base, m);
    if (part.b) for (let i = 0; i < part.b.length; i++) boxQ(M, part.b[i], tw, th, S, lit, glow);
    if (part.c) for (let i = 0; i < part.c.length; i++) walk(part.c[i], m);
  };
  for (let i = 0; i < parts.length; i++) walk(parts[i], IDENT);
}

/* ================= Shaders (copiés de tavern.js ; la passe finale prend un voile : la scène se retire quand on lit) ================= */
const HEAD = '#version 300 es\nprecision highp float; precision highp sampler2DArray; precision highp sampler2D;\n';
const FOG = `
uniform vec3 uCam, uFog; uniform float uFogD;
vec3 fogged(vec3 col, vec3 pos, out float f) { float d = length(pos - uCam); f = 1. - exp(-pow(d * uFogD, 1.6)); return mix(col, uFog, f); }`;
const VS_WORLD = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec2 aUv; layout(location=2) in vec2 aTex; layout(location=3) in vec4 aL; layout(location=4) in vec2 aS;
uniform mat4 uPV; out vec3 vPos; centroid out vec2 vUv; flat out vec2 vTex; out vec4 vL; out vec2 vS;
void main() { vPos = aPos; vUv = aUv; vTex = aTex; vL = aL; vS = aS; gl_Position = uPV * vec4(aPos, 1.); }`;
const FS_WORLD = HEAD + `
uniform sampler2DArray uTex; uniform float uTime, uExp; uniform vec3 uAmb, uC0, uC1, uC2, uC3; uniform vec4 uK;
in vec3 vPos; centroid in vec2 vUv; flat in vec2 vTex; in vec4 vL; in vec2 vS; out vec4 o;
${FOG}
void main() {
  vec4 c;
  if (vTex.y > 1.5) c = texture(uTex, vec3(vUv, vTex.x + mod(floor(uTime * 20.), vTex.y)));
  else c = texture(uTex, vec3(vUv, vTex.x));
  if (c.a < .4) discard;
  vec3 li = (uAmb + uC0 * (vL.x * uK.x) + uC1 * (vL.y * uK.y) + uC2 * (vL.z * uK.z) + uC3 * (vL.w * uK.w)) * vS.x;
  float e = vS.y, f;
  vec3 col = fogged(c.rgb * mix(li * uExp, vec3(1.12), e), vPos, f);
  o = vec4(col, e * e * (1. - f) * (.3 + dot(c.rgb, vec3(.5, .5, .2))));
}`;
const VS_ENT = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec2 aUv; layout(location=2) in vec4 aLit; layout(location=3) in vec3 aTint;
uniform mat4 uPV; out vec3 vPos; centroid out vec2 vUv; out vec4 vLit; out vec3 vTint;
void main() { vPos = aPos; vUv = aUv; vLit = aLit; vTint = aTint; gl_Position = uPV * vec4(aPos, 1.); }`;
const FS_ENT = HEAD + `
uniform sampler2D uSkin; uniform float uExp; in vec3 vPos; centroid in vec2 vUv; in vec4 vLit; in vec3 vTint; out vec4 o;
${FOG}
void main() {
  vec4 c = vUv.x < -.5 ? vec4(1.) : texture(uSkin, vUv);
  if (c.a < .5) discard;
  float e = vLit.a, f;
  vec3 col = fogged(c.rgb * vTint * mix(vLit.rgb * uExp, vec3(1.25), clamp(e, 0., 1.)), vPos, f);
  o = vec4(col, clamp(e, 0., 1.) * (1. - f) * .95);
}`;
const VS_PART = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec4 aCol; uniform mat4 uPV; out vec4 vCol;
void main() { vCol = aCol; gl_Position = uPV * vec4(aPos, 1.); }`;
const FS_PART = HEAD + `in vec4 vCol; out vec4 o; void main() { o = vec4(vCol.rgb * vCol.a, vCol.a); }`;
/* halos : un carré tourné vers la caméra, une lueur ronde et douce, ajoutée */
const VS_GLOW = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec2 aUv; layout(location=2) in vec4 aCol; uniform mat4 uPV; out vec2 vUv; out vec4 vCol;
void main() { vUv = aUv; vCol = aCol; gl_Position = uPV * vec4(aPos, 1.); }`;
const FS_GLOW = HEAD + `in vec2 vUv; in vec4 vCol; out vec4 o;
void main() { float r = length(vUv * 2. - 1.); float a = pow(max(0., 1. - r), 2.2) * vCol.a; o = vec4(vCol.rgb * a, a); }`;
const VS_QUAD = `#version 300 es
layout(location=0) in vec2 aPos; out vec2 vUv;
void main() { vUv = aPos * .5 + .5; gl_Position = vec4(aPos, 0., 1.); }`;
const FS_BRIGHT = HEAD + `
uniform sampler2D uSrc; uniform vec2 uPx; in vec2 vUv; out vec4 o;
void main() {
  vec4 a = texture(uSrc, vUv + uPx * vec2(-.5, -.5)), b = texture(uSrc, vUv + uPx * vec2(.5, -.5)), c = texture(uSrc, vUv + uPx * vec2(-.5, .5)), d = texture(uSrc, vUv + uPx * vec2(.5, .5));
  o = vec4((a.rgb * a.a + b.rgb * b.a + c.rgb * c.a + d.rgb * d.a) * .25, 1.);
}`;
const FS_BLUR = HEAD + `
uniform sampler2D uSrc; uniform vec2 uDir; in vec2 vUv; out vec4 o;
void main() {
  vec3 c = texture(uSrc, vUv).rgb * .227;
  c += (texture(uSrc, vUv + uDir * 1.385).rgb + texture(uSrc, vUv - uDir * 1.385).rgb) * .316;
  c += (texture(uSrc, vUv + uDir * 3.231).rgb + texture(uSrc, vUv - uDir * 3.231).rgb) * .07;
  o = vec4(c, 1.);
}`;
/* finale : halo, courbe douce, vignette ; uVeil assombrit la scène quand on descend lire */
const FS_FINAL = HEAD + `
uniform sampler2D uScene, uB1, uB2, uB3; uniform float uBloom, uVeil; uniform vec3 uBg; in vec2 vUv; out vec4 o;
void main() {
  vec3 c = texture(uScene, vUv).rgb;
  vec3 b = texture(uB1, vUv).rgb * .5 + texture(uB2, vUv).rgb * .8 + texture(uB3, vUv).rgb * 1.15;
  c += b * uBloom;
  c = c * (1. + c * .12) / (1. + c * .32) * 1.12;
  vec2 q = vUv - .5; q.x *= 1.15; float v = dot(q, q);
  c *= 1. - v * .9;
  c = pow(c, vec3(.96, 1., 1.05));
  c = mix(c, uBg, uVeil);
  o = vec4(c, 1.);
}`;

/* ================= Le moteur ================= */
const AMB = [.022, .028, .055], LC = [[.62, .92, 1.32], [1.7, .56, .16], [1.8, .84, .3], [2.1, 1.0, .3]];
const BG = [12 / 255, 7 / 255, 8 / 255], FXW = FXB + .5;  // FXW : centre du foyer, en coordonnées du monde
function Engine(canvas, imgs, opts) {
  opts = opts || {};
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance', preserveDrawingBuffer: !!opts.still });
  if (!gl) return null;
  const prog = (vs, fs) => {
    const p = gl.createProgram();
    [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]].forEach(s => { const sh = gl.createShader(s[0]); gl.shaderSource(sh, s[1]); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); gl.attachShader(p, sh); });
    gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name] = gl.getUniformLocation(p, a.name); }
    return { p, u };
  };
  const P = { world: prog(VS_WORLD, FS_WORLD), ent: prog(VS_ENT, FS_ENT), part: prog(VS_PART, FS_PART), glow: prog(VS_GLOW, FS_GLOW),
    bright: prog(VS_QUAD, FS_BRIGHT), blur: prog(VS_QUAD, FS_BLUR), fin: prog(VS_QUAD, FS_FINAL) };

  /* textures */
  const layers = imgs.blocks.height / 16, c2 = mk(16, imgs.blocks.height), g2 = c2.getContext('2d', { willReadFrequently: true }); g2.drawImage(imgs.blocks, 0, 0);
  const texArr = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D_ARRAY, texArr);
  gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, 16, 16, layers, 0, gl.RGBA, gl.UNSIGNED_BYTE, g2.getImageData(0, 0, 16, imgs.blocks.height).data);
  gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  const tex2d = im => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im); [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]].forEach(p => gl.texParameteri(gl.TEXTURE_2D, p[0], p[1])); return t; };
  const texObj = tex2d(objSkin());

  /* la forge (géométrie fixe) */
  const room = buildForge();
  const vaoRoom = gl.createVertexArray(); gl.bindVertexArray(vaoRoom);
  { const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, room.verts, gl.STATIC_DRAW);
    [[0, 3, 0], [1, 2, 12], [2, 2, 20], [3, 4, 28], [4, 2, 44]].forEach(a => { gl.enableVertexAttribArray(a[0]); gl.vertexAttribPointer(a[0], a[1], gl.FLOAT, false, 52, a[2]); });
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, room.idxs, gl.STATIC_DRAW); }
  const nIdx = room.idxs.length; room.verts = null;
  const dyn = (attrs, stride) => { const vao = gl.createVertexArray(), b = gl.createBuffer(); gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, b); attrs.forEach(a => { gl.enableVertexAttribArray(a[0]); gl.vertexAttribPointer(a[0], a[1], gl.FLOAT, false, stride, a[2]); }); return { vao, b, cap: 0 }; };
  const DE = dyn([[0, 3, 0], [1, 2, 12], [2, 4, 20], [3, 3, 36]], 48), DP = dyn([[0, 3, 0], [1, 4, 12]], 28), DG = dyn([[0, 3, 0], [1, 2, 12], [2, 4, 20]], 36);
  const upload = (d, arr, n) => { gl.bindVertexArray(d.vao); gl.bindBuffer(gl.ARRAY_BUFFER, d.b); if (n > d.cap) { d.cap = Math.max(n, d.cap * 2, 4096); gl.bufferData(gl.ARRAY_BUFFER, d.cap * 4, gl.DYNAMIC_DRAW); } if (n) gl.bufferSubData(gl.ARRAY_BUFFER, 0, arr.subarray(0, n)); };
  const vaoQuad = gl.createVertexArray(); gl.bindVertexArray(vaoQuad);
  { const qb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, qb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); }
  gl.bindVertexArray(null);

  /* cibles de rendu */
  let W = 0, H = 0, quality = 1, fbScene = null, fbRes = null, rbs = [], bloom = [], msaa = 0;
  function target(w, hh) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, hh, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]].forEach(p => gl.texParameteri(gl.TEXTURE_2D, p[0], p[1]));
    const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    return { f, t, w, h: hh };
  }
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * quality, w = Math.max(2, Math.round(canvas.clientWidth * dpr)), hh = Math.max(2, Math.round(canvas.clientHeight * dpr));
    if (w === W && hh === H) return false;
    W = w; H = hh; canvas.width = W; canvas.height = H;
    [fbScene, fbRes && fbRes.f].concat(bloom.map(b => b.f)).forEach(f => f && gl.deleteFramebuffer(f)); rbs.forEach(r => gl.deleteRenderbuffer(r)); [fbRes && fbRes.t].concat(bloom.map(b => b.t)).forEach(t => t && gl.deleteTexture(t)); rbs = [];
    msaa = Math.min(4, gl.getParameter(gl.MAX_SAMPLES) || 0); if (opts.noMsaa || quality < .8) msaa = 0;
    fbRes = target(W, H);
    fbScene = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbScene);
    const depth = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, depth); rbs.push(depth);
    if (msaa) {
      const col = gl.createRenderbuffer(); rbs.push(col); gl.bindRenderbuffer(gl.RENDERBUFFER, col); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, msaa, gl.RGBA8, W, H); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, col);
      gl.bindRenderbuffer(gl.RENDERBUFFER, depth); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, msaa, gl.DEPTH_COMPONENT24, W, H);
    } else { gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, fbRes.t, 0); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, W, H); }
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    bloom = [];
    for (let i = 1; i <= 3; i++) { const bw = Math.max(2, W >> i), bh = Math.max(2, H >> i); bloom.push(target(bw, bh), target(bw, bh)); }
    return true;
  }

  let KT = [1, 1, 1, 1];
  const lightRGB = (x, y, z) => { const l = room.light(x, y, z), o = [0, 0, 0]; for (let i = 0; i < 3; i++) o[i] = AMB[i] + LC[0][i] * l[0] * KT[0] + LC[1][i] * l[1] * KT[1] + LC[2][i] * l[2] * KT[2] + LC[3][i] * l[3] * KT[3]; return o; };
  /* éclairage d'un objet : lumière du lieu, faces orientées comme en jeu, un liseré du foyer (derrière) */
  const litFn = base => (nx, ny, nz) => {
    const s = .62 * nx * nx + .82 * nz * nz + (ny > 0 ? 1 : .5) * ny * ny + .12 * Math.max(0, nz);
    const rim = Math.max(0, -nz) * .5 * KT[2];
    return [base[0] * s + LC[2][0] * rim, base[1] * s + LC[2][1] * rim, base[2] * s + LC[2][2] * rim];
  };

  /* ---------- caméra : trois quarts face, cadrée sur l'enclume et la bouche du foyer, dans la zone libre ---------- */
  const view = { fov: .44, pitch: .17, yaw: .5, T: [0, 1.9, -1], d: 9, sx: 0, sy: 0 };
  const SUBJ = [];
  [[-.55, 1, -.45], [.55, 1, .45], [-.55, ANVIL_TOP + .14, -.45], [.55, ANVIL_TOP + .14, .45], [.55, 1, -.45], [-.55, 1, .45],
    [-.55, ANVIL_TOP + .14, .45], [.55, ANVIL_TOP + .14, -.45]].forEach(p => SUBJ.push([p[0] + AX, p[1], p[2] + AZ]));
  let cam = { eye: [0, 5, 14], PV: null, right: [1, 0, 0], up: [0, 1, 0] };
  const dirOf = (yaw, pitch) => [Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch)];
  function project(x, y, z, PV) {
    const m = PV || cam.PV; if (!m) return null;
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (w <= .01) return null;
    return { x: ((m[0] * x + m[4] * y + m[8] * z + m[12]) / w * .5 + .5) * canvas.clientWidth, y: (1 - ((m[1] * x + m[5] * y + m[9] * z + m[13]) / w * .5 + .5)) * canvas.clientHeight };
  }
  /* safe : rectangle libre en coordonnées normalisées (-1..1) ; on cherche la distance qui y fait tenir le sujet */
  function layout(safe, o) {
    o = o || {};
    view.fov = o.fov || .44; view.pitch = o.pitch || .17; view.yaw = o.yaw === undefined ? .5 : o.yaw; view.T = o.T || [AX, 1.75, AZ];
    const asp = canvas.clientWidth / Math.max(1, canvas.clientHeight), dir = dirOf(view.yaw, view.pitch);
    const ext = d => {
      const eye = [view.T[0] + dir[0] * d, view.T[1] + dir[1] * d, view.T[2] + dir[2] * d], PV = mmul(persp(view.fov, asp, .1, 120), look(eye, view.T).m);
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, bad = false;
      SUBJ.forEach(p => { const w = PV[3] * p[0] + PV[7] * p[1] + PV[11] * p[2] + PV[15]; if (w < .2) { bad = true; return; } const x = (PV[0] * p[0] + PV[4] * p[1] + PV[8] * p[2] + PV[12]) / w, y = (PV[1] * p[0] + PV[5] * p[1] + PV[9] * p[2] + PV[13]) / w; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); });
      return { x0, x1, y0, y1, bad };
    };
    const sw = safe.x1 - safe.x0, sh = safe.y1 - safe.y0;
    let lo = 2, hi = 40;
    for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2, b = ext(mid); if (!b.bad && b.x1 - b.x0 <= sw && b.y1 - b.y0 <= sh) hi = mid; else lo = mid; }
    view.d = Math.min(hi, o.maxD || 40);
    const b = ext(view.d);
    view.sx = (safe.x0 + safe.x1) / 2 - (b.x0 + b.x1) / 2; view.sy = (safe.y0 + safe.y1) / 2 - (b.y0 + b.y1) / 2;
  }
  function camera(t, st) {
    const asp = W / H, par = st.par || { x: 0, y: 0 };
    const yaw = view.yaw + Math.sin(t * .11) * .035 + par.x * .045, pitch = view.pitch - par.y * .025, dir = dirOf(yaw, pitch);
    const eye = [view.T[0] + dir[0] * view.d, view.T[1] + dir[1] * view.d, view.T[2] + dir[2] * view.d];
    const V = look(eye, view.T), PV = mmul(persp(view.fov, asp, .1, 120), V.m);
    for (let c = 0; c < 4; c++) { PV[c * 4] += view.sx * PV[c * 4 + 3]; PV[c * 4 + 1] += view.sy * PV[c * 4 + 3]; }
    cam = { eye, PV, right: V.right, up: V.up };
  }

  /* ---------- particules : braises du foyer, étincelles du lingot ---------- */
  const PR = rng(5), NPM = 360, pool = []; let pi = 0;
  for (let i = 0; i < NPM; i++) pool.push({ life: 0 });
  const pdata = new Float32Array(NPM * 6 * 7);
  function spawn(kind, p, v) {
    const q = pool[pi = (pi + 1) % NPM];
    q.k = kind; q.x = p[0]; q.y = p[1]; q.z = p[2];
    const j = () => PR() - .5;
    if (kind === 'spark') { const a = PR() * 6.28, sp = (.8 + PR() * 1.9) * (v || 1); q.vx = Math.cos(a) * sp * .8; q.vz = Math.sin(a) * sp * .8; q.vy = 1.2 + PR() * 2.4 * (v || 1); q.g = 9; q.dr = .3; q.max = .3 + PR() * .45; q.s0 = q.s1 = .014 + PR() * .016; }
    else { q.k = 'ember'; q.vx = j() * .25; q.vy = .35 + PR() * .5; q.vz = .12 + j() * .25; q.g = -.03; q.dr = .15; q.max = 2.5 + PR() * 3; q.s0 = q.s1 = .016 + PR() * .016; q.ph = PR() * 6.28; }
    q.life = q.max;
  }
  /* pense : Gromaur réfléchit (événement de la page) ; la forge s'active : lingot plus chaud, gerbes plus serrées */
  let emb = 0, nextBurst = 2.5, heat = 0, pense = false;
  const INGOT_AT = [AX - .08, ANVIL_TOP, AZ + .02];
  function burst(n, v) { for (let i = 0; i < n; i++) spawn('spark', [INGOT_AT[0] + (PR() - .5) * .45, INGOT_AT[1] + .14, INGOT_AT[2] + (PR() - .5) * .14], v); }
  function particles(t, dt, nOut) {
    if (dt > 0) {
      emb += dt * (pense ? 7 : 4.5);
      while (emb >= 1) { emb--; if (PR() < .7) spawn('ember', [FXW - 1.4 + PR() * 2.8, 1.3 + PR() * .7, -4.2 + PR() * .3]); else spawn('ember', [FXW - 1.4 + PR() * 2.8, 1.05, -2.6 + PR() * .2]); }
      if (t >= nextBurst || nextBurst - t > 8) {
        if (pense) { heat = Math.min(1, heat + .35); burst(10 + Math.floor(PR() * 8), 1.05); nextBurst = t + .75 + PR() * .5; }
        else { burst(4 + Math.floor(PR() * 5), .8); nextBurst = t + 3 + PR() * 4; }
      }
    }
    const R = cam.right, U = cam.up; let k = 0;
    for (let i = 0; i < NPM; i++) {
      const q = pool[i]; if (q.life <= 0) continue;
      if (dt > 0) { const dmp = Math.exp(-q.dr * dt); q.vx *= dmp; q.vy = q.vy * dmp - q.g * dt; q.vz *= dmp; q.x += q.vx * dt + (q.k === 'ember' ? Math.sin(t * 1.3 + q.ph) * .2 * dt : 0); q.y += q.vy * dt; q.z += q.vz * dt; q.life -= dt; }
      if (q.y < 1.02 && q.k === 'spark') { q.y = 1.02; q.vy = -q.vy * .3; q.vx *= .5; q.vz *= .5; }
      if (q.life <= 0) continue;
      const a = q.life / q.max; let r, g, b, al; const s = q.s0;
      if (q.k === 'spark') { r = 1; g = .55 + .4 * a; b = .16 + .3 * a; al = Math.min(1, a * 3); }
      else { r = 1; g = .42 + .25 * Math.sin(t * 9 + q.ph); b = .08; al = Math.min(1, a * 4, (1 - a) * 4) * .8; }
      const cs = [[-s, -s], [s, -s], [s, s], [-s, -s], [s, s], [-s, s]];
      for (let jj = 0; jj < 6; jj++) { const c = cs[jj]; pdata[k++] = q.x + R[0] * c[0] + U[0] * c[1]; pdata[k++] = q.y + R[1] * c[0] + U[1] * c[1]; pdata[k++] = q.z + R[2] * c[0] + U[2] * c[1]; pdata[k++] = r; pdata[k++] = g; pdata[k++] = b; pdata[k++] = al; }
    }
    upload(DP, pdata, k);
    nOut[0] = k / 7;
  }

  /* ---------- halos : la bouche du foyer derrière l'enclume, le lingot ---------- */
  const gdata = new Float32Array(9 * 6 * 8);
  function glows(t, kt, kIngot) {
    let k = 0;
    const R = cam.right, U = cam.up;
    const add = (p, s, col, al) => {
      const C = [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, -1, 0, 0], [1, 1, 1, 1], [-1, 1, 0, 1]];
      C.forEach(c => { gdata[k++] = p[0] + (R[0] * c[0] + U[0] * c[1]) * s; gdata[k++] = p[1] + (R[1] * c[0] + U[1] * c[1]) * s; gdata[k++] = p[2] + (R[2] * c[0] + U[2] * c[1]) * s; gdata[k++] = c[2]; gdata[k++] = c[3]; gdata[k++] = col[0]; gdata[k++] = col[1]; gdata[k++] = col[2]; gdata[k++] = al; });
    };
    add([FXW, 1.9, -2.6], 2.8, [1, .42, .1], .24 * kt);
    add([FXW, 1.5, -3.4], 1.4, [1, .62, .22], .3 * kt);
    add([INGOT_AT[0], INGOT_AT[1] + .1, INGOT_AT[2]], .55, [1, .62, .25], .32 * kIngot);
    upload(DG, gdata, k);
    return k / 9;
  }

  /* ---------- une image ---------- */
  const S = Sink(), FOGC = BG;
  let last = 0, acc = 0, accN = 0, slow = 0, info = {};
  const NP = [0];
  const pass = (pr, dst, src, set) => { gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.f : null); gl.viewport(0, 0, dst ? dst.w : W, dst ? dst.h : H); gl.useProgram(pr.p); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src); gl.uniform1i(pr.u.uSrc, 0); if (set) set(); gl.bindVertexArray(vaoQuad); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); };
  const common = pr => { gl.useProgram(pr.p); const u = pr.u; if (u.uPV) gl.uniformMatrix4fv(u.uPV, false, cam.PV); if (u.uCam) gl.uniform3fv(u.uCam, cam.eye); if (u.uFog) gl.uniform3fv(u.uFog, FOGC); if (u.uFogD) gl.uniform1f(u.uFogD, .6 / view.d); if (u.uExp) gl.uniform1f(u.uExp, 1.2); if (u.uTime) gl.uniform1f(u.uTime, last); };
  const ingotM = mmul(mmul(trans(INGOT_AT[0], INGOT_AT[1], INGOT_AT[2]), P16), rotY(.22));
  const hammerM = mmul(mmul(trans(AX + .26, ANVIL_TOP, AZ - .12), P16), rotY(-.75));
  function frame(t, st) {
    resize();
    const dt = st.dt !== undefined ? st.dt : clamp(t - last, 0, .05); last = t;
    const fl = st.still ? 0 : 1;
    heat = Math.max(0, heat - dt * .7);
    const breath = .5 + .5 * Math.sin(t * 1.15);
    KT = [1 + .035 * fl * Math.sin(t * 7.3) * Math.sin(t * 3.1), 1 + .07 * fl * Math.sin(t * .8) * Math.sin(t * .33 + 1), .9 + fl * (.1 * Math.sin(t * 11.3) * Math.sin(t * 4.7) + .05 * Math.sin(t * 23.1)), .78 + .22 * breath * fl + heat * .9];
    if (pense) heat = Math.max(heat, .35 + .15 * Math.sin(t * 3.1));   // pendant la réflexion, le lingot ne refroidit pas
    S.n = 0;
    const L = lightRGB(INGOT_AT[0], INGOT_AT[1] + .3, INGOT_AT[2] + .5);
    model(INGOT, 64, 32, ingotM, S, litFn(L), .82 + .18 * breath + heat * .5);
    model(HAMMER, 64, 32, hammerM, S, litFn(L), 0);
    const r2 = S.n;
    camera(t, st);
    upload(DE, S.f, S.n);
    NP[0] = 0; if (!st.still) particles(t, dt, NP);
    const NG = glows(t, KT[2], KT[3]);
    if (st.sim) return;                                    // image d'essai : on fait vivre les étincelles sans dessiner

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbScene); gl.viewport(0, 0, W, H);
    gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
    gl.clearColor(BG[0], BG[1], BG[2], 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    common(P.world);
    gl.uniform3fv(P.world.u.uAmb, AMB); gl.uniform3fv(P.world.u.uC0, LC[0]); gl.uniform3fv(P.world.u.uC1, LC[1]); gl.uniform3fv(P.world.u.uC2, LC[2]); gl.uniform3fv(P.world.u.uC3, LC[3]); gl.uniform4fv(P.world.u.uK, KT);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, texArr); gl.uniform1i(P.world.u.uTex, 0);
    gl.bindVertexArray(vaoRoom); gl.drawElements(gl.TRIANGLES, nIdx, gl.UNSIGNED_INT, 0);
    common(P.ent); gl.uniform1i(P.ent.u.uSkin, 0); gl.bindVertexArray(DE.vao); gl.bindTexture(gl.TEXTURE_2D, texObj);
    if (r2) gl.drawArrays(gl.TRIANGLES, 0, r2 / 12);
    gl.enable(gl.BLEND); gl.depthMask(false); gl.blendFunc(gl.ONE, gl.ONE);
    common(P.glow); gl.bindVertexArray(DG.vao); gl.drawArrays(gl.TRIANGLES, 0, NG);
    if (NP[0]) { common(P.part); gl.bindVertexArray(DP.vao); gl.drawArrays(gl.TRIANGLES, 0, NP[0]); }
    gl.disable(gl.BLEND); gl.depthMask(true);
    gl.disable(gl.DEPTH_TEST);
    if (msaa) { gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fbScene); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, fbRes.f); gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.NEAREST); }
    let src = fbRes.t, sw = W, sh = H;
    for (let i = 0; i < 3; i++) {
      const a = bloom[i * 2], b = bloom[i * 2 + 1];
      pass(i ? P.blur : P.bright, a, src, () => { if (i) gl.uniform2f(P.blur.u.uDir, 0, 0); else gl.uniform2f(P.bright.u.uPx, 1 / sw, 1 / sh); });
      pass(P.blur, b, a.t, () => gl.uniform2f(P.blur.u.uDir, 1 / a.w, 0));
      pass(P.blur, a, b.t, () => gl.uniform2f(P.blur.u.uDir, 0, 1 / a.h));
      src = a.t; sw = a.w; sh = a.h;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H); gl.useProgram(P.fin.p);
    [fbRes.t, bloom[0].t, bloom[2].t, bloom[4].t].forEach((tx, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, tx); });
    gl.uniform1i(P.fin.u.uScene, 0); gl.uniform1i(P.fin.u.uB1, 1); gl.uniform1i(P.fin.u.uB2, 2); gl.uniform1i(P.fin.u.uB3, 3);
    gl.uniform1f(P.fin.u.uBloom, 1.0); gl.uniform1f(P.fin.u.uVeil, clamp(st.veil || 0, 0, 1)); gl.uniform3fv(P.fin.u.uBg, BG);
    gl.bindVertexArray(vaoQuad); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.activeTexture(gl.TEXTURE0);
    if (!opts.still && dt > 0) { acc += dt; accN++; if (accN >= 45) { const avg = acc / accN; acc = accN = 0; slow = avg > .045 ? slow + 1 : 0; if (slow >= 2 && quality > .5) { slow = 0; quality = Math.max(.5, quality - .17); } } }
    info = { W, H, quality, msaa, quads: room.quads, parts: NP[0] / 6 };
  }
  function strike(n) { heat = Math.min(1, heat + .7); burst(n || 22, 1.25); }
  function setPense(b, sansCoup) { if (b === pense) return; pense = b; nextBurst = 0; if (!b && !sansCoup) strike(26); }   // la réponse arrive : un dernier coup
  return { frame, layout, project, strike, setPense, info: () => Object.assign({ d: +view.d.toFixed(2) }, info) };
}

/* ================= La mise en page (indépendante de la 3D) ================= */
const $ = (s, r) => (r || D).querySelector(s), $$ = (s, r) => Array.from((r || D).querySelectorAll(s));
if (SHOT) root.classList.add('shot');

/* les poinçons : les numéros des questions (01…07), frappés dans la police du jeu */
function pxNum(word) {
  let d = '', x = 0;
  for (const ch of word) {
    const g = MC.font[ch] || MC.font['?']; if (!g) continue;
    const y0 = 10 - g.a;
    g.r.forEach((row, j) => { let run = 0; for (let i = 0; i <= row.length; i++) { if (row[i] === '#') run++; else if (run) { d += 'M' + (x + i - run) + ' ' + (y0 + j) + 'h' + run + 'v1h-' + run + 'z'; run = 0; } } });
    x += g.w + 1;
  }
  const w = Math.max(1, x - 1), svg = D.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 3 ' + w + ' 7'); svg.setAttribute('shape-rendering', 'crispEdges'); svg.setAttribute('aria-hidden', 'true');
  svg.style.setProperty('--w', w);
  const p = D.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('fill', 'currentColor'); p.setAttribute('d', d); svg.appendChild(p);
  return svg;
}
$$('.fp-n').forEach(el => { if (MC.font['0']) { el.textContent = ''; el.appendChild(pxNum(el.dataset.n || '')); el.classList.add('fp-px'); } else el.textContent = el.dataset.n || ''; });

/* l'en-tête devient une barre pleine dès qu'on quitte le haut de la page (rien ne transparaît dessous) */
let virtY = 0;
const defile = () => root.classList.toggle('fp-defile', window.scrollY + virtY > 24);
addEventListener('scroll', defile, { passive: true }); defile();

/* une question ouverte « rougit » : la classe ne sert qu'à rejouer la chauffe à chaque ouverture */
$$('.fp-q details').forEach(d => d.addEventListener('toggle', () => {
  d.classList.remove('fp-chauffe');
  if (d.open && !REDUCE) { void d.offsetWidth; d.classList.add('fp-chauffe'); }
}));

/* la forge suit Gromaur : « Gromaur réfléchit » affiché = pense ; puis la réponse (fin) ou une erreur */
const gmLog = $('#gm-log');
let suitGromaur = null;
if (gmLog) {
  let avant = false;
  new MutationObserver(() => {
    const p = !!gmLog.querySelector('.gm-pense');
    if (p === avant) return; avant = p;
    const der = gmLog.lastElementChild, err = !!(der && der.classList.contains('gm-err'));
    if (suitGromaur) suitGromaur(p ? 'pense' : err ? 'erreur' : 'fin');
  }).observe(gmLog, { childList: true, subtree: true });
}

/* ---------- crochets d'essai (aucun effet sans paramètre dans l'adresse) ---------- */
/* image d'essai (?shot=1) : le navigateur sans tête rend mal une page défilée qui a des éléments fixes (en-tête, forge).
   On simule donc le défilement en remontant le corps de la page ; les éléments fixes restent à leur place. */
const virt = y => {
  window.scrollTo({ top: 0, behavior: 'instant' });
  root.style.setProperty('--fp-vy', '0px');
  const max = Math.max(0, D.documentElement.scrollHeight - innerHeight);
  virtY = clamp(Math.round(y), 0, max);
  root.style.setProperty('--fp-vy', -virtY + 'px'); root.classList.toggle('fp-virt', virtY > 0); defile();
  window.dispatchEvent(new Event('scroll'));
};
{
  const n = parseInt(QS.get('ouvre') || '', 10), dets = $$('.fp-q details');
  if (n >= 1 && n <= dets.length) dets[n - 1].open = true;
  const box = $('#gromaur');
  if (QS.get('etat') === 'pense' && box && gmLog) {
    // image figée de « Gromaur réfléchit », construite comme faq.js le fait, sans rien envoyer à personne
    const el = (tag, cls, txt) => { const e = D.createElement(tag); if (cls) e.className = cls; if (txt) e.textContent = txt; return e; };
    const bulle = (bot, texte) => {
      const m = el('div', 'gm-msg ' + (bot ? 'gm-bot' : 'gm-user')), de = el('p', 'gm-de'), t = el('div', 'gm-txt'), vu = el('span', null, bot ? 'Gromaur · IA' : 'Toi');
      vu.setAttribute('aria-hidden', 'true'); de.append(el('span', 'sr', bot ? 'Gromaur, IA :' : 'Toi :'), vu);
      m.append(de, t); if (texte) t.appendChild(el('p', null, texte)); gmLog.appendChild(m); return { m, t };
    };
    bulle(false, 'Les Braises, ça sert à quoi ?');
    const b = bulle(true); b.m.setAttribute('aria-busy', 'true');
    const p = el('p', 'gm-pense', 'Gromaur réfléchit'), i = el('i'); i.setAttribute('aria-hidden', 'true'); i.appendChild(el('b')); p.appendChild(i); b.t.appendChild(p);
    box.classList.add('en-cours');
    ['#gm-sugg', '#gm-send', '#gm-pill'].forEach(s => { const e = $(s); if (e) e.hidden = true; });
    ['#gm-form', '#gm-stop', '#gm-new', '#gm-mention'].forEach(s => { const e = $(s); if (e) e.hidden = false; });
    gmLog.scrollTop = gmLog.scrollHeight;
  }
  const cadre = () => {
    if (QS.has('gm') && box) { if (SHOT) { virt(0); virt(box.getBoundingClientRect().top + window.scrollY - 84); } else box.scrollIntoView({ block: 'start', behavior: 'instant' }); }
    else if (QS.get('y')) { if (SHOT) virt(+QS.get('y')); else window.scrollTo({ top: +QS.get('y'), behavior: 'instant' }); }
    defile();
  };
  if (QS.has('gm') || QS.get('y')) { addEventListener('load', cadre); if (D.fonts && D.fonts.ready) D.fonts.ready.then(cadre); }
}

/* ================= La forge : en tête ; sur grand écran, elle reste en toile de fond, sur le côté ================= */
const hero = D.getElementById('fp-scene'), canvas = D.getElementById('fp-cv');
if (!hero || !canvas) return;
const loadImg = src => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error('image ' + src)); i.src = src; });
let eng = null, visible = true, veil = 0, parX = 0, parY = 0, cx = null, cy = null, dirty = true;
/* « fond » (écran de 1200 px et plus) : la toile est fixe, derrière toute la page. En tête, l'enclume est au centre ;
   quand on descend lire, la caméra recule et range l'enclume dans la marge de droite, assombrie, à côté de la colonne
   (qui a son propre fond uni). Sinon (« bandeau ») : la scène reste en tête de page et s'efface quand on descend. */
const POSTER = QS.has('poster'), FOND_MQ = matchMedia('(min-width: 1200px)');
let fond = false, prog = 0, penseOn = false, redraw = null;
if (POSTER) root.classList.add('fp-poster');
const ease = x => x * x * (3 - 2 * x);

function relayout() {
  if (!eng) return;
  const W = canvas.clientWidth, H = canvas.clientHeight; if (!W || !H) return;
  const tall = W < 700, nx = x => x / W * 2 - 1, ny = y => 1 - y / H * 2;   // px CSS -> coordonnées normalisées
  const CAM = (QS.get('cam') || '').split(',').map(Number);                   // essai : &cam=lacet,tangage,champ
  const o = tall ? { yaw: .3, pitch: .08, fov: .5, T: [AX, 1.75, AZ] } : { yaw: .3, pitch: .07, fov: .4, T: [AX, 1.75, AZ] };
  if (CAM.length === 3 && CAM.every(isFinite)) { o.yaw = CAM[0]; o.pitch = CAM[1]; o.fov = CAM[2]; }
  let a;
  if (tall) a = { x0: W * .16, x1: W * .84, y0: H * .84, y1: Math.max(84, H * .3) };
  else {
    const Hh = fond ? hero.clientHeight : H;                                   // la tête de page
    const c = W / 2 + Math.min(W * .12, 230), half = Math.min(W * .2, 330);
    a = { x0: c - half, x1: c + half, y0: Hh * .88, y1: Math.max(84, Hh * .3) };
    if (fond && prog > 0) {                                                     // la marge de droite, à côté de la colonne
      const colR = (W + Math.min(820, W - 32)) / 2, m = Math.min(72, (W - colR) * .16);
      // l'enclume à gauche de la marge ; la caméra tourne pour que la bouche du foyer brûle à sa droite, dans la marge
      const mw = W - colR - 2 * m, b = { x0: colR + m, x1: colR + m + mw * .58, y0: H * .7, y1: H * .42 }, k = ease(prog);
      a = { x0: lerp(a.x0, b.x0, k), x1: lerp(a.x1, b.x1, k), y0: lerp(a.y0, b.y0, k), y1: lerp(a.y1, b.y1, k) };
      if (!(CAM.length === 3 && CAM.every(isFinite))) { o.yaw = lerp(o.yaw, .56, k); o.pitch = lerp(o.pitch, .1, k); }
    }
  }
  eng.layout({ x0: nx(a.x0), x1: nx(a.x1), y0: ny(a.y0), y1: ny(a.y1) }, o);
  dirty = true;
}
function step(t, dt) {
  if (!eng) return;
  eng.frame(t, { dt, par: { x: parX, y: parY }, veil, still: REDUCE, calme: QS.has('calme') });
  dirty = false;
}
function onScroll() {
  const r = hero.getBoundingClientRect(), hh = r.height || 1;
  if (fond) {
    const p = clamp(-r.top / (hh * .9), 0, 1);
    if (Math.abs(p - prog) > .001) { prog = p; veil = p * .38; relayout(); root.style.setProperty('--fp-prog', p.toFixed(3)); }
  } else {
    const v = clamp(-r.top / (hh * .85), 0, 1);
    if (Math.abs(v - veil) > .002) { veil = v; dirty = true; hero.style.setProperty('--fp-recul', v.toFixed(3)); }
  }
}
function setMode() {
  const f = !!eng && FOND_MQ.matches && !POSTER;
  if (f !== fond) { fond = f; root.classList.toggle('fp-fond', fond); hero.style.setProperty('--fp-recul', '0'); prog = 0; veil = 0; dirty = true; }
}

function start(IMG) {
  if (!QS.has('nogl') && IMG && IMG.blocks) {
    try { eng = Engine(canvas, IMG, { still: SHOT }); } catch (e) { eng = null; if (window.console) console.error(e); }
  }
  root.classList.add(eng ? 'fp-gl' : 'fp-nogl');
  if (!eng) return;
  setMode(); relayout();
  /* Gromaur réfléchit : la forge s'active ; la réponse arrive : un dernier coup (pas après une erreur) */
  suitGromaur = etat => { penseOn = etat === 'pense'; eng.setPense(penseOn, etat === 'erreur'); if (redraw) redraw(); };
  if (D.querySelector('#gm-log .gm-pense')) { penseOn = true; eng.setPense(true); }
  const reflow = () => { setMode(); relayout(); onScroll(); };
  addEventListener('resize', () => { reflow(); if (REDUCE) step(20, 0); });
  if ('ResizeObserver' in window) new ResizeObserver(() => { relayout(); if (REDUCE && !SHOT) step(20, 0); }).observe(canvas);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();
  if (SHOT) {                                                // image figée et reproductible, pour les captures
    const T = +(QS.get('t') || 6.6);
    const shoot = () => { reflow(); for (let i = 0; i <= 90; i++) { if (i === 84 && !QS.has('calme')) eng.strike(16); if (i < 90) eng.frame(T - 3 + i / 30, { dt: 1 / 30, veil, sim: true, calme: QS.has('calme') }); else step(T, 1 / 30); } };
    redraw = shoot; shoot(); addEventListener('resize', shoot);
    // la page défile (crochet &y=, échange de démonstration) : on redessine l'image au nouveau cadrage
    let sT = 0; addEventListener('scroll', () => { clearTimeout(sT); sT = setTimeout(shoot, 30); }, { passive: true });
    root.classList.add('fp-ready');
    return;
  }
  if (REDUCE) {                                              // mouvement réduit : une image fixe, redessinée au besoin
    redraw = () => step(20, 0); step(20, 0); root.classList.add('fp-ready');
    addEventListener('scroll', () => { if (dirty) step(20, 0); }, { passive: true });
    return;
  }
  // un clic dans la forge : le lingot reprend feu et crache des étincelles
  hero.addEventListener('pointerdown', e => { if (e.button === 0) eng.strike(); });
  hero.addEventListener('pointermove', e => { const r = hero.getBoundingClientRect(); cx = (e.clientX - r.left) / r.width; cy = (e.clientY - r.top) / r.height; });
  hero.addEventListener('pointerleave', () => { cx = cy = null; });
  if ('IntersectionObserver' in window) new IntersectionObserver(es => { visible = es[es.length - 1].isIntersecting; }).observe(hero);
  if (QS.has('fps')) {
    const box = D.createElement('pre'); box.className = 'fps'; D.body.appendChild(box);
    const times = [], t0 = performance.now(); let n = 0, prev = t0;
    const tick = ms => { const a = performance.now(); step(ms / 1000, clamp((ms - prev) / 1000, 0, .05)); prev = ms; const d = performance.now() - a; times.push(d); n++;
      const el = (performance.now() - t0) / 1000; if (el < 20) requestAnimationFrame(tick);
      if (n % 15 === 0) { const s = times.slice(-600).sort((x, y) => x - y); box.textContent = 'fps ' + (n / el).toFixed(1) + ' | js médiane ' + s[s.length >> 1].toFixed(2) + ' ms | p95 ' + s[Math.floor(s.length * .95)].toFixed(2) + ' ms | ' + JSON.stringify(eng.info()); } };
    requestAnimationFrame(tick); root.classList.add('fp-ready'); return;
  }
  let last = 0, first = true;
  const loop = ms => {
    requestAnimationFrame(loop);
    const t = ms / 1000, raw = t - last;
    if (raw < .012 || D.hidden) return;                                       // onglet caché : rien
    if (!fond && (!visible || veil >= .999)) return;                          // bandeau hors écran ou éteint : rien
    if (fond && prog >= .98 && !penseOn && raw < .03) return;                 // toile de fond pendant la lecture : 30 images/s
    last = t;
    if (cx !== null) { parX += ((cx - .5) * 2 - parX) * .04; parY += ((cy - .5) * 2 - parY) * .04; }
    step(t, first ? 0 : Math.min(raw, .05)); first = false;
    if (!root.classList.contains('fp-ready')) root.classList.add('fp-ready');
  };
  requestAnimationFrame(loop);
}
if (QS.has('nogl')) start(null);
else loadImg('assets/mc/blocks.png').then(b => start({ blocks: b })).catch(e => { if (window.console) console.error(e); start(null); });
})();
