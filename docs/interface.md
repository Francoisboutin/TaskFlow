# Interface

## En-tête

- Choix du projet actif (avec son nombre de tickets) et bouton **+ Nouveau projet**.
- Thème **Clair / Sombre**, mémorisé. Par défaut, suit la préférence de l'appareil.

## Haut de page

- **Guide de première visite** (3 étapes), masqué après « J'ai compris ».
- **Bandeau de chargement** si la sauvegarde a été migrée ou était illisible.
- **Titre du projet**.
- **Graphiques** (repliables) : tickets par statut (camembert), points par colonne, points par priorité.
- **Tableau de bord** : tickets, points au total, tickets non estimés, avancement (%), occupation de la colonne limitée (ex. « En cours 2 / 3 ») et de « En revue ».

## Onglets Backlog / Kanban

La vue choisie est mémorisée. Navigation au clavier : flèches gauche / droite, `Début`, `Fin`.

### Vue Backlog (liste)

- Tableau : N°, titre (et personne assignée), type, priorité, points, statut, date de création, boutons Modifier et Supprimer.
- **Ordre personnalisé** : glisser une ligne par sa poignée, ou poignée + flèches haut / bas. Un nouveau tri abandonne l'ordre personnalisé.

### Vue Kanban

- Une colonne par entrée de `COLONNES`, avec son nombre de tickets et sa limite WIP.
- Déplacement par **glisser-déposer**, par les boutons **◀ ▶** (R3), ou au clavier (poignée + flèches). `Échap` annule un glissement.
- Un refus (R1, R2, R5) est expliqué dans une notification.

## Recherche

Recherche tolérante sur le titre : majuscules, accents et petites fautes de frappe sont tolérés (« LOGIN » ou « logni » trouvent « login »).

## Filtres (repliables)

Combinables entre eux et avec la recherche : type, priorité, points (dont « Non estimé »), statut, n° de ticket, assignation (« Je suis » + « Mes tickets »), date de création (du / au). Bouton « Effacer la recherche et les filtres ».

## Tri (repliable)

Tri multiple : critère 1, puis critère 2 en cas d'égalité, etc. Chaque critère a un sens (croissant / décroissant) et peut être monté, descendu ou retiré. Pour les points, les tickets non estimés restent toujours en dernier. Tri par défaut : priorité puis points.

## Formulaire « Ajouter / Modifier un ticket »

Tous les champs du modèle ; points en cartes de planning poker (1, 2, 3, 5, 8, 13, Non estimé). Les erreurs de validation et les refus de règles sont affichés sous le champ concerné.

## Derniers déplacements

Les 10 derniers déplacements du projet ; chacun peut être annulé. « Annuler le dernier » : bouton ou `Ctrl+Z`.

## Vos données

Sauvegarde automatique, export, réinitialisation du projet, réinitialisation de la démo.

## Auto-tests

Panneau listant les tests T1 à T12, regroupés, avec leur résultat et le bilan (ex. « 12/12 réussis »). Bouton **Relancer les tests** (animation, sous une seconde). Voir [auto-tests.md](auto-tests.md).

## Accessibilité

- Navigation complète au clavier, focus visible.
- Annonces pour lecteur d'écran (`aria-live`) après chaque action.
- Respect de la préférence « mouvement réduit » de l'appareil.
- Icônes SVG en ligne qui prennent la couleur du texte (`currentColor`).
