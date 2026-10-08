/* The Last — la grotte sous le lac : le décor, posé bloc par bloc (contrat window.GROTTE, lu par grotte.js).
   Le portail du Nether, au centre, est la feuille de route : config.js (roadmap) dit quels blocs sont posés.
   Repère : x vers la droite, y vers le haut, z vers la caméra. Le sol est à y = 2 (dessus des blocs y = 1). */
(() => {
'use strict';
const FLOOR = 2, PX = 0, PZ = -14;                       // le portail : centre en x, profondeur
const smooth = t => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
const mix = (a, b, t) => a.map((v, i) => v + (b[i] - v) * t);
const floorH = {};

/* Les 22 blocs du cadre (6 de large, 7 de haut), dans l'ordre où on les pose : la base de gauche à droite, puis les deux
   montants en alternance, puis le haut, des coins vers le milieu. */
function frameOrder(X0, X1, Y0) {
  const o = [];
  for (let x = X0; x <= X1; x++) o.push([x, Y0]);
  for (let y = Y0 + 1; y <= Y0 + 5; y++) { o.push([X0, y]); o.push([X1, y]); }
  [[X0, Y0 + 6], [X1, Y0 + 6], [X0 + 1, Y0 + 6], [X1 - 1, Y0 + 6], [X0 + 2, Y0 + 6], [X1 - 2, Y0 + 6]].forEach(p => o.push(p));
  return o;
}

window.GROTTE = {
  seed: 2026,
  size: { x0: -36, x1: 35, y1: 27, z0: -40, z1: 19 },
  fog: [.03, .014, .03],
  amb: [.075, .055, .08],
  exposure: 1.38,
  floorAt: (x, z) => floorH[Math.floor(x) + ',' + Math.floor(z)] || FLOOR,
  /* k : 0 = on passe sous la lave (la caméra, juste sous le plafond, regarde la grande trouée), 1 = le plan du portail */
  camera(asp, k) {
    const por = asp < .95, s = smooth(k === undefined ? 1 : k);
    const A = por ? { eye: [0, 7.2, 7], at: [0, 13.5, -8], fov: 1.04 } : { eye: [0, 7.2, 7], at: [0, 13.5, -8], fov: .9 };
    const B = por ? { eye: [0, 4.8, 6.5], at: [0, 7.9, -14], fov: 1.04 } : { eye: [0, 4.6, 8], at: [0, 7.9, -14], fov: .86 };
    return { eye: mix(A.eye, B.eye, s), at: mix(A.at, B.at, s), fov: A.fov + (B.fov - A.fov) * s, fogD: 1 / (por ? 46 : 44) };
  },
  build(a, data) {
    const R = a.R, nz = a.noise, n2 = a.noise2, steps = (data && data.steps) || [];
    /* --- la roche : tout est plein, puis on creuse la salle. Le plafond descend vers nous : il encadre le haut de l'image --- */
    const ceilAt = (x, z) => 14 + 1.6 * nz(x * .14 + 3, z * .14) - Math.pow(Math.abs(x) / 21, 2.4) * 7 - Math.max(0, z - PZ) * .24 - Math.max(0, -z - 24) * .4;
    const halfW = (y, z) => 22 - 3 * n2(y * .15 + 5, z * .1) - Math.max(0, y - 8) * .5;
    a.fill(-36, 0, -40, 35, 27, 19, (x, y, z) => {
      const back = -31 + 2.5 * nz(x * .1, y * .12);
      if (z > back && Math.abs(x) < halfW(y, z) && y >= FLOOR && y <= ceilAt(x, z)) return null;
      if (y < FLOOR) return y === 0 ? 'bedrock' : 'soul_soil';
      const r = R();
      return r < .03 ? 'gore' : r < .5 ? 'blackstone' : r < .82 ? 'basalt' : r < .9 ? 'netherrack' : 'pbb';
    });
    const ceil = (x, z) => { let c = FLOOR + 6; while (c < 27 && !a.get(Math.floor(x), c, Math.floor(z))) c++; return c; };
    /* le sol : terre et sable des âmes, quelques bosses de basalte sur les côtés */
    for (let z = -32; z <= 19; z++) for (let x = -24; x <= 24; x++) {
      if (a.get(x, FLOOR, z)) continue;
      a.set(x, FLOOR - 1, z, n2(x * .2, z * .2) > .52 ? 'soul_sand' : R() < .08 ? 'blackstone' : 'soul_soil');
      if (nz(x * .18 + 11, z * .18) > .7 && Math.abs(x) > 7) { a.set(x, FLOOR, z, R() < .6 ? 'basalt' : 'blackstone'); floorH[x + ',' + z] = FLOOR + 1; }
    }
    /* --- le plafond : le dessous du lac. Une grande trouée devant le portail, d'autres plus petites ; la lave affleure,
       cerclée d'une croûte de magma --- */
    [[0, -8, 4.6, 2.6], [-10, -19, 2.4, 1.4], [11, -20, 2.6, 1.4], [-13, -3, 1.8, 1.2], [14, -4, 1.9, 1.2], [2, -25, 2.1, 1.3]].forEach(hh => {
      for (let z = Math.floor(hh[1] - hh[2] * 1.4 - 3); z <= hh[1] + hh[2] * 1.4 + 3; z++) for (let x = Math.floor(hh[0] - hh[2] - 3); x <= hh[0] + hh[2] + 3; x++) {
        const c = ceil(x, z); if (c >= 27) continue;
        const d = Math.hypot(x - hh[0], (z - hh[1]) / 1.35) + (nz(x * .45, z * .45) - .5) * 1.4;
        if (d < hh[2]) { a.set(x, c, z, 'lava'); a.set(x, c + 1, z, 'lava'); if (R() < .3) a.emit('drip', [x + .5, c - .02, z + .5], .3, [.6, 0, .6]); }
        else if (d < hh[2] + hh[3]) { a.set(x, c, z, R() < .75 ? 'magma' : 'basalt'); if (R() < .25 && d < hh[2] + .8) a.set(x, c - 1, z, 'magma'); }
      }
    });
    /* une chute de lave au fond à gauche, dans une vasque, et une autre, plus fine, à droite */
    const fall = (fx, fz, w) => { const top = ceil(fx, fz); for (let y = FLOOR - 1; y <= top; y++) for (let dx = 0; dx < w; dx++) if (!a.get(fx + dx, y, fz) || y === FLOOR - 1) a.set(fx + dx, y, fz, 'lavafall');
      a.fill(fx - 2, FLOOR - 1, fz - 1, fx + w + 1, FLOOR - 1, fz + 2, 'lava'); a.emit('ember', [fx + w / 2, FLOOR + .3, fz + .5], 4, [w + 3, .5, 3]); };
    fall(-15, -26, 2); fall(15, -24, 1);

    /* --- piliers de basalte, du sol au plafond, qui cadrent la scène --- */
    [[-15, -11, 1.7], [15, -12, 1.8], [-19, -22, 2], [19, -23, 2], [-13, 0, 1.3], [13, 1, 1.4]].forEach(p => {
      for (let y = FLOOR; y < 27; y++) {
        const r = p[2] * (1 + .7 * Math.pow(Math.abs(y - 8) / 9, 2)) + (nz(y * .3 + p[0], p[1]) - .5) * .7;
        for (let z = Math.floor(p[1] - r - 1); z <= p[1] + r + 1; z++) for (let x = Math.floor(p[0] - r - 1); x <= p[0] + r + 1; x++)
          if (Math.hypot(x - p[0], z - p[1]) < r && !a.get(x, y, z)) a.set(x, y, z, R() < .82 ? 'basalt' : 'pbasalt');
      }
    });

    /* --- l'estrade : deux marches de pierre noire polie, deux braseros d'âmes aux coins --- */
    a.fill(PX - 8, FLOOR, PZ - 4, PX + 7, FLOOR, PZ + 5, (x, y, z) => z === PZ + 5 && R() < .2 ? 'cpbb' : 'pbb');
    a.fill(PX - 6, FLOOR + 1, PZ - 3, PX + 5, FLOOR + 1, PZ + 3, (x, y, z) => z === PZ + 3 && R() < .15 ? 'cpbb' : 'polished');
    for (let x = PX - 8; x <= PX + 7; x++) for (let z = PZ - 4; z <= PZ + 5; z++) floorH[x + ',' + z] = z <= PZ + 3 && x >= PX - 6 && x <= PX + 5 ? FLOOR + 2 : FLOOR + 1;
    [[PX - 6, PZ + 3], [PX + 5, PZ + 3]].forEach(b => {
      a.set(b[0], FLOOR + 2, b[1], 'chiseled');
      a.set(b[0], FLOOR + 3, b[1], 'soul_sand');
      a.cross(b[0], FLOOR + 4, b[1], 'soul_fire_0', { emit: 1, light: 15, ch: 3 });
      a.emit('soul', [b[0] + .5, FLOOR + 4.6, b[1] + .5], 4, [.6, .3, .6]);
    });

    /* --- le portail : la feuille de route. Posé = fait ; pleureuse = en attente ; pointillés = en cours ou à venir --- */
    const Y0 = FLOOR + 2, X0 = PX - 3, X1 = PX + 2, order = frameOrder(X0, X1, Y0);
    let k = 0;
    steps.forEach((s, i) => {
      const n = Math.max(0, Math.round(+s.blocks || 0)) || 1;
      for (let j = 0; j < n && k < order.length; j++, k++) {
        const p = order[k];
        if (s.state === 'fait') a.set(p[0], p[1], PZ, 'obsidian');
        else if (s.state === 'attente') {
          a.set(p[0], p[1], PZ, 'crying');
          a.emit('cry', [p[0] + .5, p[1] - .02, PZ + .5], .5, [.6, 0, .6]);
          a.emit('cry', [p[0] + .5, p[1] + .3, PZ + 1.02], .35, [.7, .5, 0]);
        }
        else a.ghost(p[0], p[1], PZ, { step: i, live: s.state === 'encours' });
        a.pick(p[0], p[1], PZ, i);
      }
    });
    for (; k < order.length; k++) { a.ghost(order[k][0], order[k][1], PZ, {}); }      // blocs sans étape : à venir
    const lit = steps.length > 0 && steps.every(s => s.state === 'fait');
    if (lit) {                                                // le jour de l'ouverture : le portail s'allume
      a.fill(X0 + 1, Y0 + 1, PZ, X1 - 1, Y0 + 5, PZ, 'portal');
      a.emit('mote', [PX, Y0 + 3.5, PZ + .5], 14, [4, 5, 1.2]);
    } else a.emit('mote', [PX, Y0 + 3.5, PZ + .5], 3, [3.5, 4.5, .8]);
    a.anchor('portail', PX, Y0 + 3.5, PZ + .5);
    /* une plaque d'or au pied du portail */
    a.box(X0 + .6, FLOOR + 2, PZ + 1.1, X1 + .4, FLOOR + 2.1, PZ + 2, 'gilded_blackstone');

    /* --- le squelette qui attend l'ouverture, assis sur une dalle, à gauche de l'estrade --- */
    const SX = PX - 8.4, SZ = PZ + 6.6;
    a.box(SX - .5, FLOOR, SZ - .6, SX + .5, FLOOR + .5, SZ + .4, 'polished_blackstone');
    a.ent({ kind: 'skeleton', at: [SX, FLOOR - .2, SZ + .05], ry: .5, pose: { head: [.45, -.25, .18], body: [.06, 0, 0], armR: [.1, 0, .08], armL: [.16, 0, -.05], legR: [-1.42, .22, 0], legL: [-1.42, -.18, 0] } });
    a.cross(SX - .2, FLOOR + 1.95, SZ - .55, 'cobweb', { s: .5 });
    /* le panneau « Ouverture », planté à côté de lui, tourné vers nous */
    const BX = SX - 2.1, BZ = SZ - .5;
    a.box(BX - .07, FLOOR, BZ - .07, BX + .07, FLOOR + 1.5, BZ + .07, 'stripped_crimson_stem');
    a.mbox(BX - 1.3, FLOOR + 1.3, BZ + .07, BX + 1.3, FLOOR + 2.7, BZ + .22, { side: ['crimson_planks', [0, 0, 41.6, 22.4]], e: ['crimson_planks', [0, 0, 2.4, 22.4]], w: ['crimson_planks', [0, 0, 2.4, 22.4]], up: ['crimson_planks', [0, 0, 41.6, 2.4]], down: ['crimson_planks', [0, 0, 41.6, 2.4]] }, { ry: .42, pivot: [BX, 0, BZ] });
    a.anchor('panneau', BX + .1, FLOOR + 2.02, BZ + .26);
    a.lantern(BX + 1.6, FLOOR, BZ + .4, 'soul_lantern', false, 12, 3);

    /* --- l'échafaudage contre le côté droit du portail, et le piglin bâtisseur qui monte un bloc --- */
    for (let y = FLOOR + 2; y <= FLOOR + 4; y++) { a.set(X1 + 2, y, PZ, 'scaffold'); a.set(X1 + 2, y, PZ + 1, 'scaffold'); }
    a.set(X1 + 3, FLOOR + 2, PZ, 'scaffold'); a.set(X1 + 3, FLOOR + 2, PZ + 1, 'scaffold');
    a.ent({ kind: 'piglin', at: [X1 + 2.5, FLOOR + 5, PZ + 1], ry: -1.2, bright: 1.35, pose: t => ({ head: [.15 + Math.sin(t * .9) * .05, .25 + Math.sin(t * .37) * .12, 0], armR: [-1.25 + Math.sin(t * 1.3) * .04, .2, 0], armL: [-1.25 + Math.sin(t * 1.3) * .04, -.2, 0], legR: [0, 0, 0], legL: [0, 0, 0], earL: [0, 0, -.6 - Math.max(0, Math.sin(t * 2.1)) * .12], earR: [0, 0, .6 + Math.max(0, Math.sin(t * 2.1 + 1)) * .12] }) });
    a.box(X1 + 1.42, FLOOR + 5.5, PZ + .78, X1 + 1.9, FLOOR + 5.98, PZ + 1.26, 'obsidian');
    a.anchor('chantier', X1 + 2.7, FLOOR + 7.5, PZ + 1);
    a.set(X1 + 4, FLOOR + 1, PZ + 2, 'obsidian'); a.box(X1 + 4.2, FLOOR + 2, PZ + 3.3, X1 + 4.7, FLOOR + 2.5, PZ + 3.8, 'obsidian');

    /* --- feux des âmes au premier plan, lanternes des âmes pendues au plafond --- */
    [[PX - 11, PZ + 13], [PX + 11, PZ + 12], [PX - 14, PZ + 6], [PX + 14, PZ + 7]].forEach(f => {
      a.set(f[0], FLOOR - 1, f[1], 'soul_sand'); a.set(f[0], FLOOR, f[1], null); delete floorH[f[0] + ',' + f[1]];
      a.cross(f[0], FLOOR, f[1], 'soul_fire_0', { emit: 1, light: 14, ch: 3 });
      a.emit('soul', [f[0] + .5, FLOOR + .6, f[1] + .5], 3, [.6, .3, .6]);
    });
    [[PX - 5, PZ + 1.5], [PX + 4.5, PZ + 1.5]].forEach((l, i) => { const c = ceil(l[0], l[1]); a.lantern(l[0], c - 3.4, l[1], 'soul_lantern', true, 13, 3, c); if (!i) a.anchor('questions', l[0], c - 3.55, l[1]); });

    /* --- la ligne de pêche du piglin du lac, qui descend par la grande trouée, dans l'axe du portail. Le flotteur
       s'arrête au-dessus du portail : la ligne et son étiquette ne passent jamais devant les blocs --- */
    const lx = PX, lz = PZ + 6, hy = FLOOR + 9.1, top = ceil(lx, lz);
    a.box(lx - .02, hy + .25, lz - .02, lx + .02, top + 1, lz + .02, 'quartz_block_side', { emit: .25 });
    a.box(lx - .1, hy, lz - .1, lx + .1, hy + .25, lz + .1, ['red_wool', 'quartz_block_side', 'red_wool'], { emit: .2 });
    a.anchor('ligne', lx, hy - .3, lz);

    /* --- des os, pour la vie --- */
    a.box(SX + 1, FLOOR, SZ + 1, SX + 1.6, FLOOR + .18, SZ + 1.2, 'bone_block_side');
    a.set(-20, FLOOR, -16, 'bone'); a.set(19, FLOOR, -18, 'bone'); a.set(19, FLOOR + 1, -18, 'bone');
    a.set(-6, FLOOR, -24, 'gilded'); a.set(7, FLOOR, -25, 'debris');
    return { lit };
  }
};
})();
