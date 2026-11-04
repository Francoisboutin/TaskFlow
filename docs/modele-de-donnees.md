# Modèle de données

## Ticket

Un ticket a **exactement** ces 8 champs, dans cet ordre (`construireTicket()` garantit l'ordre et l'absence de champ en trop) :

| Champ | Type | Valeurs autorisées | Remarques |
|---|---|---|---|
| `id` | entier | 1 à 999 999, unique | Ne change jamais après création |
| `titre` | texte | 3 à 80 caractères (après suppression des espaces autour) | Obligatoire |
| `type` | texte | `story`, `bug`, `tache` | Libellés : Story, Bug, Tâche |
| `priorite` | entier | `1`, `2`, `3` | 1 = Haute, 2 = Moyenne, 3 = Basse |
| `points` | entier ou `null` | `1`, `2`, `3`, `5`, `8`, `13`, ou `null` | `null` = « Non estimé » |
| `statut` | texte | un `id` de `COLONNES` | Voir ci-dessous |
| `creeLe` | texte | date `AAAA-MM-JJ` valide | Ne change jamais après création |
| `assigne` | texte ou `null` | 1 à 40 caractères, ou `null` | `null` = personne |

Un ticket qui ne respecte pas ce modèle ne peut pas être enregistré (`validerTicket()` renvoie un message par champ en erreur).

## Colonnes du Kanban

Les statuts d'un ticket **sont** les colonnes du Kanban (une seule source de vérité : `COLONNES`).

| Ordre | `id` | Titre | Limite WIP | Contrainte d'entrée |
|---|---|---|---|---|
| 1 | `backlog` | Backlog | — | — |
| 2 | `afaire` | À faire | — | — |
| 3 | `encours` | En cours | **3** | — |
| 4 | `enrevue` | En revue | **2** | — |
| 5 | `termine` | Terminé | — | Uniquement depuis « En revue » (`depuis: ["enrevue"]`) |

- La **1re colonne** est le Backlog : un ticket non estimé ne la quitte pas (R2).
- La **dernière colonne** sert au calcul de l'avancement.
- Ajouter, retirer ou renommer une colonne se fait **uniquement** dans `COLONNES` : l'interface, les filtres, les statistiques et les tests suivent.

## Projet

L'application gère plusieurs projets ; un seul est actif à la fois.

| Champ | Description |
|---|---|
| `id` | Numéro du projet |
| `nom` | 3 à 60 caractères |
| `tickets` | Tableau de tickets |
| `ordreManuel` | Ordre personnalisé des tickets (liste d'`id`), ou `null` si la liste suit le tri |
| `notesImport` | Corrections faites à l'import, par ticket |
| `journal` | Les 10 derniers déplacements (voir [regles-metier.md](regles-metier.md#journal-des-déplacements-et-annuler)) |

Les numéros de tickets sont uniques **pour toute l'application** : un numéro déjà attribué (même supprimé) n'est pas réutilisé.

## Projet de démonstration

Au premier lancement, l'application crée le projet **« Refonte de l'espace client »** avec 12 tickets (`TICKETS_INITIAUX`), dont 2 non estimés, répartis dans les colonnes.

## Préférences mémorisées

| Clé `localStorage` | Contenu |
|---|---|
| `taskflow` | Sauvegarde des données (voir [sauvegarde.md](sauvegarde.md)) |
| `taskflow-illisible` | Copie d'une sauvegarde abîmée, gardée à part |
| `taskflow-theme` | `light` ou `dark` |
| `taskflow-vue` | `backlog` ou `kanban` |
| `taskflow-panneaux-reduits` | Panneaux repliés |
| `taskflow-guide-vu` | Guide de première visite déjà fermé |
