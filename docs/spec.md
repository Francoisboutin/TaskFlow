# Spécifications des demandes

Une section par demande (B1, B2…). Chaque critère d'acceptation est couvert par au moins un test de `tests.js` dont le nom cite son code.

---

## B1 · Sprints et burndown

- **Sujet** : `sprints`
- **Demande** : « Sprints & burndown (Planifier). Créer un sprint : nom, dates, capacité en points. Y glisser des tickets, avec une jauge de capacité. Clôturer : le non-terminé revient au backlog. Burndown en SVG : restant vs ligne idéale. La règle qui piège : capacité atteinte pile, ticket non estimé, sprint d'un seul jour (division par zéro de la ligne idéale). Données : `sprints[]` · `ticket.sprintId`. »
- **Date** : 2026-11-04

### Pourquoi

L'équipe planifie son travail par sprints : elle s'engage sur un ensemble de tickets qui tient dans sa capacité, suit chaque jour les points restants par rapport à un rythme idéal, et remet au backlog ce qui n'a pas été terminé.

### Données

**Sprint** (rangé dans le projet : `projet.sprints`, un tableau, vide pour un nouveau projet) :

| Champ | Valeur |
|---|---|
| `id` | entier ≥ 1, unique dans le projet (plus grand id + 1 ; 1 pour le premier) |
| `nom` | texte de 3 à 40 caractères (espaces autour retirés) |
| `debut`, `fin` | dates `AAAA-MM-JJ`, `fin` ≥ `debut` |
| `capacite` | entier de 1 à 999 (points) |
| `statut` | `'ouvert'` ou `'cloture'` |
| `releves` | objet `{ 'AAAA-MM-JJ': pointsRestants }` (voir B1.8) ; `{}` à la création |
| `bilan` | `null` tant que le sprint est ouvert ; à la clôture `{ engage, termine, restant }` |
| `clotureLe` | `null`, puis la date de clôture |

**Ticket** : un 9e champ, **`sprintId`**, placé après `assigne` : l'`id` du sprint du ticket, ou `null`.
Ordre des champs : `id, titre, type, priorite, points, statut, creeLe, assigne, sprintId`.

**Définitions**
- Un ticket est **dans un sprint ouvert** si son `sprintId` désigne un sprint du projet dont le `statut` est `'ouvert'`. Un `sprintId` qui désigne un sprint clôturé est un historique : le ticket est considéré **hors sprint** pour toutes les règles.
- **Terminé** = statut de la dernière colonne de `COLONNES` (« Terminé »).
- **Points engagés** d'un sprint ouvert = somme des points de ses tickets, **terminés compris**.
- **Points restants** = somme des points de ses tickets **non terminés**.
- **Nombre de jours** d'un sprint = jours calendaires de `debut` à `fin`, **bornes incluses** (un sprint qui commence et finit le même jour dure 1 jour). Le calcul ne dépend ni du fuseau horaire ni du changement d'heure.

### Règles et critères d'acceptation

