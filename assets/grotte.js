/* The Last — la grotte sous le lac (page d'accueil, sous la coupe de lave) : le portail inachevé.
   Moteur WebGL2 autonome, adapté de tavern.js : voxels aux textures du jeu, lumière propagée case par case sur quatre
   canaux (0 lanternes et feu, 1 lave, 2 obsidienne pleureuse et portail, 3 âmes), occlusion ambiante, créatures en
   boîtes au format du jeu, blocs « fantômes » en pointillés, particules, halo.
   Le décor vient de cave.js (window.GROTTE) ; la feuille de route, la date d'ouverture et le reste de config.js.
   Chaque objet a un rôle : le portail = la feuille de route (une étape et sa date au survol), le panneau = l'ouverture,
   le piglin = les nouvelles du chantier, les lanternes = les questions, la ligne = remonter au launcher.
   Tout le contenu existe aussi en HTML ordinaire (sans 3D, sur téléphone, pour les lecteurs d'écran).
   Essais : index.html?shot=1&at=grotte&dy=<px> (image figée) &hl=<n° d'étape> &panel=faq|news &bare=1 (la 3D seule,
   pour refaire grotte-poster.jpg) ; ?nogl=1 (sans 3D). */
(() => {
'use strict';

const MC = window.MC || { blocks: {}, items: {}, font: {} }, G = window.GROTTE, CFG = window.THE_LAST || {};
if (!G) return;
const D = document, root = D.documentElement;
const $ = (s, r) => (r || D).querySelector(s);
const QS = new URLSearchParams(location.search), SHOT = QS.has('shot');
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v, lerp = (a, b, t) => a + (b - a) * t;
function rng(seed) {
  let a = seed >>> 0;
  return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function makeNoise(seed) {
  const R = rng(seed), N = 256, tab = new Float32Array(N * N);
  for (let i = 0; i < tab.length; i++) tab[i] = R();
  return (x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = tab[((y0 & 255) << 8) | (x0 & 255)], b = tab[((y0 & 255) << 8) | ((x0 + 1) & 255)], c = tab[(((y0 + 1) & 255) << 8) | (x0 & 255)], d = tab[(((y0 + 1) & 255) << 8) | ((x0 + 1) & 255)];
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  };
}
function mk(w, hh) { const c = D.createElement('canvas'); c.width = w; c.height = hh; return c; }

/* ================= Matrices (rangées par colonnes) ================= */
function mmul(a, b) {
  const o = new Float32Array(16);
  for (let c = 0; c < 4; c++) for (let r = 0; r < 4; r++) o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
  return o;
}
function persp(fovy, asp, n, f) { const t = 1 / Math.tan(fovy / 2), o = new Float32Array(16); o[0] = t / asp; o[5] = t; o[10] = (f + n) / (n - f); o[11] = -1; o[14] = 2 * f * n / (n - f); return o; }
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
const C16 = new Float32Array([1 / 16, 0, 0, 0, 0, -1 / 16, 0, 0, 0, 0, -1 / 16, 0, 0, 1.5, 0, 1]);   // repère des créatures du jeu -> monde (pieds à y = 0)

/* ================= Blocs ================= */
const BL = [null], ID = {};
function def(name, tex, o) {
  const b = Object.assign({ id: BL.length, name, light: 0, ch: 0, emit: 0, cut: false }, o || {});
  const t = typeof tex === 'string' ? [tex, tex, tex] : tex;       // dessus, dessous, côtés
  b.t = t.map(n => MC.blocks[n] || [0, 1]);
  BL.push(b); ID[name] = b.id;
}
def('blackstone', ['blackstone_top', 'blackstone_top', 'blackstone']);
def('polished', 'polished_blackstone');
def('pbb', 'polished_blackstone_bricks');
def('cpbb', 'cracked_polished_blackstone_bricks');
def('chiseled', 'chiseled_polished_blackstone');
def('gilded', 'gilded_blackstone');
def('basalt', ['basalt_top', 'basalt_top', 'basalt_side']);
def('pbasalt', ['polished_basalt_top', 'polished_basalt_top', 'polished_basalt_side']);
def('sbasalt', 'smooth_basalt');
def('netherrack', 'netherrack');
def('soul_sand', 'soul_sand');
def('soul_soil', 'soul_soil');
def('bedrock', 'bedrock');
def('obsidian', 'obsidian');
def('crying', 'crying_obsidian', { light: 10, ch: 2, emit: .3 });
def('nbricks', 'nether_bricks');
def('rnbricks', 'red_nether_bricks');
def('cnbricks', 'chiseled_nether_bricks');
def('crnbricks', 'cracked_nether_bricks');
def('cplanks', 'crimson_planks');
def('cstem', ['crimson_stem_top', 'crimson_stem_top', 'crimson_stem']);
def('scstem', ['stripped_crimson_stem_top', 'stripped_crimson_stem_top', 'stripped_crimson_stem']);
def('bone', ['bone_block_top', 'bone_block_top', 'bone_block_side']);
def('gold', 'gold_block');
def('rawgold', 'raw_gold_block');
def('gore', 'nether_gold_ore');
def('quartz', 'nether_quartz_ore');
def('debris', ['ancient_debris_top', 'ancient_debris_top', 'ancient_debris_side']);
def('wart', 'nether_wart_block');
def('nylium', ['crimson_nylium', 'netherrack', 'crimson_nylium_side']);
def('magma', 'magma', { light: 6, ch: 1, emit: .5 });
def('lava', 'lava_still', { light: 15, ch: 1, emit: 1 });
def('lavafall', 'lava_flow', { light: 15, ch: 1, emit: .85 });
def('glowstone', 'glowstone', { light: 14, emit: 1 });
def('shroom', 'shroomlight', { light: 14, emit: 1 });
def('bars', 'iron_bars', { cut: true });
def('scaffold', ['scaffolding_top', 'scaffolding_bottom', 'scaffolding_side'], { cut: true });
def('portal', 'nether_portal', { light: 11, ch: 2, emit: .9, cut: true });
def('lake', 'lava_still', { lake: true });               // le lac, au-dessus de la croûte : seule sa face sur la vitre est dessinée

/* ================= Le décor ================= */
const S0 = G.size || { x0: -36, x1: 35, y1: 43, z0: -40, z1: 19 };
const OX = -S0.x0, OZ = -S0.z0, WX = S0.x1 - S0.x0 + 1, WY = S0.y1 + 1, WZ = S0.z1 - S0.z0 + 1;
const FACES = [
  [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
  [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]]
];
const CORN = [[-1, -1], [1, -1], [1, 1], [-1, 1]], AOF = [1, .8, .62, .46];
const blv = l => { const f = l / 15; return f / (4 - 3 * f); };

function buildRoom(data) {
  const N = WX * WY * WZ, vox = new Uint8Array(N), lit = [0, 1, 2, 3].map(() => new Uint8Array(N)), R = rng(G.seed || 2026);
  const inb = (x, y, z) => x >= -OX && x < WX - OX && y >= 0 && y < WY && z >= -OZ && z < WZ - OZ;
  const ix = (x, y, z) => (y * WZ + (z + OZ)) * WX + (x + OX);
  const getId = (x, y, z) => inb(x, y, z) ? vox[ix(x, y, z)] : 0;
  const solid = (x, y, z) => { const id = getId(x, y, z); return id !== 0 && !BL[id].cut; };
  const boxes = [], quads = [], lights = [], ghosts = [], ents = [], emitters = [], anchors = {}, picks = [];
  const q = (p, tex, uv, o) => quads.push({ p, tex, uv: uv || [0, 0, 16, 16], o: o || {} });
  const xf = (o, p) => {                                     // rotation facultative d'un point autour d'un pivot (o.rx, o.ry, o.pivot)
    if (!o || (!o.rx && !o.ry && !o.rz)) return p;
    const c = o.pivot || [0, 0, 0]; let x = p[0] - c[0], y = p[1] - c[1], z = p[2] - c[2];
    if (o.rx) { const cs = Math.cos(o.rx), sn = Math.sin(o.rx), y2 = y * cs - z * sn, z2 = y * sn + z * cs; y = y2; z = z2; }
    if (o.rz) { const cs = Math.cos(o.rz), sn = Math.sin(o.rz), x2 = x * cs - y * sn, y2 = x * sn + y * cs; x = x2; y = y2; }
    if (o.ry) { const cs = Math.cos(o.ry), sn = Math.sin(o.ry), x2 = x * cs + z * sn, z2 = -x * sn + z * cs; x = x2; z = z2; }
    return [x + c[0], y + c[1], z + c[2]];
  };
  const a = {
    R, noise: makeNoise((G.seed || 2026) + 7), noise2: makeNoise((G.seed || 2026) + 19),
    set(x, y, z, n) { if (inb(x, y, z)) vox[ix(x, y, z)] = n ? ID[n] || 0 : 0; },
    get(x, y, z) { const id = getId(x, y, z); return id ? BL[id].name : null; },
    fill(x0, y0, z0, x1, y1, z1, n) {
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
        const v = typeof n === 'function' ? n(x, y, z) : n; if (v !== undefined) a.set(x, y, z, v);
      }
    },
    /* boîte libre (coordonnées décimales) ; la texture suit la grille des blocs ; tex : nom ou [dessus, dessous, côtés] */
    box(x0, y0, z0, x1, y1, z1, tex, o) { boxes.push({ a: [x0, y0, z0], b: [x1, y1, z1], tex, o: o || {} }); },
    /* deux plans croisés : feu, lianes, toile ; o.s = taille (1 = un bloc), centrés dans la case */
    cross(x, y, z, tex, o) {
      o = o || {}; const s = o.s || 1, cx = x + .5, cz = z + .5, hs = s / 2, y1 = y + s;
      [[-1, -1, 1, 1], [-1, 1, 1, -1]].forEach(d => q([[cx + d[0] * hs, y1, cz + d[1] * hs], [cx + d[2] * hs, y1, cz + d[3] * hs], [cx + d[2] * hs, y, cz + d[3] * hs], [cx + d[0] * hs, y, cz + d[1] * hs]], tex, null, o));
      if (o.light) a.light(x, y, z, o.light, o.ch || 0);
    },
    /* un plan seul (panneau, page) : 4 coins dans l'ordre haut-gauche, haut-droit, bas-droit, bas-gauche */
    plane(p, tex, uv, o) { q(p, tex, uv, o); },
    light(x, y, z, l, ch) { lights.push([Math.floor(x), Math.floor(y), Math.floor(z), l, ch || 0]); },
    /* boîte aux faces texturées comme les modèles de blocs du jeu (uv en texels 0..16).
       f : { up: [tex, uv], down, n (face -z), s (+z), e (+x), w (-x) } ; une entrée « side » vaut pour les quatre côtés.
       o : { emit, rx, ry, rz, pivot } */
    mbox(x0, y0, z0, x1, y1, z1, f, o) {
      o = o || {}; const g = k => f[k] || f.side, P = p => xf(o, p);
      const F = (k, pts) => { const e = g(k); if (e) q(pts.map(P), e[0], e[1], o); };
      F('up', [[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]]);
      F('down', [[x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0]]);
      F('n', [[x1, y1, z0], [x0, y1, z0], [x0, y0, z0], [x1, y0, z0]]);
      F('s', [[x0, y1, z1], [x1, y1, z1], [x1, y0, z1], [x0, y0, z1]]);
      F('w', [[x0, y1, z0], [x0, y1, z1], [x0, y0, z1], [x0, y0, z0]]);
      F('e', [[x1, y1, z1], [x1, y1, z0], [x1, y0, z0], [x1, y0, z1]]);
    },
    /* lanterne du jeu, avec sa chaîne jusqu'à top (hauteur du plafond) */
    lantern(cx, by, cz, tex, hanging, l, ch, top) {
      const s = 1 / 16, X = v => cx - .5 + v * s, Y = v => by + v * s, Z = v => cz - .5 + v * s, o = { emit: 1 }, y0 = hanging ? 1 : 0;
      a.mbox(X(5), Y(y0), Z(5), X(11), Y(y0 + 7), Z(11), { up: [tex, [0, 9, 6, 15]], down: [tex, [0, 9, 6, 15]], side: [tex, [0, 2, 6, 9]] }, o);
      a.mbox(X(6), Y(y0 + 7), Z(6), X(10), Y(y0 + 9), Z(10), { up: [tex, [1, 10, 5, 14]], down: [tex, [1, 10, 5, 14]], side: [tex, [1, 0, 5, 2]] }, o);
      const c45 = Math.SQRT1_2, rot = (u, w) => [cx + (u - 8) * s * c45 - (w - 8) * s * c45, cz + (u - 8) * s * c45 + (w - 8) * s * c45];
      const plane = (u0, w0, u1, w1, ya, yb, uv) => { const p = rot(u0, w0), r = rot(u1, w1); q([[p[0], Y(yb), p[1]], [r[0], Y(yb), r[1]], [r[0], Y(ya), r[1]], [p[0], Y(ya), p[1]]], tex, uv, o); };
      if (hanging) { plane(6.5, 8, 9.5, 8, 11, 15, [11, 1, 14, 5]); plane(8, 6.5, 8, 9.5, 10, 16, [11, 6, 14, 12]); }
      else { plane(6.5, 8, 9.5, 8, 9, 11, [11, 1, 14, 3]); plane(8, 6.5, 8, 9.5, 9, 11, [11, 10, 14, 12]); }
      if (hanging) a.chain(cx, by + 1, cz, top);
      a.light(cx, by + .3, cz, l, ch);
    },
    /* chaîne verticale de y0 à y1 */
    chain(cx, y0, cz, y1) {
      const s = 1 / 16, c45 = Math.SQRT1_2, rot = (u, w) => [cx + (u - 8) * s * c45 - (w - 8) * s * c45, cz + (u - 8) * s * c45 + (w - 8) * s * c45];
      for (let y = y0; y < y1; y += 1) {
        const top = Math.min(y1, y + 1), v0 = 16 - (top - y) * 16;
        const p1 = rot(6.5, 8), p2 = rot(9.5, 8), p3 = rot(8, 6.5), p4 = rot(8, 9.5);
        q([[p1[0], top, p1[1]], [p2[0], top, p2[1]], [p2[0], y, p2[1]], [p1[0], y, p1[1]]], 'iron_chain', [0, v0, 3, 16], {});
        q([[p3[0], top, p3[1]], [p4[0], top, p4[1]], [p4[0], y, p4[1]], [p3[0], y, p3[1]]], 'iron_chain', [3, v0, 6, 16], {});
      }
    },
    /* bloc manquant, en pointillés (o.step : son étape ; o.live : étape en cours, ses pointillés battent) */
    ghost(x, y, z, o) { ghosts.push({ p: [x, y, z], o: o || {} }); },
    /* bloc qu'on peut viser (survol, toucher) : il renvoie id */
    pick(x, y, z, id) { picks.push({ p: [x, y, z], id }); },
    /* créature posée : { kind: 'skeleton' | 'piglin' | 'strider', at: [x, y, z], ry, pose: { partie: [rx, ry, rz] }, s } */
    ent(e) { ents.push(e); },
    /* source de particules : kind 'drip' (goutte de lave), 'cry' (larme violette), 'soul' (âme bleue), 'ember', 'mote' (violet flottant) */
    emit(kind, at, rate, spread) { emitters.push({ kind, at, rate, spread: spread || [0, 0, 0], acc: 0 }); },
    /* point repère pour l'interface (texte du panneau, infobulle…) */
    anchor(id, x, y, z) { anchors[id] = [x, y, z]; }
  };
  const info = G.build(a, data) || {};
  /* la vitre : rien ne se propage devant elle ; les faces de coupe (face avant des blocs z = CZ) prennent la lueur du lac */
  const CUT = info.cut || null, CZ = CUT ? CUT.z : 1e9;

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
      const go = j => { const id = vox[j]; if (L[j] < l && (!id || BL[id].cut || BL[id].light) && ((j / WX) | 0) % WZ - OZ <= CZ) { L[j] = l; qu[qt++] = j; } };
      if (x > 0) go(i - 1); if (x < WX - 1) go(i + 1);
      if (z > 0) go(i - WX); if (z < WZ - 1) go(i + WX);
      if (y > 0) go(i - SY); if (y < WY - 1) go(i + SY);
    }
  }
  const lv = (c, x, y, z) => inb(x, y, z) ? lit[c][ix(x, y, z)] : 0;

  /* maillage : position, uv, couche, nb d'images, 4 canaux de lumière, ombrage, émission */
  const ST = 13; let cap = 1 << 20, buf = new Float32Array(cap), n = 0, nq = 0; const flips = [];
  const push = (x, y, z, u, v, t, l, sh, e) => {
    if (n + ST > cap) { cap *= 2; const nb = new Float32Array(cap); nb.set(buf); buf = nb; }
    buf[n++] = x; buf[n++] = y; buf[n++] = z; buf[n++] = u; buf[n++] = v; buf[n++] = t[0]; buf[n++] = t[1];
    buf[n++] = l[0]; buf[n++] = l[1]; buf[n++] = l[2]; buf[n++] = l[3]; buf[n++] = sh; buf[n++] = e;
  };
  const dirShade = Nn => Nn[1] > .5 ? 1 : Nn[1] < -.5 ? .55 : Math.abs(Nn[2]) > .5 ? .84 : .68;
  for (let y = 0; y < WY; y++) for (let z = -OZ; z < WZ - OZ; z++) for (let x = -OX; x < WX - OX; x++) {
    const id = vox[ix(x, y, z)]; if (!id) continue;
    const b = BL[id];
    for (let f = 0; f < 6; f++) {
      const F = FACES[f], Nn = F[0], U = F[1], V = F[2], bx = x + Nn[0], by = y + Nn[1], bz = z + Nn[2];
      if (!inb(bx, by, bz)) continue;
      const nid = vox[ix(bx, by, bz)];
      if (nid && (!BL[nid].cut || nid === id)) continue;
      const onGlass = f === 2 && z === CZ;
      if (b.lake && !onGlass) continue;                     // le lac n'a qu'une face : sur la vitre
      const t = b.t[f === 0 ? 0 : f === 1 ? 1 : 2], ao4 = [], ds = onGlass ? (b.lake ? 1 : .84 * .7) : dirShade(Nn);
      const glow = onGlass && !b.lake ? blv(clamp(13 - ((CUT.lake[x] || 13) - y - 1) * 1.3, 0, 15)) : 0;
      for (let k = 0; k < 4; k++) {
        const su = CORN[k][0], sv = CORN[k][1];
        const ax = bx + su * U[0], ay = by + su * U[1], az = bz + su * U[2], cx2 = bx + sv * V[0], cy2 = by + sv * V[1], cz2 = bz + sv * V[2];
        const s1 = solid(ax, ay, az), s2 = solid(cx2, cy2, cz2);
        const dx = bx + su * U[0] + sv * V[0], dy = by + su * U[1] + sv * V[1], dz = bz + su * U[2] + sv * V[2], sc = solid(dx, dy, dz);
        const ao = s1 && s2 ? 3 : (s1 ? 1 : 0) + (s2 ? 1 : 0) + (sc ? 1 : 0);
        const L4 = [onGlass && !b.lake ? .1 : 0, onGlass ? glow : 0, 0, 0];    // faces de coupe : la chaleur du lac, et un peu de jour
        if (!onGlass) for (let c = 0; c < 4; c++) {
          let sum = lv(c, bx, by, bz), cnt = 1;
          if (!s1) { sum += lv(c, ax, ay, az); cnt++; }
          if (!s2) { sum += lv(c, cx2, cy2, cz2); cnt++; }
          if (!sc && !(s1 && s2)) { sum += lv(c, dx, dy, dz); cnt++; }
          L4[c] = blv(sum / cnt);
        }
        push(x + .5 + (Nn[0] + su * U[0] + sv * V[0]) / 2, y + .5 + (Nn[1] + su * U[1] + sv * V[1]) / 2, z + .5 + (Nn[2] + su * U[2] + sv * V[2]) / 2,
          (su + 1) / 2, (1 - sv) / 2, t, L4, AOF[ao] * ds, b.lake ? (y === CUT.lake[x] ? -2 : -1) : b.emit);    // émission -1 : le shader dessine la lave du lac ; -2 : sa rangée du fond
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
    const both = Math.abs(ny) < .5 && uv[2] - uv[0] < 16.01 && !qd.o.oneSide && qd.o.both !== false;
    const Nn = both ? [0, 0, 0] : [nx, ny, nz], ds = both ? .9 : dirShade([nx, ny, nz]);
    const UV = [[uv[0], uv[1]], [uv[2], uv[1]], [uv[2], uv[3]], [uv[0], uv[3]]];
    for (let k = 0; k < 4; k++) push(p[k][0], p[k][1], p[k][2], UV[k][0] / 16, UV[k][1] / 16, t, cornerLight(p[k], c0, Nn), ds, e);
    flips.push(0); nq++;
  });
  const idxs = new Uint32Array(nq * 6);
  for (let i = 0; i < nq; i++) { const o = i * 4, k = i * 6; if (flips[i]) { idxs[k] = o + 1; idxs[k + 1] = o + 2; idxs[k + 2] = o + 3; idxs[k + 3] = o + 1; idxs[k + 4] = o + 3; idxs[k + 5] = o; } else { idxs[k] = o; idxs[k + 1] = o + 1; idxs[k + 2] = o + 2; idxs[k + 3] = o; idxs[k + 4] = o + 2; idxs[k + 5] = o + 3; } }
  return { verts: buf.subarray(0, n), idxs, quads: nq, ghosts, ents, emitters, anchors, picks, info, cutZ: CZ,
    light: (x, y, z) => { const X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z); return [0, 1, 2, 3].map(c => blv(lv(c, X, Y, Z))); } };
}

