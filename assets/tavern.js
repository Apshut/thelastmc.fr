/* The Last — la taverne du Nether : la boutique (boutique.html).
   Moteur WebGL2 autonome, dans l'esprit de world.js (réservé à la page d'accueil, non modifié) : une salle en voxels avec
   les textures du jeu, la lumière propagée case par case sur quatre canaux de couleur (lanternes, lave, feu, âmes),
   l'occlusion ambiante, des modèles en boîtes au format du jeu, des particules et un halo.
   Le tavernier vient de keeper.js (window.TAVERN_KEEPER, contrat décrit en tête de ce fichier) ; les articles et les
   prix de config.js (shop.products, shop.inGame). Aucun stockage, aucun appel externe.
   Essais : ?shot=1 (image figée) &t=6 &mood=idle|angry|threat &since=0.6 &sel=<id> &frame=keeper (gros plan) &y=<px>
   (défilement, téléphone) ; ?fps=1 (coût par image) ; ?nogl=1 (sans 3D). */
(() => {
'use strict';

const CFG = window.THE_LAST || {}, MC = window.MC || { blocks: {}, items: {}, font: {} };
const KEEPER = window.TAVERN_KEEPER && Array.isArray(window.TAVERN_KEEPER.parts) && typeof window.TAVERN_KEEPER.pose === 'function' ? window.TAVERN_KEEPER : null;
const D = document, root = D.documentElement;
const $ = (s, r) => (r || D).querySelector(s), $$ = (s, r) => Array.from((r || D).querySelectorAll(s));
const QS = new URLSearchParams(location.search), SHOT = QS.has('shot');
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v, lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function mk(w, hh) { const c = D.createElement('canvas'); c.width = w; c.height = hh; return c; }
function h(tag, attrs, ...kids) {
  const e = D.createElement(tag);
  if (attrs) for (const k in attrs) { if (k === 'class') e.className = attrs[k]; else if (k === 'text') e.textContent = attrs[k]; else e.setAttribute(k, attrs[k]); }
  kids.forEach(c => { if (c) e.appendChild(typeof c === 'string' ? D.createTextNode(c) : c); });
  return e;
}

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
function tv(m, x, y, z) { return [m[0] * x + m[4] * y + m[8] * z, m[1] * x + m[5] * y + m[9] * z, m[2] * x + m[6] * y + m[10] * z]; }
const IDENT = ident(), Z3 = [0, 0, 0];
/* Rotations des parties [rx, ry, rz], appliquées comme le jeu (Z, puis Y, puis X : R = Rz·Ry·Rx), en quaternions [w, x, y, z].
   Le fondu entre deux humeurs passe par eux : mélanger les angles nombre par nombre faisait parfois faire un tour complet
   à un avant-bras (+170° et -170° ne sont qu'à 20° l'un de l'autre, mais 340° en chiffres). */
function e2q(r) {
  const hx = (r[0] || 0) / 2, hy = (r[1] || 0) / 2, hz = (r[2] || 0) / 2;
  const cx = Math.cos(hx), sx = Math.sin(hx), cy = Math.cos(hy), sy = Math.sin(hy), cz = Math.cos(hz), sz = Math.sin(hz);
  return [cz * cy * cx + sz * sy * sx, cz * cy * sx - sz * sy * cx, cz * sy * cx + sz * cy * sx, sz * cy * cx - cz * sy * sx];
}
function q2e(q) {
  const w = q[0], x = q[1], y = q[2], z = q[3], r20 = 2 * (x * z - w * y);
  if (Math.abs(r20) > .99999) return [Math.atan2(-2 * (y * z - w * x), 1 - 2 * (x * x + z * z)), -Math.sign(r20) * Math.PI / 2, 0];   // blocage de cardan
  return [Math.atan2(2 * (y * z + w * x), 1 - 2 * (x * x + y * y)), Math.asin(-r20), Math.atan2(2 * (x * y + w * z), 1 - 2 * (y * y + z * z))];
}
/* le plus court chemin entre deux orientations */
function slerpE(a, c, t) {
  const p = e2q(a); let q = e2q(c), d = p[0] * q[0] + p[1] * q[1] + p[2] * q[2] + p[3] * q[3];
  if (d < 0) { q = q.map(v => -v); d = -d; }
  let k0 = 1 - t, k1 = t;
  if (d < .9995) { const th = Math.acos(d), s = Math.sin(th); k0 = Math.sin((1 - t) * th) / s; k1 = Math.sin(t * th) / s; }
  const o = [p[0] * k0 + q[0] * k1, p[1] * k0 + q[1] * k1, p[2] * k0 + q[2] * k1, p[3] * k0 + q[3] * k1], l = Math.hypot(o[0], o[1], o[2], o[3]) || 1;
  return q2e(o.map(v => v / l));
}
const C16 = new Float32Array([1 / 16, 0, 0, 0, 0, -1 / 16, 0, 0, 0, 0, -1 / 16, 0, 0, 1.5, 0, 1]);   // repère des créatures du jeu -> monde (sol à y = 24)
const P16 = scale(1 / 16, -1 / 16, -1 / 16);                                                       // repère des objets : sol à y = 0

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
def('nbricks', 'nether_bricks');
def('rnbricks', 'red_nether_bricks');
def('cnbricks', 'chiseled_nether_bricks');
def('crnbricks', 'cracked_nether_bricks');
def('cplanks', 'crimson_planks');
def('cstem', ['crimson_stem_top', 'crimson_stem_top', 'crimson_stem']);
def('scstem', ['stripped_crimson_stem_top', 'stripped_crimson_stem_top', 'stripped_crimson_stem']);
def('barrel', ['barrel_top', 'barrel_bottom', 'barrel_side']);
def('netherrack', 'netherrack');
def('shroom', 'shroomlight', { light: 14, emit: 1 });
def('magma', 'magma', { light: 6, ch: 1, emit: .5 });
def('lava', 'lava_still', { light: 15, ch: 1, emit: 1 });
def('lavafall', 'lava_flow', { light: 15, ch: 1, emit: .82 });
def('bars', 'iron_bars', { cut: true });
def('wart', 'nether_wart_block');

/* ================= La salle ================= */
const WX = 25, WY = 10, WZ = 31, OX = 12, OZ = 11;     // x : -12..12, y : 0..9, z : -11..19
const FACES = [                                        // normale, axe U, axe V (V = haut de la texture)
  [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
  [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]]
];
const CORN = [[-1, -1], [1, -1], [1, 1], [-1, 1]], AOF = [1, .8, .62, .46];
const blv = l => { const f = l / 15; return f / (4 - 3 * f); };
const COUNTER_TOP = 2.0625, DAIS = 1.25, KEEP_AT = [0, DAIS, -1.75];

/* Le décor : tout est posé ici, bloc par bloc. */
function room(a) {
  const R = a.R;
  // sol : pierre noire polie devant le comptoir, planches carmin derrière ; plafond de planches sous la pierre noire
  a.fill(-12, 0, -11, 12, 0, 19, (x, y, z) => z <= -2 ? 'cplanks' : R() < .12 ? 'cpbb' : 'pbb');
  a.fill(-12, 7, -11, 12, 8, 19, (x, y) => y === 8 ? 'blackstone' : 'cplanks');
  // murs : soubassement de pierre noire, briques du Nether au-dessus, poteaux de tige carmin
  const wall = (x, y) => y === 1 ? 'polished' : y === 2 ? 'pbb' : R() < .1 ? 'rnbricks' : R() < .07 ? 'crnbricks' : 'nbricks';
  a.fill(-11, 1, -7, 10, 6, -7, wall);
  a.fill(-10, 1, -7, -10, 6, 19, wall);
  a.fill(9, 1, -7, 9, 6, 19, wall);
  [-1, 5, 11, 17].forEach(z => { a.fill(-10, 1, z, -10, 6, z, 'cstem'); a.fill(9, 1, z, 9, 6, z, 'cstem'); });
  a.fill(-9, 1, -6, -9, 6, -6, 'cstem'); a.fill(8, 1, -6, 8, 6, -6, 'cstem');
  // poutres sous le plafond
  [-3.5, 2, 8, 14].forEach(z => a.box(-10, 6.55, z - .3, 9, 7, z + .3, 'stripped_crimson_stem'));
  [-5.5, 5.5].forEach(x => a.box(x - .3, 6.4, -7, x + .3, 6.55, 19, 'stripped_crimson_stem'));

  // la cheminée, à gauche : un feu éternel sur la netherrack
  a.fill(-8, 1, -7, -6, 2, -7, null);
  a.fill(-9, 0, -9, -5, 4, -9, 'nbricks'); a.fill(-9, 1, -8, -9, 3, -8, 'nbricks'); a.fill(-5, 1, -8, -5, 3, -8, 'nbricks');
  a.fill(-8, 3, -8, -6, 3, -8, 'nbricks'); a.fill(-8, 0, -8, -6, 0, -8, 'netherrack');
  [-8, -7, -6].forEach((x, i) => { a.cross(x, 1, -8, i % 2 ? 'fire_1' : 'fire_0', { emit: 1 }); a.light(x, 1, -8, 15, 2); });
  a.fill(-9, 1, -6, -9, 2, -6, 'cnbricks'); a.fill(-5, 1, -6, -5, 2, -6, 'cnbricks');
  a.fill(-9, 3, -6, -5, 3, -6, 'rnbricks'); a.fill(-8, 4, -6, -6, 6, -6, 'nbricks');
  a.box(-9.1, 3.9, -6.2, -4.9, 4.05, -4.85, 'stripped_crimson_stem');                    // tablette de la cheminée

  // la fenêtre sur une chute de lave, à droite, derrière des barreaux
  a.fill(3, 2, -7, 5, 4, -7, 'bars');
  a.fill(2, 0, -9, 6, 6, -9, 'blackstone'); a.fill(2, 0, -8, 2, 6, -8, 'blackstone'); a.fill(6, 0, -8, 6, 6, -8, 'blackstone');
  a.fill(3, 1, -8, 5, 6, -8, 'lavafall'); a.fill(3, 0, -8, 5, 0, -8, 'lava');
  a.fill(2, 1, -7, 2, 5, -7, 'chiseled'); a.fill(6, 1, -7, 6, 5, -7, 'chiseled');
  a.fill(3, 1, -7, 5, 1, -7, 'gilded'); a.fill(3, 5, -7, 5, 5, -7, 'chiseled');

  // derrière le comptoir : tonneaux, étagères et bouteilles
  a.fill(-4, 1, -6, 1, 1, -6, 'barrel'); a.set(-4, 2, -6, 'barrel'); a.set(-3, 2, -6, 'barrel'); a.set(1, 2, -6, 'barrel');
  a.fill(7, 1, -6, 7, 1, -6, 'barrel'); a.set(7, 1, -5, 'barrel'); a.set(7, 2, -6, 'barrel'); a.set(6, 1, -6, 'barrel');
  a.set(-9, 1, -3, 'barrel'); a.set(-9, 2, -3, 'barrel'); a.set(-9, 1, -2, 'barrel');
  [3.05, 4.35].forEach((y, k) => {
    a.box(-2.2, y, -6, 1.95, y + .125, -5.4, 'crimson_planks');
    [-2, 1.6].forEach(x => a.box(x, y - .3, -6, x + .125, y, -5.6, 'stripped_crimson_stem'));
    for (let x = -2.05 + k * .2; x < 1.6; x += .38 + R() * .3) {
      const tex = R() < .55 ? 'orange_stained_glass' : 'red_stained_glass', hh = .3 + R() * .14;
      a.box(x, y + .125, -5.85, x + .25, y + .125 + hh, -5.6, tex, { emit: .35 });
      a.box(x + .0625, y + .125 + hh, -5.79, x + .1875, y + .26 + hh, -5.66, tex, { emit: .35 });
    }
  });
  [-3.6, -2.7].forEach(x => a.box(x, 3, -5.9, x + .3, 3.38, -5.55, 'barrel_side'));                                  // chopes sur les tonneaux

  // le comptoir : pierre noire polie, plateau de planches carmin qui déborde vers le client
  a.fill(-5, 1, -1, 4, 1, -1, x => x === -5 || x === 4 ? 'chiseled' : x === -1 || x === 0 ? 'gilded' : 'pbb');
  a.box(-5.1875, 1.875, -1.0625, 5.1875, COUNTER_TOP, .1875, 'crimson_planks');
  a.box(-5.0625, 1, .02, 5.0625, 1.0625, .12, 'stripped_crimson_stem');                    // plinthe

  // l'estrade du tavernier, derrière le comptoir : un quart de bloc, pour qu'on voie son dos de chèvre
  a.box(-4.5, 1, -5, 4.5, DAIS, -1.0625, 'crimson_planks');
  a.box(-4.5, 1, -5, -4.375, DAIS + .01, -1.0625, 'stripped_crimson_stem'); a.box(4.375, 1, -5, 4.5, DAIS + .01, -1.0625, 'stripped_crimson_stem');
  // le tapis devant le comptoir, où sont posés les articles
  a.box(-4.25, 1, .75, 4.25, 1.0625, 4.75, 'red_wool');
  a.box(-4.5, 1, .5, 4.5, 1.0625, .75, 'black_wool'); a.box(-4.5, 1, 4.75, 4.5, 1.0625, 5, 'black_wool');
  a.box(-4.5, 1, .75, -4.25, 1.0625, 4.75, 'black_wool'); a.box(4.25, 1, .75, 4.5, 1.0625, 4.75, 'black_wool');

  // lumières : lanternes suspendues, lanterne d'âmes sur le comptoir, champilampes au plafond
  [[-2.85, 4.8, .2], [2.85, 4.8, .2], [-6.6, 4.9, 4.6], [6.6, 4.9, 4.6]].forEach(p => a.lantern(p[0], p[1], p[2], 'lantern', true, 15, 0));
  a.lantern(-4.45, COUNTER_TOP, -.5, 'soul_lantern', false, 12, 3);
  a.lantern(4.4, COUNTER_TOP, -.55, 'lantern', false, 13, 0);
  [[-4, 7, -3], [4, 7, -3], [0, 7, -2], [0, 7, 10]].forEach(p => a.set(p[0], p[1], p[2], 'shroom'));
  // lianes pleureuses
  [[-8.5, 3, -5], [7.5, 2, -5], [-8.5, 2, 3], [7.5, 3, 4], [-7.5, 1, 12], [6.5, 2, 12]].forEach(v => {
    for (let k = 0; k <= v[1]; k++) a.cross(v[0] - .5, 6 - k, v[2], k === v[1] ? 'weeping_vines' : 'weeping_vines_plant', {});
  });
  // quelques tonneaux au premier plan, pour la profondeur
  a.set(-8, 1, 9, 'barrel'); a.set(-8, 2, 9, 'barrel'); a.set(-7, 1, 9, 'barrel'); a.set(7, 1, 10, 'barrel'); a.set(8, 1, 7, 'barrel');
}

function buildRoom() {
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
    get(x, y, z) { const id = getId(x, y, z); return id ? BL[id].name : null; },
    fill(x0, y0, z0, x1, y1, z1, n) {
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
        const v = typeof n === 'function' ? n(x, y, z) : n; if (v !== undefined) a.set(x, y, z, v);
      }
    },
    /* boîte libre (coordonnées décimales) ; la texture suit la grille des blocs */
    box(x0, y0, z0, x1, y1, z1, tex, o) { boxes.push({ a: [x0, y0, z0], b: [x1, y1, z1], tex, o: o || {} }); },
    /* deux plans croisés dans une case : feu, lianes */
    cross(x, y, z, tex, o) { [[0, 0, 1, 1], [0, 1, 1, 0]].forEach(d => q([[x + d[0], y + 1, z + d[1]], [x + d[2], y + 1, z + d[3]], [x + d[2], y, z + d[3]], [x + d[0], y, z + d[1]]], tex, null, o)); },
    light(x, y, z, l, ch) { lights.push([Math.floor(x), Math.floor(y), Math.floor(z), l, ch || 0]); },
    /* boîte aux faces texturées à la manière des modèles de blocs du jeu (uv en texels 0..16) */
    mbox(x0, y0, z0, x1, y1, z1, tex, f, o) {
      const s = f.side;
      q([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], tex, f.up, o);
      q([[x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0]], tex, f.down, o);
      q([[x1, y1, z0], [x0, y1, z0], [x0, y0, z0], [x1, y0, z0]], tex, s, o);
      q([[x0, y1, z1], [x1, y1, z1], [x1, y0, z1], [x0, y0, z1]], tex, s, o);
      q([[x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [x0, y0, z0]], tex, s, o);
      q([[x1, y1, z1], [x1, y1, z0], [x1, y0, z0], [x1, y0, z1]], tex, s, o);
    },
    /* lanterne du jeu (template_lantern / template_hanging_lantern), avec sa chaîne jusqu'au plafond */
    lantern(cx, by, cz, tex, hanging, l, ch) {
      const s = 1 / 16, X = v => cx - .5 + v * s, Y = v => by + v * s, Z = v => cz - .5 + v * s, o = { emit: 1 }, y0 = hanging ? 1 : 0;
      a.mbox(X(5), Y(y0), Z(5), X(11), Y(y0 + 7), Z(11), tex, { up: [0, 9, 6, 15], down: [0, 9, 6, 15], side: [0, 2, 6, 9] }, o);
      a.mbox(X(6), Y(y0 + 7), Z(6), X(10), Y(y0 + 9), Z(10), tex, { up: [1, 10, 5, 14], down: [1, 10, 5, 14], side: [1, 0, 5, 2] }, o);
      const c45 = Math.SQRT1_2, rot = (u, w) => [cx + (u - 8) * s * c45 - (w - 8) * s * c45, cz + (u - 8) * s * c45 + (w - 8) * s * c45];
      const plane = (u0, w0, u1, w1, ya, yb, uv) => { const p = rot(u0, w0), r = rot(u1, w1); q([[p[0], Y(yb), p[1]], [r[0], Y(yb), r[1]], [r[0], Y(ya), r[1]], [p[0], Y(ya), p[1]]], tex, uv, o); };
      if (hanging) { plane(6.5, 8, 9.5, 8, 11, 15, [11, 1, 14, 5]); plane(8, 6.5, 8, 9.5, 10, 16, [11, 6, 14, 12]); }
      else { plane(6.5, 8, 9.5, 8, 9, 11, [11, 1, 14, 3]); plane(8, 6.5, 8, 9.5, 9, 11, [11, 10, 14, 12]); }
      if (hanging) {                                                // chaîne : deux plans de 3 px tournés de 45°, comme le bloc du jeu
        for (let y = by + 1; y < 7; y += 1) {
          const top = Math.min(7, y + 1), v0 = 16 - (top - y) * 16;
          const p1 = rot(6.5, 8), p2 = rot(9.5, 8), p3 = rot(8, 6.5), p4 = rot(8, 9.5);
          q([[p1[0], top, p1[1]], [p2[0], top, p2[1]], [p2[0], y, p2[1]], [p1[0], y, p1[1]]], 'iron_chain', [0, v0, 3, 16], {});
          q([[p3[0], top, p3[1]], [p4[0], top, p4[1]], [p4[0], y, p4[1]], [p3[0], y, p3[1]]], 'iron_chain', [3, v0, 6, 16], {});
        }
      }
      a.light(cx, by + .3, cz, l, ch);
    }
  };
  room(a);

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
  const ST = 13; let cap = 1 << 19, buf = new Float32Array(cap), n = 0, nq = 0; const flips = [];
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
  // lumière d'un coin de quad libre : la case juste devant la face, un peu vers le centre
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
    // un plan fin (croix, anse) prend la lumière de sa propre case, des deux côtés
    const both = Math.abs(ny) < .5 && qd.uv[2] - qd.uv[0] < 16.01 && !qd.o.oneSide;
    const Nn = both ? [0, 0, 0] : [nx, ny, nz], ds = both ? .9 : dirShade([nx, ny, nz]);
    const UV = [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]];
    for (let k = 0; k < 4; k++) push(p[k][0], p[k][1], p[k][2], UV[k][0] / 16, UV[k][1] / 16, t, cornerLight(p[k], c0, Nn), ds, e);
    flips.push(0); nq++;
  });
  const idxs = new Uint32Array(nq * 6);
  for (let i = 0; i < nq; i++) { const o = i * 4, k = i * 6; if (flips[i]) { idxs[k] = o + 1; idxs[k + 1] = o + 2; idxs[k + 2] = o + 3; idxs[k + 3] = o + 1; idxs[k + 4] = o + 3; idxs[k + 5] = o; } else { idxs[k] = o; idxs[k + 1] = o + 1; idxs[k + 2] = o + 2; idxs[k + 3] = o; idxs[k + 4] = o + 2; idxs[k + 5] = o + 3; } }
  return { verts: buf.subarray(0, n), idxs, quads: nq, light: (x, y, z) => { const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z); return [0, 1, 2, 3].map(c => blv(lv(c, X, Y, Z))); } };
}

