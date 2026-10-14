/* The Last — le compte sur le site : le client de l'API (window.TheLastCompte, compte/SPEC.md §5) et le bouton de
   compte, à droite de « EN » dans <header class="top"> (direction « vivante », choisie le 10/10/2026).
   À inclure après config.js et mc.js :  <script src="/assets/compte.js" defer></script>  (+ assets/compte.css).

   Le bouton montre une tête en 3D (un cube CSS), fixe, de trois quarts. Elle ne suit pas la souris. Elle fait un petit
   signe quand le panneau s'ouvre ; la tête d'invité (le vagabond encapuchonné aux yeux de braise du launcher) cligne
   des yeux. « Réduire les animations » : rien ne bouge. Connecté, la tête vient de l'API (PNG 64x64 du visage, chapeau
   compris) : la face avant est l'image, les côtés et le dessus prolongent ses pixels du bord. Sans tête (skin par
   défaut, ou image qui ne charge pas), une tête neutre : jamais le vagabond d'invité, jamais Steve.
   Le panneau est une enseigne suspendue à deux chaînes, éclairée par une lanterne d'âme. Connecté : l'identité
   (« Compte Minecraft vérifié » en vert du jeu), puis Historique d'achat, Paramètres, Aide, et Se déconnecter.
   Accessibilité : bouton dépliant (aria-expanded, aria-controls, pas de role=menu). Entrée/Espace ouvre et ferme,
   Tab parcourt, Échap ferme et rend le focus, un clic dehors ferme. La déconnexion est annoncée.

   Vie privée : AUCUNE requête vers l'API tant que config.js n'a pas d'adresse (compte.api), ni tant que ce navigateur
   ne s'est jamais connecté (clé localStorage « thelast:compte » = "1", sans aucun identifiant).
   Essais en local seulement (page servie depuis 127.0.0.1 ou localhost) : ?api=http://127.0.0.1:8790 branche une
   API locale (retenue pour l'onglet, ?api= vide l'oublie), &signal=1 pose la clé « déjà connecté », &panneau=1 ouvre
   le panneau sans animation, &ouverte=1 simule compte.ouvert = true. */
