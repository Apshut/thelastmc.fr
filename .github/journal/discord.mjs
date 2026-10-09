/* Journal du chantier → Discord : poste dans #journal-du-chantier, par le webhook « Le chantier », les entrées de
   assets/journal.json qui n'y sont pas encore. La mise en page (cartes « Progrès réalisé », bannière de semaine, un message par
   jour, sans notification) est dans presentation.mjs.

   Ce qui est déjà posté est noté dans .github/journal/discord.json (clés « projet|phrase », comme le dédoublonnage du
   site) : au premier passage, tout l'historique part ; ensuite, seulement les nouveautés.
   Le webhook vient du secret DISCORD_WEBHOOK_CHANTIER ; sans lui, rien n'est fait (et rien n'est noté).
   Usage : node .github/journal/discord.mjs [--dry-run] */
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { edition, semaineDe } from './presentation.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const JOURNAL = join(HERE, '..', '..', 'assets', 'journal.json');
const STATE = join(HERE, 'discord.json');
const SEMAINES = join(HERE, '..', '..', 'assets', 'discord', 'gazette', 'semaines');   // une bannière par lundi
const CTX = { site: 'https://thelastmc.fr', assets: 'https://thelastmc.fr/assets/discord/' };
const PROJETS = ['site', 'launcher', 'jeu'];

const dry = process.argv.includes('--dry-run');
const hook = process.env.DISCORD_WEBHOOK_CHANTIER || '';
if (!dry && !hook) { console.log('DISCORD_WEBHOOK_CHANTIER absent : rien n\'est posté sur Discord.'); process.exit(0); }
if (!dry && !/^https:\/\/(?:canary\.|ptb\.)?discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(hook)) {
  console.log('::warning::DISCORD_WEBHOOK_CHANTIER mal formé : rien n\'est posté sur Discord.');
  process.exit(1);
}

const cle = e => e.p + '|' + e.t;
const entries = JSON.parse(readFileSync(JOURNAL, 'utf8')).entries;
let etat = {};
try { etat = JSON.parse(readFileSync(STATE, 'utf8')); } catch { /* premier passage : tout l'historique */ }
const deja = new Set(etat.posted || []);
// semaine dont la bannière est déjà posée ; un état d'avant les bannières de semaine compte la semaine en cours comme faite
let semaine = etat.semaine || (deja.size ? semaineDe(new Date().toISOString()) : '');

// le stock de bannières de semaine est dessiné d'avance (tools/discord-art/gazette.py, SEMAINES_FIN) : prévenir à temps
try {
  const derniere = readdirSync(SEMAINES).filter(f => /^\d{4}-\d{2}-\d{2}\.png$/.test(f)).sort().pop();
  if (!derniere || Date.parse(derniere.slice(0, 10)) - Date.now() < 56 * 864e5)
    console.log('::warning::Bannières de semaine bientôt épuisées (dernière : ' + (derniere || 'aucune') + ') : prolonger SEMAINES_FIN dans tools/discord-art/gazette.py.');
} catch { console.log('::warning::Dossier des bannières de semaine introuvable : repli sur la bannière générique.'); }
const neuves = entries.filter(e => PROJETS.includes(e.p) && !deja.has(cle(e)));
if (!neuves.length) { console.log('Discord à jour (' + deja.size + ' entrées déjà postées).'); process.exit(0); }

const pause = ms => new Promise(r => setTimeout(r, ms));
function noter() { writeFileSync(STATE, JSON.stringify({ posted: [...deja], semaine }, null, 1) + '\n'); }

async function poster(body) {
  const json = JSON.stringify(body);                            // ni username ni avatar : le profil du webhook s'en charge
  for (let essai = 1; essai <= 5; essai++) {
    const r = await fetch(hook + '?wait=true&with_components=true', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: json, signal: AbortSignal.timeout(20000) });
    if (r.ok) return;
    if (r.status === 429) {                                     // limite de débit : attendre le délai indiqué, s'il reste raisonnable
      const j = await r.json().catch(() => ({}));
      const s = j.retry_after ?? 2;
      if (s > 30) throw new Error('Discord : limite de débit (' + s + ' s), reprise au prochain passage.');
      await pause(Math.ceil(s * 1000) + 250);
      continue;
    }
    if (r.status >= 500 && essai < 5) { await pause(2000 * essai); continue; }
    throw new Error('Discord a refusé le message : HTTP ' + r.status + ' ' + (await r.text()).slice(0, 300));   // l'URL du webhook n'est jamais affichée
  }
  throw new Error('Discord ne répond pas après 5 essais.');
}

let envoyees = 0, nouveau = false;
try {
  for (const m of edition(neuves, {
    ...CTX, now: new Date().toISOString(), premier: deja.size === 0, semaine,
    semaineDispo: s => existsSync(join(SEMAINES, s + '.png')),
  })) {
    if (dry) console.log(JSON.stringify(m.body, null, 1));
    else { await poster(m.body); await pause(1200); }
    for (const e of m.entries) deja.add(cle(e));                // noté dès que le message est parti
    if (m.semaine && m.semaine > semaine) semaine = m.semaine;  // sa bannière de semaine aussi
    envoyees += m.entries.length;
    nouveau = true;
  }
} catch (err) {
  console.log('::warning::Journal → Discord : ' + err.message);
  process.exitCode = 1;                                         // l'étape échoue, mais ce qui est déjà parti reste noté
}
if (!dry && nouveau) noter();
console.log((dry ? 'Simulation : ' : '') + envoyees + ' entrée(s) ' + (dry ? 'seraient postées' : 'postées') + ' sur Discord.');
