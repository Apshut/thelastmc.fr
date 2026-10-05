/* The Last — château « fuseB » : la forteresse EST la bête.
   Il n'y a plus un mur avec une tête posée dessus : toute la façade est une seule créature. Le titre, creusé puis rempli d'or,
   brûle au fond de sa gueule ouverte ; la lèvre du haut le surplombe avec une rangée de crocs d'os, la mâchoire du bas porte
   ses dents, deux défenses montent des commissures où la lave bave jusqu'au lac. Au-dessus : le mufle aux naseaux de feu,
   deux yeux de lave à pupille fendue sous un lourd sourcil rouge en V, le dôme du crâne, la crinière de flammes et les grandes
   cornes baguées d'or. Les deux tours à bulbe rouge sont ses épaules ; la porte est une seconde gueule, dans le menton.
   Repère : x vers la droite, y vers le haut, z vers le spectateur. Sol de l'île à y = 2. Symétrie autour de la case x = 0
   (la case x a pour miroir la case -x ; en coordonnées décimales, x a pour miroir 1 - x). */
window.NETHER_CASTLE = function (a, o) {
  'use strict';
  const two = !!o && o.lines === 2, abs = Math.abs, N = a.noise;
  const XM = two ? 18 : 38;
  const both = f => { f(1); f(-1); };
  const hash = (x, y, z) => { let n = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(z, 1274126177)) | 0; n = Math.imul(n ^ (n >>> 13), 1103515245); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; };
  const set = (x, y, z, n) => { if (x >= -XM && x <= XM) a.set(x, y, z, n); };
  const S = (x, y, z, n) => { set(x, y, z, n); if (x) set(-x, y, z, n); };                     // pose symétrique
  const fill = (x0, y0, z0, x1, y1, z1, n) => {
    const f = typeof n === 'function' ? n : null;
    for (let y = y0; y <= y1; y++) for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) { const m = f ? f(x, y, z) : n; if (m !== undefined) set(x, y, z, m); }
  };
  /* boîte libre donnée pour le côté droit, reflétée autour de l'axe (x = .5) pour le côté gauche */
  const box = (s, x0, y0, z0, x1, y1, z1, tex, opt) => s > 0 ? a.box(x0, y0, z0, x1, y1, z1, tex, opt) : a.box(1 - x1, y0, z0, 1 - x0, y1, z1, tex, opt);
  const BONE = 'bone_block_side', QTZ = 'quartz_block_side';

  /* ---------- matières : maçonnerie de bastion, symétrique ---------- */
  const wall = (x, y, z) => {
    const ax = abs(x), r = hash(ax, y, z), n = N(ax * .23 + 7, y * .31 + z * .17), g = N(ax * .21 + 40, y * .27 + z * .19 + 9);
    if (g > .78) return r < .62 ? 'gilded' : 'blackstone';                                    // l'or affleure par grappes
    if (n > .7) return r < .5 ? 'cracked' : 'blackstone';
    return r < .8 ? 'bricks' : r < .92 ? 'cracked' : 'polished';
  };
  const skin = (x, Y, Z) => {
    const r = hash(x, Y, Z + 77), n = N(x * .27 + 3, Y * .33 + Z * .21 + 5), g = N(x * .22 + 60, Y * .3 + Z * .17 + 31);
    if (g > .8) return r < .7 ? 'gilded' : 'blackstone';
    if (n > .64) return r < .7 ? 'blackstone' : 'basalt';
    return r < .78 ? 'bricks' : r < .9 ? 'cracked' : 'blackstone';
  };
  const soul = (x, y, z) => { set(x, y, z, 'soul_soil'); a.cross(x, y + 1, z, 'soul_fire_0', { emit: 1, light: 13 }); };

  /* dent conique en trois tronçons ; dir = +1 se dresse, -1 pend */
  const TAPER = [[1, .4], [.66, .34], [.34, .26]];
  function tooth(cx, y, cz, len, w, dir) {
    let yy = y;
    TAPER.forEach((g, k) => { const h = len * g[1], hw = w * g[0] / 2, y0 = dir > 0 ? yy : yy - h; a.box(cx - hw, y0, cz - hw * .85, cx + hw, y0 + h, cz + hw * .85, k === 2 ? QTZ : BONE); yy += dir * h; });
  }
  const teeth = (d, y, cz, len, w, dir) => { tooth(.5 + d, y, cz, len, w, dir); tooth(.5 - d, y, cz, len, w, dir); };   // la paire symétrique, à d de l'axe
  /* défense : un grand croc courbe, en tronçons qui s'affinent ; base centrée en (x, y, z) ; côté droit */
  function tusk(s, x, y, z, h, w, bulge, lean) {
    const n = 11;
    for (let k = 0; k < n; k++) {
      const t0 = k / n, t1 = (k + 1) / n, tm = (t0 + t1) / 2, ww = w * (1 - Math.pow(tm, 1.25) * .86), off = Math.sin(tm * Math.PI) * bulge - tm * tm * lean;
      box(s, x + off - ww / 2, y + h * t0, z - ww * .42, x + off + ww / 2, y + h * t1, z + ww * .42, k >= n - 3 ? QTZ : BONE);
    }
  }

  /* ---------- cotes ---------- */
  const PZ = 3;                                   // plan de la plaque du titre (lettres creusées à z = PZ, or juste derrière)
  const MW = two ? 15 : 26;                       // demi-largeur de la gueule
  const LW = two ? 1 : 2;                         // largeur des coulées de lave aux commissures
  const PX = MW + LW + 1;                         // poteau d'angle : la charnière de la mâchoire
  const LIP0 = 8, LIP1 = two ? 29 : 20;           // lèvre du bas, lèvre du haut
  const hy = LIP1 - 1, hz = PZ + 1;               // origine de la tête : sa lèvre (Y = 1) est la lèvre du haut
  const ZB = -8;                                  // dos du corps
  const pools = [];

  /* ---------- le lac vient lécher le pied des murs ---------- */
  for (let z = PZ + 3; z <= 22; z++) for (let x = -64; x <= 64; x++) pools.push([x, z]);

  /* ---------- le corps (une coquille) et le fond de la gueule : plaque polie, gencives rouges ---------- */
  fill(-PX, 0, ZB, PX, LIP1, PZ, (x, y, z) => {
    if (z === PZ) return (abs(x) <= MW && y > LIP0 && y < LIP1) ? ((y === LIP0 + 1 || y === LIP1 - 1) ? 'rnbricks' : 'polished') : wall(x, y, z);
    return (z === ZB || abs(x) === PX) ? wall(x, y, z) : undefined;
  });
  const FONT = {
    T: ['######', '######', '..##..', '..##..', '..##..', '..##..', '..##..', '..##..'],
    H: ['##..##', '##..##', '##..##', '######', '######', '##..##', '##..##', '##..##'],
    E: ['######', '######', '##....', '#####.', '#####.', '##....', '######', '######'],
    L: ['##....', '##....', '##....', '##....', '##....', '##....', '######', '######'],
    A: ['..##..', '.####.', '##..##', '##..##', '######', '##..##', '##..##', '##..##'],
    S: ['.#####', '######', '##....', '#####.', '.#####', '....##', '######', '#####.']
  };
  const word = (str, x0, yTop) => { let x = x0; for (const ch of str) { FONT[ch].forEach((row, j) => { for (let i = 0; i < 6; i++) if (row[i] === '#') { set(x + i, yTop - j, PZ, null); set(x + i, yTop - j, PZ - 1, 'goldglow'); } }); x += 7; } };
  if (two) { word('THE', -10, LIP1 - 3); word('LAST', -13, LIP0 + 9); } else { word('THE', -25, LIP0 + 9); word('LAST', -1, LIP0 + 9); }

  /* ---------- le menton : mur de bastion, frise ciselée, contreforts, meurtrières ---------- */
  fill(-PX, 0, PZ + 2, PX, LIP0 - 1, PZ + 2, (x, y, z) => y === LIP0 - 1 ? (abs(x) % 4 === 0 ? 'gilded' : 'chiseled') : wall(x, y, z));
  fill(-PX, 0, PZ + 3, PX, 1, PZ + 3, (x, y, z) => hash(abs(x), y, z) < .5 ? 'blackstone' : 'basalt');           // empattement
  (two ? [9] : [10, 18]).forEach(px => both(s => {
    const x = s * px;
    fill(x, 0, PZ + 3, x, LIP0 - 2, PZ + 3, 'pbasalt'); set(x, LIP0 - 1, PZ + 3, 'chiseled');
    fill(x, 0, PZ + 4, x, 3, PZ + 4, 'pbasalt'); set(x, 4, PZ + 4, 'polished'); fill(x, 0, PZ + 5, x, 1, PZ + 5, 'blackstone');
  }));
  (two ? [12] : [14, 22]).forEach(px => both(s => {
    const x = s * px;
    for (let y = 3; y <= 5; y++) { set(x, y, PZ + 2, null); set(x, y, PZ + 1, 'glass_o'); }
    set(x, 2, PZ + 2, 'polished'); set(x, 6, PZ + 2, 'polished');
  }));

  /* ---------- la lèvre du bas ; derrière elle, une rigole de lave cachée éclaire la gorge par en dessous ---------- */
  fill(-PX, LIP0, PZ + 1, PX, LIP0, PZ + 3, (x, y, z) => z === PZ + 3 ? 'rnbricks' : (z === PZ + 1 && abs(x) < MW) ? 'lava' : 'polished');

  /* ---------- les commissures : la lave coule du coin de la lèvre du haut, déborde la lèvre du bas et tombe au lac ---------- */
  both(s => {
    for (let i = 1; i <= LW; i++) {
      const x = s * (MW + i);
      for (let y = LIP0 + 1; y < LIP1; y++) { set(x, y, PZ, 'blackstone'); set(x, y, PZ + 1, 'lavafall'); }
      for (let z = PZ + 1; z <= PZ + 3; z++) set(x, LIP0, z, 'lava');
      for (let y = 0; y <= LIP0; y++) set(x, y, PZ + 4, 'lavafall');
    }
    for (let i = 0; i < (two ? 2 : 1); i++) {                                                  // poteaux d'angle
      const x = s * (PX + i);
      fill(x, 0, PZ + 1, x, LIP1 - 1, PZ + 3, 'pbasalt'); set(x, LIP0, PZ + 3, 'gold'); set(x, LIP1 - 1, PZ + 3, 'chiseled');
    }
  });

  /* ---------- la lèvre du haut : un bourrelet rouge en surplomb, plus avancé sous le mufle ---------- */
  for (let x = 0; x <= PX + 1; x++) for (let z = PZ + 1; z <= (x <= 7 ? PZ + 5 : PZ + 4); z++) S(x, LIP1, z, 'rnbricks');
  S(PX + 1, LIP1, PZ + 4, 'gold');

  /* ---------- les crocs : ceux du haut pendent au-dessus des lettres, ceux du bas se dressent ---------- */
  for (let d = 1.5, k = 0; d <= MW - (two ? 5 : 2.5); d += 2, k++) teeth(d, LIP1, d <= 7.5 ? PZ + 5.5 : PZ + 4.5, k % 2 ? 1.6 : 2.3, k % 2 ? 1 : 1.25, -1);
  if (two) { teeth(12.2, LIP1, PZ + 4.5, 8.5, 2.1, -1); teeth(14.6, LIP1, PZ + 4.5, 1.7, 1, -1); }      // sabres de part et d'autre de « THE »
  else teeth(26, LIP1, PZ + 4.5, 4.2, 1.5, -1);                                                           // canines des commissures
  for (let d = .5; d <= MW - 2.5; d += 2) teeth(d, LIP0 + 1, PZ + 3.5, .85, .8, 1);
  if (two) teeth(14.5, LIP0 + 1, PZ + 3.5, 2.2, 1.2, 1); else teeth(25, LIP0 + 1, PZ + 3.5, 3, 1.4, 1);

  /* ---------- les défenses, plantées sur leur socle aux coins de la mâchoire ---------- */
  both(s => {
    const x0 = two ? 17 : 29, x1 = two ? 18 : 31;
    for (let x = x0; x <= x1; x++) for (let z = PZ + 4; z <= PZ + 5; z++) {
      fill(s * x, 0, z, s * x, LIP0 - 1, z, (X, y) => (x === x0 || x === x1) && z === PZ + 5 ? 'pbasalt' : wall(X, y, z));
      set(s * x, LIP0, z, z === PZ + 5 ? 'gold' : 'gilded');
    }
    if (two) tusk(s, 17.8, LIP0 + 1, PZ + 5, 10.5, 1.9, .3, 1.2); else tusk(s, 30.3, LIP0 + 1, PZ + 5, 11.2, 2.4, 1.5, 1);
  });

  /* ---------- la tête ---------- */
  (function head() {
    const P = (x, Y, Z, n) => S(x, hy + Y, hz + Z, n);
    const W = [0, 0, 17, 17, 17, 17, 17, 17, 17, 17, 17, 17, 16, 15, 13, 10];
    const ZF = [0, 0, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, -1, -3], ZH = -11;
    // crâne
    for (let Y = 2; Y <= 15; Y++) for (let Z = ZH; Z <= ZF[Y]; Z++) {
      const df = ZF[Y] - Z, db = Z - ZH, w = W[Y] - (df === 0 ? 2 : df === 1 ? 1 : 0) - (db === 0 ? 2 : db === 1 ? 1 : 0);
      for (let x = 0; x <= w; x++) P(x, Y, Z, skin(x, Y, Z));
    }
    // bajoues : la tête s'élargit jusqu'aux commissures, en gradins hérissés d'os
    if (!two) {
      const JW = { 2: 28, 3: 27, 4: 25, 5: 23, 6: 21, 7: 19 };
      for (const k in JW) for (let x = 16; x <= JW[k]; x++) for (let Z = -6; Z <= (x >= JW[k] - 1 ? 0 : 1); Z++) P(x, +k, Z, x >= JW[k] - 1 && Z === 0 ? 'polished' : skin(x, +k, Z));
      both(s => [[27, 4], [25, 5], [23, 6], [21, 7]].forEach(q => {
        box(s, q[0] - .55, hy + q[1], hz - .05, q[0] + .55, hy + q[1] + 1.2, hz + 1.05, BONE); box(s, q[0] - .28, hy + q[1] + 1.2, hz + .22, q[0] + .28, hy + q[1] + 2.1, hz + .78, QTZ);
      }));
    }
    // pilastres des tempes, frise du front
    for (let Y = 2; Y <= 11; Y++) { P(15, Y, 1, 'pbasalt'); P(16, Y, 0, 'pbasalt'); }
    for (let x = 0; x <= 11; x++) P(x, 14, -1, x % 3 === 0 ? 'gilded' : 'chiseled');
    // mufle : il avance en gradins et déborde la lèvre ; naseaux de lave et de feu
    const MZ = { 2: [[6, 4], [4, 5]], 3: [[6, 4], [4, 5]], 4: [[5, 3], [3, 4]], 5: [[3, 2], [2, 3]], 6: [[1, 2]], 7: [[1, 2]] };
    for (const k in MZ) MZ[k].forEach(q => { for (let x = 0; x <= q[0]; x++) for (let Z = 2; Z <= q[1]; Z++) P(x, +k, Z, x === 0 && +k >= 4 ? 'pbasalt' : 'sbasalt'); });
    for (let x = 2; x <= 3; x++) { P(x, 3, 5, null); P(x, 3, 4, 'lava'); P(x, 4, 4, null); P(x, 4, 3, 'lava'); }
    both(s => { a.fire(s * 2, hy + 3, hz + 5); a.fire(s * 3, hy + 3, hz + 5); });
    // yeux : orbites creusées, iris de lave, pupille fendue
    const EYE = ['......ooooo', '...oooooooo', 'ooooooooooo', 'oooooooooo.', '.ooooooooo.', '..ooooooo..', '....oooo...'], EX = 3, EY = 4;
    const eo = (i, j) => j >= 0 && j < 7 && i >= 0 && i < 11 && EYE[j][i] === 'o';
    for (let j = -1; j <= 7; j++) for (let i = -1; i <= 11; i++) {
      const x = EX + i, Y = EY + 6 - j;
      if (eo(i, j)) {
        const pup = i === 5 && j >= 1 && j <= 5, hot = !pup && abs(i - 5) <= 1 && j >= 2 && j <= 4;
        P(x, Y, 1, null); P(x, Y, 0, pup ? 'obsidian' : hot ? 'eye' : 'lava');
      } else {
        let near = false; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) if (eo(i + di, j + dj)) near = true;
        if (near) P(x, Y, 1, 'polished');
      }
    }
    // sourcils froncés : un lourd V rouge, en saillie
    const bh = x => x <= 1 ? 3 : x === 2 ? 4 : x <= 5 ? 5 : x <= 8 ? 6 : x <= 13 ? 7 : 8;
    for (let x = 0; x <= 15; x++) for (let k = 0; k < 2; k++) { const Y = EY + bh(x) + k; for (let Z = Math.min(1, ZF[Y]); Z <= (k && x >= 3 ? 4 : 3); Z++) P(x, Y, Z, 'rnbricks'); }
    for (let Z = 0; Z <= 4; Z++) P(16, EY + 9, Z, 'gold');                                    // pointe d'or au bout du sourcil
    // joyau du front
    P(0, 11, 2, 'gold'); P(1, 11, 1, 'gilded'); P(0, 10, 1, 'gilded'); P(0, 12, 1, 'gilded');
    // crinière de feu : un bandeau d'or, puis des langues de flamme ; mane[x] = hauteur de la colonne x
    const mane = two ? [6, 5, 3, 1, 2, 4, 5, 3, 1] : [7, 6, 4, 2, 3, 5, 6, 4, 2, 2, 4, 2];
    for (let x = 0; x <= 8; x++) for (let Z = -5; Z <= -3; Z++) P(x, 15, Z, 'gold');
    mane.forEach((h, x) => {
      const y0 = x <= 8 ? 15 : 14;
      for (let k = 1; k <= h; k++) {
        const n = k === h ? 'rnbricks' : k >= h - 2 ? 'lava' : 'eye';
        for (let Z = (k <= h - 2 ? -6 : -5); Z <= (k <= h - 2 ? -4 : -5); Z++) P(x, y0 + k, Z, n);
      }
      if (h < mane[0] && h >= (mane[x - 1] || 0) && h >= (mane[x + 1] || 0)) both(s => { if (x || s > 0) a.fire(s * x, hy + y0 + h + 1, hz - 5); });
    });
    // cornes : tubes d'os le long d'une courbe de Bézier, bagues d'or
    const pts = two ? [[14.5, 11, -5], [17.7, 11.5, -4.5], [16.9, 16, -3.5], [13, 18.2, -2]] : [[15, 11, -5], [22.5, 10.5, -4.5], [26.6, 15, -3.5], [23.5, 21.2, -2]];
    const bez = t => { const u = 1 - t; return [0, 1, 2].map(k => u * u * u * pts[0][k] + 3 * u * u * t * pts[1][k] + 3 * u * t * t * pts[2][k] + t * t * t * pts[3][k]); };
    const done = new Set();
    const ball = (p, r, n) => {
      const m = Math.ceil(r) + 1, cx = Math.floor(p[0]), cy = Math.floor(p[1]), cz = Math.floor(p[2]);
      for (let dx = -m; dx <= m; dx++) for (let dy = -m; dy <= m; dy++) for (let dz = -m; dz <= m; dz++) {
        if ((dx || dy || dz) && Math.hypot(cx + dx + .5 - p[0], cy + dy + .5 - p[1], cz + dz + .5 - p[2]) > r) continue;
        const key = (cx + dx) + ',' + (cy + dy) + ',' + (cz + dz); if (done.has(key)) continue; done.add(key);
        P(cx + dx, cy + dy, cz + dz, n);
      }
    };
    const r0 = two ? 2.1 : 2.5, rad = t => r0 - (r0 - .8) * t;
    for (let i = 0; i <= 160; i++) ball(bez(i / 160), rad(i / 160), i > 138 ? 'qblock' : 'bone');
    for (let i = 16; i <= 24; i++) ball(bez(i / 160), rad(i / 160) + .55, 'gold');
    for (let i = 74; i <= 78; i++) ball(bez(i / 160), rad(i / 160) + .5, 'gold');
    if (!two) both(s => a.light(s * 23, hy + 7, hz - 2, 13));                                 // un peu de lumière sous les cornes
  })();

  /* ---------- les tours : les épaules de la bête ---------- */
  const disc = (cx, cz, rr, f) => { const m = Math.ceil(rr); for (let dx = -m; dx <= m; dx++) for (let dz = -m; dz <= m; dz++) { const d = Math.hypot(dx, dz); if (d <= rr) f(cx + dx, cz + dz, d, dx, dz); } };
  if (!two) both(s => {
    const cx = s * 33, cz = 0, r = 4.5, top = 23;
    for (let y = 0; y <= top; y++) disc(cx, cz, y < 3 ? r + 1 : r, (x, z, d, dx, dz) => {
      const ax = abs(dx), az = abs(dz);
      set(x, y, z, y >= 3 && ((ax === 2 && az === 4) || (ax === 4 && az === 2)) ? 'pbasalt' : (y === LIP0 || y === LIP1) && d > r - 1.2 ? (hash(abs(x), y, z) < .5 ? 'chiseled' : 'gilded') : wall(x, y, z));
    });
    disc(cx, cz, r + 1, (x, z, d) => {            // corniche en encorbellement
      if (d <= r) return;
      if (((x + z) & 1) === 0) set(x, top - 1, z, 'polished');
      set(x, top, z, 'chiseled');
    });
    // dôme en bulbe, cerclé d'or, hérissé de pointes d'os
    const RD = [4.6, 5.2, 5.4, 5.3, 4.9, 4.3, 3.5, 2.6, 1.7, .9];
    RD.forEach((rr, k) => disc(cx, cz, rr, (x, z, d) => set(x, top + 1 + k, z, k === 2 && d > rr - 1.1 ? 'gold' : 'rnbricks')));
    [[4, 5], [7, 3]].forEach(q => {                 // q = [rang du dôme, distance au centre]
      const y = top + 1 + q[0];
      both(t => {
        set(cx + t * q[1], y, cz, 'bone');
        const x0 = cx + .5 + t * (q[1] + .5), len = Math.min(.9, x0 > 0 ? 38.98 - x0 : x0 + 37.98);
        if (len > .15) a.box(Math.min(x0, x0 + t * len), y + .22, cz + .22, Math.max(x0, x0 + t * len), y + .78, cz + .78, BONE);
      });
      set(cx, y, cz + q[1], 'bone'); a.box(cx + .22, y + .22, cz + q[1] + 1, cx + .78, y + .78, cz + q[1] + 1.9, BONE);
    });
    // fanal de feu des âmes au sommet
    const ty = top + RD.length;
    set(cx, ty + 1, cz, 'gold'); soul(cx, ty + 2, cz);
    [[1, 0], [-1, 0], [0, 1]].forEach(d => { set(cx + d[0], ty - 1, cz + d[1], 'soul_soil'); a.cross(cx + d[0], ty, cz + d[1], 'soul_fire_0', { emit: 1, light: 13 }); });
    [[0, 5], [3, 4], [-3, 4]].forEach(w => fill(cx + w[0], top + 2, cz + w[1], cx + w[0], top + 3, cz + w[1], 'glass_o'));     // lucarnes
    both(t => fill(cx + t * 3, 11, cz + 3, cx + t * 3, 13, cz + 3, 'glass_o'));                 // meurtrières
    for (let y = top - 3; y <= top - 2; y++) a.cross(cx + s * 4, y, cz + 3, 'iron_chain'); set(cx + s * 4, top - 4, cz + 3, 'shroomlight');   // lanterne suspendue
    // bannière rouge à emblème d'or
    const bz = cz + 5.04, b1 = top - 1;
    a.box(cx - 1, b1 - 6.4, bz, cx + 2, b1, bz + .1, 'red_wool'); a.box(cx - 1, b1 - 6.75, bz, cx + 2, b1 - 6.4, bz + .14, 'gold_block');
    ['#...#', '##.##', '.###.', '#.#.#', '.###.', '.#.#.'].forEach((row, j) => { for (let i = 0; i < 5; i++) if (row[i] === '#') a.box(cx - .5 + i * .4, b1 - 2.4 - j * .4, bz + .1, cx - .1 + i * .4, b1 - 2 - j * .4, bz + .17, 'gold_block'); });
  });

  /* ---------- la porte : une seconde gueule à crocs, dans le menton ; herse relevée, gosier de magma, tapis rouge ---------- */
  const GW = 4, GB = 6, GZ = PZ + 5;               // demi-largeur de l'ouverture, du corps de garde ; plan de sa façade
  const soff = x => { const ax = abs(x); return ax <= 2 ? LIP0 : ax === 3 ? LIP0 - 1 : LIP0 - 2; };      // premier rang plein au-dessus de l'ouverture
  const open = (x, y) => abs(x) <= GW && y >= 2 && y < soff(x);
  fill(-GB, 0, PZ + 3, GB, LIP0, GZ, (x, y, z) => y === LIP0 ? (z === GZ ? 'rnbricks' : 'polished') : (abs(x) === GB && z === GZ) ? 'pbasalt' : wall(x, y, z));
  for (let x = -GW - 1; x <= GW + 1; x++) for (let y = 1; y <= LIP0; y++) {
    if (open(x, y)) { for (let z = 0; z <= GZ; z++) set(x, y, z, null); set(x, y, -1, 'magma'); if (y >= 6) set(x, y, PZ + 2, 'bars'); continue; }
    for (let z = -1; z < GZ; z++) set(x, y, z, y === 1 ? (z >= 0 && ((x + z) & 1) ? 'magma' : 'blackstone') : 'obsidian');
    if (y >= 2 && (open(x - 1, y) || open(x + 1, y) || open(x, y - 1))) set(x, y, GZ, x === 0 ? 'gold' : 'gilded');
  }
  for (let x = -GW; x <= GW; x++) {
    const ax = abs(x), ys = soff(x);
    tooth(x + .5, ys, GZ + .55, ax === 3 ? 2.4 : ax === 4 ? 1.3 : ax === 0 ? .9 : 1.2, .86, -1);
    if (ax === 4) tooth(x + .5, 2, GZ + .55, 1.7, .86, 1); else if (ax === 3) tooth(x + .5, 2, GZ + .55, 1, .7, 1);
  }
  a.box(-1, 2, 0, 2, 2.07, 14.6, 'red_wool'); a.box(-1.25, 2, 0, -1, 2.1, 14.6, 'gold_block'); a.box(2, 2, 0, 2.25, 2.1, 14.6, 'gold_block');

  /* ---------- la chaussée brisée, deux fanaux de feu des âmes ---------- */
  for (let z = GZ + 1; z <= 16; z++) for (let x = -GW; x <= GW; x++) {
    if (z >= 15 && hash(x, 1, z) < (z - 14) * .38) continue;
    set(x, 1, z, abs(x) === GW ? 'polished' : hash(x, 3, z) < .3 ? 'cracked' : 'bricks');
  }
  both(s => {
    const x = s * (GW + 1);
    fill(x, 0, 11, x, 2, 11, 'pbasalt'); set(x, 3, 11, 'chiseled'); soul(x, 4, 11);
    fill(x, 0, 15, x, 1, 15, 'pbasalt');
  });

  return { bounds: { x0: -XM, x1: XM, z0: -12, z1: 9, top: two ? 50 : 42 }, pools };
};
