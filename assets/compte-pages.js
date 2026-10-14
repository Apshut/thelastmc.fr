/* The Last — les pages du compte : /compte/entrer (« C'est bien toi ? »), /compte/achats (historique d'achat) et
   /compte/parametres (profil, appareils, données). La page est désignée par <body data-page="…">.
   Tout passe par window.TheLastCompte (assets/compte.js, compte/SPEC.md §5) ; ce qui vient de l'API n'est affiché que
   par textContent. Aucun appel tant que config.js n'a pas d'adresse d'API ou que ce navigateur ne s'est jamais connecté,
   sauf sur /compte/entrer, où c'est le lien du launcher qui apporte le code. */
(() => {
'use strict';

const T = window.I18N || { lang: 'fr', locale: 'fr-FR', t: (k, s, v) => v ? s.replace(/\{(\w+)\}/g, (m, x) => x in v ? v[x] : m) : s, pick: (o, f) => o && o[f] };
const D = document, W = window;
const PAGE = D.body.dataset.page;

/* /compte/entrer : le code est lu puis effacé de l'adresse AVANT tout le reste (SPEC §5.5). */
let CODE = null;
if (PAGE === 'entrer') {
  const m = /^#code=([A-Za-z0-9_-]{43})$/.exec(location.hash);
  if (m) CODE = m[1];
  try { history.replaceState(null, '', '/compte/entrer'); } catch (e) { /* adresse inchangeable */ }
}

const C = W.TheLastCompte;
const MC = W.MC || { blocks: {} };
const $ = (s, r) => (r || D).querySelector(s), $$ = (s, r) => Array.from((r || D).querySelectorAll(s));
if (!C) return;
const { h, pxLabel, tete3d, verifierImage, signe, enseigne, verifie, invitation, icone } = C.ui;
const REDUIT = W.matchMedia ? W.matchMedia('(prefers-reduced-motion: reduce)') : { matches: false };

/* ---------- commun : la barre et le titre en police du jeu, le fond de briques du Nether ---------- */
$$('.top .tbtn').forEach(b => { if (b.classList.contains('lang-sw')) $$('a', b).forEach(a => pxLabel(a, a.textContent)); else pxLabel(b, b.textContent); });   // FR | EN : chaque moitié
const H1 = $('.cp-h1');
if (H1) pxLabel(H1, H1.textContent);
(function fond() {
  const m = MC.blocks && MC.blocks.nether_bricks; if (!m) return;
  const im = new Image();
  im.onload = () => {
    const c = D.createElement('canvas'); c.width = c.height = 16; c.getContext('2d').drawImage(im, 0, m[0] * 16, 16, 16, 0, 0, 16, 16);
    D.documentElement.style.setProperty('--ch-bg', 'url(' + c.toDataURL() + ')');
  };
  im.src = '/assets/mc/blocks.png';
})();

const live = h('p', { class: 'sr', 'aria-live': 'polite' });
D.body.appendChild(live);
const annoncer = t => { live.textContent = ''; setTimeout(() => { live.textContent = t; }, 60); };
function bouton(label, cls, onclick) {
  const b = pxLabel(h('button', { class: 'btn ' + (cls || ''), type: 'button' }), label);
  if (onclick) b.addEventListener('click', onclick);
  return b;
}
function lienBtn(href, label, cls) { return pxLabel(h('a', { class: 'btn ' + (cls || ''), href }), label); }
const DATE = new Intl.DateTimeFormat(T.locale, { day: 'numeric', month: 'long', year: 'numeric' });
const dateLongue = ms => ms > 0 ? DATE.format(new Date(ms)) : '';
function ilYa(ms) {
  if (!(ms > 0)) return '';
  const j = Math.floor((Date.now() - ms) / 86400000);
  if (j <= 0) return T.t('compte.ilya.0', "aujourd'hui");
  if (j === 1) return T.t('compte.ilya.1', 'hier');
  if (j < 7) return T.t('compte.ilya.jours', 'il y a {n} jours', { n: j });
  if (j < 14) return T.t('compte.ilya.semaine', 'il y a une semaine');
  return T.t('compte.ilya.semaines', 'il y a {n} semaines', { n: Math.floor(j / 7) });
}
function pays(code) {
  if (typeof code !== 'string' || !/^[A-Z]{2}$/.test(code)) return '';
  try { return new Intl.DisplayNames([T.lang], { type: 'region' }).of(code) || code; } catch (e) { return code; }
}
const uuidLisible = u => /^[0-9a-f]{32}$/.test(u) ? u.replace(/^(.{8})(.{4})(.{4})(.{4})(.{12})$/, '$1-$2-$3-$4-$5') : u;
function carte(...kids) { return h('div', { class: 'cp-carte' }, ...kids); }
function attente(texte) { return carte(h('p', { class: 'cpt-wait' }, h('span', { class: 'cpt-wait-i', 'aria-hidden': 'true' }), texte)); }
function injoignable(reessayer, message) {
  return carte(
    h('p', { class: 'cpt-wait' }, h('span', { class: 'cpt-wait-i', 'aria-hidden': 'true' }), message || T.t('compte.injoignable', 'Ton compte est momentanément injoignable.')),
    h('div', { class: 'cp-actions' }, bouton(T.t('compte.reessayer', 'Réessayer'), '', reessayer)));
}
/* non connecté : l'invitation du panneau, mot pour mot, dans une plaque */
function invite(avant) { return h('div', { class: 'cp-invite' }, avant || null, carte(...invitation('h2'))); }

/* =====================================================================================================================
   /compte/entrer
   ===================================================================================================================== */
function pageEntrer() {
  const main = $('#contenu');
  const TITRES = {
    invalide: T.t('compte.e.invalide', 'Lien non valide'), code_invalide: T.t('compte.e.code-invalide', 'Lien expiré'), acces_ferme: T.t('compte.e.acces-ferme', 'Connexion pas encore ouverte'),
    maintenance: T.t('compte.e.maintenance', 'Connexion en pause'), autre_reseau: T.t('compte.e.autre-reseau', 'Ouvre ce lien sur ton ordinateur'), reseau: T.t('compte.e.injoignable', 'Serveur injoignable'),
    delai: T.t('compte.e.injoignable', 'Serveur injoignable'), limite: T.t('compte.e.limite', 'Trop de tentatives'), hors_ligne: T.t('compte.e.hors-ligne', 'Connexion pas encore en ligne')
  };
  const REESSAYABLE = ['reseau', 'delai', 'indisponible', 'limite', 'inconnu', 'maintenance'];
  let socle = null, enCours = false;

  /* une seule enseigne, un seul h1 : chaque état remplace son contenu */
  function ecran(opts) {
    main.textContent = '';
    const kids = [];
    if (opts.tete !== undefined) { socle = tete3d(opts.tete, 'grande'); kids.push(h('div', { class: 'cp-socle' + (opts.attente ? ' attente' : '') }, socle)); }
    else socle = null;
    const t = h('h1', { class: 'cp-e-t', tabindex: '-1' }, ...(opts.titre || []));
    kids.push(t, ...(opts.corps || []));
    const sign = enseigne(h('div', { class: 'cpt-in cp-e-in', 'aria-busy': opts.attente ? 'true' : null }, ...kids), 'cp-e-sign');
    main.appendChild(sign);
    t.focus({ preventScroll: true });
    return sign;
  }
  const titre = txt => [h('span', { class: 'cp-e-titre', text: txt })];

  function erreur(e, etape) {
    const code = e && e.code || 'inconnu';
    const corps = [h('p', { class: 'cp-e-msg', text: e && e.message || C.messages.inconnu })];
    if (code === 'code_invalide') corps.push(h('p', { class: 'cp-e-note', text: T.t('compte.e.note-lien', 'Un lien de connexion ne sert qu’une fois et ne dure que 2 minutes.') }));
    if (code === 'limite' && e.retryAfter) corps.push(h('p', { class: 'cp-e-note', text: T.t('compte.e.reessayer-min', 'Tu pourras réessayer dans {n} min.', { n: Math.max(1, Math.ceil(e.retryAfter / 60)) }) }));
    const actions = h('div', { class: 'cp-actions' });
    if (CODE && REESSAYABLE.includes(code)) actions.appendChild(bouton(T.t('compte.reessayer', 'Réessayer'), 'btn-main', () => (etape === 'echange' ? oui() : apercu())));
    actions.appendChild(lienBtn('/', T.t('compte.e.accueil', "Retour à l'accueil")));
    corps.push(actions, h('a', { class: 'cpt-why', href: '/#volkar', text: T.t('compte.e.aide', 'Besoin d’aide ?') }));
    ecran({ titre: titre(TITRES[code] || T.t('compte.e.impossible', 'Connexion impossible')), corps });
  }

  async function apercu() {
    ecran({ tete: 'neutre', attente: true, titre: titre(T.t('compte.e.verification', 'Vérification du lien…')) });
    let a;
    try { a = await C.apercu(CODE); } catch (e) { erreur(e, 'apercu'); return; }
    const tete = a.teteDataUrl ? await verifierImage(a.teteDataUrl) : null;
    const bOui = bouton(T.t('compte.e.oui', "Oui, c'est moi"), 'btn-main', oui), bNon = bouton(T.t('compte.e.non', "Non, ce n'est pas moi"), '', non);
    ecran({
      tete: tete || 'neutre',
      titre: [h('span', { class: 'cp-e-k', text: T.t('compte.e.en-tant-que', 'Tu te connectes en tant que ') }), pxLabel(h('span', { class: 'cp-e-n' }), a.pseudo)],
      corps: [
        h('p', { class: 'cp-e-q', text: T.t('compte.e.bien-toi', "C'est bien toi ?") }),
        h('div', { class: 'cp-e-b' }, bOui, bNon),
        h('p', { class: 'cp-e-note', text: T.t('compte.e.rien-demande', "Si tu n'as rien demandé depuis ton launcher, choisis Non.") })
      ]
    });
    setTimeout(() => signe(socle), REDUIT.matches ? 0 : 450);
  }

  async function oui() {
    if (enCours) return; enCours = true;
    $$('.cp-e-b .btn', main).forEach(b => { b.disabled = true; });
    try { await C.echanger(CODE); }
    catch (e) { enCours = false; erreur(e, 'echange'); return; }
    CODE = null;
    ecran({ titre: titre(T.t('compte.e.connecte', 'Te voilà connecté')), corps: [h('p', { class: 'cp-e-msg', text: T.t('compte.e.retour', "Retour à l'accueil…") })] });
    setTimeout(() => location.replace('/'), REDUIT.matches ? 300 : 900);
  }

  async function non() {
    if (enCours) return; enCours = true;
    $$('.cp-e-b .btn', main).forEach(b => { b.disabled = true; });
    try { await C.annuler(CODE); } catch (e) { /* le lien expire de lui-même en 2 minutes ; personne n'est connecté */ }
    CODE = null;
    ecran({
      titre: titre(T.t('compte.e.annulee', 'Connexion annulée')),
      corps: [
        h('p', { class: 'cp-e-msg', text: T.t('compte.e.personne', 'Personne n’a été connecté.') }),
        h('p', { class: 'cp-e-note', text: T.t('compte.e.jamais-lien', 'Ne suis jamais un lien de connexion envoyé par quelqu’un d’autre : une connexion se lance toujours depuis TON launcher.') }),
        h('div', { class: 'cp-actions' }, lienBtn('/', T.t('compte.e.accueil', "Retour à l'accueil")))
      ]
    });
  }

  if (!CODE) erreur(new C.ErreurCompte('invalide'));
  else if (!C.api) erreur(new C.ErreurCompte('hors_ligne'));
  else apercu();
}

/* =====================================================================================================================
   /compte/achats
   ===================================================================================================================== */
const STATUTS = { paye: T.t('compte.st.paye', 'Payé'), rembourse: T.t('compte.st.rembourse', 'Remboursé'), conteste: T.t('compte.st.conteste', 'Contesté'), annule: T.t('compte.st.annule', 'Annulé') };
const ROLES = { payeur: T.t('compte.role.payeur', 'Payé par toi'), destinataire: T.t('compte.role.destinataire', 'Cadeau reçu'), les_deux: T.t('compte.role.les-deux', 'Payé par toi, pour toi') };
function montant(m) {
  if (!m || typeof m.valeur !== 'string' || !/^\d+(\.\d{1,2})?$/.test(m.valeur)) return '';
  const dev = typeof m.devise === 'string' && /^[A-Z]{3}$/.test(m.devise) ? m.devise : '';
  try { return new Intl.NumberFormat(T.locale, { style: 'currency', currency: dev || 'EUR' }).format(Number(m.valeur)); } catch (e) { return m.valeur + ' ' + dev; }
}
function achat(a) {
  const produits = Array.isArray(a.produits) ? a.produits.filter(p => p && typeof p.nom === 'string').map(p => (p.quantite > 1 ? p.quantite + ' × ' : '') + p.nom).join(', ') : '';
  const statut = STATUTS[a.statut] || '';
  const dest = a.destinataire && typeof a.destinataire.pseudo === 'string' ? a.destinataire.pseudo : '';
  return h('li', { class: 'cp-achat' },
    h('div', { class: 'cp-achat-l' },
      h('p', { class: 'cp-achat-p', text: produits || T.t('compte.achat', 'Achat') }),
      h('p', { class: 'cp-achat-m' },
        h('span', { text: dateLongue(+a.date) }),
        ROLES[a.role] ? h('span', { text: ROLES[a.role] }) : null,
        dest && a.role !== 'les_deux' ? h('span', { text: T.t('compte.pour', 'Pour {pseudo}', { pseudo: dest }) }) : null)),
    h('div', { class: 'cp-achat-r' },
      h('p', { class: 'cp-achat-v', text: montant(a.montant) }),
      statut ? h('p', { class: 'cp-statut s-' + a.statut, text: statut }) : null));
}
function pageAchats() {
  const corps = $('#cp-corps');
  let n = 0;
  async function rendre() {
    const tour = ++n, e = C.courant;
    corps.removeAttribute('aria-busy');
    if (e.etat === 'deconnecte') { corps.replaceChildren(invite()); return; }
    if (e.etat === 'chargement') { corps.setAttribute('aria-busy', 'true'); corps.replaceChildren(attente(T.t('compte.achats.chargement', 'Chargement de ton historique…'))); return; }
    if (e.etat === 'injoignable') { corps.replaceChildren(injoignable(() => C.etat())); return; }
    corps.setAttribute('aria-busy', 'true');
    corps.replaceChildren(attente(T.t('compte.achats.chargement', 'Chargement de ton historique…')));
    let r;
    try { r = await C.achats(); }
    catch (err) { if (tour === n && C.courant.etat === 'connecte') { corps.removeAttribute('aria-busy'); corps.replaceChildren(injoignable(rendre, err.message)); } return; }
    if (tour !== n) return;
    corps.removeAttribute('aria-busy');
    if (!r.achats.length) {
      corps.replaceChildren(carte(
        h('p', { class: 'cp-vide' }, icone('written_book'), h('span', { text: T.t('compte.achats.vide', 'Aucun achat pour l’instant. La taverne ouvre bientôt.') })),
        h('div', { class: 'cp-actions' }, lienBtn('/boutique', T.t('compte.achats.taverne', 'Voir la taverne')))));
      return;
    }
    const kids = [h('ul', { class: 'cp-achats' }, ...r.achats.slice(0, 100).map(achat))];
    if (r.portail) kids.push(h('p', { class: 'cp-note' }, T.t('compte.achats.recus', 'Reçus détaillés : '), h('a', { href: r.portail, rel: 'noopener', text: T.t('compte.achats.portail', 'portail {nom}', { nom: r.prestataire || T.t('compte.achats.prestataire', 'du prestataire') }) })));
    corps.replaceChildren(carte(...kids));
  }
  D.addEventListener('thelast:compte', rendre);
  rendre();
}

/* =====================================================================================================================
   /compte/parametres
   ===================================================================================================================== */
function pageParametres() {
  const corps = $('#cp-corps');
  let message = null, n = 0;

  function section(id, titreTxt, ...kids) {
    return h('section', { class: 'cp-sec', 'aria-labelledby': id }, h('h2', { class: 'cp-h2', id, text: titreTxt }), carte(...kids));
  }
  function statut(el, texte, ok) { el.textContent = texte; el.className = 'cp-statut-l ' + (ok ? 'ok' : 'ko'); el.hidden = !texte; }

  function profil(moi, tete) {
    const face = h('img', { class: 'cp-face', src: tete || '', alt: '', width: '64', height: '64' });
    const slot = h('span', { class: 'cpt-slot cp-slot' });
    if (tete) slot.appendChild(face); else slot.appendChild(tete3d('neutre', 'cp-neutre'));
    return section('cp-profil', T.t('compte.p.profil', 'Profil'),
      h('div', { class: 'cp-id' }, slot,
        h('div', { class: 'cpt-qui' }, pxLabel(h('p', { class: 'cpt-pseudo' }), moi.pseudo), verifie())),
      h('dl', { class: 'cp-dl' },
        h('dt', { text: T.t('compte.p.uuid', 'UUID Minecraft') }), h('dd', { class: 'cp-uuid', text: uuidLisible(moi.uuid) }),
        moi.creeA ? h('dt', { text: T.t('compte.p.cree', 'Compte créé le') }) : null, moi.creeA ? h('dd', { text: dateLongue(moi.creeA) }) : null,
        moi.connexionA ? h('dt', { text: T.t('compte.p.derniere', 'Dernière connexion par le launcher') }) : null, moi.connexionA ? h('dd', { text: dateLongue(moi.connexionA) }) : null),
      h('div', { class: 'cp-bloc' },
        h('h3', { class: 'cp-h3', text: T.t('compte.p.actualiser', 'Actualiser ma tête') }),
        h('p', { text: T.t('compte.p.tete', 'Ta tête vient de ton skin Minecraft, vérifié par Mojang. Après un changement de skin, relance « Mon compte sur le site » depuis le launcher : ta tête se met à jour à cette connexion.') })));
  }

  function securite(moi) {
    const liste = h('ul', { class: 'cp-apps', 'aria-busy': 'true' }, h('li', { class: 'cp-app-vide', text: T.t('compte.p.chargement-app', 'Chargement des appareils…') }));
    const st = h('p', { class: 'cp-statut-l', role: 'status', hidden: '' });
    const tous = bouton(T.t('compte.p.deco-tous', 'Déconnecter tous les appareils'), 'cp-danger');
    const conf = h('div', { class: 'cp-conf', hidden: '' },
      h('p', { text: T.t('compte.p.deco-tous-conf', 'Tous tes appareils seront déconnectés, celui-ci aussi. Tu pourras te reconnecter depuis le launcher.') }),
      h('div', { class: 'cp-actions' },
        bouton(T.t('compte.p.oui-tout', 'Oui, tout déconnecter'), 'cp-danger', async ev => {
          ev.currentTarget.disabled = true;
          try { message = T.t('compte.p.tous-deco', 'Tous tes appareils sont déconnectés.'); await C.deconnecterPartout(); annoncer(message); }
          catch (e) { message = null; ev.currentTarget.disabled = false; statut(st, e.message, false); }
        }),
        bouton(T.t('compte.annuler', 'Annuler'), '', () => { conf.hidden = true; tous.hidden = false; tous.focus(); })));
    tous.addEventListener('click', () => { tous.hidden = true; conf.hidden = false; $('.btn', conf).focus(); });

    async function charger() {
      let apps;
      try { apps = await C.appareils(); } catch (e) { liste.removeAttribute('aria-busy'); liste.replaceChildren(h('li', { class: 'cp-app-vide', text: e.message })); return; }
      liste.removeAttribute('aria-busy');
      apps.sort((a, b) => (b.actuel ? 1 : 0) - (a.actuel ? 1 : 0) || (+b.vuA || 0) - (+a.vuA || 0));
      liste.replaceChildren(...apps.map(a => {
        const lieu = pays(a.pays);
        const retirer = bouton(a.actuel ? T.t('compte.p.me-deco', 'Me déconnecter') : T.t('compte.p.deco', 'Déconnecter'), 'btn-sm', async () => {
          retirer.disabled = true;
          try {
            await C.retirerAppareil(a.id);
            if (a.actuel) { message = T.t('compte.deconnecte', 'Tu es déconnecté.'); annoncer(message); return; }
            statut(st, T.t('compte.p.app-deco', 'Appareil déconnecté.'), true); charger();
          } catch (e) { retirer.disabled = false; statut(st, e.message, false); }
        });
        return h('li', { class: 'cp-app' + (a.actuel ? ' actuel' : '') },
          h('div', { class: 'cp-app-l' },
            h('p', { class: 'cp-app-n' }, h('span', { text: typeof a.appareil === 'string' ? a.appareil : T.t('compte.p.appareil', 'Appareil') }), a.actuel ? h('span', { class: 'cp-badge', text: T.t('compte.p.cet-appareil', 'Cet appareil') }) : null),
            h('p', { class: 'cp-app-m', text: [T.t('compte.p.connecte-le', 'Connecté le {date}', { date: dateLongue(+a.creeA) }), T.t('compte.p.vu', 'vu {quand}', { quand: ilYa(+a.vuA) }), lieu].filter(x => x && !/ $/.test(x)).join(' · ') })),
          retirer);
      }));
      if (!apps.length) liste.replaceChildren(h('li', { class: 'cp-app-vide', text: T.t('compte.p.aucun-app', 'Aucun appareil connecté.') }));
    }
    charger();
    return section('cp-securite', T.t('compte.p.securite', 'Sécurité'),
      h('h3', { class: 'cp-h3', text: T.t('compte.p.appareils', 'Appareils connectés') }),
      h('p', { class: 'cp-note', text: T.t('compte.p.sessions', 'Les navigateurs où ton compte est ouvert. Une session dure 7 jours sans visite, 30 jours au plus. Le pays est approximatif.') }),
      liste, st,
      h('div', { class: 'cp-actions' }, tous), conf);
  }

  function donnees(moi) {
    const st = h('p', { class: 'cp-statut-l', role: 'status', hidden: '' });
    const exp = bouton(T.t('compte.p.telecharger', 'Télécharger mes données'), '', async () => {
      exp.disabled = true;
      try { await C.exporter(); statut(st, T.t('compte.p.fichier', 'Fichier thelast-compte.json téléchargé.'), true); }
      catch (e) { statut(st, e.code === 'limite' ? T.t('compte.p.export-limite', 'Trop de demandes : 5 exports par heure au plus. Réessaie plus tard.') : e.message, false); }
      exp.disabled = false;
    });
    /* suppression : confirmation explicite (recopier son pseudo) et reconnexion récente exigée par l'API */
    const sup = bouton(T.t('compte.p.supprimer-btn', 'Supprimer mon compte…'), 'cp-danger');
    const champ = h('input', { class: 'cp-champ', id: 'cp-confirmation', type: 'text', autocomplete: 'off', spellcheck: 'false', autocapitalize: 'off', maxlength: '32' });
    const fin = bouton(T.t('compte.p.supprimer-fin', 'Supprimer définitivement'), 'cp-danger');
    fin.disabled = true;
    const st2 = h('p', { class: 'cp-statut-l', role: 'alert', hidden: '' });
    const recente = h('p', { class: 'cp-avert', hidden: moi.reconnexionRecente ? '' : null, text: C.messages.reconnexion_requise });
    const form = h('div', { class: 'cp-conf', hidden: '' },
      recente,
      h('p', { text: T.t('compte.p.supprimer-conf', 'Ton compte, ta tête et tes appareils connectés seront effacés. Les achats, quand il y en aura, sont gardés sans ton nom, comme la loi l’exige. Une nouvelle connexion depuis le launcher créera un compte neuf.') }),
      h('label', { class: 'cp-label', for: 'cp-confirmation' }, T.t('compte.p.recopie', 'Recopie ton pseudo pour confirmer : '), h('b', { text: moi.pseudo })),
      champ, st2,
      h('div', { class: 'cp-actions' }, fin, bouton(T.t('compte.annuler', 'Annuler'), '', () => { form.hidden = true; sup.hidden = false; sup.focus(); })));
    champ.addEventListener('input', () => { fin.disabled = champ.value.trim().toLowerCase() !== moi.pseudo.toLowerCase(); });
    sup.addEventListener('click', () => { sup.hidden = true; form.hidden = false; champ.focus(); });
    fin.addEventListener('click', async () => {
      fin.disabled = true;
      try { message = T.t('compte.p.supprime', 'Ton compte est supprimé. Une nouvelle connexion depuis le launcher créera un compte neuf.'); await C.supprimer(champ.value.trim()); annoncer(message); }
      catch (e) { message = null; fin.disabled = false; statut(st2, e.message, false); if (e.code === 'reconnexion_requise') recente.hidden = false; }
    });
    return section('cp-donnees', T.t('compte.p.donnees', 'Mes données'),
      h('div', { class: 'cp-bloc' },
        h('h3', { class: 'cp-h3', text: T.t('compte.p.telecharger', 'Télécharger mes données') }),
        h('p', { text: T.t('compte.p.json', 'Un fichier JSON avec tout ce que The Last garde sur toi : ton compte, tes appareils connectés et tes achats.') }),
        h('div', { class: 'cp-actions' }, exp), st),
      h('div', { class: 'cp-bloc cp-bloc-danger' },
        h('h3', { class: 'cp-h3', text: T.t('compte.p.supprimer', 'Supprimer mon compte') }),
        h('p', { text: T.t('compte.p.efface', 'Efface ton compte du site. Ton compte Minecraft n’est pas touché.') }),
        h('div', { class: 'cp-actions' }, sup), form));
  }

  async function rendre() {
    const tour = ++n, e = C.courant;
    corps.removeAttribute('aria-busy');
    if (e.etat === 'deconnecte') {
      const avant = message ? h('p', { class: 'cp-message', role: 'status', text: message }) : null;
      corps.replaceChildren(invite(avant));
      return;
    }
    message = null;
    if (e.etat === 'chargement') { corps.setAttribute('aria-busy', 'true'); corps.replaceChildren(attente(T.t('compte.chargement', 'Chargement de ton compte…'))); return; }
    if (e.etat === 'injoignable') { corps.replaceChildren(injoignable(() => C.etat())); return; }
    const tete = await verifierImage(e.moi.tete);
    if (tour !== n) return;
    corps.replaceChildren(profil(e.moi, tete), securite(e.moi), donnees(e.moi));
  }
  D.addEventListener('thelast:compte', rendre);
  rendre();
}

if (PAGE === 'entrer') pageEntrer();
else if (PAGE === 'achats') pageAchats();
else if (PAGE === 'parametres') pageParametres();
})();
