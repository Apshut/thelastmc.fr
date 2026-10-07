/* The Last — page d'accueil : textures et police du jeu, strates, ligne de pêche.
   La scène 3D (lac, château, pêcheur) est dans world.js ; le château dans castle.js. La boutique a sa propre page
   (boutique.html, tavern.js). Aucun stockage, aucun appel externe. */
(() => {
'use strict';

const CFG = window.THE_LAST || {}, MC = window.MC || { blocks: {}, items: {}, font: {} };
const D = document, root = D.documentElement;
const $ = (s, r) => (r || D).querySelector(s);
const $$ = (s, r) => Array.from((r || D).querySelectorAll(s));
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const QS = new URLSearchParams(location.search), SHOT = QS.has('shot');
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
let shotY = 0;
const SY = () => SHOT ? shotY : window.scrollY;      // en mode capture, le defilement est simule
root.classList.add('js');
if (REDUCE) root.classList.add('calm');

function rng(seed) {
  let a = seed >>> 0;
  return () => { a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
function mk(w, h) { const c = D.createElement('canvas'); c.width = w; c.height = h; return c; }
function h(tag, attrs, ...kids) {
  const e = D.createElement(tag);
  if (attrs) for (const k in attrs) { if (k === 'class') e.className = attrs[k]; else if (k === 'text') e.textContent = attrs[k]; else e.setAttribute(k, attrs[k]); }
  kids.forEach(c => { if (c) e.appendChild(typeof c === 'string' ? D.createTextNode(c) : c); });
  return e;
}
const copy = c => { const o = mk(c.width, c.height); o.getContext('2d').drawImage(c, 0, 0); return o; };
const dataUrl = c => 'url(' + c.toDataURL() + ')';
const setVar = (k, c) => root.style.setProperty(k, dataUrl(c));

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
function pxText(el) {
  const txt = el.textContent.trim();
  el.textContent = '';
  if (el.dataset.fs) el.style.setProperty('--fs', el.dataset.fs + 'px');
  el.appendChild(h('span', { class: 'sr', text: txt }));
  txt.split(' ').filter(Boolean).forEach(w => el.appendChild(pxWord(w)));
}

/* Remplace le texte d'un bouton ou d'une étiquette par la police du jeu (le texte reste lisible par les lecteurs d'écran). */
function pxLabel(el, text, fs) {
  text = String(text).trim(); if (el.dataset.pxl === text) return el;
  el.dataset.pxl = text; el.textContent = '';
  const box = h('span', { class: 'pxl', 'aria-hidden': 'true' }); if (fs) box.style.setProperty('--fs', fs + 'px');
  text.split(' ').filter(Boolean).forEach(w => box.appendChild(pxWord(w)));
  el.append(h('span', { class: 'sr', text }), box); el.classList.add('pxl-host');
  return el;
}
function art(rows, pal) {
  const c = mk(rows[0].length, rows.length), g = c.getContext('2d');
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (pal[r[x]]) { g.fillStyle = pal[r[x]]; g.fillRect(x, y, 1, 1); } });
  return c;
}

/* ================= Textures du jeu ================= */
const IM = {};
const loadImg = src => new Promise((ok, ko) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => ko(new Error('image ' + src)); i.src = src; });
const TC = {};
function T(name, frame) {
  const key = name + ':' + (frame || 0); if (TC[key]) return TC[key];
  const m = MC.blocks[name], c = mk(16, 16);
  if (m && IM.blocks) c.getContext('2d').drawImage(IM.blocks, 0, (m[0] + (frame || 0)) * 16, 16, 16, 0, 0, 16, 16);
  return TC[key] = c;
}
function put(g, im, x, y, rot) {
  if (!rot) { g.drawImage(im, x, y); return; }
  g.save(); g.translate(x + 8, y + 8); g.rotate(rot * Math.PI / 2); g.drawImage(im, -8, -8); g.restore();
}
function tile(w, hh, seed, choose, spin) {
  const c = mk(w * 16, hh * 16), g = c.getContext('2d'), R = rng(seed); g.imageSmoothingEnabled = false;
  for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) put(g, T(choose(R())), x * 16, y * 16, spin ? R() * 4 | 0 : 0);
  return c;
}
/* Bande de transition : la matière du dessous remonte en colonnes irrégulières dans celle du dessus. */
function band(choose, seed, spin) {
  const W = 32, Hh = 6, c = mk(W * 16, Hh * 16), g = c.getContext('2d'), R = rng(seed), hs = []; g.imageSmoothingEnabled = false;
  let cur = 3;
  for (let x = 0; x < W; x++) { cur = clamp(cur + (R() * 3 | 0) - 1, 1, 3); hs.push(cur); }
  hs[W - 1] = hs[0];
  for (let x = 0; x < W; x++) for (let y = 0; y < Hh; y++) {
    const up = Hh - y; let on = up <= hs[x];
    if (!on && up === hs[x] + 1 && R() < .32) on = true;
    if (on) put(g, T(choose(R())), x * 16, y * 16, spin ? R() * 4 | 0 : 0);
  }
  return c;
}
/* Poches de la matière du dessus qui s'enfoncent dans celle du dessous. mat : une texture du jeu, ou une image déjà
   dessinée (la croûte de magma) dont chaque poche reprend le bloc de même place, dans le prolongement de la strate du dessus. */
