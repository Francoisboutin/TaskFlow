#!/usr/bin/env node
/* Lance les auto-tests de TaskFlow dans Chrome (ou Edge) sans interface, et affiche le résultat.

   Usage (depuis la racine du projet) :
     node .github/skills/fonctionnalite-taskflow/lancer-tests.mjs
         → exécute tests.js sur l'application ; code de sortie 0 si tout est vert, 1 sinon.
     node .github/skills/fonctionnalite-taskflow/lancer-tests.mjs --muter "texte exact" "remplacement"
         → test de mutation : applique le remplacement sur une COPIE de app.js (le vrai fichier
           n'est jamais modifié), relance les tests et dit si le mutant est tué.
           Code de sortie 0 = mutant tué, 1 = mutant survivant, 2 = mutation impossible.
     node .github/skills/fonctionnalite-taskflow/lancer-tests.mjs --sauvegarde fichier.json
         → recharge une sauvegarde (le contenu de localStorage « taskflow ») par le VRAI démarrage
           de l'application, sur une copie : aucune erreur JS, sauvegarde ni rejetée ni vidée,
           réécrite dans la version actuelle, tous les tests verts. Code 0 = rechargée sans erreur.

   Le navigateur est cherché aux emplacements habituels ; CHROME_PATH permet d'en imposer un. */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, copyFileSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const RACINE = process.cwd();
const FICHIERS = ['index.html', 'style.css', 'app.js', 'tests.js'];

function trouverNavigateur() {
  const candidats = [
    process.env.CHROME_PATH,
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'
  ].filter(Boolean);
  const trouve = candidats.find(chemin => existsSync(chemin));
  if (!trouve) { console.error('Aucun navigateur Chrome/Edge trouvé. Indiquez son chemin dans CHROME_PATH.'); process.exit(2); }
  return trouve;
}

const decoder = texte => texte.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();

// Ouvre index.html du dossier donné et lit le panneau Auto-tests
function executer(dossier) {
  const profil = mkdtempSync(join(tmpdir(), 'taskflow-profil-'));
  const page = pathToFileURL(join(dossier, 'index.html')).href;
  const sortie = spawnSync(trouverNavigateur(), [
    '--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check',
    `--user-data-dir=${profil}`, '--enable-logging=stderr', '--v=0',
    '--virtual-time-budget=4000', '--dump-dom', page
  ], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024, timeout: 60000 });
  try { rmSync(profil, { recursive: true, force: true }); } catch { /* sans conséquence */ }
  const dom = sortie.stdout || '';
  const tests = [...dom.matchAll(/<li class="at-test ([^"]*)" data-test="([^"]+)">([\s\S]*?)<\/li>/g)].map(([, classes, code, contenu]) => ({
    code,
    reussi: /\bis-ok\b/.test(classes),
    nom: decoder((contenu.match(/<span class="at-nom">([\s\S]*?)<span class="sr-only">/) || [, ''])[1]),
    detail: decoder((contenu.match(/<span class="at-detail">([\s\S]*?)<\/span>/) || [, ''])[1])
  }));
  const bilan = decoder((dom.match(/id="at-bilan"[^>]*>([^<]*)</) || [, ''])[1]);
  const erreursJs = (sortie.stderr || '').split('\n').filter(ligne => /CONSOLE/.test(ligne) && /Uncaught|Error/i.test(ligne));
  return { tests, bilan, erreursJs, dom };
}

function afficher({ tests, bilan, erreursJs }) {
  for (const test of tests) console.log(`${test.reussi ? '✔ VERT ' : '✘ ROUGE'}  ${test.nom}${test.reussi ? '' : `\n          → ${test.detail}`}`);
  for (const erreur of erreursJs) console.log(`✘ ERREUR JS  ${erreur.replace(/^.*CONSOLE[:(]\d+\)?\]\s*/, '')}`);
  const reussis = tests.filter(test => test.reussi).length;
  const tousVerts = tests.length > 0 && reussis === tests.length && erreursJs.length === 0;
  console.log(`\nBilan : ${tests.length ? `${reussis}/${tests.length} réussis` : 'aucun test affiché (la page a-t-elle planté ?)'}${bilan ? ` (panneau : « ${bilan} »)` : ''} → ${tousVerts ? 'VERT' : 'ROUGE'}`);
  return tousVerts;
}

