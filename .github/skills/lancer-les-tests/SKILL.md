---
name: lancer-les-tests
description: Lance les auto-tests de TaskFlow (tests.js) dans un navigateur sans interface et affiche chaque test en VERT ou ROUGE ; permet aussi un test de mutation sur une copie de app.js. À utiliser pour vérifier « rouge avant », « vert après » et la contre-vérification.
---

# Lancer les tests de TaskFlow

Les auto-tests vivent dans `tests.js` et s'exécutent dans la page (`index.html`). Ce skill les lance en ligne de commande, sans ouvrir de fenêtre, avec Chrome ou Edge.

Toutes les commandes se lancent **depuis la racine du projet**.

## 1. Lancer tous les tests

```
node .github/skills/lancer-les-tests/lancer-tests.mjs
```

- Affiche chaque test (`✔ VERT` / `✘ ROUGE` avec le détail de l'échec), les erreurs JavaScript éventuelles, puis le bilan.
- Code de sortie : `0` si tout est vert, `1` sinon.
- « aucun test affiché » signifie que la page a planté : lire les lignes `✘ ERREUR JS`.

## 2. Test de mutation

Un **mutant** est une petite erreur volontaire dans `app.js` (par exemple `>=` remplacé par `>`). Un bon jeu de tests doit la détecter : le mutant est alors **tué**. S'il **survit**, il manque un test.

```
node .github/skills/lancer-les-tests/lancer-tests.mjs --muter "texte exact de app.js" "texte muté"
```

- La mutation est appliquée sur une **copie temporaire** : le vrai `app.js` n'est jamais modifié.
- Le texte à muter doit apparaître **exactement une fois** dans `app.js` (sinon : code `2`, ajouter du contexte).
- Code de sortie : `0` = mutant tué, `1` = mutant survivant, `2` = mutation impossible.

### Mutations utiles

| Mutation | Exemple |
|---|---|
| Inverser une comparaison | `>=` → `>`, `<` → `<=`, `===` → `!==` |
| Changer une limite | `wip: 3` → `wip: 4`, `JOURNAL_MAX = 10` → `JOURNAL_MAX = 9` |
| Supprimer une condition | `if (a && b)` → `if (a)` |
| Renvoyer une valeur fixe | `return { ok: false, …` → `return { ok: true, …` |
| Supprimer un appel | `x = corriger(x);` → `x = x;` |

## Si le navigateur n'est pas trouvé

Indiquer son chemin dans la variable `CHROME_PATH`, par exemple sous PowerShell :

```
$env:CHROME_PATH = "C:\Program Files\Google\Chrome\Application\chrome.exe"
```
