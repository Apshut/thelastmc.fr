/* The Last — le tavernier de la taverne du Nether (boutique.html).

   CONTRAT (lu par tavern.js ; un autre tavernier peut remplacer celui-ci tant qu'il le respecte)
   ---------------------------------------------------------------------------------------------
   window.TAVERN_KEEPER = {
     name:  'Nom affiché',
     skin:  { w, h, draw(ctx) },      // peau pixel-art dessinée par code dans un canevas w x h (origine en haut à gauche)
     parts: [ partie, ... ],          // modèle en boîtes, au format du jeu (et de world.js)
     pose(t, st) { return { ... } },  // appelée à chaque image
     blend(from, to, b) { ... },      // facultatif : fondu de certaines parties entre deux humeurs (voir plus bas)
     lines: { idle: [], threat: [], angry: [], don: [] }   // facultatif : répliques de la bulle (don = au survol du tronc)
   };

   Partie : { n: 'nom', p: [x, y, z], r: [rx, ry, rz], b: [boîte, ...], c: [enfants] }
     - unités = pixels du jeu, 16 px = 1 bloc ; y vers le BAS, la face avant du modèle regarde -z (vers le client) ;
     - p = pivot, relatif au pivot du parent ; r = rotation de repos (radians, appliquée Z puis Y puis X, comme le jeu) ;
     - le sol est à y = +24 (l'origine est 1,5 bloc au-dessus du sol, comme les créatures du jeu) ;
     - les noms de parties sont uniques ; une partie nommée 'head' porte la bulle de dialogue.
   Boîte : { o: [x, y, z], s: [l, h, p], uv: [u, v], us?: [l, h, p], mir?: 1, col?: [r, g, b], e?: 0..1 }
     - o = coin, relatif au pivot de la partie ; s = taille ; uv = coin du patron dans la peau (patron du jeu :
       dessus, dessous, puis droite, avant, gauche, arrière) ; us = taille du patron si elle diffère de s ;
     - mir = patron en miroir (membre droit qui réutilise le gauche) ; col = boîte unie, sans texture ;
     - e = émission (0..1) : la boîte brille et nourrit le halo (yeux, braises). Multipliée par _glow.

   pose(t, st) : t en secondes ; st = {
       mood:  'idle' | 'angry' | 'threat',  // calme ; énervé (clic sur un article, ou de temps en temps) ; menaçant (survol)
       since: secondes depuis le changement d'humeur,
       look:  { x, y } dans -1..1,          // où regarder, en coordonnées d'écran : x > 0 = à droite, y > 0 = en bas
       hover: id de l'article survolé, ou null
     }
     Le tronc de soutien (kind « don » dans config.js) ne fâche pas le tavernier : à son survol, mood reste 'idle'
     (hover est alors renseigné) et la bulle prend une réplique de lines.don ; un clic dessus ne l'énerve pas.
   Elle renvoie { [nomDePartie]: [rx, ry, rz], ... } (rotations absolues, qui remplacent r) et, au besoin :
     _root:  { y, ry }   y = décalage vertical du modèle en pixels (positif = vers le haut) ; ry = rotation de tout
                          le corps autour de la verticale (positif = l'avant tourne vers la gauche de l'écran).
                          Facultatifs aussi : x, z (pixels), rx (radians).
     fx:     [{ kind: 'smoke' | 'spark' | 'dust', at: [x, y, z], part?: 'nomDePartie', dir?: [x, y, z], n }]
             at = position dans le repère du modèle (ou, si part est donné, dans le repère local de cette partie,
             comme les coins des boîtes) ; dir = direction de départ (même repère) ; n = particules PAR SECONDE
             tant que l'effet est renvoyé (renvoyer 300 pendant 0,1 s = une gerbe d'environ 30).
     _glow:  0..1        intensité des boîtes émissives (défaut 1)
     _shake: 0..1        secousse de la caméra (coup sur le comptoir, sabot)
   Le moteur fond les poses pendant 0,3 s à chaque changement d'humeur ; avec « réduire les animations », il fige t
   et coupe les particules et la secousse (since, lui, continue : c'est au tavernier de figer ses poses).
   Le fondu passe par le plus court chemin de chaque partie, une par une. blend(from, to, b), s'il existe, est appelée
   à chaque image du fondu : from et to = { [nomDePartie]: [rx, ry, rz] } (la pose affichée au changement d'humeur et
   la pose demandée), b = avancée du fondu (0..1, déjà adoucie) ; elle renvoie les rotations des parties qu'elle fond
   elle-même (les autres gardent le fondu du moteur).
   Une erreur dans pose() ou draw() est attrapée : le modèle reste au repos.

   Repères de la scène (dans le repère du modèle, sans rotation) : le tavernier se tient derrière le comptoir.
     - il se tient sur une estrade (un quart de bloc) ; y = 24 est le dessus de l'estrade ;
     - dessus du comptoir : y = +11 (13 px au-dessus de l'estrade) ; bord arrière du comptoir : z = -12 (le plateau
       déborde jusqu'à z = -11) ; bord avant : z = -28 ; le comptoir va de x = -83 à x = +83 ;
     - le pot « Soutien » est posé sur le comptoir entre x = -47 et x = -37 : rien ne doit s'y poser ;
     - le client (la caméra) est devant, un peu au-dessus de la tête : à la profondeur du tavernier, on voit tout
       ce qui est plus haut que y ≈ 16 ; le comptoir cache le reste (sabots, bas des pattes) ;
     - le cadrage suit la taille du modèle au repos (cornes comprises) : un grand tavernier reste dans l'image.
   ---------------------------------------------------------------------------------------------

   Gromaur, la brute de taverne : un centaure-bouc massif, fait de boîtes comme sur Blockbench (peau de 16 px par
   bloc). Corps de bouc chamoisé à quatre pattes, de biais (croupe, queue et pattes arrière à gauche de l'écran),
   torse de suie, bosse et crinière grises de vieux mâle, épaules larges d'un bloc et demi, visage brun barré de
   deux raies noires, yeux de braise aux pupilles fendues (comme celles des chèvres) qui suivent le curseur et
   clignent, longues cornes annelées qui partent vers l'arrière puis s'enroulent (la droite est cassée), barbe
   tressée cerclée de fer, anneau d'or dans le museau, tablier de cuir taché, poings bandés de lutteur.

   Humeurs :
     - calme   : poings sur les hanches (et bras croisés de temps en temps), respiration lente, regard qui suit le
                 curseur, clignements, oreilles et queue qui bougent, craquement de nuque, filet de fumée ;
     - menace  : (survol d'un article) en fait, le marchand gourmand : il te regarde droit dans les yeux en se frottant les
                 mains devant la poitrine, coudes pliés ; des braises jaillissent entre ses poings, oreilles dressées, queue
                 qui frétille ;
     - énervé  : il se dresse poings levés (ses cornes crépitent), les abat sur le comptoir (secousse, étincelles, les
                 chopes sautent), reste appuyé sur ses poings en soufflant, rue d'une patte arrière, puis se redresse.
   Les poings sont placés par cinématique inverse : ils se posent SUR le comptoir, jamais dedans. */
(() => {
'use strict';

const { sin, cos, abs, sqrt, PI } = Math;
const clamp = (v, a, b) => v < a ? a : v > b ? b : v, lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const easeIn = t => { t = clamp(t, 0, 1); return t * t * t; };
const easeOut = t => { t = clamp(t, 0, 1); return 1 - (1 - t) * (1 - t); };
const REDUCE = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ================= Petite cinématique (mêmes conventions que le moteur) ================= */
const M3 = {
  x: a => { const c = cos(a), s = sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; },
  y: a => { const c = cos(a), s = sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; },
  z: a => { const c = cos(a), s = sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; }
};
const mul = (A, Bm) => { const o = []; for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o.push(A[i * 3] * Bm[j] + A[i * 3 + 1] * Bm[3 + j] + A[i * 3 + 2] * Bm[6 + j]); return o; };
const app = (A, v) => [A[0] * v[0] + A[1] * v[1] + A[2] * v[2], A[3] * v[0] + A[4] * v[1] + A[5] * v[2], A[6] * v[0] + A[7] * v[1] + A[8] * v[2]];
const appT = (A, v) => [A[0] * v[0] + A[3] * v[1] + A[6] * v[2], A[1] * v[0] + A[4] * v[1] + A[7] * v[2], A[2] * v[0] + A[5] * v[1] + A[8] * v[2]];
const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]], sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const scl = (a, k) => [a[0] * k, a[1] * k, a[2] * k], dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const rot = r => mul(mul(M3.z(r[2] || 0), M3.y(r[1] || 0)), M3.x(r[0] || 0));      // Z, puis Y, puis X, comme le jeu
/* l'inverse : les angles [rx, ry, rz] d'une rotation (blocage de cardan : rz = 0) */
const euler = R => abs(R[6]) > .99999 ? [Math.atan2(-R[5], R[4]), -Math.sign(R[6]) * PI / 2, 0]
  : [Math.atan2(R[7], R[8]), Math.asin(-R[6]), Math.atan2(R[3], R[0])];
