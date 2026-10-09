/* Journal du chantier → Discord : la mise en page des messages de #journal-du-chantier (choisie par William le 2026-10-09 :
   les cartes « Progrès réalisé » avec la bannière de la gazette).

   Chaque nouveauté arrive comme un progrès en jeu (les mêmes toasts « Progrès réalisé ! » que sur le site) : une carte
   (Container) à la couleur du projet, avec à droite la vignette pixel du projet (parchemin, portail, pioche), un titre en
   gras, la phrase, puis la date en petit et un lien vers la page Chantier filtrée sur le projet. Un message par jour
   (heure de Paris) ; dans une journée, les nouveautés d'un même projet se rangent dans une seule carte.

   Les bannières séparent les semaines (décision de William du 2026-10-09) : le premier message de chaque semaine (lundi,
   heure de Paris) s'ouvre sur la bannière « SEMAINE DU JJ/MM/AAAA » (gazette/semaines/<lundi>.png, dessinée d'avance
   par gazette.py ; si elle manque, la bannière générique suivie de la date en texte). Les autres messages n'ont que les
   cartes. ctx.semaine = la dernière semaine qui a déjà sa bannière (noté dans discord.json). Au tout premier passage
   (rien encore posté, ctx.premier), une ouverture avec la bannière « Depuis le début », une présentation et deux
   boutons, qui vaut pour la semaine en cours.

   Components V2 (docs.discord.com, vérifié le 2026-10-09) : drapeau IS_COMPONENTS_V2 (1<<15), ni content ni embeds ;
   40 composants au plus par message, imbriqués compris ; texte borné ici à 3800 caractères par message ; Section = 1 à 3
   Text Display + un accessoire (Thumbnail) ; webhook appartenant à l'application, appelé avec ?with_components=true.
   Les images sont servies par le site (assets/discord/), dessinées par tools/discord-art/progres.py et gazette.py.
   Les phrases viennent des commits : Markdown neutralisé, allowed_mentions vide. Aucune dépendance. */

const V2 = 1 << 15;                                             // IS_COMPONENTS_V2
const SILENT = 1 << 12;                                         // SUPPRESS_NOTIFICATIONS
const ART = '1';                                                // à changer si l'art change : force Discord à recharger les images
const MAX_COMPOSANTS = 40;
const MAX_HAUT = 10;                                            // composants de premier niveau (prudence : ancienne limite)
const MAX_TEXTE = 3800;                                         // < 4000 caractères de texte par message
const PAR_CARTE = 10;                                           // une carte regroupe au plus 10 nouveautés

const PROJETS = {
  site: { nom: 'Site', couleur: 0xffb547, icone: 'progres/site.png', alt: 'Parchemin du Site' },
  launcher: { nom: 'Launcher', couleur: 0x5fd8ff, icone: 'progres/launcher.png', alt: 'Portail du Launcher' },
  jeu: { nom: 'Jeu', couleur: 0x62e06a, icone: 'progres/jeu.png', alt: 'Pioche du Jeu' },
};
const BANNIERE = { url: 'gazette/banniere.png', alt: 'Le chantier, la gazette du Nether' };
const BANNIERE_DEBUT = { url: 'gazette/banniere-debut.png', alt: 'Le chantier depuis le début' };

/* profil du webhook « Le chantier » (nom et avatar réglés une fois sur le webhook lui-même) */
export const webhook = { username: 'Le chantier', avatar: 'progres/avatar.png' };

/* le site affiche les phrases en texte brut : on neutralise le Markdown de Discord (et les mentions, horodatages,
   liens masqués…) pour qu'elles s'affichent pareil */
