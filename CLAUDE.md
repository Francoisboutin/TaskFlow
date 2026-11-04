# CLAUDE.md · TaskFlow

Les règles du projet sont dans `AGENTS.md` (rôles, fichiers autorisés, circuit d'une demande, conventions de commit) :

@AGENTS.md

## Dans Claude Code

Les trois agents existent en sous-agents dans `.claude/agents/` : **analyste-po**, **testeur-qa**, **dev-js** (copies des fiches Copilot de `.github/agents/`, à garder alignées). Leurs outils sont appliqués par Claude Code : l'Analyste-PO n'a pas `Bash`.

Il n'y a pas de boutons de relais : **la session principale orchestre** une demande ainsi, et fait les commits elle-même :

1. **analyste-po** écrit la section `B<n>` de `docs/spec.md` (6 à 8 critères) → vérifier que seul `docs/` a changé → commit `docs(<sujet>) : …`.
2. **testeur-qa** (mode 1) écrit au moins 6 tests, vus rouges → vérifier que seul `tests.js` a changé → commit `test(<sujet>) : …`.
3. **dev-js** code jusqu'au vert → **refuser tout diff qui touche `tests.js` ou `docs/`** (`git diff --name-only`) → commit `feat(<sujet>) : implémentation, N/N`.
4. **testeur-qa** (mode 2) contre-vérifie : tests, mutations (et non-régression), sauvegarde d'hier → commit `feat(<sujet>) : contre-vérifié, …`. Un test rouge ou un mutant survivant : retour à l'étape 3 (ou 1 si la spec est en cause).

Chaque commit indique le rôle (`Rôle : <agent>`). Une fonctionnalité n'est commencée qu'une fois la précédente validée.
