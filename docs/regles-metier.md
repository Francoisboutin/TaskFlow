# Règles métier

Toutes ces règles sont des **fonctions pures** de la zone 2 de `app.js`. Elles s'appliquent partout de la même façon : boutons ◀ ▶, glisser-déposer, formulaire, import, annulation.

## Déplacer un ticket : `deplacerTicket(tickets, id, versStatut)`

Renvoie `{ ok: true, tickets }` (nouveau tableau) ou `{ ok: false, erreur }`.

Contrôles, dans cet ordre :

1. Liste invalide → `Liste de tickets invalide`.
2. Ticket absent → `Ticket introuvable (id N)` (sans planter, même sur une liste vide).
3. Colonne inconnue → `Colonne inconnue (« x »)`.
4. Déjà dans la colonne → accepté, copie du tableau.
5. **R2**, puis **R5**, puis **R1** (ci-dessous).
6. **R4** : succès.

### R1 · Limite WIP

Une colonne qui a une limite `wip` n'accepte pas de ticket supplémentaire quand elle contient déjà `wip` tickets ou plus.

- Message : `WIP atteint (n/wip)`, par exemple `WIP atteint (3/3)`.
- « En cours » : 3 au maximum. « En revue » : 2 au maximum.
- Une colonne déjà en dépassement (ex. 4/3 après un import ancien) refuse tout nouvel ajout.
- Une colonne est signalée **pleine** dès que `nombre >= wip`.

### R2 · Definition of Ready

Un ticket **non estimé** (`points: null`) ne quitte pas le Backlog.

- Message : `Definition of Ready : le ticket #N n'est pas estimé`.
- Dans l'autre sens : un ticket hors du Backlog ne peut pas redevenir « non estimé » (`modifierTicket`).

### R3 · Boutons ◀ ▶ du Kanban

Chaque carte a un bouton vers la colonne voisine de gauche et de droite. Le bouton est absent au bord du tableau. Au clavier : poignée + flèches gauche / droite. Chaque déplacement passe par `deplacerTicket`.

### R4 · Immutabilité

Le tableau reçu n'est **jamais** modifié : un nouveau tableau est renvoyé, avec un nouvel objet pour le ticket déplacé. Les tests vérifient R4 avec des données gelées (`Object.freeze`).

### R5 · Passage obligé

Une colonne qui a une propriété `depuis` n'accepte que les tickets venant de ces colonnes.

- « Terminé » n'accepte que les tickets venant de « En revue ».
- Message : `Passage interdit : « Terminé » n'accepte que les tickets venant de « En revue »`.

### Messages affichés à l'utilisateur

Les erreurs brutes sont complétées par un conseil (`expliquerRefus`, `expliquerRefusFormulaire`), par exemple :
« WIP atteint (3/3) : la colonne « En cours » accepte au maximum 3 tickets. Terminez ou déplacez un ticket « En cours » avant d'en ajouter un autre. »

## Modifier un ticket : `modifierTicket(tickets, id, changements)`

- `id` et `creeLe` ne changent jamais.
- Les nouveaux champs sont validés comme pour une création.
- Un changement de statut passe par `deplacerTicket` (R1, R2, R5 s'appliquent).
- Renvoie `{ ok: true, tickets, ticket }` ou `{ ok: false, erreurs: { champ: message } }`.

## Statistiques : `calculerStats(tickets)`

Renvoie `{ total, points, nonEstimes, pointsTermines, avancement, colonnes[] }` ; chaque colonne : `{ id, titre, wip, nombre, points, nonEstimes, pourcentage, plein }`.

- **Avancement** = points de la dernière colonne (« Terminé ») / points de tous les tickets, arrondi en %.
- Une liste vide donne **0 % partout, jamais `NaN`**.
- Un seul passage sur la liste.

## Journal des déplacements et « Annuler »

Un **déplacement** est un changement de colonne, ou un changement de place dans la liste (même colonne).

- Le journal garde les **10 derniers** déplacements du projet (`JOURNAL_MAX = 10`), du plus récent au plus ancien. Il est sauvegardé : il survit à un rechargement.
- **Annuler le plus récent** (bouton, notification ou `Ctrl+Z`) : si rien n'a changé depuis, l'état d'avant est remis **exactement** (tickets et ordre).
- **Annuler un déplacement plus ancien** : seul ce ticket revient ; les autres restent où ils sont. Si ce même ticket a bougé depuis, ses déplacements plus récents sont annulés avec (tout ou rien).
- Une annulation est une **restauration** : R1 (WIP) et R2 restent vérifiées, mais R5 ne s'applique pas (un ticket sorti de « Terminé » par erreur peut y revenir).
- Si la colonne d'origine est pleine depuis, l'annulation est refusée et rien ne change.
- Le ticket retrouve sa place d'avant dans l'ordre personnalisé (à côté de son voisin d'alors).
