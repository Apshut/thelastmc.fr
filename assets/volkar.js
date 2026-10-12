/* The Last — Volkar, l'assistant IA, dans une bulle en bas à droite de la page d'accueil (index.html, volkar.css).
   Le bouton ouvre un panneau de discussion, non modal sur ordinateur (la page reste utilisable), plein écran sur
   téléphone. Échap ou la croix le referment ; la conversation reste là tant que la page est ouverte. L'adresse
   /#volkar et tout lien vers #volkar l'ouvrent.
   Volkar parle à un Worker Cloudflare (faq/worker, adresse dans config.js : faq.endpoint) qui répond en flux SSE :
   sources, texte, cite, fin, erreur (contrat dans faq/README.md). Rien n'est stocké : l'historique vit dans cette page
   et disparaît quand on la ferme. Aucun appel au Worker tant qu'on n'a pas ouvert la bulle (la confidentialité le
   promet). Le texte du modèle n'est jamais injecté en HTML : on construit les nœuds un par un (textContent). */
(() => {
'use strict';

const CFG = window.THE_LAST || {}, D = document, root = D.documentElement;
const $ = (s, r) => (r || D).querySelector(s), $$ = (s, r) => Array.from((r || D).querySelectorAll(s));
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const PLEIN = matchMedia('(max-width: 560px), (max-height: 520px)');   // même seuil que volkar.css
const FIN = matchMedia('(pointer: fine)');
const MAX_Q = 500, MAX_A = 1500, MAX_HIST = 8;
const DELAI_MS = 25000; // sans le moindre signe du Worker pendant ce temps, on abandonne la réponse

const btn = $('#vk-btn'), box = $('#volkar');
if (!btn || !box) return;
const titre = $('#t-gm'), fil = $('#vk-fil'), fermer = $('#vk-close');
const log = $('#gm-log'), form = $('#gm-form'), q = $('#gm-q'), send = $('#gm-send'), stop = $('#gm-stop');
const sugg = $('#gm-sugg'), btnNew = $('#gm-new'), compte = $('#gm-compte'), etat = $('#gm-etat'), mention = $('#gm-mention'), pill = $('#gm-pill');
const DISCORD = (CFG.community && CFG.community.url ? String(CFG.community.url).replace(/^\//, '') : '') || 'discord/';
const SUGGESTIONS = [
  'Les Braises, ça sert à quoi ?',
  'Il me faut quoi pour jouer ?',
  'Le launcher est-il sûr ?',
  'Comment demander de l\'aide sur le Discord ?',
  'Tu es une IA ?'
];

function h(tag, attrs, ...kids) {
  const e = D.createElement(tag);
  if (attrs) for (const k in attrs) { if (k === 'class') e.className = attrs[k]; else if (k === 'text') e.textContent = attrs[k]; else e.setAttribute(k, attrs[k]); }
  kids.forEach(c => { if (c) e.appendChild(typeof c === 'string' ? D.createTextNode(c) : c); });
  return e;
}

/* L'adresse du Worker : config.js, ou ?api=… pour un essai, mais seulement sur un aperçu local. */
const QS = new URLSearchParams(location.search);
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
function endpoint() {
  const api = QS.get('api');
  if (api && LOCAL && /^https?:\/\/[^\s/]+(\/[^\s]*)?$/i.test(api)) return api.replace(/\/+$/, '');
  const e = CFG.faq && CFG.faq.endpoint ? String(CFG.faq.endpoint).trim() : '';
  return /^https:\/\//i.test(e) || (LOCAL && /^http:\/\//i.test(e)) ? e.replace(/\/+$/, '') : '';
}
const API = endpoint();

let hist = [];          // [{role, content, sig?}] : la conversation, en mémoire seulement (sig : signature du Worker)
let ctrl = null;        // AbortController de la réponse en cours
let sante = null;       // promesse de GET /sante, lancée au premier geste
let bientot = false;
let ouvert = false;

const annonce = t => { etat.textContent = ''; setTimeout(() => { etat.textContent = t; }, 30); };
const enBas = () => fil.scrollHeight - fil.scrollTop - fil.clientHeight < 60;
const descendre = (force) => { if (force || enBas()) fil.scrollTop = fil.scrollHeight; };

/* ---------- rendu sûr du texte du modèle : paragraphes, listes, **gras**, liens vers le site uniquement ---------- */
function lienSur(u) {
  u = String(u || '').trim();
  if (/^mailto:contact@thelastmc\.fr$/i.test(u)) return u;
  const abs = u.match(/^https:\/\/(?:www\.)?thelastmc\.fr(\/[^\s"'<>]*)?$/i);
  if (abs) u = abs[1] || '/';
  if (/^#[a-z0-9-]+$/i.test(u)) return u;
  // les pages s'écrivent sans « .html » : boutique.html#x → /boutique#x, index.html → /, discord/ → /discord/
  const m = u && u.match(/^\/?(?:([a-z0-9][a-z0-9-]*)(\.html|\/)?)?(#[a-z0-9-]+)?$/i);
  if (!m) return null;
  const page = !m[1] || (/^index$/i.test(m[1]) && m[2] !== '/') ? '' : m[1] + (m[2] === '/' ? '/' : '');
  return '/' + page + (m[3] || '');
}
function enLigne(parent, txt) {
  // **gras** et [texte](lien) ; tout le reste est du texte brut
  const re = /\*\*([^*\n]+)\*\*|\[([^\]\n]{1,120})\]\(([^)\s]{1,200})\)/g;
  let i = 0, m;
  while ((m = re.exec(txt))) {
    if (m.index > i) parent.appendChild(D.createTextNode(txt.slice(i, m.index)));
    if (m[1] !== undefined) parent.appendChild(h('strong', { text: m[1] }));
    else { const href = lienSur(m[3]); parent.appendChild(href ? h('a', { href, text: m[2] }) : D.createTextNode(m[2])); }
    i = re.lastIndex;
  }
  if (i < txt.length) parent.appendChild(D.createTextNode(txt.slice(i)));
}
function rendreTexte(el, txt) {
  el.textContent = '';
  let liste = null, para = null;
  txt.replace(/\r/g, '').split('\n').forEach(ligne => {
    const l = ligne.replace(/^#{1,6}\s+/, '').replace(/^\s*>\s?/, '');
    const puce = l.match(/^\s*[-*•]\s+(.*)$/), num = l.match(/^\s*(\d{1,2})[.)]\s+(.*)$/);
    if (puce || num) {
      const tag = puce ? 'ul' : 'ol';
      if (!liste || liste.tagName.toLowerCase() !== tag) { liste = h(tag); el.appendChild(liste); }
      const li = h('li'); enLigne(li, puce ? puce[1] : num[2]); liste.appendChild(li); para = null; return;
    }
    if (!l.trim()) { liste = null; para = null; return; }
    liste = null;
    if (para) para.appendChild(D.createTextNode('\n')); else { para = h('p'); el.appendChild(para); }
    enLigne(para, l);
  });
}

/* ---------- les bulles ---------- */
function bulle(role, extra) {
  const bot = role !== 'user';
  const m = h('div', { class: 'gm-msg ' + (bot ? 'gm-bot' : 'gm-user') + (extra ? ' ' + extra : '') },
    h('p', { class: 'gm-de' }, h('span', { class: 'sr', text: bot ? 'Volkar, IA :' : 'Toi :' }), h('span', { 'aria-hidden': 'true', text: bot ? 'Volkar · IA' : 'Toi' })),
    h('div', { class: 'gm-txt' }));
  log.appendChild(m); descendre(true);
  return m;
}
function escalade(parent) {
  parent.appendChild(h('div', { class: 'gm-esc' },
    h('p', { text: 'Besoin d\'un humain ?' }),
    h('p', null, 'Une question générale : le forum #aide du ', h('a', { href: DISCORD, text: 'Discord' }),
      '. Un souci de compte, de paiement, un signalement : un ticket privé (#ticket-privé). Sinon : ',
      h('a', { href: 'mailto:contact@thelastmc.fr', text: 'contact@thelastmc.fr' }), '.')));
}
function erreur(texte, question) {
  const m = bulle('bot', 'gm-err');
  rendreTexte($('.gm-txt', m), texte);
  const act = h('div', { class: 'gm-actions' });
  if (question) {
    const re = h('button', { class: 'btn btn-sm', type: 'button', text: 'Réessayer' });
    re.addEventListener('click', () => { if (!ctrl) { q.value = question; majCompte(); envoyer(); } });
    act.appendChild(re);
  }
  act.appendChild(h('a', { class: 'btn btn-sm', href: DISCORD, text: 'Aller sur le Discord' }));
  m.appendChild(act); descendre(true);
  annonce('Volkar n\'a pas pu répondre.');
}

/* ---------- l'état « bientôt » : pas de Worker, Worker injoignable ou clé absente ---------- */
function passerBientot() {
  if (bientot) return; bientot = true;
  box.classList.add('bientot'); pill.hidden = false; form.hidden = true; sugg.hidden = true; btnNew.hidden = true; mention.hidden = true;
  const inv = $('.gm-invite', log); if (inv) inv.hidden = true;
  const avaitFocus = form.contains(D.activeElement);
  if (ctrl) ctrl.abort();
  const m = bulle('bot');
  rendreTexte($('.gm-txt', m), 'Volkar arrive bientôt. En attendant, le panneau « Questions » de cette page et le Discord sont là pour t\'aider.');
  // le champ qui avait le focus vient d'être caché : on le pose sur le message, pour ne pas perdre le visiteur au clavier
  if (avaitFocus) { m.tabIndex = -1; m.focus({ preventScroll: true }); }
  annonce('Volkar arrive bientôt.');
}
function verifier() {
  if (!sante) sante = (async () => {
    const c = new AbortController(), t = setTimeout(() => c.abort(), 8000);
    try {
      const r = await fetch(API + '/sante', { signal: c.signal, cache: 'no-store' });
      const j = r.ok ? await r.json() : null;
      return !!(j && j.ok && j.pret);
    } catch (e) { return false; } finally { clearTimeout(t); }
  })().then(ok => { if (!ok) passerBientot(); return ok; });
  return sante;
}

/* ---------- la saisie ---------- */
let seuil = '';
function majCompte() {
  const n = q.value.length, reste = MAX_Q - n;
  compte.textContent = n + ' / ' + MAX_Q;
  compte.classList.toggle('proche', reste <= 50 && reste > 0); compte.classList.toggle('plein', reste <= 0);
  const s = reste <= 0 ? '0' : reste <= 50 ? '50' : '';
  if (s && s !== seuil) annonce(s === '0' ? 'Limite de 500 caractères atteinte.' : 'Plus que 50 caractères.');
  seuil = s;
}
function occupe(on) {
  send.hidden = on; stop.hidden = !on; btnNew.hidden = !on && !hist.length && !log.querySelector('.gm-user');
  $$('.gm-s', sugg).forEach(b => { b.disabled = on; });
  btn.classList.toggle('vk-ecrit', on && !ouvert);
}

/* ---------- un échange : POST /question, puis lecture du flux SSE ---------- */
async function envoyer() {
  const texte = q.value.trim().slice(0, MAX_Q);
  if (!texte || ctrl || bientot) return;
  if (!(await verifier())) return;
  q.value = ''; majCompte(); if (ouvert) q.focus({ preventScroll: true });
  sugg.hidden = true;
  rendreTexte($('.gm-txt', bulle('user')), texte);
  hist.push({ role: 'user', content: texte });
  let envoi = hist.slice(-MAX_HIST); if (envoi[0].role !== 'user') envoi = envoi.slice(1);
  // une réponse précédente part avec sa signature (sans elle, le Worker ne la transmet pas au modèle)
  envoi = envoi.map(m => m.role === 'assistant' && m.sig ? { role: m.role, content: m.content, sig: m.sig } : { role: m.role, content: m.content });

  const m = bulle('bot'), txt = $('.gm-txt', m);
  m.setAttribute('aria-busy', 'true');
  txt.appendChild(h('p', { class: 'gm-pense' }, 'Volkar réfléchit', h('i', { 'aria-hidden': 'true' }, h('b'))));
  annonce('Volkar écrit…');
  ctrl = new AbortController(); occupe(true);

  let ecrit = '', sources = [], cites = [], fin = null, err = null, coupe = false, delai = false, minuteur = 0;
  const c = ctrl;
  const armer = () => { clearTimeout(minuteur); minuteur = setTimeout(() => { delai = true; c.abort(); }, DELAI_MS); };
  const ajouter = t => { ecrit += t; rendreTexte(txt, ecrit); descendre(); };
  armer();
  try {
    const r = await fetch(API + '/question', {
      method: 'POST', signal: ctrl.signal, cache: 'no-store',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify({ messages: envoi })
    });
    if (!r.ok || !/text\/event-stream/i.test(r.headers.get('content-type') || '')) {
      let j = null; try { j = await r.json(); } catch (e) { /* corps illisible */ }
      const ra = parseInt(r.headers.get('Retry-After') || '', 10);
      let msg = j && typeof j.message === 'string' && j.message ? j.message : '';
      if (r.status === 429) {
        msg = msg || 'Trop de questions d\'un coup : reviens dans quelques instants.';
        if (ra > 0) msg += ' (Tu pourras réessayer dans ' + (ra < 90 ? ra + ' secondes' : Math.ceil(ra / 60) + ' minutes') + '.)';
      }
      if (r.status === 503 && !msg) msg = 'Volkar est parti à la cave. Réessaie plus tard, ou passe par le Discord.';
      throw { visible: msg || 'Volkar n\'a pas compris la demande. Réessaie avec une question plus courte.', code: j && j.code, status: r.status };
    }
    const lecteur = r.body.getReader(), dec = new TextDecoder();
    let tampon = '';
    const evenement = bloc => {
      let ev = 'message', data = '';
      bloc.split(/\r?\n/).forEach(l => { if (l.startsWith('event:')) ev = l.slice(6).trim(); else if (l.startsWith('data:')) data += (data ? '\n' : '') + l.slice(5).replace(/^ /, ''); });
      if (!data) return;
      let j; try { j = JSON.parse(data); } catch (e) { return; }
      if (ev === 'sources' && Array.isArray(j.sources)) sources = j.sources;
      else if (ev === 'texte' && typeof j.t === 'string') ajouter(j.t);
      else if (ev === 'cite' && Number.isInteger(j.n) && !cites.includes(j.n)) cites.push(j.n);
      else if (ev === 'fin') fin = j;
      else if (ev === 'erreur') err = j;
    };
    for (;;) {
      const { value, done } = await lecteur.read();
      armer();
      if (value) tampon += dec.decode(value, { stream: true });
      let k;
      while ((k = tampon.search(/\r?\n\r?\n/)) >= 0) { const bloc = tampon.slice(0, k); tampon = tampon.slice(k).replace(/^\r?\n\r?\n/, ''); evenement(bloc); }
      if (done || fin || err) { if (done && tampon.trim()) evenement(tampon); break; }
    }
    if (!fin && !err) err = { message: 'La réponse s\'est coupée en route. Réessaie dans un instant.' };
  } catch (e) {
    if (delai) err = { message: 'Volkar ne répond plus. Réessaie dans un instant, ou passe par le Discord.', avant: !ecrit.trim() };
    else if (ctrl && ctrl.signal.aborted) coupe = true;
    else err = { message: e && e.visible ? e.visible : 'Volkar est parti à la cave. Réessaie plus tard, ou passe par le Discord.', avant: true, status: e && e.status };
  }

  /* fin de l'échange */
  clearTimeout(minuteur);
  const suivre = enBas(); // le visiteur suivait la réponse : on lui montrera aussi les sources
  const pense = $('.gm-pense', txt); if (pense) pense.remove();
  m.removeAttribute('aria-busy');
  ctrl = null;
  if (err && err.avant) {
    m.remove(); hist.pop();
    erreur(err.message, err.status === 400 || err.status === 413 ? null : texte);
    if (err.status === 503) sante = null;
  } else if (!ecrit.trim()) {
    m.remove(); hist.pop();
    if (coupe) annonce('Réponse arrêtée.');
    else erreur(err && typeof err.message === 'string' && err.message ? err.message : 'Volkar n\'a rien trouvé à dire. Réessaie autrement.', texte);
  } else {
    // forme signée par le Worker : les MAX_A premiers caractères (points de code), sans autre retouche
    hist.push({ role: 'assistant', content: Array.from(ecrit).slice(0, MAX_A).join(''), sig: !coupe && !err && fin && /^[0-9a-f]{64}$/.test(fin.sig || '') ? fin.sig : undefined });
    if (coupe) m.appendChild(h('p', { class: 'gm-coupe', text: 'Réponse arrêtée.' }));
    else if (err) m.appendChild(h('p', { class: 'gm-coupe', text: typeof err.message === 'string' && err.message ? err.message : 'La réponse s\'est coupée en route.' }));
    else if (fin && fin.raison === 'longueur') m.appendChild(h('p', { class: 'gm-coupe', text: 'Volkar s\'est arrêté en chemin : la réponse était trop longue. Demande-lui la suite.' }));
    // sources : les documents cités ; à défaut, les pages retrouvées (dédoublonnées)
    ((fin && Array.isArray(fin.cites)) ? fin.cites : []).forEach(n => { if (Number.isInteger(n) && !cites.includes(n)) cites.push(n); });
    const cits = sources.filter(s => cites.includes(s.n)), liste = cits.length ? cits : sources, vus = new Set(), liens = [];
    liste.forEach(s => {
      const href = s && lienSur(s.url);
      if (!href || !s.titre || vus.has(href)) return; vus.add(href); liens.push({ href, titre: String(s.titre), n: s.n });
    });
    if (liens.length) {
      const ul = h('ul');
      liens.slice(0, 5).forEach(l => ul.appendChild(h('li', null, h('a', { href: l.href }, h('b', { 'aria-hidden': 'true', text: String(l.n) }), l.titre))));
      m.appendChild(h('div', { class: 'gm-src' }, h('p', { text: cits.length ? 'Sources' : 'Pages liées' }), ul));
    }
    if (!coupe && (!cits.length || err || (fin && fin.raison === 'refus'))) escalade(m);
    m.appendChild(h('p', { class: 'gm-note', text: 'Généré par une IA, peut contenir des erreurs.' }));
    annonce(coupe ? 'Réponse arrêtée.' : err ? 'Réponse interrompue : ' + (typeof err.message === 'string' && err.message ? err.message : 'la réponse s\'est coupée en route.') : 'Réponse de Volkar prête.');
  }
  occupe(false); descendre(suivre);
  if (!ouvert) btn.classList.add('vk-neuf');   // fermé pendant la réponse : un point d'or sur le bouton
}

function nouvelle() {
  if (ctrl) ctrl.abort();
  hist = [];
  $$('.gm-msg', log).forEach(m => { if (!m.classList.contains('gm-accueil')) m.remove(); });
  sugg.hidden = false; btnNew.hidden = true; fil.scrollTop = 0;
  q.value = ''; majCompte(); q.focus();
  annonce('Nouvelle conversation. Rien n\'a été gardé.');
}

/* ---------- ouvrir, fermer ---------- */
// plein écran (téléphone) : la page derrière devient inerte et ne défile plus ; le panneau suit le clavier
const fond = () => Array.from(D.body.children).filter(e => e !== box && e !== etat && e.tagName !== 'SCRIPT');
function caler() {
  const vv = window.visualViewport;
  if (!vv || !ouvert || !PLEIN.matches) { box.style.removeProperty('--vk-h'); box.style.removeProperty('top'); return; }
  box.style.setProperty('--vk-h', Math.round(vv.height) + 'px');
  box.style.top = Math.round(vv.offsetTop) + 'px';
}
function plein(on) {
  root.classList.toggle('vk-plein', on);
  box.setAttribute('aria-modal', on ? 'true' : 'false');
  fond().forEach(e => { e.inert = on; });
  caler();
}
function ouvrir(focus = true) {
  btn.classList.remove('vk-ecrit', 'vk-neuf');
  if (ouvert) { if (focus) poserFocus(); return; }
  ouvert = true;
  box.classList.remove('vk-ferme'); box.hidden = false;
  btn.setAttribute('aria-expanded', 'true'); btn.setAttribute('aria-label', 'Fermer la conversation avec Volkar');
  plein(PLEIN.matches);
  if (log.querySelector('.gm-user')) descendre(true);   // une conversation en cours : on reprend au dernier message
  if (focus) poserFocus();
}
// sur ordinateur, on peut écrire tout de suite ; sur écran tactile, pas de clavier qui surgit : le focus va au titre
function poserFocus() {
  if (FIN.matches && !PLEIN.matches && !form.hidden) q.focus({ preventScroll: true });
  else titre.focus({ preventScroll: true });
}
// focus : 'bouton' le rend au bouton ; 'garde' seulement s'il était dans le panneau ; 'laisse' n'y touche pas (clic ailleurs)
function fermerPanneau(focus = 'bouton') {
  if (!ouvert) return;
  ouvert = false;
  const dedans = box.contains(D.activeElement);
  btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-label', 'Demande à Volkar, l\'assistant IA');
  if (ctrl) btn.classList.add('vk-ecrit');
  plein(false);
  if (location.hash === '#volkar') history.replaceState(null, '', location.pathname + location.search);
  const cacher = () => { if (!ouvert) { box.hidden = true; box.classList.remove('vk-ferme'); } };
  if (REDUCE) cacher(); else { box.classList.add('vk-ferme'); setTimeout(cacher, 180); }
  if (focus === 'bouton' || (focus === 'garde' && dedans)) btn.focus({ preventScroll: true });
}

/* ---------- branchements ---------- */
btn.hidden = false;
btn.addEventListener('click', () => { if (ouvert) fermerPanneau(); else ouvrir(); });
fermer.addEventListener('click', () => fermerPanneau());
// agrandir / réduire (ordinateur ; sur téléphone le panneau prend déjà tout l'écran) : la taille reste tant que la page est ouverte
const taille = $('#vk-taille');
taille.addEventListener('click', () => {
  const bas = !!log.querySelector('.gm-user') && enBas(), grand = box.classList.toggle('vk-grand');
  taille.setAttribute('aria-label', grand ? 'Réduire la conversation' : 'Agrandir la conversation');
  taille.title = grand ? 'Réduire' : 'Agrandir';
  if (bas) setTimeout(() => descendre(true), REDUCE ? 0 : 240);   // on suivait la fin de la conversation : on la garde en vue
});
box.addEventListener('keydown', e => { if (e.key === 'Escape' && !e.isComposing) { e.preventDefault(); fermerPanneau(); } });
btn.addEventListener('keydown', e => { if (e.key === 'Escape' && ouvert) { e.preventDefault(); fermerPanneau(); } });
// les liens vers #volkar ouvrent la bulle ; en plein écran, un lien vers un endroit de cette page la referme d'abord
D.addEventListener('click', e => {
  const a = e.target.closest && e.target.closest('a[href]');
  if (!a || e.defaultPrevented || e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
  const href = a.getAttribute('href');
  if (href === '#volkar' || href === '/#volkar') { e.preventDefault(); ouvrir(); return; }
  if (ouvert && PLEIN.matches && box.contains(a) && /^\/?#[a-z]/i.test(href)) fermerPanneau('garde');
});
// un clic ailleurs sur l'écran referme la bulle (sur ordinateur ; en plein écran, il n'y a pas d'ailleurs). Le clic doit
// commencer ET finir dehors : une sélection de texte tirée hors du panneau ne le ferme pas, un défilement au doigt non plus
// (pas de « click » après un geste de défilement). Phase de capture : un autre script qui arrête le clic ne nous le cache pas.
const chezVolkar = t => box.contains(t) || btn.contains(t) || !!(t.closest && t.closest('a[href="#volkar"], a[href="/#volkar"]'));
let pressionDehors = false;
D.addEventListener('pointerdown', e => { pressionDehors = ouvert && !chezVolkar(e.target); }, true);
D.addEventListener('click', e => {
  if (ouvert && pressionDehors && !chezVolkar(e.target) && !PLEIN.matches) fermerPanneau('laisse');
  pressionDehors = false;
}, true);
addEventListener('hashchange', () => { if (location.hash === '#volkar') ouvrir(); });
PLEIN.addEventListener('change', () => { if (ouvert) plein(PLEIN.matches); });
if (window.visualViewport) { visualViewport.addEventListener('resize', caler); visualViewport.addEventListener('scroll', caler); }

if (!API) passerBientot();
else {
  form.hidden = false; sugg.hidden = false;
  SUGGESTIONS.forEach(s => {
    const b = h('button', { class: 'gm-s', type: 'button', text: s });
    b.addEventListener('click', () => { q.value = s; majCompte(); envoyer(); });
    sugg.appendChild(b);
  });
  // premier geste dans le chat : on vérifie que Volkar est là (pas avant, pour ne contacter personne pour rien)
  const geste = () => { verifier(); };
  q.addEventListener('focus', geste, { once: true });
  sugg.addEventListener('pointerdown', geste, { once: true });
  form.addEventListener('submit', e => { e.preventDefault(); envoyer(); });
  q.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); envoyer(); }
  });
  q.addEventListener('input', majCompte);
  stop.addEventListener('click', () => { if (ctrl) ctrl.abort(); q.focus(); });
  btnNew.addEventListener('click', nouvelle);
  fil.tabIndex = 0;
  majCompte();
}
if (REDUCE) fil.style.scrollBehavior = 'auto';
if (location.hash === '#volkar') ouvrir(false);
})();