(() => {
'use strict';

const T = window.I18N || { lang: 'fr', locale: 'fr-FR', t: (k, s, v) => v ? s.replace(/\{(\w+)\}/g, (m, x) => x in v ? v[x] : m) : s, pick: (o, f) => o && o[f] };
const D = document, W = window;
const CFG = (W.THE_LAST && W.THE_LAST.compte) || {};
const MC = W.MC || null;
const Q = new URLSearchParams(location.search);
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const REDUIT = W.matchMedia ? W.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };
const CLE = 'thelast:compte', CLE_API = 'thelast:compte-api';

/* ---------- stockage : chaque accès peut échouer (navigation privée, stockage bloqué) ---------- */
function lire(st, k) { try { return W[st].getItem(k); } catch (e) { return null; } }
function ecrire(st, k, v) { try { if (v == null) W[st].removeItem(k); else W[st].setItem(k, v); } catch (e) { /* stockage indisponible */ } }
const aSignal = () => lire('localStorage', CLE) === '1';
const poserSignal = () => ecrire('localStorage', CLE, '1');
const oublier = () => ecrire('localStorage', CLE, null);

/* ---------- configuration ---------- */
function lireApi() {
  if (LOCAL && Q.has('api')) {
    const v = (Q.get('api') || '').trim().replace(/\/+$/, '');
    if (!v) ecrire('sessionStorage', CLE_API, null);
    else if (/^http:\/\/(127\.0\.0\.1|localhost):\d{2,5}$/.test(v)) ecrire('sessionStorage', CLE_API, v);
  }
  if (LOCAL) { const s = lire('sessionStorage', CLE_API); if (s) return s; }
  const a = String(CFG.api || '').trim().replace(/\/+$/, '');
  return /^https:\/\/[a-z0-9.-]+(:\d{1,5})?$/i.test(a) ? a : '';
}
const API = lireApi();
const OUVERT = CFG.ouvert === true || (LOCAL && Q.get('ouverte') === '1');
if (LOCAL && Q.get('signal') === '1') poserSignal();

/* ---------- erreurs ---------- */
const MESSAGES = {
  reseau: T.t('compte.err.reseau', 'Impossible de joindre le serveur des comptes. Vérifie ta connexion, puis réessaie.'),
  delai: T.t('compte.err.delai', 'Le serveur des comptes met trop de temps à répondre. Réessaie dans un moment.'),
  hors_ligne: T.t('compte.err.hors-ligne', "La connexion au site n'est pas encore en ligne. Elle ouvrira avec le launcher."),
  invalide: T.t('compte.err.invalide', "Ce lien n'est pas valide. Relance « Mon compte sur le site » depuis le launcher."),
  confirmation: T.t('compte.err.confirmation', 'Recopie exactement ton pseudo pour confirmer.'),
  non_connecte: T.t('compte.err.non-connecte', "Tu n'es pas connecté."),
  origine: T.t('compte.err.origine', "Cette page n'a pas le droit d'utiliser ton compte."),
  acces_ferme: T.t('compte.err.acces-ferme', "La connexion au site n'est pas encore ouverte. Elle le sera à l'ouverture du serveur."),
  autre_reseau: T.t('compte.err.autre-reseau', 'Ce lien a été ouvert sur un autre réseau que ton launcher. Ouvre-le sur le même ordinateur. Si ton navigateur passe par un VPN, coupe-le le temps de la connexion.'),
  reconnexion_requise: T.t('compte.err.reconnexion-requise', 'Pour supprimer ton compte, relance « Mon compte sur le site » depuis le launcher, puis recommence dans les 10 minutes.'),
  code_invalide: T.t('compte.err.code-invalide', 'Ce lien a expiré ou a déjà servi. Relance « Mon compte sur le site » depuis le launcher.'),
  introuvable: T.t('compte.err.introuvable', "Cet appareil n'est plus connecté à ton compte."),
  limite: T.t('compte.err.limite', 'Trop de tentatives. Réessaie dans un moment.'),
  maintenance: T.t('compte.err.maintenance', 'La connexion au site est en pause. Réessaie plus tard.'),
  indisponible: T.t('compte.err.indisponible', 'Le service est momentanément indisponible. Réessaie dans un moment.'),
  inconnu: T.t('compte.err.inconnu', "Quelque chose n'a pas marché. Réessaie dans un moment.")
};
class ErreurCompte extends Error {
  constructor(code, message, statut, retryAfter) {
    super(message || MESSAGES[code] || MESSAGES.inconnu);
    this.name = 'ErreurCompte'; this.code = code; this.statut = statut || 0; this.retryAfter = retryAfter || 0;
  }
}

/* ---------- état, et l'évènement « thelast:compte » ---------- */
let courant = { etat: API && aSignal() ? 'chargement' : 'deconnecte' };
function changer(e) {
  courant = e;
  D.dispatchEvent(new CustomEvent('thelast:compte', { detail: e }));
  return e;
}

/* ---------- requêtes ---------- */
function delai(ms) {
  if (W.AbortSignal && AbortSignal.timeout) return AbortSignal.timeout(ms);
  const c = new AbortController(); setTimeout(() => c.abort(), ms); return c.signal;
}
async function requete(methode, chemin, corps, brut) {
  if (!API) throw new ErreurCompte('hors_ligne');
  const init = { method: methode, credentials: 'include', cache: 'no-store', signal: delai(8000) };
  if (methode === 'POST') { init.headers = { 'Content-Type': 'application/json', 'X-TheLast': '1' }; init.body = JSON.stringify(corps || {}); }
  let r;
  try { r = await fetch(API + chemin, init); }
  catch (e) { const d = e && (e.name === 'TimeoutError' || e.name === 'AbortError'); throw new ErreurCompte(d ? 'delai' : 'reseau'); }
  if (r.ok) {
    if (brut) return r;
    if (r.status === 204) return null;
    try { return await r.json(); } catch (e) { throw new ErreurCompte('indisponible', null, r.status); }
  }
  let code = '', message = '';
  try { const j = await r.json(); code = j && j.code; message = j && j.message; } catch (e) { /* corps illisible */ }
  if (typeof code !== 'string' || !/^[a-z_]{2,40}$/.test(code)) code = r.status >= 500 ? 'indisponible' : 'inconnu';
  if (typeof message !== 'string' || message.length > 300) message = '';
  const ra = parseInt(r.headers.get('Retry-After') || '', 10);
  const err = new ErreurCompte(code, MESSAGES[code] || message, r.status, ra > 0 ? ra : 0);
  if (r.status === 401) { oublier(); if (courant.etat !== 'deconnecte') changer({ etat: 'deconnecte' }); }
  throw err;
}

const FORMAT_CODE = /^[A-Za-z0-9_-]{43}$/;
function verifierCode(code) { if (!FORMAT_CODE.test(String(code || ''))) throw new ErreurCompte('invalide'); return String(code); }
/* Ce qui vient de l'API n'est affiché que par textContent ; une image n'est chargée que depuis l'API elle-même. */
const teteSure = url => typeof url === 'string' && url.indexOf(API + '/v1/moi/tete.png?v=') === 0 && /^[^\s"'()\\<>]+$/.test(url) ? url : null;
const dataSure = url => typeof url === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(url) && url.length < 200000 ? url : null;
function lireMoi(m) {
  if (!m || typeof m.pseudo !== 'string' || !m.pseudo || m.pseudo.length > 32 || typeof m.uuid !== 'string') throw new ErreurCompte('indisponible');
  return {
    uuid: m.uuid, pseudo: m.pseudo, modele: m.modele, tete: teteSure(m.tete),
    creeA: +m.creeA || 0, connexionA: +m.connexionA || 0, reconnexionRecente: m.reconnexionRecente === true,
    session: m.session && typeof m.session.id === 'string' ? { id: m.session.id, expireA: +m.session.expireA || 0 } : null
  };
}

const TheLastCompte = {
  api: API, ouvert: OUVERT, ErreurCompte, messages: MESSAGES,
  get courant() { return courant; },
  async etat() {
    if (!API || !aSignal()) return changer({ etat: 'deconnecte' });
    if (courant.etat !== 'connecte' && courant.etat !== 'chargement') changer({ etat: 'chargement' });
    try { return changer({ etat: 'connecte', moi: lireMoi(await requete('GET', '/v1/moi')) }); }
    catch (e) { return e.statut === 401 ? (courant.etat === 'deconnecte' ? courant : changer({ etat: 'deconnecte' })) : changer({ etat: 'injoignable', erreur: e }); }
  },
  async apercu(code) {
    const r = await requete('POST', '/v1/connexion/apercu', { code: verifierCode(code) });
    if (!r || typeof r.pseudo !== 'string' || !r.pseudo) throw new ErreurCompte('indisponible');
    return { pseudo: r.pseudo, teteDataUrl: dataSure(r.teteDataUrl), expireA: +r.expireA || 0 };
  },
  async echanger(code) {
    const moi = lireMoi(await requete('POST', '/v1/connexion/echange', { code: verifierCode(code) }));
    poserSignal(); changer({ etat: 'connecte', moi });
    return moi;
  },
  async annuler(code) { await requete('POST', '/v1/connexion/annuler', { code: verifierCode(code) }); },
  async deconnecter() {
    try { await requete('POST', '/v1/moi/deconnexion', {}); } catch (e) { if (e.statut !== 401) throw e; }
    oublier(); changer({ etat: 'deconnecte' });
  },
  async deconnecterPartout() {
    try { await requete('POST', '/v1/moi/deconnexion-partout', {}); } catch (e) { if (e.statut !== 401) throw e; }
    oublier(); changer({ etat: 'deconnecte' });
  },
  async appareils() {
    const r = await requete('GET', '/v1/moi/appareils');
    return r && Array.isArray(r.appareils) ? r.appareils : [];
  },
  async retirerAppareil(id) {
    if (!/^[0-9a-f]{16}$/.test(String(id || ''))) throw new ErreurCompte('invalide');
    await requete('POST', '/v1/moi/appareils/retirer', { id });
    if (courant.moi && courant.moi.session && courant.moi.session.id === id) { oublier(); changer({ etat: 'deconnecte' }); }
  },
  async achats() {
    const r = await requete('GET', '/v1/moi/achats');
    return { achats: r && Array.isArray(r.achats) ? r.achats : [], prestataire: r && typeof r.prestataire === 'string' ? r.prestataire : null,
      portail: r && typeof r.portail === 'string' && /^https:\/\/[^\s"'<>]+$/.test(r.portail) ? r.portail : null };
  },
  async exporter() {
    const r = await requete('GET', '/v1/moi/export', null, true);
    const blob = await r.blob();
    const url = URL.createObjectURL(blob);
    const a = D.createElement('a'); a.href = url; a.download = 'thelast-compte.json'; a.hidden = true;
    D.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
    return blob;
  },
  async supprimer(confirmation) {
    await requete('POST', '/v1/moi/suppression', { confirmation: String(confirmation || '') });
    oublier(); changer({ etat: 'deconnecte', supprime: true });
  }
};
W.TheLastCompte = TheLastCompte;

/* un autre onglet s'est connecté ou déconnecté */
W.addEventListener('storage', e => {
  if (e.key !== CLE && e.key !== null) return;
  if (!aSignal() && courant.etat !== 'deconnecte') changer({ etat: 'deconnecte' });
  else if (aSignal() && courant.etat === 'deconnecte') TheLastCompte.etat();
});

/* =====================================================================================================================
   L'interface
   ===================================================================================================================== */
function h(tag, attrs, ...kids) {
  const e = D.createElement(tag);
  if (attrs) for (const k in attrs) {
    const v = attrs[k];
    if (v === false || v == null) continue;
    if (k === 'class') e.className = v;
    else if (k === 'text') e.textContent = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k === 'html') e.innerHTML = v;   // seulement des textes écrits ici (traductions), jamais ce qui vient de l'API
    else e.setAttribute(k, v);
  }
  kids.forEach(c => { if (c) e.appendChild(typeof c === 'string' ? D.createTextNode(c) : c); });
  return e;
}
const loadImg = src => new Promise((ok, ko) => { const im = new Image(); im.onload = () => ok(im); im.onerror = ko; im.src = src; });

/* Police du jeu (mêmes glyphes que le reste du site, voir assets/mc/mc.js). Sans mc.js : texte normal. */
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
  const p = D.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('fill', 'currentColor'); p.setAttribute('d', d); svg.appendChild(p);
  return svg;
}
function pxLabel(el, text) {
  text = String(text).trim();
  el.textContent = '';
  if (!MC || !MC.font || !MC.font.A) { el.textContent = text; el.classList.add('sans-px'); return el; }
  const box = h('span', { class: 'pxl', 'aria-hidden': 'true' });
  text.split(' ').filter(Boolean).forEach(w => box.appendChild(pxWord(w)));
  el.append(h('span', { class: 'sr', text }), box); el.classList.add('pxl-host');
  return el;
}

/* ---------- les têtes : un cube de six faces 8x8, agrandies sans lissage ---------- */
const UP = 16;
const PAL = {
  H: '#463c55', h: '#5a4d6b', S: '#2a2027', s: '#3a2c31', E: '#ffc069', e: '#ff6b2c', T: '#ff6b2c', t: '#b8431a', K: '#3b3347', k: '#2d2737',
  // tête neutre (connecté sans tête) : de la pierre sourde, deux creux pour les yeux ; ni Steve, ni le vagabond
  N: '#5b5552', n: '#4d4744', M: '#6a6360', O: '#2b2726', B: '#3f3a38'
};
/* Le vagabond encapuchonné aux yeux de braise (déconnecté) : le visage est celui du launcher
   (launcher/src/components/accounts/placeholderSkin.ts, PLACEHOLDER_FACE + palette), la capuche est dessinée ici. */
const VAGABOND = {
  front: ['HHHHHHHH', 'HhhhhhhH', 'HhSSSShH', 'HSssssSH', 'HSEsSESH', 'HSssssSH', 'HtSssStH', 'TTTTTTTT'],
  right: ['hHHHHHHH', 'HHhHHHHh', 'HHHHHhHH', 'HhHHHHHH', 'HHHHhHHH', 'HHHHHHhH', 'HHhHHHHH', 'tTTTTTTT'],
  left: ['HHHHHHHh', 'hHHHHhHH', 'HHhHHHHH', 'HHHHHHhH', 'HHHhHHHH', 'HhHHHHHH', 'HHHHHhHH', 'TTTTTTTt'],
  top: ['KKKKKKKK', 'KkKKKKkK', 'KKKhhKKK', 'KKhhhhKK', 'KKhHHhKK', 'KhhHHhhK', 'KhhhhhhK', 'hhhhhhhh'],
  back: ['KKKKKKKK', 'KKKKKKKK', 'KkKKKKkK', 'KKKkkKKK', 'KKKkkKKK', 'KKKkkKKK', 'KKKkkKKK', 'tttttttt'],
  bottom: ['SSSSSSSS', 'SSSSSSSS', 'SSSSSSSS', 'SSSSSSSS', 'SSSSSSSS', 'SSSSSSSS', 'SSSSSSSS', 'SSSSSSSS']
};
const NEUTRE = {
  front: ['NNNNNNNN', 'NMNNNNMN', 'NNNNNNNN', 'NNNnnNNN', 'NOONNOON', 'NNNNNNNN', 'NNnNNnNN', 'NNNnnNNN'],
  right: ['NNNNNNNN', 'NNNMNNNN', 'NNNNNNnN', 'NnNNNNNN', 'NNNNNNNN', 'NNNNnNNN', 'NNNNNNNN', 'nNNNNNNN'],
  left: ['NNNNNNNN', 'NNNNMNNN', 'NnNNNNNN', 'NNNNNNnN', 'NNNNNNNN', 'NNNnNNNN', 'NNNNNNNN', 'NNNNNNNn'],
  top: ['MMMMMMMM', 'MNMMMMNM', 'MMMMMMMM', 'MMMNMMMM', 'MMMMMMMM', 'MNMMMMMM', 'MMMMMNMM', 'MMMMMMMM'],
  back: ['NNNNNNNN', 'NNNNNNNN', 'NNnNNNNN', 'NNNNNnNN', 'NNNNNNNN', 'NnNNNNNN', 'NNNNNNnN', 'NNNNNNNN'],
  bottom: ['BBBBBBBB', 'BBBBBBBB', 'BBBBBBBB', 'BBBBBBBB', 'BBBBBBBB', 'BBBBBBBB', 'BBBBBBBB', 'BBBBBBBB']
};
function gridURL(rows, size) {
  const c = D.createElement('canvas'); c.width = c.height = size; const g = c.getContext('2d'); const k = size / 8;
  rows.forEach((row, y) => [...row].forEach((ch, x) => { g.fillStyle = PAL[ch] || PAL.N; g.fillRect(x * k, y * k, k, k); }));
  return c.toDataURL();
}
const cache = {};
function facesGrille(nom) {
  if (cache[nom]) return cache[nom];
  const src = nom === 'vagabond' ? VAGABOND : NEUTRE, head = {};
  for (const k in src) head[k] = gridURL(src[k], 8 * UP);
  return (cache[nom] = { head, flat: gridURL(src.front, 8), eyes: nom === 'vagabond' ? [[2, 4], [5, 4]] : null });
}
/* La tête de l'API (un visage 64x64) : la face avant est l'image ; chaque autre face étire la rangée ou la colonne de
   pixels du bord qu'elle touche (même texel, agrandi), ce qui donne les cheveux et la peau des côtés. */
function facesImage(url) {
  const f = (size, pos) => ({ url, size, pos });
  return { flat: url, eyes: null, head: {
    front: f('100% 100%', '0 0'), right: f('800% 100%', '0 0'), left: f('800% 100%', '100% 0'),
    top: f('100% 800%', '0 0'), bottom: f('100% 800%', '0 100%'), back: f('800% 800%', '0 0')
  } };
}
const FACES = ['front', 'back', 'right', 'left', 'top', 'bottom'];
function fond(v) {
  return typeof v === 'string' ? 'background-image:url("' + v + '")'
    : 'background-image:url("' + v.url + '");background-size:' + v.size + ';background-position:' + v.pos;
}
/* source : une URL de tête (API ou data:), « vagabond » ou « neutre ». Rend un élément aria-hidden. */
function tete3d(source, cls) {
  const faces = source === 'vagabond' || source === 'neutre' || !source ? facesGrille(source || 'neutre') : facesImage(source);
  const cube = h('span', { class: 'cpt-cube' });
  FACES.forEach(k => {
    const f = h('span', { class: 'cpt-f f-' + k, style: fond(faces.head[k]) });
    if (k === 'front' && faces.eyes) faces.eyes.forEach(([x, y]) => f.appendChild(h('i', { class: 'cpt-eye', style: 'left:' + (x * 12.5) + '%;top:' + (y * 12.5) + '%' })));
    cube.appendChild(f);
  });
  return h('span', { class: 'cpt-head ' + (cls || ''), 'aria-hidden': 'true' }, cube);
}
/* La tête de l'API est lue par fetch (CORS, avec le cookie), puis affichée en data:image/png. Les faces 3D sont des
   fonds CSS, chargés sans CORS : une image d'une autre origine y échoue selon le navigateur et l'adresse (en local,
   Edge refuse /v1/moi/tete.png sans CORS, mais l'accepte avec). Une tête qui ne charge pas (session expirée entre-temps,
   réseau, 404) donne null : la tête neutre, jamais le vagabond d'invité. */
const tetes = {};
function lireBlob(b) { return new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = () => res(null); fr.readAsDataURL(b); }); }
/* Le PNG de l'API fait 64 px (8 px par texel). Réduit à 48 ou 22 px, le navigateur le lisserait (pixelated ne joue qu'à
   l'agrandissement) : on le ramène à ses 8 x 8 texels, qu'on agrandit ensuite sans lissage, nets à toute taille. */
