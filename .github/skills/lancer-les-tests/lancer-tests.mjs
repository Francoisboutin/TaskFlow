#!/usr/bin/env node
/* Lance les auto-tests de TaskFlow dans Chrome (ou Edge) sans interface, et affiche le résultat.

   Usage (depuis la racine du projet) :
     node .github/skills/lancer-les-tests/lancer-tests.mjs
         → exécute tests.js sur l'application ; code de sortie 0 si tout est vert, 1 sinon.
     node .github/skills/lancer-les-tests/lancer-tests.mjs --muter "texte exact" "remplacement"
         → test de mutation : applique le remplacement sur une COPIE de app.js (le vrai fichier
           n'est jamais modifié), relance les tests et dit si le mutant est tué.
           Code de sortie 0 = mutant tué, 1 = mutant survivant, 2 = mutation impossible.

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
  return { tests, bilan, erreursJs };
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

process.exit(afficher(executer(resolve(RACINE))) ? 0 : 1);