function seep(mat, seed, tint) {
  const c = mk(512, 48), g = c.getContext('2d'), R = rng(seed), p = [.3, .14, .05];
  let src = typeof mat === 'string' ? T(mat) : mat;
  if (tint) { src = copy(src); const t = src.getContext('2d'); t.globalCompositeOperation = 'multiply'; t.fillStyle = tint; t.fillRect(0, 0, src.width, src.height); }
  for (let y = 0; y < 3; y++) for (let x = 0; x < 32; x++) if (R() < p[y]) g.drawImage(src, x * 16 % src.width, y * 16 % src.height, 16, 16, x * 16, y * 16, 16, 16);
  return c;
}
/* ================= Magma : une croûte de lave refroidie, dessinée ici (pas la texture du jeu) =================
   Chaque bloc de 16 x 16 texels a ses plaques : des cellules de Voronoï raccordées sur ses bords, comme une texture du jeu.
   Entre elles, des fissures sombres ; celles que croise une « veine » de chaleur (le même dessin que les veines de la lave)
   rougeoient, plus ou moins selon le bloc. Plus la croûte est jeune (près de la lave), plus elle est rouge et plus ses fissures
   sont larges et vives. Texture de 512 x 256 texels, aussi large que la bande du front ; tout est calculé une fois, au chargement. */