function en8(d) {
  return loadImg(d).then(im => {
    if (!im.naturalWidth || im.naturalWidth !== im.naturalHeight || im.naturalWidth % 8) return null;
    if (im.naturalWidth === 8) return d;
    const c = D.createElement('canvas'); c.width = c.height = 8; const g = c.getContext('2d');
    g.imageSmoothingEnabled = false; g.drawImage(im, 0, 0, im.naturalWidth, im.naturalHeight, 0, 0, 8, 8);
    return c.toDataURL();
  }, () => null);
}
function verifierImage(url) {
  if (!url) return Promise.resolve(null);
  if (dataSure(url)) return en8(url);
  if (!teteSure(url)) return Promise.resolve(null);
  if (!tetes[url]) {
    tetes[url] = fetch(url, { credentials: 'include', signal: delai(8000) })
      .then(r => (r.ok ? r.blob() : null))
      .then(b => (b && b.type === 'image/png' && b.size < 65536 ? lireBlob(b) : null))
      .then(d => (dataSure(d) ? en8(d) : null))
      .catch(() => null)
      .then(d => { if (!d) delete tetes[url]; return d; });
  }
  return tetes[url];
}

/* ---------- la vie : un signe de tête à l'ouverture, un clignement pour l'invité. Rien d'autre. ---------- */
function signe(head) {
  if (!head || REDUIT.matches || !head.animate) return;
  const cube = head.firstChild;
  cube.animate([
    { transform: 'translateY(0) rotateX(-6deg) rotateY(-18deg)' },
    { transform: 'translateY(-1.4px) rotateX(-28deg) rotateY(-18deg)', offset: .3 },
    { transform: 'translateY(-2px) rotateX(-6deg) rotateY(-18deg)', offset: .55 },
    { transform: 'translateY(-.8px) rotateX(1deg) rotateY(-18deg)', offset: .78 },
    { transform: 'translateY(0) rotateX(-6deg) rotateY(-18deg)' }
  ], { duration: 700, easing: 'ease-in-out' });
}
let blinkT = 0;
function cligner() {
  clearTimeout(blinkT);
  if (REDUIT.matches || D.hidden) return;
  blinkT = setTimeout(() => {
    const eyes = Array.from(D.querySelectorAll('.cpt-eye'));
    const fois = Math.random() < .25 ? 2 : 1;
    let n = 0;
    const un = () => { eyes.forEach(e => e.classList.add('ferme')); setTimeout(() => { eyes.forEach(e => e.classList.remove('ferme')); if (++n < fois) setTimeout(un, 140); }, 120); };
    if (eyes.length) un();
    cligner();
  }, 2400 + Math.random() * 3600);
}
D.addEventListener('visibilitychange', () => { if (D.hidden) clearTimeout(blinkT); else cligner(); });
if (REDUIT.addEventListener) REDUIT.addEventListener('change', cligner);

