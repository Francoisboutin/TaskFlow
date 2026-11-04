---
name: fonctionnalite-taskflow
description: Livrer une fonctionnalité ou un audit dans TaskFlow selon le relais spec → tests rouges → code vert → contre-vérification. Explique où écrire la spec, comment écrire un auto-test dans tests.js, comment exposer une fonction dans window.TaskFlow, et comment lancer les tests et les tests de mutation en ligne de commande.
---

# Fonctionnalité TaskFlow

Ce skill sert aux 3 agents (Analyste-PO, Testeur-QA, Dev-JS). Les rôles et les fichiers autorisés sont dans `AGENTS.md` : chacun ne fait que **sa** partie du relais.

## 1. Le relais

| Étape | Agent | Fichier | Résultat attendu | Commit |
|---|---|---|---|---|
| 1 | Analyste-PO | `docs/spec.md` | critères `B<n>.<k>` testables | `docs(<sujet>) : spec relue, N critères` |
| 2 | Testeur-QA | `tests.js` | nouveaux tests **rouges**, anciens verts | `test(<sujet>) : N tests écrits, rouges` |
| 3 | Dev-JS | `app.js` | **tous** les tests verts | `feat(<sujet>) : implémentation, X/X` |
| 4 | Testeur-QA | (`tests.js`) | tout vert, mutants tués | `feat(<sujet>) : contre-vérifié, mutation tuée` |

Un test rouge ou un mutant survivant à l'étape 4 → retour à l'étape 3.

## 2. Lancer les tests

Depuis la racine du projet (Node et Chrome ou Edge suffisent, rien à installer) :

```
node .github/skills/fonctionnalite-taskflow/lancer-tests.mjs
```

- Chaque test s'affiche `✔ VERT` ou `✘ ROUGE` (avec ce qui était attendu et ce qui a été obtenu), puis le bilan.
- Code de sortie : `0` si tout est vert, `1` sinon.
- « aucun test affiché » = la page a planté : lire les lignes `✘ ERREUR JS`.
- Navigateur introuvable : définir `CHROME_PATH` (PowerShell : `$env:CHROME_PATH = "C:\...\chrome.exe"`).

## 3. Test de mutation (contre-vérification)

Un **mutant** est une petite erreur volontaire dans `app.js`. Si un test la détecte, le mutant est **tué** ; s'il **survit**, il manque un test.

```
node .github/skills/fonctionnalite-taskflow/lancer-tests.mjs --muter "texte exact de app.js" "texte muté"
```

- Appliqué sur une **copie temporaire** : le vrai `app.js` n'est jamais modifié.
- Le texte doit apparaître **exactement une fois** dans `app.js` (sinon code `2` : ajouter du contexte).
- Code de sortie : `0` = tué, `1` = survivant, `2` = mutation impossible.

| Mutation type | Exemple |
|---|---|
| Inverser une comparaison | `>=` → `>`, `===` → `!==` |
| Changer une limite | `JOURNAL_MAX = 10` → `JOURNAL_MAX = 9` |
| Supprimer une condition | `if (a && b)` → `if (a)` |
| Forcer un résultat | `return { ok: false, …` → `return { ok: true, …` |
| Supprimer une correction | `x = corriger(x);` → `x = x;` |

## 4. Écrire un auto-test dans `tests.js`

Les tests sont des objets du tableau `AUTO_TESTS`. Modèle :

```js
{ code: 'T13', groupe: 'b1', nom: 'B1.1 · ce que le test garantit', executer() {
  const depart = gelerEnProfondeur([ticketDeTest(1, COLONNE_BACKLOG.id, 3)]);   // données dédiées, gelées
  const resultat = deplacerTicket(depart, 1, COLONNES[1].id);
  const reussi = resultat.ok === true && resultat.tickets[0].statut === COLONNES[1].id;
  return { reussi, detail: reussi ? 'ce qui a été vérifié' : `Obtenu : ${JSON.stringify(resultat)}` };
} },
```

- **Codes** à la suite des existants ; le **nom** cite le critère (`B1.1`) ou l'audit (`Audit`).
- **Groupe** : une clé par demande, avec son titre dans `GROUPES_DE_TESTS`.
- **Données** : toujours dédiées et gelées (`gelerEnProfondeur`, `ticketDeTest`) ; jamais l'état réel ni la sauvegarde.
- **Limites** lues dans `COLONNES` (`COLONNE_LIMITEE.wip`…), pas de nombre en dur : les tests suivent les données.
- **Un test qui lève une exception est compté rouge** : pour vérifier « sans planter », c'est suffisant.
- **Un nouveau test vert avant le code ne prouve rien** : le renforcer (sauf en audit, où un test vert documente un comportement déjà correct).

## 5. Le contrat `app.js` ⇄ `tests.js`

`tests.js` ne lit l'application qu'à travers `window.TaskFlow` (section **JS 24** de `app.js`, objet gelé) :

- le **Testeur-QA** ajoute le nom voulu dans la liste lue en haut de `tests.js` et fait échouer proprement le test si la fonction manque :
  ```js
  if (typeof nouvelleFonction !== 'function') return { reussi: false, detail: 'nouvelleFonction() absente de window.TaskFlow' };
  ```
- le **Dev-JS** l'ajoute dans `window.TaskFlow`, dans le groupe de sa zone (Données, Règles, UI).

## 6. Repères dans `app.js`

| Zone | Sections | Contenu |
|---|---|---|
| 1 · Données | JS 1 | `TYPES`, `PRIORITES`, `POINTS`, `COLONNES`, `TICKETS_INITIAUX` |
| 2 · Règles | JS 2 à 5 | `deplacerTicket`, `modifierTicket`, `calculerStats`, journal, `parserCSV`, `importerTickets` (fonctions pures) |
| 3 · UI | JS 6 à 24 | `etat`, `rendre()`, fenêtres, Kanban, sauvegarde (`charger`), démarrage, `window.TaskFlow` |

Règles métier de référence : `docs/regles-metier.md` (R1 à R5) et `docs/import-export.md` (I1 à I5).
