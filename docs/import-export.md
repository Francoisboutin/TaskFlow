# Import et export

## Import

Formats acceptés : **CSV** et **JSON**, par fichier ou par texte collé.
Colonnes du modèle : `id, titre, type, priorite, points, statut, creeLe`, et `assigne` (facultative). Seul le **titre** est obligatoire. Les en-têtes et libellés en français sont reconnus (« Priorité », « Haute », « En cours »…). Le séparateur et l'encodage sont détectés ; les dates `JJ/MM/AAAA` sont acceptées.

Fonctions pures :
- `parserCSV(texte)` → lignes : `[{ numero, repere, valeurs, corrections, ignorees }]`
- `importerTickets(lignes, existants[, options])` → rapport d'import (`importes`, `rejets`, `ajustements`, `bilan`)

### Principe

**Importer toutes les lignes.** Seul un élément qui n'est pas un ticket est rejeté. Toute règle non respectée est **corrigée**, et la correction est **expliquée** sur le ticket et dans le rapport. Les tickets existants ne sont jamais modifiés ni écrasés.

### Règles

| Règle | Description |
|---|---|
| **I1** | Respecter les guillemets : une virgule, un point-virgule ou un retour à la ligne entre guillemets ne décale rien. |
| **I2** | Normaliser (même valeur, écrite autrement — ce n'est **pas** une correction) : « Story » → `story`, « En cours » → `encours`, points « ? » ou vide → `null`. |
| **I3** | Signaler avec motif : titre vide, priorité hors 1–3, type inconnu. Ces lignes sont **corrigées**, pas rejetées (demande du chef de projet). |
| **I4** | Id déjà pris ou invalide → nouvel id. Ne jamais écraser un ticket. |
| **I5** | Afficher le rapport d'import dans l'interface. |

### Table des corrections

| Problème | Correction |
|---|---|
| Titre vide | `Titre à compléter (ligne N)` |
| Titre trop court / trop long | Complété / raccourci |
| Type inconnu | `story` |
| Priorité hors 1–3 | Valeur la plus proche (4 → 3, 0 → 1) ; illisible → 2 |
| Id invalide ou déjà pris | Nouvel id |
| Points hors de la suite | Carte supérieure (13 au-delà) ; illisible → non estimé |
| Statut inconnu | Backlog |
| Date invalide ou future | Date du jour |
| Non estimé hors du Backlog (R2) | Backlog |
| Colonne pleine (R1) | Colonne précédente |
| Séparateur hors guillemets dans le titre | Morceaux regroupés |
| Cellules manquantes | Valeurs par défaut |

### Destination

Trois choix : **ajouter au projet actif**, **remplacer** les tickets du projet actif, ou **créer un nouveau projet** (nom à saisir).

### Cas de référence : le fichier piégé `backlog-import.csv`

```csv
id,titre,type,priorite,points,statut
21,"Corriger le login, page d'accueil",bug,1,3,afaire
22,Export PDF des factures,Story ,2,8,backlog
23,,tache,3,2,backlog
24,Notifications e-mail,story,2,?,backlog
21,Tableau de bord client,story,1,5,encours
25,Audit accessibilité,tache,4,3,backlog
```

Résultat attendu, importé dans les 12 tickets de démonstration : **« 6 importés · 0 rejeté »**.

- Ligne 2 : titre complet avec sa virgule, type `bug` (I1).
- Ligne 3 : « Story » → `story`, simple normalisation (I2).
- Ligne 4 : titre vide → « Titre à compléter (ligne 4) », correction expliquée (I3).
- Ligne 5 : points « ? » → `null`, simple normalisation (I2).
- Ligne 6 : id 21 déjà pris → nouvel id (I4) ; si « En cours » est plein, le ticket va dans la colonne précédente (R1).
- Ligne 7 : priorité 4 → 3, correction expliquée (I3).

## Export

- Formats : **CSV** ou **JSON**.
- Contenu : tous les tickets du projet, ou seulement ceux affichés (choix proposé quand la recherche ou des filtres masquent des tickets).
- Les tickets sont exportés tels quels, colonnes dans l'ordre du modèle, dans l'ordre actuel de la liste.
- Un export JSON réimporté redonne le tableau à l'identique.
