/* The Last — la FAQ (faq.html) : habillage (police du jeu, briques, lanternes des âmes) et Gromaur, l'assistant IA.
   Gromaur parle à un Worker Cloudflare (faq/worker, adresse dans config.js : faq.endpoint) qui répond en flux SSE :
   sources, texte, cite, fin, erreur (contrat dans faq/README.md). Rien n'est stocké : l'historique vit dans cette page
   et disparaît quand on la ferme. Aucun appel au Worker tant qu'on ne touche pas au chat (la confidentialité le promet).
   Le texte du modèle n'est jamais injecté en HTML : on construit les nœuds un par un (textContent). */
(() => {
'use strict';

const CFG = window.THE_LAST || {}, MC = window.MC || { blocks: {}, items: {}, font: {} }, D = document, root = D.documentElement;
const $ = (s, r) => (r || D).querySelector(s), $$ = (s, r) => Array.from((r || D).querySelectorAll(s));
const REDUCE = matchMedia('(prefers-reduced-motion: reduce)').matches;
const MAX_Q = 500, MAX_A = 1500, MAX_HIST = 8;
const DELAI_MS = 25000; // sans le moindre signe du Worker pendant ce temps, on abandonne la réponse

function h(tag, attrs, ...kids) {
  const e = D.createElement(tag);
  if (attrs) for (const k in attrs) { if (k === 'class') e.className = attrs[k]; else if (k === 'text') e.textContent = attrs[k]; else e.setAttribute(k, attrs[k]); }
  kids.forEach(c => { if (c) e.appendChild(typeof c === 'string' ? D.createTextNode(c) : c); });
  return e;
}

/* ---------- police du jeu (mêmes glyphes que l'accueil, voir mc.js) ---------- */
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
function pxText(el) {
  const txt = el.textContent.trim(); el.textContent = '';
  if (el.dataset.fs) el.style.setProperty('--fs', el.dataset.fs + 'px');
  el.appendChild(h('span', { class: 'sr', text: txt }));
  txt.split(' ').filter(Boolean).forEach(w => el.appendChild(pxWord(w)));
}
function pxLabel(el, text) {
  text = String(text).trim(); el.textContent = '';
  const box = h('span', { class: 'pxl', 'aria-hidden': 'true' });
  text.split(' ').filter(Boolean).forEach(w => box.appendChild(pxWord(w)));
  el.append(h('span', { class: 'sr', text }), box); el.classList.add('pxl-host');
}

/* ---------- le fond (briques du Nether) et les lanternes des âmes des questions ---------- */
function textures() {
  const cut = (src, row, cb) => { const im = new Image(); im.onload = () => { const c = D.createElement('canvas'); c.width = c.height = 16; c.getContext('2d').drawImage(im, 0, row * 16, 16, 16, 0, 0, 16, 16); cb('url(' + c.toDataURL() + ')'); }; im.src = src; };
  if (MC.blocks.nether_bricks) cut('assets/mc/blocks.png', MC.blocks.nether_bricks[0], u => root.style.setProperty('--fq-bg', u));
  if (MC.items && MC.items.soul_lantern !== undefined) cut('assets/mc/items.png', MC.items.soul_lantern, u => root.style.setProperty('--soullamp', u));
}

$$('.top .tbtn').forEach(b => pxLabel(b, b.textContent));
$$('h1.px, h2.px').forEach(pxText);
textures();

/* ================= Gromaur ================= */
const box = $('#gromaur'), log = $('#gm-log'), form = $('#gm-form'), q = $('#gm-q'), send = $('#gm-send'), stop = $('#gm-stop');
const sugg = $('#gm-sugg'), btnNew = $('#gm-new'), compte = $('#gm-compte'), etat = $('#gm-etat'), mention = $('#gm-mention'), pill = $('#gm-pill');
const DISCORD = (CFG.community && CFG.community.url ? String(CFG.community.url).replace(/^\//, '') : '') || 'discord/';
const SUGGESTIONS = [
  'Les Braises, ça sert à quoi ?',
  'Il me faut quoi pour jouer ?',
  'Le launcher est-il sûr ?',
  'Comment demander de l\'aide sur le Discord ?',
  'Tu es une IA ?'
];

/* L'adresse du Worker : config.js, ou ?api=… pour un essai, mais seulement sur un aperçu local. */
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
function endpoint() {
  const api = new URLSearchParams(location.search).get('api');
  if (api && LOCAL && /^https?:\/\/[^\s/]+(\/[^\s]*)?$/i.test(api)) return api.replace(/\/+$/, '');
  const e = CFG.faq && CFG.faq.endpoint ? String(CFG.faq.endpoint).trim() : '';
  return /^https:\/\//i.test(e) || (LOCAL && /^http:\/\//i.test(e)) ? e.replace(/\/+$/, '') : '';
}
const API = endpoint();

let hist = [];          // [{role, content, sig?}] : la conversation, en mémoire seulement (sig : signature du Worker)
let ctrl = null;        // AbortController de la réponse en cours
let sante = null;       // promesse de GET /sante, lancée au premier geste
let bientot = false;

const annonce = t => { etat.textContent = ''; setTimeout(() => { etat.textContent = t; }, 30); };
const enBas = () => log.scrollHeight - log.scrollTop - log.clientHeight < 60;
const descendre = (force) => { if (force || enBas()) log.scrollTop = log.scrollHeight; };

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
    h('p', { class: 'gm-de' }, h('span', { class: 'sr', text: bot ? 'Gromaur, IA :' : 'Toi :' }), h('span', { 'aria-hidden': 'true', text: bot ? 'Gromaur · IA' : 'Toi' })),
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
  annonce('Gromaur n\'a pas pu répondre.');
}

/* ---------- l'état « bientôt » : pas de Worker, Worker injoignable ou clé absente ---------- */
function passerBientot() {
  if (bientot) return; bientot = true;
  box.classList.add('bientot'); pill.hidden = false; form.hidden = true; sugg.hidden = true; btnNew.hidden = true; mention.hidden = true;
  const inv = $('.gm-invite', log); if (inv) inv.hidden = true;
  const avaitFocus = form.contains(D.activeElement);
  if (ctrl) ctrl.abort();
  const m = bulle('bot');
  rendreTexte($('.gm-txt', m), 'Gromaur arrive bientôt. En attendant, les questions ci-dessus et le Discord sont là pour t\'aider.');
  // le champ qui avait le focus vient d'être caché : on le pose sur le message, pour ne pas perdre le visiteur au clavier
  if (avaitFocus) { m.tabIndex = -1; m.focus({ preventScroll: true }); }
  annonce('Gromaur arrive bientôt.');
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
}

/* ---------- un échange : POST /question, puis lecture du flux SSE ---------- */
async function envoyer() {
  const texte = q.value.trim().slice(0, MAX_Q);
  if (!texte || ctrl || bientot) return;
  if (!(await verifier())) return;
  q.value = ''; majCompte(); q.focus({ preventScroll: true });
  sugg.hidden = true;
  rendreTexte($('.gm-txt', bulle('user')), texte);
  hist.push({ role: 'user', content: texte });
  let envoi = hist.slice(-MAX_HIST); if (envoi[0].role !== 'user') envoi = envoi.slice(1);
  // une réponse précédente part avec sa signature (sans elle, le Worker ne la transmet pas au modèle)
  envoi = envoi.map(m => m.role === 'assistant' && m.sig ? { role: m.role, content: m.content, sig: m.sig } : { role: m.role, content: m.content });

  const m = bulle('bot'), txt = $('.gm-txt', m);
  m.setAttribute('aria-busy', 'true');
  txt.appendChild(h('p', { class: 'gm-pense' }, 'Gromaur réfléchit', h('i', { 'aria-hidden': 'true' }, h('b'))));
  annonce('Gromaur écrit…');
  ctrl = new AbortController(); occupe(true);
  box.classList.add('en-cours');
  form.scrollIntoView({ block: 'nearest', behavior: REDUCE ? 'auto' : 'smooth' });

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
      if (r.status === 503 && !msg) msg = 'Gromaur est parti à la cave. Réessaie plus tard, ou passe par le Discord.';
      throw { visible: msg || 'Gromaur n\'a pas compris la demande. Réessaie avec une question plus courte.', code: j && j.code, status: r.status };
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
    if (delai) err = { message: 'Gromaur ne répond plus. Réessaie dans un instant, ou passe par le Discord.', avant: !ecrit.trim() };
    else if (ctrl && ctrl.signal.aborted) coupe = true;
    else err = { message: e && e.visible ? e.visible : 'Gromaur est parti à la cave. Réessaie plus tard, ou passe par le Discord.', avant: true, status: e && e.status };
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
    else erreur(err && typeof err.message === 'string' && err.message ? err.message : 'Gromaur n\'a rien trouvé à dire. Réessaie autrement.', texte);
  } else {
    // forme signée par le Worker : les MAX_A premiers caractères (points de code), sans autre retouche
    hist.push({ role: 'assistant', content: Array.from(ecrit).slice(0, MAX_A).join(''), sig: !coupe && !err && fin && /^[0-9a-f]{64}$/.test(fin.sig || '') ? fin.sig : undefined });
    if (coupe) m.appendChild(h('p', { class: 'gm-coupe', text: 'Réponse arrêtée.' }));
    else if (err) m.appendChild(h('p', { class: 'gm-coupe', text: typeof err.message === 'string' && err.message ? err.message : 'La réponse s\'est coupée en route.' }));
    else if (fin && fin.raison === 'longueur') m.appendChild(h('p', { class: 'gm-coupe', text: 'Gromaur s\'est arrêté en chemin : la réponse était trop longue. Demande-lui la suite.' }));
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
    annonce(coupe ? 'Réponse arrêtée.' : err ? 'Réponse interrompue : ' + (typeof err.message === 'string' && err.message ? err.message : 'la réponse s\'est coupée en route.') : 'Réponse de Gromaur prête.');
  }
  occupe(false); descendre(suivre);
  if (suivre && !bientot) form.scrollIntoView({ block: 'nearest', behavior: REDUCE ? 'auto' : 'smooth' });
}

/* ---------- branchements ---------- */
function nouvelle() {
  if (ctrl) ctrl.abort();
  hist = [];
  $$('.gm-msg', log).forEach(m => { if (!m.classList.contains('gm-accueil')) m.remove(); });
  sugg.hidden = false; btnNew.hidden = true; log.scrollTop = 0; box.classList.remove('en-cours');
  q.value = ''; majCompte(); q.focus();
  annonce('Nouvelle conversation. Rien n\'a été gardé.');
}

if (!API) passerBientot();
else {
  form.hidden = false; sugg.hidden = false;
  SUGGESTIONS.forEach(s => {
    const b = h('button', { class: 'gm-s', type: 'button', text: s });
    b.addEventListener('click', () => { q.value = s; majCompte(); envoyer(); });
    sugg.appendChild(b);
  });
  // premier geste dans le chat : on vérifie que Gromaur est là (pas avant, pour ne contacter personne pour rien)
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
  log.tabIndex = 0;
  majCompte();
}
if (REDUCE) log.style.scrollBehavior = 'auto';
})();