/* ================= Peau des objets à vendre (dessinée par code, 128 x 64) ================= */
function propSkin() {
  const c = mk(128, 64), g = c.getContext('2d'), R = rng(77);
  const px = (x, y, col) => { if (col) { g.fillStyle = col; g.fillRect(x, y, 1, 1); } };
  const box = (u, v, w, hh, d, fn) => {
    const F = { top: [u + d, v, w, d], bottom: [u + d + w, v, w, d], right: [u, v + d, d, hh], front: [u + d, v + d, w, hh], left: [u + d + w, v + d, d, hh], back: [u + d + w + d, v + d, w, hh] };
    for (const k in F) { const f = F[k]; for (let y = 0; y < f[3]; y++) for (let x = 0; x < f[2]; x++) px(f[0] + x, f[1] + y, fn(k, x, y, f[2], f[3])); }
  };
  // pièce de Braise 6 x 1 x 6 : un disque incandescent orange, bord sombre (rien à voir avec une pièce d'or)
  const FACE = ['.rrrr.', 'rOOOOr', 'rOyYOr', 'rOYyOr', 'rOOOOr', '.rrrr.'], PAL = { r: '#7c210b', O: '#e2541a', y: '#ff9a3c', Y: '#ffd27a' };
  box(0, 0, 6, 1, 6, (f, x, y) => {
    if (f === 'top' || f === 'bottom') { const ch = FACE[y][x]; return ch === '.' ? null : f === 'bottom' && ch !== 'r' ? '#b8441a' : PAL[ch]; }
    return x === 0 || x === 5 ? null : '#8c2a0e';
  });
  // tas de pièces 8 x 1 x 8 (seul le dessus compte) : des pièces serrées qui rougeoient
  box(24, 0, 8, 1, 8, (f, x, y) => {
    if (f !== 'top') return '#5a1a08';
    const cx = (x + (y % 2) * 1.5) % 3, cy = y % 3, d = Math.abs(cx - 1) + Math.abs(cy - 1);
    return d < .6 ? '#ffd27a' : d < 1.6 ? (R() < .5 ? '#ff9a3c' : '#e2541a') : R() < .5 ? '#a8330f' : '#c2410c';
  });
  // bourse de cuir 7 x 6 x 7, coutures claires
  const LEA = ['#a0653a', '#8f5831', '#b07244'];
  box(0, 10, 7, 6, 7, (f, x, y, w, hh) => {
    if (f === 'bottom') return '#5e3a20';
    if (f === 'top') return x === 0 || y === 0 || x === w - 1 || y === hh - 1 ? '#8f5831' : '#6b4226';
    if (f === 'front' && x === 3) return y % 2 ? '#e2c08a' : '#7a4a28';
    if (f === 'front' && y === 2 && (x === 1 || x === 5)) return '#ffb347';
    return y === hh - 1 ? '#6b4226' : y === 0 ? '#c0844f' : LEA[R() * 3 | 0];
  });
  box(28, 10, 5, 2, 5, (f, x) => f === 'top' || f === 'bottom' ? '#5e3a20' : x % 2 ? '#b07244' : '#7f4c2a');
  // sac de toile 10 x 11 x 9, tampon de braise sur le devant
  const STAMP = ['..#..', '.##..', '.###.', '#####', '.###.'];
  box(0, 24, 10, 11, 9, (f, x, y, w, hh) => {
    if (f === 'front' && x >= 2 && x < 7 && y >= 4 && y < 9 && STAMP[y - 4][x - 2] === '#') return '#6a2a10';
    if (f === 'top') return '#7d5f3c';
    if (f === 'bottom') return '#6e5233';
    const r = R(); return r < .08 ? '#866843' : (x + y) % 2 ? '#b39368' : '#9c7c54';
  });
  box(40, 24, 8, 3, 7, (f, x) => f === 'top' || f === 'bottom' ? '#6e5233' : x % 2 ? '#b29066' : '#94744c');
  // tronc de terre cuite 6 x 6 x 6 : bandes sombres, cœur de braise sur le devant
  const HEART = ['#.#', '###', '.#.'];
  box(56, 0, 6, 6, 6, (f, x, y) => {
    if (f === 'front' && x >= 1 && x < 4 && y >= 2 && y < 5 && HEART[y - 2][x - 1] === '#') return y === 2 ? '#ffb35c' : '#e2541a';
    if (f === 'top') return '#7a3a20'; if (f === 'bottom') return '#5e2a16';
    return y === 1 || y === 5 ? '#5e2a16' : ['#9a4f2e', '#8a4428', '#a85c38'][R() * 3 | 0];
  });
  box(80, 0, 4, 2, 4, (f, x) => f === 'top' ? '#4a2010' : x % 2 ? '#8a4428' : '#7a3a20');
  return c;
}