function Crust() {
  const SX = 512, SY = 256, N = SX * SY, R = rng(61), E = new Float32Array(N), J = new Float32Array(N), P = new Float32Array(N), L = new Int8Array(N), heat = [];
  const pal = (...a) => a.map(c => [1, 3, 5].map(k => parseInt(c.slice(k, k + 2), 16)));
  const PL = pal('#1e0805', '#2e0c07', '#3e1108', '#50160a', '#631c0b', '#74220d'),       // plaques, de l'ombre à la lumière
    KR = pal('#250a06', '#701e0a', '#b23a0e', '#e8601a', '#ff9a3a', '#ffd27a'),            // fissures : rainure refroidie ... cœur jaune
    WR = pal('#80260c', '#a4340e'), LV = pal('#5a1203', '#7c1c06');                        // bords chauds ; croûte encore molle, du rouge de la lave
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const noise = (n, seed) => { const r = rng(seed), m = n * 2, lat = []; for (let k = 0; k < m * n; k++) lat.push(r());      // bruit lisse, raccord sur les bords
    return (x, y) => { const gx = x / SX * m, gy = y / SY * n, x0 = Math.floor(gx), y0 = Math.floor(gy), fx = gx - x0, fy = gy - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
      const a = x0 % m, b = y0 % n, a1 = (a + 1) % m, b1 = (b + 1) % n;
      return (lat[b * m + a] * (1 - sx) + lat[b * m + a1] * sx) * (1 - sy) + (lat[b1 * m + a] * (1 - sx) + lat[b1 * m + a1] * sx) * sy; }; };
  const heatN = noise(5, 62), heatN2 = noise(13, 63);
  for (let by = 0; by < 16; by++) for (let bx = 0; bx < 32; bx++) {
    const sd = [], n = 3 + (R() * 3 | 0);                                                  // 3 à 5 plaques par bloc
    for (let k = 0; k < n; k++) sd.push([R() * 16, R() * 16, R()]);
    heat.push(R() * R());
    for (let v = 0; v < 16; v++) for (let u = 0; u < 16; u++) {
      let d1 = 1e9, d2 = 1e9, d3 = 1e9, s1 = sd[0], ox = 0, oy = 0;
      for (const s of sd) {                                 // l'image la plus proche du germe et ses voisines : les autres sont trop loin pour compter
        let ax = u + .5 - s[0], ay = v + .5 - s[1]; ax -= 16 * Math.round(ax / 16); ay -= 16 * Math.round(ay / 16);
        const bx2 = ax < 0 ? ax + 16 : ax - 16, by2 = ay < 0 ? ay + 16 : ay - 16;
        for (let q = 0; q < 4; q++) {                       // distances au carré ; racines à la fin
          const dx = q & 1 ? bx2 : ax, dy = q & 2 ? by2 : ay, d = dx * dx + dy * dy;
          if (d < d1) { d3 = d2; d2 = d1; d1 = d; s1 = s; ox = dx; oy = dy; } else if (d < d2) { d3 = d2; d2 = d; } else if (d < d3) d3 = d;
        }
      }
      const i = (by * 16 + v) * SX + bx * 16 + u, r1 = Math.sqrt(d1);
      E[i] = Math.sqrt(d2) - r1; J[i] = Math.sqrt(d3) - r1; P[i] = s1[2]; L[i] = ox + oy < -1.2 ? 1 : 0;         // L : bord de plaque éclairé (en haut à gauche)
    }
  }
  // couleur d'un texel de croûte ; f : jeunesse (0 : vieille croûte, 1 : tout juste figée)
  const px = (x, y, f) => {
    x &= 511; y &= 255; const i = y * SX + x, e = E[i], w = 1 + f * 1.2;
    const hn = heatN(x, y) * .7 + heatN2(x, y) * .3, vein = clamp(1.5 - Math.abs(hn - .5) * 44, 0, 1);   // comme les veines de la lave : là où la chaleur vaut à peu près .5
    const g0 = clamp(vein * .78 + heat[(y >> 4) * 32 + (x >> 4)] * .4 + (J[i] < 1.5 ? .06 : 0), 0, 1), g = g0 + (1 - g0) * f * .6;
    if (e < w) {                                                                           // fissure
      if (g < .2) return KR[0];
      let k = g < .38 ? 1 : g < .56 ? 2 : g < .74 ? 3 : g < .9 ? 4 : 5;
      if (e > w * .55 && k > 1) k--;                                                       // le bord d'une fissure large est moins vif que son cœur
      return k > 2 ? KR[k] : mix(KR[k], LV[1], f * .6);
    }
    if (e < w + .6 && g > .62) return mix(WR[g > .8 ? 1 : 0], LV[1], f * .4);              // le bord des plaques rougeoie près d'une fissure chaude
    let t = 2 + Math.floor(P[i] * 2.99) + (e < 2.2 ? L[i] : 0);
    if (f < .3 && ((x & 15) === 15 || (y & 15) === 15)) t--;                               // joint des blocs, discret : une ombre d'un texel (pas encore dans la croûte molle)
    const c = PL[clamp(t, 1, 5)];
    return f > 0 ? mix(c, LV[P[i] < .5 ? 0 : 1], f * .85) : c;
  };
  const paint = (w, hh, fn) => { const c = mk(w, hh), g = c.getContext('2d'), im = g.createImageData(w, hh), d = im.data;
    for (let y = 0; y < hh; y++) for (let x = 0; x < w; x++) { const r = fn(x, y); if (!r) continue; const o = (y * w + x) * 4; d[o] = r[0]; d[o + 1] = r[1]; d[o + 2] = r[2]; d[o + 3] = r[3] === undefined ? 255 : r[3]; }
    g.putImageData(im, 0, 0); return c; };
  const tileC = paint(SX, SY, (x, y) => px(x, y, 0));

  // Le front de refroidissement : le bord de la croûte suit un contour organique, au texel près, avec des chenaux de lave
  // qui s'y enfoncent et des îlots de croûte qui flottent juste au-dessus. Bande de 512 x 96 texels, posée sur le haut de la strate.
  const W = SX, H = 96, Rf = rng(71), top = new Int16Array(W), m = new Uint8Array(W * H), LEN = 28;
  const vn = (k, seed) => { const r = rng(seed), a = []; for (let q = 0; q < k; q++) a.push(r());
    return x => { const p = x / W * k, q = Math.floor(p), t = p - q, s = t * t * (3 - 2 * t); return a[q % k] * (1 - s) + a[(q + 1) % k] * s; }; };
  const n1 = vn(5, 72), n2 = vn(14, 73), n3 = vn(41, 74), rimN = vn(23, 75), ch = [];
  for (let k = 0; k < 4; k++) ch.push([Rf() * W, 7 + Rf() * 9, 7 + Rf() * 10]);             // chenaux : position, demi-largeur, profondeur
  for (let x = 0; x < W; x++) {
    let hgt = 16 + n1(x) * 36 + n2(x) * 12 + n3(x) * 2;
    for (const c of ch) { let d = Math.abs(x - c[0]); d = Math.min(d, W - d) / c[1]; if (d < 1) hgt -= c[2] * (1 - d * d) * (1 - d * d); }
    top[x] = H - Math.max(16, Math.round(hgt));
    for (let y = top[x]; y < H; y++) m[y * W + x] = 1;
  }
  for (let k = 0; k < 8; k++) {                                                            // îlots de croûte (marqués 2) : deux ou trois galets soudés
    const x0 = Rf() * W, y0 = top[x0 | 0] - 4 - Rf() * 6;
    for (let b = 0, nb = 2 + (Rf() * 2 | 0); b < nb; b++) {
      const cx = x0 + (Rf() - .5) * 9, cy = y0 + (Rf() - .5) * 2, rx = 2.5 + Rf() * 2.5, ry = 1.4 + Rf() * 1;
      for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
        const dx = (x + .5 - cx) / rx, dy = (y + .5 - cy) / ry, j = y * W + (x % W + W) % W;
        if (y >= 0 && dx * dx + dy * dy < 1 && !m[j]) m[j] = 2;
      }
    }
  }
  const dt = inn => { const d = new Float32Array(W * H);                                  // distance (chanfrein) au premier texel hors de « inn », raccord en x
    for (let i = 0; i < W * H; i++) d[i] = inn(m[i]) ? 999 : 0;
    for (let r = 0; r < 2; r++) {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = y * W + x; if (!d[i]) continue; const l = y * W + (x + W - 1) % W, rr = y * W + (x + 1) % W;
        let b = Math.min(d[i], d[l] + 1); if (y) b = Math.min(b, d[i - W] + 1, d[l - W] + 1.41, d[rr - W] + 1.41); d[i] = b; }
      for (let y = H - 1; y >= 0; y--) for (let x = W - 1; x >= 0; x--) { const i = y * W + x; if (!d[i]) continue; const l = y * W + (x + W - 1) % W, rr = y * W + (x + 1) % W;
        let b = Math.min(d[i], d[rr] + 1); if (y < H - 1) b = Math.min(b, d[i + W] + 1, d[l + W] + 1.41, d[rr + W] + 1.41); d[i] = b; }
    }
    return d; };
  const DI = dt(v => v > 0), DO = dt(v => v !== 1), young = d => Math.pow(clamp(1 - (d - 1) / LEN, 0, 1), 1.3);
  const front = paint(W, H, (x, y) => {
    const i = y * W + x;
    if (m[i] === 2) return DI[i] < 1.5 ? KR[3] : px(x, y + SY - H, .15);                   // îlot : une plaque déjà sombre, bordée de feu
    if (m[i]) { const d = DI[i], r = rimN(x); return d < 1.5 ? KR[r > .55 ? 5 : 4] : d < 2.5 ? KR[r > .6 ? 4 : 3] : px(x, y + SY - H, young(d)); }   // liseré brûlant, puis croûte
    const d = DO[i]; if (d > 8) return null;                                               // lueur orangée qui déborde sur la lave
    return (d < 2.5 ? KR[4] : [255, 120, 32]).concat(Math.round(105 * Math.pow(1 - (d - 1) / 8, 2)));
  });
  // Sous le haut de la strate, la croûte finit de vieillir (le voile sombre de la strate passe aussi dessus).
  const seepC = paint(W, 48, (x, y) => { const f = young(DI[(H - 1) * W + x] + 1 + y); return f > .01 ? px(x, y, f) : null; });
  const block = mk(16, 16), hb = heat.indexOf(Math.max(...heat));
  block.getContext('2d').drawImage(tileC, (hb & 31) * 16, (hb >> 5) * 16, 16, 16, 0, 0, 16, 16);
  return { tile: tileC, front, seep: seepC, block };
}
function strata() {
  const sl = r => r < .2 ? 'soul_soil' : 'soul_sand', bd = () => 'bedrock', cr = Crust();
  setVar('--t-magma', cr.tile);
  setVar('--t-soul', tile(40, 24, 32, sl, false));
  setVar('--t-bedrock', tile(8, 8, 33, bd, true));
  setVar('--b-magma', cr.front);
  setVar('--b-soul', band(sl, 43, false));
  setVar('--b-bedrock', band(bd, 44, true));
  setVar('--s-magma', cr.seep);
  setVar('--s-soul', seep(cr.tile, 53, 'rgb(205,170,160)'));
  setVar('--lava', T('lava_still'));
  { const S = 64, c = mk(S, S), g = c.getContext('2d'), R = rng(77), n = 8, lat = [];
    for (let k = 0; k < n * n; k++) lat.push(R());
    for (let y = 0; y < S; y += 2) for (let x = 0; x < S; x += 2) {          // bruit lisse, raccord sur ses bords, par carrés de 2 texels
      const gx = x / S * n, gy = y / S * n, x0 = gx | 0, y0 = gy | 0, fx = gx - x0, fy = gy - y0, sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy), x1 = (x0 + 1) % n, y1 = (y0 + 1) % n;
      const v = (lat[y0 * n + x0] * (1 - sx) + lat[y0 * n + x1] * sx) * (1 - sy) + (lat[y1 * n + x0] * (1 - sx) + lat[y1 * n + x1] * sx) * sy;
      g.fillStyle = 'rgba(0,0,0,' + clamp(.4 + (v - .22) * 4, .4, 1).toFixed(2) + ')'; g.fillRect(x, y, 2, 2); }
    setVar('--lavamask', c); }
  $$('.depth a').forEach(a => { if (MC.blocks[a.dataset.tex]) a.style.backgroundImage = dataUrl(a.dataset.tex === 'magma' ? cr.block : T(a.dataset.tex)); });   // le magma : un bloc de la croûte
}