/* ---------- objets du jeu (assets/mc) et petits dessins en pixels ---------- */
const ITEMS = {};
const pretItems = MC && MC.items ? loadImg('/assets/mc/items.png').then(im => {
  ['written_book', 'name_tag', 'soul_lantern'].forEach(n => {
    if (MC.items[n] == null) return;
    const c = D.createElement('canvas'); c.width = c.height = 16; c.getContext('2d').drawImage(im, 0, MC.items[n] * 16, 16, 16, 0, 0, 16, 16); ITEMS[n] = c.toDataURL();
  });
}).catch(() => {}) : Promise.resolve();
if (MC && MC.blocks && MC.blocks.polished_blackstone) loadImg('/assets/mc/blocks.png').then(im => {
  const c = D.createElement('canvas'); c.width = c.height = 16; c.getContext('2d').drawImage(im, 0, MC.blocks.polished_blackstone[0] * 16, 16, 16, 0, 0, 16, 16);
  D.documentElement.style.setProperty('--cpt-pierre', 'url(' + c.toDataURL() + ')');
}).catch(() => {});
function art(rows, pal) {
  const c = D.createElement('canvas'); c.width = rows[0].length; c.height = rows.length; const g = c.getContext('2d');
  rows.forEach((r, y) => { for (let x = 0; x < r.length; x++) if (pal[r[x]]) { g.fillStyle = pal[r[x]]; g.fillRect(x, y, 1, 1); } });
  return c.toDataURL();
}
/* la porte de sortie, aux couleurs de la porte carmin du jeu (le jeu n'a pas d'objet « se déconnecter ») */
const PORTE = art([
  '...kkkkkkkkkk...', '...kmmmmmmmmk...', '...kmddddddmk...', '...kmdlllldmk...', '...kmdlllldmk...', '...kmddddddmk...',
  '...kmmmmmmmmk...', '...kmmmmmmgmk...', '...kmmmmmmmmk...', '...kmddddddmk...', '...kmdlllldmk...', '...kmdlllldmk...',
  '...kmdlllldmk...', '...kmddddddmk...', '...kmmmmmmmmk...', '...kkkkkkkkkk...'
], { k: '#24101a', m: '#7e3a56', d: '#4f2236', l: '#94506c', g: '#ffb547' });
/* la coche verte du jeu (« Compte Minecraft vérifié »), et le cadenas */
const COCHE = art(['......#', '.....##', '#...##.', '##.##..', '.###...', '..#....'], { '#': '#55ff55' });
function picto(rows, cls) {
  let d = ''; rows.forEach((r, y) => [...r].forEach((c, x) => { if (c === '#') d += 'M' + x + ' ' + y + 'h1v1h-1z'; }));
  const s = D.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 8 8'); s.setAttribute('shape-rendering', 'crispEdges'); s.setAttribute('aria-hidden', 'true'); s.setAttribute('class', cls || 'cpt-picto');
  const p = D.createElementNS('http://www.w3.org/2000/svg', 'path'); p.setAttribute('fill', 'currentColor'); p.setAttribute('d', d); s.appendChild(p);
  return s;
}
const P_CADENAS = ['..####..', '.#....#.', '.#....#.', '########', '###..###', '###..###', '########', '........'];