/* ================= Les articles en 3D (boîtes au format du jeu, sol à y = 0, avant vers -z) ================= */
const COIN = { o: [-3, -1, -3], s: [6, 1, 6], uv: [0, 0], e: .55 };
const coins = (list, pre) => list.map((c, i) => ({ n: (pre || 'k') + i, p: [c[0], c[1], c[2]], r: [c[4] || 0, c[3] || 0, c[5] || 0], b: [COIN] }));
const PILE = (o, s, e) => ({ o, s, us: [8, 1, 8], uv: [24, 0], e });
const CORD = [.78, .6, .32], ROPE = [.5, .38, .22];
const PROPS = {
  /* pièces posées : la peau de la pièce a des coins transparents (encoches de 1 px qui la traversent), on voit donc par
     l'encoche le dessous d'une pièce et ce qui est dessous. Aucun dessous n'est dans le plan d'un dessus ou du tapis :
     - au sol, les pièces s'enfoncent de 0,06 à 0,24 px dans le tapis (ou flottent 0,06 px au-dessus) ; celles qui se
       chevauchent ont des dessus décalés d'au moins 0,06 px (dans le même plan, ils scintillaient en rayures) ;
     - une pièce posée sur une autre s'y enfonce de 0,08 px ou plus (au contact exact, le dessus de celle du bas
       scintillait dans l'encoche de celle du haut) ;
     - la pièce penchée du tas (k12) a le bord avant au sol et l'arrière relevé sur le tas : penchée dans l'autre sens,
       le coin d'air entre son dessous et la pièce du dessous s'ouvrait vers le client (pointillé clair) */
  heap: { box: [-9, -5, -8, 9, 0, 8], parts: coins([[-3, .12, 1, .2], [-3.2, -.7, 1.1, .9], [-2.9, -1.62, .8, 1.6], [-3.1, -2.54, 1, .4], [-3, -3.46, 1.2, 1.1], [3, .18, -2, 1.1], [3.2, -.62, -2.1, .3],
    [.5, .24, 4, .7], [-6, .18, -3, 1.3], [6, .12, 3, .2], [0, -.06, -1, .5], [.8, -.98, -.7, 1.2], [-.6, -.95, -4.6, .4, .35], [4.5, .12, -5.5, .9], [-6.5, .18, 4, .1]]) },
  pouch: { box: [-7, -11, -7, 8, 0, 7], parts: [
    { n: 'body', p: [0, 0, 0], r: [0, .3, .05], b: [{ o: [-3.5, -6, -3.5], s: [7, 6, 7], uv: [0, 10] }, { o: [-3, -7, -3], s: [6, 1, 6], us: [7, 1, 7], uv: [0, 10] }, { o: [-2, -9, -2], s: [4, 2, 4], us: [5, 2, 5], uv: [28, 10] },
      { o: [-3, -10.5, -3], s: [6, 1.5, 6], us: [5, 2, 5], uv: [28, 10] }, PILE([-2.5, -10.6, -2.5], [5, .2, 5], .6),
      { o: [-2.3, -8.6, -2.3], s: [4.6, .8, 4.6], col: CORD }, { o: [1.6, -8.4, -2.8], s: [.8, 3.4, .8], col: CORD }] }
  ].concat(coins([[5.5, .12, -3, .4], [-5.6, .12, 2.5, 1.1], [4.6, 0, 3.8, .2, 0, .25], [5.6, -.8, -3.1, 1.2]])) },
  sack: { box: [-8, -15, -8, 9, 0, 8], parts: [
    { n: 'body', p: [0, 0, 0], r: [0, -.2, 0], b: [{ o: [-5, -11, -4.5], s: [10, 11, 9], uv: [0, 24] }, { o: [-4, -14, -3.5], s: [8, 3, 7], uv: [40, 24] }, PILE([-3.5, -14.2, -3], [7, .2, 6], .55),
      { o: [-4.4, -12.6, -3.9], s: [8.8, 1, 7.8], col: ROPE }, { o: [3.7, -12.4, -4.3], s: [1, 4, 1], col: ROPE }] }
  ].concat(coins([[6.5, .12, -4, .3], [6.7, -.74, -4.1, 1], [6.4, -1.66, -3.8, .6], [-6.8, .12, 3, .8], [-1, .12, -7, .2], [2.4, .18, -7.2, 1.3], [-6.5, .18, -4.5, .5]])) },
  chest: { box: [-9, -22, -11, 9, 0, 9], lid: -1.12, parts: [
    { n: 'pile', p: [0, 0, 0], b: [PILE([-6, -10.6, -6], [12, .6, 12], .5), PILE([-4.5, -11.8, -4], [9, 1.2, 8], .6)] }
  ].concat(coins([[-2, -11.72, -1, .3], [2, -12.2, 1, 1.2], [.5, -12.8, -2, .7, .2], [-3.5, -11.4, 3, 1.5], [3.4, -11.6, -3, .2]], 'm'))
   .concat(coins([[-4, .12, -10, .5], [-3.8, -.74, -10.2, 1.4], [3, .18, -10.5, .9], [6.8, .12, -8, .2], [-7, .18, -6, 1.1], [0, .06, -11.5, .3]], 's')) },
  jar: { box: [-5, -12, -5, 5, 0, 5], parts: [{ n: 'jar', p: [0, 0, 0], r: [0, .5, 0], b: [{ o: [-3, -6, -3], s: [6, 6, 6], uv: [56, 0] }, { o: [-2, -8, -2], s: [4, 2, 4], uv: [80, 0] },
    { o: [-2.5, -8.6, -2.5], s: [5, .6, 5], col: [.3, .2, .14] }, { o: [-1.5, -8.7, -.3], s: [3, .15, .6], col: [.06, .03, .02] }],
    // la pièce glissée dans la fente : relevée de 0,4 px, seule sa rangée du bas (4 px) entre dans le couvercle ; ses
    // rangées de 6 px traversaient les bords du couvercle (5 px) et ressortaient sur ses flancs
    c: [{ n: 'coin', p: [0, -10.6, 0], r: [Math.PI / 2, 0, 0], b: [COIN] }] }] }
};
/* coffre du jeu (texture mc/chest.png) : même découpe que le jeu ; le modèle se dessine retourné, comme en jeu */
const CHEST = [
  { n: 'base', p: [0, 0, 0], b: [{ o: [-7, 0, -7], s: [14, 10, 14], uv: [0, 19] }] },
  // couvercle aminci de 0,05 px par côté (patron inchangé) : ouvert, ses flancs recouvraient ceux de la caisse près des charnières
  { n: 'lid', p: [0, 9, -7], b: [{ o: [-6.95, 0, 0], s: [13.9, 5, 14], us: [14, 5, 14], uv: [0, 0] }, { o: [-1, -2, 14], s: [2, 4, 1], uv: [0, 0] }] }
];