/* ================= Icônes : objets du jeu, blocs vus en trois quarts ================= */
function iso(t) {
  const c = mk(32, 32), g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  g.setTransform(1, .5, -1, .5, 16, 0); g.drawImage(t, 0, 0);
  g.setTransform(1, .5, 0, 1, 0, 8); g.drawImage(t, 0, 0); g.fillStyle = 'rgba(0,0,0,.3)'; g.fillRect(0, 0, 16, 16);
  g.setTransform(1, -.5, 0, 1, 16, 16); g.drawImage(t, 0, 0); g.fillStyle = 'rgba(0,0,0,.52)'; g.fillRect(0, 0, 16, 16);
  g.setTransform(1, 0, 0, 1, 0, 0);
  return c;
}
const ICONS = {};
function icon(name) {
  if (ICONS[name]) return ICONS[name];
  let c;
  if (name.indexOf('+') > 0) { c = mk(16, 16); name.split('+').forEach(n => c.getContext('2d').drawImage(icon(n), 0, 0, 16, 16)); }
  else if (name.indexOf('block:') === 0 && MC.blocks[name.slice(6)]) c = iso(T(name.slice(6)));
  else if (MC.items[name] !== undefined && IM.items) { c = mk(16, 16); c.getContext('2d').drawImage(IM.items, 0, MC.items[name] * 16, 16, 16, 0, 0, 16, 16); }
  else c = iso(T('gold_block'));
  return ICONS[name] = c;
}
function sprites() {
  setVar('--soullamp', icon('soul_lantern'));
  setVar('--oak', T('oak_planks'));
  setVar('--lock', art(['..kkkk..', '.k....k.', '.k....k.', 'kkkkkkkk', 'kyyyyyyk', 'kyyddyyk', 'kyyddyyk', 'kyyyyyyk', 'kkkkkkkk'], { k: '#1c1410', y: '#d9a521', d: '#4a3210' }));
}