Les fonctions décrites sont des **règles pures** (zone 2) : elles ne modifient jamais les tableaux reçus (R4) et renvoient des erreurs au lieu de lever des exceptions. Les messages sont à respecter mot pour mot (`␣:` = espace insécable avant les deux-points, comme dans le reste de l'application).

#### B1.1 · Créer un sprint — `creerSprint(sprints, donnees)`

Renvoie `{ ok: true, sprints, sprint }` (nouveau tableau) ou `{ ok: false, erreurs: { champ: message } }`.

| Code | Étant donné | Quand | Alors |
|---|---|---|---|
| B1.1a | aucun sprint | on crée « Sprint 1 », 2026-11-02 → 2026-11-13, capacité 20 | `ok: true` ; sprint `{ id: 1, nom: 'Sprint 1', debut, fin, capacite: 20, statut: 'ouvert', releves: {}, bilan: null, clotureLe: null }` ; le tableau reçu est intact |
| B1.1b | des sprints d'id 1 et 4 | on crée un sprint | son id vaut 5 |
| B1.1c | — | nom « S1 » (2 caractères) ou de 41 caractères | erreur `nom` : `Le nom du sprint fait de 3 à 40 caractères.` |
| B1.1d | — | `debut` ou `fin` invalide (« 2026-02-30 », vide) | erreur `debut` : `La date de début doit être au format AAAA-MM-JJ.` / erreur `fin` : `La date de fin doit être au format AAAA-MM-JJ.` |
| B1.1e | — | fin 2026-11-01 avant début 2026-11-02 | erreur `fin` : `La fin ne peut pas précéder le début.` |
| B1.1f | — | sprint de 32 jours (2026-11-01 → 2026-12-02) | erreur `fin` : `Un sprint dure au plus 31 jours.` ; 31 jours (→ 2026-12-01) est accepté |
| B1.1g | — | capacité 0, 1000, 2.5 ou « abc » | erreur `capacite` : `La capacité est un nombre entier de points, de 1 à 999.` ; 1 et 999 sont acceptés |
| B1.1h | — | début = fin (sprint d'un seul jour) | accepté |

#### B1.2 · Nombre de jours — `nombreDeJours(debut, fin)`

| Code | Quand | Alors |
|---|---|---|
| B1.2a | 2026-11-04 → 2026-11-04 | 1 |
| B1.2b | 2026-03-27 → 2026-03-31 (passage à l'heure d'été en Europe le 29) | 5 |
| B1.2c | 2026-10-23 → 2026-10-27 (retour à l'heure d'hiver le 25) | 5 |
| B1.2d | 2028-02-27 → 2028-03-01 (année bissextile) | 4 |

#### B1.3 · Mettre un ticket dans un sprint — `ajouterAuSprint(tickets, sprints, idTicket, idSprint)`

Renvoie `{ ok: true, tickets }` (nouveau tableau, seul le `sprintId` du ticket change) ou `{ ok: false, erreur }`.
Contrôles dans cet ordre : liste, ticket, sprint, sprint clôturé, déjà dans ce sprint, Definition of Ready, terminé, capacité.

| Code | Étant donné | Quand | Alors |
|---|---|---|---|
| B1.3a | sprint de capacité 20 avec 15 points engagés | on ajoute un ticket de 5 points | **accepté (capacité atteinte pile : 20/20)** |
| B1.3b | le même sprint à 15/20 | on ajoute un ticket de 8 points | refus `Capacité dépassée (23/20 points)` |
| B1.3c | sprint plein à 20/20 | on ajoute un ticket de 1 point | refus `Capacité dépassée (21/20 points)` |
| B1.3d | ticket #7 non estimé | on l'ajoute | refus `Definition of Ready␣: le ticket #7 n’est pas estimé` (même message que R2) |
| B1.3e | ticket #3 dans la dernière colonne | on l'ajoute | refus `Le ticket #3 est déjà terminé` |
| B1.3f | sprint clôturé | on y ajoute un ticket | refus `Sprint clôturé␣: on ne peut plus le modifier` |
| B1.3g | ticket ou sprint inexistant | on ajoute | refus `Ticket introuvable (id 99)` / `Sprint introuvable (id 99)` |
| B1.3h | ticket déjà dans ce sprint, sprint plein | on l'ajoute de nouveau | accepté, rien ne change (il n'est pas compté deux fois) |
| B1.3i | ticket de 5 points dans le sprint ouvert A | on l'ajoute au sprint B | accepté : il quitte A (A libère 5 points) |
| B1.3j | ticket dont le `sprintId` désigne un sprint clôturé | on l'ajoute à un sprint ouvert | accepté (il était hors sprint) |
| B1.3k | sprint de 13 points avec un ticket terminé de 8 points | on ajoute 8 points | refus `Capacité dépassée (16/13 points)` : les tickets terminés comptent dans l'engagement |
| B1.3l | liste contenant un élément vide | on ajoute | refus `Liste de tickets invalide`, sans exception |

#### B1.4 · Sortir un ticket d'un sprint — `retirerDuSprint(tickets, sprints, idTicket)`

| Code | Étant donné | Quand | Alors |
|---|---|---|---|
| B1.4a | ticket dans un sprint ouvert | on le retire | `ok: true`, son `sprintId` vaut `null`, les autres tickets sont intacts |
| B1.4b | ticket #4 hors sprint (ou dans un sprint clôturé) | on le retire | refus `Le ticket #4 n’est dans aucun sprint ouvert` |

#### B1.5 · Modifier un ticket d'un sprint ouvert — `modifierTicket(tickets, id, changements, sprints)`

Le 4e paramètre est facultatif : sans lui, `modifierTicket` se comporte comme avant.

| Code | Étant donné | Quand | Alors |
|---|---|---|---|
| B1.5a | ticket de 3 points dans un sprint à 18/20 | ses points passent à 5 | accepté (20/20, pile) |
| B1.5b | le même | ses points passent à 8 | erreur `points` : `Capacité dépassée (23/20 points) dans le sprint « Sprint 1 ».` |
| B1.5c | ticket d'un sprint ouvert, colonne Backlog | ses points passent à « non estimé » | erreur `points` : `Definition of Ready␣: un ticket d’un sprint doit rester estimé.` |
| B1.5d | ticket d'un sprint | `changements` contient `sprintId: 99` | ignoré : le `sprintId` ne change que par B1.3, B1.4 et B1.6 |

#### B1.6 · Clôturer un sprint — `cloturerSprint(tickets, sprints, idSprint, aujourdhui)`

Renvoie `{ ok: true, tickets, sprints, retournes }` (`retournes` = ids des tickets remis au backlog) ou `{ ok: false, erreur }`.

| Code | Étant donné | Quand | Alors |
|---|---|---|---|
| B1.6a | sprint avec 2 tickets terminés (8 pts) et 2 non terminés « À faire » et « En cours » (5 pts) | on clôture le 2026-11-13 | chaque ticket non terminé passe en **colonne Backlog** avec `sprintId: null` ; les terminés gardent leur colonne et leur `sprintId` ; `retournes` liste les 2 ids |
| B1.6b | le même | — | sprint : `statut: 'cloture'`, `clotureLe: '2026-11-13'`, `bilan: { engage: 13, termine: 8, restant: 5 }` |
| B1.6c | le même | — | les tickets des autres sprints et hors sprint sont intacts ; les tableaux reçus aussi |
| B1.6d | sprint déjà clôturé | on le clôture | refus `Sprint clôturé␣: on ne peut plus le modifier` |
| B1.6e | sprint en cours (début ≤ aujourd'hui) | on clôture | un dernier relevé est noté à la date `min(aujourd'hui, fin)` avec les points restants avant clôture (5) |

#### B1.7 · Burndown — `calculerBurndown(sprint, tickets, aujourdhui)`

Renvoie `{ jours, engage, ideal, restant }`, avec `n` = nombre de jours du sprint :
- `jours` : les `n` dates du sprint ;
- `ideal` et `restant` : `n + 1` valeurs. L'indice 0 est le **début du premier jour**, l'indice `k` la **fin du jour k**.

| Code | Étant donné | Alors |
|---|---|---|
| B1.7a | sprint de 5 jours, 10 points engagés | `ideal` = `[10, 8, 6, 4, 2, 0]` |
| B1.7b | **sprint d'un seul jour**, 8 points engagés | `ideal` = `[8, 0]` ; aucune valeur `NaN` ni `Infinity` |
| B1.7c | sprint de 3 jours, 10 points | `ideal[1]` = 6.67 (arrondi à 2 décimales), `ideal[3]` = 0 |
| B1.7d | sprint sans ticket (0 point engagé) | `ideal` et `restant` ne contiennent que des 0 (et des `null` pour le futur), aucun `NaN` |
| B1.7e | sprint ouvert de 5 jours commencé le 2026-11-02, aujourd'hui 2026-11-04, relevés `{ '2026-11-02': 10, '2026-11-03': 7 }`, 4 points restants actuellement | `restant` = `[10, 10, 7, 4, null, null]` : début = engagé, puis relevé de chaque jour, **aujourd'hui = valeur actuelle**, futur = `null` |
| B1.7f | un jour passé sans relevé | il reprend la valeur du dernier relevé précédent (ou l'engagé s'il n'y en a aucun) |
| B1.7g | sprint ouvert pas encore commencé | `restant` = `[engagé, null, …, null]` |
| B1.7h | sprint clôturé | `engage` = `bilan.engage` ; les jours après `clotureLe` valent `null` |

`engage` : pour un sprint ouvert, les points engagés actuels ; pour un sprint clôturé, `bilan.engage`.

#### B1.8 · Relevé quotidien — `noterReleve(sprint, tickets, aujourdhui)`

| Code | Étant donné | Alors |
|---|---|---|
| B1.8a | sprint ouvert, début ≤ aujourd'hui ≤ fin | renvoie un **nouveau** sprint avec `releves[aujourdhui]` = points restants actuels ; le sprint reçu est intact |
| B1.8b | sprint pas commencé, terminé (après `fin`) ou clôturé | renvoie le sprint reçu, sans changement |

L'application note le relevé du jour de chaque sprint ouvert du projet affiché à chaque mise à jour de la page.

#### B1.9 · Dessin du burndown — `dessinerBurndown(burndown)`

Renvoie le code d'un `<svg>`.

| Code | Étant donné | Alors |
|---|---|---|
| B1.9a | burndown d'un sprint d'un seul jour, et burndown à 0 point engagé | le SVG ne contient ni `NaN` ni `Infinity` (pas de division par zéro, ni pour la ligne idéale ni pour l'échelle verticale) |
| B1.9b | n'importe quel burndown | le SVG contient la ligne idéale (élément de classe `bd-ideal`) et la ligne des restants (classe `bd-restant`), et un `<title>` qui le décrit pour les lecteurs d'écran |

#### B1.10 · Sauvegarde (version 4)

| Code | Étant donné | Quand | Alors |
|---|---|---|---|
| B1.10a | un projet avec sprints (ouvert et clôturé) et tickets avec `sprintId` | sauvegarde puis `charger()` | `origine: 'sauvegarde'` ; sprints (dont `releves`, `bilan`) et `sprintId` identiques |
| B1.10b | une sauvegarde **version 3** | `charger()` | `origine: 'migration-v3'` ; chaque ticket a `sprintId: null`, chaque projet `sprints: []` |
| B1.10c | sauvegardes v1 et v2 | `charger()` | toujours `migration-v1` / `migration-v2`, tickets à 9 champs (`sprintId: null`) |
| B1.10d | sauvegarde v4 abîmée : `sprintId` vers un sprint inexistant ; sprint aux dates invalides, à la capacité invalide ou de plus de 31 jours ; ticket non estimé dans un sprint ouvert | `charger()` | le sprint invalide est écarté ; ces tickets ont `sprintId: null` ; rien ne plante |
| B1.10e | une sauvegarde version 5 | `charger()` | `origine: 'version-inconnue'` |

#### B1.11 · Import et export

| Code | Quand | Alors |
|---|---|---|
| B1.11a | on exporte en CSV ou JSON | les colonnes restent `id, titre, type, priorite, points, statut, creeLe, assigne` : pas de `sprintId` |
| B1.11b | on importe un fichier qui contient une colonne `sprintId` | les tickets importés ont `sprintId: null` ; la colonne est signalée « hors du modèle, ignorée » |

#### B1.12 · Interface (vérifiée à la main)

- Une section **« Sprints »** sous les vues Backlog / Kanban : liste des sprints du projet, bouton **« + Nouveau sprint »** (fenêtre : nom, début, fin, capacité, avec les erreurs de B1.1 sous chaque champ).
- Pour le sprint affiché : dates, nombre de jours, **jauge de capacité** (`engagé / capacité`, barre qui ne dépasse jamais 100 %, état « pile » et « dépassée » distincts), liste « Dans le sprint » et liste « Tickets disponibles ».
- **Glisser-déposer** un ticket d'une liste à l'autre ; boutons équivalents pour le clavier. Un refus (capacité, non estimé, terminé) est expliqué par une notification.
- Bouton **« Clôturer le sprint »** avec une fenêtre de confirmation qui annonce les tickets qui retournent au backlog.
- **Burndown SVG** : ligne idéale en pointillés, ligne des restants, légende, et un résumé lisible par un lecteur d'écran.
- Réinitialiser le projet (vider ou démo) supprime aussi ses sprints ; un nouveau projet n'a aucun sprint.

### Hors périmètre

- Modifier ou supprimer un sprint après sa création ; rouvrir un sprint clôturé.
- Exporter / importer les sprints.
- Annuler (Ctrl+Z) une clôture ou un ajout au sprint : ce ne sont pas des déplacements de colonne.
- Interdire les sprints qui se chevauchent dans le temps.

### Impacts sur l'existant

- **Modèle de ticket** : 9 champs au lieu de 8. Les tests **T9** et **T11** qui vérifient la liste exacte des champs doivent attendre `…, assigne, sprintId`.
- **Sauvegarde** : version 3 → 4 (`VERSION_SAUVEGARDE = 4`) ; la v3 devient une migration (B1.10b).
- **Clôture** : remettre un ticket dans la colonne Backlog n'est pas noté au journal des déplacements ; une annulation ultérieure qui le concerne est refusée proprement (« a changé de colonne depuis »), comme aujourd'hui.
- Les règles R1 à R5 et I1 à I5 sont inchangées.