/* ================= Construction des quads d'un modèle ================= */
/* Sortie : position, uv (-1 = boîte unie), lumière rgb + émission, teinte rgb : 12 flottants par sommet, 6 sommets par quad. */
function Sink() {
  const S = { f: new Float32Array(12 * 6 * 4096), n: 0 };
  S.quad = (P, a, b, c, d, uv, cen, lit, tint, e) => {
    if (S.n + 72 > S.f.length) { const nf = new Float32Array(S.f.length * 2); nf.set(S.f); S.f = nf; }
    const A = P[a], B = P[b], C = P[d];
    const ax = B[0] - A[0], ay = B[1] - A[1], az = B[2] - A[2], bx = C[0] - A[0], by = C[1] - A[1], bz = C[2] - A[2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const fx = (P[a][0] + P[c][0]) / 2 - cen[0], fy = (P[a][1] + P[c][1]) / 2 - cen[1], fz = (P[a][2] + P[c][2]) / 2 - cen[2];
    if (nx * fx + ny * fy + nz * fz < 0) { nx = -nx; ny = -ny; nz = -nz; }            // normale vers l'extérieur, même si le modèle est retourné
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
  const us = bx.us || s, u = bx.uv ? bx.uv[0] : 0, v = bx.uv ? bx.uv[1] : 0, dx = us[0], dy = us[1], dz = us[2], mir = !!bx.mir;
  const P = [tp(M, x0, y0, z0), tp(M, x1, y0, z0), tp(M, x1, y1, z0), tp(M, x0, y1, z0), tp(M, x0, y0, z1), tp(M, x1, y0, z1), tp(M, x1, y1, z1), tp(M, x0, y1, z1)];
  const cen = tp(M, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2), e = (bx.e || 0) * glow, tint = bx.col || WHITE, col = !!bx.col;
  const Q = (a, b, c, d, u0, v0, u1, v1) => {
    if (mir) { const t = u0; u0 = u1; u1 = t; }
    S.quad(P, a, b, c, d, col ? null : [[u0 / tw, v0 / th], [u1 / tw, v0 / th], [u1 / tw, v1 / th], [u0 / tw, v1 / th]], cen, lit, tint, e);
  };
  if (s[1] === 0) { Q(4, 5, 1, 0, u + dz, v, u + dz + dx, v + dz); return; }
  Q(4, 5, 1, 0, u + dz, v, u + dz + dx, v + dz);                                         // dessus
  Q(3, 2, 6, 7, u + dz + dx, v + dz, u + dz + dx + dx, v);                               // dessous
  const R0 = [u, v + dz, u + dz, v + dz + dy], L0 = [u + dz + dx, v + dz, u + dz + dx + dz, v + dz + dy];
  const r = mir ? L0 : R0, l = mir ? R0 : L0;                                             // en miroir, la droite et la gauche s'échangent
  Q(4, 0, 3, 7, r[0], r[1], r[2], r[3]);                                                  // côté droit
  Q(0, 1, 2, 3, u + dz, v + dz, u + dz + dx, v + dz + dy);                               // face
  Q(1, 5, 6, 2, l[0], l[1], l[2], l[3]);                                                  // côté gauche
  Q(5, 4, 7, 6, u + dz + dx + dz, v + dz, u + dz + dx + dz + dx, v + dz + dy);           // dos
}
/* parts : format du jeu ; base : matrice du modèle -> monde ; pose : { partie: [rx, ry, rz] } ; marks : { partie: [{ at, dir }] } */
function model(parts, tw, th, base, pose, S, lit, glow, marks) {
  const walk = (part, parent) => {
    const r = (pose && pose[part.n]) || part.r || Z3;
    let m = mmul(parent, trans(part.p[0], part.p[1], part.p[2]));
    if (r[2]) m = mmul(m, rotZ(r[2])); if (r[1]) m = mmul(m, rotY(r[1])); if (r[0]) m = mmul(m, rotX(r[0]));
    const M = mmul(base, m);
    if (part.b) for (let i = 0; i < part.b.length; i++) boxQ(M, part.b[i], tw, th, S, lit, glow);
    if (marks && marks[part.n]) marks[part.n].forEach(k => { k.out = tp(M, k.at[0], k.at[1], k.at[2]); if (k.dir) k.vec = tv(M, k.dir[0], k.dir[1], k.dir[2]); });
    if (part.c) for (let i = 0; i < part.c.length; i++) walk(part.c[i], m);
  };
  for (let i = 0; i < parts.length; i++) walk(parts[i], IDENT);
}

/* ================= Shaders ================= */
const HEAD = '#version 300 es\nprecision highp float; precision highp sampler2DArray; precision highp sampler2D;\n';
const FOG = `
uniform vec3 uCam, uFog; uniform float uFogD;
vec3 fogged(vec3 col, vec3 pos, out float f) { float d = length(pos - uCam); f = 1. - exp(-pow(d * uFogD, 1.6)); return mix(col, uFog, f); }`;
/* uv « centroid » (comme pour les entités, plus bas) : avec le multi-échantillonnage, un pixel du bord d'une face était
   calculé hors de la face ; l'uv sortait de la zone de texture (pointillés clairs au bord haut des flammes, lu en
   boucle au bas de la texture ; liserés étrangers sur les arêtes des lanternes et des chaînes) */
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
  if (vTex.y > 1.5) c = texture(uTex, vec3(vUv, vTex.x + mod(floor(uTime * 20.), vTex.y)));     // animation déroulée tick par tick
  else c = texture(uTex, vec3(vUv, vTex.x));
  if (c.a < .4) discard;
  vec3 li = (uAmb + uC0 * (vL.x * uK.x) + uC1 * (vL.y * uK.y) + uC2 * (vL.z * uK.z) + uC3 * (vL.w * uK.w)) * vS.x;
  float e = vS.y, f;
  vec3 col = fogged(c.rgb * mix(li * uExp, vec3(1.12), e), vPos, f);
  o = vec4(col, e * e * (1. - f) * (.3 + dot(c.rgb, vec3(.5, .5, .2))));
}`;
/* uv « centroid » : avec le multi-échantillonnage, un pixel du bord d'une face est calculé en son centre, parfois hors de
   la face ; l'uv débordait alors sur le texel voisin de la peau (autre boîte) et liserait les arêtes d'une couleur étrangère */
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
  vec3 col = fogged(c.rgb * vTint * mix(vLit.rgb * uExp, vec3(1.15), clamp(e, 0., 1.)), vPos, f);
  o = vec4(col, clamp(e, 0., 1.) * (1. - f) * .85);
}`;
const VS_PART = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec4 aCol; uniform mat4 uPV; out vec4 vCol;
void main() { vCol = aCol; gl_Position = uPV * vec4(aPos, 1.); }`;
const FS_PART = HEAD + `in vec4 vCol; out vec4 o; void main() { o = vec4(vCol.rgb * vCol.a, vCol.a); }`;
const VS_DEC = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec2 aUv; layout(location=2) in vec4 aCol; uniform mat4 uPV; out vec2 vUv; out vec4 vCol;
void main() { vUv = aUv; vCol = aCol; gl_Position = uPV * vec4(aPos, 1.); }`;
const FS_DEC = HEAD + `uniform float uRing; in vec2 vUv; in vec4 vCol; out vec4 o;
void main() {
  float r = length(vUv * 2. - 1.);
  float a = uRing > .5 ? smoothstep(.5, .74, r) * smoothstep(1., .8, r) : smoothstep(1., .1, r);
  a *= vCol.a; o = vec4(vCol.rgb * a, a);
}`;
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
const FS_FINAL = HEAD + `
uniform sampler2D uScene, uB1, uB2, uB3; uniform float uBloom, uRage; in vec2 vUv; out vec4 o;
void main() {
  vec3 c = texture(uScene, vUv).rgb;
  vec3 b = texture(uB1, vUv).rgb * .5 + texture(uB2, vUv).rgb * .8 + texture(uB3, vUv).rgb * 1.15;
  c += b * uBloom;
  c = c * (1. + c * .12) / (1. + c * .32) * 1.12;
  vec2 q = vUv - .5; float v = dot(q, q);
  c *= 1. - v * .75;
  c += vec3(.5, .06, 0.) * uRage * smoothstep(.12, .5, v);          // colère : le bord de l'image rougeoie
  c = pow(c, vec3(.96, 1., 1.05));
  o = vec4(c, 1.);
}`;

/* ================= Le moteur ================= */
const AMB = [.075, .048, .058], LC = [[1.45, .98, .6], [1.55, .55, .2], [1.6, .82, .38], [.32, .85, 1.05]];
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
  const P = { world: prog(VS_WORLD, FS_WORLD), ent: prog(VS_ENT, FS_ENT), part: prog(VS_PART, FS_PART), dec: prog(VS_DEC, FS_DEC),
    bright: prog(VS_QUAD, FS_BRIGHT), blur: prog(VS_QUAD, FS_BLUR), fin: prog(VS_QUAD, FS_FINAL) };

  /* textures */
  const layers = imgs.blocks.height / 16, c2 = mk(16, imgs.blocks.height), g2 = c2.getContext('2d', { willReadFrequently: true }); g2.drawImage(imgs.blocks, 0, 0);
  const texArr = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D_ARRAY, texArr);
  gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, 16, 16, layers, 0, gl.RGBA, gl.UNSIGNED_BYTE, g2.getImageData(0, 0, 16, imgs.blocks.height).data);
  gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  const tex2d = im => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im); [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]].forEach(p => gl.texParameteri(gl.TEXTURE_2D, p[0], p[1])); return t; };
  let texKeep = null, kw = 64, kh = 64;
  if (KEEPER) {
    kw = KEEPER.skin && KEEPER.skin.w || 64; kh = KEEPER.skin && KEEPER.skin.h || 64;
    const sc = mk(kw, kh), sg = sc.getContext('2d');
    try { if (KEEPER.skin && KEEPER.skin.draw) KEEPER.skin.draw(sg); } catch (e) { if (window.console) console.error(e); }
    texKeep = tex2d(sc);
  }
  const texProp = tex2d(propSkin()), texChest = imgs.chest ? tex2d(imgs.chest) : null;

  /* la salle (géométrie fixe) */
  const room = buildRoom();
  const vaoRoom = gl.createVertexArray(); gl.bindVertexArray(vaoRoom);
  { const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, room.verts, gl.STATIC_DRAW);
    [[0, 3, 0], [1, 2, 12], [2, 2, 20], [3, 4, 28], [4, 2, 44]].forEach(a => { gl.enableVertexAttribArray(a[0]); gl.vertexAttribPointer(a[0], a[1], gl.FLOAT, false, 52, a[2]); });
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, room.idxs, gl.STATIC_DRAW); }
  const nIdx = room.idxs.length; room.verts = null;
  /* tampons dynamiques */
  const dyn = (attrs, stride) => { const vao = gl.createVertexArray(), b = gl.createBuffer(); gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, b); attrs.forEach(a => { gl.enableVertexAttribArray(a[0]); gl.vertexAttribPointer(a[0], a[1], gl.FLOAT, false, stride, a[2]); }); return { vao, b, cap: 0 }; };
  const DE = dyn([[0, 3, 0], [1, 2, 12], [2, 4, 20], [3, 3, 36]], 48), DP = dyn([[0, 3, 0], [1, 4, 12]], 28), DD = dyn([[0, 3, 0], [1, 2, 12], [2, 4, 20]], 36);
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

  /* lumière d'un point (même calcul que le shader de la salle, sans l'ombrage des faces) */
  let KT = [1, 1, 1, 1];
  const lightRGB = (x, y, z) => { const l = room.light(x, y, z), o = [0, 0, 0]; for (let i = 0; i < 3; i++) o[i] = AMB[i] + LC[0][i] * l[0] * KT[0] + LC[1][i] * l[1] * KT[1] + LC[2][i] * l[2] * KT[2] + LC[3][i] * l[3] * KT[3]; return o; };
  /* éclairage d'une créature : lumière du lieu, faces orientées comme en jeu, liserés de la lave (à droite) et du feu (à gauche) */
  const litFn = (base, rim) => (nx, ny, nz) => {
    const s = .62 * nx * nx + .82 * nz * nz + (ny > 0 ? 1 : .5) * ny * ny + .12 * Math.max(0, nz);
    const rl = Math.max(0, nx * .8 - nz * .45) * .3 * rim * KT[1], rf = Math.max(0, -nx * .8 - nz * .45) * .22 * rim * KT[2];
    return [base[0] * s + LC[1][0] * rl + LC[2][0] * rf, base[1] * s + LC[1][1] * rl + LC[2][1] * rf, base[2] * s + LC[1][2] * rl + LC[2][2] * rf];
  };

  /* ---------- caméra : cadrée sur le tavernier, le comptoir et les articles, dans la zone libre de l'interface ---------- */
  const view = { fov: .6, pitch: .2, T: [0, 2.3, .8], d: 14, sx: 0, sy: 0 };
  let cam = { eye: [0, 5, 14], PV: null, right: [1, 0, 0], up: [0, 1, 0] }, items = [], subject = [];
  function project(x, y, z, PV) {
    const m = PV || cam.PV; if (!m) return null;
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (w <= .01) return null;
    return { x: ((m[0] * x + m[4] * y + m[8] * z + m[12]) / w * .5 + .5) * canvas.clientWidth, y: (1 - ((m[1] * x + m[5] * y + m[9] * z + m[13]) / w * .5 + .5)) * canvas.clientHeight };
  }
  const itemBase = (it, lift, spin) => mmul(mmul(trans(it.pos[0], it.pos[1] + (lift || 0), it.pos[2]), P16), rotY(it.ry + (spin || 0)));
  const corners = (M, b) => { const o = []; for (let i = 0; i < 8; i++) o.push(tp(M, i & 1 ? b[3] : b[0], i & 2 ? b[4] : b[1], i & 4 ? b[5] : b[2])); return o; };
  function layout(list, safe, tall) {
    items = list;
    view.fov = tall ? .5 : .46; view.pitch = tall ? .31 : .15; view.T = tall ? [0, 2.4, 1.2] : [0, 2.4, .9];
    const cw = tall ? 1.5 : 2.1, kb = kBox();
    subject = [[kb[0], kb[4] + .15, kb[2]], [kb[3], kb[4] + .15, kb[2]], [kb[0], kb[4] + .15, kb[5]], [kb[3], kb[4] + .15, kb[5]], [-cw, COUNTER_TOP, .19], [cw, COUNTER_TOP, .19]];
    if (QS.get('frame') === 'keeper') { view.fov = .5; view.pitch = .12; view.T = [0, 2.9, KEEP_AT[2]]; subject = [[kb[0] - .3, kb[4] + .2, KEEP_AT[2]], [kb[3] + .3, kb[4] + .2, KEEP_AT[2]], [kb[0] - .3, 1.3, KEEP_AT[2]], [kb[3] + .3, 1.3, KEEP_AT[2]]]; }
    else items.forEach(it => { if (PROPS[it.prop]) corners(itemBase(it), PROPS[it.prop].box).forEach(p => subject.push(p)); });
    const asp = canvas.clientWidth / Math.max(1, canvas.clientHeight), dir = [0, Math.sin(view.pitch), Math.cos(view.pitch)];
    const ext = d => {
      const eye = [view.T[0], view.T[1] + dir[1] * d, view.T[2] + dir[2] * d], PV = mmul(persp(view.fov, asp, .1, 120), look(eye, view.T).m);
      let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, bad = false;
      subject.forEach(p => { const w = PV[3] * p[0] + PV[7] * p[1] + PV[11] * p[2] + PV[15]; if (w < .2) { bad = true; return; } const x = (PV[0] * p[0] + PV[4] * p[1] + PV[8] * p[2] + PV[12]) / w, y = (PV[1] * p[0] + PV[5] * p[1] + PV[9] * p[2] + PV[13]) / w; x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); });
      return { x0, x1, y0, y1, bad };
    };
    const sw = safe.x1 - safe.x0, sh = safe.y1 - safe.y0;
    let lo = 3, hi = 60;
    for (let i = 0; i < 30; i++) { const mid = (lo + hi) / 2, b = ext(mid); if (!b.bad && b.x1 - b.x0 <= sw && b.y1 - b.y0 <= sh) hi = mid; else lo = mid; }
    const b = ext(hi);
    view.d = hi; view.sx = (safe.x0 + safe.x1) / 2 - (b.x0 + b.x1) / 2; view.sy = (safe.y0 + safe.y1) / 2 - (b.y0 + b.y1) / 2;
  }
  function camera(t, st, shake) {
    const asp = W / H, dir = [0, Math.sin(view.pitch), Math.cos(view.pitch)], par = st.par || { x: 0, y: 0 };
    const n1 = Math.sin(t * 61) * .5 + Math.sin(t * 37.7) * .5, n2 = Math.sin(t * 53.3 + 1) * .5 + Math.sin(t * 29.1) * .5;
    const eye = [view.T[0] + par.x * .35 + n1 * shake * .09, view.T[1] + dir[1] * view.d - par.y * .18 + n2 * shake * .09, view.T[2] + dir[2] * view.d];
    const at = [view.T[0] + par.x * .1 + n2 * shake * .03, view.T[1] + n1 * shake * .03, view.T[2]];
    const V = look(eye, at), PV = mmul(persp(view.fov, asp, .1, 120), V.m);
    for (let c = 0; c < 4; c++) { PV[c * 4] += view.sx * PV[c * 4 + 3]; PV[c * 4 + 1] += view.sy * PV[c * 4 + 3]; }
    cam = { eye, PV, right: V.right, up: V.up };
  }

  /* ---------- le tavernier ---------- */
  const kRest = {};
  let kBB = null;
  /* boîte englobante du tavernier au repos (monde) : x0, y0, z0, x1, y1, z1 */
  function kBox() {
    if (kBB) return kBB;
    kBB = [-1.2, 1, KEEP_AT[2] - .6, 1.2, 4.1, KEEP_AT[2] + .6];
    if (!KEEPER) return kBB;
    try {
      let rr = {}; try { const p0 = KEEPER.pose(0, { mood: 'idle', since: 3, look: { x: 0, y: 0 }, hover: null }) || {}; rr = p0._root || {}; } catch (e) { rr = {}; }
      const T = Sink(), base = mmul(mmul(trans(KEEP_AT[0], KEEP_AT[1], KEEP_AT[2]), C16), rotY(+rr.ry || 0));
      model(KEEPER.parts, kw, kh, base, null, T, () => WHITE, 1);
      const b = [1e9, 1e9, 1e9, -1e9, -1e9, -1e9];
      for (let i = 0; i < T.n; i += 12) for (let k = 0; k < 3; k++) { b[k] = Math.min(b[k], T.f[i + k]); b[k + 3] = Math.max(b[k + 3], T.f[i + k]); }
      if (b[4] > b[1]) kBB = b;
    } catch (e) { /* on garde la boîte par défaut */ }
    return kBB;
  }
  if (KEEPER) (function walk(ps) { ps.forEach(p => { kRest[p.n] = p.r || Z3; if (p.c) walk(p.c); }); })(KEEPER.parts);
  const ROOT0 = { x: 0, y: 0, z: 0, ry: 0, rx: 0 };
  let kShown = null, kFrom = null, kMood = null, kT0 = 0, kErr = 0, headAt = null;
  const fxAcc = {};
  function keeper(t, dt, st, S) {
    let P = null;
    try { P = KEEPER.pose(t, { mood: st.mood, since: st.since, look: st.look, hover: st.hover }); } catch (e) { if (!kErr++ && window.console) console.error(e); }
    P = P || {};
    const cur = { rot: {}, root: Object.assign({}, ROOT0, P._root || {}), glow: P._glow === undefined ? 1 : clamp(+P._glow || 0, 0, 1) };
    for (const n in kRest) cur.rot[n] = Array.isArray(P[n]) ? P[n] : kRest[n];
    if (st.mood !== kMood) { kFrom = kShown; kMood = st.mood; kT0 = st.now; }
    const b = kFrom ? smooth((st.now - kT0) / .3) : 1;
    let out = cur;
    if (b < 1) {
      out = { rot: {}, root: {}, glow: lerp(kFrom.glow, cur.glow, b) };
      for (const n in kRest) out.rot[n] = slerpE(kFrom.rot[n], cur.rot[n], b);
      // le tavernier peut fondre lui-même certaines parties (Gromaur : les bras, par positions plutôt que par angles)
      let own = null;
      if (KEEPER.blend) try { own = KEEPER.blend(kFrom.rot, cur.rot, b); } catch (e) { if (!kErr++ && window.console) console.error(e); }
      if (own) for (const n in own) if (n in kRest && Array.isArray(own[n])) out.rot[n] = own[n];
      for (const k in ROOT0) out.root[k] = lerp(+kFrom.root[k] || 0, +cur.root[k] || 0, b);
    } else kFrom = null;
    kShown = out;
    const r = out.root;
    const base = mmul(mmul(trans(KEEP_AT[0], KEEP_AT[1], KEEP_AT[2]), C16), mmul(mmul(trans(+r.x || 0, -(+r.y || 0), +r.z || 0), rotY(+r.ry || 0)), rotX(+r.rx || 0)));
    // marques : effets attachés à une partie, et le haut de la tête pour la bulle
    const fx = Array.isArray(P.fx) ? P.fx : [], marks = {}, req = [];
    fx.forEach(f => { if (!f || !Array.isArray(f.at)) return; const k = { at: f.at, dir: f.dir, f }; if (f.part && kRest[f.part]) (marks[f.part] = marks[f.part] || []).push(k); else k.root = 1; req.push(k); });
    const hm = { at: [0, -11, -1] }; if (kRest.head) (marks.head = marks.head || []).push(hm);
    const L0 = lightRGB(KEEP_AT[0], 3, KEEP_AT[2] + .6).map((v, i) => v * 1.25 + [.16, .1, .06][i]);
    model(KEEPER.parts, kw, kh, base, out.rot, S, litFn(L0, 1), out.glow, marks);
    const top = kBox()[4] + .3; headAt = hm.out ? [hm.out[0], Math.max(hm.out[1] + .35, top), hm.out[2]] : [KEEP_AT[0], top, KEEP_AT[2]];
    req.forEach((k, i) => {
      if (k.root) { k.out = tp(base, k.at[0], k.at[1], k.at[2]); if (k.dir) k.vec = tv(base, k.dir[0], k.dir[1], k.dir[2]); }
      if (!k.out || REDUCE) return;
      const key = k.f.kind + ':' + i; fxAcc[key] = (fxAcc[key] || 0) + clamp(+k.f.n || 0, 0, 2000) * dt;
      while (fxAcc[key] >= 1) { fxAcc[key]--; spawn(k.f.kind, k.out, k.vec); }
    });
    return clamp(+P._shake || 0, 0, 1);
  }

  /* ---------- particules : souffle, étincelles, poussière, braises, reflets ---------- */
  const PR = rng(5), NPM = 520, pool = []; let pi = 0;
  for (let i = 0; i < NPM; i++) pool.push({ life: 0 });
  const pdata = new Float32Array(NPM * 6 * 7);
  function spawn(kind, p, v) {
    const q = pool[pi = (pi + 1) % NPM];
    q.k = kind; q.x = p[0]; q.y = p[1]; q.z = p[2];
    let dx = 0, dy = 0, dz = 0; if (v) { const l = Math.hypot(v[0], v[1], v[2]) || 1; dx = v[0] / l; dy = v[1] / l; dz = v[2] / l; }
    const j = () => PR() - .5;
    if (kind === 'smoke') { const sp = .8 + PR() * .5; q.vx = dx * sp + j() * .25; q.vy = dy * sp + j() * .2; q.vz = dz * sp + j() * .25; q.g = -.6; q.dr = 1.9; q.max = .9 + PR() * .6; q.s0 = .03; q.s1 = .13 + PR() * .07; }
    else if (kind === 'spark') { const a = PR() * 6.28, sp = 1.2 + PR() * 2.2; q.vx = Math.cos(a) * sp * .7; q.vz = Math.sin(a) * sp * .7; q.vy = 1.5 + PR() * 2.4; q.g = 9; q.dr = .25; q.max = .35 + PR() * .4; q.s0 = q.s1 = .03 + PR() * .03; }
    else if (kind === 'dust') { const a = PR() * 6.28, sp = .5 + PR() * .8; q.vx = Math.cos(a) * sp; q.vz = Math.sin(a) * sp; q.vy = .15 + PR() * .35; q.g = .6; q.dr = 2.2; q.max = .6 + PR() * .5; q.s0 = .06; q.s1 = .18 + PR() * .08; }
    else if (kind === 'glint') { q.vx = q.vy = q.vz = 0; q.g = 0; q.dr = 0; q.max = .45 + PR() * .3; q.s0 = q.s1 = .045 + PR() * .03; }
    else { q.k = 'ember'; q.vx = j() * .3 + dx * .4; q.vy = .3 + PR() * .5; q.vz = j() * .3 + dz * .4; q.g = -.04; q.dr = .15; q.max = 2.5 + PR() * 3.5; q.s0 = q.s1 = .022 + PR() * .022; q.ph = PR() * 6.28; }
    q.life = q.max;
  }
  let emb = 0;
  function particles(t, dt, nOut) {
    if (!REDUCE && dt > 0) {
      emb += dt * 9;
      while (emb >= 1) { emb--; if (PR() < .55) spawn('ember', [-8 + PR() * 3, 1.2 + PR() * .6, -7.6 + PR() * .5], [0, 0, 1]); else spawn('ember', [3 + PR() * 3, 1.5 + PR() * 3.5, -6.85], [0, 0, 1]); }
      items.forEach(it => { if (PROPS[it.prop] && PR() < dt * (.7 + it.hl * 5)) { const b = PROPS[it.prop].box, M = itemBase(it); spawn('glint', tp(M, lerp(b[0], b[3], PR()) * .7, lerp(b[1], 0, .3 + PR() * .7), lerp(b[2], b[5], PR()) * .7)); } });
    }
    const R = cam.right, U = cam.up; let k = 0, nOver = 0;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < NPM; i++) {
        const q = pool[i]; if (q.life <= 0) continue;
        const over = q.k === 'smoke' || q.k === 'dust'; if ((pass === 0) !== over) continue;
        if (pass === 0 || !over) {
          if (dt > 0 && !q.done) { const dmp = Math.exp(-q.dr * dt); q.vx *= dmp; q.vy = q.vy * dmp - q.g * dt; q.vz *= dmp; q.x += q.vx * dt + (q.k === 'ember' ? Math.sin(t * 1.3 + q.ph) * .2 * dt : 0); q.y += q.vy * dt; q.z += q.vz * dt; q.life -= dt; }
          if (q.y < 1.02 && q.k === 'spark') { q.y = 1.02; q.vy = -q.vy * .3; q.vx *= .5; q.vz *= .5; }
          if (q.life <= 0) continue;
        }
        const a = q.life / q.max; let r, g, b, al, s = lerp(q.s0, q.s1, 1 - a);
        if (q.k === 'smoke') { const m = Math.sqrt(1 - a); r = lerp(.5, .17, m); g = lerp(.28, .15, m); b = lerp(.18, .15, m); al = .4 * Math.min(1, (1 - a) * 7) * a; }
        else if (q.k === 'dust') { r = .3; g = .22; b = .18; al = .42 * a * Math.min(1, (1 - a) * 8); }
        else if (q.k === 'spark') { r = 1; g = .5 + .4 * a; b = .12 + .2 * a; al = Math.min(1, a * 3); }
        else if (q.k === 'glint') { r = 1; g = .82; b = .45; al = Math.sin(Math.PI * (1 - a)) * .9; s *= .6 + .4 * Math.sin(Math.PI * (1 - a)); }
        else { r = 1; g = .42 + .25 * Math.sin(t * 9 + q.ph); b = .08; al = Math.min(1, a * 4, (1 - a) * 4) * .85; }
        const cs = [[-s, -s], [s, -s], [s, s], [-s, -s], [s, s], [-s, s]];
        for (let j = 0; j < 6; j++) { const c = cs[j]; pdata[k++] = q.x + R[0] * c[0] + U[0] * c[1]; pdata[k++] = q.y + R[1] * c[0] + U[1] * c[1]; pdata[k++] = q.z + R[2] * c[0] + U[2] * c[1]; pdata[k++] = r; pdata[k++] = g; pdata[k++] = b; pdata[k++] = al; }
      }
      if (pass === 0) nOver = k / 7;
    }
    upload(DP, pdata, k);
    nOut[0] = nOver; nOut[1] = k / 7 - nOver;
  }

  /* ---------- ombres au sol et anneau de sélection ---------- */
  const ddata = new Float32Array(9 * 6 * 32);
  function decals(t) {
    let k = 0, nb = 0;
    const quad = (x, y, z, rx, rz, col, al) => {
      const P4 = [[x - rx, y, z - rz, 0, 0], [x + rx, y, z - rz, 1, 0], [x + rx, y, z + rz, 1, 1], [x - rx, y, z + rz, 0, 1]];
      [0, 1, 2, 0, 2, 3].forEach(i => { const p = P4[i]; ddata[k++] = p[0]; ddata[k++] = p[1]; ddata[k++] = p[2]; ddata[k++] = p[3]; ddata[k++] = p[4]; ddata[k++] = col[0]; ddata[k++] = col[1]; ddata[k++] = col[2]; ddata[k++] = al; });
    };
    items.forEach(it => { const b = PROPS[it.prop] && PROPS[it.prop].box; if (!b) return; const rx = (b[3] - b[0]) / 32 * 1.05, rz = (b[5] - b[2]) / 32 * 1.05; quad(it.pos[0], it.pos[1] + .004, it.pos[2], rx, rz, [0, 0, 0], .55); nb += 6; });
    items.forEach(it => { if (!it.hl || !PROPS[it.prop]) return; const b = PROPS[it.prop].box, rr = Math.max(b[3] - b[0], b[5] - b[2]) / 32 * 1.45; quad(it.pos[0], it.pos[1] + .006, it.pos[2], rr, rr, [1, .42, .1], it.hl * (.7 + .3 * Math.sin(t * 4.5))); });
    upload(DD, ddata, k);
    return [nb, k / 9 - nb];
  }

  /* ---------- une image ---------- */
  const S = Sink(), FOGC = [.045, .018, .02];
  let last = 0, acc = 0, accN = 0, slow = 0, info = {};
  const NP2 = [0, 0];
  const pass = (pr, dst, src, set) => { gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.f : null); gl.viewport(0, 0, dst ? dst.w : W, dst ? dst.h : H); gl.useProgram(pr.p); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src); gl.uniform1i(pr.u.uSrc, 0); if (set) set(); gl.bindVertexArray(vaoQuad); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); };
  const common = pr => { gl.useProgram(pr.p); const u = pr.u; if (u.uPV) gl.uniformMatrix4fv(u.uPV, false, cam.PV); if (u.uCam) gl.uniform3fv(u.uCam, cam.eye); if (u.uFog) gl.uniform3fv(u.uFog, FOGC); if (u.uFogD) gl.uniform1f(u.uFogD, .42 / view.d); if (u.uExp) gl.uniform1f(u.uExp, 1.32); if (u.uTime) gl.uniform1f(u.uTime, last); };
  function frame(t, st) {
    resize();
    const dt = st.dt !== undefined ? st.dt : clamp(t - last, 0, .05); last = t;
    const fl = REDUCE ? 0 : 1;
    KT = [1 + .035 * fl * Math.sin(t * 7.3) * Math.sin(t * 3.1), 1 + .08 * fl * Math.sin(t * .9) * Math.sin(t * .37 + 1), .86 + fl * (.1 * Math.sin(t * 11.3) * Math.sin(t * 4.7) + .06 * Math.sin(t * 23.1)), 1 + .06 * fl * Math.sin(t * 2.2)];
    // modèles : tavernier, objets, coffres (trois textures, un seul tampon)
    S.n = 0;
    let shake = 0;
    if (KEEPER) shake = keeper(t, dt, st, S);
    const r1 = S.n;
    const chestM = [];
    items.forEach(it => {
      const Pp = PROPS[it.prop]; if (!Pp) return;
      const hl = it.hl || 0, lift = REDUCE ? hl * .06 : hl * (.06 + Math.sin(t * 3.2) * .025), spin = REDUCE ? 0 : Math.sin(t * 2.1) * .12 * hl;
      const M = itemBase(it, lift, spin), L = lightRGB(it.pos[0], it.pos[1] + .45, it.pos[2]);
      model(Pp.parts, 128, 64, M, null, S, litFn(L, .6), 1 + hl * .7);
      if (it.prop === 'chest') chestM.push([M, L, hl]);
    });
    const r2 = S.n;
    if (texChest) chestM.forEach(c => model(CHEST, 64, 64, mmul(mmul(c[0], rotY(Math.PI)), scale(1, -1, 1)), { lid: [PROPS.chest.lid - c[2] * .3 - (REDUCE ? 0 : Math.sin(t * 2.6) * .04 * c[2]), 0, 0] }, S, litFn(c[1], .6), 1));
    const r3 = S.n;
    camera(t, st, REDUCE ? 0 : shake);
    upload(DE, S.f, S.n);
    const dc = decals(t);
    if (!REDUCE) particles(t, dt, NP2);

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbScene); gl.viewport(0, 0, W, H);
    gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
    gl.clearColor(.02, .01, .012, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    // la salle
    common(P.world);
    gl.uniform3fv(P.world.u.uAmb, AMB); gl.uniform3fv(P.world.u.uC0, LC[0]); gl.uniform3fv(P.world.u.uC1, LC[1]); gl.uniform3fv(P.world.u.uC2, LC[2]); gl.uniform3fv(P.world.u.uC3, LC[3]); gl.uniform4fv(P.world.u.uK, KT);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, texArr); gl.uniform1i(P.world.u.uTex, 0);
    gl.bindVertexArray(vaoRoom); gl.drawElements(gl.TRIANGLES, nIdx, gl.UNSIGNED_INT, 0);
    // le tavernier et les articles
    common(P.ent); gl.uniform1i(P.ent.u.uSkin, 0); gl.bindVertexArray(DE.vao);
    [[texKeep, 0, r1], [texProp, r1, r2], [texChest, r2, r3]].forEach(r => { if (r[0] && r[2] > r[1]) { gl.bindTexture(gl.TEXTURE_2D, r[0]); gl.drawArrays(gl.TRIANGLES, r[1] / 12, (r[2] - r[1]) / 12); } });
    // ombres au sol, anneau de sélection, particules
    gl.enable(gl.BLEND); gl.depthMask(false);
    common(P.dec); gl.bindVertexArray(DD.vao);
    gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE); gl.uniform1f(P.dec.u.uRing, 0); if (dc[0]) gl.drawArrays(gl.TRIANGLES, 0, dc[0]);
    gl.blendFunc(gl.ONE, gl.ONE); gl.uniform1f(P.dec.u.uRing, 1); if (dc[1]) gl.drawArrays(gl.TRIANGLES, dc[0], dc[1]);
    if (!REDUCE) {
      common(P.part); gl.bindVertexArray(DP.vao);
      gl.blendFuncSeparate(gl.ONE, gl.ONE_MINUS_SRC_ALPHA, gl.ZERO, gl.ONE); if (NP2[0]) gl.drawArrays(gl.TRIANGLES, 0, NP2[0]);
      gl.blendFunc(gl.ONE, gl.ONE); if (NP2[1]) gl.drawArrays(gl.TRIANGLES, NP2[0], NP2[1]);
    }
    gl.disable(gl.BLEND); gl.depthMask(true); gl.disable(gl.DEPTH_TEST);
    if (msaa) { gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fbScene); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, fbRes.f); gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.NEAREST); }
    // halo : on garde ce qui brille, on floute à trois échelles, on l'ajoute par-dessus
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
    gl.uniform1f(P.fin.u.uBloom, .95); gl.uniform1f(P.fin.u.uRage, st.rage || 0);
    gl.bindVertexArray(vaoQuad); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.activeTexture(gl.TEXTURE0);
    // qualité adaptative : si la machine peine, on baisse la définition
    if (!opts.still && dt > 0) { acc += dt; accN++; if (accN >= 45) { const avg = acc / accN; acc = accN = 0; slow = avg > .045 ? slow + 1 : 0; if (slow >= 2 && quality > .5) { slow = 0; quality = Math.max(.5, quality - .17); } } }
    info = { W, H, quality, msaa, quads: room.quads, ent: S.n / 72, parts: NP2[0] + NP2[1] };
  }
  /* rectangle à l'écran (px CSS) d'un article, pour y poser son bouton */
  function itemRect(it) {
    const P0 = PROPS[it.prop]; if (!P0 || !cam.PV) return null;
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    corners(itemBase(it), P0.box).forEach(p => { const s = project(p[0], p[1], p[2]); if (!s) return; x0 = Math.min(x0, s.x); x1 = Math.max(x1, s.x); y0 = Math.min(y0, s.y); y1 = Math.max(y1, s.y); });
    return x1 > x0 ? { x0, y0, x1, y1 } : null;
  }
  return { frame, layout, itemRect, project, head: () => headAt && project(headAt[0], headAt[1], headAt[2]), info: () => Object.assign({ d: +view.d.toFixed(2) }, info) };
}