/* ================= La scène 3D et son pilotage par le défilement ================= */
let world = null, mx = 0, my = 0;
const lac = $('#lac'), aby = $('#abysse'), canvas = $('#scene');
function Scene() {
  if (!window.NetherWorld || !canvas || QS.has('nogl')) { root.classList.add('no-gl'); return; }
  try { world = window.NetherWorld.create(canvas, IM, { still: SHOT }); } catch (e) { world = null; if (window.console) console.error(e); }
  if (!world) { root.classList.add('no-gl'); return; }
  root.classList.add('gl');
  if (matchMedia('(pointer: fine)').matches && !REDUCE) addEventListener('pointermove', e => { mx = (e.clientX / innerWidth - .5) * 2; my = (e.clientY / innerHeight - .5) * 2; }, { passive: true });
}
const pinLen = () => Math.max(0, lac.offsetHeight - innerHeight);
function drawScene(t) {
  if (!world) return false;
  const pin = pinLen(), sy = SY();
  if (aby.getBoundingClientRect().bottom < -40) return false;          // tout est recouvert par les strates : inutile de dessiner
  // Plongée finie, on descend vers la coupe sombre : le décor cesse de suivre la souris (sinon il se décale
  // par rapport à la coupe et à l'encart, et la ligne de pêche se désaxe). Il se recentre en douceur.
  const after = Math.max(0, sy - pin), s = clamp(after / 80, 0, 1), follow = 1 - s * s * (3 - 2 * s);
  world.frame(REDUCE ? 20 : t, { p: pin ? clamp(sy / pin, 0, 1) : 0, after, vh: innerHeight, mx: mx * follow, my: my * follow, texel: innerWidth < 700 ? 2 : 3, scroll: sy, origin: pin, depth: aby.offsetHeight, calm: REDUCE });
  return true;
}

/* ================= La ligne de pêche ================= */
function Rig() {
  /* Un seul objet au bout de la ligne : le flotteur du jeu (une bouée, et son hameçon dessous).
     Il flotte à la surface, puis descend avec la ligne quand on fait défiler, et son hameçon accroche l'anneau de l'encart.
     Texture 8 x 8 : la ligne s'attache en haut de la bouée (4,5 ; 1), l'hameçon se courbe vers (3,5 ; 7,5). */
  const el = $('#rig'), line = $('.rig-line', el), bob = $('.rig-bob', el), card = $('#launcher'), ring = $('.ring', card);
  const hint = $('#hint'); let y = null, hooked = false, struck = false, hw = 0;
  addEventListener('resize', () => { hw = 0; }, { passive: true });          // la largeur de l'étiquette change avec la taille du texte
  function frame(t, dt) {
    if (!world) { if (!hooked) { hooked = true; card.classList.add('hooked'); } el.style.display = 'none'; return; }
    const tp = world.tip(), bb = world.bob(), rr = ring.getBoundingClientRect(), vh = innerHeight, u = innerWidth < 700 ? 2 : 3;
    const rx = rr.left + rr.width / 2, ry = rr.top + rr.height / 2;
    const surf = bb ? bb.y : -9999, bx = bb ? bb.x : innerWidth / 2;
    const catchY = ry - 3.5 * u;                          // hauteur où l'hameçon passe dans l'anneau
    const want = REDUCE ? catchY : clamp(vh * .62, Math.min(surf, vh * 1.2), catchY);
    y = y === null || dt === undefined ? want : y + (want - y) * (1 - Math.exp(-dt * 11));
    if (Math.abs(want - y) < .6) y = want;
    if (!hooked && y >= catchY - 3 && ry < vh * 1.05) { hooked = true; card.classList.add('hooked'); if (!struck && !SHOT) { struck = true; world.strike(); toast('prise', 'fishing_rod', 'Progrès réalisé !', 'Belle prise'); } }
    else if (hooked && !REDUCE && want < catchY - 70) { hooked = false; card.classList.remove('hooked'); }
    const ax = tp ? tp.x : bx, ay = tp ? tp.y : -200;
    // bout de la ligne = haut de la bouée ; à la surface, la bouée flotte à moitié immergée et danse un peu
    const under = Math.max(0, y - surf);
    const near = clamp((y - (catchY - 150)) / 150, 0, 1), kx = near * near * (3 - 2 * near);
    const ex = hooked ? rx + u : (bx + Math.sin(t * 1.3) * Math.min(6, under * .02)) * (1 - kx) + (rx + u) * kx;
    const ey = hooked ? catchY - 1.5 * u : (under > 0 ? y : surf + Math.sin(t * 2.2) * 1.2) - 1.5 * u;
    const dx = ex - ax, dy = ey - ay, len = Math.hypot(dx, dy);
    line.style.height = len + 'px';
    line.style.transform = 'translate(' + ax + 'px,' + ay + 'px) rotate(' + Math.atan2(-dx, dy) + 'rad)';
    line.style.setProperty('--air', (ey <= surf || dy <= 0 ? len : len * clamp((surf - ay) / dy, 0, 1)) + 'px');
    const show = ey > -40 && ey < vh + 40;
    bob.style.opacity = show ? 1 : 0;
    if (show) bob.style.transform = 'translate(' + ex + 'px,' + ey + 'px)';
    bob.classList.toggle('sunk', !hooked && under > 2 * u);
    // « Suis la ligne » à gauche de la ligne, loin des pattes de l'arpenteur ; à droite seulement s'il n'y a pas la place
    if (hint && bb && surf > -30 && surf < vh + 30) { if (!hw) hw = hint.offsetWidth; const gap = u === 2 ? 14 : 22, lx = bx - gap - hw; hint.style.left = (lx >= 8 ? lx : clamp(bx + gap, 8, innerWidth - hw - 8)) + 'px'; }
  }
  return { frame };
}