function icone(src) {
  const i = h('i', { class: 'cpt-ic', 'aria-hidden': 'true' });
  const poser = () => { const u = src === 'porte' ? PORTE : ITEMS[src]; if (u) i.style.backgroundImage = 'url(' + u + ')'; };
  if (src === 'porte') poser(); else pretItems.then(poser);
  return i;
}
function lanterne() {
  const l = h('span', { class: 'cpt-lant', 'aria-hidden': 'true' }, h('span', { class: 'cpt-lant-ch' }), h('span', { class: 'cpt-lant-i' }));
  pretItems.then(() => { if (ITEMS.soul_lantern) l.lastChild.style.backgroundImage = 'url(' + ITEMS.soul_lantern + ')'; });
  return l;
}
/* l'enseigne : deux chaînes, la lanterne d'âme, la plaque de pierre noire */
function enseigne(contenu, cls) {
  return h('div', { class: 'cpt-sign ' + (cls || '') },
    h('span', { class: 'cpt-chain l', 'aria-hidden': 'true' }), h('span', { class: 'cpt-chain r', 'aria-hidden': 'true' }),
    lanterne(),
    h('div', { class: 'cpt-plaque' }, h('span', { class: 'cpt-lueur', 'aria-hidden': 'true' }), contenu));
}
/* « Compte Minecraft vérifié », en vert du jeu, police du jeu */
function verifie() {
  return h('p', { class: 'cpt-verif' }, h('img', { class: 'cpt-coche', src: COCHE, alt: '', width: '14', height: '12' }), pxLabel(h('span'), T.t('compte.verifie', 'Compte Minecraft vérifié')));
}
/* Le texte d'invitation, le même dans le panneau et sur les pages du compte */
function invitation(titreTag) {
  const action = OUVERT && API
    ? h('div', { class: 'cpt-go' },
        h('p', { class: 'cpt-how', html: T.t('compte.how', 'Dans le launcher, clique sur <b>Mon compte sur le site</b>. Ta première connexion crée ton compte.') }),
        h('p', { class: 'cpt-dl', html: T.t('compte.dl', 'Pas encore le launcher ? <a href="/#launcher">Télécharger</a>') }))
    : h('p', { class: 'cpt-wait' }, h('span', { class: 'cpt-wait-i', 'aria-hidden': 'true' }), T.t('compte.ouvrira', 'La connexion ouvrira avec le launcher.'));
  return [
    pxLabel(h(titreTag || 'h2', { class: 'cpt-titre' }), T.t('compte.titre', 'Ton compte The Last')),
    h('p', { class: 'cpt-plus', text: T.t('compte.plus', 'Retrouve tes achats, ta tête de joueur sur le site et, à l’ouverture, tes Braises.') }),
    action,
    h('p', { class: 'cpt-trust' }, picto(P_CADENAS), T.t('compte.trust', 'On ne te demandera jamais ton mot de passe.')),
    h('a', { class: 'cpt-why', href: '/#volkar', text: T.t('compte.pourquoi', 'Pourquoi un compte ?') })
  ];
}
TheLastCompte.ui = { h, pxLabel, tete3d, verifierImage, signe, enseigne, verifie, invitation, icone };