/* ================= Police du jeu (glyphes lus dans les planches officielles, voir mc.js) ================= */
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
const flat = s => String(s).replace(/[  ]/g, ' ').trim();
function pxText(el) {
  const txt = el.textContent.trim();
  el.textContent = '';
  if (el.dataset.fs) el.style.setProperty('--fs', el.dataset.fs + 'px');
  el.appendChild(h('span', { class: 'sr', text: txt }));
  flat(txt).split(' ').filter(Boolean).forEach(w => el.appendChild(pxWord(w)));
}
function pxLabel(el, text, fs, hide) {
  text = flat(text); if (el.dataset.pxl === text) return el;
  el.dataset.pxl = text; el.textContent = '';
  const box = h('span', { class: 'pxl', 'aria-hidden': 'true' }); if (fs) box.style.setProperty('--fs', fs + 'px');
  text.split(' ').filter(Boolean).forEach(w => box.appendChild(pxWord(w)));
  if (!hide) el.append(h('span', { class: 'sr', text })); el.append(box); el.classList.add('pxl-host');
  return el;
}

/* ================= Icônes ================= */
function art(rows, pal) {
  const c = mk(rows[0].length, rows.length), g = c.getContext('2d');
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (pal[r[x]]) { g.fillStyle = pal[r[x]]; g.fillRect(x, y, 1, 1); } });
  return c;
}
/* la pièce de Braise, en grand : disque de braise, flamme claire au centre */
const COIN_ROWS = ['................', '.....rrrrrr.....', '...rrOOOOOOrr...', '..rOOhhOOOOOOr..', '..rOhhOOyOOOOr..', '.rOOhOOyYyOOOOr.', '.rOOOOyYYyOOOOr.', '.rOOOyYYYYyOOOr.',
  '.rOOOyYYYYyOOOr.', '.rOOOOyYYyOOOdr.', '.rOOOOOyyOOOddr.', '..rOOOOOOOOddr..', '..rOOOOOOOdddr..', '...rrOOOdddrr...', '.....rrrrrr.....', '................'];