const child = (F, p, r) => ({ R: mul(F.R, rot(r)), t: add(F.t, app(F.R, p)) });
const ID3 = [1, 0, 0, 0, 1, 0, 0, 0, 1], ROOT = { R: ID3, t: [0, 0, 0] };
/* rotation [rx, ry, 0] qui oriente l'axe +y d'une partie (son « bas ») selon v */
const aim = v => { const n = norm(v), rx = -Math.acos(clamp(n[1], -1, 1)), s = sin(rx); return abs(s) < 1e-4 ? [rx, 0, 0] : [rx, Math.atan2(n[0] / s, n[2] / s), 0]; };

/* ================= La peau (128 x 128), rangée automatiquement ================= */
const SW = 128, SH = 128;
/* taille de chaque boîte texturée : largeur, hauteur, profondeur (patron du jeu : 2 x (p + l) sur p + h) */
const DIM = {
  barrel: [12, 11, 26], chest: [14, 11, 8], hump: [12, 5, 8], belly: [12, 8, 8], apron: [10, 16, 1],
  head: [8, 7, 7], neck: [6, 4, 6], muzzle: [4, 4, 5], chin: [4, 3, 3], brow: [4, 2, 2],
  ear: [4, 2, 2], earN: [4, 2, 2], braid: [2, 4, 2], tuft: [3, 3, 3],
  horn1: [3, 6, 3], horn2: [3, 6, 3], horn3: [2, 6, 2], horn4: [2, 6, 2], horn4b: [2, 4, 2], horn5: [1, 4, 1],
  delt: [6, 6, 6], uarm: [5, 8, 5], farm: [5, 9, 5], fist: [6, 5, 6],
  haunch: [5, 9, 7], hshin: [3, 9, 3], fleg: [4, 7, 4], fshin: [3, 7, 3], hoof: [4, 2, 4], tail: [3, 6, 2], tailT: [3, 4, 2],
  mug: [4, 5, 4]
};
const UV = {};
(() => {                                                     // rangement en étagères, les plus hauts d'abord
  const L = Object.keys(DIM).map(k => { const d = DIM[k]; return { k, w: 2 * (d[2] + d[0]), h: d[2] + d[1] }; }).sort((a, b) => b.h - a.h || b.w - a.w);
  let x = 0, y = 0, rh = 0;
  L.forEach(e => { if (x + e.w > SW) { x = 0; y += rh; rh = 0; } UV[e.k] = [x, y]; x += e.w; rh = Math.max(rh, e.h); });
})();

/* palettes, du plus sombre au plus clair (ombres vers le rouge, lumières vers l'ocre) */
const FUR = ['#110c0c', '#1b1314', '#271d1d', '#332726', '#413130', '#523f3b', '#664f49'];
/* robe cendrée du corps de bouc et du visage : gris fauve, assez clair pour se détacher des briques et des tonneaux */
const GOAT = ['#2b2420', '#3d332d', '#52453d', '#68584d', '#7f6c5f', '#968172', '#ad978a'];
/* tablier : cuir brun, moins orangé que les bretelles, pour ne pas voler la vedette au visage */
const APR = ['#21140c', '#311e13', '#43291a', '#573522', '#6c432b', '#815235'];
const MANE = ['#2a2524', '#3b3432', '#4f4643', '#655b56', '#7e726b', '#998c83', '#b5a89d'];
const MUZ = ['#211816', '#30241f', '#41322b', '#544238', '#6a5446', '#806656'];
const HORN = ['#3b3027', '#5a4a3a', '#7b6a53', '#9c8a6c', '#b9a785', '#d1c09c', '#e4d6b6'];
const LEA = ['#2a170b', '#422513', '#5c341b', '#774525', '#91582f', '#a96b3a'];
const WRAP = ['#3a3229', '#4f4537', '#665a48', '#7e715b', '#958770', '#ab9d84'];
const IRON = ['#2c2d33', '#494a52', '#70717a', '#9fa0a8', '#cdced4'];
const HOOF = ['#0b0807', '#171010', '#241a17', '#322622'];
const WOOD = ['#2b1a0d', '#432914', '#5c3a1d', '#774e28', '#916434'];
const SCAR = '#7d5a50';