/* L'encart du launcher se cale sous la ligne de pêche ; un squelette englouti occupe la place libérée à droite. */
function Catch() {
  const card = $('#launcher'), sec = card.parentElement, box = $('.bones');
  let fig = null, cv = null, vis = false;
  if (box && !box.children.length && window.NetherWorld && window.NetherWorld.sunk && IM.skeleton) {
    cv = mk(2, 2); box.appendChild(cv);
    try { fig = window.NetherWorld.sunk(cv, IM.skeleton); } catch (e) { fig = null; }
    if (!fig) { cv.remove(); cv = null; }
    if ('IntersectionObserver' in window) new IntersectionObserver(es => { vis = es[0].isIntersecting; }).observe(box); else vis = true;
  }
  let key = '';
  function align() {
    const rx = world ? world.restX() : null, k = innerWidth + 'x' + innerHeight + ':' + card.offsetHeight + ':' + (rx === null ? '-' : Math.round(rx));
    if (k === key) return; key = k;
    const cs = getComputedStyle(sec), sr = sec.getBoundingClientRect(), pl = parseFloat(cs.paddingLeft), pr = parseFloat(cs.paddingRight);
    const cw = card.offsetWidth, nat = sr.left + pl + (sr.width - pl - pr) / 2;          // centre de l'encart sans décalage
    const lo = 16 - (nat - cw / 2), hi = innerWidth - 16 - (nat + cw / 2);
    const shift = rx === null || lo > hi ? 0 : Math.round(clamp(rx - nat, lo, hi));
    card.style.left = shift + 'px';
    if (!box) return;
    const left = nat + shift + cw / 2 + 28 - sr.left, width = sr.width - left - (innerWidth > 700 ? 56 : 12);
    box.hidden = width < 170;
    if (box.hidden) return;
    box.style.left = left + 'px'; box.style.width = width + 'px';
    box.style.top = card.offsetTop + 'px'; box.style.height = card.offsetHeight + 'px';
    if (cv) { const d = Math.min(window.devicePixelRatio || 1, 2), hgt = Math.min(card.offsetHeight * 1.05, width * 1.5); cv.width = Math.round(width * d); cv.height = Math.round(hgt * d); cv.style.height = hgt + 'px'; }
  };
  align.frame = (t, force) => { if (fig && box && !box.hidden && (vis || force)) fig.frame(REDUCE ? 20 : t); };
  return align;
}

/* ================= Interface ================= */
function Tips() {
  const ul = $('#tips'); if (!ul) return;
  const lis = $$('li', ul), bar = h('div', { class: 'hotbar', role: 'tablist', 'aria-label': 'Ce que fait le launcher' }), out = h('div', { class: 'tip', role: 'tabpanel', id: 'tip', 'aria-live': 'polite' });
  let cur = -1; const btns = [];
  const sel = i => {
    if (i === cur) return; cur = i;
    btns.forEach((b, j) => { b.setAttribute('aria-selected', j === i ? 'true' : 'false'); b.tabIndex = j === i ? 0 : -1; });
    out.textContent = ''; Array.from(lis[i].children).forEach(c => out.appendChild(c.cloneNode(true)));
    const st = $('strong', out); if (st) pxLabel(st, st.textContent);
  };
  lis.forEach((li, i) => {
    const b = h('button', { class: 'slot', type: 'button', role: 'tab', 'aria-controls': 'tip', 'aria-label': $('strong', li).textContent }, copy(icon(li.dataset.icon)));
    ['click', 'mouseenter', 'focus'].forEach(ev => b.addEventListener(ev, () => sel(i)));
    b.addEventListener('keydown', e => { const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0; if (d) { e.preventDefault(); const j = (i + d + lis.length) % lis.length; sel(j); btns[j].focus(); } });
    btns.push(b); bar.appendChild(b);
  });
  ul.hidden = true; ul.after(bar, out); sel(0);
}