const args = process.argv.slice(2);
if (!FICHIERS.every(fichier => existsSync(join(RACINE, fichier)))) {
  console.error(`Lancez ce script depuis la racine de TaskFlow (fichiers attendus : ${FICHIERS.join(', ')}).`);
  process.exit(2);
}

if (args[0] === '--muter') {
  const [, original, remplacement] = args;
  if (original === undefined || remplacement === undefined) { console.error('Usage : --muter "texte exact de app.js" "remplacement"'); process.exit(2); }
  const source = readFileSync(join(RACINE, 'app.js'), 'utf8');
  const occurrences = source.split(original).length - 1;
  if (occurrences !== 1) { console.error(`Mutation impossible : le texte apparaît ${occurrences} fois dans app.js (il doit apparaître exactement 1 fois).`); process.exit(2); }
  const copie = mkdtempSync(join(tmpdir(), 'taskflow-mutant-'));
  for (const fichier of FICHIERS) copyFileSync(join(RACINE, fichier), join(copie, fichier));
  writeFileSync(join(copie, 'app.js'), source.replace(original, remplacement));
  console.log(`Mutant : « ${original} » → « ${remplacement} » (copie temporaire, app.js n'est pas modifié)\n`);
  const resultat = executer(copie);
  rmSync(copie, { recursive: true, force: true });
  const tousVerts = afficher(resultat);
  console.log(tousVerts ? '\n⚠ MUTANT SURVIVANT : aucun test ne détecte cette erreur.' : '\n✔ MUTANT TUÉ : au moins un test détecte cette erreur.');
  process.exit(tousVerts ? 1 : 0);
}