/* =====================================================================================================================
   Le bouton et son panneau
   ===================================================================================================================== */
const header = D.querySelector('header.top');
if (!header) { if (courant.etat === 'chargement') TheLastCompte.etat(); return; }

const live = h('p', { class: 'sr', 'aria-live': 'polite', id: 'cpt-live' });
D.body.appendChild(live);
const annoncer = t => { live.textContent = ''; setTimeout(() => { live.textContent = t; }, 60); };

const wrap = h('div', { class: 'cpt' });
const btn = h('button', { class: 'cpt-btn', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'cpt-panneau' });
const cadre = h('span', { class: 'cpt-frame', 'aria-hidden': 'true' });   // le cadre visible ; le bouton est la cible
btn.appendChild(cadre);
const panel = h('div', { class: 'cpt-panel', id: 'cpt-panneau', hidden: '' });
wrap.append(btn, panel);
const nav = header.querySelector('nav');
if (nav && nav.nextSibling) header.insertBefore(wrap, nav.nextSibling); else header.appendChild(wrap);
header.classList.add('a-compte');

let teteBtn = null, teteOk = null;          // teteOk : l'URL de tête vérifiée (ou null = tête neutre)
const ICI = location.pathname.replace(/\.html$/, '').replace(/\/+$/, '') || '/';