function Download() {
  const L = CFG.launcher || {}, Cm = CFG.community || {}, btn = $('#dl'), meta = $('#dl-meta'), head = $('.top a[href="#launcher"]');
  if (!btn) return;
  if (L.url) {
    const a = h('a', { class: 'btn btn-main btn-big', id: 'dl', href: L.url, download: '' }); btn.replaceWith(pxLabel(a, 'Télécharger pour Windows'));
    const extra = [L.version && 'version ' + L.version, L.size].filter(Boolean).join(' · ');
    if (extra && meta) meta.textContent = extra + ' · ' + meta.textContent;
  } else {
    pxLabel(btn, 'Bientôt disponible');
    if (head) { head.classList.remove('tbtn-main'); pxLabel(head, 'Le launcher'); }       // ne promet pas un téléchargement qui n'existe pas encore
    const d = L.opening ? new Date(L.opening) : null, days = d && !isNaN(d) ? Math.ceil((d - Date.now()) / 864e5) : 0;
    if (days > 0 && meta) meta.before(h('p', { class: 'countdown', text: 'Ouverture prévue le ' + d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) + ' · dans ' + days + (days > 1 ? ' jours' : ' jour') }));
  }
  if (Cm.url) {
    const mkLink = () => pxLabel(h('a', { class: 'btn btn-main community', href: Cm.url, rel: 'noopener' }), Cm.label || 'Rejoindre la communauté');
    if (meta) meta.after(mkLink());
  }
}

/* Le chantier : les 5 dernières nouvelles du site, du launcher et du jeu. assets/journal.json est réécrit toutes les heures
   par une tâche GitHub (.github/journal/build.mjs) à partir des lignes « Journal(…): » des commits des projets. */
const PROJETS = { site: 'Site', launcher: 'Launcher', jeu: 'Jeu' };
function Journal() {
  const ol = $('#journal'); if (!ol) return;
  const quand = iso => {
    const d = new Date(iso), j = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 864e5);
    return j <= 0 ? "aujourd'hui" : j === 1 ? 'hier' : j < 7 ? 'il y a ' + j + ' jours' : d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
  };
  fetch('assets/journal.json', { cache: 'no-cache' }).then(r => { if (!r.ok) throw new Error('journal ' + r.status); return r.json(); }).then(j => {
    const list = (j.entries || []).filter(e => PROJETS[e.p] && e.t && e.d).slice(0, 5); if (!list.length) return;
    ol.textContent = '';
    list.forEach(e => ol.appendChild(h('li', { class: 'j-e', 'data-p': e.p },
      h('span', { class: 'j-p' }, PROJETS[e.p]), h('span', { class: 'j-t', text: e.t }), h('time', { class: 'j-d', datetime: e.d, text: quand(e.d) }))));
  }).catch(e => { if (window.console) console.warn(e); });
}

/* Notifications de progrès, comme en jeu : une seule fois par visite et par progrès. */
let toast = () => {};
function Toasts() {
  const box = h('div', { class: 'toasts', 'aria-live': 'polite' }), seen = new Set(); D.body.appendChild(box);
  return (key, ic, title, name) => {
    if (seen.has(key)) return; seen.add(key);
    const el = h('div', { class: 'toast', role: 'status' }, h('span', { class: 'toast-ic' }, copy(icon(ic))), pxLabel(h('span', { class: 'toast-t' }), title), pxLabel(h('span', { class: 'toast-n' }), name));
    box.appendChild(el);
    requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add('in')));
    if (QS.get('toast') !== 'hold') setTimeout(() => { el.classList.remove('in'); setTimeout(() => el.remove(), 600); }, 4500);
  };
}

/* L'écran F3 : la position du visiteur, comme dans le jeu. */
function F3() {
  const box = h('div', { class: 'f3', 'aria-hidden': 'true' }), rows = [0, 1, 2, 3].map(() => h('span')), cache = [];
  rows.forEach(r => box.appendChild(r)); D.body.appendChild(box);
  const set = (i, txt) => { if (cache[i] !== txt) { cache[i] = txt; pxLabel(rows[i], txt); } };
  set(0, 'The Last 26.1.2 (thelastmc.fr)');
  const BIOME = ['nether_wastes', 'nether_wastes', 'basalt_deltas', 'soul_sand_valley', 'soul_sand_valley'];
  return (y, cur, label) => { set(1, 'XYZ: 0.500 / ' + y.toFixed(1) + ' / 46.700'); set(2, 'Biome: minecraft:' + BIOME[cur]); set(3, 'Couche: ' + label); };
}

