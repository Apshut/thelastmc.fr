/* The Last — les langues du site : le français, par défaut, et l'anglais (interrupteur FR | EN de l'en-tête).
   La langue vient, dans l'ordre : de l'adresse (?lang=en ou ?lang=fr, alors retenue), du choix retenu dans ce navigateur
   (stockage local « thelast:lang », "fr" ou "en", rien d'autre), sinon le français. En anglais, l'adresse garde
   ?lang=en : un lien copié s'ouvre dans la même langue.
   À charger en premier des scripts defer, suivi des dictionnaires de la page (assets/lang/en-*.js), et le petit script
   de <head> qui masque la page le temps de la traduire (sans lui, le français s'afficherait un instant) :
     <script>…lang-wait…</script>  <script src="/assets/i18n.js" defer></script>  <script src="/assets/lang/en-commun.js" defer></script>

   Dans le HTML :
     data-i18n="clé"                             le contenu de l'élément (du HTML) est remplacé par sa traduction
     data-i18n-attr="aria-label:clé;title:clé2"  des attributs (alt, title, aria-label, content, placeholder…)
     data-only="en" (avec hidden) ou "fr"        l'élément n'existe que dans cette langue
   Dans le JS (avec un repli si ce fichier manquait) :
     const T = window.I18N || { lang: 'fr', locale: 'fr-FR', t: (k, s, v) => v ? s.replace(/\{(\w+)\}/g, (m, x) => x in v ? v[x] : m) : s, pick: (o, f) => o && o[f] };
     T.t('clé', 'Texte français', { n: 3 })   la traduction, sinon le français ; {n} est remplacé dans les deux
     T.pick(objet, 'name')                    objet.en.name en anglais s'il existe, sinon objet.name (données de config.js)
     T.lang ('fr' | 'en'), T.locale ('fr-FR' | 'en-US') pour les dates et les nombres
     T.apply(fragment)                        traduit un morceau de HTML ajouté plus tard (un <template>, par exemple)
   Les pages écrites dans une seule langue (les pages légales, privacy.html, terms.html, legal-notice.html, en.html) ont
   l'attribut data-i18n-static sur <html> : elles restent dans leur langue, et l'interrupteur mène à leur jumelle (ses
   liens sont écrits dans la page). En anglais, les liens vers les pages légales françaises mènent à leurs jumelles.
   Une clé absente du dictionnaire garde le français ; en local (localhost), I18N.missing liste ces clés.
   Règle : quand un texte français change, sa traduction change avec lui (assets/lang/en-*.js). */