/* ================= Modèles des créatures (boîtes et découpes de texture du jeu) ================= */
const SKELETON = [
  { n: 'head', p: [0, 0, 0], b: [{ o: [-4, -8, -4], s: [8, 8, 8], uv: [0, 0] }] },
  { n: 'body', p: [0, 0, 0], b: [{ o: [-4, 0, -2], s: [8, 12, 4], uv: [16, 16] }] },
  { n: 'armR', p: [-5, 2, 0], b: [{ o: [-1, -2, -1], s: [2, 12, 2], uv: [40, 16] }] },
  { n: 'armL', p: [5, 2, 0], b: [{ o: [-1, -2, -1], s: [2, 12, 2], uv: [40, 16], mir: 1 }] },
  { n: 'legR', p: [-2, 12, 0], b: [{ o: [-1, 0, -1], s: [2, 12, 2], uv: [0, 16] }] },
  { n: 'legL', p: [2, 12, 0], b: [{ o: [-1, 0, -1], s: [2, 12, 2], uv: [0, 16], mir: 1 }] }
];
const PIGLIN = [
  { n: 'head', p: [0, 0, 0], b: [{ o: [-5, -8, -4], s: [10, 8, 8], uv: [0, 0] }, { o: [-2, -4, -5], s: [4, 4, 1], uv: [31, 1] }, { o: [2, -2, -5], s: [1, 2, 1], uv: [2, 4] }, { o: [-3, -2, -5], s: [1, 2, 1], uv: [2, 0] }],
    c: [{ n: 'earL', p: [4.5, -6, 0], r: [0, 0, -.5236], b: [{ o: [0, 0, -2], s: [1, 5, 4], uv: [51, 6] }] }, { n: 'earR', p: [-4.5, -6, 0], r: [0, 0, .5236], b: [{ o: [-1, 0, -2], s: [1, 5, 4], uv: [39, 6] }] }] },
  { n: 'body', p: [0, 0, 0], b: [{ o: [-4, 0, -2], s: [8, 12, 4], uv: [16, 16] }] },
  { n: 'armR', p: [-5, 2, 0], b: [{ o: [-3, -2, -2], s: [4, 12, 4], uv: [40, 16] }] },
  { n: 'armL', p: [5, 2, 0], b: [{ o: [-1, -2, -2], s: [4, 12, 4], uv: [32, 48] }] },
  { n: 'legR', p: [-1.9, 12, 0], b: [{ o: [-2, 0, -2], s: [4, 12, 4], uv: [0, 16] }] },
  { n: 'legL', p: [1.9, 12, 0], b: [{ o: [-2, 0, -2], s: [4, 12, 4], uv: [16, 48] }] }
];
const STRIDER = [
  { n: 'body', p: [0, 1, 0], b: [{ o: [-8, -6, -8], s: [16, 14, 16], uv: [0, 0] }],
    c: [{ n: 'b1', p: [-8, 4, -8], r: [0, 0, -1.2217], b: [{ o: [-12, 0, 0], s: [12, 0, 16], uv: [16, 65] }] }, { n: 'b2', p: [-8, -1, -8], r: [0, 0, -1.1345], b: [{ o: [-12, 0, 0], s: [12, 0, 16], uv: [16, 49] }] },
      { n: 'b3', p: [-8, -5, -8], r: [0, 0, -.8727], b: [{ o: [-12, 0, 0], s: [12, 0, 16], uv: [16, 33] }] }, { n: 'b4', p: [8, -6, -8], r: [0, 0, .8727], b: [{ o: [0, 0, 0], s: [12, 0, 16], uv: [16, 33], mir: 1 }] },
      { n: 'b5', p: [8, -2, -8], r: [0, 0, 1.1345], b: [{ o: [0, 0, 0], s: [12, 0, 16], uv: [16, 49], mir: 1 }] }, { n: 'b6', p: [8, 3, -8], r: [0, 0, 1.2217], b: [{ o: [0, 0, 0], s: [12, 0, 16], uv: [16, 65], mir: 1 }] }] },
  { n: 'legR', p: [-4, 8, 0], b: [{ o: [-2, 0, -2], s: [4, 16, 4], uv: [0, 32] }] },
  { n: 'legL', p: [4, 8, 0], b: [{ o: [-2, 0, -2], s: [4, 16, 4], uv: [0, 55] }] }
];
const MODELS = { skeleton: [SKELETON, 64, 32, 'skeleton'], piglin: [PIGLIN, 64, 64, 'piglin'], strider: [STRIDER, 64, 128, 'strider'] };

