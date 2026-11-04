# Spécifications des demandes

Une section par demande (B1, B2…). Chaque critère d'acceptation est couvert par au moins un test de `tests.js` dont le nom cite son code.

---

## B1 · Sprints et burndown

- **Sujet** : `sprints`
- **Demande** : « Sprints & burndown (Planifier). Créer un sprint : nom, dates, capacité en points. Y glisser des tickets, avec une jauge de capacité. Clôturer : le non-terminé revient au backlog. Burndown en SVG : restant vs ligne idéale. La règle qui piège : capacité atteinte pile, ticket non estimé, sprint d'un seul jour (division par zéro de la ligne idéale). Données : `sprints[]` · `ticket.sprintId`. »
- **Date** : 2026-11-04 (relue et réduite à 8 critères le même jour)

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
| `releves` | objet `{ 'AAAA-MM-JJ': pointsRestants }` (voir B1.6) ; `{}` à la création |
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

### Critères d'acceptation (8)

Les fonctions décrites sont des **règles pures** (zone 2) : elles ne modifient jamais les tableaux reçus (R4) et renvoient des erreurs au lieu de lever des exceptions. Les messages sont à respecter mot pour mot (`␣:` = espace insécable avant les deux-points, comme dans le reste de l'application). Chaque critère liste ses cas à vérifier (`B1.1a`, `B1.1b`…).

#### B1.1 · Créer un sprint — `creerSprint(sprints, donnees)`, `nombreDeJours(debut, fin)`

`creerSprint` renvoie `{ ok: true, sprints, sprint }` (nouveau tableau) ou `{ ok: false, erreurs: { champ: message } }`.

| Cas | Quand | Alors |
|---|---|---|
| a | « Sprint 1 », 2026-11-02 → 2026-11-13, capacité 20, aucun sprint | `{ id: 1, nom: 'Sprint 1', debut, fin, capacite: 20, statut: 'ouvert', releves: {}, bilan: null, clotureLe: null }` ; tableau reçu intact ; espaces autour du nom retirés |
| b | sprints d'id 1 et 4 existants | id 5 |
| c | nom de 2 ou de 41 caractères | `nom` : `Le nom du sprint fait de 3 à 40 caractères.` (3 et 40 acceptés) |
| d | début ou fin invalide (« 2026-02-30 », vide) | `debut` : `La date de début doit être au format AAAA-MM-JJ.` / `fin` : `La date de fin doit être au format AAAA-MM-JJ.` |
| e | fin avant début | `fin` : `La fin ne peut pas précéder le début.` |
| f | 32 jours | `fin` : `Un sprint dure au plus 31 jours.` (31 accepté) |
| g | capacité 0, 1000, 2.5, « abc » | `capacite` : `La capacité est un nombre entier de points, de 1 à 999.` (1 et 999 acceptés) |
| h | **début = fin (un seul jour)** | accepté |
| i–l | `nombreDeJours` : 2026-11-04 → 2026-11-04 ; 2026-03-27 → 03-31 (heure d'été) ; 2026-10-23 → 10-27 (heure d'hiver) ; 2028-02-27 → 03-01 (bissextile) | 1 ; 5 ; 5 ; 4 |

#### B1.2 · Engager un ticket dans la capacité — `ajouterAuSprint(tickets, sprints, idTicket, idSprint)`

Renvoie `{ ok: true, tickets }` (seul le `sprintId` du ticket change) ou `{ ok: false, erreur }`. Contrôles dans cet ordre : liste, ticket, sprint, sprint clôturé, déjà dans ce sprint, Definition of Ready, terminé, capacité.

| Cas | Étant donné | Quand | Alors |
|---|---|---|---|
| a | sprint 15/20 | + 5 points | **accepté (capacité atteinte pile : 20/20)** ; nouveau tableau, tableau reçu intact |
| b | sprint 15/20 | + 8 points | `Capacité dépassée (23/20 points)` |
| c | sprint 20/20 | + 1 point | `Capacité dépassée (21/20 points)` |
| d | ticket déjà dans ce sprint plein | on l'ajoute de nouveau | accepté, rien ne change (pas compté deux fois) |
| e | ticket de 5 points dans le sprint ouvert A | on l'ajoute au sprint B | accepté : il quitte A, qui libère 5 points |
| f | ticket dont le `sprintId` désigne un sprint clôturé | on l'ajoute à un sprint ouvert | accepté (il était hors sprint) |
| g | sprint de 13 points avec un ticket terminé de 8 | + 8 points | `Capacité dépassée (16/13 points)` : les terminés comptent dans l'engagement |

#### B1.3 · Refuser ce qui n'a rien à faire dans un sprint, et en sortir — `ajouterAuSprint`, `retirerDuSprint(tickets, sprints, idTicket)`

| Cas | Quand | Alors |
|---|---|---|
| a | **ticket #7 non estimé** | `Definition of Ready␣: le ticket #7 n’est pas estimé` (même message que R2) |
| b | ticket #8 terminé | `Le ticket #8 est déjà terminé` |
| c | sprint clôturé | `Sprint clôturé␣: on ne peut plus le modifier` |
| d | ticket ou sprint 99 inexistant | `Ticket introuvable (id 99)` / `Sprint introuvable (id 99)` |
| e | liste contenant un élément vide | `Liste de tickets invalide`, sans exception |
| f | `retirerDuSprint` d'un ticket d'un sprint ouvert | `ok: true`, `sprintId: null`, autres tickets intacts |
| g | `retirerDuSprint` du ticket #4 hors sprint (ou d'un sprint clôturé) | `Le ticket #4 n’est dans aucun sprint ouvert` |

#### B1.4 · Modifier un ticket d'un sprint ouvert — `modifierTicket(tickets, id, changements, sprints)`

Le 4e paramètre est facultatif : sans lui, `modifierTicket` se comporte comme avant.

| Cas | Étant donné | Quand | Alors |
|---|---|---|---|
| a | ticket de 3 points, sprint 18/20 | points → 5 | accepté (20/20, pile) |
| b | le même | points → 8 | `points` : `Capacité dépassée (23/20 points) dans le sprint « Sprint 1 ».` |
| c | ticket de sprint dans la colonne Backlog | points → non estimé | `points` : `Definition of Ready␣: un ticket d’un sprint doit rester estimé.` |
| d | ticket de sprint | `changements.sprintId: 99` | ignoré : le sprint ne change que par B1.2, B1.3 et B1.5 |
| e | **sprint déjà au-delà de sa capacité** (ancienne sauvegarde, B1.7d) | on modifie le titre d'un de ses tickets, ou on **baisse** ses points | accepté : **seule une hausse des points est contrôlée** |

#### B1.5 · Clôturer — `cloturerSprint(tickets, sprints, idSprint, aujourdhui)`

Renvoie `{ ok: true, tickets, sprints, retournes }` ou `{ ok: false, erreur }`. Exemple : 2 tickets terminés (8 pts) et 2 non terminés « À faire » / « En cours » (5 pts), clôture le 2026-11-13.

| Cas | Alors |
|---|---|
| a | les non-terminés passent en **colonne Backlog** avec `sprintId: null` ; les terminés gardent colonne et `sprintId` ; `retournes` = leurs 2 ids |
| b | sprint : `statut: 'cloture'`, `clotureLe: '2026-11-13'`, `bilan: { engage: 13, termine: 8, restant: 5 }` |
| c | autres sprints et tickets hors sprint intacts ; tableaux reçus intacts |
| d | clôturer un sprint déjà clôturé → `Sprint clôturé␣: on ne peut plus le modifier` |
| e | dernier relevé des restants (5) à la date `min(aujourd'hui, fin)` ; aucun si l'on clôture avant le début |

#### B1.6 · Burndown — `calculerBurndown(sprint, tickets, aujourdhui)`, `noterReleve(…)`, `dessinerBurndown(burndown)`

`calculerBurndown` renvoie `{ jours, engage, ideal, restant }` ; `ideal` et `restant` ont `n + 1` valeurs (indice 0 = début du 1er jour, indice k = fin du jour k).

| Cas | Étant donné | Alors |
|---|---|---|
| a | 5 jours, 10 points | `ideal` = `[10, 8, 6, 4, 2, 0]` |
| b | **un seul jour**, 8 points | `ideal` = `[8, 0]`, aucun `NaN` ni `Infinity` |
| c | 3 jours, 10 points | `[10, 6.67, 3.33, 0]` (2 décimales) |
| d | 0 point engagé | que des 0 (et `null` pour le futur) |
| e | ouvert, 2026-11-02 → 06, aujourd'hui 11-04, relevés `{ 11-02: 10, 11-03: 7 }`, 4 restants | `restant` = `[10, 10, 7, 4, null, null]` (aujourd'hui = valeur actuelle, futur = `null`) |
| f | jour passé sans relevé | dernier relevé précédent, ou l'engagé s'il n'y en a aucun |
| g | pas commencé | `[engagé, null, …]` |
| h | clôturé | `engage` = `bilan.engage` ; jours après `clotureLe` = `null` |
| i | `noterReleve`, sprint ouvert, début ≤ aujourd'hui ≤ fin | **nouveau** sprint avec `releves[aujourdhui]` = restants ; sprint reçu intact |
| j | `noterReleve`, sprint pas commencé, fini ou clôturé | le même sprint, inchangé |
| k | `dessinerBurndown` d'un sprint d'un jour, et à 0 point | SVG sans `NaN` ni `Infinity` (ni pour la ligne idéale, ni pour l'échelle) |
| l | `dessinerBurndown` | lignes de classe `bd-ideal` et `bd-restant`, et un `<title>` descriptif |

L'application note le relevé du jour de chaque sprint ouvert du projet affiché à chaque mise à jour de la page.

#### B1.7 · Sauvegarde v4, import et export

| Cas | Quand | Alors |
|---|---|---|
| a | sauvegarde avec sprints (ouvert, clôturé) puis `charger()` | `origine: 'sauvegarde'` ; sprints (relevés, bilan) et `sprintId` identiques |
| b | sauvegarde **version 3** (« sauvegarde d'hier ») | `origine: 'migration-v3'` ; tickets avec `sprintId: null`, projets avec `sprints: []`, rien d'autre de perdu |
| c | sauvegardes v1 et v2 | toujours migrées, tickets à 9 champs |
| d | v4 abîmée : `sprintId` inconnu ; sprint aux dates, à la capacité ou à la durée invalides ; ticket non estimé dans un sprint ouvert | sprint invalide écarté, ces tickets hors sprint, rien ne plante |
| e | version 5 | `origine: 'version-inconnue'` |
| f | export CSV ou JSON | colonnes `id, titre, type, priorite, points, statut, creeLe, assigne` : pas de `sprintId` |
| g | import d'un fichier avec une colonne `sprintId` | tickets importés avec `sprintId: null`, colonne signalée « hors du modèle, ignorée » |

#### B1.8 · Interface (vérifiée à la main)

Section **« Sprints »** sous les vues : choix du sprint, **« + Nouveau sprint »** (erreurs de B1.1 sous chaque champ, durée affichée) ; **jauge de capacité** (barre plafonnée à 100 %, états « pile » et « dépassée » distincts) ; listes « Dans le sprint » / « Tickets disponibles » avec **glisser-déposer** et boutons équivalents au clavier ; refus expliqués par une notification ; **« Clôturer le sprint »** avec confirmation listant les tickets qui retournent au backlog ; **burndown SVG** (idéal en pointillés, restants, légende). Réinitialiser le projet supprime ses sprints ; un nouveau projet n'en a aucun.

#### Correspondance avec la 1re version de cette spec (12 critères, relue et réduite à 8)

| Avant | Après | | Avant | Après |
|---|---|---|---|---|
| B1.1a–h | B1.1a–h | | B1.6a–e | B1.5a–e |
| B1.2a–d | B1.1i–l | | B1.7a–h | B1.6a–h |
| B1.3a, b, c, h, i, j, k | B1.2a–g | | B1.8a, b | B1.6i, j |
| B1.3d, e, f, g, l | B1.3a–e | | B1.9a, b | B1.6k, l |
| B1.4a, b | B1.3f, g | | B1.10a–e | B1.7a–e |
| B1.5a–d | B1.4a–d (+ **B1.4e**, nouveau) | | B1.11a, b | B1.7f, g |
| | | | B1.12 | B1.8 |

### Hors périmètre

- Modifier ou supprimer un sprint après sa création ; rouvrir un sprint clôturé.
- Exporter / importer les sprints.
- Annuler (Ctrl+Z) une clôture ou un ajout au sprint : ce ne sont pas des déplacements de colonne.
- Interdire les sprints qui se chevauchent dans le temps.

### Impacts sur l'existant

- **Modèle de ticket** : 9 champs au lieu de 8. Les tests **T9** et **T11** qui vérifient la liste exacte des champs doivent attendre `…, assigne, sprintId`.
- **Sauvegarde** : version 3 → 4 (`VERSION_SAUVEGARDE = 4`) ; la v3 devient une migration (B1.7b).
- **Clôture** : remettre un ticket dans la colonne Backlog n'est pas noté au journal des déplacements ; une annulation ultérieure qui le concerne est refusée proprement (« a changé de colonne depuis »), comme aujourd'hui.
- Les règles R1 à R5 et I1 à I5 sont inchangées.

---

## B2 · Dépendances et blocages

- **Sujet** : `dependances`
- **Demande** : « Dépendances & blocages (Sécuriser). Déclarer "bloqué par" un ou plusieurs tickets. Interdit d'entrer En cours si un bloquant n'est pas terminé. Badge 🔒 listant les bloquants. Supprimer un ticket nettoie toutes les références. La règle qui piège : les cycles A → B → C → A : refusés, avec le cycle affiché dans le message. Données : `ticket.bloquePar = []`. »
- **Date** : 2026-11-04

### Pourquoi

Un ticket dépend parfois d'un autre (une API avant l'écran qui l'appelle). L'équipe veut le dire, le voir, et ne pas commencer un travail dont les prérequis ne sont pas terminés, sans jamais créer d'attente circulaire où personne ne pourrait commencer.

### Données

**Ticket** : un 10e champ, **`bloquePar`**, après `sprintId` : la liste des numéros des tickets **du même projet** qu'il attend, sans doublon, jamais lui-même ; `[]` par défaut.
Ordre des champs : `id, titre, type, priorite, points, statut, creeLe, assigne, sprintId, bloquePar`.

**Définitions**
- « A est bloqué par B » : A attend B. On le note A → B.
- Un **bloquant actif** est un bloquant qui n'est **pas terminé** (pas dans la dernière colonne).
- **Zone de travail** : la colonne « En cours » et toutes les colonnes situées après elle (« En revue », « Terminé »).

### Critères d'acceptation (8)

Fonctions pures (zone 2), tableaux reçus jamais modifiés (R4), erreurs renvoyées et jamais levées. Messages mot pour mot (`␣:` = espace insécable).

#### B2.1 · Déclarer les bloquants — `definirBloquants(tickets, id, bloquePar)`

Remplace la liste des bloquants du ticket `id`. Renvoie `{ ok: true, tickets }` ou `{ ok: false, erreur }`.

| Cas | Quand | Alors |
|---|---|---|
| a | #1 bloqué par `[2, 3]` | `ok: true` ; `bloquePar` de #1 = `[2, 3]` ; seul #1 change ; tableau reçu intact |
| b | `[3, 2, 3]` | doublon retiré, ordre de déclaration gardé : `[3, 2]` |
| c | `[]` | #1 n'est plus bloqué |
| d | un ticket **déjà en cours** reçoit un bloquant non terminé | accepté (on découvre une dépendance en cours de route) : il reste où il est |
| e | `modifierTicket(…, { bloquePar: [9] })` | ignoré : les bloquants ne changent que par `definirBloquants` (et B2.6) |

#### B2.2 · Refuser une déclaration impossible

| Cas | Quand | Alors |
|---|---|---|
| a | ticket 99 inexistant | `Ticket introuvable (id 99)` |
| b | bloquant 99 inexistant (ou d'un autre projet : absent du tableau) | `Ticket bloquant introuvable (id 99)` |
| c | `bloquePar` qui n'est pas une liste de numéros (`'2'`, `[1.5]`) | `Liste de bloquants invalide` |
| d | liste de tickets contenant un élément vide | `Liste de tickets invalide`, sans exception |

#### B2.3 · Refuser les cycles, en affichant le cycle (la règle qui piège)

Le cycle affiché part du ticket modifié et suit le plus court chemin d'attente jusqu'à lui.

| Cas | Étant donné | Quand | Alors |
|---|---|---|---|
| a | #1 → #2, #2 → #3 | #3 bloqué par `[1]` | `Cycle refusé␣: #3 → #1 → #2 → #3` ; rien ne change |
| b | #1 → #2 | #2 bloqué par `[1]` | `Cycle refusé␣: #2 → #1 → #2` |
| c | — | #4 bloqué par `[4]` | `Cycle refusé␣: #4 → #4` |
| d | #1 → #2, #1 → #3 (losange, sans boucle) | #2 bloqué par `[3]` | accepté : deux chemins vers un même ticket ne font pas un cycle |
| e | #1 → #2 → #3 | #3 bloqué par `[4, 1]` | le cycle par #1 est signalé : `Cycle refusé␣: #3 → #1 → #2 → #3` |

#### B2.4 · Interdire d'entrer dans la zone de travail — `deplacerTicket` (nouvelle règle R6)

Contrôles de `deplacerTicket` dans cet ordre : R2 (Definition of Ready), **R6 (bloqué)**, R5 (passage obligé), R1 (WIP).

| Cas | Étant donné | Quand | Alors |
|---|---|---|---|
| a | #2 bloqué par #3 (À faire) et #5 (Terminé) | #2 → « En cours » | `Bloqué␣: #2 attend #3` (seuls les bloquants actifs sont cités) |
| b | #2 bloqué par #3 et #4, aucun terminé | #2 → « En revue » (saut direct) | `Bloqué␣: #2 attend #3, #4` |
| c | #2 bloqué et **déjà** en cours | #2 → « En revue » | refusé (même message) ; #2 → « À faire » ou « Backlog » : accepté (reculer reste permis) |
| d | tous les bloquants de #2 terminés | #2 → « En cours » | accepté |
| e | #2 bloqué par #3 non terminé | #2 → « À faire » | accepté (hors zone de travail) |

#### B2.5 · Lister les bloquants actifs (badge 🔒) — `bloquantsActifs(ticket, tickets)`

| Cas | Alors |
|---|---|
| a | renvoie les numéros des bloquants **non terminés**, dans l'ordre de déclaration (`[3, 4]`) |
| b | tous terminés, ou aucun bloquant → `[]` (pas de badge) |
| c | un numéro qui ne correspond à aucun ticket est ignoré |

#### B2.6 · Supprimer un ticket nettoie toutes les références — `retirerDesBloquants(tickets, id)`

| Cas | Quand | Alors |
|---|---|---|
| a | #3 supprimé alors que #1 → [3, 2] et #2 → [3] | #1 → `[2]`, #2 → `[]` ; tableau reçu intact ; les tickets non concernés sont les mêmes objets |
| b | suppression dans l'application | le ticket disparaît, et plus aucun ticket du projet ne le cite (les tickets bloqués par lui sont débloqués) |

#### B2.7 · Sauvegarde v5 (« sauvegarde d'hier » en v4), import et export

| Cas | Quand | Alors |
|---|---|---|
| a | aller-retour d'une sauvegarde avec bloquants | `origine: 'sauvegarde'` ; `bloquePar` identiques |
| b | **sauvegarde version 4** (avec sprints) | `origine: 'migration-v4'` ; chaque ticket a `bloquePar: []` ; **sprints et `sprintId` conservés** ; rien d'autre de perdu |
| c | sauvegardes v1, v2, v3 | toujours migrées ; tickets à 10 champs |
| d | v5 abîmée : bloquant inconnu, lui-même, en double, d'un autre projet, ou qui ferme un cycle | ces liens sont retirés (dans l'ordre des tickets, le lien qui ferme le cycle est retiré, les précédents sont gardés) ; rien ne plante |
| e | version 6 | `origine: 'version-inconnue'` |
| f | export CSV ou JSON | pas de `bloquePar` (colonnes inchangées) |
| g | import d'un fichier avec une colonne `bloquePar` | tickets importés avec `bloquePar: []` ; colonne signalée « hors du modèle, ignorée » |

#### B2.8 · Interface (vérifiée à la main)

- Formulaire « Ajouter / Modifier » : champ **« Bloqué par »** (numéros séparés par des virgules, `#` accepté), avec les erreurs de B2.2 et B2.3 sous le champ.
- Liste et Kanban : **badge 🔒** sur un ticket qui a des bloquants actifs, listant leurs numéros (et leurs titres au survol).
- Refus R6 (glisser, boutons ◀ ▶, formulaire) expliqué : quels tickets terminer d'abord.
- Fenêtre « Supprimer » : annonce les tickets qui ne seront plus bloqués.

### Hors périmètre

- Dépendances entre projets ; graphe visuel des dépendances.
- Empêcher de **terminer** un bloquant ou de le faire reculer (seule l'entrée du bloqué dans la zone de travail est contrôlée).
- Annuler (Ctrl+Z) une déclaration de bloquants.

### Impacts sur l'existant

- **Modèle de ticket** : 10 champs. Les tests qui vérifient la liste exacte des champs (T9, T11, T27) attendent `…, sprintId, bloquePar`.
- **Sauvegarde** : version 4 → 5 (`VERSION_SAUVEGARDE = 5`). Une sauvegarde v4 devient une migration (`migration-v4`) : les tests de B1.7 qui supposaient « v4 = version actuelle » (T27 : constante, sauvegarde abîmée en v4, « version 5 inconnue ») doivent suivre.
- **`deplacerTicket`** : nouvelle règle R6. R1 à R5 inchangées ; un ticket sans bloquant se déplace exactement comme avant.