function draw(g) {
  const hs = (x, y, k) => { let h = Math.imul(x + 1, 73856093) ^ Math.imul(y + 7, 19349663) ^ Math.imul(k + 3, 83492791); h = Math.imul(h ^ (h >>> 13), 0x5bd1e995); h ^= h >>> 15; return (h >>> 0) / 4294967296; };
  const R = (a, i) => a[clamp(Math.round(i), 0, a.length - 1)];
  const px = (x, y, c) => { if (c) { g.fillStyle = c; g.fillRect(x, y, 1, 1); } };
  /* patron d'une boîte : fn(face, x, y, largeur, hauteur) -> couleur (null = transparent) */
  const paint = (name, fn) => {
    const u = UV[name][0], v = UV[name][1], d = DIM[name], w = d[0], h = d[1], z = d[2];
    const F = { top: [u + z, v, w, z], bottom: [u + z + w, v, w, z], right: [u, v + z, z, h], front: [u + z, v + z, w, h], left: [u + z + w, v + z, z, h], back: [u + z + w + z, v + z, w, h] };
    for (const k in F) { const f = F[k]; for (let y = 0; y < f[3]; y++) for (let x = 0; x < f[2]; x++) px(f[0] + x, f[1] + y, fn(k, x, y, f[2], f[3])); }
  };
  /* poil, ombré à la main par mèches : chaque mèche fait 3 px de large et 4 de haut, décalée d'une colonne de mèches
     à l'autre ; reflet sur le haut-gauche, corps, flanc droit plus sombre, creux noir entre deux mèches */
  const fur = (f, x, y, W, H, k, base, pal) => {
    pal = pal || FUR; let L = base === undefined ? 3 : base;
    if (f === 'bottom') return R(pal, L - 1 - (hs(x, y, k) > .6 ? 1 : 0));
    const col = Math.floor(x / 3), off = (hs(col, 0, k) * 4) | 0, ly = (y + off) % 4, lx = x % 3, lock = Math.floor((y + off) / 4);
    const v = hs(col, lock, k + 5);                                   // chaque mèche un peu plus claire ou plus sombre
    if (v < .22) L -= 1; else if (v > .85) L += 1;
    if (ly === 3) L -= lx === 1 ? 2 : 1;                              // creux sous la mèche
    else if (ly === 0 && lx === 0) L += 1;                            // reflet en haut de la mèche
    else if (lx === 2) L -= .6;                                       // flanc de la mèche
    if (f !== 'top') { if (y === 0) L += 1; if (y >= H - 1) L -= 1; }
    return R(pal, L);
  };
  const grain = (pal, x, y, k, base, lo, hi) => { let L = base; const r = hs(x, y, k); if (r < (lo || .16)) L -= 1; else if (r > 1 - (hi || .12)) L += 1; return R(pal, L); };

  // ---------- le corps de bouc : robe chamoisée, ventre et bas des pattes charbon, crête grise ----------
  paint('barrel', (f, x, y, W, H) => {
    if (f === 'top') {                                         // l'échine : crête de crin gris le long du dos
      if (x >= 4 && x <= 7) return grain(MANE, x, y, 3, x === 4 || x === 7 ? 4 : 5, .2, .2);
      return fur(f, x, y, W, H, 11, x === 0 || x === 11 ? 4 : 5, GOAT);
    }
    if (f === 'bottom') return R(FUR, 1 + (hs(x, y, 5) < .3 ? 1 : 0));
    if (f === 'back') {                                        // croupe : miroir clair autour de la queue
      if (y < 4 && x >= 3 && x <= 8) return grain(MANE, x, y, 6, y === 0 ? 6 : 5);
      if (y >= H - 3) return fur(f, x, y, W, H, 12, 2);
      return fur(f, x, y, W, H, 13, y > 6 ? 3 : 4, GOAT);
    }
    if (f === 'front') return fur(f, x, y, W, H, 14, 3, GOAT);
    // flancs : dos éclairé, ventre charbon, mèches qui pendent ; une vieille marque au fer sur le flanc droit
    const side = f === 'right' ? 0 : 1, xx = side ? x : W - 1 - x;   // xx = 0 à l'avant
    if (y === 0) return grain(MANE, x, y, 7 + side, 4);
    if (side === 0 && y >= 3 && y <= 6 && xx >= 11 && xx <= 14) {   // la marque de la taverne : une flamme
      const fx = xx - 11, fy = y - 3, on = [[0, 1, 1, 0], [1, 1, 1, 0], [0, 1, 1, 1], [1, 1, 1, 1]][fy][fx];
      if (on) return fy === 0 || fx === 0 ? '#2e1710' : '#1e0d08';
    }
    if (y >= H - 2) return hs(x, 0, 21) < .5 ? R(FUR, 1) : fur(f, x, y, W, H, 17, 2);   // ventre charbon, mèches qui pendent
    if (y === H - 3) return hs(x, y, 22) < .5 ? R(GOAT, 2) : R(FUR, 3);                 // lisière du ventre, déchiquetée
    let base = y <= 2 ? 5 : 4;
    if (xx > 18 && y >= 2 && y <= 6) base += .6;                     // la cuisse
    if (xx < 4 && y >= 2 && y <= 7) base += .5;                      // l'épaule du bouc
    if (y >= 6) base -= .7;
    return fur(f, x, y, W, H, 15 + side, base, GOAT);
  });
  paint('haunch', (f, x, y, W, H) => {
    if (f === 'top') return fur(f, x, y, W, H, 31, 5, GOAT);
    if (y >= H - 2) return fur(f, x, y, W, H, 33, 2);                // le jarret passe au charbon
    let b = 4; if (y >= 1 && y <= 4 && (f === 'left' || f === 'right')) b = 5; if (y >= H - 4) b = 3;
    return fur(f, x, y, W, H, 32, b, GOAT);
  });
  const shin = k => (f, x, y, W, H) => {
    if (f === 'top' || f === 'bottom') return R(FUR, 2);
    if (y >= H - 2) return grain(MANE, x, y, k, 3);                  // fanons gris au-dessus du sabot
    return fur(f, x, y, W, H, k, 2);
  };
  paint('hshin', shin(41)); paint('fshin', shin(42));
  paint('fleg', (f, x, y, W, H) => y >= H - 2 ? fur(f, x, y, W, H, 44, 2) : fur(f, x, y, W, H, 43, y < 2 ? 5 : 4, GOAT));
  paint('hoof', (f, x, y) => {
    if (f === 'bottom') return HOOF[0];
    if (f === 'top') return HOOF[2];
    if (f === 'front' && (x === 1 || x === 2) && y === 1) return HOOF[0];          // sabot fendu
    return y === 0 ? HOOF[3] : HOOF[1];
  });
  // la queue : courte et dressée, dessus brun foncé, dessous clair ; puis un pinceau de crin
  paint('tail', (f, x, y, W, H) => {
    if (f === 'top') return grain(GOAT, x, y, 51, 3);
    if (f === 'back') return grain(MANE, x, y, 52, y < 3 ? 5 : 4);                 // dessous de la queue, clair
    if (f === 'front') return grain(GOAT, x, y, 56, 2);
    return x === W - 1 ? R(MANE, 4) : fur(f, x, y, W, H, 53, 3, GOAT);
  });
  paint('tailT', (f, x, y, W, H) => {
    if (f === 'bottom') return (x + y) % 2 ? null : FUR[2];
    if (f === 'front') return grain(MANE, x, y, 54, 4);
    if (y === H - 1) return hs(x, y, 55) > .45 ? FUR[3] : null;                    // pointes effilochées
    return (x + y) % 2 ? FUR[2] : FUR[4];
  });

  // ---------- le torse ----------
  paint('belly', (f, x, y, W, H) => f === 'top' ? R(FUR, 3) : fur(f, x, y, W, H, 61, y > H - 3 ? 2 : 3));
  paint('chest', (f, x, y, W, H) => {
    if (f === 'front') {
      if ((x === 3 || x === 10) && y < 5) return y === 0 ? LEA[5] : grain(LEA, x, y, 62, 3);  // bretelles du tablier
      if (y === 3 && x >= 4 && x <= 9 && x !== 6 && x !== 7) return FUR[1];           // pli sous les pectoraux
      if (y < 3 && x >= 4 && x <= 9) return grain(MANE, x, y, 69, y === 0 ? 3 : 2);   // poitrail grisonnant
      return fur(f, x, y, W, H, 63, y < 3 ? 4 : 3);
    }
    if (f === 'top') { if (x === 3 || x === 10) return grain(LEA, x, y, 64, 4); return grain(MANE, x, y, 65, 3, .25, .2); }
    if (f === 'back') { if ((x === y + 1 || x === 12 - y) && y < 10) return grain(LEA, x, y, 66, 3); return fur(f, x, y, W, H, 67, 3); }
    if (y === 0) return grain(MANE, x, y, 68, 3);
    return fur(f, x, y, W, H, 68, y < 3 ? 4 : 3);
  });
  paint('hump', (f, x, y, W, H) => {                          // la bosse : crinière drue, grise, pointes claires
    if (f === 'top') { const r = hs(x, y, 71); return r < .22 ? MANE[2] : r > .75 ? MANE[6] : MANE[4]; }
    if (f === 'bottom') return FUR[2];
    const ph = hs(x, 0, 73) * 3 | 0, m = (y + ph) % 3;
    if (y >= H - 1) return m ? MANE[1] : FUR[3];
    return m === 0 ? MANE[2] : grain(MANE, x, y, 74, y === 0 ? 5 : 4, .2, .18);
  });
  paint('apron', (f, x, y, W, H) => {
    if (f !== 'front') return f === 'back' ? APR[1] : APR[2];
    // rivets aux bretelles, grande tache de graisse, une brûlure, poche plaquée, ourlet effiloché
    if (y === 0) return (x === 0 || x === 9) ? IRON[3] : APR[5];
    if ((x === 0 || x === 9) && y === 1) return IRON[2];
    if (y === H - 1) return (x % 3 === 1) ? null : APR[1];
    if (y >= 10 && y <= 13 && x >= 1 && x <= 5) {                                        // la poche, de travers
      if (y === 10) return x === 5 ? APR[2] : '#9a7048';                                 // couture du haut
      if (y === 11 && x === 4) return WRAP[4];                                           // un coin de chiffon qui dépasse
      return grain(APR, x, y, 81, 3);
    }
    if ((x === 7 && (y === 4 || y === 5)) || (x === 8 && y === 5)) return '#1e0e07';      // roussi
    const st = (x - 3.5) * (x - 3.5) * .5 + (y - 5.5) * (y - 5.5) * .8 + (hs(x, y, 84) - .5) * 2;   // tache de graisse
    if (st < 2.6) return APR[2];
    if (y > 13 && hs(x, y, 85) > .6) return APR[2];                                     // bas usé
    if (x === 0 || x === 9) return APR[2];
    return grain(APR, x, y, 83, 4, .18, .1);
  });


  // ---------- la tête ----------
  /* le visage : brun chamoisé, deux raies noires qui descendent des yeux jusqu'au bout du museau, front gris */
  paint('head', (f, x, y, W, H) => {
    if (f === 'front') {
      if (y === 4 && (x <= 1 || x >= 6)) return FUR[0];                              // orbites (les yeux sont des boîtes)
      if ((y === 4 && (x === 2 || x === 5)) || (y >= 5 && (x === 1 || x === 6))) return R(FUR, 1 + (hs(x, y, 99) > .7 ? 1 : 0));   // raies
      if (y < 2 && x >= 2 && x <= 5) return grain(MANE, x, y, 98, y ? 4 : 5);       // mèche grise sur le front
      if (y >= 5 && x === 0) return SCAR;                                           // balafre sous l'œil droit
      if (y >= 2 && x >= 3 && x <= 4) return grain(GOAT, x, y, 91, 6, .2, 0);        // chanfrein clair
      return fur(f, x, y, W, H, 92, y < 2 ? 5 : y >= 5 ? 3 : 4, GOAT);
    }
    if (f === 'top') {
      if ((x === 2 || x === 5) && y >= 2 && y <= 4) return FUR[1];                  // pied des cornes
      if (x >= 3 && x <= 4) return grain(MANE, x, y, 96, 4);                        // toupet gris entre les cornes
      return fur(f, x, y, W, H, 93, 4, GOAT);
    }
    if (f === 'right' && abs(x - (6 - y)) < .5 && y >= 1 && y <= 5) return SCAR;    // vieille balafre sur la joue
    if ((f === 'right' || f === 'left') && y >= H - 2) return grain(MANE, x, y, 97, 4);   // favoris gris
    if (f === 'bottom' || f === 'back') return fur(f, x, y, W, H, 94, 2);
    return fur(f, x, y, W, H, 94, y < 2 ? 4 : 3, GOAT);
  });
  paint('neck', (f, x, y, W, H) => f === 'back' || f === 'top' ? grain(MANE, x, y, 95, 3) : fur(f, x, y, W, H, 95, 3));
  paint('muzzle', (f, x, y, W, H) => {
    const stripe = c => R(FUR, 1 + (hs(x, y, c) > .65 ? 1 : 0));
    if (f === 'front') {
      if (y === 1 && (x === 0 || x === 3)) return '#0b0505';                       // naseaux évasés
      if (y === 0) return x === 0 || x === 3 ? stripe(104) : R(GOAT, 6);
      if (y === 3) return '#140b09';                                               // la gueule
      if (y === 2) return x === 0 || x === 3 ? MUZ[1] : R(MUZ, 4);
      return grain(GOAT, x, y, 101, 5);
    }
    if (f === 'top') return x === 0 || x === 3 ? stripe(102) : grain(GOAT, x, y, 105, 6, .25, 0);   // chanfrein entre les raies
    if (f === 'bottom') return MUZ[1];
    if (y === H - 1) return '#170c0a';                                             // commissure
    if (y <= 1) return stripe(106);                                               // les raies passent sur les côtés
    return grain(MUZ, x, y, 103, f === 'back' ? 1 : 3);
  });
  paint('chin', (f, x, y) => { const ph = hs(x, 0, 111) * 2 | 0; return (y + ph) % 2 ? FUR[1] : R(FUR, 3 + (hs(x, y, 112) > .6 ? 1 : 0)); });
  paint('brow', (f, x, y) => f === 'top' ? grain(MANE, x, y, 121, 3) : f === 'bottom' ? FUR[0] : y === 0 ? FUR[5] : FUR[2]);
  const ear = notch => (f, x, y, W) => {
    const tip = f === 'left' || ((f === 'front' || f === 'back' || f === 'top' || f === 'bottom') && x === W - 1);
    if (notch && tip && y === 0) return null;                                     // oreille entaillée
    if (f === 'front' && x >= 1 && x <= 2 && y === 1) return '#5a2a22';            // intérieur
    return fur(f, x, y, W, 2, notch ? 131 : 132, 4, GOAT);
  };
  paint('ear', ear(false)); paint('earN', ear(true));
  paint('braid', (f, x, y) => {                                                    // tresse : brins croisés
    if (f === 'top' || f === 'bottom') return FUR[2];
    return (x + y) % 2 ? FUR[1] : R(FUR, y % 2 ? 5 : 4);
  });
  paint('tuft', (f, x, y, W, H) => {
    if (f === 'bottom') return (x + y) % 2 ? null : FUR[3];
    if (f === 'top') return FUR[2];
    if (y === H - 1) return hs(x, y, 141) > .4 ? FUR[4] : null;                      // pointes effilochées
    return (x + y) % 2 ? FUR[2] : FUR[4];
  });

  // ---------- les cornes : anneaux en relief, plus sombres vers la pointe ----------
  const horn = (seg, k) => (f, x, y, W, H) => {
    const dark = seg * .5;
    if (f === 'top' || f === 'bottom') return R(HORN, 4 - dark - (f === 'bottom' ? 1 : 0));
    let L = (y + seg) % 2 === 0 ? 5 : 4;                                           // un anneau tous les 2 px
    if ((y + seg) % 4 === 3) L = 2.6;                                              // sillon
    if (f === 'back') L -= 1.4; else if (f === 'right' || f === 'left') L -= .5;
    if (seg === 0 && y >= H - 2) L -= 1.5;                                        // la base, encrassée
    if (hs(x, y, k) > .88) L -= 1;
    return R(HORN, L - dark);
  };
  paint('horn1', horn(0, 151)); paint('horn2', horn(1, 152)); paint('horn3', horn(2, 153)); paint('horn4', horn(3, 154));
  paint('horn5', (f, x, y) => y === 0 ? HORN[0] : y === 1 ? HORN[1] : HORN[2]);
  paint('horn4b', (f, x, y, W, H) => {                                             // la corne droite, cassée net
    if (f === 'top') return (x + y) % 2 ? HORN[5] : HORN[3];
    if (y === 0 && (f === 'front' || f === 'left') && x === 0) return null;          // éclat
    return horn(3, 155)(f, x, y, W, H);
  });

  // ---------- les bras ----------
  paint('delt', (f, x, y, W, H) => {
    if (f === 'top') return hs(x, y, 161) > .7 ? MANE[2] : fur(f, x, y, W, H, 164, 4);   // quelques poils gris
    if (y === 0) return grain(MANE, x, y, 163, 2);
    return fur(f, x, y, W, H, 162, 3);
  });
  paint('uarm', (f, x, y, W, H) => fur(f, x, y, W, H, 172, y < 2 ? 3 : 3));
  paint('farm', (f, x, y, W, H) => {
    if (y < 2 || f === 'top') return fur(f, x, y, W, H, 181, 3);
    if (f === 'bottom') return WRAP[1];
    // brassard de cuir clouté et lacé
    if (y === 2 || y === H - 1) return LEA[0];
    if (f === 'back' && x === 2) return y % 2 ? WRAP[2] : LEA[0];                    // laçage
    if (y === 4 && (x === 1 || x === W - 2) && f !== 'back') return IRON[2];       // deux clous
    return grain(LEA, x, y, 182, y === 3 ? 2 : 1, .2, .15);
  });
  paint('fist', (f, x, y, W, H) => {
    // bandages de lutteur ; jointures sous le poing et doigts repliés sur la face avant
    if (f === 'bottom') return x % 2 ? WRAP[1] : (y === 0 || y === H - 1 ? WRAP[2] : WRAP[4]);
    if (f === 'top') return y === 0 || y === H - 1 ? WRAP[2] : WRAP[3];
    if (f === 'front' && y >= 3) return (x === 0 || x === W - 1) ? WRAP[2] : x % 2 ? FUR[2] : WRAP[3];
    if ((y + (x >> 1)) % 3 === 0) return WRAP[2];
    return y === 0 ? WRAP[5] : WRAP[4];
  });

  // ---------- la chope : douelles cerclées de fer ----------
  paint('mug', (f, x, y, W, H) => {
    if (f === 'top') return x === 0 || y === 0 || x === W - 1 || y === H - 1 ? WOOD[4] : '#170c05';
    if (f === 'bottom') return WOOD[0];
    if (y === 1 || y === H - 2) return IRON[1];
    return x % 2 ? WOOD[2] : WOOD[3];
  });
}