function nomBouton() {
  const e = courant.etat;
  if (e === 'connecte') return T.t('compte.btn.compte', 'Compte de {pseudo}', { pseudo: courant.moi.pseudo });
  return e === 'chargement' ? T.t('compte.btn.chargement', 'Mon compte (chargement)') : e === 'injoignable' ? T.t('compte.btn.injoignable', 'Mon compte (injoignable)') : T.t('compte.btn.deconnecte', 'Mon compte (non connecté)');
}
function monterBouton() {
  const e = courant.etat;
  const source = e === 'connecte' ? (teteOk || 'neutre') : e === 'deconnecte' ? 'vagabond' : 'neutre';
  teteBtn = tete3d(source, source === 'vagabond' ? 'vagabond' : 'joueur');
  cadre.textContent = ''; cadre.appendChild(teteBtn);
  btn.classList.toggle('est-connecte', e === 'connecte');
  btn.setAttribute('aria-label', nomBouton());
  if (e === 'chargement') btn.setAttribute('aria-busy', 'true'); else btn.removeAttribute('aria-busy');
}

function entree(href, ic, label) {
  return h('li', null, h('a', { class: 'cpt-ent', href, 'aria-current': ICI === href ? 'page' : null }, icone(ic), h('span', { text: label })));
}
function monterPanneau() {
  panel.textContent = '';
  const e = courant.etat;
  let corps;
  if (e === 'connecte') {
    const face = h('img', { class: 'cpt-face', src: teteOk || facesGrille('neutre').flat, alt: '', width: '48', height: '48' });
    const sortie = h('button', { class: 'cpt-ent cpt-sortie', type: 'button' }, icone('porte'), h('span', { text: T.t('compte.sortie', 'Se déconnecter') }));
    sortie.addEventListener('click', () => deconnecter(sortie));
    corps = h('div', { class: 'cpt-in' },
      h('div', { class: 'cpt-id' }, h('span', { class: 'cpt-slot' }, face),
        h('div', { class: 'cpt-qui' }, pxLabel(h('p', { class: 'cpt-pseudo' }), courant.moi.pseudo), verifie())),
      h('ul', { class: 'cpt-liste' },
        entree('/compte/achats', 'written_book', T.t('compte.achats', "Historique d'achat")),
        entree('/compte/parametres', 'name_tag', T.t('compte.parametres', 'Paramètres')),
        entree('/#volkar', 'soul_lantern', T.t('compte.aide', 'Aide'))),
      h('hr', { class: 'cpt-sep' }),
      h('div', { class: 'cpt-bas' }, sortie),
      h('p', { class: 'cpt-err', role: 'alert', hidden: '' }));
  } else if (e === 'injoignable' || e === 'chargement') {
    const retry = pxLabel(h('button', { class: 'btn cpt-main', type: 'button' }), T.t('compte.reessayer', 'Réessayer'));
    retry.addEventListener('click', () => { TheLastCompte.etat(); });
    corps = h('div', { class: 'cpt-in' },
      pxLabel(h('h2', { class: 'cpt-titre' }), T.t('compte.titre', 'Ton compte The Last')),
      h('p', { class: 'cpt-wait' }, h('span', { class: 'cpt-wait-i', 'aria-hidden': 'true' }),
        e === 'chargement' ? T.t('compte.chargement', 'Chargement de ton compte…') : T.t('compte.injoignable', 'Ton compte est momentanément injoignable.')),
      e === 'injoignable' ? h('div', { class: 'cpt-go' }, retry) : null,
      h('a', { class: 'cpt-why', href: '/#volkar', text: T.t('compte.aide', 'Aide') }));
  } else {
    corps = h('div', { class: 'cpt-in' }, ...invitation('h2'));
  }
  panel.appendChild(enseigne(corps));
}

