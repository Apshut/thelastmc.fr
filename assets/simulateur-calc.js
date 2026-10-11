/* The Last — le simulateur d'achat de la taverne (boutique.html) : les calculs, sans interface.
   Les paquets viennent de config.js (shop.products, kind « pack ») et ce qu'on obtient en jeu de shop.inGame : aucun
   prix n'est écrit ici. On n'achète que des paquets entiers, donc :
   - un budget en euros donne le panier qui rapporte le PLUS de Braises sans dépasser le budget (à Braises égales, le
     moins cher, puis le moins de paquets) ;
   - un nombre de Braises donne le panier le MOINS CHER qui en donne au moins autant (à prix égal, le plus de Braises,
     puis le moins de paquets).
   Tout est compté en centimes et en Braises entières : aucun arrondi de nombre à virgule.
   Dans la page : window.TL_SIMU. Sous Node (tests) : module.exports. */
(function (root) {
'use strict';

const MAX_CENTS = 100000;          // 1 000 € : au-delà, le simulateur plafonne (et le dit)
const MAX_BRAISES = 100000;

const gcd = (a, b) => { while (b) { const t = a % b; a = b; b = t; } return a; };

/* les paquets de config.js, prix en centimes, du plus gros au plus petit */
function paquets(cfg) {
  const shop = (cfg && cfg.shop) || {};
  return (shop.products || [])
    .filter(p => p && p.kind === 'pack' && p.braises > 0 && p.price > 0)
    .map(p => ({ id: p.id, name: p.name, short: p.short || p.name, braises: Math.round(p.braises), cents: Math.round(p.price * 100) }))
    .sort((a, b) => b.braises - a.braises);
}
/* ce qu'on obtient en jeu, du moins cher au plus cher */
function objets(cfg) {
  const shop = (cfg && cfg.shop) || {};
  return (shop.inGame || []).filter(o => o && o.braises > 0).slice().sort((a, b) => a.braises - b.braises);
}

/* saisies : « 12,50 € », « 12.5 », « 1 000 » → centimes ; « 1 300 » → Braises. null si illisible, négatif ou vide */
function lireEuros(s) {
  if (typeof s === 'number') return isFinite(s) && s >= 0 ? Math.round(s * 100) : null;
  s = String(s == null ? '' : s).replace(/[\s  €]/g, '').replace(',', '.');
  if (!/^(\d+(\.\d*)?|\.\d+)$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}
function lireBraises(s) {
  if (typeof s === 'number') return isFinite(s) && s >= 0 ? Math.floor(s) : null;
  s = String(s == null ? '' : s).replace(/[\s  ]/g, '');
  if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');  // « 1.300 », point des milliers
  if (!/^\d+$/.test(s)) return null;
  return parseInt(s, 10);
}

/* panier → [{ pack, n }] du plus gros paquet au plus petit */
function lignes(packs, nb) {
  return packs.map((p, i) => ({ pack: p, n: nb[i] })).filter(l => l.n > 0);
}

/* budget (centimes) → { lignes, braises, cents (payé), reste (non dépensé), plafond } */
function pourEuros(packs, budget) {
  const plafond = budget > MAX_CENTS;
  const B = Math.min(Math.max(0, Math.floor(budget || 0)), MAX_CENTS);
  const best = new Int32Array(B + 1).fill(-1), cnt = new Int32Array(B + 1), from = new Int8Array(B + 1).fill(-1);
  best[0] = 0;
  for (let c = 1; c <= B; c++) {
    for (let i = 0; i < packs.length; i++) {
      const q = c - packs[i].cents;
      if (q < 0 || best[q] < 0) continue;
      const b = best[q] + packs[i].braises, n = cnt[q] + 1;
      if (b > best[c] || (b === best[c] && n < cnt[c])) { best[c] = b; cnt[c] = n; from[c] = i; }
    }
  }
  let bc = 0;                                                   // en montant : le premier maximum est le moins cher
  for (let c = 1; c <= B; c++) if (best[c] > best[bc]) bc = c;
  const nb = packs.map(() => 0);
  for (let c = bc; c > 0; c -= packs[from[c]].cents) nb[from[c]]++;
  return { lignes: lignes(packs, nb), braises: best[bc], cents: bc, reste: B - bc, plafond };
}

/* Braises voulues → { lignes, braises (reçues), cents (à payer), surplus, plafond } ; null sans paquet */
function pourBraises(packs, voulu) {
  if (!packs.length) return null;
  const plafond = voulu > MAX_BRAISES;
  const V = Math.min(Math.max(0, Math.floor(voulu || 0)), MAX_BRAISES);
  // on compte en « unités » de g Braises (g = PGCD des paquets) ; un panier minimal ne dépasse jamais le voulu de
  // plus d'un paquet (sinon on en retirerait un et il coûterait moins cher)
  const g = packs.reduce((a, p) => gcd(a, p.braises), 0), U = packs.map(p => p.braises / g);
  const N = Math.ceil(V / g), L = N + Math.max.apply(null, U);
  const cost = new Float64Array(L + 1).fill(Infinity), cnt = new Int32Array(L + 1), from = new Int8Array(L + 1).fill(-1);
  cost[0] = 0;
  for (let u = 1; u <= L; u++) {
    for (let i = 0; i < packs.length; i++) {
      const q = u - U[i];
      if (q < 0 || cost[q] === Infinity) continue;
      const c = cost[q] + packs[i].cents, n = cnt[q] + 1;
      if (c < cost[u] || (c === cost[u] && n < cnt[u])) { cost[u] = c; cnt[u] = n; from[u] = i; }
    }
  }
  let bu = -1;                                                  // le moins cher ; à prix égal, le plus de Braises
  for (let u = N; u <= L; u++) if (cost[u] !== Infinity && (bu < 0 || cost[u] <= cost[bu])) bu = u;
  const nb = packs.map(() => 0);
  for (let u = bu; u > 0; u -= U[from[u]]) nb[from[u]]++;
  const braises = bu * g;
  return { lignes: lignes(packs, nb), braises, cents: cost[bu], surplus: braises - V, plafond };
}

/* ce qu'on peut s'offrir en jeu avec un nombre de Braises : chaque objet, à portée ou non, et ce qu'il manque */
function aPortee(objs, braises) {
  return objs.map(o => ({ objet: o, ok: o.braises <= braises, manque: Math.max(0, o.braises - braises) }));
}

const nbFmt = new Intl.NumberFormat('fr-FR'), eurFmt = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' });
const fmtBraises = n => nbFmt.format(n);
const fmtEuros = cents => eurFmt.format(cents / 100);

const API = { MAX_CENTS, MAX_BRAISES, paquets, objets, lireEuros, lireBraises, pourEuros, pourBraises, aPortee, fmtBraises, fmtEuros };
if (typeof module === 'object' && module.exports) module.exports = API;
else root.TL_SIMU = API;
})(typeof window !== 'undefined' ? window : this);