/* ================= Le modèle ================= */
const GY = -1.1;                                           // le corps de bouc, presque de profil : la croupe part vers la gauche de l'écran
const B = (name, o, s, extra) => Object.assign({ o, s, uv: UV[name] }, extra || {});
const CUFF = [.26, .145, .075], EYE = [1, .5, .1], GOLD = [.95, .7, .25], IRONC = [.55, .55, .6], ALE = [1, .55, .16], DARKW = [.3, .19, .1];
const PUP = [.05, .02, .015], LID = [.2, .14, .11], LID_OPEN = PI / 2 + .05;
/* corne : cinq tronçons qui se recouvrent (pas de jour aux articulations), orientés le long d'une ligne médiane
   dessinée dans le repère de la tête : elle monte, part vers l'arrière et vers l'extérieur, puis s'enroule sur le côté */
const HORN_PATH = [[.35, -1, .25], [.6, -.6, .7], [.55, .1, .85], [.45, .85, .35], [.35, .8, -.45]];
const HORN_SEG = [['horn1', [-1.5, -5, -1.5], [3, 6, 3]], ['horn2', [-1.5, -5, -1.5], [3, 6, 3]], ['horn3', [-1, -5, -1], [2, 6, 2]], ['horn4', [-1, -5, -1], [2, 6, 2]], ['horn5', [-.5, -3.5, -.5], [1, 4, 1]]];
const HORNS = side => {
  const L = side > 0, id = L ? 'hornL' : 'hornR', mir = L ? 0 : 1, n = L ? 5 : 4;
  let Rp = ID3, root = null, prev = null;
  for (let k = 0; k < n; k++) {
    const d = HORN_PATH[k], dir = [d[0] * side, d[1], d[2]], r = aim(scl(appT(Rp, dir), -1));
    Rp = mul(Rp, rot(r));
    let seg = HORN_SEG[k];
    if (!L && k === 3) seg = ['horn4b', [-1, -3.5, -1], [2, 4, 2]];                 // la droite s'arrête net
    const part = { n: id + (k ? k + 1 : ''), p: k ? [0, -4.5, 0] : [side * 2.5, -7, -2.5], r, b: [B(seg[0], seg[1], seg[2], { mir })] };
    if (prev) prev.c = [part]; else root = part;
    prev = part;
  }
  return root;
};
/* pattes : le flanc extérieur de la cuisse (et du canon arrière) affleurait le flanc du corps (x = ±6) et les deux
   faces se disputaient les pixels ; les pivots sont écartés de 0,08 px (±4,08 et ±4,58) : la patte passe devant.
   Genou avant : le pivot du canon est remonté de 1 px dans la cuisse (canon et sabot redescendus d'autant : rien ne
   bouge au repos). Posé sur la face du dessous, le canon replié du raclement (126°) ressortait au bout de la cuisse */
const LEGF = (n, x, mir) => ({ n: 'leg' + n, p: [x, 1, -17.5], b: [B('fleg', [-2, -1, -2], [4, 7, 4], { mir })],
  c: [{ n: 'shin' + n, p: [0, 5, 0], b: [B('fshin', [-1.5, 1, -1.5], [3, 7, 3], { mir })], c: [{ n: 'hoof' + n, p: [0, 8, 0], b: [B('hoof', [-2, 0, -2], [4, 2, 4], { mir })] }] }] });
const LEGH = (n, x, mir) => ({ n: 'leg' + n, p: [x, -2, 0], b: [B('haunch', [-2.5, -2, -4], [5, 9, 7], { mir })],
  c: [{ n: 'hock' + n, p: [0, 7, 1], b: [B('hshin', [-1.5, 0, -1.5], [3, 9, 3], { mir })], c: [{ n: 'hoof' + n, p: [0, 9, 0], b: [B('hoof', [-2, 0, -2], [4, 2, 4], { mir })] }] }] });
const ARM = side => {
  const L = side > 0, mir = L ? 0 : 1;
  return { n: L ? 'armL' : 'armR', p: [side * 9, -8, 0], r: [0, 0, -side * .1],
    /* coude : bras aminci de 0,05 px et avant-bras gonflé de 0,1 px par côté (patrons inchangés) ; leurs flancs, de
       même largeur, tombaient dans le même plan quand le coude pliait et scintillaient */
    b: [B('delt', [-3, -4, -3], [6, 6, 6], { mir }), B('uarm', [-2.45, 1, -2.45], [4.9, 8, 4.9], { mir, us: [5, 8, 5] })],
    c: [{ n: L ? 'foreL' : 'foreR', p: [0, 9, 0], b: [B('farm', [-2.6, -1, -2.6], [5.2, 9, 5.2], { mir, us: [5, 9, 5] })],
      /* poignet : le poing peut se plier au bout de l'avant-bras (pour se frotter les mains, poing contre poing). La cale
         de cuir, 0,2 px plus mince que l'avant-bras et qui entre de 1 px dans le poing, reste cachée au repos ; poignet
         plié, elle bouche le coin qui s'ouvrait entre le bout de l'avant-bras et le dos du poing */
      c: [{ n: L ? 'handL' : 'handR', p: [0, 8, 0], b: [B('fist', [-3, 0, -3], [6, 5, 6], { mir }), { o: [-2.4, -2.5, -2.4], s: [4.8, 3.5, 4.8], col: CUFF }] }] }] };
};
/* pivot de la taille sur le corps de bouc (repère du corps) : le torse humain avance de 0,85 px vers le client (le long
   de son propre axe, d'où ce décalage oblique). Posé en (0, -6, -20), l'arête avant du corps de bouc perçait le tablier
   d'un liseré clair, de 0,2 à 0,7 px selon le regard */