const COIN_PAL = { r: '#6e1d08', O: '#e2541a', h: '#ff9a52', d: '#b13a10', y: '#ffb347', Y: '#ffe6a6' };
const ICONS = {};
function coinIcon() { return ICONS.coin || (ICONS.coin = art(COIN_ROWS, COIN_PAL)); }
function icon(name, IMG) {
  if (name === 'coin') return coinIcon();
  if (ICONS[name]) return ICONS[name];
  const c = mk(16, 16);
  if (MC.items[name] !== undefined && IMG.items) c.getContext('2d').drawImage(IMG.items, 0, MC.items[name] * 16, 16, 16, 0, 0, 16, 16);
  return ICONS[name] = c;
}
const copy = c => { const o = mk(c.width, c.height); o.getContext('2d').drawImage(c, 0, 0); return o; };

/* ================= La page ================= */
const S = CFG.shop || {}, LIST = (S.products || []).filter(p => p && p.id), INGAME = S.inGame || [];
const eur = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const nb = n => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const stage = $('#stage'), canvas = $('#tavern'), etal = $('#etal'), dealBox = $('#deal'), say = $('#say'), topBar = $('#top');
const IMG = {};
const loadImg = src => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error('image ' + src)); i.src = src; });
const deskMQ = matchMedia('(min-width: 900px) and (min-height: 600px)');
let eng = null, desk = deskMQ.matches, tall = false;
const items = LIST.map(p => ({ id: p.id, prop: PROPS[p.prop] ? p.prop : p.kind === 'don' ? 'jar' : 'heap', p, pos: [0, 1.0625, 2], ry: 0, hl: 0, btn: null }));