let repli = 0;                              // la fermeture en cours : l'enseigne remonte, puis le panneau se cache
const ouvert = () => !panel.hidden && !repli;
function cacher() { clearTimeout(repli); repli = 0; panel.hidden = true; panel.inert = false; panel.classList.remove('balance', 'retour'); }
function ouvrir(sansGeste) {
  if (ouvert()) return;
  if (repli) cacher();                      // rouvert pendant qu'il remontait : il repart de zéro
  monterPanneau();
  panel.hidden = false; btn.setAttribute('aria-expanded', 'true'); wrap.classList.add('ouvert');
  if (!REDUIT.matches && !sansGeste) { panel.classList.remove('balance'); void panel.offsetWidth; panel.classList.add('balance'); }
  if (!sansGeste) signe(teteBtn);
  if (teteBtn) teteBtn.querySelectorAll('.cpt-eye').forEach(x => x.classList.add('vif'));
}
function fermer(rendreFocus) {
  if (!ouvert()) return;
  btn.setAttribute('aria-expanded', 'false'); wrap.classList.remove('ouvert');
  // le miroir de l'arrivée, sans le balancement : l'enseigne remonte et s'efface (0,25 s, comme dans compte.css) ;
  // pendant ce temps, elle ne prend plus ni clic ni focus
  if (REDUIT.matches) cacher();
  else { panel.inert = true; panel.classList.remove('balance'); void panel.offsetWidth; panel.classList.add('retour'); repli = setTimeout(cacher, 250); }
  if (teteBtn) teteBtn.querySelectorAll('.cpt-eye').forEach(x => x.classList.remove('vif'));
  if (rendreFocus) btn.focus();
}
btn.addEventListener('click', () => { if (ouvert()) fermer(false); else ouvrir(); });
D.addEventListener('keydown', e => { if (e.key === 'Escape' && ouvert()) { e.preventDefault(); fermer(true); } });
D.addEventListener('pointerdown', e => { if (ouvert() && !wrap.contains(e.target)) fermer(false); });
wrap.addEventListener('focusout', e => { if (ouvert() && e.relatedTarget && !wrap.contains(e.relatedTarget)) fermer(false); });

async function deconnecter(sortie) {
  sortie.disabled = true;
  try { await TheLastCompte.deconnecter(); }
  catch (e) {
    sortie.disabled = false;
    const err = panel.querySelector('.cpt-err'); if (err) { err.textContent = T.t('compte.deco.echec', 'La déconnexion n’a pas abouti. {msg}', { msg: e.message }); err.hidden = false; }
    return;
  }
  fermer(false); btn.focus(); annoncer(T.t('compte.deconnecte', 'Tu es déconnecté.'));
}

/* chaque changement d'état redessine le bouton (et le panneau s'il est ouvert) */
let tour = 0;
async function surEtat() {
  const n = ++tour;
  if (courant.etat === 'connecte') {
    const ok = await verifierImage(courant.moi.tete);
    if (n !== tour) return;
    teteOk = ok;
  }
  monterBouton();
  if (ouvert()) {
    const dedans = panel.contains(D.activeElement);
    monterPanneau();
    if (dedans) btn.focus();
  }
}
D.addEventListener('thelast:compte', surEtat);

/* ---------- démarrage ---------- */
monterBouton();
cligner();
if (LOCAL && Q.get('panneau') === '1') pretItems.then(() => ouvrir(true));
if (courant.etat === 'chargement') TheLastCompte.etat();
})();
