# Auto-tests

Les tests sont dans `tests.js`. Ils s'exécutent **à chaque chargement de la page** et s'affichent dans le panneau « Auto-tests ». Le bouton « Relancer les tests » les rejoue.

Principes :
- Chaque test utilise **son propre jeu de données**, gelé avec `Object.freeze` : toute modification du tableau reçu fait échouer le test (R4).
- Les tests ne touchent ni aux tickets de l'utilisateur ni à sa sauvegarde.
- Les limites sont lues dans `COLONNES` : les tests suivent les données.
- Un test qui plante est compté comme échoué.
- `tests.js` lit les fonctions de l'application dans `window.TaskFlow`.

**Critère de validation : tous les tests au vert (12/12 réussis).**

## Règles métier du Kanban

| Code | Vérifie |
|---|---|
| T1 | Déplacement valide (Backlog → À faire) : `ok: true`, les autres tickets inchangés |
| T2 | Ticket non estimé bloqué vers toutes les autres colonnes (R2) |
| T3 | Limite WIP (R1) : juste sous la limite → accepté ; à la limite → colonne pleine ; un de plus → `WIP atteint (3/3)` ; colonne en dépassement → tout ajout refusé |
| T4 | Id inconnu ou liste vide : erreur « introuvable », sans planter |
| T5 | Tableau d'origine intact après 3 appels (accepté, refusé R2, refusé R1) (R4) |
| T6 | Statistiques d'une liste vide : 0 %, jamais `NaN` |

## Fichier piégé `backlog-import.csv`

| Code | Vérifie |
|---|---|
| T7 | Bilan « 6 importés · 0 rejeté » ; ligne 4 titre vide corrigé ; ligne 7 priorité 4 → 3 ; ligne 6 nouvel id ; colonne « En cours » pleine → colonne précédente |
| T8 | Guillemets respectés (I1) ; « Story » et « ? » simplement normalisés (I2) ; second id 21 renuméroté, aucun id en double, aucun ticket écrasé (I4) |

## Sauvegarde et chargement

| Code | Vérifie |
|---|---|
| T9 | Premier lancement → démo ; `{oups` → démo sans exception ; structure abîmée ou version inconnue → démo ; aller-retour identique ; tableau v1 migré sans `undefined` |

## Demandes du Product Owner (phase 2)

| Code | Vérifie |
|---|---|
| T10 | Colonne « En revue » (WIP 2) placée entre « En cours » et « Terminé » ; « Terminé » seulement depuis « En revue » (R5) |
| T11 | Sauvegarde v2 sans `assigne` migrée en v3 ; « Annuler » rend l'état d'avant, même après rechargement ; journal limité à 10 ; un changement de place s'annule aussi |
| T12 | Annuler n'importe lequel des 10 derniers déplacements : ticket seul, déplacements du même ticket ensemble, refus si colonne d'origine pleine, place d'avant retrouvée, retour dans « Terminé » autorisé |
