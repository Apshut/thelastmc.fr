/* The Last — moteur 3D du Nether (WebGL2).
   Un petit monde en voxels rendu avec les textures du jeu : île, château, lac de lave, arpenteur et piglin.
   Le château lui-même est décrit dans castle.js (window.NETHER_CASTLE). */
(() => {
'use strict';

const MC = window.MC || { blocks: {}, items: {}, font: {} };
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const LAVA_Y = 0.875;

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
/* Bruit de valeur lisse, 2D, répétable. */
function makeNoise(seed) {
  const R = rng(seed), N = 256, tab = new Float32Array(N * N);
  for (let i = 0; i < tab.length; i++) tab[i] = R();
  return (x, y) => {
    const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
    const a = tab[((y0 & 255) << 8) | (x0 & 255)], b = tab[((y0 & 255) << 8) | ((x0 + 1) & 255)], c = tab[(((y0 + 1) & 255) << 8) | (x0 & 255)], d = tab[(((y0 + 1) & 255) << 8) | ((x0 + 1) & 255)];
    return (a + (b - a) * sx) * (1 - sy) + (c + (d - c) * sx) * sy;
  };
}

/* ---------- Matrices (rangées par colonnes) ---------- */
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

/* ---------- Blocs ---------- */
const BL = [null], ID = {};
function def(name, tex, o) {
  const b = Object.assign({ id: BL.length, name, light: 0, emit: 0, cut: false }, o || {});
  const t = typeof tex === 'string' ? [tex, tex, tex] : tex;      // dessus, dessous, côtés
  b.t = t.map(n => MC.blocks[n] || [0, 1]);
  BL.push(b); ID[name] = b.id;
}
def('blackstone', ['blackstone_top', 'blackstone_top', 'blackstone']);
def('polished', 'polished_blackstone');
def('bricks', 'polished_blackstone_bricks');
def('cracked', 'cracked_polished_blackstone_bricks');
def('chiseled', 'chiseled_polished_blackstone');
def('gilded', 'gilded_blackstone');
def('basalt', ['basalt_top', 'basalt_top', 'basalt_side']);
def('pbasalt', ['polished_basalt_top', 'polished_basalt_top', 'polished_basalt_side']);
def('sbasalt', 'smooth_basalt');
def('gold', 'gold_block');
def('goldglow', 'gold_block', { light: 12, emit: .55 });
def('rawgold', 'raw_gold_block');
def('netherrack', 'netherrack');
def('soul_sand', 'soul_sand');
def('soul_soil', 'soul_soil');
def('bedrock', 'bedrock');
def('glowstone', 'glowstone', { light: 15, emit: 1 });
def('shroomlight', 'shroomlight', { light: 15, emit: 1 });
def('eye', 'shroomlight', { light: 15, emit: 1 });
def('gore', 'nether_gold_ore');
def('quartz', 'nether_quartz_ore');
def('debris', ['ancient_debris_top', 'ancient_debris_top', 'ancient_debris_side']);
def('obsidian', 'obsidian');
def('crying', 'crying_obsidian', { light: 8, emit: .3 });
def('nbricks', 'nether_bricks');
def('rnbricks', 'red_nether_bricks');
def('cnbricks', 'chiseled_nether_bricks');
def('bone', ['bone_block_top', 'bone_block_top', 'bone_block_side']);
def('netherite', 'netherite_block');
def('redwool', 'red_wool');
def('blackwool', 'black_wool');
def('wart', 'nether_wart_block');
def('qblock', 'quartz_block_side');
def('magma', 'magma', { light: 5, emit: .5 });
def('lava', 'lava_still', { light: 15, emit: 1 });
def('lavafall', 'lava_flow', { light: 15, emit: 1 });
def('glass_o', 'orange_stained_glass', { light: 13, emit: .95 });
def('glass_r', 'red_stained_glass', { light: 11, emit: .95 });
def('bars', 'iron_bars', { cut: true });

/* ---------- Le monde en voxels ---------- */
const WX = 168, WY = 72, WZ = 124, OX = 84, OZ = 92;      // x: -84..83, y: 0..71, z: -92..31
const FACES = [                                            // normale, axe U, axe V (V = haut de la texture)
  [[0, 1, 0], [1, 0, 0], [0, 0, -1]], [[0, -1, 0], [1, 0, 0], [0, 0, 1]],
  [[0, 0, 1], [1, 0, 0], [0, 1, 0]], [[0, 0, -1], [-1, 0, 0], [0, 1, 0]],
  [[1, 0, 0], [0, 0, -1], [0, 1, 0]], [[-1, 0, 0], [0, 0, 1], [0, 1, 0]]
];
const CORN = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
const AMB = [.17, .13, .17], BLK = [1.3, .95, .58], LAKE = [.78, .43, .23], AOF = [1, .8, .62, .46];

function buildWorld(lines, seed) {
  const vox = new Uint8Array(WX * WY * WZ), lit = new Uint8Array(WX * WY * WZ);
  const R = rng(seed), noise = makeNoise(seed + 7), noise2 = makeNoise(seed + 19);
  const inb = (x, y, z) => x >= -OX && x < WX - OX && y >= 0 && y < WY && z >= -OZ && z < WZ - OZ;
  const ix = (x, y, z) => (y * WZ + (z + OZ)) * WX + (x + OX);
  const getId = (x, y, z) => inb(x, y, z) ? vox[ix(x, y, z)] : 0;
  const solid = (x, y, z) => { const id = getId(x, y, z); return id !== 0 && !BL[id].cut; };
  const boxes = [], crosses = [], lights = [];
  const pick = n => typeof n === 'function' ? n : Array.isArray(n) ? () => n[R() * n.length | 0] : null;
  const api = {
    rnd: R, noise, lines,
    set(x, y, z, name) { if (inb(x, y, z)) vox[ix(x, y, z)] = name ? (ID[name] || 0) : 0; },
    get(x, y, z) { const id = getId(x, y, z); return id ? BL[id].name : null; },
    fill(x0, y0, z0, x1, y1, z1, name) {
      const f = pick(name);
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let z = Math.min(z0, z1); z <= Math.max(z0, z1); z++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
        const n = f ? f(x, y, z) : name;
        if (n !== undefined) api.set(x, y, z, n);
      }
    },
    clear(x0, y0, z0, x1, y1, z1) { api.fill(x0, y0, z0, x1, y1, z1, null); },
    /* Boîte libre (coordonnées décimales) : dalles, crocs, bannières… La texture suit la grille des blocs. */
    box(x0, y0, z0, x1, y1, z1, tex, o) { boxes.push({ a: [x0, y0, z0], b: [x1, y1, z1], tex, o: o || {} }); },
    /* Deux plans croisés dans une case : feu, chaîne. */
    cross(x, y, z, tex, o) { crosses.push({ p: [x, y, z], tex, o: o || {} }); if (o && o.light) lights.push([x, y, z, o.light]); },
    light(x, y, z, l) { lights.push([Math.floor(x), Math.floor(y), Math.floor(z), l]); },
    fire(x, y, z) { api.cross(x, y, z, 'fire_0', { emit: 1, light: 15 }); }
  };

  /* --- le château (castle.js) puis l'île qui le porte --- */
  const info = window.NETHER_CASTLE(api, { lines }) || {};
  const R2 = rng(seed + 4242);
  const B = Object.assign({ x0: -30, x1: 30, z0: -24, z1: 8, top: 34 }, info.bounds || {});
  const rx = Math.max(-B.x0, B.x1) + 7, zc = (B.z0 + B.z1) / 2 - 1, rz = (B.z1 - B.z0) / 2 + 6;
  const ground = () => { const r = R2(); return r < .5 ? 'blackstone' : r < .66 ? 'basalt' : r < .82 ? 'netherrack' : r < .87 ? 'gilded' : r < .93 ? 'magma' : 'sbasalt'; };
  const keep = new Set((info.pools || []).map(p => p[0] + ',' + p[1]));
  for (let z = Math.floor(zc - rz - 3); z <= zc + rz + 3; z++) for (let x = -rx - 3; x <= rx + 3; x++) {
    if (keep.has(x + ',' + z)) continue;
    const d = Math.pow(Math.abs(x / rx), 2.4) + Math.pow(Math.abs((z - zc) / rz), 2.4) + (noise(x * .17 + 40, z * .17) - .5) * .42;
    if (d > 1) continue;
    if (!api.get(x, 0, z)) api.set(x, 0, z, d > .86 && R2() < .45 ? 'magma' : ground());
    if (d < .86 && !api.get(x, 1, z)) api.set(x, 1, z, ground());
    else if (d < .93 && R2() < .3 && !api.get(x, 1, z)) api.set(x, 1, z, R2() < .5 ? 'basalt' : 'blackstone');
    // colonnes de basalte sur la rive, jamais devant la façade
    if (d > .7 && d < .9 && R2() < .035 && (z < B.z1 - 8 || Math.abs(x) > Math.max(-B.x0, B.x1) - 3)) { const h = 2 + (R2() * 5 | 0); for (let y = 1; y <= h; y++) if (!api.get(x, y, z)) api.set(x, y, z, 'basalt'); }
  }

  for (let z = B.z0 - 2; z <= B.z1 + 2; z++) for (let x = B.x0 - 2; x <= B.x1 + 2; x++) if (api.get(x, 2, z) && api.get(x, 2, z) !== 'lavafall') for (let y = 0; y < 2; y++) if (!api.get(x, y, z)) api.set(x, y, z, 'blackstone');

  /* --- la caverne : parois, plafond, stalactites, piliers de basalte, chutes de lave --- */
  const pillars = [[-52, -22, 5], [55, -30, 6], [-64, 6, 5], [66, 2, 5], [-38, -58, 6], [36, -62, 7], [-74, -44, 6], [74, -52, 6], [0, -78, 8], [-58, 22, 4], [60, 24, 4]];
  for (let y = 0; y < WY; y++) for (let z = -OZ; z < WZ - OZ; z++) for (let x = -OX; x < WX - OX; x++) {
    if (Math.abs(x) < 34 && z > -34 && y < 40) continue;
    if (x >= B.x0 - 6 && x <= B.x1 + 6 && z >= B.z0 - 6 && y < B.top + 8) continue;
    if (vox[ix(x, y, z)]) continue;
    let rock = false, mat = 'netherrack';
    const back = -66 - 10 * noise(x * .06, y * .09) - (y < 6 ? (6 - y) * 1.2 : 0);
    const side = 70 - 9 * noise2(z * .06 + 9, y * .08) + (y < 6 ? (6 - y) * 1.2 : 0);
    const st = noise2(x * .23 + 3, z * .23), ceil = 56 - 9 * noise(x * .045 + 20, z * .045) - (st > .7 ? (st - .7) * 62 : 0) - Math.max(0, Math.abs(x) - 40) * .25;
    if (z < back || Math.abs(x) > side || y > ceil) rock = true;
    if (!rock) for (let i = 0; i < pillars.length; i++) {
      const p = pillars[i], dd = Math.hypot(x - p[0], z - p[1]); if (dd > p[2] * 1.7 + 3) continue;
      const q = (y - 26) / 26, rr = p[2] * (.75 + .9 * q * q) + 2.2 * (noise(x * .2 + i * 9, y * .2 + z * .2) - .5);
      if (dd < rr) { rock = true; mat = noise2(x * .3, y * .12 + z * .3) < .62 ? 'basalt' : 'blackstone'; break; }
    }
    if (!rock) continue;
    if (mat === 'netherrack') { const r = R2(); mat = r < .012 ? 'gore' : r < .02 ? 'quartz' : y < 3 && r < .25 ? 'magma' : noise(x * .11, z * .11 + y * .13) > .74 ? 'blackstone' : 'netherrack'; }
    vox[ix(x, y, z)] = ID[mat];
  }
  // grappes de pierre lumineuse sous le plafond
  for (let i = 0; i < 46; i++) {
    const x = (R2() * 150 - 75) | 0, z = (R2() * 100 - 80) | 0;
    let y = WY - 1; while (y > 20 && solid(x, y, z)) y--;
    if (y < 26 || y > WY - 3) continue;
    for (let k = 0; k < 9; k++) { const dx = (R2() * 3 | 0) - 1, dz = (R2() * 3 | 0) - 1, dy = -(R2() * 3 | 0); if (!getId(x + dx, y + dy, z + dz)) api.set(x + dx, y + dy, z + dz, 'glowstone'); }
  }
  // chutes de lave lointaines, du plafond au lac
  [[-46, -40], [50, -46], [-20, -72], [24, -74], [-70, -10], [72, -20], [-60, -60], [8, -84]].forEach(p => {
    let y = WY - 1; while (y > 4 && solid(p[0], y, p[1])) y--;
    for (; y >= 0; y--) for (let dx = 0; dx < 2; dx++) if (!solid(p[0] + dx, y, p[1])) api.set(p[0] + dx, y, p[1], 'lavafall');
  });

  /* --- lumière : propagation case par case depuis la lave, le feu, les blocs lumineux --- */
  const q = new Int32Array(WX * WY * WZ); let qh = 0, qt = 0;
  const seed1 = (i, l) => { if (lit[i] < l) { lit[i] = l; q[qt++] = i; } };
  for (let i = 0; i < vox.length; i++) { const id = vox[i]; if (id && BL[id].light) seed1(i, BL[id].light); }
  for (let z = -OZ; z < WZ - OZ; z++) for (let x = -OX; x < WX - OX; x++) if (!vox[ix(x, 0, z)]) seed1(ix(x, 0, z), 15);
  lights.forEach(l => { if (inb(l[0], l[1], l[2])) seed1(ix(l[0], l[1], l[2]), l[3]); });
  const SX = 1, SZ = WX, SY = WX * WZ;
  while (qh < qt) {
    const i = q[qh++], l = lit[i] - 1; if (l <= 0) continue;
    const x = i % WX, z = ((i / WX) | 0) % WZ, y = (i / SY) | 0;
    const go = j => { const id = vox[j]; if (lit[j] < l && (!id || BL[id].cut || BL[id].light)) { lit[j] = l; q[qt++] = j; } };
    if (x > 0) go(i - SX); if (x < WX - 1) go(i + SX);
    if (z > 0) go(i - SZ); if (z < WZ - 1) go(i + SZ);
    if (y > 0) go(i - SY); if (y < WY - 1) go(i + SY);
  }
  const L = (x, y, z) => inb(x, y, z) ? lit[ix(x, y, z)] : (y < 0 ? 15 : 0);

  /* --- maillage --- */
  let cap = 1 << 21, buf = new Float32Array(cap), n = 0, nq = 0; const flips = [];
  const push = (x, y, z, u, v, layer, frames, r, g, b, e) => {
    if (n + 11 > cap) { cap *= 2; const nb = new Float32Array(cap); nb.set(buf); buf = nb; }
    buf[n++] = x; buf[n++] = y; buf[n++] = z; buf[n++] = u; buf[n++] = v; buf[n++] = layer; buf[n++] = frames; buf[n++] = r; buf[n++] = g; buf[n++] = b; buf[n++] = e;
  };
  const tint = (nrm, lv, ao, y) => {
    const f = lv / 15, bl = f / (4 - 3 * f), a = AOF[ao];
    const dir = nrm[1] > 0 ? 1 : nrm[1] < 0 ? .55 : nrm[2] !== 0 ? .84 : .66;
    const lk = (nrm[1] < 0 ? 1 : nrm[1] > 0 ? .1 : nrm[2] > 0 ? .64 : nrm[2] < 0 ? .3 : .46) * Math.exp(-Math.max(0, y - 1) / 40) * a;
    return [a * dir * (AMB[0] + BLK[0] * bl) + LAKE[0] * lk, a * dir * (AMB[1] + BLK[1] * bl) + LAKE[1] * lk, a * dir * (AMB[2] + BLK[2] * bl) + LAKE[2] * lk];
  };
  for (let y = 0; y < WY; y++) for (let z = -OZ; z < WZ - OZ; z++) for (let x = -OX; x < WX - OX; x++) {
    const id = vox[ix(x, y, z)]; if (!id) continue;
    const b = BL[id];
    for (let f = 0; f < 6; f++) {
      const F = FACES[f], N = F[0], U = F[1], V = F[2], bx = x + N[0], by = y + N[1], bz = z + N[2];
      if (by < 0 || !inb(bx, by, bz)) continue;
      const nid = vox[ix(bx, by, bz)];
      if (nid && (!BL[nid].cut || nid === id)) continue;
      const t = b.t[f === 0 ? 0 : f === 1 ? 1 : 2], ao4 = [];
      for (let k = 0; k < 4; k++) {
        const su = CORN[k][0], sv = CORN[k][1];
        const s1 = solid(bx + su * U[0], by + su * U[1], bz + su * U[2]), s2 = solid(bx + sv * V[0], by + sv * V[1], bz + sv * V[2]);
        const cx = bx + su * U[0] + sv * V[0], cy = by + su * U[1] + sv * V[1], cz = bz + su * U[2] + sv * V[2], sc = solid(cx, cy, cz);
        const ao = s1 && s2 ? 3 : (s1 ? 1 : 0) + (s2 ? 1 : 0) + (sc ? 1 : 0);
        let sum = L(bx, by, bz), cnt = 1;
        if (!s1) { sum += L(bx + su * U[0], by + su * U[1], bz + su * U[2]); cnt++; }
        if (!s2) { sum += L(bx + sv * V[0], by + sv * V[1], bz + sv * V[2]); cnt++; }
        if (!sc && !(s1 && s2)) { sum += L(cx, cy, cz); cnt++; }
        const c = tint(N, sum / cnt, ao, y + .5);
        push(x + .5 + (N[0] + su * U[0] + sv * V[0]) / 2, y + .5 + (N[1] + su * U[1] + sv * V[1]) / 2, z + .5 + (N[2] + su * U[2] + sv * V[2]) / 2,
          (su + 1) / 2, (1 - sv) / 2, t[0], t[1], c[0], c[1], c[2], b.emit);
        ao4.push(ao);
      }
      flips.push(ao4[0] + ao4[2] > ao4[1] + ao4[3] ? 1 : 0); nq++;
    }
  }
  const layerOf = (tex, f) => { const t = Array.isArray(tex) ? tex[f === 0 ? 0 : f === 1 ? 1 : 2] : tex; return MC.blocks[t] || [0, 1]; };
  boxes.forEach(bx => {
    const a = bx.a, b = bx.b, e = bx.o.emit || 0;
    for (let f = 0; f < 6; f++) {
      const F = FACES[f], N = F[0], U = F[1], V = F[2], t = layerOf(bx.tex, f);
      const c0 = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], h = [(b[0] - a[0]) / 2, (b[1] - a[1]) / 2, (b[2] - a[2]) / 2];
      for (let k = 0; k < 4; k++) {
        const su = CORN[k][0], sv = CORN[k][1];
        const px = c0[0] + (N[0] + su * U[0] + sv * V[0]) * h[0], py = c0[1] + (N[1] + su * U[1] + sv * V[1]) * h[1], pz = c0[2] + (N[2] + su * U[2] + sv * V[2]) * h[2];
        const lv = L(Math.floor(px + N[0] * .5 - su * U[0] * .01 - sv * V[0] * .01), Math.floor(py + N[1] * .5 - su * U[1] * .01 - sv * V[1] * .01), Math.floor(pz + N[2] * .5 - su * U[2] * .01 - sv * V[2] * .01));
        const c = tint(N, lv, 0, py);
        push(px, py, pz, px * U[0] + py * U[1] + pz * U[2], -(px * V[0] + py * V[1] + pz * V[2]), t[0], t[1], c[0], c[1], c[2], e);
      }
      flips.push(0); nq++;
    }
  });
  crosses.forEach(cr => {
    const p = cr.p, t = MC.blocks[cr.tex] || [0, 1], e = cr.o.emit || 0, lv = L(p[0], p[1], p[2]), c = tint([0, 0, 1], lv, 0, p[1]);
    [[0, 0, 1, 1], [0, 1, 1, 0]].forEach(d => {
      [[d[0], 0, d[1], 0, 1], [d[2], 0, d[3], 1, 1], [d[2], 1, d[3], 1, 0], [d[0], 1, d[1], 0, 0]].forEach(v => push(p[0] + v[0], p[1] + v[1], p[2] + v[2], v[3], v[4], t[0], t[1], c[0], c[1], c[2], e));
      flips.push(0); nq++;
    });
  });
  const idxs = new Uint32Array(nq * 6);
  for (let i = 0; i < nq; i++) { const o = i * 4, k = i * 6; if (flips[i]) { idxs[k] = o + 1; idxs[k + 1] = o + 2; idxs[k + 2] = o + 3; idxs[k + 3] = o + 1; idxs[k + 4] = o + 3; idxs[k + 5] = o; } else { idxs[k] = o; idxs[k + 1] = o + 1; idxs[k + 2] = o + 2; idxs[k + 3] = o; idxs[k + 4] = o + 2; idxs[k + 5] = o + 3; } }
  return { verts: buf.subarray(0, n), idxs, info, bounds: B, L, quads: nq };
}

