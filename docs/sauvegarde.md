# Sauvegarde et chargement

Les données sont enregistrées dans le `localStorage` du navigateur, sous la clé `taskflow`, **après chaque modification** (à la fin de `rendre()`).

## Enveloppe versionnée

On n'enregistre pas un tableau nu mais une enveloppe qui indique sa version (`VERSION_SAUVEGARDE = 3`) :

```json
{
  "version": 3,
  "tickets": [ ... ],
  "projets": [{ "id": 1, "nom": "...", "tickets": [1, 2], "ordreManuel": null, "notesImport": {}, "journal": [] }],
  "projetActif": 1,
  "compteurs": { "prochainTicket": 13, "prochainProjet": 2, "numerosAttribues": [ ... ] },
  "affichage": { "vue": "backlog", "utilisateur": "Camille", "tri": [ ... ], "filtres": { ... } }
}
```

Les tickets restent au modèle exact ; les projets listent les numéros de leurs tickets.

## Versions et migrations

| Version | Contenu | Migration |
|---|---|---|
| v1 | Tableau nu de tickets | Chaque champ manquant reçoit sa valeur par défaut (aucun `undefined`) ; statut → Backlog, points → `null` si absents |
| v2 | Enveloppe, sans champ `assigne` | Chaque ticket reçoit `assigne: null` ; les statuts sont conservés (un ticket « Terminé » reste « Terminé ») |
| v3 | Champ `assigne`, journal des déplacements, « Je suis » | Version actuelle |

## `charger(texte)` : le plan B

`charger()` **ne lève jamais d'exception**. Il renvoie `{ origine, donnees }` :

| Situation | `origine` | Résultat |
|---|---|---|
| Rien d'enregistré | `premier-lancement` | Projet de démonstration |
| Sauvegarde valide v3 | `sauvegarde` | Données restaurées |
| Ancien tableau nu | `migration-v1` | Données migrées |
| Ancienne enveloppe v2 | `migration-v2` | Données migrées |
| JSON illisible ou structure abîmée | `illisible` | Démonstration + message ; copie de la donnée abîmée dans `taskflow-illisible` |
| Version plus récente que l'application | `version-inconnue` | Démonstration + message ; copie gardée à part |

Si l'affichage d'une sauvegarde échoue malgré tout au démarrage, l'application repart de la démonstration : **jamais d'écran blanc**.

Un aller-retour sauvegarde → chargement restitue à l'identique : tickets, ordre personnalisé, filtres, vue, journal, nom de l'utilisateur.

## Réinitialisations

- **Réinitialiser le projet** : vider le projet, ou revenir aux 12 tickets de démonstration.
- **Réinitialiser la démo** : efface tous les projets, tickets, filtres, tri, journal et nom (« Je suis »), ainsi que la sauvegarde. Un export préalable est proposé.
