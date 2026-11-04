# TaskFlow · Spécifications

TaskFlow est une application web de gestion de backlog et de tableau Kanban pour une équipe agile.
Elle fonctionne entièrement dans le navigateur : pas de serveur, pas de compte. Les données sont enregistrées dans le `localStorage` du navigateur.

Ce dossier décrit **ce que l'application doit faire**. Le code doit respecter ces spécifications, et les auto-tests (`tests.js`) les vérifient.

## Sommaire

| Document | Contenu |
|---|---|
| [modele-de-donnees.md](modele-de-donnees.md) | Ticket, colonnes du Kanban, projets, valeurs autorisées |
| [regles-metier.md](regles-metier.md) | Règles R1 à R5, validation d'un ticket, statistiques, journal et « Annuler » |
| [import-export.md](import-export.md) | Import CSV / JSON (règles I1 à I5), export |
| [sauvegarde.md](sauvegarde.md) | Sauvegarde versionnée, migrations v1 → v2 → v3, plan B |
| [interface.md](interface.md) | Vues Backlog et Kanban, recherche, filtres, tri, accessibilité |
| [auto-tests.md](auto-tests.md) | Liste des tests T1 à T12 et ce que chacun garantit |
| `spec.md` | Les nouvelles demandes (B1, B2…) et leurs critères d'acceptation, écrites par l'Analyste-PO (créé à la première demande) |

## Architecture des fichiers

```
taskflow/
├─ index.html   structure de la page (HTML)
├─ style.css    design, thèmes clair / sombre, animations
├─ app.js       1. Données · 2. Règles · 3. UI
├─ tests.js     auto-tests (panneau « Auto-tests »)
├─ docs/        ces spécifications (dont spec.md)
├─ AGENTS.md    règles communes aux agents
└─ .github/     agents/ (fiches des 3 agents) · skills/fonctionnalite-taskflow/
```

### Rôle de chaque fichier

- **index.html** : uniquement la structure. Les listes (tickets, cartes, filtres, tests…) y sont vides ; le JavaScript les remplit à partir des données. Seule exception : une petite amorce dans `<head>` applique le thème mémorisé avant le premier affichage (évite un éclair de la mauvaise couleur).
- **style.css** : chargé dans `<head>`, avant l'affichage. Toutes les couleurs passent par des variables CSS ; le thème sombre redéfinit ces variables.
- **app.js** : organisé en 3 zones.
  - **Zone 1 · Données** (JS 1) : types, priorités, points, `COLONNES`, tickets de démonstration, constantes.
  - **Zone 2 · Règles** (JS 2 à 5) : outils et **fonctions pures** (`deplacerTicket`, `modifierTicket`, `calculerStats`, `parserCSV`, `importerTickets`, journal). Aucune ne touche au HTML.
  - **Zone 3 · UI** (JS 6 à 24) : état de l'application, affichage (`rendre()`), actions de l'utilisateur, sauvegarde, démarrage.
- **tests.js** : chargé après `app.js`. Il lit les fonctions de l'application dans `window.TaskFlow` (objet gelé, exposé à la fin de `app.js`) et ne modifie ni l'état ni la sauvegarde.

### Principes

1. **Une seule source de données** (`etat`) et **une seule fonction d'affichage** (`rendre()`). Le Backlog et le Kanban lisent le même tableau de tickets.
2. **Les colonnes sont pilotées par les données** : l'interface boucle sur `COLONNES`, aucune colonne n'est écrite en dur.
3. **Les règles métier sont des fonctions pures** : même entrée → même sortie, le tableau reçu n'est jamais modifié (R4).
4. **Rien n'est fait en douce** : chaque refus, correction ou rejet est expliqué à l'utilisateur.

## Répartition des rôles (agents)

| Fichier / dossier | Responsable |
|---|---|
| `app.js` | Dev-JS |
| `tests.js` | Testeur-QA |
| `docs/` | Analyste-PO |

Circuit d'une demande : Analyste-PO (spec) → Testeur-QA (tests rouges) → Dev-JS (code jusqu'au vert) → Testeur-QA (contre-vérification par mutations). Détails dans [AGENTS.md](../AGENTS.md).
