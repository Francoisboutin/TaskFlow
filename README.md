**▶ Démo en ligne : [https://francoisboutin.github.io/taskflow/](https://francoisboutin.github.io/taskflow/)**

# TaskFlow

Backlog et tableau Kanban pour une équipe agile, en HTML, CSS et JavaScript, sans framework ni serveur. Les données restent dans le navigateur (`localStorage`) : en ligne, l'application démarre avec un projet de démonstration de 12 tickets.

## Ce que fait l'application

- **Backlog** : liste triable (tri multiple), recherche tolérante aux fautes, filtres, ordre personnalisé par glisser-déposer, import / export CSV et JSON avec rapport des corrections.
- **Kanban** : colonnes Backlog → À faire → En cours → En revue → Terminé, limites WIP, Definition of Ready, passage obligé par « En revue », annulation des 10 derniers déplacements.
- **Sprints** : capacité en points, jauge, glisser-déposer, burndown en SVG, clôture ; au démarrage d'un sprint, ses tickets passent « À faire » ; pendant un sprint, le Kanban n'affiche que ses tickets.
- **Dépendances** : « bloqué par » d'autres tickets, cycles refusés avec le cycle affiché, badge 🔒 déroulant.
- **Échéances** : badges « En retard » et « J-2 », tri et filtre par urgence, vue calendrier mensuelle.
- **Auto-tests** : 71 tests des règles métier s'exécutent à chaque chargement (panneau en bas de page).

## Lancer en local

Ouvrir `index.html` dans un navigateur : aucune installation. Pour tester l'affichage à une autre date : `index.html?aujourdhui=2026-02-27`.

Lancer les tests en ligne de commande (Node.js et Chrome ou Edge) :

```
node .github/skills/fonctionnalite-taskflow/lancer-tests.mjs
```

## Organisation

| Fichier | Rôle |
|---|---|
| `index.html` | structure de la page |
| `style.css` | design, thèmes clair / sombre |
| `app.js` | 1. Données · 2. Règles (fonctions pures) · 3. Interface |
| `tests.js` | auto-tests |
| `docs/` | spécifications ; `docs/spec.md` : une section par demande, avec ses critères d'acceptation |

Le projet est développé par trois agents (Analyste-PO, Testeur-QA, Dev-JS) selon le circuit : spécification → tests rouges → code jusqu'au vert → contre-vérification par tests de mutation. Les règles sont dans [`AGENTS.md`](AGENTS.md) ; les fiches des agents dans `.github/agents/` (GitHub Copilot) et `.claude/agents/` (Claude Code).