const WAIST = [-.76, -6, -20.39];
/* chope posée sur le comptoir, au bout d'un levier de 40 px (le moteur ne fait que tourner les parties : le levier la fait sauter) */
const MUGS = { A: [-18, -15, 1], B: [16, -19, -1], C: [3, -25, 1] };
const MUG = n => { const m = MUGS[n]; return { n: 'mug' + n, p: [m[0], 10.98, m[1] + 40], c: [{ n: 'mug' + n + 'b', p: [0, 0, -40], b: [
  B('mug', [-2, -5, -2], [4, 5, 4]),
  { o: m[2] > 0 ? [2, -4, -.5] : [-3, -4, -.5], s: [1, 3, 1], col: DARKW },
  { o: [-1.5, -5.12, -1.5], s: [3, .1, 3], col: ALE, e: .5 }] }] }; };

const PARTS = [
  { n: 'goat', p: [0, 0, 0], r: [0, GY, 0], c: [
    { n: 'barrel', p: [0, 8, 20], b: [B('barrel', [-6, -9, -20], [12, 11, 26])], c: [   // pivot aux hanches
      LEGF('FL', 4.08, 0), LEGF('FR', -4.08, 1), LEGH('HL', 4.58, 0), LEGH('HR', -4.58, 1),
      { n: 'tail', p: [0, -9, 6], r: [-.7, 0, 0], b: [B('tail', [-1.5, -6, -1], [3, 6, 2])],
        // pinceau élargi de 0,1 px par côté (patron inchangé) : à la jointure, ses flancs étaient ceux de la queue ; plus
        // large (et non plus mince), il couvre la jointure sans y ouvrir d'encoche quand la queue fouette
        c: [{ n: 'tail2', p: [0, -5.5, 0], b: [B('tailT', [-1.6, -4, -1.1], [3.2, 4, 2.2], { us: [3, 4, 2] })] }] },
      // ventre reculé de 0,15 px : sa face avant était dans le plan de celle du torse (rayures sous les pectoraux)
      { n: 'waist', p: WAIST, r: [0, -GY, 0], b: [B('belly', [-6, -7, -3.85], [12, 8, 8])], c: [
        { n: 'chest', p: [0, -5, 0], b: [B('chest', [-7, -11, -4], [14, 11, 8]), B('hump', [-6, -15, -2], [12, 5, 8])], c: [
          /* le tablier pend de sa bretelle (pivot au milieu de son bord haut) : quand le buste se penche (menace, colère),
             il reste plus droit. Collé au torse, son bas reculait dans le corps de bouc, dont le coin avant le perçait */
          { n: 'apron', p: [0, -7, -4.5], b: [B('apron', [-5, 0, -.5], [10, 16, 1])] },
          { n: 'head', p: [0, -11, -1], r: [.1, 0, 0], b: [
              B('neck', [-3, -2, -4], [6, 4, 6]),
              B('head', [-4, -8, -6], [8, 7, 7]),
              B('muzzle', [-2, -3, -10], [4, 4, 5]),
              B('chin', [-2, 1, -9], [4, 3, 3]),
              /* yeux : 0,6 px d'épaisseur, pile jusqu'à la face de la tête (à 0,62, leurs flancs mordaient sur les joues), et
                 bord extérieur rentré de 0,04 px : leur flanc n'est plus celui de la tête, et la paupière fermée les couvre */
              { o: [-3.96, -3.85, -6.6], s: [1.96, 1.1, .6], col: EYE, e: 1 },
              { o: [2, -3.85, -6.6], s: [1.96, 1.1, .6], col: EYE, e: 1 },
              { o: [-.8, -.2, -10.25], s: [.3, 2.2, .3], col: GOLD },
              { o: [.5, -.2, -10.25], s: [.3, 2.2, .3], col: GOLD },
              { o: [-.8, 1.7, -10.25], s: [1.6, .3, .3], col: GOLD }],
            c: [HORNS(1), HORNS(-1),
              /* pupilles fendues, comme celles des chèvres : elles suivent le regard ; en colère, elles pivotent
                 d'un quart de tour à l'intérieur de l'œil, qui brille alors tout entier.
                 Chaque pupille tourne autour de son propre globe (pivot 6 px derrière l'œil), et non autour du
                 centre de la tête : sinon, quand il regarde de côté, une pupille s'enfonçait dans l'œil et
                 disparaissait. Elle est posée 0,05 à 0,1 px devant l'œil, marge que le regard n'entame pas. */
              { n: 'pupils', p: [0, -3.3, 0], c: [
                { n: 'gazeR', p: [-3, 0, -.3], c: [{ n: 'pupilR', p: [0, 0, -6], b: [{ o: [-.55, -.16, -.4], s: [1.1, .32, .05], col: PUP }] }] },
                { n: 'gazeL', p: [3, 0, -.3], c: [{ n: 'pupilL', p: [0, 0, -6], b: [{ o: [-.55, -.16, -.4], s: [1.1, .32, .05], col: PUP }] }] }] },
              /* paupières : une charnière au bord haut et avant (y = -4,04, z = -6,77), sous le sourcil. Ouvertes
                 (rx = LID_OPEN, un peu plus d'un quart de tour), elles sont rangées à plat DANS le sourcil, au-dessus de
                 l'œil ; à 0, elles le couvrent. Rangées dans l'œil, leurs flancs (2,06 px contre 1,96) en dépassaient,
                 et en se fermant elles sortaient par la face avant de l'œil sous son bord haut (bande lumineuse
                 au-dessus de la paupière). Fermées, rien ne change : face avant à z = -6,77, 0,07 px devant les
                 pupilles et 0,08 px derrière les sourcils, de y = -4,04 à -2,65. */
              { n: 'lidR', p: [-2.95, -4.04, -6.77], r: [LID_OPEN, 0, 0], b: [{ o: [-1.03, 0, 0], s: [2.06, 1.39, .08], col: LID }] },
              { n: 'lidL', p: [2.95, -4.04, -6.77], r: [LID_OPEN, 0, 0], b: [{ o: [-1.03, 0, 0], s: [2.06, 1.39, .08], col: LID }] },
              /* sourcils : 0,25 px devant les yeux (leurs faces étaient dans le même plan et scintillaient), et 0,08 px
                 devant les paupières fermées */
              { n: 'browL', p: [4.5, -4.5, -6], r: [0, 0, -.18], b: [B('brow', [-4, -1.5, -.85], [4, 2, 2])] },
              { n: 'browR', p: [-4.5, -4.5, -6], r: [0, 0, .18], b: [B('brow', [0, -1.5, -.85], [4, 2, 2], { mir: 1 })] },
              { n: 'earL', p: [4, -5, -2.5], r: [0, 0, .4], b: [B('ear', [0, -1, -1], [4, 2, 2])] },
              { n: 'earR', p: [-4, -5, -2.5], r: [0, 0, -.4], b: [B('earN', [-4, -1, -1], [4, 2, 2], { mir: 1 })] },
              { n: 'braid', p: [0, 4, -7.5], b: [B('braid', [-1, -1, -1], [2, 4, 2])], c: [
                // second tronçon élargi de 0,1 px par côté (patron inchangé) : à la jointure, ses flancs étaient ceux du premier ;
                // plus large (et non plus mince), il couvre la jointure sans y ouvrir d'encoche quand la tresse se balance
                { n: 'braid2', p: [0, 3, 0], b: [B('braid', [-1.1, -1, -1.1], [2.2, 4, 2.2], { us: [2, 4, 2] }), { o: [-1.25, 1.2, -1.25], s: [2.5, 1, 2.5], col: IRONC }], c: [
                  { n: 'braid3', p: [0, 3, 0], b: [B('tuft', [-1.5, -.5, -1.5], [3, 3, 3])] }] }] }] },
          ARM(1), ARM(-1)] }] }] }] },
  { n: 'mugs', p: [0, 0, 0], c: [MUG('A'), MUG('B'), MUG('C')] }
];

/* ================= Bras : visée et cinématique inverse ================= */
const UA = 9, FA = 13, COUNTER = 11;                         // épaule -> coude ; coude -> dessous du poing ; dessus du comptoir
/* bras : coude E et bout du poing T, dans le repère du torse (chest).
   Le coude est une charnière : le bras tourne sur lui-même pour que l'avant-bras plie vers sa face avant (-z), et
   l'avant-bras ne fait que plier autour de l'axe x du bras. Visés chacun de leur côté (aim), le bras prenait la
   torsion de sa direction et l'avant-bras rattrapait l'écart en tournant sur lui-même, jusqu'à un demi-tour ; au
   fondu entre deux humeurs, cette torsion changeait d'une centaine de degrés : l'avant-bras vrillait autour de son
   axe et le coude se tordait de côté. Le poing et l'avant-bras gardent exactement la même orientation qu'avant ;
   seul le bras tourne sur son axe (deltoïde et bras sont des pavés centrés sur cet axe). */