/* ---------- l'étal : un bouton par article, posé sur l'objet 3D ---------- */
function priceLine(p) { return p.kind === 'don' ? h('span', null, 'Don · ' + eur.format(p.price)) : h('span', null, nb(p.braises), h('span', { class: 'tag-b', text: ' Braises' }), ' · ' + eur.format(p.price)); }
function ariaOf(p) { return p.kind === 'don' ? p.name + ' : don sans contrepartie, ' + eur.format(p.price) + ' ou plus' : p.name + ' : ' + nb(p.braises) + ' Braises, ' + eur.format(p.price); }
function buildEtal() {
  etal.textContent = '';
  items.forEach(it => {
    const tag = h('span', { class: 'tag', 'aria-hidden': 'true' }, pxLabel(h('span', { class: 'tag-n' }), it.p.short || it.p.name, 2, true), h('span', { class: 'tag-p' }, priceLine(it.p)));
    const b = h('button', { class: 'loot', type: 'button', 'aria-label': ariaOf(it.p), 'aria-pressed': 'false', 'aria-controls': 'deal', 'data-id': it.id, 'data-prop': it.prop }, h('span', { class: 'loot-ic', 'aria-hidden': 'true' }, copy(coinIcon())), tag);
    b.addEventListener('pointerenter', () => hover(it.id, true));
    b.addEventListener('pointerleave', () => hover(it.id, false));
    b.addEventListener('focus', () => hover(it.id, true));
    b.addEventListener('blur', () => hover(it.id, false));
    b.addEventListener('click', () => pick(it.id));
    it.btn = b; etal.appendChild(b);
  });
}
function placeItems() {
  const floor = items.filter(it => it.prop !== 'jar'), jars = items.filter(it => it.prop === 'jar'), Y = 1.0625;
  const WIDE = [[-2.05, 1.95, .25], [-.7, 2.45, -.1], [.72, 2.3, .2], [2.15, 1.9, -.35]], TALL = [[-1, 1.75, .2], [1, 1.7, -.2], [-1.05, 3.25, .1], [1.1, 3.3, -.25]];
  // en portrait, les deux plus hauts objets vont au fond (sinon le coffre cache la bourse), dans l'ordre des prix
  const slot = new Map(floor.map((it, i) => [it, i]));
  if (tall && floor.length === 4) {
    const hgt = it => -PROPS[it.prop].box[1], back = floor.slice().sort((a, b) => hgt(b) - hgt(a)).slice(0, 2);
    const order = floor.filter(it => back.includes(it)).concat(floor.filter(it => !back.includes(it)));
    order.forEach((it, i) => slot.set(it, i));
  }
  floor.forEach((it, i0) => {
    const i = slot.get(it);
    let s = (tall ? TALL : WIDE)[i];
    if (!s || floor.length > 4) s = tall ? [(i % 2 ? 1.4 : -1.4), 1.8 + (i >> 1) * 1.9, (i % 2 ? -.2 : .2)] : [lerp(-3.8, 3.8, floor.length > 1 ? i / (floor.length - 1) : .5), 2.6 + (i % 2) * .4, 0];
    it.pos = [s[0], Y, s[1]]; it.ry = s[2];
    if (it.btn) it.btn.dataset.row = tall && s[1] < 2.6 ? 'back' : 'front';
  });
  // le tronc de soutien, sur le comptoir à gauche de l'écran (à droite, le coffre et le panneau des prix le serraient),
  // tourné en miroir de sa première place (-1 + 0,5 du modèle) : on voit toujours la pièce dans sa fente de face
  jars.forEach((it, i) => { it.pos = [-(tall ? 1.7 : 2.05) + i * .7, COUNTER_TOP, -.45]; it.ry = -1; });
}

/* ---------- la zone libre de l'interface : la caméra s'y cadre ---------- */
function safeRect() {
  const W = stage.clientWidth || innerWidth, H = stage.clientHeight || innerHeight;
  if (desk) {
    const sr = stage.getBoundingClientRect(), rr = el => el ? el.getBoundingClientRect() : null;
    const intro = rr($('.intro')), deal = rr(dealBox), slate = rr($('.slate')), fine = rr($('.fine')), foot = rr($('.foot')), top = rr($('.top'));
    const l = Math.max(intro ? intro.right : 0, deal ? deal.right : 0) + 24 - sr.left, r = Math.min(slate ? slate.left : W, fine ? fine.left : W) - 24 - sr.left;
    // en bas, la scène s'arrête à 76 px du bord : le pied de page (une ligne, ~30 px) et, au-dessus, la place des
    // étiquettes qui pendent sous les articles. Cadrée jusqu'au haut du pied, elle y envoyait les prix
    const t = (top ? top.bottom : 60) + 62 - sr.top, b = Math.min(foot ? foot.top : H, sr.bottom - 76) - 16 - sr.top;
    return { x0: l / W * 2 - 1, x1: r / W * 2 - 1, y0: 1 - b / H * 2, y1: 1 - t / H * 2 };
  }
  return { x0: -1 + 28 / W, x1: 1 - 28 / W, y0: -1 + 120 / H, y1: 1 - 110 / H };
}
/* sur ordinateur, si des panneaux se chevauchent encore (très petite fenêtre), on resserre */
function tighten() {
  root.classList.remove('tv-tight');
  if (!desk) return;
  const r = s => { const e = $(s); return e ? e.getBoundingClientRect() : null; }, hit = (a, b) => a && b && a.bottom > b.top;
  const foot = r('.foot p');                                       // le texte du pied de page, pas son dégradé
  if (hit(r('.intro'), r('.deal')) || hit(r('.slate'), r('.fine')) || hit(r('.deal'), foot) || hit(r('.fine'), foot)) root.classList.add('tv-tight');
}
let restag = true;
function stagger() {
  restag = false;
  etal.classList.remove('stagger', 'compact');
  const clash = () => {
    const fl = items.filter(it => it.btn && it.prop !== 'jar' && it.btn.dataset.row !== 'back').map(it => {
      const b = it.btn.getBoundingClientRect(), w = it.btn.querySelector('.tag').offsetWidth, c = (b.left + b.right) / 2;
      return { it, x0: c - w / 2, x1: c + w / 2 };
    }).sort((a, b) => a.x0 - b.x0);
    let hit = false;
    fl.forEach((f, i) => { f.it.btn.toggleAttribute('data-alt', i % 2 === 1); if (i && f.x0 < fl[i - 1].x1 + 4) hit = true; });
    return hit;
  };
  // d'abord sans le prix (il reste dans le panneau et dans le nom du bouton), puis en quinconce
  if (clash()) { etal.classList.add('compact'); if (clash()) etal.classList.add('stagger'); }
}
function relayout() {
  restag = true;
  desk = deskMQ.matches;
  tighten();
  const W = stage.clientWidth, H = stage.clientHeight; if (!W || !H) return;
  tall = W / H < 1.05;
  placeItems();
  if (eng) eng.layout(items, safeRect(), tall);
}

/* ---------- le panneau de l'article ---------- */
const checkout = p => p.url || S.checkoutUrl || '';
let shown = undefined;
function deal(id) {
  if (id === shown) return; shown = id;
  const it = items.find(x => x.id === id), p = it && it.p;
  dealBox.textContent = '';
  if (!p) {
    dealBox.append(h('h2', { class: 'deal-t', id: 'deal-name', text: 'Le comptoir' }),
      h('p', { class: 'deal-lore', text: "Choisis ce qui est posé devant le comptoir. On paie ici en euros, on reçoit des Braises, et on les dépense en jeu, au comptoir du tavernier." }));
    if (desk) tighten();
    return;
  }
  const url = checkout(p);
  const buy = url ? pxLabel(h('a', { class: 'btn btn-main', href: url, rel: 'noopener' }), p.kind === 'don' ? 'Donner' : 'Acheter')
    : pxLabel(h('button', { class: 'btn btn-locked', type: 'button', disabled: '' }), 'Bientôt');
  dealBox.append(
    h('div', { class: 'deal-head' }, h('span', { class: 'deal-ic', 'aria-hidden': 'true' }, copy(coinIcon())), h('h2', { class: 'deal-t', id: 'deal-name', text: p.name })),
    h('p', { class: 'deal-q' }, p.kind === 'don' ? h('b', { text: 'Sans contrepartie' }) : h('b', { text: nb(p.braises) + ' Braises' }), h('span', { class: 'deal-p', text: eur.format(p.price) + (p.kind === 'don' ? ' ou plus' : '') })),
    h('p', { class: 'deal-lore', text: p.lore || '' }),
    h('div', { class: 'deal-buy' }, buy, h('span', { class: 'deal-note', text: url ? 'Paiement chez notre partenaire.' : "Paiement à l'ouverture du serveur." })));
  if (desk) tighten();
}

/* ---------- l'ardoise : ce qu'on obtient en jeu ---------- */
function slate() {
  const ul = $('#slate'); if (!ul) return;
  ul.textContent = '';
  INGAME.forEach(g => ul.appendChild(h('li', null, h('span', { class: 's-ic', 'aria-hidden': 'true' }, copy(icon(g.icon || 'name_tag', IMG))),
    h('span', { class: 's-n' }, h('span', { text: g.name }), g.lore ? h('small', { text: g.lore }) : null),
    h('span', { class: 's-p' }, nb(g.braises), h('span', { class: 'sr', text: ' Braises' }), copy(coinIcon())))));
}