export function brut(s) {
  return String(s).replace(/\s+/g, ' ').trim().slice(0, 300)
    .replace(/[\\*_~`|>[\]()<#@-]/g, '\\$&')
    .replace(/^(\d+)\./, '$1\\.')                               // « 1. » en début de ligne ferait une liste
    .replace(/^\+/, '\\+');
}

const unix = iso => Math.floor(Date.parse(iso) / 1000);
const jourParis = new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris', year: 'numeric', month: '2-digit', day: '2-digit' });
const jour = iso => jourParis.format(new Date(iso));            // AAAA-MM-JJ à Paris : le jour du chantier

const lien = (ctx, p) => ctx.site.replace(/\/$/, '') + '/chantier.html?p=' + p;
const image = (ctx, f) => ctx.assets + f + '?v=' + ART;
const galerie = (ctx, b) => ({ type: 12, items: [{ media: { url: image(ctx, b.url) }, description: b.alt }] });

/* une carte : Container (barre à la couleur du projet) > Section (texte + vignette) = 4 composants */
function carte(groupe, ctx) {
  const P = PROJETS[groupe.p];
  const n = groupe.items.length;
  const titre = n === 1 ? `**${P.nom} · Progrès réalisé !**` : `**${P.nom} · ${n} progrès réalisés**`;
  const corps = n === 1 ? brut(groupe.items[0].t) : groupe.items.map(e => '- ' + brut(e.t)).join('\n');
  const pied = `-# <t:${unix(groupe.items[0].d)}:D>  ·  [Voir au chantier](${lien(ctx, groupe.p)})`;
  const texte = titre + '\n' + corps + '\n' + pied;
  return {
    texte: texte.length + P.alt.length,
    json: {
      type: 17,                                                 // Container
      accent_color: P.couleur,
      components: [{
        type: 9,                                                // Section
        components: [{ type: 10, content: texte }],             // Text Display
        accessory: { type: 11, media: { url: image(ctx, P.icone) }, description: P.alt },   // Thumbnail
      }],
    },
  };
}

/* jour par jour ; dans un jour, un groupe par projet (dans l'ordre de première apparition), coupé tous les 10 */
function groupes(entries) {
  const jours = new Map();
  for (const e of entries) {
    const j = jour(e.d);
    if (!jours.has(j)) jours.set(j, new Map());
    const parProjet = jours.get(j);
    if (!parProjet.has(e.p)) parProjet.set(e.p, []);
    parProjet.get(e.p).push(e);
  }
  const out = [];
  for (const [j, parProjet] of jours) {
    const lots = [];
    for (const [p, items] of parProjet)
      for (let i = 0; i < items.length; i += PAR_CARTE) lots.push({ p, items: items.slice(i, i + PAR_CARTE) });
    out.push({ jour: j, lots });
  }
  return out;
}

/* semaines : le lundi (AAAA-MM-JJ) du jour de Paris, et sa bannière */
const lundi = j => {
  const d = new Date(j + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - (d.getUTCDay() + 6) % 7);
  return d.toISOString().slice(0, 10);
};
export const semaineDe = iso => lundi(jour(iso));
const jjmmaaaa = s => s.slice(8, 10) + '/' + s.slice(5, 7) + '/' + s.slice(0, 4);
function banniereSemaine(s, ctx) {
  const alt = 'Le chantier, semaine du ' + jjmmaaaa(s);
  if (!ctx.semaineDispo || ctx.semaineDispo(s))
    return { comps: [galerie(ctx, { url: 'gazette/semaines/' + s + '.png', alt })], n: 1, t: alt.length };
  const titre = '### Semaine du ' + jjmmaaaa(s);                // repli : image pas encore dessinée
  return { comps: [galerie(ctx, BANNIERE), { type: 10, content: titre }], n: 2, t: BANNIERE.alt.length + titre.length };
}

function ouverture(entries, ctx) {
  const compte = {};
  for (const e of entries) compte[e.p] = (compte[e.p] || 0) + 1;
  const detail = Object.keys(PROJETS).filter(p => compte[p]).map(p => PROJETS[p].nom + ' ' + compte[p]).join('  ·  ');
  const site = ctx.site.replace(/\/$/, '');
  return [
    galerie(ctx, BANNIERE_DEBUT),
    {
      type: 17,
      accent_color: 0xff6b2c,                                   // braise : la couleur de la marque
      components: [
        { type: 10, content: '## Journal du chantier\nTout ce qui avance sur **le site**, **le launcher** et **le jeu** de The Last, au fil des corrections. Chaque nouveauté arrive ici d\'elle-même, comme un progrès en jeu.' },
        { type: 14, divider: true, spacing: 1 },
        { type: 10, content: `-# ${entries.length} progrès depuis le <t:${unix(entries[0].d)}:D>  ·  ${detail}` },
        { type: 1, components: [
          { type: 2, style: 5, label: 'Ouvrir le chantier', url: site + '/chantier.html' },
          { type: 2, style: 5, label: 'thelastmc.fr', url: site + '/' },
        ] },
      ],
    },
  ];
}

const corps = components => ({ flags: V2 | SILENT, allowed_mentions: { parse: [] }, components });

/* Les messages d'un passage, dans l'ordre d'envoi : [{ body, entries, semaine }], où entries sont les nouveautés que ce
   message publie et semaine la semaine dont il porte la bannière, le cas échéant (discord.mjs note l'une et l'autre dès
   que le message est parti). */
export function edition(entries, ctx) {
  const tri = entries.filter(e => PROJETS[e.p]).slice().sort((a, b) => a.d.localeCompare(b.d));
  if (!tri.length) return [];
  const out = [];
  let semaine = ctx.semaine || '';                              // la dernière semaine qui a déjà sa bannière
  if (ctx.premier) {                                            // l'ouverture vaut bannière pour la semaine en cours
    semaine = semaineDe(tri[tri.length - 1].d);
    out.push({ body: corps(ouverture(tri, ctx)), entries: [], semaine });
  }
  for (const { jour: j, lots } of groupes(tri)) {               // un jour = un message (ou plusieurs si les limites l'exigent)
    const s = lundi(j);
    let tete = null;                                            // la bannière ouvre le premier message de la semaine
    if (s > semaine) { tete = banniereSemaine(s, ctx); semaine = s; }
    let cur = null;
    for (const lot of lots) {
      const c = carte(lot, ctx);
      if (!cur || cur.components.length + 1 > MAX_HAUT || cur.n + 4 > MAX_COMPOSANTS || cur.t + c.texte > MAX_TEXTE) {
        cur = { components: [], entries: [], n: 0, t: 0 };
        if (tete) { cur.components.push(...tete.comps); cur.n += tete.n; cur.t += tete.t; cur.semaine = s; tete = null; }
        out.push(cur);
      }
      cur.components.push(c.json);
      cur.entries.push(...lot.items);
      cur.n += 4;
      cur.t += c.texte;
    }
  }
  return out.map(m => m.body ? m : { body: corps(m.components), entries: m.entries, semaine: m.semaine });
}