(() => {
'use strict';
const D = document, W = window, root = D.documentElement, KEY = 'thelast:lang';
const LOCAL = /^(localhost|127\.0\.0\.1|\[::1\])$/.test(location.hostname);
const valide = v => v === 'fr' || v === 'en';
const lire = () => { try { return localStorage.getItem(KEY); } catch (e) { return null; } };
const retenir = v => { try { localStorage.setItem(KEY, v); } catch (e) { /* stockage refusé : le choix vaut pour cette page */ } };

const fixe = root.hasAttribute('data-i18n-static');          // page écrite dans une seule langue
const url = new URL(location.href), demande = url.searchParams.get('lang');
if (valide(demande)) retenir(demande);
const lang = fixe ? (root.lang === 'en' ? 'en' : 'fr') : valide(demande) ? demande : valide(lire()) ? lire() : 'fr';

// les pages légales ont leurs jumelles écrites à part
const JUMELLES = { '/confidentialite': '/privacy', '/cgu': '/terms', '/mentions-legales': '/legal-notice' };
const chemin = p => p.replace(/\.html$/, '').replace(/\/index$/, '/') || '/';
function href(h) {
  if (lang !== 'en' || !h) return h;
  let u; try { u = new URL(h, location.href); } catch (e) { return h; }
  if (u.origin !== location.origin) return h;
  const j = JUMELLES[chemin(u.pathname)];
  return j ? j + u.search + u.hash : h;
}

const EN = {}, missing = new Set();
const remplir = (s, v) => v ? String(s).replace(/\{(\w+)\}/g, (m, k) => k in v ? v[k] : m) : s;
function t(cle, fr, v) {
  if (lang === 'en') { if (Object.prototype.hasOwnProperty.call(EN, cle)) return remplir(EN[cle], v); if (LOCAL) missing.add(cle); }
  return remplir(fr, v);
}
const pick = (o, f) => o && lang === 'en' && o.en && o.en[f] != null ? o.en[f] : o && o[f];

/* traduit ce qui peut l'être ; au dernier passage (fin), les clés encore absentes sont notées */
function apply(scope, fin) {
  scope = scope || D;
  scope.querySelectorAll('[data-only]').forEach(el => { el.hidden = el.dataset.only !== lang; });
  if (lang !== 'en') return;
  scope.querySelectorAll('[data-i18n]').forEach(el => {
    const k = el.dataset.i18n;
    if (!Object.prototype.hasOwnProperty.call(EN, k)) { if (fin && LOCAL) missing.add(k); return; }
    if (el.tagName === 'TITLE') el.textContent = EN[k]; else el.innerHTML = EN[k];
    el.removeAttribute('data-i18n');
  });
  scope.querySelectorAll('[data-i18n-attr]').forEach(el => {
    const reste = el.dataset.i18nAttr.split(';').map(s => s.trim()).filter(Boolean).filter(paire => {
      const i = paire.indexOf(':'), attr = paire.slice(0, i).trim(), k = paire.slice(i + 1).trim();
      if (!Object.prototype.hasOwnProperty.call(EN, k)) { if (fin && LOCAL) missing.add(k); return true; }
      el.setAttribute(attr, EN[k]); return false;
    });
    if (reste.length) el.dataset.i18nAttr = reste.join(';'); else el.removeAttribute('data-i18n-attr');
  });
}
function add(dict) { Object.assign(EN, dict); if (lang === 'en' && D.readyState !== 'loading') apply(D); }

/* l'interrupteur : le choix est retenu, puis la page se recharge dans l'autre langue, au même endroit */
function changer(l, a) {
  retenir(l);
  if (l === lang) return;
  if (fixe) { location.assign(a.href); return; }                  // la jumelle, écrite dans la page
  const u = new URL(location.href);
  u.searchParams.set('lang', l);                                  // ?lang=fr est retenu puis retiré de l'adresse
  try { sessionStorage.setItem('thelast:lang-y', u.pathname + '|' + Math.round(scrollY)); } catch (e) { /* tant pis : en haut de page */ }
  location.replace(u.href);
}
function interrupteur() {
  D.querySelectorAll('.lang-sw a[data-lang]').forEach(a => {
    const l = a.dataset.lang;
    if (!fixe) { const u = new URL(location.href); u.searchParams.set('lang', l); a.href = u.pathname + u.search + u.hash; }
    if (l === lang) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    a.addEventListener('click', e => { if (e.button || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; e.preventDefault(); changer(l, a); });
  });
}

/* la langue dans la page et dans l'adresse */
root.lang = lang;
if (!fixe) {
  if (lang === 'en') url.searchParams.set('lang', 'en'); else url.searchParams.delete('lang');
  const propre = url.pathname + url.search + url.hash;
  if (propre !== location.pathname + location.search + location.hash) history.replaceState(history.state, '', propre);
  const can = D.querySelector('link[rel="canonical"]');
  if (can && lang === 'en') { const c = new URL(can.href); c.searchParams.set('lang', 'en'); can.href = c.href; }
}

/* un lien vers une page légale française mène à sa jumelle ; pas celui qui mène exprès au français (hreflang="fr"),
   et rien sur les pages écrites dans une seule langue : leurs liens sont déjà les bons */
function redirige(a) { if (a.getAttribute('hreflang') === 'fr') return; const h = a.getAttribute('href'), n = href(h); if (n !== h) a.setAttribute('href', n); }
function pret() {
  apply(D, true);
  interrupteur();
  if (lang === 'en' && !fixe) D.querySelectorAll('a[href]').forEach(redirige);
  root.classList.remove('lang-wait');
  if (LOCAL && missing.size) console.warn('[i18n] clés sans traduction :', Array.from(missing));
}
// pendant les scripts defer, la page est déjà « interactive » mais les dictionnaires ne sont pas encore lus : on attend la fin
if (D.readyState === 'complete') pret(); else D.addEventListener('DOMContentLoaded', pret);
// les liens ajoutés plus tard (bulles, panneaux) vers les pages légales : corrigés au moment du clic
if (lang === 'en' && !fixe) D.addEventListener('click', e => { const a = e.target.closest && e.target.closest('a[href]'); if (a) redirige(a); }, true);
// retour au même endroit après un changement de langue
addEventListener('load', () => {
  let s = null; try { s = sessionStorage.getItem('thelast:lang-y'); sessionStorage.removeItem('thelast:lang-y'); } catch (e) { /* rien à reprendre */ }
  if (!s) return; const [p, y] = s.split('|');
  if (p === location.pathname && +y > 0) requestAnimationFrame(() => scrollTo(0, +y));
});

W.I18N = { lang, locale: lang === 'en' ? 'en-US' : 'fr-FR', t, pick, add, apply: s => apply(s, true), href, missing };
})();