/* ---------- Modèles des créatures (mêmes boîtes et mêmes découpes de texture que le jeu) ---------- */
const PIGLIN = [
  { n: 'head', p: [0, 0, 0], b: [{ o: [-5, -8, -4], s: [10, 8, 8], uv: [0, 0] }, { o: [-2, -4, -5], s: [4, 4, 1], uv: [31, 1] }, { o: [2, -2, -5], s: [1, 2, 1], uv: [2, 4] }, { o: [-3, -2, -5], s: [1, 2, 1], uv: [2, 0] }],
    c: [{ n: 'earL', p: [4.5, -6, 0], r: [0, 0, -.5236], b: [{ o: [0, 0, -2], s: [1, 5, 4], uv: [51, 6] }] }, { n: 'earR', p: [-4.5, -6, 0], r: [0, 0, .5236], b: [{ o: [-1, 0, -2], s: [1, 5, 4], uv: [39, 6] }] }] },
  { n: 'body', p: [0, 0, 0], b: [{ o: [-4, 0, -2], s: [8, 12, 4], uv: [16, 16] }] },
  { n: 'armR', p: [-5, 2, 0], b: [{ o: [-3, -2, -2], s: [4, 12, 4], uv: [40, 16] }], c: [{ n: 'rod', p: [-1, 9.5, -1], r: [.54, 0, 0], b: [{ o: [-.7, -.7, -15], s: [1.4, 1.4, 15], col: [.42, .27, .14] }],
    c: [{ n: 'rod2', p: [0, 0, -15], r: [.12, 0, 0], b: [{ o: [-.55, -.55, -12], s: [1.1, 1.1, 12], col: [.52, .34, .17] }],
      c: [{ n: 'rod3', p: [0, 0, -12], r: [.16, 0, 0], b: [{ o: [-.4, -.4, -9], s: [.8, .8, 9], col: [.6, .4, .21] }, { o: [-.5, -.5, -9.6], s: [1, 1, .9], col: [.75, .75, .78] }] }] }] }] },
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
const SADDLE = [{ n: 'body', p: [0, 1, 0], b: [{ o: [-8.5, -6.5, -8.5], s: [17, 15, 17], us: [16, 14, 16], uv: [0, 0] }] }];
const GHAST = [{ n: 'body', p: [0, 0, 0], b: [{ o: [-16, -16, -16], s: [32, 32, 32], uv: [0, 0] }],
  c: [0, 1, 2, 3, 4, 5, 6, 7, 8].map(i => ({ n: 't' + i, p: [(i % 3 - 1) * 10, 16, ((i / 3 | 0) - 1) * 10], b: [{ o: [-2, 0, -2], s: [4, 16 + (i * 7 % 13), 4], uv: [0, 0] }] })) }];
const WANDER = [{ x: -27, z: 25, r: 7, sp: .05, ph: 1 }, { x: 31, z: 27, r: 8, sp: -.04, ph: 4 }];
/* Construit les quads d'un modèle posé. root : matrice monde ; pose : { partie: [rx, ry, rz] } ; out : tableau de sortie. */
function buildModel(parts, tw, th, root, pose, out, marks) {
  const C = new Float32Array([1 / 16, 0, 0, 0, 0, -1 / 16, 0, 0, 0, 0, -1 / 16, 0, 0, 1.5, 0, 1]);       // repère du jeu -> monde (y vers le haut, face vers +z)
  const base = mmul(root, C);
  const walk = (part, parent) => {
    const r = (pose && pose[part.n]) || part.r || [0, 0, 0];
    let m = mmul(parent, trans(part.p[0], part.p[1], part.p[2]));
    if (r[2]) m = mmul(m, rotZ(r[2])); if (r[1]) m = mmul(m, rotY(r[1])); if (r[0]) m = mmul(m, rotX(r[0]));
    (part.b || []).forEach(bx => {
      const o = bx.o, s = bx.s, x0 = o[0], y0 = o[1], z0 = o[2], x1 = x0 + s[0], y1 = y0 + s[1], z1 = z0 + s[2];
      const us = bx.us || s, u = bx.uv ? bx.uv[0] : 0, v = bx.uv ? bx.uv[1] : 0, dx = us[0], dy = us[1], dz = us[2];
      const quad = (pts, u0, v0, u1, v1) => {            // pts : 4 coins (haut-gauche, haut-droit, bas-droit, bas-gauche de la texture)
        const w = pts.map(p => tp(m, p[0], p[1], p[2])).map(p => tp(base, p[0], p[1], p[2]));
        const ax = w[1][0] - w[0][0], ay = w[1][1] - w[0][1], az = w[1][2] - w[0][2], bx2 = w[3][0] - w[0][0], by2 = w[3][1] - w[0][1], bz2 = w[3][2] - w[0][2];
        let nx = ay * bz2 - az * by2, ny = az * bx2 - ax * bz2, nz = ax * by2 - ay * bx2; const l = Math.hypot(nx, ny, nz) || 1;
        const uvs = bx.col ? [[-1, 0], [-1, 0], [-1, 0], [-1, 0]] : [[u0 / tw, v0 / th], [u1 / tw, v0 / th], [u1 / tw, v1 / th], [u0 / tw, v1 / th]];
        out.push({ w, uvs, n: [nx / l, ny / l, nz / l], col: bx.col || null });
      };
      if (s[1] === 0) {                                   // plan sans épaisseur (soies de l'arpenteur)
        const ua = bx.mir ? u + dz + dx : u + dz, ub = bx.mir ? u + dz : u + dz + dx;
        quad([[x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0]], ua, v, ub, v + dz);
        return;
      }
      quad([[x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0]], u + dz, v, u + dz + dx, v + dz);                       // dessus
      quad([[x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1]], u + dz + dx, v + dz, u + dz + dx + dx, v);             // dessous
      quad([[x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1]], u, v + dz, u + dz, v + dz + dy);                       // côté droit de la créature
      quad([[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0]], u + dz, v + dz, u + dz + dx, v + dz + dy);             // face
      quad([[x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0]], u + dz + dx, v + dz, u + dz + dx + dz, v + dz + dy);   // côté gauche
      quad([[x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1]], u + dz + dx + dz, v + dz, u + dz + dx + dz + dx, v + dz + dy); // dos
    });
    if (marks && marks[part.n]) { const k = marks[part.n]; k.out = tp(base, ...tp(m, k.at[0], k.at[1], k.at[2])); }
    (part.c || []).forEach(c => walk(c, m));
  };
  parts.forEach(p => walk(p, ident()));
}

/* ---------- Shaders ---------- */
const HEAD = '#version 300 es\nprecision highp float; precision highp sampler2DArray; precision highp sampler2D;\n';
const FOG = `
uniform vec3 uCam, uFogLo, uFogHi; uniform float uFogD;
vec3 fogged(vec3 col, vec3 pos, out float f) {
  vec3 d = pos - uCam; float dist = length(d);
  f = 1. - exp(-pow(dist * uFogD, 1.35));
  float up = clamp(d.y / max(dist, .001) * 3.2 + .28, 0., 1.);
  return mix(col, mix(uFogLo, uFogHi, up), f);
}`;
const LAVAFN = `
uniform sampler2DArray uTex; uniform sampler2D uNoise; uniform float uTime, uLava, uLavaN;
vec4 lavaAt(vec2 w) {
  float f0 = mod(floor(uTime * 20.), uLavaN);         // une couche par tick, comme le jeu (voir build.py)
  vec3 a = texture(uTex, vec3(w, uLava + f0)).rgb;
  float fw = max(fwidth(w.x), fwidth(w.y)) * 16.;
  vec2 q = mix((floor(w * 16.) + .5) / 16., w, clamp(fw - .9, 0., 1.));
  float h1 = texture(uNoise, q * .0125 + uTime * vec2(.0019, .0012)).r, h2 = texture(uNoise, q * .046 - uTime * vec2(.0038, .0016)).r;
  float heat = h1 * .62 + h2 * .38;
  float vein = step(abs(heat - .5), .028) * clamp(1.7 - fw * .45, 0., 1.);
  vec3 col = a * mix(.86, 1.14, smoothstep(.22, .78, heat)) + vec3(1., .78, .34) * vein * .42;
  return vec4(col, .06 + vein * .32);
}`;
const VS_WORLD = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec2 aUv; layout(location=2) in vec2 aTex; layout(location=3) in vec4 aCol;
uniform mat4 uPV; out vec3 vPos; out vec2 vUv; flat out vec2 vTex; out vec4 vCol;
void main() { vPos = aPos; vUv = aUv; vTex = aTex; vCol = aCol; gl_Position = uPV * vec4(aPos, 1.); }`;
const FS_WORLD = HEAD + `
uniform sampler2DArray uTex; uniform float uTime, uExp;
in vec3 vPos; in vec2 vUv; flat in vec2 vTex; in vec4 vCol; out vec4 o;
${FOG}
void main() {
  vec4 c;
  if (vTex.y > 1.5) c = texture(uTex, vec3(vUv, vTex.x + mod(floor(uTime * 20.), vTex.y)));   // animation déroulée tick par tick
  else c = texture(uTex, vec3(vUv, vTex.x));
  if (c.a < .4) discard;
  float e = vCol.a, f;
  vec3 col = c.rgb * mix(vCol.rgb * uExp, vec3(1.12), e);
  col = fogged(col, vPos, f);
  o = vec4(col, e * e * (1. - f) * (.3 + dot(c.rgb, vec3(.5, .5, .2))));
}`;
const VS_LAVA = `#version 300 es
layout(location=0) in vec3 aPos; uniform mat4 uPV; out vec3 vPos;
void main() { vPos = aPos; gl_Position = uPV * vec4(aPos, 1.); }`;
const FS_LAVA = HEAD + LAVAFN + FOG + `
uniform float uExp; in vec3 vPos; out vec4 o;
void main() { vec4 c = lavaAt(vPos.xz); float near = smoothstep(4., 26., length(vPos - uCam)); float f; vec3 col = fogged(c.rgb * mix(.8, 1.04, near), vPos, f); o = vec4(col, c.a * near * (1. - f * .7)); }`;
const VS_QUAD = `#version 300 es
layout(location=0) in vec2 aPos; out vec2 vUv;
void main() { vUv = aPos * .5 + .5; gl_Position = vec4(aPos, 0., 1.); }`;
/* La coupe : sous la ligne de surface, on voit la lave « de l'intérieur », accrochée à la page. */
const FS_FLAT = HEAD + LAVAFN + `
uniform vec2 uRes; uniform vec4 uFlat; uniform float uExp; in vec2 vUv; out vec4 o;      // uFlat : px par texel, défilement (px), ligne de coupe (px depuis le haut), profondeur max (px)
void main() {
  vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
  float wave = sin(p.x * .013 + uTime * 1.7) * 2.5 + sin(p.x * .031 - uTime * 2.3) * 1.5;
  float d = p.y - uFlat.z - wave * uFlat.x * .35;
  if (d < 0.) discard;
  vec2 w = vec2(p.x - uRes.x * .5, p.y + uFlat.y) / (uFlat.x * 16.);
  vec4 c = lavaAt(w);
  float depth = clamp((p.y + uFlat.y) / uFlat.w, 0., 1.);
  vec3 col = c.rgb * mix(vec3(1.), vec3(.5, .24, .15), smoothstep(.1, 1., depth));
  float lip = exp(-d / (uFlat.x * 1.6));
  col += vec3(1., .86, .5) * lip * .9;
  o = vec4(col, lip * .55 + c.a * .25 * (1. - depth));
}`;
const VS_ENT = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec2 aUv; layout(location=2) in vec3 aCol;
uniform mat4 uPV; out vec3 vPos; out vec2 vUv; out vec3 vCol;
void main() { vPos = aPos; vUv = aUv; vCol = aCol; gl_Position = uPV * vec4(aPos, 1.); }`;
const FS_ENT = HEAD + `
uniform sampler2D uSkin; uniform float uExp; in vec3 vPos; in vec2 vUv; in vec3 vCol; out vec4 o;
${FOG}
void main() {
  vec4 c = vUv.x < 0. ? vec4(1.) : texture(uSkin, vUv);
  if (c.a < .5) discard;
  float f; o = vec4(fogged(c.rgb * vCol * uExp, vPos, f), 0.);
}`;
const VS_PART = `#version 300 es
layout(location=0) in vec3 aPos; layout(location=1) in vec4 aCol; uniform mat4 uPV; out vec4 vCol;
void main() { vCol = aCol; gl_Position = uPV * vec4(aPos, 1.); }`;
const FS_PART = HEAD + `in vec4 vCol; out vec4 o; void main() { o = vec4(vCol.rgb * vCol.a, vCol.a); }`;
const FS_SKY = HEAD + `
uniform vec3 uFogLo, uFogHi; uniform float uHorizon; in vec2 vUv; out vec4 o;
void main() { float h = (vUv.y - uHorizon); vec3 c = mix(uFogLo * 1.25, uFogHi * .55, smoothstep(-.02, .55, h)); o = vec4(c, 0.); }`;
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
uniform sampler2D uScene, uB1, uB2, uB3; uniform float uTime, uHeat, uBloom; in vec2 vUv; out vec4 o;
void main() {
  vec2 uv = vUv;
  float m = uHeat * (.3 + .7 * smoothstep(.8, 0., uv.y));
  uv.x += (sin(uv.y * 140. + uTime * 3.1) + sin(uv.y * 61. - uTime * 2.3)) * .00055 * m;
  uv.y += sin(uv.x * 90. + uTime * 2.7) * .0004 * m;
  vec3 c = texture(uScene, uv).rgb;
  vec3 b = texture(uB1, vUv).rgb * .5 + texture(uB2, vUv).rgb * .8 + texture(uB3, vUv).rgb * 1.15;
  c += b * uBloom;
  c = c * (1. + c * .12) / (1. + c * .32) * 1.12;
  vec2 q = vUv - .5; c *= 1. - dot(q, q) * .62;
  c = pow(c, vec3(.96, 1., 1.04));
  o = vec4(c, 1.);
}`;

/* ---------- Le moteur ---------- */
function create(canvas, imgs, opts) {
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
  const P = { world: prog(VS_WORLD, FS_WORLD), lava: prog(VS_LAVA, FS_LAVA), flat: prog(VS_QUAD, FS_FLAT), ent: prog(VS_ENT, FS_ENT), part: prog(VS_PART, FS_PART),
    sky: prog(VS_QUAD, FS_SKY), bright: prog(VS_QUAD, FS_BRIGHT), blur: prog(VS_QUAD, FS_BLUR), fin: prog(VS_QUAD, FS_FINAL) };

  /* textures */
  const layers = imgs.blocks.height / 16, c2 = document.createElement('canvas'); c2.width = 16; c2.height = imgs.blocks.height;
  const g2 = c2.getContext('2d', { willReadFrequently: true }); g2.drawImage(imgs.blocks, 0, 0);
  const texArr = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D_ARRAY, texArr);
  gl.texImage3D(gl.TEXTURE_2D_ARRAY, 0, gl.RGBA8, 16, 16, layers, 0, gl.RGBA, gl.UNSIGNED_BYTE, g2.getImageData(0, 0, 16, imgs.blocks.height).data);
  gl.generateMipmap(gl.TEXTURE_2D_ARRAY);
  gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MIN_FILTER, gl.NEAREST_MIPMAP_LINEAR); gl.texParameteri(gl.TEXTURE_2D_ARRAY, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  const skin = im => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
  const texPig = skin(imgs.piglin), texStr = skin(imgs.strider), texGh = imgs.ghast ? skin(imgs.ghast) : null, texSad = imgs.saddle ? skin(imgs.saddle) : null;
  const nd = new Uint8Array(256 * 256);
  { const R = rng(3), lat = new Float32Array(256); for (let i = 0; i < 256; i++) lat[i] = R();
    for (let y = 0; y < 256; y++) for (let x = 0; x < 256; x++) { const gx = x / 16, gy = y / 16, x0 = gx | 0, y0 = gy | 0, fx = gx - x0, fy = gy - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), x1 = (x0 + 1) & 15, y1 = (y0 + 1) & 15;
      const v = (lat[y0 * 16 + x0] * (1 - sx) + lat[y0 * 16 + x1] * sx) * (1 - sy) + (lat[y1 * 16 + x0] * (1 - sx) + lat[y1 * 16 + x1] * sx) * sy; nd[y * 256 + x] = clamp((v - .5) * 1.7 + .5, 0, 1) * 255; } }
  const texNoise = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, texNoise); gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 256, 256, 0, gl.RED, gl.UNSIGNED_BYTE, nd);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

  /* géométrie fixe */
  let world = null, vaoWorld = null, nIdx = 0, lines = 0;
  const quadBuf = gl.createBuffer(), vaoQuad = gl.createVertexArray();
  gl.bindVertexArray(vaoQuad); gl.bindBuffer(gl.ARRAY_BUFFER, quadBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
  const vaoLava = gl.createVertexArray(), lavaBuf = gl.createBuffer();
  gl.bindVertexArray(vaoLava); gl.bindBuffer(gl.ARRAY_BUFFER, lavaBuf); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-600, LAVA_Y, -600, 600, LAVA_Y, -600, -600, LAVA_Y, 600, 600, LAVA_Y, 600]), gl.STATIC_DRAW); gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 0, 0);
  const vaoEnt = gl.createVertexArray(), entBuf = gl.createBuffer(); let entData = new Float32Array(8 * 4096);
  gl.bindVertexArray(vaoEnt); gl.bindBuffer(gl.ARRAY_BUFFER, entBuf); gl.bufferData(gl.ARRAY_BUFFER, entData.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 32, 12); gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 32, 20);
  const vaoPart = gl.createVertexArray(), partBuf = gl.createBuffer(), NP = 420, partData = new Float32Array(NP * 6 * 7);
  gl.bindVertexArray(vaoPart); gl.bindBuffer(gl.ARRAY_BUFFER, partBuf); gl.bufferData(gl.ARRAY_BUFFER, partData.byteLength, gl.DYNAMIC_DRAW);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 28, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 4, gl.FLOAT, false, 28, 12);
  gl.bindVertexArray(null);

  function setWorld(nl) {
    lines = nl;
    world = buildWorld(nl, 1337);
    if (vaoWorld) gl.deleteVertexArray(vaoWorld);
    vaoWorld = gl.createVertexArray(); gl.bindVertexArray(vaoWorld);
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, world.verts, gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 44, 0);
    gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 44, 12);
    gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 2, gl.FLOAT, false, 44, 20);
    gl.enableVertexAttribArray(3); gl.vertexAttribPointer(3, 4, gl.FLOAT, false, 44, 28);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib); gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, world.idxs, gl.STATIC_DRAW);
    nIdx = world.idxs.length; gl.bindVertexArray(null);
    world.verts = null;
  }

  /* cibles de rendu */
  let W = 0, H = 0, quality = 1, fbScene = null, fbRes = null, texScene = null, rbs = [], bloom = [], msaa = 0;
  function target(w, h) {
    const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    const f = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, f); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, t, 0);
    return { f, t, w, h };
  }
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2) * quality, w = Math.max(2, Math.round(canvas.clientWidth * dpr)), h = Math.max(2, Math.round(canvas.clientHeight * dpr));
    if (w === W && h === H) return false;
    W = w; H = h; canvas.width = W; canvas.height = H;
    [fbScene, fbRes && fbRes.f].concat(bloom.map(b => b.f)).forEach(f => f && gl.deleteFramebuffer(f)); rbs.forEach(r => gl.deleteRenderbuffer(r)); [texScene].concat(bloom.map(b => b.t)).forEach(t => t && gl.deleteTexture(t)); rbs = [];
    msaa = Math.min(4, gl.getParameter(gl.MAX_SAMPLES) || 0); if (opts.noMsaa || quality < .8) msaa = 0;
    fbRes = target(W, H); texScene = fbRes.t;
    fbScene = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbScene);
    const depth = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, depth); rbs.push(depth);
    if (msaa) {
      const col = gl.createRenderbuffer(); rbs.push(col); gl.bindRenderbuffer(gl.RENDERBUFFER, col); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, msaa, gl.RGBA8, W, H); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.RENDERBUFFER, col);
      gl.bindRenderbuffer(gl.RENDERBUFFER, depth); gl.renderbufferStorageMultisample(gl.RENDERBUFFER, msaa, gl.DEPTH_COMPONENT24, W, H);
    } else { gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texScene, 0); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT24, W, H); }
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depth);
    bloom = [];
    for (let i = 1; i <= 3; i++) { const bw = Math.max(2, W >> (i + 0)), bh = Math.max(2, H >> (i + 0)); bloom.push(target(bw, bh), target(bw, bh)); }
    const asp = W / H, nl = asp < .95 ? 2 : 1;
    if (nl !== lines) setWorld(nl);
    frameUp();
    return true;
  }

  /* ---------- créatures ---------- */
  const AXIS = .5, rider = { x: 3.4, z: 20, yaw: -Math.PI / 2 + .42 }, tip = [0, 5, 20], quads = []; let yankT = -9, TIPX = AXIS;
  function entities(t, PVm) {
    quads.length = 0; const pigQ = [], ghQ = [], sadQ = [];
    const yk = Math.max(0, 1 - (t - yankT) / .7), yank = yk * yk * Math.sin(Math.min(1, (t - yankT) / .18) * Math.PI / 2);
    const bob = Math.sin(t * 1.3) * .035, sway = Math.sin(t * .9) * .025;
    const root = mmul(mmul(trans(rider.x, LAVA_Y - .28 + bob, rider.z), rotY(rider.yaw)), rotZ(sway));
    buildModel(STRIDER, 64, 128, root, { legR: [Math.sin(t * 1.3) * .05, 0, 0], legL: [-Math.sin(t * 1.3) * .05, 0, 0] }, quads);
    if (texSad) buildModel(SADDLE, 64, 128, root, null, sadQ);
    // deux arpenteurs se promènent au loin sur le lac
    WANDER.forEach((w, i) => { const a = t * w.sp + w.ph, sw = Math.sin(t * 3.1 + i * 2) * .42; buildModel(STRIDER, 64, 128, mmul(trans(w.x + Math.cos(a) * w.r, LAVA_Y - .28 + Math.abs(sw) * .05, w.z + Math.sin(a) * w.r), rotY(w.sp > 0 ? -a : Math.PI - a)), { legR: [sw, 0, 0], legL: [-sw, 0, 0] }, quads); });
    // un ghast dérive dans la brume
    if (texGh) { const pose = {}; for (let i = 0; i < 9; i++) pose['t' + i] = [.28 + Math.sin(t * .7 + i * 1.3) * .22, 0, Math.sin(t * .5 + i) * .1];
      buildModel(GHAST, 128, 64, mmul(mmul(trans(-37 + Math.sin(t * .045) * 5, 31 + Math.sin(t * .23) * 1.4, -14 + Math.cos(t * .03) * 4), rotY(.22 + Math.sin(t * .05) * .18)), scale(2.25, 2.25, 2.25)), pose, ghQ); }
    const mark = { rod3: { at: [0, 0, -9.6] } };
    const look = Math.sin(t * .45) * .22, nod = Math.sin(t * .8) * .05, cast = Math.sin(t * 1.9) * .035;
    const pr = mmul(root, trans(0, 1.16, -.08));
    buildModel(PIGLIN, 64, 64, pr, {
      head: [.16 + nod, look, 0], earL: [0, 0, -.5236 - Math.max(0, Math.sin(t * 2.1)) * .12], earR: [0, 0, .5236 + Math.max(0, Math.sin(t * 2.1 + 1)) * .12],
      armR: [-1.22 + cast - yank * .55, -.18, 0], armL: [-.78, .22, 0], rod: [.54 - cast * 1.6 - yank * .5, 0, 0], rod2: [.12 + yank * .25, 0, 0], rod3: [.16 + yank * .3, 0, 0],
      legR: [-1.4137, .3142, .0785], legL: [-1.4137, -.3142, -.0785]
    }, pigQ, mark);
    const nStr = quads.length, nPig = pigQ.length; pigQ.forEach(q => quads.push(q)); ghQ.forEach(q => quads.push(q)); sadQ.forEach(q => quads.push(q));
    tip[0] = mark.rod3.out[0]; tip[1] = mark.rod3.out[1]; tip[2] = mark.rod3.out[2];
    // lumière : la lave éclaire les créatures par en dessous
    const need = quads.length * 6 * 8; if (entData.length < need) entData = new Float32Array(need * 2);
    let k = 0;
    quads.forEach(q => {
      const n = q.n, dir = n[1] > .5 ? 1 : n[1] < -.5 ? .6 : .8, lk = clamp(-n[1] * .75 + .42 + n[2] * .12, .08, 1.2);
      const r = (AMB[0] * 1.7 + .5) * dir + LAKE[0] * lk * .95, g = (AMB[1] * 1.7 + .42) * dir + LAKE[1] * lk * .95, b = (AMB[2] * 1.7 + .36) * dir + LAKE[2] * lk * .95;
      const c = q.col ? [q.col[0] * r, q.col[1] * g, q.col[2] * b] : [r, g, b];
      [0, 1, 2, 0, 2, 3].forEach(i => { const w = q.w[i], uv = q.uvs[i]; entData[k++] = w[0]; entData[k++] = w[1]; entData[k++] = w[2]; entData[k++] = uv[0]; entData[k++] = uv[1]; entData[k++] = c[0]; entData[k++] = c[1]; entData[k++] = c[2]; });
    });
    gl.bindVertexArray(vaoEnt); gl.bindBuffer(gl.ARRAY_BUFFER, entBuf); gl.bufferData(gl.ARRAY_BUFFER, entData.subarray(0, k), gl.DYNAMIC_DRAW);
    return { nStr: nStr * 6, nPig: nPig * 6, nGh: ghQ.length * 6, nSad: sadQ.length * 6 };
  }

  /* ---------- particules : braises, cendres, projections de lave ---------- */
  const PR = rng(99), parts = [];
  const spawn = (p, cam) => {
    const r = PR();
    if (r < .22) { const a = PR() * 6.28, d = 4 + PR() * 40; p.x = cam[0] * .3 + Math.cos(a) * d; p.z = cam[2] - 14 - PR() * 46; p.y = LAVA_Y; p.vx = (PR() - .5) * 1.4; p.vz = (PR() - .5) * 1.4; p.vy = 2.2 + PR() * 2.6; p.g = 5.5; p.s = .11 + PR() * .08; p.max = p.life = 2 * p.vy / p.g + .25; p.kind = 1; }
    else { p.x = (PR() - .5) * 110; p.z = cam[2] - 6 - PR() * 80; p.y = LAVA_Y + PR() * 26; p.vx = (PR() - .5) * .5; p.vz = (PR() - .5) * .5; p.vy = .35 + PR() * 1.1; p.g = 0; p.s = .05 + PR() * .07; p.max = p.life = 3 + PR() * 6; p.kind = 0; p.ph = PR() * 6.28; }
  };
  for (let i = 0; i < NP; i++) parts.push({ life: 0 });
  function splash() {
    let n = 0;
    for (let i = 0; i < NP && n < 26; i++) { const p = parts[i]; if (p.kind === 1 && p.life > 0) continue;
      const a = PR() * 6.28, sp = .6 + PR() * 2.2; p.x = tip[0] + Math.cos(a) * .3; p.z = tip[2] + Math.sin(a) * .3; p.y = LAVA_Y + .05;
      p.vx = Math.cos(a) * sp; p.vz = Math.sin(a) * sp; p.vy = 3 + PR() * 3.5; p.g = 9; p.s = .07 + PR() * .07; p.max = p.life = 2 * p.vy / 9 + .25; p.kind = 1; p.init = 1; n++; }
  }
  function particles(t, dt, cam, right, up) {
    let k = 0, cnt = 0;
    for (let i = 0; i < NP; i++) {
      const p = parts[i];
      if (p.life <= 0) { spawn(p, cam); p.life = p.max * (p.init ? 1 : PR()); p.init = 1; }
      p.life -= dt; p.vy -= p.g * dt; p.x += (p.vx + (p.kind ? 0 : Math.sin(t * .8 + p.ph) * .35)) * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.kind && p.y < LAVA_Y) { p.life = 0; continue; }
      const dc = Math.hypot(p.x - cam[0], p.y - cam[1], p.z - cam[2]), a = p.life / p.max, end = p.kind ? Math.min(1, p.life / .2) : 1, al = (p.kind ? end : Math.min(1, a * 3, (1 - a) * 6)) * clamp((dc - 3) / 6, 0, 1), s = Math.min(p.s, dc * .012) * end;
      const r = 1, g = p.kind ? .78 : .35 + a * .45, b = p.kind ? .3 : .08 + a * .2;
      const cs = [[-s, -s], [s, -s], [s, s], [-s, -s], [s, s], [-s, s]];
      for (let j = 0; j < 6; j++) { const c = cs[j]; partData[k++] = p.x + right[0] * c[0] + up[0] * c[1]; partData[k++] = p.y + right[1] * c[0] + up[1] * c[1]; partData[k++] = p.z + right[2] * c[0] + up[2] * c[1]; partData[k++] = r; partData[k++] = g; partData[k++] = b; partData[k++] = al; }
      cnt += 6;
    }
    gl.bindVertexArray(vaoPart); gl.bindBuffer(gl.ARRAY_BUFFER, partBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, partData.subarray(0, k));
    return cnt;
  }

  /* ---------- caméra ---------- */
  const FOV = 40 * Math.PI / 180, TH = Math.tan(FOV / 2);
  const cam = { eye: [0, 15, 54], at: [0, 11, 0], PV: null, right: [1, 0, 0], up: [0, 1, 0] }, K = { d0: 80, y0: 6.5, pitch: .09 };
  let pmx = 0, pmy = 0;
  /* Cadrage du plan large : le château entier, vu d'en bas, et le pêcheur juste devant nous. */
  function frameUp() {
    const asp = W / H, B = world.bounds, half = Math.max(-B.x0, B.x1) + 4;
    K.d0 = half / (TH * asp) * (asp < .95 ? 1.04 : 1.18); K.y0 = 5;
    // en portrait, on laisse de l'air au-dessus du château : l'en-tête et la légende s'y posent sans le couvrir
    K.pitch = Math.max(.02, Math.atan((B.top - K.y0) / K.d0) - FOV / 2 * (asp < .95 ? .74 : .93));
    const dr = (K.y0 - LAVA_Y) / Math.tan(FOV / 2 * (asp < .95 ? .8 : .95) - K.pitch);
    TIPX = opts.tipx !== undefined ? opts.tipx : asp < .95 ? AXIS - 1 : AXIS - 7;
    rider.z = K.d0 - Math.min(dr, asp < .95 ? 55 : 30); rider.x = 3.4; entities(0); rider.x -= tip[0] - TIPX; entities(0);
  }
  /* Plan rapproché : par-dessus l'épaule du pêcheur, comme la vue F5 du jeu ; la ligne au centre, le titre au-dessus. */
  function endShot(asp, B, f5, mx, my) {
    const por = asp < .95, F5 = f5 || (por ? [-1, 2.1, 11, 11] : [-2.6, 1.6, 9, 7.6]);
    // recul minimal pour que le titre tienne en largeur, même si le pêcheur est près du château (tablettes)
    const back = Math.max(F5[2], Math.max(-B.x0, B.x1) * .62 / (TH * asp * .92) - (rider.z - (B.z1 || 4)));
    return [[rider.x + F5[0] + mx * .4, LAVA_Y + F5[1] - my * .2, rider.z + back], [lerp(TIPX, AXIS, .55) + mx * .3, LAVA_Y + F5[3], 4]];
  }
  /* Abscisse (px CSS) où la ligne entre dans la lave en fin de plongée, sans l'effet de la souris : l'encart du launcher s'aligne dessus. */
  function restX() {
    if (!world || !W) return null;
    const asp = W / H, E = endShot(asp, world.bounds, null, 0, 0), m = mmul(persp(FOV, asp, .4, 420), look(E[0], E[1]).m);
    const x = TIPX, y = LAVA_Y + .05, z = tip[2], w = m[3] * x + m[7] * y + m[11] * z + m[15];
    return w > .01 ? ((m[0] * x + m[4] * y + m[8] * z + m[12]) / w * .5 + .5) * canvas.clientWidth : null;
  }
  function camera(t, st) {
    const asp = W / H, B = world.bounds, p = smooth(st.p || 0);
    pmx += ((st.mx || 0) - pmx) * .05; pmy += ((st.my || 0) - pmy) * .05;
    // plan large : tout le château tient dans le cadre
    const e0 = [AXIS + pmx * 2.2 + Math.sin(t * .13) * .5, K.y0 - pmy * 1.2, K.d0], a0 = [AXIS + pmx * .4, K.y0 + Math.tan(K.pitch) * K.d0, 0];
    const E = endShot(asp, B, st.f5, pmx, pmy), e1 = E[0], a1 = E[1];
    for (let i = 0; i < 3; i++) { cam.eye[i] = lerp(e0[i], e1[i], p); cam.at[i] = lerp(a0[i], a1[i], p); }
    const V = look(cam.eye, cam.at), Pm = persp(FOV, asp, .4, 420), PV = mmul(Pm, V.m), sh = 2 * (st.after || 0) / Math.max(1, st.vh || 1);
    for (let c = 0; c < 4; c++) PV[c * 4 + 1] += sh * PV[c * 4 + 3];
    cam.PV = PV; cam.right = V.right; cam.up = V.up;
  }
  /* point du monde -> pixels CSS dans la fenêtre */
  function project(x, y, z) {
    const m = cam.PV; if (!m) return null;
    const w = m[3] * x + m[7] * y + m[11] * z + m[15];
    if (w <= .01) return null;
    return { x: ((m[0] * x + m[4] * y + m[8] * z + m[12]) / w * .5 + .5) * canvas.clientWidth, y: (1 - ((m[1] * x + m[5] * y + m[9] * z + m[13]) / w * .5 + .5)) * canvas.clientHeight };
  }

  /* ---------- une image ---------- */
  const FOGLO = [.74, .2, .05], FOGHI = [.09, .022, .03];
  let last = 0, acc = 0, accN = 0, slow = 0;
  const common = (pr) => { gl.useProgram(pr.p); if (pr.u.uPV) gl.uniformMatrix4fv(pr.u.uPV, false, cam.PV); if (pr.u.uCam) gl.uniform3fv(pr.u.uCam, cam.eye); if (pr.u.uFogLo) gl.uniform3fv(pr.u.uFogLo, FOGLO); if (pr.u.uFogHi) gl.uniform3fv(pr.u.uFogHi, FOGHI); if (pr.u.uFogD) gl.uniform1f(pr.u.uFogD, 1 / (K.d0 * 2.2)); if (pr.u.uTime) gl.uniform1f(pr.u.uTime, last); if (pr.u.uExp) gl.uniform1f(pr.u.uExp, 1.6); };
  const bindArr = pr => { gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D_ARRAY, texArr); gl.uniform1i(pr.u.uTex, 0); if (pr.u.uNoise) { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, texNoise); gl.uniform1i(pr.u.uNoise, 1); } if (pr.u.uLava) { gl.uniform1f(pr.u.uLava, MC.blocks.lava_still[0]); gl.uniform1f(pr.u.uLavaN, MC.blocks.lava_still[1]); } };
  const pass = (pr, dst, src, set) => { gl.bindFramebuffer(gl.FRAMEBUFFER, dst ? dst.f : null); gl.viewport(0, 0, dst ? dst.w : W, dst ? dst.h : H); gl.useProgram(pr.p); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src); gl.uniform1i(pr.u.uSrc, 0); if (set) set(); gl.bindVertexArray(vaoQuad); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4); };

  function frame(t, st) {
    st = st || {};
    resize();
    if (!world) return;
    const dt = clamp(t - last, 0, .05); last = t;
    camera(t, st);
    const ent = entities(t), css = canvas.clientHeight || 1, k = H / css;
    // ligne de coupe : là où la surface de la lave rencontre la « vitre », un peu devant le flotteur
    const cp = project(tip[0], LAVA_Y, tip[2] + 3.2), cutCss = Math.min(cp ? cp.y : 1e6, css - (st.after || 0));
    api.cutY = cutCss;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fbScene); gl.viewport(0, 0, W, H);
    gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE); gl.disable(gl.DEPTH_TEST); gl.depthMask(true);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    if (cutCss > 0) {
      // ciel de la caverne
      const hz = project(cam.eye[0], cam.eye[1], cam.eye[2] - 1000);
      common(P.sky); gl.uniform1f(P.sky.u.uHorizon, hz ? 1 - hz.y / css : .5); gl.bindVertexArray(vaoQuad); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
      common(P.world); bindArr(P.world); gl.bindVertexArray(vaoWorld); gl.drawElements(gl.TRIANGLES, nIdx, gl.UNSIGNED_INT, 0);
      common(P.ent); gl.bindVertexArray(vaoEnt); gl.activeTexture(gl.TEXTURE0); gl.uniform1i(P.ent.u.uSkin, 0);
      gl.bindTexture(gl.TEXTURE_2D, texStr); gl.drawArrays(gl.TRIANGLES, 0, ent.nStr);
      gl.bindTexture(gl.TEXTURE_2D, texPig); gl.drawArrays(gl.TRIANGLES, ent.nStr, ent.nPig);
      if (ent.nGh) { gl.bindTexture(gl.TEXTURE_2D, texGh); gl.drawArrays(gl.TRIANGLES, ent.nStr + ent.nPig, ent.nGh); }
      if (ent.nSad) { gl.bindTexture(gl.TEXTURE_2D, texSad); gl.drawArrays(gl.TRIANGLES, ent.nStr + ent.nPig + ent.nGh, ent.nSad); }
      common(P.lava); bindArr(P.lava); gl.bindVertexArray(vaoLava); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      const np = particles(t, st.frozen ? 0 : dt, cam.eye, cam.right, cam.up);
      common(P.part); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false); gl.bindVertexArray(vaoPart); gl.drawArrays(gl.TRIANGLES, 0, np);
      gl.disable(gl.BLEND); gl.depthMask(true); gl.disable(gl.DEPTH_TEST);
    }
    if (cutCss < css) {
      common(P.flat); bindArr(P.flat);
      gl.uniform2f(P.flat.u.uRes, W, H);
      gl.uniform4f(P.flat.u.uFlat, (st.texel || 6) * k, ((st.scroll || 0) - (st.origin || 0)) * k, cutCss * k, Math.max(1, (st.depth || 2000) * k));
      gl.bindVertexArray(vaoQuad); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    if (msaa) { gl.bindFramebuffer(gl.READ_FRAMEBUFFER, fbScene); gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, fbRes.f); gl.blitFramebuffer(0, 0, W, H, 0, 0, W, H, gl.COLOR_BUFFER_BIT, gl.NEAREST); }
    // halo lumineux : on garde ce qui brille, on floute à trois échelles, on rajoute par-dessus
    let src = texScene, sw = W, sh = H;
    for (let i = 0; i < 3; i++) {
      const a = bloom[i * 2], b = bloom[i * 2 + 1];
      pass(i ? P.blur : P.bright, a, src, () => { if (i) gl.uniform2f(P.blur.u.uDir, 0, 0); else gl.uniform2f(P.bright.u.uPx, 1 / sw, 1 / sh); });
      pass(P.blur, b, a.t, () => gl.uniform2f(P.blur.u.uDir, 1 / a.w, 0));
      pass(P.blur, a, b.t, () => gl.uniform2f(P.blur.u.uDir, 0, 1 / a.h));
      src = a.t; sw = a.w; sh = a.h;
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, W, H); gl.useProgram(P.fin.p);
    [texScene, bloom[0].t, bloom[2].t, bloom[4].t].forEach((tx, i) => { gl.activeTexture(gl.TEXTURE0 + i); gl.bindTexture(gl.TEXTURE_2D, tx); });
    gl.uniform1i(P.fin.u.uScene, 0); gl.uniform1i(P.fin.u.uB1, 1); gl.uniform1i(P.fin.u.uB2, 2); gl.uniform1i(P.fin.u.uB3, 3);
    gl.uniform1f(P.fin.u.uTime, t); gl.uniform1f(P.fin.u.uHeat, st.heat !== undefined ? st.heat : st.calm ? 0 : 1); gl.uniform1f(P.fin.u.uBloom, .9);
    gl.bindVertexArray(vaoQuad); gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    // qualité adaptative : si la machine peine, on baisse la définition
    if (!opts.still && dt > 0) { acc += dt; accN++; if (accN >= 45) { const avg = acc / accN; acc = accN = 0; slow = avg > .045 ? slow + 1 : 0; if (slow >= 2 && quality > .5) { slow = 0; quality = Math.max(.5, quality - .17); } } }
  }

  const api = {
    frame, resize, project, cutY: 1e6,
    tip: () => project(tip[0], tip[1], tip[2]),
    bob: () => project(tip[0], LAVA_Y + .05, tip[2]),
    camY: () => cam.eye[1],
    restX,
    strike() { yankT = last; splash(); },
    info: () => ({ W, H, quads: world ? world.quads : 0, lines, quality, msaa, eye: cam.eye.map(v => +v.toFixed(1)), at: cam.at.map(v => +v.toFixed(1)), tip: tip.map(v => +v.toFixed(1)), rider: [+rider.x.toFixed(1), +rider.z.toFixed(1)], top: world ? world.bounds.top : 0 })
  };
  return api;
}

/* ---------- Buste de piglin pour la boutique : petit rendu autonome, tête orientable ---------- */
function bust(canvas, img) {
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: false });
  if (!gl) return null;
  const mkS = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const p = gl.createProgram();
  gl.attachShader(p, mkS(gl.VERTEX_SHADER, VS_ENT));
  gl.attachShader(p, mkS(gl.FRAGMENT_SHADER, HEAD + 'uniform sampler2D uSkin; in vec3 vPos; in vec2 vUv; in vec3 vCol; out vec4 o; void main() { vec4 c = texture(uSkin, vUv); if (c.a < .5) discard; o = vec4(c.rgb * vCol, 1.); }'));
  gl.linkProgram(p); gl.useProgram(p);
  const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  const vao = gl.createVertexArray(), buf = gl.createBuffer(); gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 32, 12); gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 32, 20);
  const parts = PIGLIN.filter(q => q.n.indexOf('leg') !== 0).map(q => q.n === 'armR' ? Object.assign({}, q, { c: [] }) : q);
  const PV = mmul(persp(.5, canvas.width / canvas.height, .1, 20), look([0, 1.72, 3.5], [0, 1.6, 0]).m);
  gl.uniformMatrix4fv(gl.getUniformLocation(p, 'uPV'), false, PV); gl.uniform1i(gl.getUniformLocation(p, 'uSkin'), 0);
  gl.enable(gl.DEPTH_TEST); gl.clearColor(0, 0, 0, 0);
  const quads = [], data = new Float32Array(8 * 6 * 80);
  return { frame(time, lx, ly, nod) {
    quads.length = 0;
    const ear = Math.max(0, Math.sin(time * 2.3)) * .14;
    buildModel(parts, 64, 64, rotY(lx * .22), { head: [ly * .38 + nod * .45 + .04, -lx * .62, Math.sin(time * .7) * .03], earL: [0, 0, -.5236 - ear], earR: [0, 0, .5236 + ear], armR: [-.32 + Math.sin(time * 1.1) * .03, 0, .06], armL: [-.32, 0, -.06] }, quads);
    let k = 0;
    quads.forEach(q => { const n = q.n, l = (n[1] > .5 ? 1.08 : n[1] < -.5 ? .62 : .78 + n[2] * .16); [0, 1, 2, 0, 2, 3].forEach(i => { const w = q.w[i], uv = q.uvs[i]; data[k++] = w[0]; data[k++] = w[1]; data[k++] = w[2]; data[k++] = uv[0]; data[k++] = uv[1]; data[k++] = l * 1.32; data[k++] = l * 1.2; data[k++] = l * 1.08; }); });
    gl.viewport(0, 0, canvas.width, canvas.height); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, k), gl.DYNAMIC_DRAW); gl.drawArrays(gl.TRIANGLES, 0, k / 8);
  } };
}

/* ---------- Squelette englouti dans la coupe de lave : le modèle du jeu, teinté et noyé par la lave ---------- */
const SKELETON = [
  { n: 'head', p: [0, 0, 0], b: [{ o: [-4, -8, -4], s: [8, 8, 8], uv: [0, 0] }] },
  { n: 'body', p: [0, 0, 0], b: [{ o: [-4, 0, -2], s: [8, 12, 4], uv: [16, 16] }] },
  { n: 'armR', p: [-5, 2, 0], b: [{ o: [-1, -2, -1], s: [2, 12, 2], uv: [40, 16] }] },
  { n: 'armL', p: [5, 2, 0], b: [{ o: [-1, -2, -1], s: [2, 12, 2], uv: [40, 16] }] },
  { n: 'legR', p: [-2, 12, 0], b: [{ o: [-1, 0, -1], s: [2, 12, 2], uv: [0, 16] }] },
  { n: 'legL', p: [2, 12, 0], b: [{ o: [-1, 0, -1], s: [2, 12, 2], uv: [0, 16] }] }
];
const FS_SUNK = HEAD + `
uniform sampler2D uSkin; uniform float uH; in vec3 vPos; in vec2 vUv; in vec3 vCol; out vec4 o;
void main() {
  vec4 c = texture(uSkin, vUv); if (c.a < .5) discard;
  float deep = clamp(1. - gl_FragCoord.y / uH, 0., 1.);          // plus bas dans l'image = plus enfoncé dans la lave
  vec3 col = c.rgb * vCol;
  col = mix(col, vec3(.62, .17, .04), .1 + .32 * deep);            // la lave l'imprègne, davantage vers le bas
  o = vec4(col, 1.);
}`;
function sunk(canvas, skel) {
  const gl = canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: false });
  if (!gl) return null;
  const mkS = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
  const p = gl.createProgram();
  gl.attachShader(p, mkS(gl.VERTEX_SHADER, VS_ENT)); gl.attachShader(p, mkS(gl.FRAGMENT_SHADER, FS_SUNK));
  gl.linkProgram(p); gl.useProgram(p);
  const tex = im => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; };
  const tS = tex(skel);
  const vao = gl.createVertexArray(), buf = gl.createBuffer(); gl.bindVertexArray(vao); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 3, gl.FLOAT, false, 32, 0); gl.enableVertexAttribArray(1); gl.vertexAttribPointer(1, 2, gl.FLOAT, false, 32, 12); gl.enableVertexAttribArray(2); gl.vertexAttribPointer(2, 3, gl.FLOAT, false, 32, 20);
  const uPV = gl.getUniformLocation(p, 'uPV'), uH = gl.getUniformLocation(p, 'uH');
  gl.uniform1i(gl.getUniformLocation(p, 'uSkin'), 0);
  gl.enable(gl.DEPTH_TEST); gl.clearColor(0, 0, 0, 0);
  const qa = [], qb = [], data = new Float32Array(8 * 6 * 64);
  const fill = (qs, k0) => {
    let k = k0;
    qs.forEach(q => {
      const n = q.n, face = Math.max(0, n[2]), below = Math.max(0, -n[1]), rim = 1 - Math.abs(n[2]);
      const l = .62 + .4 * face + .18 * below;                    // éclairé de face et par la lave en dessous
      const c = [l * 1.06 + rim * .28, l * .93 + rim * .08, l * .82];  // l'os reste pâle, les bords rougeoient
      [0, 1, 2, 0, 2, 3].forEach(i => { const w = q.w[i], uv = q.uvs[i]; data[k++] = w[0]; data[k++] = w[1]; data[k++] = w[2]; data[k++] = uv[0]; data[k++] = uv[1]; data[k++] = c[0]; data[k++] = c[1]; data[k++] = c[2]; });
    });
    return k;
  };
  return { frame(t) {
    const asp = canvas.width / Math.max(1, canvas.height);
    const fov = asp < .75 ? .6 : .52, PV = mmul(persp(fov, asp, .1, 30), look([0, .9, 6.2], [0, .85, 0]).m);
    qa.length = 0; qb.length = 0;
    // le squelette coule à la renverse, bras tendus vers la surface ; il tourne et dérive lentement
    const root = mmul(mmul(mmul(trans(.12 + Math.sin(t * .31) * .08, 1.05 + Math.sin(t * .47) * .09, 0), rotZ(-.32 + Math.sin(t * .23) * .07)), rotY(.42 + Math.sin(t * .17) * .22)), trans(0, -1.05, 0));
    buildModel(SKELETON, 64, 32, root, {
      head: [-.3 + Math.sin(t * .5) * .06, .18, 0], armR: [-2.7 + Math.sin(t * .9) * .12, 0, -.75 + Math.sin(t * .8) * .08], armL: [-2.5 + Math.sin(t * .7 + 1) * .12, 0, .7 + Math.sin(t * .75 + 2) * .08],
      legR: [.22 + Math.sin(t * .6) * .08, 0, .06], legL: [-.16 + Math.sin(t * .6 + 2) * .08, 0, -.06], body: [0, 0, 0]
    }, qa);
    const ka = fill(qa, 0), kb = fill(qb, ka);
    gl.viewport(0, 0, canvas.width, canvas.height); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.uniformMatrix4fv(uPV, false, PV); gl.uniform1f(uH, canvas.height);
    gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferData(gl.ARRAY_BUFFER, data.subarray(0, kb), gl.DYNAMIC_DRAW);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, tS); gl.drawArrays(gl.TRIANGLES, 0, ka / 8);
  } };
}

window.NetherWorld = { create, bust, sunk, BLOCKS: BL, buildModel, PIGLIN };
})();