/* Sortie des modèles : position, uv (-1 = boîte unie), lumière rgb + émission, teinte rgb : 12 flottants par sommet. */
function Sink() {
  const S = { f: new Float32Array(12 * 6 * 4096), n: 0 };
  S.quad = (P, a, b, c, d, uv, cen, lit, tint, e) => {
    if (S.n + 72 > S.f.length) { const nf = new Float32Array(S.f.length * 2); nf.set(S.f); S.f = nf; }
    const A = P[a], B = P[b], C = P[d];
    const ax = B[0] - A[0], ay = B[1] - A[1], az = B[2] - A[2], bx = C[0] - A[0], by = C[1] - A[1], bz = C[2] - A[2];
    let nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    const fx = (P[a][0] + P[c][0]) / 2 - cen[0], fy = (P[a][1] + P[c][1]) / 2 - cen[1], fz = (P[a][2] + P[c][2]) / 2 - cen[2];
    if (nx * fx + ny * fy + nz * fz < 0) { nx = -nx; ny = -ny; nz = -nz; }
    const L = lit(nx, ny, nz), qq = [a, b, c, a, c, d], f = S.f;
    for (let i = 0; i < 6; i++) {
      const p = P[qq[i]], k = i === 0 || i === 3 ? 0 : i === 1 ? 1 : i === 2 || i === 4 ? 2 : 3;
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
  Q(4, 5, 1, 0, u + dz, v, u + dz + dx, v + dz);
  Q(3, 2, 6, 7, u + dz + dx, v + dz, u + dz + dx + dx, v);
  const R0 = [u, v + dz, u + dz, v + dz + dy], L0 = [u + dz + dx, v + dz, u + dz + dx + dz, v + dz + dy];
  const r = mir ? L0 : R0, l = mir ? R0 : L0;
  Q(4, 0, 3, 7, r[0], r[1], r[2], r[3]);
  Q(0, 1, 2, 3, u + dz, v + dz, u + dz + dx, v + dz + dy);
  Q(1, 5, 6, 2, l[0], l[1], l[2], l[3]);
  Q(5, 4, 7, 6, u + dz + dx + dz, v + dz, u + dz + dx + dz + dx, v + dz + dy);
}
function model(parts, tw, th, base, pose, S, lit, glow, marks) {
  const walk = (part, parent) => {
    const r = (pose && pose[part.n]) || part.r || Z3;
    let m = mmul(parent, trans(part.p[0], part.p[1], part.p[2]));
    if (r[2]) m = mmul(m, rotZ(r[2])); if (r[1]) m = mmul(m, rotY(r[1])); if (r[0]) m = mmul(m, rotX(r[0]));
    const M = mmul(base, m);
    if (part.b) for (let i = 0; i < part.b.length; i++) boxQ(M, part.b[i], tw, th, S, lit, glow);
    if (marks && marks[part.n]) marks[part.n].forEach(k => { k.out = tp(M, k.at[0], k.at[1], k.at[2]); });
    if (part.c) for (let i = 0; i < part.c.length; i++) walk(part.c[i], m);
  };
  for (let i = 0; i < parts.length; i++) walk(parts[i], IDENT);
}

/* ================= Shaders ================= */
const HEAD = '#version 300 es\nprecision highp float; precision highp sampler2DArray; precision highp sampler2D;\n';
const FOG = `
uniform vec3 uCam, uFog; uniform float uFogD, uFogOff;
vec3 fogged(vec3 col, vec3 pos, out float f) { float d = max(0., length(pos - uCam) - uFogOff); f = 1. - exp(-pow(d * uFogD, 1.6)); return mix(col, uFog, f); }`;
/* La lave du lac, vue à travers la vitre : la même formule que la coupe de world.js (LAVAFN et FS_FLAT), mêmes texels, même
   bruit, même horloge. w = (x, uLakeW.x - y) vaut, à l'endroit où la grotte entre dans la page, les coordonnées de texture de
   la coupe : la lave de l'accueil et celle du lac se raccordent au pixel près. Échantillonnage au niveau 0 (agrandissement),
   pour pouvoir l'appeler dans une branche. */
const LAVAFN = `
uniform sampler2D uNoise; uniform float uLava, uLavaN; uniform vec2 uLakeW;
vec4 lavaAt(vec2 w, float fw) {
  float f0 = mod(floor(uTime * 20.), uLavaN);
  vec3 a = textureLod(uTex, vec3(w, uLava + f0), 0.).rgb;
  vec2 q = mix((floor(w * 16.) + .5) / 16., w, clamp(fw - .9, 0., 1.));
  float h1 = textureLod(uNoise, q * .0125 + uTime * vec2(.0019, .0012), 0.).r, h2 = textureLod(uNoise, q * .046 - uTime * vec2(.0038, .0016), 0.).r;
  float heat = h1 * .62 + h2 * .38;
  float vein = step(abs(heat - .5), .028) * clamp(1.7 - fw * .45, 0., 1.);
  vec3 col = a * mix(.86, 1.14, smoothstep(.22, .78, heat)) + vec3(1., .78, .34) * vein * .42;
  return vec4(col, .06 + vein * .32);
}`;
const VS_WORLD = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec2 aUv; layout(location=2) in vec2 aTex; layout(location=3) in vec4 aL; layout(location=4) in vec2 aS;
uniform mat4 uPV; out vec3 vPos; centroid out vec2 vUv; flat out vec2 vTex; out vec4 vL; out vec2 vS;
void main() { vPos = aPos; vUv = aUv; vTex = aTex; vL = aL; vS = aS; gl_Position = uPV * vec4(aPos, 1.); }`;
const FS_WORLD = HEAD + `
uniform sampler2DArray uTex; uniform float uTime, uExp; uniform vec3 uAmb, uC0, uC1, uC2, uC3; uniform vec4 uK;
in vec3 vPos; centroid in vec2 vUv; flat in vec2 vTex; in vec4 vL; in vec2 vS; out vec4 o;
${FOG}
${LAVAFN}
void main() {
  vec2 lw = vec2(vPos.x, uLakeW.x - vPos.y); float lfw = max(fwidth(lw.x), fwidth(lw.y)) * 16.;
  if (vS.y < -.5) {                                       // le lac : la coupe de lave de l'accueil, assombrie avec la profondeur
    vec4 lc = lavaAt(lw, lfw); float depth = clamp(lw.y * uLakeW.y, 0., 1.);
    float lip = vS.y < -1.5 ? exp(-fract(vPos.y) * 3.2) : 0.;   // au fond du lac, la lave brûle contre la croûte (comme à la surface)
    o = vec4(lc.rgb * mix(vec3(1.), vec3(.5, .24, .15), smoothstep(.1, 1., depth)) + vec3(1., .62, .25) * lip * .55, lc.a * .25 * (1. - depth) + lip * .35);
    return;
  }
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
  vec3 col = fogged(c.rgb * vTint * mix(vLit.rgb * uExp, vec3(1.15), clamp(e, 0., 1.)), vPos, f);
  o = vec4(col, clamp(e, 0., 1.) * (1. - f) * .85);
}`;
const VS_PART = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec4 aCol; uniform mat4 uPV; out vec4 vCol;
void main() { vCol = aCol; gl_Position = uPV * vec4(aPos, 1.); }`;
const FS_PART = HEAD + `in vec4 vCol; out vec4 o; void main() { o = vec4(vCol.rgb * vCol.a, vCol.a); }`;
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
uniform sampler2D uScene, uB1, uB2, uB3; uniform float uBloom, uVig; uniform vec3 uScr; in vec2 vUv; out vec4 o;
void main() {
  vec3 c = texture(uScene, vUv).rgb;
  vec3 b = texture(uB1, vUv).rgb * .5 + texture(uB2, vUv).rgb * .8 + texture(uB3, vUv).rgb * 1.15;
  c += b * uBloom;
  c = c * (1. + c * .12) / (1. + c * .32) * 1.12;
  float sy = (uScr.x + (1. - vUv.y) * uScr.y) / uScr.z;   // vignette de l'écran (comme world.js), pas du canevas qui défile
  vec2 q = vec2(vUv.x - .5, .5 - sy); c *= 1. - dot(q, q) * uVig;
  c = pow(c, vec3(.96, 1., 1.04));
  o = vec4(c, 1.);
}`;

/* ================= Le moteur ================= */
const AMB0 = [.07, .05, .07], LC0 = [[1.45, .98, .6], [1.6, .58, .2], [.95, .38, 1.35], [.3, .82, 1.08]];
function Engine(canvas, imgs, opts) {
  opts = opts || {};
  const AMB = G.amb || AMB0, LC = G.lights || LC0, FOGC = G.fog || [.035, .02, .04];
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
  const P = { world: prog(VS_WORLD, FS_WORLD), ent: prog(VS_ENT, FS_ENT), part: prog(VS_PART, FS_PART), bright: prog(VS_QUAD, FS_BRIGHT), blur: prog(VS_QUAD, FS_BLUR), fin: prog(VS_QUAD, FS_FINAL) };

  const layers = imgs.blocks.height / 16, c2 = mk(16, imgs.blocks.height), g2 = c2.getContext('2d', { willReadFrequently: true }); g2.drawImage(imgs.blocks, 0, 0);
  const texArr = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D_ARRAY, texArr);
  gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, 16, 16, layers, 0, gl.RGBA, gl.UNSIGNED_BYTE, g2.getImageData(0, 0, 16, imgs.blocks.height).data);
  gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  const tex2d = im => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im); [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]].forEach(p => gl.texParameteri(gl.TEXTURE_2D, p[0], p[1])); return t; };
  const skins = {}; ['skeleton', 'piglin', 'strider'].forEach(k => { if (imgs[k]) skins[k] = tex2d(imgs[k]); });
  const white = tex2d(mk(1, 1));
  const nd = new Uint8Array(256 * 256);
  { const R = rng(3), lat = new Float32Array(256); for (let i = 0; i < 256; i++) lat[i] = R();
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) { const gx = x / 16, gy = y / 16, x0 = gx | 0, y0 = gy | 0, fx = gx - x0, fy = gy - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), x1 = (x0 + 1) & 15, y1 = (y0 + 1) & 15;
      const v = (lat[y0 * 16 + x0] * (1 - sx) + lat[y0 * 16 + x1] * sx) * (1 - sy) + (lat[y1 * 16 + x0] * (1 - sx) + lat[y1 * 16 + x1] * sx) * sy; nd[y * 256 + x] = clamp((v - .5) * 1.7 + .5, 0, 1) * 255; } }
  const texNoise = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texNoise); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 256, 256, 0, gl.RED, gl.UNSIGNED_BYTE, nd);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  const room = buildRoom(opts.data);
  const vaoRoom = gl.createVertexArray(); gl.bindVertexArray(vaoRoom);
  { const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, room.verts, gl.STATIC_DRAW);
    [[0, 3, 0], [1, 2, 12], [2, 2, 20], [3, 4, 28], [4, 2, 44]].forEach(a => { gl.enableVertexAttribArray(a[0]); gl.vertexAttribPointer(a[0], a[1], gl.FLOAT, false, 52, a[2]); });
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, room.idxs, gl.STATIC_DRAW); }
  const nIdx = room.idxs.length; room.verts = null;
  const dyn = (attrs, stride) => { const vao = gl.createVertexArray(), b = gl.createBuffer(); gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, b); attrs.forEach(a => { gl.enableVertexAttribArray(a[0]); gl.vertexAttribPointer(a[0], a[1], gl.FLOAT, false, stride, a[2]); }); return { vao, b, cap: 0 }; };
  const DE = dyn([[0, 3, 0], [1, 2, 12], [2, 4, 20], [3, 3, 36]], 48), DP = dyn([[0, 3, 0], [1, 4, 12]], 28);
  const upload = (d, arr, n) => { gl.bindVertexArray(d.vao); gl.bindBuffer(gl.ARRAY_BUFFER, d.b); if (n > d.cap) { d.cap = Math.max(n, d.cap * 2, 4096); gl.bufferData(gl.ARRAY_BUFFER, d.cap * 4, gl.DYNAMIC_DRAW); } if (n) gl.bufferSubData(gl.ARRAY_BUFFER, 0, arr.subarray(0, n)); };
  const vaoQuad = gl.createVertexArray(); gl.bindVertexArray(vaoQuad);
  { const qb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, qb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0); }
  gl.bindVertexArray(null);

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
  /* éclairage d'une créature : la lumière du lieu, les faces orientées comme en jeu, un liseré de lave venu d'en haut */
  const litFn = (base, top) => (nx, ny, nz) => {
    const s = .62 * nx * nx + .82 * nz * nz + (ny > 0 ? 1 : .5) * ny * ny + .12 * Math.max(0, nz), rl = Math.max(0, ny) * .35 * top * KT[1];
    return [base[0] * s + LC[1][0] * rl, base[1] * s + LC[1][1] * rl, base[2] * s + LC[1][2] * rl];
  };

  /* blocs manquants : arêtes en pointillés, comme la boîte d'un bloc de structure */
  const SG = Sink();
  /* Les arêtes partagées par deux blocs voisins ne sont tracées qu'une fois. Une arête s'allume si l'un de ses blocs
     appartient à l'étape visée ; celles d'une étape « en cours » battent doucement. */
  const gEdges = new Map();
  room.ghosts.forEach((g, gi) => {
    const x = g.p[0], y = g.p[1], z = g.p[2];
    [[[0, 0, 0], [1, 0, 0]], [[0, 1, 0], [1, 1, 0]], [[0, 0, 1], [1, 0, 1]], [[0, 1, 1], [1, 1, 1]], [[0, 0, 0], [0, 1, 0]], [[1, 0, 0], [1, 1, 0]], [[0, 0, 1], [0, 1, 1]], [[1, 0, 1], [1, 1, 1]],
      [[0, 0, 0], [0, 0, 1]], [[1, 0, 0], [1, 0, 1]], [[0, 1, 0], [0, 1, 1]], [[1, 1, 0], [1, 1, 1]]].forEach(e => {
      const A = [x + e[0][0], y + e[0][1], z + e[0][2]], B = [x + e[1][0], y + e[1][1], z + e[1][2]], k = A.join(',') + '|' + B.join(',');
      const o = gEdges.get(k) || { A, B, back: e[0][2] === 0 && e[1][2] === 0, own: [] }; o.own.push(gi); gEdges.set(k, o);
    });
  });
  const ghostAt = new Set(room.ghosts.map(g => g.p.join(',')));
  const GL = () => [1, .9, .7];
  const segBox = (A, B, th, col, e, S) => {
    const lo = [Math.min(A[0], B[0]) - th / 2, Math.min(A[1], B[1]) - th / 2, Math.min(A[2], B[2]) - th / 2], hi = [Math.max(A[0], B[0]) + th / 2, Math.max(A[1], B[1]) + th / 2, Math.max(A[2], B[2]) + th / 2];
    boxQ(IDENT, { o: lo, s: [hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]], col, e }, 1, 1, S, GL, 1);
  };
  function ghostGeo(t, hl) {
    SG.n = 0;
    const pulse = REDUCE ? .5 : .5 + .5 * Math.sin(t * 3.2);
    gEdges.forEach(E => {
      let on = 0;
      E.own.forEach(gi => { const o = room.ghosts[gi].o; if (hl !== null && o.step === hl) on = 1; else if (o.live) on = Math.max(on, .35 + .45 * pulse); });
      const col = on >= 1 ? [1, .97, .78] : E.back ? [.8, .62, .34] : [1, .84, .46], e = on >= 1 ? 1 : E.back ? .45 : .75 + on * .3, th = on >= 1 ? .06 : .04 + on * .015, p0 = E.A, p1 = E.B;
      const n = 4, d = [p1[0] - p0[0], p1[1] - p0[1], p1[2] - p0[2]], off = REDUCE ? 0 : (t * .25) % (1 / n);
      for (let i = -1; i < n; i++) {                         // une arête : 4 tirets qui glissent lentement
        let a0 = (i + .15) / n + off, a1 = (i + .62) / n + off; a0 = clamp(a0, 0, 1); a1 = clamp(a1, 0, 1); if (a1 - a0 < .01) continue;
        segBox([p0[0] + d[0] * a0, p0[1] + d[1] * a0, p0[2] + d[2] * a0], [p0[0] + d[0] * a1, p0[1] + d[1] * a1, p0[2] + d[2] * a1], th, col, e, SG);
      }
    });
    // les blocs posés de l'étape visée : un contour net, comme le bloc qu'on regarde en jeu
    if (hl !== null) room.picks.forEach(pk => {
      if (pk.id !== hl || ghostAt.has(pk.p.join(','))) return;
      const x = pk.p[0] - .02, y = pk.p[1] - .02, z = pk.p[2] - .02, X = pk.p[0] + 1.02, Y = pk.p[1] + 1.02, Z = pk.p[2] + 1.02;
      [[[x, y, Z], [X, y, Z]], [[x, Y, Z], [X, Y, Z]], [[x, y, Z], [x, Y, Z]], [[X, y, Z], [X, Y, Z]], [[x, y, z], [x, y, Z]], [[X, y, z], [X, y, Z]], [[x, Y, z], [x, Y, Z]], [[X, Y, z], [X, Y, Z]]]
        .forEach(e => segBox(e[0], e[1], .045, [1, .95, .8], .85, SG));
    });
  }

  /* caméra */
  let cam = { eye: [0, 6, 20], at: [0, 6, 0], PV: null, right: [1, 0, 0], up: [0, 1, 0] };
  function project(x, y, z) {
    const m = cam.PV; if (!m) return null;
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (w <= .01) return null;
    return { x: ((m[0] * x + m[4] * y + m[8] * z + m[12]) / w * .5 + .5) * canvas.clientWidth, y: (1 - ((m[1] * x + m[5] * y + m[9] * z + m[13]) / w * .5 + .5)) * canvas.clientHeight };
  }
  /* st.cam = { eye, at, fov, sy, fogOff } : la page pilote la caméra (la vitre, puis le plan du portail) ; sx et sy décalent
     l'image (en coordonnées de l'écran, -1..1) sans changer la perspective */
  function camera(t, st) {
    const asp = W / H, c = st.cam || G.camera(asp, st.k);
    const eye = c.eye, at = c.at;
    const V = look(eye, at), PV = mmul(persp(c.fov || .75, asp, .1, 200), V.m), sx = st.sx || 0, sy = c.sy || 0;
    if (sx || sy) for (let q = 0; q < 4; q++) { PV[q * 4] += sx * PV[q * 4 + 3]; PV[q * 4 + 1] += sy * PV[q * 4 + 3]; }
    cam = { eye, at, PV, right: V.right, up: V.up, fogD: c.fogD || 1 / 44, fogOff: c.fogOff || 0 };
  }

  /* particules */
  const PR = rng(5), NPM = 900, pool = []; let pi = 0;
  for (let i = 0; i < NPM; i++) pool.push({ life: 0 });
  const pdata = new Float32Array(NPM * 6 * 7);
  function spawn(kind, p) {
    const q = pool[pi = (pi + 1) % NPM], j = () => PR() - .5;
    q.k = kind; q.x = p[0]; q.y = p[1]; q.z = p[2]; q.ph = PR() * 6.28;
    if (kind === 'drip') { q.vx = q.vz = 0; q.vy = 0; q.g = 14; q.dr = 0; q.max = 3; q.s0 = q.s1 = .05 + PR() * .03; q.hang = .6 + PR() * 1.4; }
    else if (kind === 'cry') { q.vx = q.vz = 0; q.vy = 0; q.g = 4; q.dr = .6; q.max = 2.4; q.s0 = q.s1 = .04 + PR() * .025; q.hang = .5 + PR() * 1.2; }
    else if (kind === 'soul') { q.vx = j() * .25; q.vz = j() * .25; q.vy = .5 + PR() * .7; q.g = -.1; q.dr = .3; q.max = 1.6 + PR() * 1.8; q.s0 = .05; q.s1 = .02; }
    else if (kind === 'mote') { q.vx = j() * .3; q.vz = j() * .3; q.vy = j() * .3; q.g = 0; q.dr = .2; q.max = 2 + PR() * 2.5; q.s0 = q.s1 = .025 + PR() * .025; }
    else { q.k = 'ember'; q.vx = j() * .4; q.vy = .4 + PR() * .8; q.vz = j() * .4; q.g = -.05; q.dr = .15; q.max = 2.5 + PR() * 3.5; q.s0 = q.s1 = .03 + PR() * .03; }
    q.life = q.max; q.hang = q.hang || 0;
  }
  function particles(t, dt) {
    if (dt > 0) room.emitters.forEach(em => {
      em.acc += em.rate * dt;
      while (em.acc >= 1) { em.acc--; spawn(em.kind, [em.at[0] + (PR() - .5) * em.spread[0], em.at[1] + (PR() - .5) * em.spread[1], em.at[2] + (PR() - .5) * em.spread[2]]); }
    });
    const R = cam.right, U = cam.up; let k = 0;
    for (let i = 0; i < NPM; i++) {
      const q = pool[i]; if (q.life <= 0) continue;
      if (dt > 0) {
        q.life -= dt;
        if (q.hang > 0) q.hang -= dt;                           // la goutte grossit au plafond avant de tomber
        else { const dmp = Math.exp(-q.dr * dt); q.vx *= dmp; q.vy = q.vy * dmp - q.g * dt; q.vz *= dmp; q.x += q.vx * dt + (q.k === 'soul' || q.k === 'mote' ? Math.sin(t * 1.7 + q.ph) * .25 * dt : 0); q.y += q.vy * dt; q.z += q.vz * dt; }
        if ((q.k === 'drip' || q.k === 'cry') && q.y < (G.floorAt ? G.floorAt(q.x, q.z) : 1)) q.life = 0;
      }
      if (q.z > room.cutZ + 1) q.life = 0;                  // devant la vitre : hors de l'aquarium
      if (q.life <= 0) continue;
      const a = q.life / q.max; let r, g, b, al, s = lerp(q.s0, q.s1, 1 - a);
      if (q.k === 'drip') { r = 1; g = .55; b = .14; al = 1; if (q.hang > 0) s *= .5 + .5 * (1 - q.hang / 2); }
      else if (q.k === 'cry') { r = .72; g = .25; b = 1; al = .95; if (q.hang > 0) s *= .5 + .5 * (1 - q.hang / 1.7); }
      else if (q.k === 'soul') { r = .45; g = .9; b = 1; al = Math.min(1, a * 3, (1 - a) * 5) * .9; }
      else if (q.k === 'mote') { r = .7; g = .3; b = 1; al = Math.sin(Math.PI * (1 - a)) * .85; }
      else { r = 1; g = .45 + .25 * Math.sin(t * 9 + q.ph); b = .1; al = Math.min(1, a * 4, (1 - a) * 4) * .85; }
      const ys = q.k === 'drip' || q.k === 'cry' ? (q.hang > 0 ? 1.2 : 2.2) : 1;
      const cs = [[-s, -s * ys], [s, -s * ys], [s, s * ys], [-s, -s * ys], [s, s * ys], [-s, s * ys]];
      for (let j = 0; j < 6; j++) { const c = cs[j]; pdata[k++] = q.x + R[0] * c[0] + U[0] * c[1]; pdata[k++] = q.y + R[1] * c[0] + U[1] * c[1]; pdata[k++] = q.z + R[2] * c[0] + U[2] * c[1]; pdata[k++] = r; pdata[k++] = g; pdata[k++] = b; pdata[k++] = al; }
    }
    upload(DP, pdata, k);
    return k / 7;
  }

  /* une image */
  const S = Sink();
  let last = 0, info = {};
  const pass = (pr, dst, src, set) => { gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.f : null); gl.viewport(0, 0, dst ? dst.w : W, dst ? dst.h : H); gl.useProgram(pr.p); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src); gl.uniform1i(pr.u.uSrc, 0); if (set) set(); gl.bindVertexArray(vaoQuad); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); };
  const common = pr => { gl.useProgram(pr.p); const u = pr.u; if (u.uPV) gl.uniformMatrix4fv(u.uPV, false, cam.PV); if (u.uCam) gl.uniform3fv(u.uCam, cam.eye); if (u.uFog) gl.uniform3fv(u.uFog, FOGC); if (u.uFogD) gl.uniform1f(u.uFogD, cam.fogD); if (u.uFogOff) gl.uniform1f(u.uFogOff, cam.fogOff || 0); if (u.uExp) gl.uniform1f(u.uExp, G.exposure || 1.32); if (u.uTime) gl.uniform1f(u.uTime, last); };
  function frame(t, st) {
    st = st || {};
    resize();
    const dt = st.dt !== undefined ? st.dt : clamp(t - last, 0, .05); last = t;
    const fl = REDUCE ? 0 : 1;
    KT = [1 + .05 * fl * Math.sin(t * 7.3) * Math.sin(t * 3.1), 1 + .06 * fl * Math.sin(t * .9) * Math.sin(t * .37 + 1), 1 + .08 * fl * Math.sin(t * 1.3), 1 + .07 * fl * Math.sin(t * 2.2) * Math.sin(t * 5.1)];
    camera(t, st);
    // créatures, une texture chacune
    S.n = 0; const runs = [];
    room.ents.forEach(e => {
      const M = MODELS[e.kind]; if (!M || !skins[M[3]]) return;
      const pose = typeof e.pose === 'function' ? e.pose(REDUCE ? 0 : t) : e.pose;
      const base = mmul(mmul(mmul(trans(e.at[0], e.at[1], e.at[2]), rotY(e.ry || 0)), e.rx ? rotX(e.rx) : IDENT), mmul(scale(e.s || 1, e.s || 1, e.s || 1), C16));
      const L = lightRGB(e.at[0], e.at[1] + 1, e.at[2]).map(v => v * (e.bright || 1.15) + .03);
      const n0 = S.n; model(M[0], M[1], M[2], base, pose, S, litFn(L, e.top || 0), 1); runs.push([skins[M[3]], n0, S.n]);
    });
    const nEnt = S.n; ghostGeo(t, st.hl === undefined ? null : st.hl);
    if (SG.n) { if (S.n + SG.n > S.f.length) { const nf = new Float32Array((S.n + SG.n) * 2); nf.set(S.f.subarray(0, S.n)); S.f = nf; } S.f.set(SG.f.subarray(0, SG.n), S.n); S.n += SG.n; runs.push([white, nEnt, S.n]); }
    upload(DE, S.f, S.n);
    const np = particles(t, REDUCE ? 0 : dt);

    gl.bindFramebuffer(gl.FRAMEBUFFER, fbScene); gl.viewport(0, 0, W, H);
    gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE); gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.depthMask(true);
    gl.clearColor(FOGC[0], FOGC[1], FOGC[2], 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    common(P.world);
    gl.uniform3fv(P.world.u.uAmb, AMB); gl.uniform3fv(P.world.u.uC0, LC[0]); gl.uniform3fv(P.world.u.uC1, LC[1]); gl.uniform3fv(P.world.u.uC2, LC[2]); gl.uniform3fv(P.world.u.uC3, LC[3]); gl.uniform4fv(P.world.u.uK, KT);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, texArr); gl.uniform1i(P.world.u.uTex, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texNoise); gl.uniform1i(P.world.u.uNoise, 1); gl.activeTexture(gl.TEXTURE0);
    gl.uniform1f(P.world.u.uLava, (MC.blocks.lava_still || [0, 1])[0]); gl.uniform1f(P.world.u.uLavaN, (MC.blocks.lava_still || [0, 1])[1]);
    gl.uniform2fv(P.world.u.uLakeW, st.lake || [0, 0]);
    gl.bindVertexArray(vaoRoom); gl.drawElements(gl.TRIANGLES, nIdx, gl.UNSIGNED_INT, 0);
    common(P.ent); gl.uniform1i(P.ent.u.uSkin, 0); gl.bindVertexArray(DE.vao);
    runs.forEach(r => { if (r[2] > r[1]) { gl.bindTexture(gl.TEXTURE_2D, r[0]); gl.drawArrays(gl.TRIANGLES, r[1] / 12, (r[2] - r[1]) / 12); } });
    if (np) {
      gl.enable(gl.BLEND); gl.depthMask(false); common(P.part); gl.bindVertexArray(DP.vao);
      gl.blendFunc(gl.ONE, gl.ONE); gl.drawArrays(gl.TRIANGLES, 0, np);
      gl.disable(gl.BLEND); gl.depthMask(true);
    }
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
    gl.uniform1f(P.fin.u.uBloom, G.bloom || .95); gl.uniform1f(P.fin.u.uVig, G.vignette || .62);
    const ch = canvas.clientHeight || 1; gl.uniform3fv(P.fin.u.uScr, st.scr || [0, ch, ch]);
    gl.bindVertexArray(vaoQuad); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    gl.activeTexture(gl.TEXTURE0);
    info = { W, H, msaa, quads: room.quads, ents: nEnt / 72, ghosts: SG.n / 72, parts: np / 6, eye: cam.eye.map(v => +v.toFixed(2)) };
  }
  /* la face avant (tournée vers nous) d'un bloc visable, à l'écran */
  const face = p => [project(p[0], p[1], p[2] + 1), project(p[0] + 1, p[1], p[2] + 1), project(p[0] + 1, p[1] + 1, p[2] + 1), project(p[0], p[1] + 1, p[2] + 1)];
  const inQuad = (q, x, y) => {
    let sg = 0;
    for (let i = 0; i < 4; i++) { const a = q[i], b = q[(i + 1) % 4], c = (b.x - a.x) * (y - a.y) - (b.y - a.y) * (x - a.x); if (!c) continue; if (!sg) sg = Math.sign(c); else if (Math.sign(c) !== sg) return false; }
    return true;
  };
  /* l'étape du bloc sous le point (px CSS dans le canevas), ou null */
  function pickAt(x, y) {
    for (const pk of room.picks) { const q = face(pk.p); if (q.every(Boolean) && inQuad(q, x, y)) return pk.id; }
    return null;
  }
  /* le rectangle (px CSS) qui entoure tous les blocs d'une étape */
  function rectOf(id) {
    let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    room.picks.forEach(pk => { if (pk.id !== id) return; face(pk.p).forEach(p => { if (!p) return; x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y); }); });
    return x1 > x0 ? { x0, y0, x1, y1 } : null;
  }
  const lakeMax = room.info.cut ? Math.max(...Object.values(room.info.cut.lake)) : 14;
  return { frame, project, pickAt, rectOf, anchors: room.anchors, lit: !!room.info.lit, lakeMax, glass: G.glass || 1e9, info: () => info };

}

/* ================= Police du jeu ================= */
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
function pxLine(text) { const s = D.createElement('span'); s.className = 'pxl'; text.split(' ').filter(Boolean).forEach(w => s.appendChild(pxWord(w))); return s; }

/* ================= La page ================= */
const sec = $('#grotte');
if (!sec) return;
function h(tag, attrs, ...kids) {
  const e = D.createElement(tag);
  if (attrs) for (const k in attrs) { if (attrs[k] === null || attrs[k] === undefined) continue; if (k === 'class') e.className = attrs[k]; else if (k === 'text') e.textContent = attrs[k]; else e.setAttribute(k, attrs[k]); }
  kids.forEach(c => { if (c) e.appendChild(typeof c === 'string' ? D.createTextNode(c) : c); });
  return e;
}
/* texte en police du jeu ; le texte reste lisible par les lecteurs d'écran */
function pxLabel(el, text) {
  el.textContent = '';
  const box = pxLine(text); box.setAttribute('aria-hidden', 'true');
  el.append(h('span', { class: 'sr', text }), box);
  return el;
}
const stage = $('#g-stage', sec), pinEl = $('.g-pin', sec) || stage, canvas = $('#g-cv', sec), layer = $('#g-layer', sec), docEl = $('.g-doc', sec);
const news = $('#g-news', sec), faq = $('#g-faq', sec), routeOl = $('#route', sec), ouvEl = $('#ouv', sec);
const STEPS = (CFG.roadmap || []).filter(s => s && s.name);
if (SHOT) root.classList.add('g-shot');                     // captures : hauteurs en vh (le navigateur sans tête agrandit la fenêtre juste avant la photo)
/* = « Ordinateur » dans nether.css : la scène occupe l'écran et les panneaux s'ouvrent par-dessus */
const DESK = matchMedia('(min-width: 900px) and (min-height: 560px) and (min-aspect-ratio: 21/20)');
const IMGS = {};
let eng = null, tried = false, overlay = null, panel = null, lastTag = null, hover = null, pinned = null, focusId = null, hlShown = null, shift = 0;

/* ---------- la feuille de route ---------- */
const parseDay = iso => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]) : null; };
const longDate = d => d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
const STATE = {
  fait: { c: 'green', ic: 'obsidian', t: s => { const d = parseDay(s.date); return d ? 'Posé le ' + longDate(d) : 'Posé'; } },
  attente: { c: 'purple', ic: 'crying_obsidian', t: s => { const d = parseDay(s.date); return d ? 'En attente · demandé le ' + longDate(d) : 'En attente'; } },
  encours: { c: 'yellow', t: () => 'En cours' },
  avenir: { c: 'gray', t: () => 'À venir' }
};
const stOf = s => STATE[s.state] || STATE.avenir;
const faces = {};
function face16(name) {
  if (faces[name]) return faces[name];
  const m = MC.blocks[name]; if (!m || !IMGS.blocks) return null;
  const c = mk(16, 16); c.getContext('2d').drawImage(IMGS.blocks, 0, m[0] * 16, 16, 16, 0, 0, 16, 16);
  return faces[name] = c.toDataURL();
}
function route() {
  if (!routeOl || !STEPS.length) return;
  routeOl.textContent = '';
  STEPS.forEach((s, i) => {
    const st = stOf(s), ic = h('span', { class: 'r-ic', 'aria-hidden': 'true' }), f = st.ic && face16(st.ic);
    if (f) ic.style.backgroundImage = 'url(' + f + ')';
    const b = h('button', { class: 'r-b', type: 'button' }, ic, h('span', { class: 'r-n', text: s.name }), h('span', { class: 'r-s', text: st.t(s) }));
    b.addEventListener('focus', () => { focusId = i; });
    b.addEventListener('blur', () => { if (focusId === i) focusId = null; });
    routeOl.appendChild(h('li', { class: 'r-step', 'data-state': STATE[s.state] ? s.state : 'avenir' }, b, s.text ? h('p', { class: 'r-t', text: s.text }) : null));
  });
}

/* ---------- l'ouverture : le panneau du squelette ---------- */
function opening() {
  const L = CFG.launcher || {}, d = L.opening ? new Date(L.opening) : null;
  if (!d || isNaN(d)) return { sign: ['OUVERTURE', 'pas encore', 'de date'], text: 'Pas encore de date. Elle sera annoncée ici, sur ce panneau, et dans le salon #annonces de notre Discord, nulle part ailleurs.' };
  const day = new Date(d.getFullYear(), d.getMonth(), d.getDate()), today = new Date(), t0 = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const days = Math.round((day - t0) / 864e5), ds = longDate(d), short = d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  if (days > 1) return { sign: ['OUVERTURE', short, 'dans ' + days + ' jours'], text: 'Ouverture prévue le ' + ds + ', dans ' + days + ' jours.' };
  if (days === 1) return { sign: ['OUVERTURE', 'demain !'], text: 'Ouverture prévue demain, le ' + ds + '.' };
  if (days === 0) return { sign: ['OUVERTURE', 'aujourd’hui !'], text: 'Ouverture prévue aujourd’hui, le ' + ds + '.' };
  if (L.url) return { sign: ['C’EST', 'OUVERT !'], text: 'Le serveur est ouvert depuis le ' + ds + '. Le launcher se télécharge plus haut.' };
  return { sign: ['OUVERTURE', 'imminente'], text: 'L’ouverture était prévue le ' + ds + ' : elle arrive.' };
}
const OP = opening();
if (ouvEl) ouvEl.textContent = OP.text;

/* ---------- ce qui est posé sur la 3D : le texte du panneau, les étiquettes, l'infobulle ---------- */
const signEl = h('div', { class: 'g-sign', 'aria-hidden': 'true' });
OP.sign.forEach(t => { const l = pxLine(t); l.classList.add('glow'); signEl.appendChild(l); });
const tagNews = pxLabel(h('button', { class: 'g-tag', type: 'button', 'aria-controls': 'g-news' }), 'Le chantier · quoi de neuf ?');
const tagFaq = pxLabel(h('button', { class: 'g-tag', type: 'button', 'aria-controls': 'g-faq' }), 'Questions');
const tagUp = pxLabel(h('a', { class: 'g-tag under', href: '#launcher' }), 'Remonter au launcher ↑');
const tip = h('div', { class: 'g-tip', 'aria-hidden': 'true' });
const cap = h('p', { class: 'g-cap', 'aria-hidden': 'true' }, pxLine('Chaque bloc du portail est une étape du projet. ' + (matchMedia('(hover: hover)').matches ? 'Survole-les.' : 'Touche-les.')));
function fillTip(i) {
  const s = STEPS[i]; tip.textContent = ''; if (!s) return;
  const st = stOf(s), add = (t, c, wrap) => { const p = pxLine(t); p.classList.add('tl', c); if (wrap) p.classList.add('wrap'); tip.appendChild(p); };
  add(s.name, 'white'); add(st.t(s), st.c); if (s.text) add(s.text, 'lore', true);
}

/* ---------- les panneaux : nouvelles et questions ---------- */
const docHome = D.createComment('g-doc');
const panels = [news, faq].filter(Boolean);
panels.forEach(p => {
  const x = h('button', { class: 'g-x', type: 'button', 'aria-label': 'Fermer' }, '×');
  x.addEventListener('click', () => toggle(null));
  p.prepend(x);
  const hd = $('h3', p); if (hd) hd.tabIndex = -1;
});
function toggle(p, from) {
  if (!overlay) { if (p) p.scrollIntoView({ behavior: REDUCE ? 'auto' : 'smooth', block: 'start' }); return; }
  const next = p && p !== panel ? p : null, prev = panel;
  if (prev) { prev.classList.remove('open'); prev.hidden = true; }
  panel = next;
  [tagNews, tagFaq].forEach(t => t.setAttribute('aria-expanded', String(!!next && t.getAttribute('aria-controls') === next.id)));
  if (next) {
    lastTag = from || lastTag; next.hidden = false;
    requestAnimationFrame(() => next.classList.add('open'));
    const hd = $('h3', next); if (hd && !SHOT) hd.focus({ preventScroll: true });
  } else if (lastTag && !SHOT) lastTag.focus({ preventScroll: true });
}
tagNews.addEventListener('click', () => toggle(news, tagNews));
tagFaq.addEventListener('click', () => toggle(faq, tagFaq));
addEventListener('keydown', e => { if (e.key === 'Escape' && panel) toggle(null); });

/* Sur ordinateur, tout le contenu passe dans la scène (panneaux par-dessus, feuille de route lisible au clavier) ;
   sur téléphone ou sans 3D, il reste en dessous, dans le cours de la page. */
function setMode() {
  const ov = !!eng && DESK.matches && !REDUCE;              // « réduire les animations » : le contenu reste dans la page
  if (ov === overlay) return;
  overlay = ov;
  sec.classList.toggle('g-overlay', ov);
  if (panel) { panel.classList.remove('open'); panel = null; }
  if (ov) { if (!docHome.parentNode) docEl.before(docHome); stage.appendChild(docEl); }
  else if (docHome.parentNode) docHome.after(docEl);
  panels.forEach(p => { p.hidden = ov; p.classList.remove('open'); });
  [tagNews, tagFaq].forEach(t => { if (ov) t.setAttribute('aria-expanded', 'false'); else t.removeAttribute('aria-expanded'); });
}

/* ---------- viser un bloc du portail ---------- */
const hlNow = () => focusId !== null ? focusId : hover !== null ? hover : pinned;
const local = e => { const r = canvas.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
stage.addEventListener('pointermove', e => {
  if (!eng || e.pointerType === 'touch') return;
  const p = local(e); hover = e.target === canvas || e.target === layer ? eng.pickAt(p[0], p[1]) : null;
  stage.classList.toggle('aim', hover !== null);
});
stage.addEventListener('pointerleave', () => { hover = null; stage.classList.remove('aim'); });
stage.addEventListener('click', e => {
  if (!eng || (e.target !== canvas && e.target !== layer)) return;
  const p = local(e), id = eng.pickAt(p[0], p[1]);
  pinned = id === pinned ? null : id;
});

/* ---------- la caméra : la vitre, puis le portail ----------
   La lave de l'accueil est vue de face, à travers une vitre d'aquarium, à 16 texels par bloc (48 px, 32 sur téléphone), et
   accrochée à la page. La grotte prend la même vitre : coupée au plan z = G.glass, à la même échelle, la même grille de
   blocs, sous le même angle. 1) Pendant que la scène entre, l'œil reste au centre de l'écran et regarde droit devant : ce
   qui est sur la vitre (lac, croûte) défile avec la page, l'intérieur bouge un peu moins vite (une vraie fenêtre).
   2) Une fois la scène collée, l'œil continue de descendre à la vitesse du défilement, freine, et avance à travers la
   vitre jusqu'au plan du portail (cave.js final()), en levant à peine le regard. */
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const sstep = (a, b, x) => smooth((x - a) / (b - a));
const monde = $('#monde'), lacEl = $('#lac'), abyEl = $('#abysse');
const pageY = () => SHOT ? -(parseFloat(monde && monde.style.marginTop) || 0) : scrollY;
let view = { u: 1 };
function viewNow() {
  const Hs = innerHeight, Hc = stage.clientHeight || Hs, Wc = stage.clientWidth || innerWidth, asp = Wc / Hc;
  const texel = innerWidth < 700 ? 2 : 3, ppb = 16 * texel;          // = nether.js (texel de la coupe de lave)
  const F0 = G.final(asp), fov = F0.fov, d0 = (Hc / 2 / ppb) / Math.tan(fov / 2), ZV = eng.glass;
  const heroPin = lacEl ? Math.max(0, lacEl.offsetHeight - Hs) : 0, abyH = abyEl ? abyEl.offsetHeight : 1;
  const pr = pinEl.getBoundingClientRect(), top0 = pr.top + pageY();   // le haut de la scène dans la page, avant qu'elle se colle
  // le haut du canevas (sur la vitre), choisi pour que la grille des blocs tombe sur celle de la lave de la coupe
  let Ytop = Math.max(Hc / ppb, eng.lakeMax + 1.5);
  const C0 = (top0 - heroPin) / ppb + Ytop; Ytop += Math.ceil(C0 - 1e-6) - C0;
  const C = (top0 - heroPin) / ppb + Ytop, pin = Math.max(1, pinEl.offsetHeight - Hc), fogD = 1 / 44;
  let eye, at, sy, u;
  if (REDUCE || pr.top > 0) {                               // 1) la scène entre (ou reste immobile) : la vitre
    const ec = REDUCE ? Hc / 2 : Hs / 2 - pr.top, y = Ytop - ec / ppb;
    eye = [0, y, ZV + d0]; at = [0, y, ZV + d0 - 10]; sy = 1 - 2 * ec / Hc; u = 0;
  } else {                                                  // 2) collée : on descend, on freine, on traverse la vitre
    u = clamp(-pr.top / pin, 0, 1);
    const y0 = Ytop - Hs / 2 / ppb, yF = F0.eye[1], m0 = pin / ppb, D = y0 - yF;
    let y;
    if (D <= 0) y = y0 + (yF - y0) * smooth(u);
    else { const uE = 2 * D / m0;
      if (uE <= 1) y = u < uE ? yF + D * (1 - u / uE) * (1 - u / uE) : yF;              // décélération constante, partie de la vitesse du défilement
      else { const u2 = u * u, u3 = u2 * u; y = (2 * u3 - 3 * u2 + 1) * y0 - (u3 - 2 * u2 + u) * m0 + (-2 * u3 + 3 * u2) * yF; } }
    const z = (ZV + d0) + (F0.eye[2] - ZV - d0) * smooth(u), tilt = sstep(.4, 1, u);
    eye = [0, y, z];
    const d1 = [F0.at[0], F0.at[1] - y, F0.at[2] - z], l1 = Math.hypot(d1[0], d1[1], d1[2]) || 1;
    const dir = [d1[0] / l1 * tilt, d1[1] / l1 * tilt, -(1 - tilt) + d1[2] / l1 * tilt], ld = Math.hypot(dir[0], dir[1], dir[2]) || 1;
    at = [eye[0] + dir[0] / ld * 10, eye[1] + dir[1] / ld * 10, eye[2] + dir[2] / ld * 10];
    sy = (1 - Hs / Hc) * (1 - sstep(0, .3, u));            // téléphone : l'écran visible est parfois moins haut que la scène
  }
  return { u, cam: { eye, at, fov, sy, fogD, fogOff: Math.max(0, eye[2] - F0.eye[2]) }, lake: [C, ppb / abyH], scr: [stage.getBoundingClientRect().top, Hc, Hs] };
}

/* ---------- une image ---------- */
/* pose un élément sur un repère du décor ; « keep » le garde entier dans la scène (il est centré sur le repère) */
const place = (el, id, keep, dx) => {
  const A = eng.anchors[id], p = A && eng.project(A[0], A[1], A[2]);
  if (!p) { el.style.visibility = 'hidden'; return null; }
  let x = p.x + (dx || 0);
  if (keep) { const w = el.offsetWidth / 2, W = stage.clientWidth; x = clamp(x, w + 6, Math.max(w + 6, W - w - 6)); }
  if (el === signEl) el.style.visibility = ''; el.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(p.y) + 'px)';
  return p;
};
function step(t, dt) {
  if (!eng) return;
  const sr = stage.getBoundingClientRect();
  if (!SHOT && (sr.bottom < 0 || sr.top > innerHeight)) return;
  const hl = hlNow();
  const goal = panel ? -.32 : 0;
  shift = REDUCE ? goal : shift + (goal - shift) * (dt ? 1 - Math.exp(-dt * 7) : 1);
  view = viewNow();
  eng.frame(REDUCE ? 20 : t, { dt, hl, sx: shift, cam: view.cam, lake: view.lake, scr: view.scr });
  // les étiquettes arrivent avec le plan du portail ; avant, elles ne sont ni visibles ni atteignables
  const tk = REDUCE ? 0 : sstep(.7, .92, view.u), tagsOn = tk > .01;
  [tagNews, tagFaq, tagUp, cap].forEach(el => { el.style.opacity = tk.toFixed(3); el.style.visibility = tagsOn ? '' : 'hidden'; el.inert = !tagsOn; });
  const hr = hl !== null ? eng.rectOf(hl) : null;
  if (hl !== hlShown) { hlShown = hl; if (hl !== null) fillTip(hl); }
  tip.classList.toggle('on', !!hr);
  // le panneau : la taille du texte suit celle du bois
  const ps = place(signEl, 'panneau'), A = eng.anchors.panneau;
  if (ps && A) { const q = eng.project(A[0] + 1, A[1], A[2]); if (q) signEl.style.setProperty('--fs', clamp(Math.abs(q.x - ps.x) / 30, 1, 4).toFixed(2) + 'px'); }
  if (tagsOn) { place(tagNews, 'chantier', 1); place(tagFaq, 'questions', 1); place(tagUp, 'ligne', 1); }
  // « Questions » (à gauche) et le chantier (à droite) s'écartent de « Remonter au launcher » (au milieu) s'ils le touchent
  const ru = tagUp.getBoundingClientRect(), apart = (el, id, side) => {
    const r = el.getBoundingClientRect(); if (!ru.width || !r.width || r.bottom < ru.top || r.top > ru.bottom) return;
    const d = side < 0 ? r.right + 8 - ru.left : ru.right + 8 - r.left; if (d > 0 && r.left < ru.right && r.right > ru.left) place(el, id, 1, side * d);
  };
  if (tagsOn) { apart(tagFaq, 'questions', -1); apart(tagNews, 'chantier', 1); }
  if (hr) {
    const r = hr, W = stage.clientWidth, H = stage.clientHeight;
    if (r) {
      const w = tip.offsetWidth, hh = tip.offsetHeight;
      let x = r.x1 + 18, y = (r.y0 + r.y1) / 2 - hh / 2;
      if (x + w > W - 12) x = r.x0 - 18 - w;
      if (x < 12) { x = (r.x0 + r.x1) / 2 - w / 2; y = r.y1 + 14; }       // pas de place à côté (téléphone) : en dessous des blocs
      x = clamp(x, 12, Math.max(12, W - w - 12)); y = clamp(y, 72, Math.max(72, H - hh - 12));
      tip.style.transform = 'translate(' + Math.round(x) + 'px,' + Math.round(y) + 'px)';
    }
  }
}

function create() {
  if (eng || tried) return;
  tried = true;                                             // une seule tentative : si la 3D échoue, on reste sur l'image fixe
  if (QS.has('nogl') || !IMGS.blocks) { sec.classList.add('g-off'); return; }
  const t0 = performance.now();
  try { eng = Engine(canvas, IMGS, { still: SHOT, data: { steps: STEPS } }); } catch (e) { eng = null; if (window.console) console.error(e); }
  sec.dataset.build = Math.round(performance.now() - t0);            // temps de construction de la grotte (ms), pour les essais
  sec.classList.add(eng ? 'g-on' : 'g-off');
  if (!eng) return;
  layer.append(signEl, tagNews, tagFaq, tagUp, cap, tip);
  [tagNews, tagFaq, tagUp, cap].forEach(el => { el.style.visibility = 'hidden'; el.inert = true; });   // ils arrivent avec le plan du portail
  setMode();
  if (DESK.addEventListener) DESK.addEventListener('change', setMode);
}

function start() {
  route();
  if (SHOT) {                                               // image figée : on attend que l'accueil ait posé son défilement simulé
    const T = +(QS.get('t') || 20), hq = QS.get('hl'), pq = QS.get('panel');
    const shoot = () => {
      if (D.title.indexOf('ready') !== 0) { setTimeout(shoot, 40); return; }
      create(); if (!eng) return;
      if (hq !== null && STEPS[+hq]) pinned = +hq;
      if (pq && !panel) toggle(pq === 'faq' ? faq : news, null);
      for (let i = 0; i <= 150; i++) step(T - 5 + i / 30, 1 / 30);
      root.dataset.grotte = 'ready';
      if (QS.has('debug')) { let b = $('#g-dbg'); if (!b) { b = h('pre', { id: 'g-dbg', style: 'position:fixed;left:10px;top:70px;z-index:99;background:#000;color:#0f0;font:15px monospace;padding:6px' }); D.body.appendChild(b); } const pr = pinEl.getBoundingClientRect(); b.textContent = JSON.stringify({ u: +view.u.toFixed(3), prTop: Math.round(pr.top), pinH: pinEl.offsetHeight, Hc: stage.clientHeight, Hs: innerHeight, sy: pageY(), eye: view.cam.eye.map(v => +v.toFixed(2)) }); }
      if (QS.has('bare')) { layer.style.display = 'none'; ['.top', '.depth', '.f3', '.toasts', '#rig'].forEach(q => { const e = $(q); if (e) e.style.display = 'none'; }); }   // l'image de secours (grotte-poster.jpg)
    };
    window.GROTTE_SHOT = shoot;                              // l'accueil nous rappelle après chaque capture (et après l'agrandissement de fenêtre du navigateur sans tête)
    shoot();
    return;
  }
  // la scène se construit pendant un temps mort, ou tout de suite si on arrive déjà près d'elle
  const near = () => sec.getBoundingClientRect().top < innerHeight * 2.5;
  if (near()) create(); else (window.requestIdleCallback || (f => setTimeout(f, 1200)))(create, { timeout: 3000 });
  const tick = (t, dt) => { if (!tried && near()) create(); step(t, Math.min(dt, .05)); };
  window.GROTTE_STEP = (t, dt) => { if (!(tried && !eng)) tick(t, dt); };
  let last = 0;
  const loop = ms => {
    if ((tried && !eng) || window.NETHER_LOOP) return;      // pas de 3D, ou l'accueil mène la danse : notre boucle s'arrête
    requestAnimationFrame(loop);
    const t = ms / 1000, raw = t - last;
    if (raw < .012 || D.hidden) return;
    last = t;
    tick(t, raw);
  };
  requestAnimationFrame(loop);
}
const loadImg = src => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error('image ' + src)); i.src = src; });
Promise.all(['assets/mc/blocks.png', 'assets/mc/skeleton.png', 'assets/mc/piglin.png', 'assets/mc/strider.png'].map(s => loadImg(s).catch(() => null)))
  .then(a => { IMGS.blocks = a[0]; IMGS.skeleton = a[1]; IMGS.piglin = a[2]; IMGS.strider = a[3]; start(); });
})();
