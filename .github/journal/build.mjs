/* Journal du chantier : rassemble les lignes « Journal(site|launcher|jeu): … » des messages de commit des projets
   et écrit assets/journal.json, que la page d'accueil affiche (les 5 dernières entrées).

   Une ligne par changement visible, écrite pour les joueurs, en français :
     Journal(site): Le magma devient une croûte de lave refroidie
     Journal(launcher): Connexion Microsoft prête, en attente de validation par Mojang
     Journal(jeu): Correctif du bug de duplication des Braises
   Les commits sans cette ligne n'apparaissent pas : rien d'autre ne sort des dépôts (ni code, ni message technique).

   Sources : les dépôts de SOURCES, lus par l'API GitHub avec le jeton JOURNAL_TOKEN (lecture seule du contenu), ou un dépôt
   local avec --git <dossier> (essais, sans jeton). S'y ajoutent les entrées d'avant cette convention (historique.json).
   Usage : node .github/journal/build.mjs [--git <dossier>] [--out <fichier>] */
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const SOURCES = ['Apshut/the-last-launcher'];                 // ajouter ici le dépôt du serveur quand il existera
const KEEP = 5000, PAGES = 5;                                  // tout l'historique (la page Chantier l'affiche) ; pages de 100 commits lues à chaque passage
const LINE = /^Journal\((site|launcher|jeu)\)\s*:\s*(.+?)\s*$/gim;

const args = process.argv.slice(2), opt = k => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : null; };
const out = opt('--out') || join(HERE, '..', '..', 'assets', 'journal.json');

function parse(message, date, into) {
  for (const m of message.matchAll(LINE)) into.push({ p: m[1].toLowerCase(), t: m[2].slice(0, 160), d: new Date(date).toISOString() });
}
async function fromGitHub(repo, token, into) {
  for (let page = 1; page <= PAGES; page++) {
    const r = await fetch(`https://api.github.com/repos/${repo}/commits?per_page=100&page=${page}`, {
      headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' } });
    if (!r.ok) throw new Error(`${repo} : HTTP ${r.status} ${await r.text()}`);
    const list = await r.json();
    for (const c of list) parse(c.commit.message, c.commit.committer.date, into);
    if (list.length < 100) break;
  }
}
function fromGit(dir, into) {
  const log = execFileSync('git', ['-C', dir, 'log', '-n', '500', '--format=%cI%x1f%B%x1e'], { encoding: 'utf8', maxBuffer: 1 << 26 });
  for (const rec of log.split('\x1e')) { const [date, body] = rec.split('\x1f'); if (body) parse(body, date.trim(), into); }
}

const entries = JSON.parse(readFileSync(join(HERE, 'historique.json'), 'utf8'));
// ce qui est déjà publié reste : l'historique ne dépend pas des seuls derniers commits relus
try { entries.push(...JSON.parse(readFileSync(out, 'utf8')).entries); } catch { /* premier passage */ }
if (opt('--git')) fromGit(opt('--git'), entries);
else {
  const token = process.env.JOURNAL_TOKEN;
  if (!token) { console.log('JOURNAL_TOKEN absent : journal inchangé (secret à ajouter dans Settings > Secrets and variables > Actions).'); process.exit(0); }
  for (const repo of SOURCES) await fromGitHub(repo, token, entries);
}
// une même phrase n'apparaît qu'une fois (la plus récente) ; les plus récentes d'abord
const seen = new Set(), list = entries.sort((a, b) => b.d.localeCompare(a.d)).filter(e => { const k = e.p + '|' + e.t; if (seen.has(k)) return false; seen.add(k); return true; }).slice(0, KEEP);
const json = JSON.stringify({ entries: list }, null, 1) + '\n';
let old = ''; try { old = readFileSync(out, 'utf8'); } catch { /* premier passage */ }
if (old === json) console.log('Journal à jour (' + list.length + ' entrées).');
else { writeFileSync(out, json); console.log('Journal écrit : ' + list.length + ' entrées, la plus récente : ' + (list[0] ? list[0].p + ' — ' + list[0].t : 'aucune')); }