function armTo(side, E, T) {
  const S = [side * 9, -8, 0], u = norm(sub(E, S)), f = norm(sub(T, add(S, scl(u, UA)))), c = clamp(dot(u, f), -1, 1);
  const b = sub(f, scl(u, c));                               // vers où plie le coude
  if (Math.hypot(b[0], b[1], b[2]) < 1e-6) return [aim(u), [0, 0, 0]];   // bras tendu : pas de pli, pas de plan
  const Z = scl(norm(b), -1), X = cross(u, Z);               // repère du bras : y = u, et sa face avant (-z) côté pli
  return [euler([X[0], u[0], Z[0], X[1], u[1], Z[1], X[2], u[2], Z[2]]), [-Math.acos(c), 0, 0]];
}
/* cinématique inverse : T = dessous du poing, dans le repère du modèle ; pole = côté où plie le coude (repère du torse).
   Rend [coude, poing] dans le repère du torse. */
function solve(side, Fc, T, pole, fa) {
  fa = fa || FA;                                             // fa = 8 : T est alors le poignet, et non le bout du poing
  const S = [side * 9, -8, 0], Tc = appT(Fc.R, sub(T, Fc.t)), d = sub(Tc, S), D = Math.hypot(d[0], d[1], d[2]) || 1;
  const Dc = clamp(D, Math.abs(fa - UA) + .1, UA + fa - .02), dn = scl(d, 1 / D);
  const a = Math.acos(clamp((UA * UA + Dc * Dc - fa * fa) / (2 * UA * Dc), -1, 1));
  let q = sub(pole, scl(dn, dot(pole, dn))); q = Math.hypot(q[0], q[1], q[2]) < 1e-3 ? [0, 0, 1] : norm(q);
  const u = add(scl(dn, cos(a)), scl(q, sin(a)));
  return [add(S, scl(u, UA)), add(S, scl(dn, Dc))];
}
const reach = (side, Fc, T, pole) => { const e = solve(side, Fc, T, pole); return armTo(side, e[0], e[1]); };
/* fondu des bras entre deux humeurs (blend du contrat) : ils passent par les positions du coude et du bout du poing, et
   non par les angles. Fondus angle par angle, chaque partie par son plus court chemin, le poing quittait la hanche tout
   droit vers la paume, au travers du tablier et du ventre. Ici coude et poing tournent autour du buste (axe vertical du
   torse : angle, distance à l'axe et hauteur fondus), écartés en chemin d'autant plus que le trajet est long (4 px au
   plus pour le poing, 2 pour le coude), et le coude reste une charnière (armTo) */
function around(P, Q, b, out) {
  const a0 = Math.atan2(P[0], -P[2]); let da = Math.atan2(Q[0], -Q[2]) - a0;
  da -= Math.round(da / (2 * PI)) * 2 * PI;                  // par le plus court côté
  const r = lerp(Math.hypot(P[0], P[2]), Math.hypot(Q[0], Q[2]), b) + out, an = a0 + da * b;
  return [r * sin(an), lerp(P[1], Q[1], b), -r * cos(an)];
}
function blend(from, to, b) {
  const o = {}, arc = sin(b * PI);
  [1, -1].forEach(sd => {
    const n = sd > 0 ? 'L' : 'R', S = [sd * 9, -8, 0];
    const fk = r => { const Ra = rot(r['arm' + n] || []), E = add(S, app(Ra, [0, UA, 0])); return [E, add(E, app(mul(Ra, rot(r['fore' + n] || [])), [0, FA, 0]))]; };
    const A = fk(from), B = fk(to), d = Math.hypot(B[1][0] - A[1][0], B[1][1] - A[1][1], B[1][2] - A[1][2]);
    const a = armTo(sd, around(A[0], B[0], b, arc * Math.min(2, d * .2)), around(A[1], B[1], b, arc * Math.min(4, d * .3)));
    o['arm' + n] = a[0]; o['fore' + n] = a[1];
  });
  return o;
}
/* point le plus bas du poing au-dessus du comptoir (z < -10,5), ou null */
function fistLow(side, Fc, a) {
  const Fa = child(Fc, [side * 9, -8, 0], a[0]), Ff = child(Fa, [0, UA, 0], a[1]);
  let low = null;
  for (let i = 0; i < 8; i++) {
    const p = add(Ff.t, app(Ff.R, [i & 1 ? 3 : -3, i & 2 ? 13 : 8, i & 4 ? 3 : -3]));
    if (p[2] < -10.5 && (low === null || p[1] > low)) low = p[1];
  }
  return low;
}
/* poing qui vise le comptoir : il ne s'enfonce jamais ; « posé » = le coin le plus bas touche juste le dessus */
function plant(side, Fc, T, pole, rest) {
  let a = reach(side, Fc, T, pole), y = T[1];
  for (let i = 0; i < 4; i++) {                              // le coin le plus bas change quand le poing pivote : on affine
    const low = fistLow(side, Fc, a);
    if (low === null || (!rest && low <= COUNTER - .02) || abs(low - COUNTER + .03) < .01) break;
    y -= low - COUNTER + .03; a = reach(side, Fc, [T[0], y, T[2]], pole);
  }
  return a;
}