/* ---------- humeur du tavernier ---------- */
const MOODS = ['idle', 'angry', 'threat'], FORCED = MOODS.indexOf(QS.get('mood')) >= 0 ? QS.get('mood') : null;
const LINES = Object.assign({ idle: ['Tu prends quoi ?'], threat: ['On touche avec les yeux.'], angry: ['Pas touche !'], don: ['Un don ? Merci.'] }, KEEPER && KEEPER.lines || {});
let hoverId = null, selId = null, angryUntil = -1, nextBurst = 0, mood = 'idle', moodT0 = 0, now0 = 0, sayUntil = 0, sayN = { idle: 0, threat: 0, angry: 0, don: 0 }, nextIdleSay = 6;
/* le tronc de soutien ne fâche pas le tavernier : il le regarde, et remercie */
const isDon = id => { const it = id && items.find(x => x.id === id); return !!(it && it.p.kind === 'don'); };
function hover(id, on) {
  if (on) { if (hoverId !== id && isDon(id) && mood === 'idle' && !FORCED && !SHOT) speak('don', now0); hoverId = id; } else if (hoverId === id) hoverId = null;
  deal(hoverId || selId);
}
function pick(id) {
  selId = selId === id ? null : id;
  items.forEach(it => it.btn && it.btn.setAttribute('aria-pressed', it.id === selId ? 'true' : 'false'));
  deal(hoverId || selId);
  if (!FORCED && !isDon(id)) angryUntil = now0 + 2.3;
  else if (isDon(id) && selId === id && mood === 'idle' && !SHOT) speak('don', now0);
  nextBurst = now0 + 9 + Math.random() * 6;
}
function speak(m, t) {
  const L = LINES[m] || []; if (!L.length || !say) return;
  pxLabel(say, L[sayN[m]++ % L.length], 2, true);
  say.classList.add('on'); sayUntil = t + 3.2; nextIdleSay = Math.max(nextIdleSay, t + 9);   // une réplique à la fois
}
function moodTick(t) {
  if (!FORCED && !REDUCE && !SHOT && t > nextBurst && mood === 'idle' && !hoverId) { angryUntil = t + 1.7; nextBurst = t + 8 + Math.random() * 7; }
  const m = FORCED || (t < angryUntil ? 'angry' : hoverId && !isDon(hoverId) ? 'threat' : 'idle');
  if (m !== mood) { mood = m; moodT0 = t; speak(m === 'idle' && isDon(hoverId) ? 'don' : m, t); if (m === 'idle') nextBurst = Math.max(nextBurst, t + 8 + Math.random() * 7); }
  if (mood === 'idle' && t > nextIdleSay && !SHOT) { speak('idle', t); nextIdleSay = t + 11 + Math.random() * 6; }
  if (say && t > sayUntil && say.classList.contains('on')) say.classList.remove('on');
}

/* ---------- pointeur ---------- */
let cx = null, cy = null, parX = 0, parY = 0;
if (matchMedia('(pointer: fine)').matches) addEventListener('pointermove', e => { const r = stage.getBoundingClientRect(); cx = e.clientX - r.left; cy = e.clientY - r.top; }, { passive: true });
addEventListener('keydown', e => { if (e.key === 'Escape' && selId) pick(selId); });

/* ---------- une image : moteur, boutons, bulle ---------- */
function step(t, dt, since) {
  now0 = t;
  moodTick(t);
  const W = stage.clientWidth, H = stage.clientHeight;
  items.forEach(it => { const on = it.id === hoverId || it.id === selId ? 1 : 0; it.hl = dt === undefined ? on : it.hl + (on - it.hl) * (1 - Math.exp(-(dt || .016) * 10)); if (Math.abs(on - it.hl) < .01) it.hl = on; });
  // regard : vers l'article survolé, sinon vers le curseur, sinon vers le client
  let look = { x: 0, y: .1 };
  const hd = eng && eng.head();
  const target = hoverId || selId ? items.find(x => x.id === (hoverId || selId)) : null;
  if (hd && target && target.btn) { const r = eng.itemRect(target); if (r) look = { x: clamp(((r.x0 + r.x1) / 2 - hd.x) / (W * .35), -1, 1), y: clamp(((r.y0 + r.y1) / 2 - hd.y) / (H * .45), -1, 1) }; }
  else if (hd && cx !== null && !REDUCE) look = { x: clamp((cx - hd.x) / (W * .4), -1, 1), y: clamp((cy - hd.y) / (H * .5), -1, 1) };
  if (cx !== null && !REDUCE && !SHOT) { parX += ((cx / W - .5) * 2 - parX) * .04; parY += ((cy / H - .5) * 2 - parY) * .04; }
  const sn = since !== undefined ? since : t - moodT0;
  const rage = mood === 'angry' ? Math.max(0, 1 - Math.abs((sn % 2.4) - .55) * 1.6) * .55 : mood === 'threat' ? .12 : 0;
  if (eng) eng.frame(REDUCE ? 20 : t, { mood, since: sn, look, hover: hoverId, now: t, par: { x: parX, y: parY }, dt: dt, rage: REDUCE ? 0 : rage });
  // boutons posés sur les objets
  items.forEach(it => {
    if (!eng || !it.btn) return;
    const r = eng.itemRect(it); if (!r) return;
    let w = r.x1 - r.x0, hh = r.y1 - r.y0, x = r.x0, y = r.y0;
    if (w < 44) { x -= (44 - w) / 2; w = 44; } if (hh < 44) { y -= (44 - hh) / 2; hh = 44; }
    const k = Math.round(x) + ',' + Math.round(y) + ',' + Math.round(w) + ',' + Math.round(hh);
    if (it.btn.dataset.k !== k) { it.btn.dataset.k = k; it.btn.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)'; it.btn.style.width = Math.round(w) + 'px'; it.btn.style.height = Math.round(hh) + 'px'; }
    it.btn.classList.toggle('on', it.hl > .5);
  });
  if (restag && eng) stagger();
  /* la bulle vit hors de la scène, au premier plan : dedans, elle passait sous l'en-tête, dont le fondu noir masquait le
     haut du texte quand la tête du tavernier montait près du bord de la fenêtre (et la scène la coupait). Sur ordinateur,
     elle reste entière dans la fenêtre et descend sous l'en-tête si elle devait passer sur ses boutons ; sur mobile, la
     page défile sous l'en-tête : elle suit la scène, sous l'en-tête comme le reste */
  if (say && hd) {
    const box = say.firstElementChild, bw = box ? box.offsetWidth : 0, bh = box ? box.offsetHeight : 0;
    const x = bw ? clamp(hd.x, bw / 2 + 8, Math.max(bw / 2 + 8, W - bw / 2 - 8)) : hd.x;
    const sr = stage.getBoundingClientRect(), pr = say.offsetParent ? say.offsetParent.getBoundingClientRect() : sr;
    let minTop = -Infinity;
    if (desk) {
      const l = sr.left + x - bw / 2, r = l + bw;
      minTop = topBar && Array.from(topBar.children).some(c => { const q = c.getBoundingClientRect(); return l < q.right + 8 && r > q.left - 8; }) ? topBar.getBoundingClientRect().bottom + 6 : 8;
    }
    const y = Math.max(hd.y, minTop - sr.top + 12 + bh);      // 12 = de la pointe au bas de la bulle
    say.style.transform = 'translate(' + Math.round(sr.left - pr.left + hd.x) + 'px,' + Math.round(sr.top - pr.top + y) + 'px)'; say.style.setProperty('--dx', Math.round(x - hd.x) + 'px');
  }
  root.dataset.mood = mood;
}

function start() {
  $$('.top .tbtn').forEach(b => pxLabel(b, b.textContent));
  $$('.px').forEach(pxText);
  root.style.setProperty('--lock', 'url(' + art(['..kkkk..', '.k....k.', '.k....k.', 'kkkkkkkk', 'kyyyyyyk', 'kyyddyyk', 'kyyddyyk', 'kyyyyyyk', 'kkkkkkkk'], { k: '#1c1410', y: '#d9a521', d: '#4a3210' }).toDataURL() + ')');
  if (S.checkoutUrl) { const st = $('#shop-state'); if (st) st.textContent = 'Taverne ouverte. Paiement sécurisé chez notre partenaire.'; }
  buildEtal(); deal(null); slate();
  if (!QS.has('nogl') && IMG.blocks) {
    try { eng = Engine(canvas, IMG, { still: SHOT }); } catch (e) { eng = null; if (window.console) console.error(e); }
  }
  root.classList.add(eng ? 'gl' : 'no-gl');
  relayout();
  addEventListener('resize', relayout);
  if (deskMQ.addEventListener) deskMQ.addEventListener('change', relayout);
  if ('ResizeObserver' in window) new ResizeObserver(relayout).observe(stage);
  if (D.fonts && D.fonts.ready) D.fonts.ready.then(relayout);
  root.classList.add('ready');
  if (SHOT) { root.classList.add('shot'); $$('.loader').forEach(l => l.remove()); }
  if (!eng) return;
  if (SHOT) {                                                // image figée et reproductible, pour les captures
    const sel = QS.get('sel'), T = +(QS.get('t') || 6), m = FORCED || 'idle';
    const since = QS.has('since') ? +QS.get('since') : { idle: 3, threat: 1.3, angry: .56 }[m];
    if (sel && items.some(x => x.id === sel)) { selId = sel; deal(sel); if (m === 'threat') hoverId = sel; items.forEach(x => x.btn.setAttribute('aria-pressed', x.id === sel ? 'true' : 'false')); }
    const shoot = () => { relayout(); for (let i = 0; i <= 90; i++) { const tt = T - 3 + i / 30; step(tt, 1 / 30, since - 3 + i / 30); } if (say) { speak(m, T); say.classList.add('on'); step(T, 0, since); } };
    shoot(); addEventListener('resize', shoot);
    if (QS.get('y')) scrollTo(0, +QS.get('y'));
    D.title = 'ready ' + JSON.stringify(eng.info());
    return;
  }
  if (QS.has('fps')) {                                      // mesure du coût par image (JavaScript seul) et de la cadence
    const box = h('pre', { class: 'fps' }); D.body.appendChild(box);
    const times = [], t0 = performance.now(); let n = 0, prev = t0;
    const tick = ms => { const a = performance.now(); step(ms / 1000, clamp((ms - prev) / 1000, 0, .05)); prev = ms; const d = performance.now() - a; times.push(d); n++;
      const el = (performance.now() - t0) / 1000; if (el < 20) requestAnimationFrame(tick);
      if (n % 15 === 0) { const s = times.slice(-600).sort((x, y) => x - y); box.textContent = 'fps ' + (n / el).toFixed(1) + ' | js médiane ' + s[s.length >> 1].toFixed(2) + ' ms | p95 ' + s[Math.floor(s.length * .95)].toFixed(2) + ' ms | ' + JSON.stringify(eng.info()); } };
    requestAnimationFrame(tick); return;
  }
  let last = 0;
  const loop = ms => {
    requestAnimationFrame(loop);
    const t = ms / 1000, raw = t - last;
    if (raw < .012 || D.hidden) return;                    // inutile de dépasser ~80 images par seconde
    last = t;
    step(t, Math.min(raw, .05));
  };
  requestAnimationFrame(loop);
}
Promise.all([loadImg('assets/mc/blocks.png'), loadImg('assets/mc/items.png').catch(() => null), loadImg('assets/mc/chest.png').catch(() => null)])
  .then(a => { IMG.blocks = a[0]; IMG.items = a[1]; IMG.chest = a[2]; start(); })
  .catch(e => { if (window.console) console.error(e); start(); });
})();
