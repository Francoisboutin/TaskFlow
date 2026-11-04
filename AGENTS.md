# AGENTS.md · TaskFlow

Règles communes à tous les agents qui travaillent sur TaskFlow. Chaque agent a en plus sa fiche dans `.github/agents/`.

## Le projet

TaskFlow est une application web de backlog et de Kanban pour une équipe agile, en HTML / CSS / JavaScript sans framework ni serveur. Les données sont dans le `localStorage` du navigateur. Le code, les commentaires et les messages sont **en français**.

```
taskflow/
├─ index.html   structure de la page
├─ style.css    design, thèmes, animations
├─ app.js       1. Données · 2. Règles · 3. UI          ← @Dev-JS
├─ tests.js     auto-tests                              ← @Testeur-QA
├─ docs/        spécifications (dont docs/spec.md)      ← @Analyste-PO
├─ AGENTS.md    ce fichier
└─ .github/     agents/ (fiches des agents) · skills/ (lancer-les-tests)
```

Lire `docs/README.md` pour l'architecture et les règles métier existantes (R1 à R5, I1 à I5).

## Les 3 agents et leurs fichiers

| Agent | Rôle | Peut modifier | Ne modifie **jamais** |
|---|---|---|---|
| **Analyste-PO** | Transforme une demande en spec testable. **Ne code jamais.** | `docs/` | `app.js`, `tests.js`, `index.html`, `style.css` |
| **Testeur-QA** | Écrit les tests **avant** le code, puis contre-vérifie (mutations). | `tests.js` | `app.js`, `docs/`, `index.html`, `style.css` |
| **Dev-JS** | Code jusqu'à ce que tous les tests soient verts. | `app.js`, et si la spec l'exige `index.html`, `style.css` | `tests.js`, `docs/` |

Un agent qui a besoin d'un changement hors de ses fichiers **ne le fait pas lui-même** : il le signale et passe le relais à l'agent concerné (boutons de *handoff*).

## Le circuit d'une demande

```
 Demande de l'utilisateur
        │
        ▼
 1. @Analyste-PO   écrit la spec dans docs/spec.md (critères d'acceptation numérotés)
        │  « Écrire les tests de la spec »
        ▼
 2. @Testeur-QA    écrit les tests dans tests.js → ils sont ROUGES (le code n'existe pas encore)
        │  « Coder jusqu'au vert »
        ▼
 3. @Dev-JS        code dans app.js jusqu'à ce que TOUS les tests soient VERTS
        │  « Contre-vérifier »
        ▼
 4. @Testeur-QA    relance tout, puis tests de mutation sur le code ajouté
        │
        ├─ un test rouge ou un mutant survivant → retour à @Dev-JS (étape 3)
        └─ tout vert et tous les mutants tués  → terminé ✔
```

**La boucle Dev ⇄ Testeur** : tant qu'un test est rouge ou qu'une mutation survit, le relais repart vers @Dev-JS.

Si un critère de la spec est ambigu ou impossible à tester, le Testeur-QA renvoie à @Analyste-PO au lieu d'inventer une règle.

## La spec : `docs/spec.md`

- Une section par demande, numérotée `B1`, `B2`… (B = besoin), ajoutée à la suite des précédentes.
- Chaque critère d'acceptation a un code (`B1.1`, `B1.2`…), une forme *Étant donné / Quand / Alors*, et des **valeurs exactes** (nombres, messages).
- Chaque critère est couvert par au moins un test, dont le nom cite le code du critère.

## Lancer les tests

Depuis la racine du projet :

```
node .github/skills/lancer-les-tests/lancer-tests.mjs
```

Test de mutation (sur une copie : `app.js` n'est pas modifié) :

```
node .github/skills/lancer-les-tests/lancer-tests.mjs --muter "texte exact de app.js" "texte muté"
```

Détails : `.github/skills/lancer-les-tests/SKILL.md`. On peut aussi ouvrir `index.html` dans un navigateur : le panneau « Auto-tests » affiche le même résultat.

## Le contrat entre `app.js` et `tests.js`

- `tests.js` est chargé après `app.js` et ne lit l'application qu'à travers **`window.TaskFlow`** (objet gelé, construit dans la section JS 24 de `app.js`).
- Le Testeur-QA peut demander une nouvelle fonction en l'ajoutant à la liste lue dans `window.TaskFlow` au début de `tests.js`. Tant que le Dev-JS ne l'a pas exposée, le test est rouge.
- Le Dev-JS expose toute nouvelle fonction testée dans JS 24, dans la bonne zone (Données, Règles ou UI).
- On teste en priorité les **fonctions pures** (zone 2) : même entrée, même sortie, données gelées par `gelerEnProfondeur`.

## Règles pour tous

1. **Rester dans son rôle et dans ses fichiers** (voir le tableau).
2. **Ne jamais casser l'existant** : les 12 tests d'origine (T1 à T12) doivent rester verts.
3. **Ne jamais supprimer ni affaiblir un test** pour obtenir du vert.
4. Garder la structure de `app.js` : 3 zones (1. Données · 2. Règles · 3. UI), sections `JS n`, sommaire en tête à jour.
5. Les règles métier sont des **fonctions pures** qui ne modifient jamais le tableau reçu (R4) ; les colonnes restent pilotées par `COLONNES`.
6. Messages à l'utilisateur en français, clairs, qui expliquent le refus et ce qu'il faut faire.

## Git : une photo du projet après chaque relais

Chaque agent commite **uniquement ses propres fichiers** à la fin de son relais, avec un message court qui dit *quoi* et *qui* :

| Relais | Exemple de message |
|---|---|
| Analyste-PO | `docs(dependances) : spec relue, 7 critères` |
| Testeur-QA (tests d'abord) | `test(dependances) : 7 tests écrits, rouges` |
| Dev-JS | `feat(dependances) : implémentation, 25/25` |
| Testeur-QA (contre-vérification) | `feat(dependances) : contre-vérifié, mutation tuée` |

`dependances` est le **sujet** de la demande, choisi par l'Analyste-PO dans la spec (un mot, en minuscules, sans accent).
Pas de `git push`, pas de réécriture d'historique (`--amend`, `rebase`, `reset --hard`).

## Terminé, c'est quand ?

- Tous les critères de la demande ont au moins un test.
- Tous les tests sont verts (anciens et nouveaux), sans erreur JavaScript.
- Au moins un mutant par critère a été essayé, et tous ont été tués.
- Chaque relais a fait son commit.