if (args[0] === '--sauvegarde') {
  const fichier = args[1];
  if (!fichier || !existsSync(fichier)) { console.error('Usage : --sauvegarde chemin/vers/sauvegarde.json'); process.exit(2); }
  const texte = readFileSync(fichier, 'utf8').replace(/^\ufeff/, '');
  let avant;
  try { avant = JSON.parse(texte); } catch (erreur) { console.error(`Fichier illisible : ${erreur.message}`); process.exit(2); }
  const ticketsAvant = Array.isArray(avant) ? avant.length : (Array.isArray(avant && avant.tickets) ? avant.tickets.length : 0);
  const copie = mkdtempSync(join(tmpdir(), 'taskflow-sauvegarde-'));
  for (const nom of FICHIERS) copyFileSync(join(RACINE, nom), join(copie, nom));
  // Avant l'application : la sauvegarde est placée dans localStorage, comme dans le navigateur de la veille
  // (« < » devient \u003c dans la chaîne : un « </script> » contenu dans la sauvegarde ne peut pas fermer la balise)
  const injection = `<script>localStorage.clear();localStorage.setItem('taskflow', ${JSON.stringify(texte).replace(/</g, '\\u003c')});window.__sauvegardeInjectee = true;</script>`;
  // Après l'application et les tests : ce qu'elle a fait de la sauvegarde
  const diagnostic = `<script>(function () {
    var d = { injectee: window.__sauvegardeInjectee === true, illisible: localStorage.getItem('taskflow-illisible') !== null, versionApp: window.TaskFlow && window.TaskFlow.VERSION_SAUVEGARDE };
    try { var s = JSON.parse(localStorage.getItem('taskflow')); d.version = s.version; d.tickets = s.tickets.length;
      d.projets = s.projets.map(function (p) { return p.nom + ' (' + p.tickets.length + ' tickets)'; });
      d.vue = s.affichage && s.affichage.vue; d.utilisateur = s.affichage && s.affichage.utilisateur;
      d.sprints = s.projets.reduce(function (n, p) { return n + (Array.isArray(p.sprints) ? p.sprints.length : 0); }, 0);
      d.ticketsEnSprint = s.tickets.filter(function (t) { return t.sprintId; }).length; }
    catch (e) { d.erreur = String(e); }
    var b = document.getElementById('bandeau-chargement');
    d.bandeau = b && !b.hidden ? (document.getElementById('bandeau-chargement-titre').textContent + ' ' + document.getElementById('bandeau-chargement-texte').textContent) : '';
    var pre = document.createElement('pre'); pre.id = 'diagnostic-sauvegarde'; pre.textContent = JSON.stringify(d); document.body.appendChild(pre);
  })();</script>`;
  let html = readFileSync(join(copie, 'index.html'), 'utf8');
  // La vraie balise <head>, seule sur sa ligne (le commentaire d’en-tête de index.html cite aussi « <head> »)
  html = html.replace(/^<head>$/m, () => `<head>\n${injection}`).replace('<script src="tests.js"></script>', `<script src="tests.js"></script>\n${diagnostic}`);
  writeFileSync(join(copie, 'index.html'), html);
  const resultat = executer(copie);
  rmSync(copie, { recursive: true, force: true });
  const brut = (resultat.dom.match(/<pre id="diagnostic-sauvegarde">([\s\S]*?)<\/pre>/) || [, ''])[1];
  const lu = brut.replace(/&quot;/g, '"').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'").replace(/&nbsp;/g, '\u00a0').replace(/&amp;/g, '&');
  let d = {};
  try { d = JSON.parse(lu || '{}'); } catch { d = { erreur: 'diagnostic illisible' }; }
  console.log(`Sauvegarde : ${fichier} (version ${Array.isArray(avant) ? '1 (tableau nu)' : avant.version}, ${ticketsAvant} tickets)\n`);
  const versionAvant = Array.isArray(avant) ? 1 : avant.version;
  const affichageAvant = !Array.isArray(avant) && avant.affichage ? avant.affichage : {};
  const migration = versionAvant < d.versionApp;
  const controles = [
    ['la sauvegarde a bien été placée dans le navigateur avant le démarrage', d.injectee === true],
    ['aucune erreur JavaScript au démarrage', resultat.erreursJs.length === 0 && !d.erreur],
    [migration ? `migration v${versionAvant} → v${d.versionApp} annoncée (et non la démonstration à la place)` : 'sauvegarde reprise telle quelle (pas de démonstration à la place)',
      migration ? /mise à jour|convertie/.test(d.bandeau || '') : !/illisible|plus récente/.test(d.bandeau || '')],
    [`vue et « Je suis » conservés (${affichageAvant.vue || 'backlog'} / ${affichageAvant.utilisateur || '(vide)'})`,
      (affichageAvant.vue || 'backlog') === d.vue && (versionAvant < 3 || (affichageAvant.utilisateur || '') === (d.utilisateur || ''))],
    ['la sauvegarde n’a pas été rejetée (pas de copie « taskflow-illisible »)', d.illisible === false],
    [`réécrite dans la version actuelle (v${d.versionApp})`, d.version !== undefined && d.version === d.versionApp],
    [`aucun ticket perdu (${ticketsAvant} avant, ${d.tickets} après)`, d.tickets === ticketsAvant]
  ];
  // Depuis la v4, une sauvegarde contient des sprints : ils doivent survivre aux migrations suivantes
  const projetsAvant = !Array.isArray(avant) && Array.isArray(avant.projets) ? avant.projets : [];
  const sprintsAvant = projetsAvant.reduce((total, projet) => total + (Array.isArray(projet.sprints) ? projet.sprints.length : 0), 0);
  const enSprintAvant = !Array.isArray(avant) && Array.isArray(avant.tickets) ? avant.tickets.filter(ticket => ticket && ticket.sprintId).length : 0;
  if (sprintsAvant || enSprintAvant) {
    controles.push([`sprints et tickets engagés conservés (${sprintsAvant} sprint(s) et ${enSprintAvant} ticket(s) avant ; ${d.sprints} et ${d.ticketsEnSprint} après)`,
      d.sprints === sprintsAvant && d.ticketsEnSprint === enSprintAvant]);
  }
  for (const [libelle, ok] of controles) console.log(`${ok ? '✔' : '✘'} ${libelle}`);
  console.log(`  message affiché : ${d.bandeau || '(aucun)'}\n  projets : ${(d.projets || []).join(', ')} · vue ${d.vue} · « Je suis » : ${d.utilisateur || '(vide)'}\n`);
  const tousVerts = afficher(resultat);
  const ok = controles.every(([, valide]) => valide) && tousVerts;
  console.log(ok ? '\n✔ SAUVEGARDE RECHARGÉE SANS ERREUR' : '\n✘ PROBLÈME AU RECHARGEMENT DE LA SAUVEGARDE');
  process.exit(ok ? 0 : 1);
}

process.exit(afficher(executer(resolve(RACINE))) ? 0 : 1);