/* ================= Les animations ================= */
const NOSE = [[-1.5, -1.6, -10.2], [1.5, -1.6, -10.2]];
const snort = (fx, n) => NOSE.forEach(a => fx.push({ kind: 'smoke', part: 'head', at: a, dir: [a[0] * .35, .55, -1], n }));
const bump = (ph, w) => ph < w ? sin(ph / w * PI) : 0;       // une bosse de durée w au début d'une période
const HIT = .53;                                             // instant du coup sur le comptoir (pic du rougeoiement de l'écran)
const look = { t: -1, x: 0, y: 0 };
function pose(t, st) {
  st = st || {};
  const m = st.mood === 'angry' || st.mood === 'threat' ? st.mood : 'idle';
  // animations réduites : une pose fixe par humeur (en colère : appuyé sur ses poings, chopes retombées, sans ruade)
  const s = REDUCE ? { idle: 3, threat: 1.2, angry: 1.5 }[m] : Math.max(0, +st.since || 0);
  // regard lissé (la tête ne claque pas d'une cible à l'autre)
  const lk = st.look || { x: 0, y: 0 }, tx = clamp(+lk.x || 0, -1, 1), ty = clamp(+lk.y || 0, -1, 1), dt = t - look.t; look.t = t;
  if (!(dt > 0 && dt < .5)) { look.x = tx; look.y = ty; } else { const k = 1 - Math.exp(-dt * 6); look.x += (tx - look.x) * k; look.y += (ty - look.y) * k; }
  const lx = look.x, ly = look.y;
  const fx = [], P = { fx, _glow: .72, _shake: 0 };
  const br = sin(t * 1.9), br2 = sin(t * 1.9 - .5);           // respiration (≈ 3,3 s)
  let gy = GY, bx = 0, w = .04, c = 0, ct = 0, hx = .1, hy = 0, hz = 0, arms = null;
  let browL = -.18, tail = [-.7, 0, 0], tail2 = [0, 0, 0], blink = 0, pupil = 0, kick = 0;
  let ex = lx, ey = ly, tuck = 0;              // où regardent les yeux (le marchand regarde le client) ; barbe rangée
  const legs = { legFL: [0, 0, 0], shinFL: [0, 0, 0], legFR: [0, 0, 0], shinFR: [0, 0, 0], legHL: [0, 0, 0], hockHL: [0, 0, 0], legHR: [0, 0, 0], hockHR: [0, 0, 0] };
  const mug = { A: 0, B: 0, C: 0 }, mugT = { A: [0, 0, 0], B: [0, 0, 0], C: [0, 0, 0] };
  const frames = () => { const Fg = child(ROOT, [0, 0, 0], [0, gy, 0]), Fb = child(Fg, [0, 8, 20], [bx, 0, 0]), Fw = child(Fb, WAIST, [w, -gy, 0]); return child(Fw, [0, -5, 0], [c, ct, 0]); };

  if (m === 'idle') {
    // il respire lentement et te suit des yeux
    // il se tourne vers ce qu'il regarde du buste autant que de la tête (0,25 + 0,45, comme 0,1 + 0,6 avant) : la tête
    // seule, tournée et baissée vers un article du bord, entrait dans l'épaule (oreille, sourcil, joue)
    w = .04 + br * .012; c = -.03 + br2 * .02; ct = -lx * .25;
    hx = .1 + ly * .3 + sin(t * .7) * .015; hy = -lx * .45;
    const nk = (t + 4) % 9.7;                                   // craquement de nuque : la tête bascule d'un côté puis de l'autre
    // (moins ample quand il regarde vers le bas : tête baissée, elle penchait jusque dans l'épaule)
    if (nk < 1.2) { const e = nk / 1.2; hz = sin(e * PI * 2) * .3 * sin(e * PI) * (1 - .6 * clamp(ly, 0, 1)); hx += sin(e * PI) * .08; }
    // poings sur les hanches ; de temps en temps il croise les bras (on fond les cibles coude/poing, pas les angles)
    const b = br2 * .35, Fc = frames(), cy = (t + 3) % 17, mix = cy < 9 ? 0 : cy < 9.9 ? smooth((cy - 9) / .9) : cy < 15.6 ? 1 : smooth(1 - (cy - 15.6) / .9);
    /* bras croisés (coude, bout du poing ; repère du torse, longueurs exactes : 9 et 13 px) : l'avant-bras gauche passe
       devant, coude avancé, poing devant la tresse ; le droit dessous, près du tablier, poing sous la tresse. Les deux
       poings, qui finissaient au même endroit (à 2 px l'un de l'autre pour 6 d'épaisseur), se fondaient en un seul bloc
       où disparaissait le pompon de la tresse. En chemin, ils passent 6 px devant le ventre (4 : ils traversaient le tablier) */
    const CROSS = [[[9.4, -3.55, -7.81], [-1.27, -.81, -14.71]], [[-9.93, -.25, -4.48], [-.5, 6.7, -10.12]]];
    arms = [1, -1].map((sd, i) => {
      const h = solve(sd, Fc, [sd * 8, 4.2 + b, -1.2], [sd, -.25, .45]), x = CROSS[i], arc = sin(mix * PI) * 6;
      const E = [lerp(h[0][0], x[0][0], mix), lerp(h[0][1], x[0][1] + b, mix), lerp(h[0][2], x[0][2], mix) - arc * .5];
      const T = [lerp(h[1][0], x[1][0], mix), lerp(h[1][1], x[1][1] + b, mix), lerp(h[1][2], x[1][2], mix) - arc];
      return armTo(sd, E, T);
    });
    const fl = (t % 5.3) < .16, fr = ((t + 2.2) % 6.9) < .16;   // oreilles qui chassent les braises
    P.earL = [0, fl ? -.35 : 0, fl ? .05 : .4]; P.earR = [0, fr ? .35 : 0, fr ? -.05 : -.4];
    tail = [-.7 + sin(t * 1.3) * .08, 0, sin(t * 2.1) * .32 + ((t % 4.1) < .5 ? sin((t % 4.1) * 37) * .25 : 0)];   // et un frétillement
    tail2 = [.15 + sin(t * 1.3 - .8) * .12, 0, sin(t * 2.1 - .9) * .3];
    blink = Math.max(bump(t % 4.3, .17), bump((t + 1.9) % 7.1, .17), bump((t + 2.25) % 7.1, .17));   // parfois deux de suite
    legs.legHL = [sin(t * .6) * .03, 0, 0];                // il change d'appui
    if ((t % 6.4) < .45) snort(fx, 22);
    if (st.hover) { hx += sin(t * 4.2) * .07; browL = -.04; }     // on lui montre le tronc de soutien : il hoche la tête, radouci
    P._glow = .72;
  } else if (m === 'threat') {
    // le marchand gourmand : il te regarde droit dans les yeux en se frottant les mains devant la poitrine, coudes pliés
    // (des braises jaillissent entre ses poings), les yeux qui brillent, les oreilles dressées, la queue qui frétille
    const rb = t * PI * 3, ph = sin(rb), pc = cos(rb);              // un aller-retour toutes les 0,67 s
    ex = 0; ey = 0;                                             // il regarde le client, pas l'article
    /* le client (la caméra) est à peine plus haut que ses yeux (1 à 2°) : penché vers lui, il relève la tête pour que son
       visage le vise (buste + tête : -0,02 rad, soit 1° vers le haut ; à +0,29, il regardait le comptoir) */
    w = .06 + br * .01; c = .02 + abs(pc) * .015; ct = 0;
    hx = -.12 + abs(ph) * .02; hy = 0; hz = .04;
    const Fc = frames(), inC = p => add(Fc.t, app(Fc.R, p));
    /* les poings se frottent jointures contre jointures : chaque poignet plie son poing vers l'autre (axe x du torse), et
       les deux faces des jointures glissent à plat l'une contre l'autre, en sens opposés (haut-bas, avant-arrière).
       W = poignets (repère du torse) : le poing fait 5 px, ses jointures arrivent à X - 5 de l'axe. Coudes pliés : les
       poignets sont à 15 px de l'épaule (bras 9, avant-bras 8). Pôles : le coude gauche vers le bas et l'extérieur, le droit
       plus haut, car le corps de bouc part de son côté */
    const X = 5.06, Y = -1, Z = -12.5, A = 1.4, D = .6;
    const W = [[X, Y + ph * A, Z + pc * D], [-X, Y - ph * A, Z - pc * D]], POLE = [[1.3, .8, .4], [-1, .5, .3]];
    arms = [1, -1].map((sd, i) => { const e = solve(sd, Fc, inC(W[i]), POLE[i], 8); return armTo(sd, e[0], e[1]); });
    [1, -1].forEach((sd, i) => { P[sd > 0 ? 'handL' : 'handR'] = aim(appT(mul(rot(arms[i][0]), rot(arms[i][1])), [-sd, 0, 0])); });
    // des braises jaillissent du haut des poings, entre les jointures, en gerbe à chaque passage
    fx.push({ kind: 'spark', part: 'chest', at: [0, Y - 3.6, Z - .5], dir: [0, -1, -.4], n: abs(ph) < .25 ? 70 : 6 });
    tuck = .33;                                                 // la barbe se range contre le poitrail, derrière les poings
    P.earL = [0, .3, .12]; P.earR = [0, -.3, -.12];
    tail = [-.95, 0, sin(t * 13) * .3]; tail2 = [.05, 0, sin(t * 13 - .7) * .3];
    blink = bump((t + .7) % 4.1, .15);
    legs.legHL = [sin(t * .6) * .03, 0, 0];
    if ((t % 2.6) < .3) snort(fx, 30);
    P._glow = 1;
  } else {
    // il se dresse, abat ses poings sur le comptoir, reste appuyé en soufflant, puis se redresse
    const k = s % 2.4, wind = easeOut(k / .34), slam = easeIn((k - .34) / (HIT - .34)), after = k - HIT, rec = smooth((k - 1.35) / .8);
    /* poings levés : 10,5 px de l'axe et 6 px devant (à 8 et 5, le poing droit coupait le sourcil et l'œil, tête
       renversée). En montant, ils passent 6 px devant les épaules : tirés droit vers le haut, ils frôlaient l'épaule,
       le coude se repliait à fond et chaque poing entrait dans son deltoïde */
    const PLANT = [[7.5, COUNTER - 1.3, -16], [-7.5, COUNTER - 1.3, -15.5]], UPF = [[10.5, -29, -6], [-10.5, -29, -6]], STAND = [[11, 3, -6], [-11, 3, -6]];
    /* côté où plient les coudes (écartés, vers l'arrière) : plus bas pendant l'élan (PW), un peu moins pendant la
       frappe (PB), relevés une fois appuyé (PH). Changé d'un coup à chaque phase, il faisait tourner bras et avant-bras
       d'un bloc (28° en haut de l'élan, 17° au coup sur le comptoir) : il glisse désormais de l'un à l'autre quand les
       bras bougent peu (fin de l'élan, poings posés, retour), et la frappe reste telle quelle */
    const PW = [.6, .4, .7], PB = [.5, .1, 1], PH = [.5, -.2, 1], mixP = (a, b, u) => [lerp(a[0], b[0], u), lerp(a[1], b[1], u), lerp(a[2], b[2], u)];
    let tgt, pole;
    if (k < .34) {
      // l'élan part de la pose où il finit de se redresser (k = 2,4) : quand on reclique, la colère reboucle sans à-coup
      // (la tête sautait de 26° vers le client, la tresse de 11°) ; venant du calme, le fondu du moteur couvre le départ
      w = lerp(.14, -.08, wind); c = lerp(.02, -.05, wind); bx = -.14 * wind; hx = lerp(.05 + ly * .25, -.22, wind); hy = -lx * .45 * (1 - wind); browL = -.5;
      legs.legFL = [-.5 * wind, 0, 0]; legs.shinFL = [.9 * wind, 0, 0]; legs.legFR = [-.4 * wind, 0, 0]; legs.shinFR = [.8 * wind, 0, 0];
      tgt = [0, 1].map(i => [lerp(STAND[i][0], UPF[i][0], wind), lerp(STAND[i][1], UPF[i][1], wind), lerp(STAND[i][2], UPF[i][2], wind) - sin(wind * PI) * 6]);
      pole = mixP(PW, PB, smooth((k - .1) / .24));
    } else if (k < HIT) {
      w = lerp(-.08, .44, slam); c = lerp(-.05, .2, slam); bx = lerp(-.14, 0, slam); hx = lerp(-.22, .3, slam); browL = -.5;
      legs.legFL = [-.5 * (1 - slam), 0, 0]; legs.shinFL = [.9 * (1 - slam), 0, 0]; legs.legFR = [-.4 * (1 - slam), 0, 0]; legs.shinFR = [.8 * (1 - slam), 0, 0];
      tgt = [0, 1].map(i => { const a = [lerp(UPF[i][0], PLANT[i][0], slam), lerp(UPF[i][1], PLANT[i][1], slam), lerp(UPF[i][2], PLANT[i][2], slam)]; a[2] -= sin(slam * PI) * 9; a[1] = Math.min(a[1], PLANT[i][1]); return a; });
      pole = PB;
    } else {
      // appuyé sur ses poings : le torse pompe, la tête secoue puis se relève pour te fixer
      const settle = Math.exp(-after * 5), hold = 1 - rec;
      w = lerp(.36 + .08 * settle + br * .02, .14, rec); c = lerp(.18, .02, rec); bx = 0;
      const shakeH = after < 1 ? sin(after * 17) * .28 * Math.exp(-after * 2.2) : 0;
      hx = lerp(.3 - smooth(after / .9) * .3 + ly * .2, .05 + ly * .25, rec); hy = shakeH * hold - lx * .45 * smooth(after / .8);
      browL = -.5;
      tgt = [0, 1].map(i => [lerp(PLANT[i][0], STAND[i][0], rec), lerp(PLANT[i][1], STAND[i][1], rec) - sin(rec * PI) * 3, lerp(PLANT[i][2], STAND[i][2], rec)]);
      pole = mixP(mixP(PB, PH, smooth(after / .25)), PW, rec);
      if (after < .09) {
        fx.push({ kind: 'spark', part: 'foreL', at: [0, 13, -2], n: 190 }, { kind: 'spark', part: 'foreR', at: [0, 13, -2], n: 190 });
        fx.push({ kind: 'dust', part: 'foreL', at: [0, 13, 0], n: 300 }, { kind: 'dust', part: 'foreR', at: [0, 13, 0], n: 300 });
        ['A', 'B', 'C'].forEach(q => fx.push({ kind: 'spark', at: [MUGS[q][0], 5, MUGS[q][1]], n: 70 }));       // la bière de braise gicle
      }
      if (after > .06 && after < 1.6) snort(fx, after < .7 ? 95 : 45);
      P._shake = Math.exp(-after * 6.5);
      // les chopes sautent, retombent, rebondissent
      [['A', .02, 6.5], ['B', .045, 5], ['C', .07, 4]].forEach(q => {
        const u2 = after - q[1], G = 430, T1 = 2 * sqrt(2 * q[2] / G), h2 = q[2] * .2, T2 = 2 * sqrt(2 * h2 / G);
        let y = 0, p = 0;
        if (u2 > 0 && u2 < T1) { y = u2 * G * T1 / 2 - G * u2 * u2 / 2; p = u2 / T1; }
        else if (u2 >= T1 && u2 < T1 + T2) { const v = u2 - T1; y = v * G * T2 / 2 - G * v * v / 2; }
        mug[q[0]] = y;
        const tilt = Math.min(.3, Math.asin(clamp(y / 3, 0, 1))) * sin(p * PI);
        mugT[q[0]] = [tilt * (q[0] === 'B' ? -1 : 1), sin(p * PI) * .35, tilt * .6];
      });
    }
    const Fc = frames(), onIt = k >= HIT && k < 1.35;
    arms = [plant(1, Fc, tgt[0], pole, onIt), plant(-1, Fc, tgt[1], [-pole[0], pole[1], pole[2]], onIt)];
    P.earL = [0, -1, .25]; P.earR = [0, 1, -.25];
    tail = [-1.3, 0, sin(t * 21) * .14]; tail2 = [-.25, 0, sin(t * 21 - .6) * .22];
    pupil = 1;                                                  // les yeux s'embrasent : plus de pupilles
    if (k < .34) fx.push({ kind: 'spark', part: 'hornL5', at: [0, -3.5, 0], n: 70 }, { kind: 'spark', part: 'hornR4', at: [0, -3.5, 0], n: 45 });   // ses cornes crépitent
    // il rue d'une patte arrière, comme une mule, pendant qu'il est appuyé sur ses poings
    const kq = (k - .9) / .55;
    if (kq > 0 && kq < 1) {
      kick = kq < .28 ? easeOut(kq / .28) : 1 - smooth((kq - .4) / .6);
      if (kq < .12) fx.push({ kind: 'dust', part: 'hoofHR', at: [0, 2, 0], n: 160 });
      if (kq > .9) { fx.push({ kind: 'dust', part: 'hoofHR', at: [0, 2, 0], n: 320 }, { kind: 'spark', part: 'hoofHR', at: [0, 2, -1], n: 160 }); P._shake = Math.max(P._shake, .3); }
    }
    legs.legHR = [kick * .9, 0, 0]; legs.hockHR = [kick * 1.6, 0, 0];
    P._glow = 1;
  }

  P.goat = [0, gy, 0]; P.barrel = [bx, 0, 0]; P.waist = [w, -gy, 0]; P.chest = [c, ct, 0];
  // le tablier compense une partie de l'inclinaison du buste (et de sa torsion) : au calme, regard au client, il ne bouge pas
  P.apron = [-.5 * Math.max(0, w + c - .03) - .15 * abs(ct), 0, 0];
  P.head = [hx, hy, hz];
  // au calme, les oreilles se relèvent quand la tête se baisse, se tourne ou penche de leur côté : tombantes, elles
  // entraient dans le deltoïde (sd = 1 : oreille gauche, côté +x)
  if (m === 'idle') { const lf = sd => clamp(.6 * (hx - .1) + .4 * Math.max(0, -sd * hy) + 1.2 * Math.max(0, sd * hz), 0, .6);
    if (P.earL) P.earL = [P.earL[0], P.earL[1], P.earL[2] - lf(1)]; if (P.earR) P.earR = [P.earR[0], P.earR[1], P.earR[2] + lf(-1)]; }
  P.browL = [0, 0, browL]; P.browR = [0, 0, -browL];
  P.tail = tail; P.tail2 = tail2;
  // les yeux : pupilles qui suivent le regard ; paupières rangées (LID_OPEN) ou fermées (0)
  if (REDUCE) blink = 0;
  const lid = LID_OPEN * (1 - clamp(blink * 1.6, 0, 1));
  // la pupille dépasse de l'œil : la paupière qui descend en biais passait derrière elle. Dès que le bord de la
  // paupière atteint le haut de la pupille, celle-ci se range dans l'œil (comme en colère)
  if (blink > 0 && lid < Math.atan(.2 / Math.max(.2, .58 + .32 * ey))) pupil = 1;
  P.gazeL = P.gazeR = [ey * .05, -ex * .08 * (1 - pupil), 0];
  // rangée vers le centre de l'œil : vers le haut quand le regard descend (sinon elle ressortait sous l'œil)
  P.pupilL = P.pupilR = [pupil * (ey > 0 ? -1 : 1) * PI / 2, 0, 0];
  P.lidL = P.lidR = [lid, 0, 0];
  // pattes arrière : quand l'avant se lève, la cuisse se plie pour que le sabot reste posé, le canon reste d'aplomb
  ['HL', 'HR'].forEach(k => { const a = legs['leg' + k][0] - bx; legs['leg' + k] = [a, 0, 0]; legs['hock' + k] = [legs['hock' + k][0] - bx - a, 0, 0]; });
  // les sabots restent à plat sur l'estrade, quel que soit l'angle de la patte
  ['FL', 'FR'].forEach(k => { legs['hoof' + k] = [-(bx + legs['leg' + k][0] + legs['shin' + k][0]), 0, 0]; });
  ['HL', 'HR'].forEach(k => { legs['hoof' + k] = [-(bx + legs['leg' + k][0] + legs['hock' + k][0]) + (k === 'HR' ? kick * kick * 1.5 : 0), 0, 0]; });
  Object.assign(P, legs);
  if (arms) { P.armL = arms[0][0]; P.foreL = arms[0][1]; P.armR = arms[1][0]; P.foreR = arms[1][1]; }
  // la tresse pend : elle compense l'inclinaison du buste et de la tête ; tête basse, elle part vers le poitrail
  const tilt = bx + w + c + hx;
  // (elle suit le tablier quand il s'écarte du ventre, sinon il la rattrapait)
  P.braid = [-tilt + .12 + .62 * smooth((tilt - .3) / .5) + sin(t * 1.6) * .05 + P.apron[0] * 1.5 + tuck, 0, -hz * .8 + sin(t * 1.1) * .05];
  P.braid2 = [sin(t * 1.6 - .7) * .08 - .05, 0, sin(t * 1.1 - .6) * .06];
  P.braid3 = [sin(t * 1.6 - 1.3) * .08, 0, 0];
  // les chopes : levier de 40 px ; la seconde partie annule l'inclinaison du levier
  ['A', 'B', 'C'].forEach(k => { const a = -Math.asin(clamp(mug[k] / 40, -1, 1)); P['mug' + k] = [a, 0, 0]; P['mug' + k + 'b'] = [-a + mugT[k][0], mugT[k][1], mugT[k][2]]; });
  return P;
}

window.TAVERN_KEEPER = {
  name: 'Gromaur',
  skin: { w: SW, h: SH, draw },
  parts: PARTS,
  pose,
  blend,
  lines: {
    idle: ['Grmmh. Tu prends quoi ?', 'Ici, on paie en Braises.', 'Les Braises, ça se dépense au comptoir. En jeu.', 'Herobrine a une ardoise ici. Il paie jamais.', 'Je t\'ai à l\'œil.'],
    threat: ['Ahh. Bon choix.', 'Ça brille, hein ?', 'Celui-là, il part vite.'],
    angry: ['GRAAAH !', 'MON COMPTOIR !', 'On tripote pas la marchandise !', 'Pas de crédit ! JAMAIS !'],
    don: ['Un don ? Grmmh... Merci.', 'Pour le serveur ? Respect.', 'Rien en échange. Juste merci.']
  }
};
})();