function Depth(f3) {
  const links = $$('.depth a'), secs = links.map(a => $(a.dataset.sec)), names = links.map(a => a.textContent.trim()), top = $('#top'), floor = $('#fond');
  let last = -1;
  return function update() {
    const mid = innerHeight * .5, pin = pinLen(); let cur = 0;
    secs.forEach((s, i) => { if (s && s.getBoundingClientRect().top <= mid) cur = i; });
    if (cur !== last) { last = cur; links.forEach((a, i) => { if (i === cur) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current'); }); if (cur === secs.length - 1) toast('fond', 'block:bedrock', 'Progrès réalisé !', 'Au fond du Nether'); }
    // coordonnée Y : la mer de lave du Nether est à 31 ; on descend jusqu'à la bedrock (0)
    const camY = world ? world.camY() : 5, f = floor.getBoundingClientRect().top - mid, sy = SY();
    const y = sy <= pin ? 31 + camY - 1 : f <= 0 ? 0 : 32 * clamp(f / Math.max(1, f + sy - pin), 0, 1);
    f3(y, cur, names[cur]);
    root.classList.toggle('in-scene', cur <= 1 && aby.getBoundingClientRect().top > innerHeight * .2);
    top.classList.toggle('solid', sy > pin + innerHeight * .45);
    root.classList.toggle('scrolled', sy > 60);
  };
}

/* ================= Démarrage ================= */
$$('.px').forEach(pxText);
const rig = Rig();
let depth = () => {}, align = () => {};

function start() {
  strata(); sprites();
  Scene();
  toast = Toasts();
  align = Catch();
  $$('.top .tbtn').forEach(b => pxLabel(b, b.textContent));
  Tips(); Download(); Journal();
  depth = Depth(F3()); depth();
  if (QS.has('toast')) toast('demo', 'fishing_rod', 'Progrès réalisé !', 'Belle prise');
  root.classList.add('ready');
  if (SHOT) {                                            // mode capture : une image figée, pour les essais automatiques
    const shoot = () => {                               // le navigateur sans tête change la taille de la fenêtre après coup : on refait tout
      $('#monde').style.marginTop = '0px';
      shotY = QS.get('at') ? Math.max(0, Math.round($('#' + QS.get('at')).getBoundingClientRect().top) + (+QS.get('dy') || 0)) : +(QS.get('y') || 0); $('#monde').style.marginTop = -shotY + 'px'; D.body.style.overflow = 'hidden';
      let t = +(QS.get('t') || 20) - 5;
      for (let i = 0; i < 100; i++) { t += .05; drawScene(t); align(); if (align.frame) align.frame(t, true); rig.frame(t, .05); }
      depth();
    };
    shoot(); addEventListener('resize', shoot); const tops = {}; ['abysse', 'launcher', 'magma', 'ames', 'fond'].forEach(id => { tops[id] = Math.round($('#' + id).getBoundingClientRect().top + shotY); }); tops.end = Math.round($('#monde').offsetHeight);
    D.title = 'ready ' + JSON.stringify(tops);
    return;
  }
  if (QS.has('fps')) {                                   // mesure de fluidité (essais) : cadence réelle et coût par image
    const box = h('pre', { style: 'position:fixed;left:8px;top:70px;z-index:99;background:#000;color:#0f0;font:16px monospace;padding:8px' });
    D.body.appendChild(box); let n = 0, work = 0, worst = 0; const t0 = performance.now();
    if (QS.get('y')) scrollTo(0, +QS.get('y'));
    let skip = 6; const times = [];
    const tick = () => { if (skip > 0) { skip--; drawScene(performance.now() / 1000); requestAnimationFrame(tick); return; } const a = performance.now(); drawScene(a / 1000); rig.frame(a / 1000, .016); depth(); const d = performance.now() - a; n++; work += d; worst = Math.max(worst, d);
      const el = (performance.now() - t0) / 1000; if (el < 30) requestAnimationFrame(tick); times.push(d); box.textContent = 'fps ' + (n / el).toFixed(1) + ' sur ' + el.toFixed(1) + ' s | mediane ' + times.slice().sort((x, y) => x - y)[times.length >> 1].toFixed(2) + ' ms' + ' | js ' + (work / n).toFixed(2) + ' ms | pire ' + worst.toFixed(1) + ' ms | ' + JSON.stringify(world && world.info && { W: world.info().W, H: world.info().H, q: world.info().quality }); };
    requestAnimationFrame(tick); return;
  }
  let last = performance.now() / 1000;
  const loop = ms => {
    requestAnimationFrame(loop);
    const t = ms / 1000, raw = t - last;
    if (raw < .012 || D.hidden) return;                  // inutile de dépasser ~80 images par seconde sur les écrans rapides
    last = t;
    drawScene(t); align(); if (align.frame) align.frame(t); rig.frame(t, raw); depth();
  };
  requestAnimationFrame(loop);
}
Promise.all([loadImg('assets/mc/blocks.png'), loadImg('assets/mc/items.png'), loadImg('assets/mc/piglin.png'), loadImg('assets/mc/strider.png'), loadImg('assets/mc/ghast.png').catch(() => null), loadImg('assets/mc/strider_saddle.png').catch(() => null),
    loadImg('assets/mc/skeleton.png').catch(() => null)])
  .then(a => { IM.blocks = a[0]; IM.items = a[1]; IM.piglin = a[2]; IM.strider = a[3]; IM.ghast = a[4]; IM.saddle = a[5]; IM.skeleton = a[6]; start(); })
  .catch(e => { root.classList.add('no-gl'); if (window.console) console.error(e); Download(); Journal(); $('#launcher').classList.add('hooked'); });
})();
