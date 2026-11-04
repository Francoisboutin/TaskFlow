// Lance une série de mutants : node .github/skills/fonctionnalite-taskflow/muter-serie.mjs <fichier.json>  (JSON : [[critère, texte exact de app.js, remplacement], ...])
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const mutants = JSON.parse(readFileSync(process.argv[2], 'utf8'));
let survivants = 0;
let impossibles = 0;
for (const [critere, original, mute] of mutants) {
  const r = spawnSync('node', ['.github/skills/fonctionnalite-taskflow/lancer-tests.mjs', '--muter', original, mute], { encoding: 'utf8', timeout: 90000 });
  const rouges = [...r.stdout.matchAll(/✘ ROUGE\s+(T\d+)/g)].map(m => m[1]);
  const erreurJs = /ERREUR JS/.test(r.stdout);
  const etat = r.status === 0 ? `tué par ${rouges.join(', ') || (erreurJs ? 'erreur JS' : '?')}` : r.status === 1 ? '⚠ SURVIVANT' : `mutation impossible : ${(r.stderr || '').trim().slice(0, 90)}`;
  if (r.status === 1) survivants++;
  if (r.status !== 0 && r.status !== 1) impossibles++;
  console.log(`${critere.padEnd(6)} ${r.status === 0 ? '✔' : '✘'} ${original.slice(0, 58).padEnd(58)} → ${mute.slice(0, 40).padEnd(40)} : ${etat}`);
}
const tues = mutants.length - survivants - impossibles;
console.log(`\n${tues}/${mutants.length} mutants tués${survivants ? ` · ${survivants} survivant(s)` : ''}${impossibles ? ` · ${impossibles} mutation(s) impossible(s) : texte à réécrire` : ''}`);
process.exit(tues === mutants.length ? 0 : 1);
