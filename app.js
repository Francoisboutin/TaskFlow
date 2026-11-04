/* ##########################################################################
   TaskFlow · app.js — COMPORTEMENT DE LA PAGE
   --------------------------------------------------------------------------
   Le fichier est organisé en 3 zones, repérables par leur bandeau :
     ZONE 1 · DONNÉES   ce que l’application manipule (JS 1)
     ZONE 2 · RÈGLES    outils et fonctions pures, sans accès au HTML (JS 2 à 5)
     ZONE 3 · UI        état, affichage, actions, sauvegarde, démarrage (JS 6 à 24)
   Sommaire
   ── Zone 1 · Données
     JS 1   Données de référence : modèle de ticket, COLONNES, tickets de départ
   ── Zone 2 · Règles
     JS 2   Outils génériques : textes, dates, HTML, préférences
     JS 3   Validation d’un ticket
     JS 4   Règles métier : fonctions pures (deplacerTicket, modifierTicket, calculerStats)
     JS 5   Import et export : fonctions pures (CSV, JSON)
     JS 5b  Sprints et burndown : fonctions pures (B1) ; sprints en cours et tickets du Kanban (B5) ; démarrage (B6)
     JS 5c  Dépendances et blocages : fonctions pures, règle R6 (B2) ; listes des bloquants (B8)
     JS 5d  Échéances et calendrier : fonctions pures (B3)
   ── Zone 3 · UI
     JS 6   État de l’application et actions sur les données
     JS 7   Recherche tolérante : casse, accents, fautes de frappe
     JS 8   Filtres, tri multiple et ordre personnalisé
     JS 9   Éléments de la page et icônes
     JS 10  Affichage : rendre() et ses parties
     JS 11  Notification et fenêtres
     JS 12  Formulaire « Ajouter / Modifier un ticket »
     JS 13  Suppression d’un ticket et projets
     JS 14  Recherche, filtres et tri : réactions aux actions
     JS 15  Déplacer un ticket dans la liste : clavier et glisser-déposer
     JS 16  Kanban : boutons ◀ ▶, glisser-déposer et bouton Modifier
     JS 17  Import et export : fenêtres et téléchargement
     JS 17b Sprints : panneau, jauge, glisser-déposer, clôture, burndown SVG (B1)
     JS 17c Échéances : badges, résumé des retards, vue Calendrier (B3)
     JS 18  Onglets Backlog / Sprints / Kanban / Calendrier
     JS 19  Panneaux repliables
     JS 20  Thème clair / sombre
     JS 21  (Auto-tests : déplacés dans tests.js)
     JS 22  Sauvegarde et chargement (localStorage versionné, migration, plan B)
     JS 23  Démarrage
     JS 24  Ce que tests.js peut lire (window.TaskFlow, gelé)
   Principe : une seule source de données (etat), et une seule fonction qui
   redessine la page à partir d’elle (rendre). Le Backlog et le Kanban lisent
   le même tableau de tickets : toute modification apparaît dans les deux vues.
   ########################################################################## */
(function () {
  'use strict';   // signale les erreurs silencieuses (variables non déclarées, objets gelés modifiés…)


  /* ########################################################################
     ZONE 1 · DONNÉES
     ######################################################################## */

  /* ========================================================================
     JS 1 · DONNÉES DE RÉFÉRENCE
     ======================================================================== */

  // Valeurs autorisées par le modèle de ticket imposé
  const TYPES = [
    { valeur: 'story', libelle: 'Story' },
    { valeur: 'bug', libelle: 'Bug' },
    { valeur: 'tache', libelle: 'Tâche' }
  ];
  const PRIORITES = [
    { valeur: 1, libelle: 'Haute' },
    { valeur: 2, libelle: 'Moyenne' },
    { valeur: 3, libelle: 'Basse' }
  ];
  const POINTS = [1, 2, 3, 5, 8, 13];   // suite imposée ; « null » signifie « non estimé »

  /* Zone 1 du sujet · Colonnes pilotées par les données */
  const COLONNES = [
    { id: "backlog", titre: "Backlog",  wip: null },
    { id: "afaire",  titre: "À faire",  wip: null },
    { id: "encours", titre: "En cours", wip: 3, debutTravail: true },   // R6 : début de la zone de travail (B2)
    { id: "enrevue", titre: "En revue", wip: 2 },
    { id: "termine", titre: "Terminé",  wip: null, depuis: ["enrevue"] },   // R5 : on n’y entre que depuis « En revue »
  ];
  // L’interface boucle sur COLONNES : aucune colonne en dur

  // Les statuts d’un ticket sont les colonnes du Kanban : une seule source de vérité
  const STATUTS = COLONNES.map(colonne => ({ valeur: colonne.id, libelle: colonne.titre }));
  // 1re colonne : un ticket non estimé ne la quitte pas (règle R2)
  const COLONNE_BACKLOG = COLONNES[0];
  // Colonne soumise à la limite WIP (règle R1) ; null si aucune colonne n’a de limite
  const COLONNE_LIMITEE = COLONNES.find(colonne => colonne.wip !== null) || null;

  const TITRE_MIN = 3;
  const TITRE_MAX = 80;
  const ID_MAX = 999999;
  const ASSIGNE_MAX = 40;                       // longueur maximale du nom de la personne assignée                        // plus grand numéro de ticket accepté
  const NOM_PROJET_MIN = 3;
  const NOM_PROJET_MAX = 60;
  const NON_ESTIME = 'nv';   // valeur du choix « Non estimé » dans le formulaire et les filtres

  // B1 · Sprints (docs/spec.md) : un sprint est rangé dans son projet (projet.sprints)
  const SPRINT_NOM_MIN = 3;
  const SPRINT_NOM_MAX = 40;
  const SPRINT_JOURS_MAX = 31;                  // durée maximale, bornes incluses
  const SPRINT_CAPACITE_MAX = 999;              // capacité en points : entier de 1 à 999
  const SPRINT_OUVERT = 'ouvert';
  const SPRINT_CLOTURE = 'cloture';

  // Clés des préférences mémorisées dans ce navigateur
  const CLE_THEME = 'taskflow-theme';             // également lue par l’amorce placée dans <head>
  const CLE_VUE = 'taskflow-vue';
  const CLE_PANNEAUX_REDUITS = 'taskflow-panneaux-reduits';
  const CLE_GUIDE_VU = 'taskflow-guide-vu';
  // Sauvegarde des données (JS 22) : une enveloppe versionnée, sous une seule clé
  const CLE_SAUVEGARDE = 'taskflow';
  const CLE_SAUVEGARDE_ILLISIBLE = 'taskflow-illisible';   // copie d’une sauvegarde abîmée, gardée à part
  const VERSION_SAUVEGARDE = 7;   // v3 : « assigne », journal, « Je suis » ; v4 : sprints, ticket.sprintId ; v5 : ticket.bloquePar ; v6 : ticket.echeance ; v7 : sprint.demarreLe

  // Les 12 tickets du projet de démonstration « Refonte de l’espace client »
  const TICKETS_INITIAUX = [
    { id: 1,  titre: 'Connexion SSO via le compte entreprise',                          type: 'story', priorite: 1, points: 5,    statut: 'encours', creeLe: '2026-10-12', assigne: 'Camille' },
    { id: 2,  titre: 'Erreur 500 au login après expiration de la session',             type: 'bug',   priorite: 1, points: 3,    statut: 'afaire',  creeLe: '2026-10-13', assigne: 'Yanis' },
    { id: 3,  titre: 'Refonte de la page de login',                                     type: 'story', priorite: 2, points: 3,    statut: 'afaire',  creeLe: '2026-10-14' },
    { id: 4,  titre: 'Tableau de bord : synthèse des contrats en cours',                type: 'story', priorite: 1, points: 8,    statut: 'backlog', creeLe: '2026-10-15' },
    { id: 5,  titre: 'Téléchargement des factures au format PDF',                       type: 'story', priorite: 2, points: 5,    statut: 'backlog', creeLe: '2026-10-16' },
    { id: 6,  titre: 'Mot de passe oublié : l’e-mail de réinitialisation n’arrive pas', type: 'bug',   priorite: 2, points: 2,    statut: 'afaire',  creeLe: '2026-10-19' },
    { id: 7,  titre: 'Modification des coordonnées personnelles',                       type: 'story', priorite: 2, points: null, statut: 'backlog', creeLe: '2026-10-20' },
    { id: 8,  titre: 'Messagerie sécurisée avec le conseiller',                         type: 'story', priorite: 3, points: 13,   statut: 'backlog', creeLe: '2026-10-21' },
    { id: 9,  titre: 'Migration des comptes clients existants',                         type: 'tache', priorite: 1, points: null, statut: 'backlog', creeLe: '2026-10-22' },
    { id: 10, titre: 'Audit d’accessibilité des nouveaux écrans',                       type: 'tache', priorite: 2, points: 8,    statut: 'backlog', creeLe: '2026-10-26' },
    { id: 11, titre: 'Mise en place du suivi d’audience',                               type: 'tache', priorite: 3, points: 1,    statut: 'termine', creeLe: '2026-10-27' },
    { id: 12, titre: 'Menu mobile qui ne se referme plus',                              type: 'bug',   priorite: 3, points: 2,    statut: 'encours', creeLe: '2026-10-29' }
  ];


  /* ########################################################################
     ZONE 2 · RÈGLES (outils et fonctions pures : aucune ne touche au HTML de la page)
     ######################################################################## */

  /* ========================================================================
     JS 2 · OUTILS GÉNÉRIQUES
     ======================================================================== */

  // Libellé lisible d’une valeur (ex. 'tache' → 'Tâche') dans TYPES, PRIORITES ou STATUTS
  function libelleDe(liste, valeur) {
    const entree = liste.find(element => element.valeur === valeur);
    return entree ? entree.libelle : String(valeur);
  }
  // Position d’une valeur dans sa liste de référence (sert aux tris par type ou par statut)
  const rangDans = (liste, valeur) => liste.findIndex(element => element.valeur === valeur);

  // Nombre réel de caractères (un emoji compte pour un seul caractère)
  const nombreDeCaracteres = texte => Array.from(texte).length;

  // « 1 ticket », « 2 tickets »
  const pluriel = (nombre, mot) => `${nombre} ${mot}${nombre > 1 ? 's' : ''}`;

  // Clé texte des points, utilisée par les filtres (null devient « nv »)
  const clePoints = points => (points === null ? NON_ESTIME : String(points));

  // Neutralise les caractères spéciaux avant d’insérer un texte dans du HTML
  const ENTITES_HTML = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const echapper = texte => String(texte).replace(/[&<>"']/g, caractere => ENTITES_HTML[caractere]);

  // Dates : stockées au format ISO (AAAA-MM-JJ), affichées en français (« 12 oct. 2026 »)
  const FORMAT_DATE = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
  function dateEnFrancais(dateIso) {
    const [annee, mois, jour] = dateIso.split('-').map(Number);
    return FORMAT_DATE.format(new Date(annee, mois - 1, jour));
  }
  // Date du jour en heure locale (toISOString donnerait la date en heure UTC)
  // B3 · La date du jour peut être imposée par l’adresse (index.html?aujourdhui=AAAA-MM-JJ) pour tester l’interface.
  // Les règles (zone 2) ne l’appellent jamais : elles reçoivent « aujourdhui » en paramètre.
  let aujourdhuiImpose;
  function aujourdhuiIso() {
    if (aujourdhuiImpose === undefined) {
      try { const valeur = new URLSearchParams(window.location.search).get('aujourdhui'); aujourdhuiImpose = dateIsoValide(valeur) ? valeur : null; }
      catch (erreur) { aujourdhuiImpose = null; }
    }
    if (aujourdhuiImpose) return aujourdhuiImpose;
    const maintenant = new Date();
    const surDeuxChiffres = nombre => String(nombre).padStart(2, '0');
    return `${maintenant.getFullYear()}-${surDeuxChiffres(maintenant.getMonth() + 1)}-${surDeuxChiffres(maintenant.getDate())}`;
  }
  // Vérifie le format ISO et que la date existe vraiment (pas de 31 février)
  function dateIsoValide(texte) {
    if (typeof texte !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(texte)) return false;
    const [annee, mois, jour] = texte.split('-').map(Number);
    const date = new Date(Date.UTC(annee, mois - 1, jour));
    return date.getUTCFullYear() === annee && date.getUTCMonth() === mois - 1 && date.getUTCDate() === jour;
  }

  // Préférence « animations réduites » de l’appareil (requête préparée une seule fois)
  const REQUETE_MOUVEMENT_REDUIT = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  const mouvementReduit = () => !!(REQUETE_MOUVEMENT_REDUIT && REQUETE_MOUVEMENT_REDUIT.matches);

  // Préférences mémorisées : sans planter si le navigateur bloque le stockage
  function lirePreference(cle) {
    try { return localStorage.getItem(cle); } catch (erreur) { return null; }
  }
  function enregistrerPreference(cle, valeur) {
    try { localStorage.setItem(cle, valeur); } catch (erreur) { /* le choix vaut alors pour cette visite seulement */ }
  }


  /* ========================================================================
     JS 3 · VALIDATION D’UN TICKET
     Tout ticket créé passe par validerTicket() : impossible d’enregistrer
     des points « 4 », un titre de 2 caractères ou un statut inconnu.
     ======================================================================== */

  // Renvoie un message d’erreur, ou une chaîne vide si le titre est correct
  function verifierTitre(titre) {
    if (typeof titre !== 'string' || titre.trim() === '') return 'Le titre est obligatoire.';
    const longueur = nombreDeCaracteres(titre.trim());
    if (longueur < TITRE_MIN) return `Titre trop court\u00a0: ${longueur} caractère${longueur > 1 ? 's' : ''}, il en faut au moins ${TITRE_MIN}.`;
    if (longueur > TITRE_MAX) return `Titre trop long\u00a0: ${longueur} caractères, ${TITRE_MAX} au maximum.`;
    return '';
  }

  // Renvoie un objet { champ: message } ; vide si le ticket respecte le modèle
  function validerTicket(ticket, numerosDejaPris) {
    const erreurs = {};
    if (!Number.isInteger(ticket.id) || ticket.id < 1 || ticket.id > ID_MAX) erreurs.id = `Le numéro du ticket doit être un nombre entier de 1 à ${ID_MAX.toLocaleString('fr-FR')}.`;
    else if (numerosDejaPris && numerosDejaPris.has(ticket.id)) erreurs.id = `Le numéro ${ticket.id} est déjà utilisé.`;
    const erreurTitre = verifierTitre(ticket.titre);
    if (erreurTitre) erreurs.titre = erreurTitre;
    if (!TYPES.some(type => type.valeur === ticket.type)) erreurs.type = 'Choisissez un type\u00a0: Story, Bug ou Tâche.';
    if (!PRIORITES.some(priorite => priorite.valeur === ticket.priorite)) erreurs.priorite = 'Choisissez une priorité\u00a0: 1 (haute), 2 (moyenne) ou 3 (basse).';
    if (!(ticket.points === null || POINTS.includes(ticket.points))) erreurs.points = 'Les points doivent valoir 1, 2, 3, 5, 8, 13 ou «\u00a0Non estimé\u00a0».';
    if (!STATUTS.some(statut => statut.valeur === ticket.statut)) erreurs.statut = 'Choisissez un statut\u00a0: Backlog, À faire, En cours ou Terminé.';
    if (!dateIsoValide(ticket.creeLe)) erreurs.creeLe = 'La date de création doit être au format AAAA-MM-JJ.';
    if (!(ticket.assigne === null || (typeof ticket.assigne === 'string' && ticket.assigne !== '' && nombreDeCaracteres(ticket.assigne) <= ASSIGNE_MAX))) {
      erreurs.assigne = `Le nom de la personne assignée fait au plus ${ASSIGNE_MAX} caractères (laissez vide si personne).`;
    }
    if (!(ticket.sprintId === null || (Number.isInteger(ticket.sprintId) && ticket.sprintId >= 1))) erreurs.sprintId = 'Le sprint du ticket doit être un numéro de sprint, ou aucun.';
    if (!Array.isArray(ticket.bloquePar) || ticket.bloquePar.some(numero => !Number.isInteger(numero) || numero < 1 || numero === ticket.id) || new Set(ticket.bloquePar).size !== ticket.bloquePar.length) {
      erreurs.bloquePar = 'Les bloquants doivent être des numéros d’autres tickets, sans doublon.';
    }
    if (!(ticket.echeance === null || dateIsoValide(ticket.echeance))) erreurs.echeance = 'L’échéance doit être une date au format AAAA-MM-JJ, ou vide.';
    return erreurs;
  }

  // Construit un ticket avec exactement les clés du modèle, dans le même ordre
  function construireTicket(donnees) {
    return {
      id: donnees.id,
      titre: typeof donnees.titre === 'string' ? donnees.titre.trim() : donnees.titre,
      type: donnees.type,
      priorite: donnees.priorite,
      points: donnees.points,
      statut: donnees.statut,
      creeLe: donnees.creeLe,
      // v3 : personne assignée, ou null (les tickets d’avant n’ont pas ce champ : ils reçoivent null)
      assigne: typeof donnees.assigne === 'string' && donnees.assigne.trim() ? donnees.assigne.trim().replace(/\s+/g, ' ') : null,
      // v4 (B1) : numéro du sprint du ticket, ou null (hors sprint)
      sprintId: Number.isInteger(donnees.sprintId) && donnees.sprintId >= 1 ? donnees.sprintId : null,
      // v5 (B2) : numéros des tickets qu’il attend, sans doublon
      bloquePar: Array.isArray(donnees.bloquePar) ? [...new Set(donnees.bloquePar.filter(numero => Number.isInteger(numero) && numero >= 1))] : [],
      // v6 (B3) : date d’échéance « AAAA-MM-JJ », ou null
      echeance: typeof donnees.echeance === 'string' && donnees.echeance.trim() ? donnees.echeance.trim() : null
    };
  }


  /* ========================================================================
     JS 4 · RÈGLES MÉTIER DU KANBAN — FONCTIONS PURES (Zone 2 du sujet)
     Ces fonctions ne lisent ni ne modifient l’état de l’application :
     même entrée → même sortie, et le tableau reçu n’est jamais modifié.
     Les auto-tests (JS 21) les vérifient à chaque chargement.
     ======================================================================== */

  // deplacerTicket(tickets, id, versStatut)
  //   → { ok: true,  tickets: nouveauTableau }
  //   → { ok: false, erreur: "WIP atteint (3/3)" }
  function deplacerTicket(tickets, id, versStatut) {
    // Pas un tableau, ou un élément vide (null, undefined) : refus, plutôt qu’une exception plus loin
    if (!Array.isArray(tickets) || tickets.some(element => !element)) return { ok: false, erreur: 'Liste de tickets invalide' };
    const ticket = tickets.find(element => element && element.id === id);
    if (!ticket) return { ok: false, erreur: `Ticket introuvable (id ${id})` };
    const colonneCible = COLONNES.find(colonne => colonne.id === versStatut);
    if (!colonneCible) return { ok: false, erreur: `Colonne inconnue («\u00a0${versStatut}\u00a0»)` };
    if (ticket.statut === versStatut) return { ok: true, tickets: tickets.slice() };   // déjà dans cette colonne

    // R2 · Definition of Ready : un ticket non estimé ne quitte pas le Backlog
    if (ticket.points === null && versStatut !== COLONNE_BACKLOG.id) {
      return { ok: false, erreur: `Definition of Ready\u00a0: le ticket #${id} n’est pas estimé` };
    }

    // R6 · Bloqué (B2) : un ticket qui attend un ticket non terminé n’entre pas dans la zone de travail
    if (RANG_DEBUT_TRAVAIL >= 0 && COLONNES.indexOf(colonneCible) >= RANG_DEBUT_TRAVAIL) {
      const attend = bloquantsActifs(ticket, tickets);
      if (attend.length) return { ok: false, erreur: `Bloqué\u00a0: #${id} attend ${attend.map(numero => `#${numero}`).join(', ')}` };
    }

    // R5 · Passage obligé : une colonne qui a « depuis » n’accepte que les tickets venant de ces colonnes
    if (colonneCible.depuis && !colonneCible.depuis.includes(ticket.statut)) {
      return { ok: false, erreur: `Passage interdit\u00a0: «\u00a0${colonneCible.titre}\u00a0» n’accepte que les tickets venant de ${originesAdmises(colonneCible)}` };
    }

    // R1 · WIP : une colonne limitée n’accepte pas plus de « wip » tickets
    if (colonneCible.wip !== null) {
      const nombreDansLaColonne = tickets.filter(element => element.statut === colonneCible.id).length;
      if (nombreDansLaColonne >= colonneCible.wip) {
        return { ok: false, erreur: `WIP atteint (${nombreDansLaColonne}/${colonneCible.wip})` };
      }
    }

    // R4 · Immuable : nouveau tableau, nouvel objet pour le ticket déplacé, l’original reste intact
    return { ok: true, tickets: tickets.map(element => (element.id === id ? { ...element, statut: versStatut } : element)) };
  }

  // calculerStats(tickets) → { total, points, nonEstimes, pointsTermines, avancement,
  //                           colonnes: [{ id, titre, wip, nombre, points, nonEstimes, pourcentage, plein }] }
  // Un seul passage sur la liste ; une liste vide donne 0 % partout (jamais NaN).
  // Avancement = points de la dernière colonne (« Terminé ») / points de tous les tickets.
  function calculerStats(tickets) {
    const liste = Array.isArray(tickets) ? tickets : [];
    const total = liste.length;
    const cumulParColonne = new Map(COLONNES.map(colonne => [colonne.id, { nombre: 0, points: 0, nonEstimes: 0 }]));
    let points = 0;
    let nonEstimes = 0;
    for (const ticket of liste) {
      const cumul = cumulParColonne.get(ticket.statut);
      if (cumul) cumul.nombre += 1;
      if (typeof ticket.points === 'number') { points += ticket.points; if (cumul) cumul.points += ticket.points; }
      else if (ticket.points === null) { nonEstimes += 1; if (cumul) cumul.nonEstimes += 1; }
    }
    const pourcentage = (partie, tout) => (tout > 0 ? Math.round((partie / tout) * 100) : 0);
    const colonnes = COLONNES.map(colonne => {
      const { nombre, points: pointsDeLaColonne, nonEstimes: nonEstimesDeLaColonne } = cumulParColonne.get(colonne.id);
      return {
        id: colonne.id, titre: colonne.titre, wip: colonne.wip, nombre,
        points: pointsDeLaColonne, nonEstimes: nonEstimesDeLaColonne,
        pourcentage: pourcentage(nombre, total),
        plein: colonne.wip !== null && nombre >= colonne.wip
      };
    });
    const pointsTermines = colonnes[colonnes.length - 1].points;
    return { total, points, nonEstimes, pointsTermines, avancement: pourcentage(pointsTermines, points), colonnes };
  }

  /* ---------- Journal des déplacements (fonctions pures) ----------
     Un déplacement : un changement de colonne (de ≠ vers) ou de place (de = vers).
     Chaque entrée garde l’état d’avant le déplacement (tickets et ordre) et une
     signature de l’état d’après : « Annuler » remet exactement l’état d’avant si
     rien n’a changé depuis ; sinon il ne ramène que ce ticket dans sa colonne
     d’origine, en respectant les règles. */
  const JOURNAL_MAX = 10;
  const signatureDuProjet = projet => JSON.stringify({ tickets: projet.tickets.map(construireTicket), ordreManuel: projet.ordreManuel || null });
  function entreeDeJournal(avant, apres, id, de, vers, quand) {
    const ticket = apres.tickets.find(element => element.id === id);
    return {
      id, titre: ticket ? ticket.titre : '', de, vers, quand,
      avant: { tickets: avant.tickets.map(construireTicket), ordreManuel: avant.ordreManuel ? [...avant.ordreManuel] : null, ordreAffiche: Array.isArray(avant.ordreAffiche) ? [...avant.ordreAffiche] : null },
      apres: signatureDuProjet(apres)
    };
  }
  const journaliser = (journal, entree) => [entree, ...(Array.isArray(journal) ? journal : [])].slice(0, JOURNAL_MAX);
  // Remet le ticket « id » à sa place d’avant dans l’ordre personnalisé, sans toucher aux autres.
  // ordreAvant : l’ordre d’avant le déplacement ; le ticket retrouve son voisin d’alors.
  function replacerDansLOrdre(ordreActuel, id, ordreAvant) {
    if (!ordreActuel) return null;                       // ordre trié : rien à replacer
    if (!Array.isArray(ordreAvant) || !ordreAvant.includes(id)) return [...ordreActuel];
    const ordre = ordreActuel.filter(numero => numero !== id);
    const rang = ordreAvant.indexOf(id);
    const suivant = ordreAvant.slice(rang + 1).find(numero => ordre.includes(numero));
    if (suivant !== undefined) { ordre.splice(ordre.indexOf(suivant), 0, id); return ordre; }
    const precedent = ordreAvant.slice(0, rang).reverse().find(numero => ordre.includes(numero));
    if (precedent !== undefined) { ordre.splice(ordre.indexOf(precedent) + 1, 0, id); return ordre; }
    return [...ordre, id];
  }

  // Défait UNE entrée du journal (la plus récente de son ticket) sur l’état { tickets, ordreManuel }.
  // C’est une restauration : le ticket revient là où il était. Les règles qui protègent l’état
  // restent vérifiées (limite WIP, Definition of Ready) ; le passage obligé par « En revue »
  // ne s’applique pas, puisque le ticket retourne à une place qu’il occupait déjà.
  function annulerUneEntree(courant, entree) {
    const actuel = courant.tickets.find(ticket => ticket.id === entree.id);
    if (!actuel) return { ok: false, erreur: `le ticket #${entree.id} n’existe plus` };
    if (actuel.statut !== entree.vers) return { ok: false, erreur: `le ticket #${entree.id} a changé de colonne depuis` };
    const ordreAvant = entree.avant.ordreManuel || entree.avant.ordreAffiche || null;
    if (entree.de === entree.vers) {                     // changement de place : seul l’ordre change
      return { ok: true, tickets: courant.tickets.slice(), ordreManuel: replacerDansLOrdre(courant.ordreManuel, entree.id, ordreAvant) };
    }
    const depart = courant.tickets.map(ticket => (ticket.id === entree.id ? { ...ticket, statut: origineDArrivee(entree.de) } : ticket));
    const essai = deplacerTicket(depart, entree.id, entree.de);
    if (!essai.ok) return { ok: false, erreur: `${essai.erreur} dans «\u00a0${libelleDe(STATUTS, entree.de)}\u00a0»` };
    return { ok: true, tickets: essai.tickets, ordreManuel: replacerDansLOrdre(courant.ordreManuel, entree.id, ordreAvant) };
  }

  // Entrées à défaire pour annuler celle de rang « rang » : elle, plus les déplacements plus récents
  // du MÊME ticket (sinon « revenir où il était » n’aurait pas de sens). Les autres tickets ne bougent pas.
  const entreesAAnnuler = (journal, rang) => (journal[rang] ? journal.slice(0, rang + 1).filter(entree => entree.id === journal[rang].id) : []);

  // annulerDeplacement({ tickets, ordreManuel, journal }, rang) → { ok, tickets, ordreManuel, journal, exact, annules }
  //   ou { ok: false, erreur } (rien n’est changé). rang 0 = le plus récent.
  function annulerDeplacement(projet, rang = 0) {
    const journal = Array.isArray(projet.journal) ? projet.journal : [];
    const cible = journal[rang];
    if (!cible) return { ok: false, erreur: rang === 0 ? 'aucun déplacement à annuler' : 'ce déplacement n’est plus dans le journal' };
    // Le plus récent, et rien n’a changé depuis : on remet exactement l’état d’avant (tableaux immuables)
    if (rang === 0 && signatureDuProjet(projet) === cible.apres) {
      return { ok: true, exact: true, annules: [cible], journal: journal.slice(1), tickets: cible.avant.tickets.map(construireTicket),
        ordreManuel: cible.avant.ordreManuel ? [...cible.avant.ordreManuel] : null };
    }
    // Sinon : on défait les déplacements de ce ticket, du plus récent jusqu’à celui-ci, tout ou rien
    const annules = entreesAAnnuler(journal, rang);
    let courant = { tickets: projet.tickets, ordreManuel: projet.ordreManuel || null };
    for (const entree of annules) {
      const resultat = annulerUneEntree(courant, entree);
      if (!resultat.ok) return { ok: false, erreur: resultat.erreur };
      courant = resultat;
    }
    const retirees = new Set(annules);
    return { ok: true, exact: false, annules, journal: journal.filter(entree => !retirees.has(entree)), tickets: courant.tickets, ordreManuel: courant.ordreManuel };
  }
  const annulerDernierDeplacement = projet => annulerDeplacement(projet, 0);

  // modifierTicket(tickets, id, changements)
  //   → { ok: true,  tickets: nouveauTableau, ticket: ticketModifie }
  //   → { ok: false, erreurs: { champ: message } }
  // Le numéro (id), la date de création (creeLe), le sprint (sprintId) et les bloquants (bloquePar) ne changent jamais ici.
  // Un changement de statut passe par deplacerTicket : les règles R1 et R2 s’appliquent.
  // sprints (facultatif, B1.5) : pour un ticket d’un sprint ouvert, ses points restent estimés
  // et ne peuvent pas augmenter au-delà de la capacité du sprint.
  function modifierTicket(tickets, id, changements, sprints) {
    const ticketActuel = Array.isArray(tickets) ? tickets.find(element => element && element.id === id) : null;
    if (!ticketActuel) return { ok: false, erreurs: { id: `Ticket introuvable (id ${id})` } };

    // 1. Les nouveaux champs, contrôlés comme pour une création (le statut est traité à l’étape 2)
    const statutVoulu = changements.statut === undefined ? ticketActuel.statut : changements.statut;
    const ticketCandidat = construireTicket({ ...ticketActuel, ...changements, id: ticketActuel.id, creeLe: ticketActuel.creeLe, statut: ticketActuel.statut, sprintId: ticketActuel.sprintId, bloquePar: ticketActuel.bloquePar });
    const erreurs = validerTicket(ticketCandidat);
    if (!STATUTS.some(statut => statut.valeur === statutVoulu)) erreurs.statut = 'Choisissez un statut\u00a0: Backlog, À faire, En cours ou Terminé.';
    if (Object.keys(erreurs).length) return { ok: false, erreurs };
    let nouveauxTickets = tickets.map(element => (element.id === id ? ticketCandidat : element));

    // 2. Changement de colonne : mêmes règles que les boutons ◀ ▶ du Kanban
    if (statutVoulu !== ticketActuel.statut) {
      const deplacement = deplacerTicket(nouveauxTickets, id, statutVoulu);
      if (!deplacement.ok) return { ok: false, erreurs: { statut: expliquerRefusFormulaire(deplacement.erreur, statutVoulu) } };
      nouveauxTickets = deplacement.tickets;
    }

    // 3. R2 dans l’autre sens : hors du Backlog, un ticket ne peut pas redevenir « non estimé »
    const ticketModifie = nouveauxTickets.find(element => element.id === id);
    if (ticketModifie.points === null && ticketModifie.statut !== COLONNE_BACKLOG.id) {
      return { ok: false, erreurs: { points: `Definition of Ready\u00a0: un ticket hors du «\u00a0${COLONNE_BACKLOG.titre}\u00a0» doit rester estimé. Choisissez des points, ou le statut «\u00a0${COLONNE_BACKLOG.titre}\u00a0».` } };
    }

    // 4. B1.5 · Ticket d’un sprint ouvert : il reste estimé, et ses points ne font pas dépasser la capacité.
    //    La capacité n’est vérifiée que si les points augmentent (un titre se modifie toujours).
    const sprint = sprintOuvertDe(ticketModifie, sprints);
    if (sprint) {
      if (ticketModifie.points === null) return { ok: false, erreurs: { points: 'Definition of Ready\u00a0: un ticket d’un sprint doit rester estimé.' } };
      const engages = pointsEngages(nouveauxTickets, sprint);
      if (ticketModifie.points > (ticketActuel.points || 0) && engages > sprint.capacite) {
        return { ok: false, erreurs: { points: `Capacité dépassée (${engages}/${sprint.capacite} points) dans le sprint «\u00a0${sprint.nom}\u00a0».` } };
      }
    }
    return { ok: true, tickets: nouveauxTickets, ticket: ticketModifie };
  }

  // Transforme l’erreur de deplacerTicket en message clair pour l’utilisateur
  // « « En revue » » (ou plusieurs colonnes, séparées par « ou »)
  const originesAdmises = colonne => colonne.depuis.map(id => `«\u00a0${libelleDe(STATUTS, id)}\u00a0»`).join(' ou ');
  // Colonne d’où l’on simule l’arrivée d’un ticket importé ou rechargé : la colonne d’avant obligée s’il y en a une
  const origineDArrivee = statut => { const colonne = COLONNES.find(element => element.id === statut); return colonne && colonne.depuis ? colonne.depuis[0] : COLONNE_BACKLOG.id; };

  function expliquerRefus(erreur, versStatut) {
    const colonne = COLONNES.find(element => element.id === versStatut);
    if (/^Bloqué/.test(erreur)) return `${erreur}. Terminez d’abord ce qu’il attend, ou retirez le blocage (bouton Modifier, champ «\u00a0Bloqué par\u00a0»).`;
    if (/^Passage interdit/.test(erreur) && colonne) return `${erreur}. Faites d’abord passer le ticket par ${originesAdmises(colonne)}.`;
    if (/^WIP/.test(erreur) && colonne) {
      return `${erreur}\u00a0: la colonne «\u00a0${colonne.titre}\u00a0» accepte au maximum ${colonne.wip} tickets. Terminez ou déplacez un ticket «\u00a0${colonne.titre}\u00a0» avant d’en ajouter un autre.`;
    }
    if (/^Definition of Ready/.test(erreur)) {
      return `${erreur}. Un ticket doit être estimé avant de quitter le «\u00a0${COLONNE_BACKLOG.titre}\u00a0».`;
    }
    return erreur;
  }

  // Même chose pour le formulaire (création ou modification) : le conseil porte sur le statut choisi
  function expliquerRefusFormulaire(erreur, statut) {
    const colonne = COLONNES.find(element => element.id === statut);
    if (/^Bloqué/.test(erreur)) return `${erreur}. Choisissez un statut avant «\u00a0${RANG_DEBUT_TRAVAIL >= 0 ? COLONNES[RANG_DEBUT_TRAVAIL].titre : ''}\u00a0», ou videz le champ «\u00a0Bloqué par\u00a0».`;
    if (/^Passage interdit/.test(erreur) && colonne) return `${erreur}. Choisissez d’abord ${originesAdmises(colonne)}.`;
    if (/^WIP/.test(erreur) && colonne) {
      return `${erreur}\u00a0: la colonne «\u00a0${colonne.titre}\u00a0» accepte au maximum ${colonne.wip} tickets. Choisissez un autre statut.`;
    }
    return `Definition of Ready\u00a0: un ticket non estimé doit rester dans le «\u00a0${COLONNE_BACKLOG.titre}\u00a0». Choisissez ses points ou le statut «\u00a0${COLONNE_BACKLOG.titre}\u00a0».`;
  }


  /* ========================================================================
     JS 5 · IMPORT ET EXPORT : FONCTIONS PURES (CSV, JSON) — Zone 2 du sujet
       parserCSV(texte)                → lignes   (une ligne du fichier = un objet)
       importerTickets(lignes, existants)  → rapport d’import
     Export : les tickets tels quels, colonnes dans l’ordre du modèle.
     Règles d’import :
       I1  Respecter les guillemets : une virgule dans un titre ne décale rien (lireCsv).
       I2  Normaliser : « Story » → "story", « En cours » → "encours", points « ? » → null.
       I3  Signaler avec motif : titre vide, priorité hors 1–3, type inconnu.
           (À la demande du chef de projet, ces lignes ne sont plus rejetées : elles sont
           corrigées comme les autres, et la correction est indiquée.)
       Principe : importer toutes les lignes. Seul un élément qui n’est pas un ticket est rejeté ;
       toute règle non respectée est corrigée, et la correction est expliquée :
         titre vide → « Titre à compléter (ligne N) » ; type inconnu → story ;
         priorité hors 1–3 → valeur la plus proche (4 → 3, 0 → 1), illisible → 2 ;
         id invalide ou déjà pris → nouvel id ; titre trop court → complété, trop long → raccourci ;
         points hors suite → carte supérieure (13 au-delà, non estimé si illisible) ;
         statut inconnu → Backlog ; date invalide ou future → date du jour ;
         R2 non estimé hors du Backlog → Backlog ; R1 colonne pleine → colonne précédente ;
         séparateur hors guillemets dans le titre → morceaux regroupés ; cellules manquantes → défauts.
       I4  Id déjà pris : nouvel id, ne jamais écraser un ticket.
       I5  Afficher le rapport d’import dans l’interface (JS 17).
     Règles ajoutées : R1 (WIP) et R2 (Definition of Ready) comme pour une saisie,
     séparateur et encodage détectés, en-têtes en français, dates JJ/MM/AAAA.
     Rien n’est importé en douce : chaque rejet et chaque ajustement est rapporté.
     ======================================================================== */
  const COLONNES_FICHIER = ['id', 'titre', 'type', 'priorite', 'points', 'statut', 'creeLe', 'assigne'];   // ordre du modèle
  const SEPARATEUR_CSV = ';';                 // celui qu’attend un tableur réglé en français

  // Une cellule CSV : entre guillemets si besoin ; une apostrophe protège les textes qu’un tableur prendrait pour une formule
  function celluleCsv(valeur) {
    let texte = valeur === null || valeur === undefined ? '' : String(valeur);
    if (/^[=+\-@\t\r]/.test(texte)) texte = `'${texte}`;
    return /[";\r\n]/.test(texte) || texte !== texte.trim() ? `"${texte.replace(/"/g, '""')}"` : texte;
  }
  // CSV encodé en UTF-8 avec marque d’ordre (BOM) : les accents s’affichent bien dans Excel
  function ticketsEnCsv(tickets) {
    const lignes = [COLONNES_FICHIER.join(SEPARATEUR_CSV)]
      .concat(tickets.map(ticket => COLONNES_FICHIER.map(colonne => celluleCsv(ticket[colonne])).join(SEPARATEUR_CSV)));
    return `\ufeff${lignes.join('\r\n')}\r\n`;
  }
  // JSON : une liste d’objets qui suivent le modèle de ticket, colonnes du fichier seulement
  // (B1.11 : le sprint n’est pas exporté, puisque les sprints eux-mêmes ne le sont pas)
  const ticketsEnJson = tickets => `${JSON.stringify(tickets.map(construireTicket)
    .map(ticket => Object.fromEntries(COLONNES_FICHIER.map(colonne => [colonne, ticket[colonne]]))), null, 2)}\n`;

  // Lecture d’un CSV (guillemets, guillemets doublés, retours à la ligne dans une cellule).
  // Le séparateur (; , ou tabulation) est deviné sur la 1re ligne.
  function lireCsv(texte) {
    const contenu = texte.replace(/^\ufeff/, '');
    const premiereLigne = contenu.split(/\r?\n/, 1)[0] || '';
    const occurrences = caractere => premiereLigne.split(caractere).length - 1;
    const separateur = [';', ',', '\t'].reduce((meilleur, caractere) => (occurrences(caractere) > occurrences(meilleur) ? caractere : meilleur), ';');
    const enregistrements = [];
    let cellules = [];
    let cellule = '';
    let entreGuillemets = false;
    let numeroLigne = 1;
    let ligneDuDebut = 1;
    const finirEnregistrement = () => {
      cellules.push(cellule);
      if (cellules.some(valeur => valeur.trim() !== '')) enregistrements.push({ ligne: ligneDuDebut, cellules });
      cellules = [];
      cellule = '';
    };
    for (let i = 0; i < contenu.length; i++) {
      const caractere = contenu[i];
      if (entreGuillemets) {
        if (caractere === '"' && contenu[i + 1] === '"') { cellule += '"'; i++; }
        else if (caractere === '"') entreGuillemets = false;
        else { if (caractere === '\n') numeroLigne++; cellule += caractere; }
      } else if (caractere === '"' && cellule === '') entreGuillemets = true;
      else if (caractere === separateur) { cellules.push(cellule); cellule = ''; }
      else if (caractere === '\n' || caractere === '\r') {
        if (caractere === '\r' && contenu[i + 1] === '\n') i++;
        finirEnregistrement();
        numeroLigne++;
        ligneDuDebut = numeroLigne;
      } else cellule += caractere;
    }
    if (cellule !== '' || cellules.length) finirEnregistrement();
    return { separateur, enregistrements };
  }

  // Noms de colonne acceptés (clés du modèle, libellés affichés, quelques équivalents anglais)
  const NOMS_DE_COLONNE = {
    id: ['id', 'n', 'no', 'num', 'numero'],
    titre: ['titre', 'title', 'nom', 'intitule'],
    type: ['type'],
    priorite: ['priorite', 'priority', 'prio'],
    points: ['points', 'point', 'pts', 'complexite', 'points de complexite', 'estimation'],
    statut: ['statut', 'status', 'etat', 'colonne'],
    creeLe: ['creele', 'cree le', 'creation', 'date de creation', 'date', 'createdat', 'created at'],
    assigne: ['assigne', 'assignee', 'assigne a', 'assigned', 'assigned to', 'assignedto', 'owner']
  };
  function colonneDuModele(nom) {
    const cle = normaliser(nom).replace(/[^a-z0-9]+/g, ' ').trim();
    return COLONNES_FICHIER.find(colonne => NOMS_DE_COLONNE[colonne].includes(cle) || NOMS_DE_COLONNE[colonne].includes(cle.replace(/ /g, ''))) || null;
  }

  // parserCSV(texte) → lignes : [{ numero, repere, valeurs, corrections, ignorees }]
  //   numero : numéro de la ligne dans le fichier (l’en-tête est la ligne 1) ; repere : « Ligne 4 »
  //   valeurs : le texte brut de chaque colonne reconnue (rien n’est encore converti ni vérifié)
  //   I1 : une virgule, un point-virgule ou un retour à la ligne entre guillemets ne décale rien.
  //   corrections : réparations de la ligne elle-même, expliquées dans le rapport :
  //     – trop de cellules : un séparateur hors guillemets dans le titre ; les cellules
  //       en trop sont regroupées dans le titre, les autres colonnes retrouvent leur place ;
  //     – cellules manquantes : les colonnes absentes prennent leur valeur par défaut.
  //   ignorees : colonnes de l’en-tête qui ne font pas partie du modèle
  //   Lève une erreur si l’en-tête n’a pas de colonne « titre ».
  const NOMS_SEPARATEURS = { ',': 'virgule', ';': 'point-virgule', '\t': 'tabulation' };
  function parserCSV(texte) {
    const { separateur, enregistrements } = lireCsv(String(texte));
    if (!enregistrements.length) throw new Error('Le fichier est vide.');
    const entetes = enregistrements[0].cellules;
    const colonnes = entetes.map(colonneDuModele);
    if (!colonnes.includes('titre')) {
      throw new Error('Colonne «\u00a0titre\u00a0» introuvable\u00a0: la 1re ligne doit donner le nom des colonnes (id, titre, type, priorite, points, statut, creeLe).');
    }
    let largeur = entetes.length;                     // un séparateur en fin d’en-tête n’ajoute pas de colonne
    while (largeur > 0 && entetes[largeur - 1].trim() === '') largeur--;
    const ignorees = entetes.slice(0, largeur).filter((nom, rang) => !colonnes[rang] && nom.trim() !== '').map(nom => nom.trim());
    const rangTitre = colonnes.indexOf('titre');
    return enregistrements.slice(1).map(({ ligne, cellules }) => {
      const corrections = [];
      let utilisees = cellules.length;                // les cellules vides en fin de ligne ne comptent pas
      while (utilisees > largeur && cellules[utilisees - 1].trim() === '') utilisees--;
      let rangees = cellules.slice(0, utilisees);
      if (utilisees > largeur) {
        // Séparateur hors guillemets dans le titre : on regroupe les morceaux du titre
        const surplus = utilisees - largeur;
        rangees = [...rangees.slice(0, rangTitre), rangees.slice(rangTitre, rangTitre + surplus + 1).join(separateur), ...rangees.slice(rangTitre + surplus + 1)];
        corrections.push(`${utilisees} cellules au lieu de ${largeur} (${NOMS_SEPARATEURS[separateur]} hors guillemets dans le titre) → morceaux regroupés en un seul titre`);
      } else if (cellules.length < largeur) {
        const manquantes = colonnes.slice(cellules.length, largeur).filter(Boolean);
        corrections.push(`${cellules.length} cellules au lieu de ${largeur} → valeurs par défaut pour\u00a0: ${manquantes.join(', ')}`);
      }
      const valeurs = {};
      colonnes.forEach((colonne, rang) => { if (colonne && valeurs[colonne] === undefined && rang < rangees.length) valeurs[colonne] = rangees[rang]; });
      return { numero: ligne, repere: `Ligne ${ligne}`, valeurs, corrections, ignorees };
    });
  }

  // parserJSON(texte) → lignes (même forme que parserCSV) ; accepte une liste de tickets ou { tickets: [...] }
  function parserJSON(texte) {
    let donnees;
    try { donnees = JSON.parse(String(texte)); } catch (erreur) { throw new Error(`JSON illisible\u00a0: ${erreur.message}`); }
    const liste = Array.isArray(donnees) ? donnees : (donnees && Array.isArray(donnees.tickets) ? donnees.tickets : null);
    if (!liste) throw new Error('Le JSON doit contenir une liste de tickets (ou un objet avec une liste « tickets »).');
    return liste.map((element, rang) => {
      const valeurs = {};
      const ignorees = [];
      if (element && typeof element === 'object' && !Array.isArray(element)) {
        for (const [cle, valeur] of Object.entries(element)) {
          const colonne = colonneDuModele(cle);
          if (colonne) valeurs[colonne] = valeur;
          else ignorees.push(cle);
        }
      } else valeurs.__invalide = true;
      return { numero: rang + 1, repere: `Ticket n°\u00a0${rang + 1}`, valeurs, ignorees };
    });
  }

  // Colonnes du modèle absentes de toutes les lignes (des valeurs par défaut seront utilisées)
  const colonnesAbsentes = lignes => COLONNES_FICHIER.filter(colonne => !lignes.some(ligne => ligne.valeurs[colonne] !== undefined));

  // Choisit le bon lecteur selon le fichier → { ok, format, lignes, colonnesAbsentes } ou { ok: false, erreur }
  function analyserFichier(nomFichier, texte) {
    const extension = (String(nomFichier).split('.').pop() || '').toLowerCase();
    const contenu = String(texte).replace(/^\ufeff/, '');
    if (!contenu.trim()) return { ok: false, erreur: 'Le fichier est vide.' };
    const estJson = extension === 'json' || (extension !== 'csv' && /^\s*[[{]/.test(contenu));
    try {
      const lignes = estJson ? parserJSON(contenu) : parserCSV(contenu);
      if (!lignes.length) return { ok: false, erreur: 'Aucun ticket trouvé dans le fichier.' };
      const colonnesIgnorees = [...new Set(lignes.flatMap(ligne => ligne.ignorees || []))];
      return { ok: true, format: estJson ? 'json' : 'csv', lignes, colonnesAbsentes: colonnesAbsentes(lignes), colonnesIgnorees };
    } catch (erreur) {
      return { ok: false, erreur: erreur.message };
    }
  }

  // Valeurs par défaut quand une colonne manque ou qu’une cellule est vide
  const VALEURS_PAR_DEFAUT = { type: 'story', priorite: 2, points: null, statut: COLONNE_BACKLOG.id };
  const MOTS_NON_ESTIME = ['?', 'null', 'nv', 'non estime', 'non estimé'];
  const SUFFIXE_TITRE_COURT = ' (titre à compléter)';

  // Reconnaît une valeur par son code (« tache ») ou son libellé (« Tâche »), sans tenir compte de la casse, des espaces ni des accents
  function valeurReconnue(liste, brut) {
    const cle = normaliser(brut).trim();
    const trouve = liste.find(element => normaliser(element.valeur) === cle || normaliser(element.libelle) === cle);
    return trouve ? trouve.valeur : undefined;
  }
  const entreGuillemets = valeur => `«\u00a0${valeur}\u00a0»`;

  // Titre trop long : coupé à 80 caractères (sur un espace si possible), terminé par « … »
  function raccourcirTitre(titre) {
    let coupe = Array.from(titre).slice(0, TITRE_MAX - 1).join('');
    const dernierEspace = coupe.lastIndexOf(' ');
    if (dernierEspace >= TITRE_MAX - 20) coupe = coupe.slice(0, dernierEspace);
    return `${coupe.trimEnd()}…`;
  }

  // convertirEnregistrement(valeurs, dateDuJour, repere) → { donnees, erreurs, ajustements, idInvalide }
  //   erreurs     : seul cas encore rejeté : un élément qui n’est pas un ticket (rien à importer)
  //   ajustements : [{ texte, nature }] avec nature 'correction' (une règle n’était pas respectée,
  //                 la valeur a été changée) ou 'normalisation' (même valeur, écrite autrement : I2)
  //   Tout le reste est réparé pour que la ligne soit importée, et la réparation est expliquée.
  function convertirEnregistrement(valeurs, dateDuJour, repere = 'ligne') {
    if (valeurs.__invalide) return { donnees: null, erreurs: ['ce n’est pas un objet ticket'], ajustements: [] };
    const erreurs = [];
    const ajustements = [];
    const corriger = texte => ajustements.push({ texte, nature: 'correction' });
    const normaliserValeur = texte => ajustements.push({ texte, nature: 'normalisation' });
    const brut = champ => (valeurs[champ] === null || valeurs[champ] === undefined ? '' : String(valeurs[champ]));
    const celluleVide = champ => valeurs[champ] !== undefined && valeurs[champ] !== null && String(valeurs[champ]).trim() === '';

    // id : un id invalide (décimal, négatif, trop grand, texte) est remplacé par un nouvel id (I4)
    const idBrut = brut('id').trim();
    let id = null;
    let idInvalide = null;
    if (idBrut !== '') {
      if (/^\d+$/.test(idBrut) && Number(idBrut) >= 1 && Number(idBrut) <= ID_MAX) id = Number(idBrut);
      else idInvalide = idBrut;
    }

    // titre : une seule ligne, de 3 à 80 caractères, comme dans le formulaire ; vide → titre à compléter (I3 corrigée)
    // (l’apostrophe ajoutée à l’export devant = + - @ est retirée)
    const titreBrut = brut('titre');
    const titreSurUneLigne = titreBrut.replace(/[ \u00a0]*[\r\n\t\v\f]+[ \u00a0]*/g, ' ');
    let titre = titreSurUneLigne.trim().replace(/^'(?=[=+\-@])/, '');
    if (titre === '') {
      titre = `Titre à compléter (${repere.charAt(0).toLowerCase()}${repere.slice(1)})`;
      corriger(`titre vide → ${entreGuillemets(titre)}`);
    } else {
      if (titreSurUneLigne !== titreBrut) normaliserValeur('titre sur plusieurs lignes → une seule ligne');
      const longueur = nombreDeCaracteres(titre);
      if (longueur < TITRE_MIN) {
        titre = `${titre}${SUFFIXE_TITRE_COURT}`;
        corriger(`titre trop court (${longueur} caractère${longueur > 1 ? 's' : ''}, ${TITRE_MIN} minimum) → ${entreGuillemets(titre)}`);
      } else if (longueur > TITRE_MAX) {
        titre = raccourcirTitre(titre);
        corriger(`titre trop long (${longueur} caractères, ${TITRE_MAX} maximum) → raccourci à ${nombreDeCaracteres(titre)} caractères`);
      }
    }

    // type : code ou libellé, normalisé (I2) ; inconnu → type par défaut (I3 corrigée)
    const typeBrut = brut('type');
    let type = VALEURS_PAR_DEFAUT.type;
    if (typeBrut.trim() !== '') {
      const reconnu = valeurReconnue(TYPES, typeBrut);
      if (reconnu === undefined) corriger(`type inconnu (${entreGuillemets(typeBrut.trim())}) → "${type}" (par défaut)`);
      else { type = reconnu; if (typeBrut !== type) normaliserValeur(`type ${entreGuillemets(typeBrut)} → "${type}"`); }
    } else if (celluleVide('type')) normaliserValeur(`type vide → "${type}" (par défaut)`);

    // priorité : 1, 2 ou 3, ou son libellé (« Haute ») ; hors 1–3 → valeur la plus proche (I3 corrigée)
    const prioriteBrute = brut('priorite').trim();
    let priorite = VALEURS_PAR_DEFAUT.priorite;
    if (prioriteBrute !== '') {
      const nombre = Number(prioriteBrute.replace(',', '.'));
      const libelle = valeurReconnue(PRIORITES, prioriteBrute);
      const plusHaute = PRIORITES[0].valeur;
      const plusBasse = PRIORITES[PRIORITES.length - 1].valeur;
      if (/^\d+$/.test(prioriteBrute) && PRIORITES.some(element => element.valeur === nombre)) priorite = nombre;
      else if (libelle !== undefined) { priorite = libelle; normaliserValeur(`priorité ${entreGuillemets(prioriteBrute)} → ${priorite}`); }
      else if (Number.isFinite(nombre)) {
        priorite = Math.min(plusBasse, Math.max(plusHaute, Math.round(nombre)));
        corriger(`priorité ${entreGuillemets(prioriteBrute)} hors 1–3 → ${priorite} (valeur la plus proche)`);
      } else corriger(`priorité ${entreGuillemets(prioriteBrute)} inconnue → ${priorite} (par défaut)`);
    } else if (celluleVide('priorite')) normaliserValeur(`priorité vide → ${priorite} (par défaut)`);

    // statut : code ou libellé (I2) ; inconnu → 1re colonne
    const statutBrut = brut('statut');
    let statut = VALEURS_PAR_DEFAUT.statut;
    if (statutBrut.trim() !== '') {
      const reconnu = valeurReconnue(STATUTS, statutBrut);
      if (reconnu === undefined) corriger(`statut inconnu (${entreGuillemets(statutBrut.trim())}) → «\u00a0${COLONNE_BACKLOG.titre}\u00a0»`);
      else { statut = reconnu; if (statutBrut !== statut) normaliserValeur(`statut ${entreGuillemets(statutBrut)} → "${statut}"`); }
    } else if (celluleVide('statut')) normaliserValeur(`statut vide → «\u00a0${COLONNE_BACKLOG.titre}\u00a0» (par défaut)`);

    // points : vide ou « ? » = non estimé (I2) ; hors de la suite → carte supérieure,
    // 13 au-delà, non estimé si la valeur n’est pas un nombre positif
    const pointsBruts = brut('points').trim();
    let points = VALEURS_PAR_DEFAUT.points;
    if (pointsBruts !== '') {
      const valeur = Number(pointsBruts.replace(',', '.'));
      if (MOTS_NON_ESTIME.includes(normaliser(pointsBruts))) {
        points = null;
        if (valeurs.points !== null) normaliserValeur(`points ${entreGuillemets(pointsBruts)} → null`);
      } else if (POINTS.includes(valeur) && /^\d+$/.test(pointsBruts)) points = valeur;
      else if (Number.isFinite(valeur) && valeur > 0) {
        points = POINTS.find(carte => carte >= valeur) ?? POINTS[POINTS.length - 1];
        corriger(`points ${entreGuillemets(pointsBruts)} hors de la suite ${POINTS.join(', ')} → ${points} (${valeur > POINTS[POINTS.length - 1] ? 'plus grande carte' : 'carte supérieure'})`);
      } else corriger(`points ${entreGuillemets(pointsBruts)} hors de la suite ${POINTS.join(', ')} → non estimé`);
    }

    // creeLe : AAAA-MM-JJ, ou JJ/MM/AAAA convertie ; vide = aujourd’hui ; invalide ou futur → aujourd’hui
    const dateBrute = brut('creeLe').trim();
    let creeLe = dateDuJour;
    if (dateBrute !== '') {
      const dateFrancaise = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(dateBrute);
      const lue = dateFrancaise ? `${dateFrancaise[3]}-${dateFrancaise[2].padStart(2, '0')}-${dateFrancaise[1].padStart(2, '0')}` : dateBrute;
      if (!dateIsoValide(lue)) corriger(`date invalide (${entreGuillemets(dateBrute)}) → date du jour (${dateDuJour})`);
      else if (lue > dateDuJour) corriger(`date de création dans le futur (${entreGuillemets(dateBrute)}) → date du jour (${dateDuJour})`);
      else { creeLe = lue; if (dateFrancaise) normaliserValeur(`date ${entreGuillemets(dateBrute)} → ${creeLe}`); }
    }
    // assigne : facultatif ; trop long → raccourci
    let assigne = brut('assigne').replace(/\s+/g, ' ').trim() || null;
    if (assigne && nombreDeCaracteres(assigne) > ASSIGNE_MAX) {
      const longueur = nombreDeCaracteres(assigne);
      assigne = Array.from(assigne).slice(0, ASSIGNE_MAX).join('').trim();
      corriger(`personne assignée trop longue (${longueur} caractères, ${ASSIGNE_MAX} maximum) → ${entreGuillemets(assigne)}`);
    }
    return { donnees: { id, titre, type, priorite, points, statut, creeLe, assigne }, erreurs, ajustements, idInvalide };
  }

  // Bilan exact affiché par le rapport : « 4 importés · 2 rejetés »
  const bilanImport = (nombreImportes, nombreRejetes) =>
    `${nombreImportes} importé${nombreImportes > 1 ? 's' : ''} · ${nombreRejetes} rejeté${nombreRejetes > 1 ? 's' : ''}`;

  // importerTickets(lignes, existants[, options]) → rapport d’import :
  //   { bilan: "4 importés · 2 rejetés",
  //     importes:    [tickets conformes au modèle et aux règles, prêts à être ajoutés],
  //     rejets:      [{ numero, repere, motif }]                         (élément qui n’est pas un ticket),
  //     ajustements: [{ numero, repere, id, details: [{ texte, nature }] }] (corrections et normalisations),
  //     prochainId }
  //   Objectif : importer toutes les lignes. Une valeur qui enfreint une règle est corrigée
  //   (et la correction expliquée) ; seul un élément qui n’est pas un ticket est rejeté.
  //   lignes    : ce que renvoie parserCSV (ou parserJSON)
  //   existants : les tickets déjà présents ; ils ne sont ni modifiés ni écrasés (I4)
  //   options   : numerosPris (id déjà utilisés ailleurs ; par défaut ceux de « existants »),
  //               numerosAEviter (id à ne jamais attribuer automatiquement, par exemple ceux
  //               de tickets supprimés ; par défaut numerosPris),
  //               prochainId (premier numéro à essayer pour un nouvel id ; par défaut :
  //               le plus grand id existant + 1 ; un id lu dans le fichier ne le fait pas avancer),
  //               dateDuJour (pour les lignes sans date ; à fournir pour un résultat
  //               entièrement reproductible, sinon la date du jour est prise).
  function importerTickets(lignes, existants, options = {}) {
    const listeExistants = Array.isArray(existants) ? existants : [];
    const pris = new Set(options.numerosPris || listeExistants.map(ticket => ticket.id));
    const aEviter = new Set([...pris, ...(options.numerosAEviter || [])]);
    const prochainId = options.prochainId || listeExistants.reduce((maximum, ticket) => Math.max(maximum, ticket.id), 0) + 1;
    const dateDuJour = options.dateDuJour || aujourdhuiIso();
    const importes = [];
    const rejets = [];
    const ajustements = [];
    // Les id valides du fichier sont réservés : un nouvel id ne prendra jamais celui d’une ligne suivante
    const idsDuFichier = new Set((lignes || [])
      .map(({ valeurs }) => String(valeurs.id ?? '').trim()).filter(valeur => /^\d+$/.test(valeur) && Number(valeur) <= ID_MAX).map(Number));
    let ticketsSimules = listeExistants.slice();
    let numeroLibre = prochainId;
    for (const { numero, repere, valeurs, corrections = [] } of lignes || []) {
      const conversion = convertirEnregistrement(valeurs, dateDuJour, repere);                 // I2 et I3
      if (conversion.erreurs.length) { rejets.push({ numero, repere, motif: conversion.erreurs.join(' ; ') }); continue; }
      const { donnees } = conversion;
      const details = [...corrections.map(texte => ({ texte, nature: 'correction' })), ...conversion.ajustements];
      const corriger = texte => details.push({ texte, nature: 'correction' });

      // I4 : l’id du fichier s’il est valide et libre, sinon un nouvel id ; aucun ticket n’est jamais écrasé
      const idDuFichierLibre = Number.isInteger(donnees.id) && !pris.has(donnees.id);
      let id = donnees.id;
      if (!idDuFichierLibre) {
        while (pris.has(numeroLibre) || aEviter.has(numeroLibre) || idsDuFichier.has(numeroLibre)) numeroLibre++;
        id = numeroLibre;
        if (conversion.idInvalide !== null) corriger(`id ${entreGuillemets(conversion.idInvalide)} invalide (entier de 1 à ${ID_MAX.toLocaleString('fr-FR')} attendu) → nouvel id ${id}`);
        else if (donnees.id !== null) corriger(`id ${donnees.id} déjà pris → nouvel id ${id}`);
        else if (valeurs.id !== undefined && valeurs.id !== null) details.push({ texte: `id vide → nouvel id ${id}`, nature: 'normalisation' });
      }
      let ticket = construireTicket({ ...donnees, id });

      // R2 puis R1 : la colonne est corrigée plutôt que la ligne rejetée
      if (ticket.statut !== COLONNE_BACKLOG.id) {
        const statutDemande = ticket.statut;
        const titreDemande = libelleDe(STATUTS, statutDemande);
        const essayer = statut => deplacerTicket([...ticketsSimules, { ...ticket, statut: origineDArrivee(statut) }], ticket.id, statut);
        let essai = essayer(statutDemande);
        if (!essai.ok && /^Definition of Ready/.test(essai.erreur)) {
          // R2 : un ticket non estimé reste dans la 1re colonne
          ticket = { ...ticket, statut: COLONNE_BACKLOG.id };
          corriger(`non estimé, ne peut pas être «\u00a0${titreDemande}\u00a0» (Definition of Ready) → «\u00a0${COLONNE_BACKLOG.titre}\u00a0»`);
        } else if (!essai.ok) {
          // R1 : colonne pleine → la colonne précédente qui a de la place
          const erreurWip = essai.erreur;
          let rang = COLONNES.findIndex(colonne => colonne.id === statutDemande);
          while (!essai.ok && rang > 0) { rang -= 1; essai = essayer(COLONNES[rang].id); }
          ticket = { ...ticket, statut: COLONNES[rang].id };
          corriger(`${erreurWip} dans «\u00a0${titreDemande}\u00a0» → «\u00a0${COLONNES[rang].titre}\u00a0»`);
        }
      }
      const erreursModele = validerTicket(ticket, pris);           // filet de sécurité : le modèle exact
      if (Object.keys(erreursModele).length) { rejets.push({ numero, repere, motif: Object.values(erreursModele).join(' ') }); continue; }

      ticketsSimules = [...ticketsSimules, ticket];
      importes.push(ticket);
      pris.add(ticket.id);
      if (!idDuFichierLibre) numeroLibre = id + 1;                // numéro attribué ici : on passe au suivant
      if (details.length) ajustements.push({ numero, repere, id: ticket.id, details });
    }
    // prochainId ne suit que les numéros attribués ici : un id 999 999 venu du fichier ne bloque pas la suite
    return { bilan: bilanImport(importes.length, rejets.length), importes, rejets, ajustements, prochainId: Math.max(prochainId, numeroLibre) };
  }

  // Nom de fichier lisible : « taskflow-refonte-de-l-espace-client-2026-11-03.csv »
  function nomDeFichier(nomProjet, dateIso, extension) {
    const base = normaliser(nomProjet).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60) || 'projet';
    return `taskflow-${base}-${dateIso}.${extension}`;
  }


  /* ========================================================================
     JS 5b · SPRINTS ET BURNDOWN — FONCTIONS PURES (B1, docs/spec.md)
     Un sprint : { id, nom, debut, fin, capacite, statut, releves, bilan, clotureLe },
     rangé dans projet.sprints ; un ticket y appartient par ticket.sprintId.
     – Un sprintId qui désigne un sprint clôturé est un historique : pour toutes
       les règles, le ticket est « hors sprint ».
     – Points engagés = tous les tickets du sprint, terminés compris ;
       points restants = ceux qui ne sont pas dans la dernière colonne.
     – Les dates sont comptées en UTC : le changement d’heure ne décale rien.
     Pièges couverts : capacité atteinte pile (acceptée), ticket non estimé
     (refusé), sprint d’un seul jour (n = 1 : aucune division par zéro).
     ======================================================================== */
  const JOUR_EN_MS = 24 * 60 * 60 * 1000;
  const COLONNE_TERMINE = COLONNES[COLONNES.length - 1];
  const estTermine = ticket => ticket.statut === COLONNE_TERMINE.id;
  const pointsDe = ticket => (typeof ticket.points === 'number' ? ticket.points : 0);
  const listeDeSprints = sprints => (Array.isArray(sprints) ? sprints.filter(sprint => sprint && typeof sprint === 'object') : []);
  const sprintDeNumero = (sprints, id) => listeDeSprints(sprints).find(sprint => sprint.id === id) || null;
  // Le sprint OUVERT d’un ticket, ou null (hors sprint, ou sprint clôturé)
  function sprintOuvertDe(ticket, sprints) {
    if (!ticket || ticket.sprintId === null || ticket.sprintId === undefined) return null;
    const sprint = sprintDeNumero(sprints, ticket.sprintId);
    return sprint && sprint.statut === SPRINT_OUVERT ? sprint : null;
  }
  // B5.1 · Sprints en cours (« démarrés ») : ouverts et commencés, même après leur date de fin tant qu’ils ne sont pas clôturés
  const sprintsEnCours = (sprints, aujourdhui) => listeDeSprints(sprints).filter(sprint => sprint.statut === SPRINT_OUVERT && sprint.debut <= aujourdhui);
  // B5.2 à B5.5 · Tickets du Kanban : pendant un sprint, seulement les siens (terminés compris) ; sans sprint en cours, tous.
  // → { sprints, tickets, horsSprint } (tickets : les objets reçus, dans l’ordre reçu)
  function ticketsDuKanban(tickets, sprints, aujourdhui) {
    const liste = Array.isArray(tickets) ? tickets : [];
    const enCours = sprintsEnCours(sprints, aujourdhui);
    if (!enCours.length) return { sprints: [], tickets: liste.slice(), horsSprint: 0 };
    const numeros = new Set(enCours.map(sprint => sprint.id));
    const affiches = liste.filter(ticket => ticket && numeros.has(ticket.sprintId));
    return { sprints: enCours, tickets: affiches, horsSprint: liste.length - affiches.length };
  }
  // B6 · Démarrage d’un sprint : ses tickets « Backlog » passent « À faire », UNE fois (sprint.demarreLe)
  const COLONNE_A_FAIRE = COLONNES[1];
  // demarrerSprints(tickets, sprints, aujourdhui) → { tickets, sprints, demarres: [{ sprintId, tickets }] }
  // Démarre chaque sprint en cours (B5.1) qui n’a pas encore démarré ; rien à démarrer → mêmes tableaux.
  function demarrerSprints(tickets, sprints, aujourdhui) {
    const aDemarrer = sprintsEnCours(sprints, aujourdhui).filter(sprint => !sprint.demarreLe);
    if (!aDemarrer.length) return { tickets, sprints, demarres: [] };
    let nouveaux = Array.isArray(tickets) ? tickets : [];
    const demarres = [];
    for (const sprint of aDemarrer) {
      const passes = [];
      for (const ticket of nouveaux) {
        if (!ticket || ticket.sprintId !== sprint.id || ticket.statut !== COLONNE_BACKLOG.id) continue;
        const essai = deplacerTicket(nouveaux, ticket.id, COLONNE_A_FAIRE.id);   // mêmes règles qu’un déplacement à la main
        if (essai.ok) { nouveaux = essai.tickets; passes.push(ticket.id); }
      }
      demarres.push({ sprintId: sprint.id, tickets: passes });
    }
    const numeros = new Set(aDemarrer.map(sprint => sprint.id));
    return { tickets: nouveaux, sprints: listeDeSprints(sprints).map(sprint => (numeros.has(sprint.id) ? { ...sprint, demarreLe: aujourdhui } : sprint)), demarres };
  }
  // B6.5 · Ticket mis dans un sprint déjà démarré : « Backlog » → « À faire » ; sinon le tableau reçu, inchangé
  function aFaireSiSprintDemarre(tickets, sprints, idTicket) {
    const liste = Array.isArray(tickets) ? tickets : [];
    const ticket = liste.find(element => element && element.id === idTicket);
    const sprint = ticket ? sprintOuvertDe(ticket, sprints) : null;
    if (!sprint || !sprint.demarreLe || ticket.statut !== COLONNE_BACKLOG.id) return liste;
    const essai = deplacerTicket(liste, idTicket, COLONNE_A_FAIRE.id);
    return essai.ok ? essai.tickets : liste;
  }
  const ticketsDuSprint = (tickets, sprint) => (Array.isArray(tickets) ? tickets : []).filter(ticket => ticket && ticket.sprintId === sprint.id);
  const pointsEngages = (tickets, sprint) => ticketsDuSprint(tickets, sprint).reduce((total, ticket) => total + pointsDe(ticket), 0);
  const pointsRestants = (tickets, sprint) => ticketsDuSprint(tickets, sprint).filter(ticket => !estTermine(ticket)).reduce((total, ticket) => total + pointsDe(ticket), 0);
  const refus = erreur => ({ ok: false, erreur });
  const listeInvalide = tickets => !Array.isArray(tickets) || tickets.some(element => !element);

  // Dates « AAAA-MM-JJ » → minuit UTC (jamais l’heure locale : pas de jour de 23 h ou de 25 h)
  function jourUtc(dateIso) {
    const [annee, mois, jour] = String(dateIso).split('-').map(Number);
    return Date.UTC(annee, mois - 1, jour);
  }
  // nombreDeJours('2026-11-04', '2026-11-04') → 1 : bornes incluses
  const nombreDeJours = (debut, fin) => Math.round((jourUtc(fin) - jourUtc(debut)) / JOUR_EN_MS) + 1;
  function datePlusJours(dateIso, jours) {
    const date = new Date(jourUtc(dateIso) + jours * JOUR_EN_MS);
    return Number.isNaN(date.getTime()) ? String(dateIso) : date.toISOString().slice(0, 10);
  }

  // Vérifie les champs d’un sprint → { champ: message } (vide si tout est correct)
  function verifierSprint(donnees) {
    const erreurs = {};
    const nom = typeof donnees.nom === 'string' ? donnees.nom.trim() : '';
    const longueur = nombreDeCaracteres(nom);
    if (longueur < SPRINT_NOM_MIN || longueur > SPRINT_NOM_MAX) erreurs.nom = `Le nom du sprint fait de ${SPRINT_NOM_MIN} à ${SPRINT_NOM_MAX} caractères.`;
    const debutValide = dateIsoValide(donnees.debut);
    if (!debutValide) erreurs.debut = 'La date de début doit être au format AAAA-MM-JJ.';
    if (!dateIsoValide(donnees.fin)) erreurs.fin = 'La date de fin doit être au format AAAA-MM-JJ.';
    else if (debutValide && donnees.fin < donnees.debut) erreurs.fin = 'La fin ne peut pas précéder le début.';
    else if (debutValide && nombreDeJours(donnees.debut, donnees.fin) > SPRINT_JOURS_MAX) erreurs.fin = `Un sprint dure au plus ${SPRINT_JOURS_MAX} jours.`;
    if (!Number.isInteger(donnees.capacite) || donnees.capacite < 1 || donnees.capacite > SPRINT_CAPACITE_MAX) {
      erreurs.capacite = `La capacité est un nombre entier de points, de 1 à ${SPRINT_CAPACITE_MAX}.`;
    }
    return erreurs;
  }

  // B1.1 · creerSprint(sprints, { nom, debut, fin, capacite }) → { ok, sprints, sprint } ou { ok: false, erreurs }
  function creerSprint(sprints, donnees) {
    const liste = listeDeSprints(sprints);
    const erreurs = verifierSprint(donnees || {});
    if (Object.keys(erreurs).length) return { ok: false, erreurs };
    const id = liste.reduce((plusGrand, sprint) => (Number.isInteger(sprint.id) ? Math.max(plusGrand, sprint.id) : plusGrand), 0) + 1;
    const sprint = { id, nom: donnees.nom.trim(), debut: donnees.debut, fin: donnees.fin, capacite: donnees.capacite,
      statut: SPRINT_OUVERT, releves: {}, bilan: null, clotureLe: null, demarreLe: null };   // B6 : pas encore démarré
    return { ok: true, sprints: [...liste, sprint], sprint };
  }

  // B1.3 · ajouterAuSprint(tickets, sprints, idTicket, idSprint) → { ok, tickets } ou { ok: false, erreur }
  // Contrôles : liste, ticket, sprint, sprint clôturé, déjà dans ce sprint, Definition of Ready, terminé, capacité.
  function ajouterAuSprint(tickets, sprints, idTicket, idSprint) {
    if (listeInvalide(tickets)) return refus('Liste de tickets invalide');
    const ticket = tickets.find(element => element.id === idTicket);
    if (!ticket) return refus(`Ticket introuvable (id ${idTicket})`);
    const sprint = sprintDeNumero(sprints, idSprint);
    if (!sprint) return refus(`Sprint introuvable (id ${idSprint})`);
    if (sprint.statut !== SPRINT_OUVERT) return refus('Sprint clôturé\u00a0: on ne peut plus le modifier');
    if (ticket.sprintId === sprint.id) return { ok: true, tickets: tickets.slice() };          // déjà dedans : pas compté deux fois
    if (typeof ticket.points !== 'number') return refus(`Definition of Ready\u00a0: le ticket #${idTicket} n’est pas estimé`);
    if (estTermine(ticket)) return refus(`Le ticket #${idTicket} est déjà terminé`);
    const total = pointsEngages(tickets, sprint) + ticket.points;
    if (total > sprint.capacite) return refus(`Capacité dépassée (${total}/${sprint.capacite} points)`);   // pile = accepté
    return { ok: true, tickets: tickets.map(element => (element.id === idTicket ? { ...element, sprintId: sprint.id } : element)) };
  }

  // B1.4 · retirerDuSprint(tickets, sprints, idTicket) → { ok, tickets } ou { ok: false, erreur }
  function retirerDuSprint(tickets, sprints, idTicket) {
    if (listeInvalide(tickets)) return refus('Liste de tickets invalide');
    const ticket = tickets.find(element => element.id === idTicket);
    if (!ticket) return refus(`Ticket introuvable (id ${idTicket})`);
    if (!sprintOuvertDe(ticket, sprints)) return refus(`Le ticket #${idTicket} n’est dans aucun sprint ouvert`);
    return { ok: true, tickets: tickets.map(element => (element.id === idTicket ? { ...element, sprintId: null } : element)) };
  }

  // B1.6 · cloturerSprint(tickets, sprints, idSprint, aujourdhui) → { ok, tickets, sprints, retournes } ou { ok: false, erreur }
  // Le non-terminé revient dans la colonne Backlog, hors sprint ; le terminé garde son sprint (historique).
  function cloturerSprint(tickets, sprints, idSprint, aujourdhui) {
    if (listeInvalide(tickets)) return refus('Liste de tickets invalide');
    const sprint = sprintDeNumero(sprints, idSprint);
    if (!sprint) return refus(`Sprint introuvable (id ${idSprint})`);
    if (sprint.statut !== SPRINT_OUVERT) return refus('Sprint clôturé\u00a0: on ne peut plus le modifier');
    const engage = pointsEngages(tickets, sprint);
    const restant = pointsRestants(tickets, sprint);
    const retournes = [];
    const nouveaux = tickets.map(ticket => {
      if (ticket.sprintId !== sprint.id || estTermine(ticket)) return ticket;
      retournes.push(ticket.id);
      return { ...ticket, statut: COLONNE_BACKLOG.id, sprintId: null };
    });
    // Dernier relevé : à la date de clôture, ou à la fin du sprint si on clôture plus tard ; aucun avant le début
    const releves = { ...(sprint.releves || {}) };
    if (aujourdhui >= sprint.debut) releves[aujourdhui < sprint.fin ? aujourdhui : sprint.fin] = restant;
    const clos = { ...sprint, statut: SPRINT_CLOTURE, releves, bilan: { engage, termine: engage - restant, restant }, clotureLe: aujourdhui };
    return { ok: true, tickets: nouveaux, sprints: listeDeSprints(sprints).map(element => (element === sprint ? clos : element)), retournes };
  }

  // B1.8 · noterReleve(sprint, tickets, aujourdhui) → le sprint avec le relevé du jour (nouvel objet),
  // ou le même sprint s’il n’est pas ouvert, pas en cours aujourd’hui, ou si le relevé est déjà à jour
  function noterReleve(sprint, tickets, aujourdhui) {
    if (!sprint || sprint.statut !== SPRINT_OUVERT || aujourdhui < sprint.debut || aujourdhui > sprint.fin) return sprint;
    const restant = pointsRestants(tickets, sprint);
    if (sprint.releves && sprint.releves[aujourdhui] === restant) return sprint;
    return { ...sprint, releves: { ...(sprint.releves || {}), [aujourdhui]: restant } };
  }

  // B1.7 · calculerBurndown(sprint, tickets, aujourdhui) → { jours, engage, ideal, restant }
  //   n = nombre de jours (≥ 1) ; ideal et restant ont n + 1 valeurs : indice 0 = début du 1er jour,
  //   indice k = fin du jour k. ideal[k] = engagé × (n − k) / n : n ≥ 1, donc jamais de division par zéro.
  //   restant : engagé au début ; ensuite le relevé du jour (ou le dernier relevé précédent), la valeur
  //   actuelle pour aujourd’hui (sprint ouvert), null pour le futur et après la clôture.
  function calculerBurndown(sprint, tickets, aujourdhui) {
    const jours = nombreDeJours(sprint.debut, sprint.fin);
    const n = Number.isInteger(jours) && jours >= 1 ? jours : 1;
    const liste = (Array.isArray(tickets) ? tickets : []).filter(Boolean);
    const ouvert = sprint.statut === SPRINT_OUVERT;
    const bilan = sprint.bilan && typeof sprint.bilan === 'object' ? sprint.bilan : {};
    const engage = ouvert ? pointsEngages(liste, sprint) : (Number.isFinite(bilan.engage) ? bilan.engage : 0);
    const arrondi = valeur => Math.round(valeur * 100) / 100;
    const ideal = Array.from({ length: n + 1 }, (_, rang) => arrondi((engage * (n - rang)) / n));
    const releves = sprint.releves && typeof sprint.releves === 'object' ? sprint.releves : {};
    const limite = !ouvert && dateIsoValide(sprint.clotureLe) && sprint.clotureLe < aujourdhui ? sprint.clotureLe : aujourdhui;
    const restantActuel = pointsRestants(liste, sprint);
    const listeDesJours = Array.from({ length: n }, (_, rang) => datePlusJours(sprint.debut, rang));
    const restant = [engage];
    let report = engage;
    for (const jour of listeDesJours) {
      if (Number.isFinite(releves[jour])) report = releves[jour];
      if (jour > limite) restant.push(null);
      else if (ouvert && jour === aujourdhui) restant.push(restantActuel);
      else restant.push(report);
    }
    return { jours: listeDesJours, engage, ideal, restant };
  }

  // Relit les sprints d’une sauvegarde : un sprint aux dates, à la durée ou à la capacité invalides est écarté ;
  // un nom invalide est remplacé ; relevés et bilan sont nettoyés (nombres finis, positifs).
  function lireSprints(brut) {
    const sprints = [];
    const vus = new Set();
    const positif = valeur => (Number.isFinite(valeur) && valeur >= 0 ? valeur : 0);
    for (const element of Array.isArray(brut) ? brut : []) {
      if (!element || typeof element !== 'object' || !Number.isInteger(element.id) || element.id < 1 || vus.has(element.id)) continue;
      const erreurs = verifierSprint(element);
      if (erreurs.debut || erreurs.fin || erreurs.capacite) continue;
      const statut = element.statut === SPRINT_CLOTURE ? SPRINT_CLOTURE : SPRINT_OUVERT;
      const releves = {};
      if (element.releves && typeof element.releves === 'object') {
        for (const [jour, valeur] of Object.entries(element.releves)) if (dateIsoValide(jour) && Number.isFinite(valeur) && valeur >= 0) releves[jour] = valeur;
      }
      const bilanBrut = element.bilan && typeof element.bilan === 'object' ? element.bilan : {};
      vus.add(element.id);
      sprints.push({ id: element.id, nom: erreurs.nom ? `Sprint ${element.id}` : element.nom.trim(), debut: element.debut, fin: element.fin, capacite: element.capacite,
        statut, releves,
        bilan: statut === SPRINT_CLOTURE ? { engage: positif(bilanBrut.engage), termine: positif(bilanBrut.termine), restant: positif(bilanBrut.restant) } : null,
        clotureLe: statut === SPRINT_CLOTURE ? (dateIsoValide(element.clotureLe) ? element.clotureLe : element.fin) : null,
        demarreLe: dateIsoValide(element.demarreLe) ? element.demarreLe : null });   // B6.7c : abîmé → null
    }
    return sprints;
  }

  /* ========================================================================
     JS 5c · DÉPENDANCES ET BLOCAGES — FONCTIONS PURES (B2, docs/spec.md)
     ticket.bloquePar : les numéros des tickets du même projet qu’il attend.
     « A bloqué par B » se note A → B (A attend B).
     – Un cycle (A → B → C → A, ou A → A) est refusé, et le message l’affiche.
     – Règle R6 (dans deplacerTicket) : un ticket qui a un bloquant actif
       (non terminé) n’entre pas dans la zone de travail : la colonne marquée
       debutTravail (« En cours ») et toutes les colonnes suivantes.
     ======================================================================== */
  const RANG_DEBUT_TRAVAIL = COLONNES.findIndex(colonne => colonne.debutTravail);   // -1 : aucune zone de travail
  const FORMAT_BLOQUANTS = 'Écrivez des numéros de tickets séparés par des virgules (ex.\u00a0: 3, 5).';

  // Numéros des bloquants non terminés, dans l’ordre de déclaration ; un numéro inconnu est ignoré
  function bloquantsActifs(ticket, tickets) {
    const liste = Array.isArray(tickets) ? tickets : [];
    return (ticket && Array.isArray(ticket.bloquePar) ? ticket.bloquePar : []).filter(numero => {
      const bloquant = liste.find(element => element && element.id === numero);
      return !!bloquant && !estTermine(bloquant);
    });
  }

  // Plus court chemin d’attente de « depart » jusqu’à « arrivee » (parcours en largeur), ou null.
  // aretes(id) → les numéros qu’attend le ticket id.
  function cheminDAttente(aretes, depart, arrivee) {
    const precedent = new Map([[depart, null]]);
    const file = [depart];
    while (file.length) {
      const courant = file.shift();
      if (courant === arrivee) {
        const chemin = [];
        for (let etape = courant; etape !== null; etape = precedent.get(etape)) chemin.unshift(etape);
        return chemin;
      }
      for (const suivant of aretes(courant)) if (!precedent.has(suivant)) { precedent.set(suivant, courant); file.push(suivant); }
    }
    return null;
  }
  function aretesDe(tickets) {
    const parNumero = new Map(tickets.map(ticket => [ticket.id, ticket]));
    return id => {
      const ticket = parNumero.get(id);
      return ticket && Array.isArray(ticket.bloquePar) ? ticket.bloquePar.filter(numero => parNumero.has(numero)) : [];
    };
  }

  // B2.1 à B2.3 · definirBloquants(tickets, id, bloquePar) → { ok, tickets } ou { ok: false, erreur }
  function definirBloquants(tickets, id, bloquePar) {
    if (listeInvalide(tickets)) return refus('Liste de tickets invalide');
    const ticket = tickets.find(element => element.id === id);
    if (!ticket) return refus(`Ticket introuvable (id ${id})`);
    if (!Array.isArray(bloquePar) || bloquePar.some(numero => !Number.isInteger(numero) || numero < 1)) return refus('Liste de bloquants invalide');
    const liste = [...new Set(bloquePar)];                                       // doublons retirés, ordre gardé
    const inconnu = liste.find(numero => numero !== id && !tickets.some(element => element.id === numero));
    if (inconnu !== undefined) return refus(`Ticket bloquant introuvable (id ${inconnu})`);
    // Cycle : le nouveau bloquant attend déjà (même indirectement) le ticket modifié
    const aretes = aretesDe(tickets);
    for (const numero of liste) {
      const chemin = numero === id ? [id] : cheminDAttente(aretes, numero, id);
      if (chemin) return refus(`Cycle refusé\u00a0: ${[id, ...chemin].map(element => `#${element}`).join(' → ')}`);
    }
    return { ok: true, tickets: tickets.map(element => (element.id === id ? { ...element, bloquePar: liste } : element)) };
  }

  // B2.6 · Après une suppression : plus aucun ticket ne cite « id » ; les autres restent les mêmes objets
  const retirerDesBloquants = (tickets, id) => tickets.map(ticket => (Array.isArray(ticket.bloquePar) && ticket.bloquePar.includes(id)
    ? { ...ticket, bloquePar: ticket.bloquePar.filter(numero => numero !== id) } : ticket));

  // B2.7d · Sauvegarde abîmée : seuls restent les liens vers un autre ticket du même projet, sans doublon,
  // et qui ne ferment pas de cycle (dans l’ordre des tickets : le lien qui ferme le cycle est retiré)
  function nettoyerBloquants(tickets) {
    const numeros = new Set(tickets.map(ticket => ticket.id));
    const gardes = new Map();
    const aretes = id => gardes.get(id) || [];
    return tickets.map(ticket => {
      const brut = Array.isArray(ticket.bloquePar) ? ticket.bloquePar : [];
      const liste = [];
      gardes.set(ticket.id, liste);
      for (const numero of brut) {
        if (!Number.isInteger(numero) || numero === ticket.id || !numeros.has(numero) || liste.includes(numero)) continue;
        if (cheminDAttente(aretes, numero, ticket.id)) continue;                 // fermerait un cycle
        liste.push(numero);
      }
      return JSON.stringify(liste) === JSON.stringify(brut) ? ticket : { ...ticket, bloquePar: liste };
    });
  }

  // B8.1 · Les bloquants d’un ticket, dans l’ordre de déclaration : [{ id, titre, statut, termine }] ; inconnus ignorés
  function listeDesBloquants(ticket, tickets) {
    const liste = Array.isArray(tickets) ? tickets : [];
    return (ticket && Array.isArray(ticket.bloquePar) ? ticket.bloquePar : [])
      .map(numero => liste.find(element => element && element.id === numero)).filter(Boolean)
      .map(bloquant => ({ id: bloquant.id, titre: bloquant.titre, statut: bloquant.statut, termine: estTermine(bloquant) }));
  }
  // B8.4 et B8.5 · Choix du formulaire : tous les autres tickets, triés par numéro → [{ id, titre, statut, choisi, possible, raison }]
  // Un choix qui fermerait un cycle est impossible ; raison = le message de definirBloquants (le cycle). id null = nouveau ticket.
  function choixDeBloquants(tickets, id) {
    const liste = (Array.isArray(tickets) ? tickets : []).filter(Boolean);
    const ticket = id === null ? null : liste.find(element => element.id === id) || null;
    const choisis = ticket && Array.isArray(ticket.bloquePar) ? ticket.bloquePar : [];
    return liste.filter(element => element.id !== id).sort((a, b) => a.id - b.id).map(candidat => {
      const choisi = choisis.includes(candidat.id);
      const essai = ticket && !choisi ? definirBloquants(liste, id, [candidat.id]) : { ok: true };
      return { id: candidat.id, titre: candidat.titre, statut: candidat.statut, choisi, possible: essai.ok, raison: essai.ok ? '' : essai.erreur };
    });
  }
  // B8.6 · Résumé de la liste du formulaire : « Aucun », « 1 ticket : #4 », « 2 tickets : #4, #6 »
  const resumeDesBloquantsChoisis = numeros => (numeros.length ? `${pluriel(numeros.length, 'ticket')}\u00a0: ${numeros.map(numero => `#${numero}`).join(', ')}` : 'Aucun');

  /* ========================================================================
     JS 5d · ÉCHÉANCES ET CALENDRIER — FONCTIONS PURES (B3, docs/spec.md)
     ticket.echeance : « AAAA-MM-JJ » ou null.
     Pièges couverts :
     – la date du jour est TOUJOURS reçue en paramètre (aujourdhui) : rien ne lit l’horloge ;
     – les mois s’écrivent « AAAA-MM » de 01 à 12 : l’indice 0–11 de Date ne sort jamais d’ici ;
     – « 31 janvier + 1 mois » = 28 (ou 29) février : le jour est ramené au dernier jour du mois ;
     – les jours sont comptés en UTC (pas de jour de 23 h ou 25 h au changement d’heure).
     ======================================================================== */
  const URGENCES = ['retard', 'proche', 'sans'];               // valeurs du filtre « Urgence »
  const LIBELLES_URGENCE = { retard: 'En retard', proche: 'Bientôt (J-2)', sans: 'Sans échéance' };
  const JOURS_PROCHES = 2;                                      // « J-2 » : de 0 à 2 jours

  // B3.2 · urgence(ticket, aujourdhui) → { niveau, jours, libelle }
  function urgence(ticket, aujourdhui) {
    if (!ticket || !dateIsoValide(ticket.echeance)) return { niveau: 'aucune', jours: null, libelle: '' };
    const jours = nombreDeJours(aujourdhui, ticket.echeance) - 1;  // 0 le jour même, négatif si passée
    if (estTermine(ticket)) return { niveau: 'terminee', jours, libelle: '' };
    if (jours < 0) return { niveau: 'retard', jours, libelle: 'En retard' };
    if (jours === 0) return { niveau: 'aujourdhui', jours, libelle: 'Aujourd’hui' };
    if (jours <= JOURS_PROCHES) return { niveau: 'proche', jours, libelle: `J-${jours}` };
    return { niveau: 'plus-tard', jours, libelle: '' };
  }

  // B3.3 · Filtre « Urgence » : un ticket passe s’il correspond à l’une des valeurs choisies (aucune = tous)
  function correspondAUrgence(ticket, urgences, aujourdhui) {
    if (!urgences || !urgences.size) return true;
    const { niveau } = urgence(ticket, aujourdhui);
    return (urgences.has('retard') && niveau === 'retard')
      || (urgences.has('proche') && (niveau === 'aujourdhui' || niveau === 'proche'))
      || (urgences.has('sans') && niveau === 'aucune');
  }

  // B3.3 · Tri par échéance : sans échéance toujours en dernier, quel que soit le sens
  function comparerEcheances(ticketA, ticketB, sens = 1) {
    const a = dateIsoValide(ticketA.echeance) ? ticketA.echeance : null;
    const b = dateIsoValide(ticketB.echeance) ? ticketB.echeance : null;
    if (a === b) return 0;
    if (a === null) return 1;
    if (b === null) return -1;
    return (a < b ? -1 : 1) * sens;
  }

  // B3.4 · ajouterMois('2026-01-31', 1) → '2026-02-28' : le jour est ramené au dernier jour du mois d’arrivée
  const joursDansLeMois = (annee, mois) => new Date(Date.UTC(annee, mois, 0)).getUTCDate();   // mois de 1 à 12
  function ajouterMois(dateIso, nombre) {
    const [annee, mois, jour] = dateIso.split('-').map(Number);
    const rang = annee * 12 + (mois - 1) + nombre;             // mois comptés depuis l’an 0, de 0 à 11 seulement ici
    const anneeArrivee = Math.floor(rang / 12);
    const moisArrivee = rang - anneeArrivee * 12 + 1;          // retour de 0–11 à 1–12
    const jourArrivee = Math.min(jour, joursDansLeMois(anneeArrivee, moisArrivee));
    return `${String(anneeArrivee).padStart(4, '0')}-${String(moisArrivee).padStart(2, '0')}-${String(jourArrivee).padStart(2, '0')}`;
  }
  const moisValide = mois => typeof mois === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(mois);
  const moisDe = dateIso => dateIso.slice(0, 7);                // « 2026-11-04 » → « 2026-11 »
  const ajouterAuMois = (mois, nombre) => moisDe(ajouterMois(`${mois}-01`, nombre));

  // B3.5 · grilleDuMois('2026-11', tickets) → { mois, semaines: [[{ date, dansLeMois, tickets }, … 7], …] } ou null
  // Semaines du lundi au dimanche ; la grille déborde sur les mois voisins pour être complète.
  function grilleDuMois(mois, tickets) {
    if (!moisValide(mois)) return null;
    const premier = `${mois}-01`;
    const [annee, numero] = mois.split('-').map(Number);
    const dernier = `${mois}-${String(joursDansLeMois(annee, numero)).padStart(2, '0')}`;
    const jourDeLaSemaine = dateIso => (new Date(jourUtc(dateIso)).getUTCDay() + 6) % 7;   // lundi 0 … dimanche 6
    const debut = datePlusJours(premier, -jourDeLaSemaine(premier));
    const fin = datePlusJours(dernier, 6 - jourDeLaSemaine(dernier));
    const parDate = new Map();
    for (const ticket of Array.isArray(tickets) ? tickets : []) {
      if (!ticket || !dateIsoValide(ticket.echeance)) continue;
      if (!parDate.has(ticket.echeance)) parDate.set(ticket.echeance, []);
      parDate.get(ticket.echeance).push(ticket.id);
    }
    const semaines = [];
    for (let date = debut; date <= fin; date = datePlusJours(date, 1)) {
      if (jourDeLaSemaine(date) === 0) semaines.push([]);
      semaines[semaines.length - 1].push({ date, dansLeMois: date.startsWith(`${mois}-`), tickets: parDate.get(date) || [] });
    }
    return { mois, semaines };
  }

  // B3.6 · resumeDesRetards(tickets, aujourdhui) → { total, colonnes: [{ id, titre, nombre }] } (toutes sauf « Terminé »)
  function resumeDesRetards(tickets, aujourdhui) {
    const liste = (Array.isArray(tickets) ? tickets : []).filter(Boolean);
    const colonnes = COLONNES.slice(0, -1).map(colonne => ({ id: colonne.id, titre: colonne.titre,
      nombre: liste.filter(ticket => ticket.statut === colonne.id && urgence(ticket, aujourdhui).niveau === 'retard').length }));
    return { total: colonnes.reduce((total, colonne) => total + colonne.nombre, 0), colonnes };
  }

  /* ########################################################################
     ZONE 3 · UI (état de l’application, page, actions de l’utilisateur, sauvegarde)
     ######################################################################## */

  /* ========================================================================
     JS 6 · ÉTAT DE L’APPLICATION ET ACTIONS SUR LES DONNÉES
     ======================================================================== */

  // Filtres sans aucune sélection (chaque groupe de puces est un ensemble de valeurs)
  const filtresVides = () => ({
    texte: '', numero: '', du: '', au: '',
    types: new Set(), priorites: new Set(), points: new Set(), statuts: new Set(),
    mesTickets: false,             // seulement les tickets assignés à la personne indiquée dans « Je suis »
    urgences: new Set()            // B3 : 'retard', 'proche' (J-2), 'sans' (sans échéance)
  });

  // Tri par défaut : priorité (haute en premier), puis points (1 → 13, non estimés en bas)
  const triParDefaut = () => [{ critere: 'priorite', sens: 'asc' }, { critere: 'points', sens: 'asc' }];

  const etat = {
    projets: [],                   // [{ id, nom, tickets, ordreManuel }]
    projetActifId: null,
    prochainIdTicket: 1,           // ne redescend jamais : un numéro supprimé n’est jamais réattribué
    numerosAttribues: new Set(),   // tous les numéros déjà donnés (créés, importés, même supprimés depuis)
    prochainIdProjet: 1,
    filtres: filtresVides(),
    tri: triParDefaut(),           // critères de tri dans l’ordre d’importance : [{ critere, sens }]
    vue: 'backlog',                // vue affichée : 'backlog' (liste) ou 'kanban'
    utilisateur: '',               // « Je suis » : sert au filtre « Mes tickets »
    sprintAfficheId: null,         // B1 : sprint affiché dans la section « Sprints » (non sauvegardé)
    moisAffiche: null              // B3 : mois de la vue Calendrier « AAAA-MM » (null = mois du jour ; non sauvegardé)
  };

  const projetActif = () => etat.projets.find(projet => projet.id === etat.projetActifId);

  // Numéros déjà utilisés, tous projets confondus (un numéro est unique)
  function numerosUtilises() {
    const numeros = new Set();
    for (const projet of etat.projets) for (const ticket of projet.tickets) numeros.add(ticket.id);
    return numeros;
  }

  // Prochain numéro pour un nouveau ticket : jamais un numéro déjà attribué, même supprimé depuis
  function prochainNumeroLibre() {
    let numero = etat.prochainIdTicket;
    while (etat.numerosAttribues.has(numero)) numero++;
    return numero;
  }
  const retenirNumeros = tickets => { for (const ticket of tickets) etat.numerosAttribues.add(ticket.id); };
  // Numéros à ne jamais redonner automatiquement : ceux d’aujourd’hui et ceux déjà attribués
  const numerosAEviter = () => new Set([...numerosUtilises(), ...etat.numerosAttribues]);

  // Ajoute un ticket au projet actif ; renvoie { ok, ticket } ou { ok: false, erreurs }
  function ajouterTicket(donnees) {
    if (donnees.bloquePar === null) return { ok: false, erreurs: { bloquePar: FORMAT_BLOQUANTS } };
    const ticket = construireTicket({ ...donnees, id: prochainNumeroLibre(), creeLe: aujourdhuiIso() });
    const erreurs = validerTicket(ticket, numerosUtilises());
    if (Object.keys(erreurs).length) return { ok: false, erreurs };
    const projet = projetActif();
    // B2 : les bloquants doivent exister dans le projet (un nouveau ticket ne peut pas fermer de cycle)
    const verification = definirBloquants([...projet.tickets, { ...ticket, statut: COLONNE_BACKLOG.id }], ticket.id, ticket.bloquePar);
    if (!verification.ok) return { ok: false, erreurs: { bloquePar: verification.erreur } };
    // Un nouveau ticket respecte aussi R1 et R2 : on simule son arrivée dans sa colonne
    if (ticket.statut !== COLONNE_BACKLOG.id) {
      const essai = deplacerTicket([...projet.tickets, { ...ticket, statut: COLONNE_BACKLOG.id }], ticket.id, ticket.statut);
      if (!essai.ok) return { ok: false, erreurs: { statut: expliquerRefusFormulaire(essai.erreur, ticket.statut) } };
    }
    projet.tickets = [...projet.tickets, ticket];                   // nouveau tableau, jamais de modification sur place
    if (projet.ordreManuel) projet.ordreManuel = [...projet.ordreManuel, ticket.id];    // en ordre personnalisé, il arrive en bas
    etat.numerosAttribues.add(ticket.id);
    etat.prochainIdTicket = ticket.id + 1;
    return { ok: true, ticket };
  }

  // Note un changement de colonne dans le journal du projet (avant : état d’avant le déplacement)
  const instantane = projet => ({ tickets: projet.tickets, ordreManuel: projet.ordreManuel ? [...projet.ordreManuel] : null,
    ordreAffiche: ordonner([...projet.tickets], projet).map(ticket => ticket.id) });
  function noterDeplacement(projet, id, de, vers, avant) {
    projet.journal = journaliser(projet.journal, entreeDeJournal(avant, projet, id, de, vers, new Date().toISOString()));
  }
  // Changement de place (dans la liste ou dans une colonne), noté au journal comme un déplacement
  function changerDePlace(id, idVoisin, position, idsVisibles) {
    const projet = projetActif();
    const avant = instantane(projet);
    if (!reordonnerTicket(id, idVoisin, position, idsVisibles)) return false;
    const ticket = projet.tickets.find(element => element.id === id);
    noterDeplacement(projet, id, ticket.statut, ticket.statut, avant);
    return true;
  }

  // Modifie un ticket du projet actif ; renvoie { ok, ticket, inchange } ou { ok: false, erreurs }
  function enregistrerModification(id, changements) {
    const projet = projetActif();
    const ancien = projet.tickets.find(element => element.id === id);
    let tickets = projet.tickets;
    if (changements.bloquePar === null) return { ok: false, erreurs: { bloquePar: FORMAT_BLOQUANTS } };
    if (Array.isArray(changements.bloquePar)) {
      const bloquants = definirBloquants(tickets, id, changements.bloquePar);
      if (!bloquants.ok) return { ok: false, erreurs: { bloquePar: /^Cycle/.test(bloquants.erreur) ? `${bloquants.erreur}. Retirez l’un de ces liens.` : bloquants.erreur } };
      tickets = bloquants.tickets;
    }
    const resultat = modifierTicket(tickets, id, changements, projet.sprints);
    if (!resultat.ok) return resultat;
    const inchange = JSON.stringify(ancien) === JSON.stringify(resultat.ticket);
    const avant = instantane(projet);
    if (!inchange) projet.tickets = resultat.tickets;   // nouveau tableau ; l’ordre personnalisé reste valable (même id)
    if (!inchange && ancien.statut !== resultat.ticket.statut) noterDeplacement(projet, id, ancien.statut, resultat.ticket.statut, avant);
    return { ok: true, ticket: resultat.ticket, inchange };
  }

  // Supprime un ticket du projet actif ; renvoie le ticket supprimé (ou null)
  function supprimerTicket(id) {
    const projet = projetActif();
    const ticket = projet.tickets.find(element => element.id === id);
    if (!ticket) return null;
    projet.tickets = retirerDesBloquants(projet.tickets.filter(element => element.id !== id), id);   // B2.6 : plus aucune référence
    if (projet.ordreManuel) projet.ordreManuel = projet.ordreManuel.filter(numero => numero !== id);
    delete projet.notesImport[id];
    return ticket;
  }

  /* ---------- Mentions « Corrigé à l’import » ----------
     Elles ne font pas partie du modèle de ticket (le ticket reste exactement
     { id, titre, type, priorite, points, statut, creeLe }) : elles sont rangées à côté,
     dans projet.notesImport, et disparaissent quand la personne confirme les avoir vues. */
  const noteImportDe = id => projetActif().notesImport[id] || null;
  function retirerNotesImport(ids) {
    const notes = projetActif().notesImport;
    let retirees = 0;
    for (const id of ids) if (notes[id]) { delete notes[id]; retirees++; }
    return retirees;
  }

  // Réinitialise le projet actif : « vider » (aucun ticket) ou « demo » (les 12 tickets de départ).
  // L’ordre personnalisé et les filtres sont effacés ; les critères de tri sont gardés.
  function reinitialiserProjet(mode) {
    const projet = projetActif();
    const numerosDesAutresProjets = new Set();
    for (const autre of etat.projets) if (autre !== projet) for (const ticket of autre.tickets) numerosDesAutresProjets.add(ticket.id);
    let tickets = [];
    if (mode === 'demo') {
      // Les tickets de départ gardent leur numéro s’il est libre (sinon : nouveau numéro, comme à l’import)
      const rapport = importerTickets(TICKETS_INITIAUX.map((ticket, rang) => ({ numero: rang + 1, repere: `Ticket ${rang + 1}`, valeurs: ticket })), [],
        { numerosPris: numerosDesAutresProjets, numerosAEviter: etat.numerosAttribues, prochainId: etat.prochainIdTicket, dateDuJour: aujourdhuiIso() });
      tickets = rapport.importes;
      retenirNumeros(tickets);
      etat.prochainIdTicket = Math.max(etat.prochainIdTicket, rapport.prochainId);
    }
    projet.tickets = tickets;
    projet.ordreManuel = null;
    projet.notesImport = {};
    projet.journal = [];
    projet.sprints = [];                                // B1.12 : les sprints du projet sont effacés avec ses tickets
    etat.sprintAfficheId = null;
    etat.filtres = filtresVides();
    return projet;
  }

  // Renvoie un message d’erreur, ou une chaîne vide si le nom du projet convient
  function verifierNomProjet(nom) {
    const nomNettoye = nom.trim();
    const longueur = nombreDeCaracteres(nomNettoye);
    if (!longueur) return 'Le nom du projet est obligatoire.';
    if (longueur < NOM_PROJET_MIN) return `Nom trop court\u00a0: ${longueur} caractère${longueur > 1 ? 's' : ''}, il en faut au moins ${NOM_PROJET_MIN}.`;
    if (longueur > NOM_PROJET_MAX) return `Nom trop long\u00a0: ${longueur} caractères, ${NOM_PROJET_MAX} au maximum.`;
    if (etat.projets.some(projet => normaliser(projet.nom) === normaliser(nomNettoye))) return 'Un projet porte déjà ce nom.';
    return '';
  }

  function creerProjet(nom) {
    const projet = { id: etat.prochainIdProjet++, nom: nom.trim(), tickets: [], ordreManuel: null, notesImport: {}, journal: [], sprints: [] };
    etat.projets.push(projet);
    return projet;
  }


  /* ========================================================================
     JS 7 · RECHERCHE TOLÉRANTE
     « LOGIN », « Login » ou « logni » trouvent « login » ; les accents sont ignorés.
     Optimisation : les mots de chaque titre et les comparaisons déjà faites
     sont mis en cache, car la recherche s’exécute à chaque lettre tapée.
     ======================================================================== */

  // Minuscules, sans accents (« Téléchargement » → « telechargement »)
  function normaliser(texte) {
    return String(texte).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/œ/g, 'oe').replace(/æ/g, 'ae');
  }
  // Un mot = une suite de lettres ou une suite de chiffres (« Erreur500 » donne « erreur » et « 500 »)
  const MOTIF_MOT = /[\p{L}\p{M}]+|\p{N}+/gu;
  const mots = texte => normaliser(texte).match(MOTIF_MOT) || [];

  const motsParTitre = new Map();              // cache : titre → mots normalisés
  function motsDuTitre(titre) {
    let resultat = motsParTitre.get(titre);
    if (!resultat) { resultat = mots(titre); motsParTitre.set(titre, resultat); }
    return resultat;
  }

  // Distance de Damerau-Levenshtein restreinte : nombre de fautes entre deux mots
  // (lettre en trop, en moins, remplacée, ou deux lettres inversées = 1 faute).
  // Optimisation : on ne garde que les 3 dernières lignes du tableau de calcul.
  function distanceEntreMots(motA, motB) {
    if (!motA.length) return motB.length;
    if (!motB.length) return motA.length;
    let ligneAvantPrecedente = null;
    let lignePrecedente = Array.from({ length: motB.length + 1 }, (_, colonne) => colonne);
    for (let i = 1; i <= motA.length; i++) {
      const ligneCourante = [i];
      for (let j = 1; j <= motB.length; j++) {
        const cout = motA[i - 1] === motB[j - 1] ? 0 : 1;
        let valeur = Math.min(lignePrecedente[j] + 1, ligneCourante[j - 1] + 1, lignePrecedente[j - 1] + cout);
        if (i > 1 && j > 1 && motA[i - 1] === motB[j - 2] && motA[i - 2] === motB[j - 1]) {
          valeur = Math.min(valeur, ligneAvantPrecedente[j - 2] + 1);   // deux lettres inversées
        }
        ligneCourante[j] = valeur;
      }
      ligneAvantPrecedente = lignePrecedente;
      lignePrecedente = ligneCourante;
    }
    return lignePrecedente[motB.length];
  }

  // Fautes tolérées selon la longueur du mot tapé : aucune sous 4 lettres, 1 jusqu’à 7, 2 au-delà
  const fautesTolerees = longueur => (longueur >= 8 ? 2 : longueur >= 4 ? 1 : 0);

  function comparerMots(motTape, motDuTitre) {
    if (motDuTitre.includes(motTape)) return true;                 // correspondance exacte ou partielle
    const maximum = fautesTolerees(motTape.length);
    if (!maximum) return false;
    if (Math.abs(motDuTitre.length - motTape.length) <= maximum && distanceEntreMots(motTape, motDuTitre) <= maximum) return true;
    if (motTape.length >= 5) {                                     // mot du titre plus long : pluriel, saisie en cours…
      for (let longueur = motTape.length; longueur <= motTape.length + maximum && longueur < motDuTitre.length; longueur++) {
        if (distanceEntreMots(motTape, motDuTitre.slice(0, longueur)) <= maximum) return true;
      }
    }
    return false;
  }

  const comparaisonsConnues = new Map();       // cache : « motTapé|motDuTitre » → vrai / faux
  function motCorrespond(motTape, motDuTitre) {
    const cle = `${motTape}|${motDuTitre}`;
    let resultat = comparaisonsConnues.get(cle);
    if (resultat === undefined) {
      if (comparaisonsConnues.size > 20000) comparaisonsConnues.clear();   // garde le cache de taille raisonnable
      resultat = comparerMots(motTape, motDuTitre);
      comparaisonsConnues.set(cle, resultat);
    }
    return resultat;
  }

  // Chaque mot tapé doit correspondre à au moins un mot du titre
  function correspondARecherche(ticket, motsTapes) {
    if (!motsTapes.length) return true;
    const motsTitre = motsDuTitre(ticket.titre);
    return motsTapes.every(motTape => motsTitre.some(motTitre => motCorrespond(motTape, motTitre)));
  }


  /* ========================================================================
     JS 8 · FILTRES, TRI MULTIPLE ET ORDRE PERSONNALISÉ
     ======================================================================== */

  // Garde les tickets qui passent la recherche ET tous les filtres actifs
  function filtrer(tickets, motsTapes) {
    const filtres = etat.filtres;
    const numeroCherche = filtres.numero === '' ? null : Number(filtres.numero);
    const aujourdhui = aujourdhuiIso();
    return tickets.filter(ticket =>
      correspondARecherche(ticket, motsTapes) &&
      (numeroCherche === null || ticket.id === numeroCherche) &&
      (!filtres.types.size || filtres.types.has(ticket.type)) &&
      (!filtres.priorites.size || filtres.priorites.has(String(ticket.priorite))) &&
      (!filtres.points.size || filtres.points.has(clePoints(ticket.points))) &&
      (!filtres.statuts.size || filtres.statuts.has(ticket.statut)) &&
      (!filtres.du || ticket.creeLe >= filtres.du) &&
      (!filtres.au || ticket.creeLe <= filtres.au) &&
      (!filtres.mesTickets || (!!etat.utilisateur && normaliser(ticket.assigne || '') === normaliser(etat.utilisateur))) &&
      correspondAUrgence(ticket, filtres.urgences, aujourdhui)
    );
  }

  // Nombre de groupes de filtres utilisés (la recherche compte pour un)
  function nombreDeFiltresActifs(motsTapes) {
    const filtres = etat.filtres;
    return [
      motsTapes.length > 0, filtres.numero !== '',
      filtres.types.size > 0, filtres.priorites.size > 0, filtres.points.size > 0, filtres.statuts.size > 0,
      filtres.du !== '' || filtres.au !== '', filtres.mesTickets, filtres.urgences.size > 0
    ].filter(Boolean).length;
  }

  // Les tickets non estimés restent toujours en bas, quel que soit le sens du tri sur les points
  function comparerPoints(ticketA, ticketB, sens = 1) {
    if (ticketA.points === ticketB.points) return 0;
    if (ticketA.points === null) return 1;
    if (ticketB.points === null) return -1;
    return (ticketA.points - ticketB.points) * sens;
  }
  const comparerDates = (ticketA, ticketB) => (ticketA.creeLe < ticketB.creeLe ? -1 : ticketA.creeLe > ticketB.creeLe ? 1 : 0);
  const COMPARATEUR_TEXTE = new Intl.Collator('fr', { sensitivity: 'base', numeric: true });

  // Critères proposés dans le panneau de tri, dans cet ordre.
  // « asc » = croissant (ascendant), « desc » = décroissant (descendant).
  const CRITERES_TRI = {
    priorite: { nom: 'Priorité', phrase: 'priorité', asc: 'haute en premier', desc: 'basse en premier', comparer: (a, b) => a.priorite - b.priorite },
    points:   { nom: 'Points', phrase: 'points', asc: 'de 1 à 13', desc: 'de 13 à 1', comparer: null },   // cas particulier : comparerPoints
    titre:    { nom: 'Titre', phrase: 'titre', asc: 'de A à Z', desc: 'de Z à A', comparer: (a, b) => COMPARATEUR_TEXTE.compare(a.titre, b.titre) },
    type:     { nom: 'Type', phrase: 'type', asc: 'Story, Bug puis Tâche', desc: 'Tâche, Bug puis Story', comparer: (a, b) => rangDans(TYPES, a.type) - rangDans(TYPES, b.type) },
    statut:   { nom: 'Statut', phrase: 'statut', asc: 'de Backlog à Terminé', desc: 'de Terminé à Backlog', comparer: (a, b) => rangDans(STATUTS, a.statut) - rangDans(STATUTS, b.statut) },
    creeLe:   { nom: 'Date de création', phrase: 'date de création', asc: 'du plus ancien au plus récent', desc: 'du plus récent au plus ancien', comparer: comparerDates },
    id:       { nom: 'N° de ticket', phrase: 'numéro', asc: 'du plus petit au plus grand', desc: 'du plus grand au plus petit', comparer: (a, b) => a.id - b.id },
    echeance: { nom: 'Échéance', phrase: 'échéance', asc: 'la plus proche en premier', desc: 'la plus lointaine en premier', comparer: null }   // B3 : comparerEcheances
  };

  // Compare deux tickets critère par critère ; le numéro départage les égalités restantes
  function creerComparateur(criteres) {
    return (ticketA, ticketB) => {
      for (const { critere, sens } of criteres) {
        const signe = sens === 'desc' ? -1 : 1;
        const ecart = critere === 'points'
          ? comparerPoints(ticketA, ticketB, signe)
          : critere === 'echeance'
            ? comparerEcheances(ticketA, ticketB, signe)        // sans échéance toujours en dernier
            : CRITERES_TRI[critere].comparer(ticketA, ticketB) * signe;
        if (ecart) return ecart;
      }
      return ticketA.id - ticketB.id;
    };
  }
  const triIdentique = (triA, triB) => triA.length === triB.length
    && triA.every((element, rang) => element.critere === triB[rang].critere && element.sens === triB[rang].sens);
  const copieDuTri = () => etat.tri.map(element => ({ ...element }));

  // « par priorité (haute en premier), puis par points (de 1 à 13) »
  const descriptionDuTri = () => etat.tri
    .map((element, rang) => `${rang ? 'puis ' : ''}par ${CRITERES_TRI[element.critere].phrase} (${CRITERES_TRI[element.critere][element.sens]})`)
    .join(', ');

  // Ordre d’affichage : l’ordre personnalisé s’il existe, sinon les critères de tri.
  // Trie la liste reçue sur place : on lui passe toujours une copie.
  function ordonner(liste, projet) {
    if (projet.ordreManuel) {
      const positions = new Map(projet.ordreManuel.map((id, rang) => [id, rang]));
      const position = ticket => (positions.has(ticket.id) ? positions.get(ticket.id) : Number.MAX_SAFE_INTEGER);
      return liste.sort((a, b) => position(a) - position(b) || a.id - b.id);
    }
    return liste.sort(creerComparateur(etat.tri));
  }

  // Place un ticket juste avant ou juste après un autre ; passe le projet en ordre personnalisé.
  // « idsVisibles » (facultatif) : tickets que l’utilisateur voit (liste filtrée, colonne du Kanban).
  // Si leur ordre ne change pas, rien n’est modifié : l’ordre trié est conservé.
  // Renvoie false si rien ne change.
  function reordonnerTicket(id, idCible, position, idsVisibles = null) {
    const projet = projetActif();
    if (id === idCible) return false;
    const ordreActuel = ordonner([...projet.tickets], projet).map(ticket => ticket.id);
    if (!ordreActuel.includes(id) || !ordreActuel.includes(idCible)) return false;
    const nouvelOrdre = ordreActuel.filter(numero => numero !== id);
    nouvelOrdre.splice(nouvelOrdre.indexOf(idCible) + (position === 'apres' ? 1 : 0), 0, id);
    if (nouvelOrdre.every((numero, rang) => numero === ordreActuel[rang])) return false;
    if (idsVisibles) {
      const visibles = new Set(idsVisibles);
      const ordreVisibleAvant = ordreActuel.filter(numero => visibles.has(numero));
      const ordreVisibleApres = nouvelOrdre.filter(numero => visibles.has(numero));
      if (ordreVisibleApres.every((numero, rang) => numero === ordreVisibleAvant[rang])) return false;
    }
    projet.ordreManuel = nouvelOrdre;
    return true;
  }


  /* ========================================================================
     JS 9 · ÉLÉMENTS DE LA PAGE ET ICÔNES
     Les éléments sont cherchés une seule fois ici, puis réutilisés.
     ======================================================================== */
  const trouver = selecteur => document.querySelector(selecteur);
  const trouverTous = selecteur => [...document.querySelectorAll(selecteur)];

  const page = {
    // En-tête et titre
    choixProjet: trouver('#projet'),
    boutonNouveauProjet: trouver('#btn-nouveau-projet'),
    titreProjet: trouver('#titre-projet'),
    choixTheme: trouver('.theme'),
    boutonsTheme: trouverTous('[data-theme-choix]'),
    // Graphiques
    grapheStatuts: trouver('#graph-statut'),
    sousTitreStatuts: trouver('#graph-statut-sous'),
    resumeStatuts: trouver('#graph-statut-resume'),
    grapheColonnes: trouver('#graph-colonnes'),
    sousTitreColonnes: trouver('#graph-colonnes-sous'),
    resumeColonnes: trouver('#graph-colonnes-resume'),
    graphePriorites: trouver('#graph-prio'),
    sousTitrePriorites: trouver('#graph-prio-sous'),
    resumePriorites: trouver('#graph-prio-resume'),
    // Onglets et vues
    ongletsVues: trouver('.vues-onglets'),
    onglets: trouverTous('[data-vue]'),
    vueBacklog: trouver('#vue-backlog'),
    vueKanban: trouver('#vue-kanban'),
    kanban: trouver('#kanban'),
    // Recherche et filtres
    recherche: trouver('#recherche'),
    boutonAjouter: trouver('#btn-ajouter'),
    boutonImporter: trouver('#btn-importer'),
    boutonExporter: trouver('#btn-exporter'),
    boutonReinitialiser: trouver('#btn-reinitialiser'),
    rapportImport: trouver('#rapport-import'),
    fichierRapportImport: trouver('#rapport-import-fichier'),
    contenuRapportImport: trouver('#rapport-import-contenu'),
    boutonFermerRapport: trouver('#btn-fermer-rapport'),
    panneauFiltres: trouver('.filtres'),
    puces: [],                                   // remplies au démarrage (JS 14)
    filtreNumero: trouver('#filtre-id'),
    filtreDu: trouver('#filtre-du'),
    filtreAu: trouver('#filtre-au'),
    avertissementDates: trouver('#avert-dates'),
    boutonEffacerFiltres: trouver('#btn-reset'),
    nombreFiltres: trouver('#nb-filtres'),
    resumeFiltres: trouver('#resume-filtres'),
    // Tri
    panneauTri: trouver('#panneau-tri'),
    criteresTri: trouver('#niveaux'),
    boutonAjouterCritere: trouver('#btn-ajout-critere'),
    boutonTriParDefaut: trouver('#btn-tri-defaut'),
    bandeauOrdreManuel: trouver('#bandeau-manuel'),
    boutonReprendreTri: trouver('#btn-reprendre-tri'),
    resumeTri: trouver('#resume-tri'),
    enTeteTableau: trouver('thead'),
    enTetesTriables: trouverTous('th[data-col]'),
    compteurTickets: trouver('#stat-tickets'),
    sousCompteurTickets: trouver('#stat-tickets-sub'),
    compteurPoints: trouver('#stat-points'),
    sousCompteurPoints: trouver('#stat-points-sub'),
    compteurNonEstimes: trouver('#stat-ne'),
    sousCompteurNonEstimes: trouver('#stat-ne-sub'),
    blocNonEstimes: trouver('#stat-ne-bloc'),
    compteurAvancement: trouver('#stat-avancement'),
    sousCompteurAvancement: trouver('#stat-avancement-sub'),
    jaugeAvancement: trouver('#stat-avancement-jauge'),
    blocWip: trouver('#stat-wip-bloc'),
    titreWip: trouver('#stat-wip-titre'),
    compteurWip: trouver('#stat-wip'),
    sousCompteurWip: trouver('#stat-wip-sub'),
    jaugeWip: trouver('#stat-wip-jauge'),
    // Tableau des tickets
    conteneurTableau: trouver('.table-wrap'),
    tableau: trouver('#table'),
    liste: trouver('#liste'),
    messageListeVide: trouver('#vide'),
    phraseResultat: trouver('#resultat'),
    annonce: trouver('#annonce'),
    // Fenêtre « Ajouter / Modifier un ticket »
    fenetreTicket: trouver('#dlg-ticket'),
    formulaireTicket: trouver('#form-ticket'),
    titreFenetreTicket: trouver('#dlg-ticket-titre'),
    projetDuFormulaire: trouver('#dlg-ticket-projet'),
    boutonFermerTicket: trouver('#btn-fermer-ticket'),
    boutonValiderTicket: trouver('#btn-valider-ticket'),
    libelleNumero: trouver('#f-id-libelle'),
    numeroPrevu: trouver('#f-id'),
    datePrevue: trouver('#f-date'),
    noteDate: trouver('#f-date-note'),
    champTitre: trouver('#f-titre'),
    compteurTitre: trouver('#f-compteur'),
    choixType: trouver('#f-type'),
    choixPriorite: trouver('#f-priorite'),
    choixPoints: trouver('#f-points'),
    champStatut: trouver('#f-statut'),
    aideStatut: trouver('#f-statut-aide'),
    // Fenêtre de suppression
    fenetreSuppression: trouver('#dlg-suppr'),
    texteSuppression: trouver('#dlg-suppr-texte'),
    boutonConfirmerSuppression: trouver('#btn-confirmer-suppr'),
    // Fenêtre « Créer un projet »
    fenetreProjet: trouver('#dlg-projet'),
    formulaireProjet: trouver('#form-projet'),
    champNomProjet: trouver('#p-nom'),
    erreurNomProjet: trouver('#err-nom'),
    // Fenêtre « Exporter »
    fenetreExport: trouver('#dlg-export'),
    formulaireExport: trouver('#form-export'),
    projetExport: trouver('#export-projet'),
    aideFormatExport: trouver('#export-aide-format'),
    choixContenuExport: trouver('#export-choix-contenu'),
    libelleTousExport: trouver('#export-libelle-tous'),
    libelleAffichesExport: trouver('#export-libelle-affiches'),
    nomFichierExport: trouver('#export-nom-fichier'),
    erreurExport: trouver('#err-export'),
    boutonValiderExport: trouver('#btn-valider-export'),
    // Fenêtre « Importer »
    fenetreImport: trouver('#dlg-import'),
    formulaireImport: trouver('#form-import'),
    champFichierImport: trouver('#import-fichier'),
    champTexteImport: trouver('#import-texte'),
    boutonAnalyserTexte: trouver('#btn-analyser-texte'),
    avertissementRemplacement: trouver('#import-avertissement'),
    libelleRemplacerImport: trouver('#import-libelle-remplacer'),
    resumeImport: trouver('#import-resume'),
    choixDestinationImport: trouver('#import-destination'),
    libelleProjetActuelImport: trouver('#import-libelle-actuel'),
    blocNomProjetImport: trouver('#import-bloc-nom'),
    champNomProjetImport: trouver('#import-nom-projet'),
    erreurNomProjetImport: trouver('#err-import-nom'),
    erreurImport: trouver('#err-import'),
    boutonValiderImport: trouver('#btn-valider-import'),
    // Fenêtre « Réinitialiser »
    fenetreReinit: trouver('#dlg-reinit'),
    formulaireReinit: trouver('#form-reinit'),
    projetReinit: trouver('#reinit-projet'),
    avertissementReinit: trouver('#reinit-avertissement'),
    boutonExporterAvantReinit: trouver('#btn-reinit-exporter'),
    // Fenêtre « Corrigé à l’import » et rappel dans le formulaire
    fenetreNote: trouver('#dlg-note'),
    ticketDeLaNote: trouver('#note-ticket'),
    sourceDeLaNote: trouver('#note-source'),
    listeDeLaNote: trouver('#note-liste'),
    boutonNoteModifier: trouver('#btn-note-modifier'),
    boutonNoteOk: trouver('#btn-note-ok'),
    blocNoteFormulaire: trouver('#f-note'),
    listeNoteFormulaire: trouver('#f-note-liste'),
    caseNoteFormulaire: trouver('#f-note-ok'),
    // Sauvegarde, bandeau de chargement, guide
    etatSauvegarde: trouver('#etat-sauvegarde'),
    bandeauChargement: trouver('#bandeau-chargement'),
    titreBandeauChargement: trouver('#bandeau-chargement-titre'),
    texteBandeauChargement: trouver('#bandeau-chargement-texte'),
    boutonReinitialiserDemo: trouver('#btn-reinitialiser-demo'),
    fenetreDemo: trouver('#dlg-demo'),
    boutonConfirmerDemo: trouver('#btn-confirmer-demo'),
    boutonExporterAvantDemo: trouver('#btn-demo-exporter'),
    guide: trouver('#guide'),
    // Notification
    notification: trouver('#toast'),
    texteNotification: trouver('#toast-texte'),
    boutonNotification: trouver('#toast-action'),
    // Auto-tests
    panneauTests: trouver('.autotests'),
    bilanTests: trouver('#at-bilan'),
    listeTests: trouver('#at-liste'),
    noteTests: trouver('#at-note'),
    boutonRelancerTests: trouver('#btn-relancer-tests')
  };

  // Icônes (SVG en ligne : elles prennent la couleur du texte grâce à currentColor)
  const ICONES_TYPE = {
    story: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 2.2h8v11.6L8 10.9l-4 2.9z" stroke="currentColor" stroke-width="1.7" stroke-linejoin="round"/></svg>',
    bug: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><ellipse cx="8" cy="9.3" rx="3.4" ry="4.3" stroke="currentColor" stroke-width="1.6"/><path d="M8 5v8.6M4.6 9H1.8M14.2 9h-2.8M5.4 5.6 3.6 3.8M10.6 5.6l1.8-1.8M5 12.4l-1.8 1.8M11 12.4l1.8 1.8" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
    tache: '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="2.3" y="2.3" width="11.4" height="11.4" rx="2.6" stroke="currentColor" stroke-width="1.6"/><path d="M5.2 8.2l2 2 3.7-4.1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>'
  };
  const ICONE_HAUT = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 13V3.6M3.8 7.6 8 3.4l4.2 4.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICONE_BAS = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 3v9.4M3.8 8.4 8 12.6l4.2-4.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICONE_CROIX = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>';
  const ICONE_COCHE = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.6 8.4l2.9 2.9 5.9-6.6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICONE_POIGNEE = '<svg viewBox="0 0 10 16" aria-hidden="true"><g fill="currentColor"><circle cx="2.5" cy="2.5" r="1.5"/><circle cx="7.5" cy="2.5" r="1.5"/><circle cx="2.5" cy="8" r="1.5"/><circle cx="7.5" cy="8" r="1.5"/><circle cx="2.5" cy="13.5" r="1.5"/><circle cx="7.5" cy="13.5" r="1.5"/></g></svg>';
  const ICONE_IMPORTER = '<svg viewBox="0 0 20 20" fill="none" aria-hidden="true"><path d="M10 2.5v9.5M6 8l4 4 4-4M3.5 13.5v2.2c0 .9.7 1.6 1.6 1.6h9.8c.9 0 1.6-.7 1.6-1.6v-2.2" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICONE_OK_PETIT = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M3.6 8.4l2.9 2.9 5.9-6.6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICONE_INFO = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6.2" stroke="currentColor" stroke-width="1.5"/><path d="M8 7.2v4M8 4.8v.1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
  const ICONE_ALERTE = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M8 1.8l6.6 11.6H1.4z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M8 6.2v3.4M8 11.6v.1" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"/></svg>';
  const ICONE_CRAYON = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M10.9 2.6l2.5 2.5-8 8-3.3.8.8-3.3z" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><path d="M9.3 4.2l2.5 2.5" stroke="currentColor" stroke-width="1.5"/></svg>';
  const ICONE_POUBELLE = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M2.5 4.2h11M6.2 4.2V2.6h3.6v1.6M4 4.2l.7 9.3h6.6l.7-9.3M6.6 6.8v4.4M9.4 6.8v4.4" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const ICONE_GAUCHE = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M7.6 1.2 2.2 5l5.4 3.8z" fill="currentColor"/></svg>';
  const ICONE_DROITE = '<svg viewBox="0 0 10 10" aria-hidden="true"><path d="M2.4 1.2 7.8 5 2.4 8.8z" fill="currentColor"/></svg>';
  const ICONE_CADENAS = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="3.2" y="7" width="9.6" height="6.8" rx="1.6" stroke="currentColor" stroke-width="1.5"/><path d="M5.4 7V5.2a2.6 2.6 0 0 1 5.2 0V7" stroke="currentColor" stroke-width="1.5"/></svg>';


  /* ========================================================================
     JS 10 · AFFICHAGE
     rendre() redessine la page à partir de l’état. Optimisations :
     – les statistiques sont calculées une seule fois par affichage ;
     – seule la vue visible (Backlog ou Kanban) est reconstruite ;
     – un bloc n’est remplacé que si son contenu a réellement changé.
     ======================================================================== */

  // Remplace le contenu d’un élément seulement s’il a changé (évite un travail inutile au navigateur)
  const derniersContenus = new WeakMap();
  function remplacerContenu(element, html) {
    if (derniersContenus.get(element) === html) return;
    element.innerHTML = html;
    derniersContenus.set(element, html);
  }
  // À appeler quand le contenu a été modifié à la main (glisser-déposer, message de refus…)
  const oublierContenu = element => derniersContenus.delete(element);

  // Titre avec les mots trouvés par la recherche entourés de <mark>
  function titreSurligne(titre, motsTapes) {
    if (!motsTapes.length) return echapper(titre);
    let html = '';
    let fin = 0;
    for (const trouve of titre.matchAll(MOTIF_MOT)) {
      html += echapper(titre.slice(fin, trouve.index));
      const motNormalise = normaliser(trouve[0]);
      const correspond = motsTapes.some(motTape => motCorrespond(motTape, motNormalise));
      html += correspond ? `<mark>${echapper(trouve[0])}</mark>` : echapper(trouve[0]);
      fin = trouve.index + trouve[0].length;
    }
    return html + echapper(titre.slice(fin));
  }

  // Petits morceaux de HTML partagés par le tableau, le Kanban et la carte glissée
  const htmlType = ticket => `<span class="badge type-${ticket.type}">${ICONES_TYPE[ticket.type]}${libelleDe(TYPES, ticket.type)}</span>`;
  const htmlPriorite = (ticket, avecLibelle = true) =>
    `<span class="prio prio-${ticket.priorite}"><span class="prio-num">${ticket.priorite}</span>${avecLibelle ? ` ${libelleDe(PRIORITES, ticket.priorite)}` : ''}</span>`;
  const htmlPoints = ticket => (ticket.points === null
    ? '<span class="pts"><span class="carte-mini carte-mini-nv" aria-hidden="true">?</span><span class="nv-txt">Non estimé</span></span>'
    : `<span class="pts"><span class="carte-mini">${ticket.points}</span><span class="sr-only">point${ticket.points > 1 ? 's' : ''}</span></span>`);

  // Personne assignée, sous le titre (« vous » si c’est la personne indiquée dans « Je suis »)
  const ICONE_PERSONNE = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="5.4" r="2.6" stroke="currentColor" stroke-width="1.5"/><path d="M3 13.6c.6-2.6 2.6-3.9 5-3.9s4.4 1.3 5 3.9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  function htmlAssigne(ticket) {
    if (!ticket.assigne) return '';
    const moi = etat.utilisateur && normaliser(ticket.assigne) === normaliser(etat.utilisateur);
    return `<span class="assigne${moi ? ' is-moi' : ''}" title="Assigné à ${echapper(ticket.assigne)}">${ICONE_PERSONNE}${echapper(ticket.assigne)}${moi ? ' (vous)' : ''}</span>`;
  }

  // B8.2 · Badge 🔒 déroulant : « Bloqué par N » (N bloquants actifs) ; un bouton par bloquant ouvre sa fiche
  function htmlBloquants(ticket, tickets = projetActif().tickets) {
    const actifs = bloquantsActifs(ticket, tickets);
    if (!actifs.length) return '';
    const boutons = listeDesBloquants(ticket, tickets).map(bloquant => `<li><button type="button" class="bloque-ticket${bloquant.termine ? ' is-termine' : ''}" data-modifier="${bloquant.id}" aria-label="Ouvrir le ticket #${bloquant.id}">`
      + `<span class="bloque-num">#${bloquant.id}</span> ${echapper(bloquant.titre)} · ${echapper(libelleDe(STATUTS, bloquant.statut))}${bloquant.termine ? ' <span class="bloque-fini">(terminé)</span>' : ''}</button></li>`).join('');
    return `<details class="bloque"><summary title="Voir les tickets qui bloquent #${ticket.id}">${ICONE_CADENAS}Bloqué par ${actifs.length}</summary><ul class="bloque-liste">${boutons}</ul></details>`;
  }

  // Mention « Corrigé à l’import » : un bouton qui ouvre la liste des corrections du ticket
  function htmlMentionImport(ticket) {
    const note = projetActif().notesImport[ticket.id];
    if (!note) return '';
    return `<button type="button" class="mention-import" data-note-import="${ticket.id}" title="${pluriel(note.corrections.length, 'correction')} faite${note.corrections.length > 1 ? 's' : ''} à l’import : voir le détail"
      aria-label="Ticket #${ticket.id} corrigé à l’import : voir les ${pluriel(note.corrections.length, 'correction')}">${ICONE_ALERTE}Corrigé à l’import</button>`;
  }

  /* ---------- Tableau de bord : compteurs et indicateurs ---------- */
  // Change un chiffre, avec un petit rebond quand la valeur change (pas au premier affichage)
  function changerChiffre(chiffre, texte) {
    const ancienTexte = chiffre.textContent;
    chiffre.textContent = texte;
    if (ancienTexte !== '' && ancienTexte !== texte) {
      chiffre.classList.remove('is-maj');
      void chiffre.offsetWidth;                          // force le navigateur à relancer l’animation
      chiffre.classList.add('is-maj');
    }
  }
  function mettreAJourCompteur(chiffre, sousTitre, valeur, totalDuProjet, filtreActif) {
    changerChiffre(chiffre, String(valeur));
    sousTitre.textContent = filtreActif ? `sur ${totalDuProjet} dans le projet` : 'dans tout le projet';
  }

  // Avancement (points terminés / total) sur les tickets affichés ; WIP sur tout le projet
  function mettreAJourIndicateurs(statsAffichees, statsDuProjet) {
    changerChiffre(page.compteurAvancement, `${statsAffichees.avancement}\u00a0%`);
    page.sousCompteurAvancement.textContent = `${statsAffichees.pointsTermines} / ${statsAffichees.points} points terminés`;
    page.jaugeAvancement.style.width = `${statsAffichees.avancement}%`;
    page.blocWip.hidden = !COLONNE_LIMITEE;
    if (!COLONNE_LIMITEE) return;
    const colonne = statsDuProjet.colonnes.find(element => element.id === COLONNE_LIMITEE.id);
    const placesLibres = Math.max(0, colonne.wip - colonne.nombre);
    changerChiffre(page.compteurWip, `${colonne.nombre} / ${colonne.wip}`);
    page.sousCompteurWip.textContent = colonne.plein ? 'limite atteinte' : `${pluriel(placesLibres, 'place')} libre${placesLibres > 1 ? 's' : ''}`;
    page.blocWip.classList.toggle('is-plein', colonne.plein);
    // Une case par place disponible dans la colonne, remplie quand elle est prise
    remplacerContenu(page.jaugeWip, Array.from({ length: colonne.wip }, (_, rang) => `<span${rang < colonne.nombre ? ' class="is-pris"' : ''}></span>`).join(''));
    // Les autres colonnes limitées (« En revue »…), sur une ligne sous la jauge
    const autres = statsDuProjet.colonnes.filter(element => element.wip !== null && element.id !== COLONNE_LIMITEE.id);
    remplacerContenu(trouver('#stat-wip-autres'), autres.map(element =>
      `<span class="${element.plein ? 'is-plein' : ''}">«\u00a0${echapper(element.titre)}\u00a0»\u00a0: ${element.nombre} / ${element.wip}${element.plein ? ', limite atteinte' : ''}</span>`).join(' · '));
  }

  /* ---------- Graphiques ---------- */
  // Chemin SVG d’une part de camembert, de l’angle de départ à l’angle d’arrivée
  function partDeCamembert(centreX, centreY, rayon, angleDepart, angleArrivee) {
    const departX = centreX + rayon * Math.cos(angleDepart), departY = centreY + rayon * Math.sin(angleDepart);
    const arriveeX = centreX + rayon * Math.cos(angleArrivee), arriveeY = centreY + rayon * Math.sin(angleArrivee);
    const grandArc = angleArrivee - angleDepart > Math.PI ? 1 : 0;
    return `M${centreX},${centreY} L${departX.toFixed(2)},${departY.toFixed(2)} A${rayon},${rayon} 0 ${grandArc} 1 ${arriveeX.toFixed(2)},${arriveeY.toFixed(2)} Z`;
  }

  function rendreGraphiques(visibles, statsAffichees, filtreActif) {
    const total = visibles.length;
    const sousTitre = filtreActif ? `Sur les ${pluriel(total, 'ticket')} affiché${total > 1 ? 's' : ''}` : 'Sur tout le projet';
    for (const sousTitreGraphe of [page.sousTitreStatuts, page.sousTitreColonnes, page.sousTitrePriorites]) sousTitreGraphe.textContent = sousTitre;
    if (!total) {
      for (const resume of [page.resumeStatuts, page.resumeColonnes, page.resumePriorites]) resume.textContent = 'Aucun ticket à représenter.';
      for (const graphe of [page.grapheStatuts, page.grapheColonnes, page.graphePriorites]) remplacerContenu(graphe, '<p class="graph-vide">Aucun ticket à représenter.</p>');
      return;
    }

    // Camembert : une part par colonne, à partir des statistiques déjà calculées
    const parts = statsAffichees.colonnes;
    let angle = -Math.PI / 2;                              // on commence en haut du cercle
    let formes = '';
    for (const part of parts) {
      if (!part.nombre) continue;
      const angleSuivant = angle + (part.nombre / total) * 2 * Math.PI;
      const infobulle = `<title>${part.titre}\u00a0: ${pluriel(part.nombre, 'ticket')} (${part.pourcentage}\u00a0%)</title>`;
      formes += part.nombre === total
        ? `<circle class="part couleur-${part.id}" cx="80" cy="80" r="77">${infobulle}</circle>`
        : `<path class="part couleur-${part.id}" d="${partDeCamembert(80, 80, 77, angle, angleSuivant)}">${infobulle}</path>`;
      angle = angleSuivant;
    }
    const legende = parts.map(part =>
      `<li class="couleur-${part.id}${part.nombre ? '' : ' is-zero'}"><span class="pastille"></span><span class="legende-lib">${part.titre}</span><span class="legende-val">${part.nombre}</span><span class="legende-pct">${part.pourcentage}\u00a0%</span></li>`
    ).join('');
    const listeDesParts = parts.map(part => `${part.titre} ${part.nombre}`).join(', ');
    remplacerContenu(page.grapheStatuts, `<div class="camembert">
      <svg viewBox="0 0 160 160" role="img" aria-label="Camembert des tickets par statut\u00a0: ${listeDesParts}">${formes}</svg>
      <ul class="legende">${legende}</ul></div>`);
    page.resumeStatuts.textContent = `${listeDesParts} (${sousTitre.toLowerCase()}).`;

    // Barres : points par colonne (une barre par entrée de COLONNES), recalculées à chaque déplacement
    const maximumColonnes = Math.max(1, ...statsAffichees.colonnes.map(colonne => colonne.points));
    const barresDeColonnes = statsAffichees.colonnes.map(colonne => {
      const hauteur = colonne.points ? Math.max(4, Math.round((colonne.points / maximumColonnes) * 100)) : 0;
      const detail = `${pluriel(colonne.nombre, 'ticket')}${colonne.nonEstimes ? `, dont ${colonne.nonEstimes} non estimé${colonne.nonEstimes > 1 ? 's' : ''}` : ''}`;
      return `<div class="barre-col couleur-${colonne.id}">
          <div class="barre-zone"><span class="barre-val">${colonne.points}<small> pt${colonne.points > 1 ? 's' : ''}</small></span><span class="barre-rect" style="height:${hauteur}px"></span></div>
          <span class="barre-lib">${echapper(colonne.titre)}</span>
          <span class="barre-detail">${detail}</span>
        </div>`;
    }).join('');
    const listeDesColonnes = statsAffichees.colonnes.map(colonne => `${colonne.titre} ${pluriel(colonne.points, 'point')}`).join(', ');
    remplacerContenu(page.grapheColonnes, `<div class="barres" style="--nb-barres:${COLONNES.length}" role="img" aria-label="Barres des points par colonne\u00a0: ${listeDesColonnes}">${barresDeColonnes}</div>`);
    page.resumeColonnes.textContent = `${statsAffichees.colonnes.map(colonne => `${colonne.titre} ${pluriel(colonne.points, 'pt')}`).join(', ')} (${sousTitre.toLowerCase()}).`;

    // Barres : points de complexité par priorité (en un seul passage sur la liste)
    const barres = new Map(PRIORITES.map(priorite => [priorite.valeur, { ...priorite, points: 0, nombre: 0, nonEstimes: 0 }]));
    for (const ticket of visibles) {
      const barre = barres.get(ticket.priorite);
      barre.nombre += 1;
      if (ticket.points === null) barre.nonEstimes += 1;
      else barre.points += ticket.points;
    }
    const maximum = Math.max(1, ...[...barres.values()].map(barre => barre.points));
    const colonnesDeBarres = [...barres.values()].map(barre => {
      const hauteur = barre.points ? Math.max(4, Math.round((barre.points / maximum) * 100)) : 0;
      const detail = `${pluriel(barre.nombre, 'ticket')}${barre.nonEstimes ? `, dont ${barre.nonEstimes} non estimé${barre.nonEstimes > 1 ? 's' : ''}` : ''}`;
      return `<div class="barre-col couleur-p${barre.valeur}">
          <div class="barre-zone"><span class="barre-val">${barre.points}<small> pt${barre.points > 1 ? 's' : ''}</small></span><span class="barre-rect" style="height:${hauteur}px"></span></div>
          <span class="prio prio-${barre.valeur}"><span class="prio-num">${barre.valeur}</span> ${barre.libelle}</span>
          <span class="barre-detail">${detail}</span>
        </div>`;
    }).join('');
    const listeDesBarres = [...barres.values()].map(barre => `${barre.libelle} ${pluriel(barre.points, 'point')}`).join(', ');
    remplacerContenu(page.graphePriorites, `<div class="barres" role="img" aria-label="Barres des points par priorité\u00a0: ${listeDesBarres}">${colonnesDeBarres}</div>`);
    page.resumePriorites.textContent = `${[...barres.values()].map(barre => `${barre.libelle} ${pluriel(barre.points, 'pt')}`).join(', ')} (${sousTitre.toLowerCase()}).`;
  }

  /* ---------- Panneau de tri multiple ---------- */
  // Redessine la liste des critères ; « cleFocus » indique quel contrôle doit garder le focus
  function rendreCriteresTri(cleFocus) {
    const elementActif = document.activeElement;
    if (cleFocus === undefined && elementActif && page.criteresTri.contains(elementActif)) cleFocus = elementActif.dataset.cleFocus;
    const nombreDeCriteres = etat.tri.length;
    page.criteresTri.innerHTML = etat.tri.map((element, rang) => {
      const definition = CRITERES_TRI[element.critere];
      const options = Object.entries(CRITERES_TRI).map(([cle, autre]) => {
        const dejaUtilise = cle !== element.critere && etat.tri.some(critere => critere.critere === cle);
        return `<option value="${cle}"${cle === element.critere ? ' selected' : ''}${dejaUtilise ? ' disabled' : ''}>${autre.nom}${dejaUtilise ? ' (déjà utilisé)' : ''}</option>`;
      }).join('');
      return `<li class="niveau">
        <span class="niveau-num" aria-hidden="true">${rang + 1}</span>
        <span class="niveau-lib">${rang === 0 ? 'Trier par' : 'puis par'}</span>
        <span class="select select-col"><select class="input" data-niveau="${rang}" data-champ="critere" data-cle-focus="critere-${rang}" aria-label="Critère ${rang + 1}\u00a0: colonne">${options}</select></span>
        <span class="select select-sens"><select class="input" data-niveau="${rang}" data-champ="sens" data-cle-focus="sens-${rang}" aria-label="Critère ${rang + 1}\u00a0: ordre">
          <option value="asc"${element.sens === 'asc' ? ' selected' : ''}>Croissant (${definition.asc})</option>
          <option value="desc"${element.sens === 'desc' ? ' selected' : ''}>Décroissant (${definition.desc})</option>
        </select></span>
        <span class="niveau-btns">
          <button type="button" class="btn-icone" data-niveau="${rang}" data-operation="monter" data-cle-focus="monter-${rang}" aria-label="Rendre le critère ${rang + 1} plus important" title="Passer ce critère avant"${rang === 0 ? ' disabled' : ''}>${ICONE_HAUT}</button>
          <button type="button" class="btn-icone" data-niveau="${rang}" data-operation="descendre" data-cle-focus="descendre-${rang}" aria-label="Rendre le critère ${rang + 1} moins important" title="Passer ce critère après"${rang === nombreDeCriteres - 1 ? ' disabled' : ''}>${ICONE_BAS}</button>
          <button type="button" class="btn-icone" data-niveau="${rang}" data-operation="retirer" data-cle-focus="retirer-${rang}" aria-label="Retirer le critère ${rang + 1}" title="Retirer ce critère"${nombreDeCriteres === 1 ? ' disabled' : ''}>${ICONE_CROIX}</button>
        </span>
      </li>`;
    }).join('');
    page.boutonAjouterCritere.disabled = nombreDeCriteres >= Object.keys(CRITERES_TRI).length;
    if (cleFocus) {
      // Si le contrôle visé est désactivé ou a disparu, le focus va sur la liste du même critère
      let cible = page.criteresTri.querySelector(`[data-cle-focus="${cleFocus}"]`);
      if (!cible || cible.disabled) {
        const rang = Math.min(Number(String(cleFocus).split('-')[1]) || 0, nombreDeCriteres - 1);
        cible = page.criteresTri.querySelector(`[data-cle-focus="critere-${rang}"]`);
      }
      if (cible) cible.focus();
    }
  }

  // Tout changement de tri reprend l’ordre trié : l’ordre personnalisé est abandonné
  function changerTri(nouveauxCriteres, cleFocus) {
    etat.tri = nouveauxCriteres;
    projetActif().ordreManuel = null;
    rendreCriteresTri(cleFocus);
    rendre();
  }

  // Résumé affiché quand le panneau Filtres est réduit
  function resumeDesFiltres(motsTapes) {
    const filtres = etat.filtres;
    const morceaux = [];
    const libellesChoisis = (liste, ensemble) => liste.filter(element => ensemble.has(String(element.valeur))).map(element => element.libelle).join(', ');
    if (motsTapes.length) morceaux.push(`recherche «\u00a0${filtres.texte.trim()}\u00a0»`);
    if (filtres.types.size) morceaux.push(`type\u00a0: ${libellesChoisis(TYPES, filtres.types)}`);
    if (filtres.priorites.size) morceaux.push(`priorité\u00a0: ${libellesChoisis(PRIORITES, filtres.priorites)}`);
    if (filtres.points.size) {
      const points = [...POINTS.map(String), NON_ESTIME].filter(valeur => filtres.points.has(valeur));
      morceaux.push(`points\u00a0: ${points.map(valeur => (valeur === NON_ESTIME ? 'non estimé' : valeur)).join(', ')}`);
    }
    if (filtres.statuts.size) morceaux.push(`statut\u00a0: ${libellesChoisis(STATUTS, filtres.statuts)}`);
    if (filtres.urgences.size) morceaux.push(`urgence\u00a0: ${URGENCES.filter(valeur => filtres.urgences.has(valeur)).map(valeur => LIBELLES_URGENCE[valeur]).join(', ')}`);
    if (filtres.numero !== '') morceaux.push(`n°\u00a0${filtres.numero}`);
    if (filtres.mesTickets) morceaux.push(`mes tickets (${etat.utilisateur})`);
    if (filtres.du || filtres.au) morceaux.push(`créés${filtres.du ? ` à partir du ${dateEnFrancais(filtres.du)}` : ''}${filtres.au ? ` jusqu’au ${dateEnFrancais(filtres.au)}` : ''}`);
    return morceaux.length
      ? `Filtres actifs\u00a0: ${morceaux.join(' ; ')}.`
      : 'Aucun filtre actif\u00a0: tous les tickets sont affichés.';
  }

  /* ---------- Tableau des tickets (vue Backlog) ---------- */
  function htmlLigne(ticket, motsTapes) {
    return `<tr data-id="${ticket.id}">
      <td class="c-id" data-label="N°"><button type="button" class="poignee" data-poignee="${ticket.id}" title="Glisser pour déplacer ce ticket" aria-label="Déplacer le ticket #${ticket.id}" aria-describedby="aide-deplacer">${ICONE_POIGNEE}</button>#${ticket.id}</td>
      <td class="c-titre" data-label="Titre">${titreSurligne(ticket.titre, motsTapes)}${htmlAssigne(ticket)}${htmlBloquants(ticket)}${htmlEcheance(ticket)}${htmlMentionImport(ticket)}</td>
      <td data-label="Type">${htmlType(ticket)}</td>
      <td data-label="Priorité">${htmlPriorite(ticket)}</td>
      <td data-label="Points">${htmlPoints(ticket)}</td>
      <td data-label="Statut"><span class="statut st-${ticket.statut}">${libelleDe(STATUTS, ticket.statut)}</span></td>
      <td class="c-date" data-label="Créé le"><time datetime="${ticket.creeLe}">${dateEnFrancais(ticket.creeLe)}</time></td>
      <td class="c-actions">
        <button type="button" class="btn-modifier" data-modifier="${ticket.id}" aria-label="Modifier le ticket #${ticket.id}" title="Modifier ce ticket">${ICONE_CRAYON}<span>Modifier</span></button>
        <button type="button" class="btn-suppr" data-suppr="${ticket.id}" aria-label="Supprimer le ticket #${ticket.id}" title="Supprimer ce ticket">${ICONE_POUBELLE}<span>Supprimer</span></button>
      </td>
    </tr>`;
  }

  function rendreTableau(visibles, motsTapes, nombreDansLeProjet) {
    if (!nombreDansLeProjet) {
      page.tableau.hidden = true;
      page.messageListeVide.hidden = false;
      remplacerContenu(page.liste, '');
      remplacerContenu(page.messageListeVide, `<p class="vide-titre">Ce projet ne contient encore aucun ticket.</p>
        <p class="vide-texte">Ajoutez le premier ticket du backlog pour commencer.</p>
        <button type="button" class="btn btn-primary" data-action="ajouter">+ Ajouter un ticket</button>`);
    } else if (!visibles.length) {
      page.tableau.hidden = true;
      page.messageListeVide.hidden = false;
      remplacerContenu(page.liste, '');
      remplacerContenu(page.messageListeVide, `<p class="vide-titre">Aucun ticket ne correspond à votre recherche et à vos filtres.</p>
        <p class="vide-texte">Modifiez-les, ou effacez-les pour retrouver les ${pluriel(nombreDansLeProjet, 'ticket')} du projet.</p>
        <button type="button" class="btn btn-secondary" data-action="reset">Effacer la recherche et les filtres</button>`);
    } else {
      page.messageListeVide.hidden = true;
      page.tableau.hidden = false;
      remplacerContenu(page.messageListeVide, '');
      remplacerContenu(page.liste, visibles.map(ticket => htmlLigne(ticket, motsTapes)).join(''));
    }
  }

  // Flèche et numéro de critère dans les en-têtes du tableau
  function rendreEnTetes(ordreManuelActif) {
    for (const enTete of page.enTetesTriables) {
      const critere = enTete.dataset.col;
      const rang = etat.tri.findIndex(element => element.critere === critere);
      const trie = !ordreManuelActif && rang !== -1;
      enTete.classList.toggle('is-trie', trie);
      enTete.dataset.sens = trie ? etat.tri[rang].sens : '';
      enTete.querySelector('.th-rang').textContent = trie && etat.tri.length > 1 ? String(rang + 1) : '';
      if (trie && rang === 0) enTete.setAttribute('aria-sort', etat.tri[0].sens === 'asc' ? 'ascending' : 'descending');
      else enTete.removeAttribute('aria-sort');
      enTete.querySelector('.th-btn').title = !ordreManuelActif && rang === 0
        ? 'Inverser l’ordre de ce critère'
        : `Trier d’abord par ${CRITERES_TRI[critere].phrase}`;
    }
  }

  /* ---------- Vue Kanban : une colonne par entrée de COLONNES ---------- */
  function htmlCarteKanban(ticket, colonnePrecedente, colonneSuivante, motsTapes) {
    const bloqueParR2 = ticket.points === null && ticket.statut === COLONNE_BACKLOG.id;
    const indicationR2 = bloqueParR2
      ? `<p class="kb-dor">${ICONE_CADENAS}Non estimé&nbsp;: reste dans le ${echapper(COLONNE_BACKLOG.titre)}</p>` : '';
    // Bouton ◀ ou ▶ vers la colonne voisine (règle R3) ; absent au bord du tableau
    const fleche = (colonne, cote) => (!colonne ? '' :
      `<button type="button" class="kb-fleche kb-fleche-${cote}" data-kanban="${ticket.id}" data-vers="${colonne.id}" aria-label="Déplacer le ticket #${ticket.id} vers «\u00a0${echapper(colonne.titre)}\u00a0»" title="Déplacer vers «\u00a0${echapper(colonne.titre)}\u00a0»">${cote === 'gauche'
        ? `${ICONE_GAUCHE}<span>${echapper(colonne.titre)}</span>`
        : `<span>${echapper(colonne.titre)}</span>${ICONE_DROITE}`}</button>`);
    return `<li class="kb-carte" data-id="${ticket.id}" draggable="true">
      <div class="kb-carte-haut"><button type="button" class="kb-poignee" data-poignee-kanban="${ticket.id}" title="Glisser pour déplacer ce ticket" aria-label="Déplacer le ticket #${ticket.id}" aria-describedby="aide-deplacer-kanban">${ICONE_POIGNEE}</button><span class="kb-id">#${ticket.id}</span>${htmlType(ticket)}<button type="button" class="kb-modifier" data-modifier="${ticket.id}" aria-label="Modifier le ticket #${ticket.id}" title="Modifier ce ticket">${ICONE_CRAYON}</button></div>
      <p class="kb-carte-titre">${titreSurligne(ticket.titre, motsTapes)}</p>${htmlAssigne(ticket)}${htmlBloquants(ticket)}${htmlEcheance(ticket)}${htmlMentionImport(ticket)}
      <div class="kb-carte-meta">${htmlPriorite(ticket)}${htmlPoints(ticket)}</div>
      ${indicationR2}
      <div class="kb-actions">${fleche(colonnePrecedente, 'gauche')}${fleche(colonneSuivante, 'droite')}</div>
    </li>`;
  }

  // Points de complexité d’une colonne (tickets affichés), à côté du nombre de tickets
  function htmlPointsDeColonne(colonne) {
    const unite = colonne.points > 1 ? 'pts' : 'pt';
    const nonEstimes = colonne.nonEstimes ? `, dont ${colonne.nonEstimes} ticket${colonne.nonEstimes > 1 ? 's' : ''} non estimé${colonne.nonEstimes > 1 ? 's' : ''}` : '';
    return `<span class="kb-points" title="${pluriel(colonne.points, 'point')} de complexité${nonEstimes}">${colonne.points}<span class="kb-points-unite" aria-hidden="true">\u00a0${unite}</span><span class="sr-only"> point${colonne.points > 1 ? 's' : ''} de complexité${nonEstimes}</span></span>`;
  }

  // B5 · Tickets hors du sprint en cours, par colonne (ils comptent dans la limite WIP, règle R1, sans être affichés)
  function horsSprintParColonne(projet, enCours) {
    const parColonne = new Map();
    if (!enCours.length) return parColonne;
    const numeros = new Set(enCours.map(sprint => sprint.id));
    for (const ticket of projet.tickets) if (!numeros.has(ticket.sprintId)) parColonne.set(ticket.statut, (parColonne.get(ticket.statut) || 0) + 1);
    return parColonne;
  }
  // B5.6 · Bandeau au-dessus du Kanban pendant un sprint
  function rendreBandeauSprintKanban(projet, enCours) {
    const bandeau = trouver('#kb-sprint');
    bandeau.hidden = !enCours.length;
    if (!enCours.length) return;
    const numeros = new Set(enCours.map(sprint => sprint.id));
    const dans = projet.tickets.filter(ticket => numeros.has(ticket.sprintId)).length;
    const autres = projet.tickets.length - dans;
    const noms = enCours.map(sprint => `«\u00a0${echapper(sprint.nom)}\u00a0» (du ${dateCourte(sprint.debut)} au ${dateCourte(sprint.fin)})`).join(' et ');
    remplacerContenu(bandeau, `<span><strong>${enCours.length > 1 ? 'Sprints en cours' : 'Sprint en cours'}\u00a0:</strong> ${noms} · ${pluriel(dans, 'ticket')}.`
      + `${autres ? ` ${autres > 1 ? `Les ${autres} autres tickets sont` : 'L’autre ticket est'} dans le Backlog.` : ''}</span>`
      + (autres ? ' <button type="button" class="btn btn-texte" data-voir-backlog>Voir le Backlog</button>' : ''));
  }

  // statsDuProjet : la limite WIP porte sur TOUS les tickets ; statsAffichees : les pourcentages portent sur ceux affichés
  function rendreKanban(visibles, motsTapes, statsDuProjet, statsAffichees, horsSprint = new Map()) {
    page.kanban.style.setProperty('--nb-colonnes', COLONNES.length);
    const cartesParColonne = new Map(COLONNES.map(colonne => [colonne.id, []]));
    for (const ticket of visibles) if (cartesParColonne.has(ticket.statut)) cartesParColonne.get(ticket.statut).push(ticket);
    remplacerContenu(page.kanban, COLONNES.map((colonne, rang) => {
      const cartes = cartesParColonne.get(colonne.id);
      const reel = statsDuProjet.colonnes[rang];
      const indicateurWip = colonne.wip === null ? '' :
        `<span class="kb-wip${reel.plein ? ' is-plein' : ''}" title="Limite de tickets en même temps (WIP)">WIP ${reel.nombre}/${colonne.wip}${horsSprint.get(colonne.id) ? ` · dont ${horsSprint.get(colonne.id)} hors sprint` : ''}${reel.plein ? ', limite atteinte' : ''}</span>`;
      return `<section class="kb-col couleur-${colonne.id}${reel.plein ? ' is-plein' : ''}" data-colonne="${colonne.id}" aria-labelledby="kb-titre-${colonne.id}">
        <header class="kb-tete">
          <h3 id="kb-titre-${colonne.id}">${echapper(colonne.titre)}</h3>
          <span class="kb-compteurs">
            <span class="kb-compte" title="${pluriel(cartes.length, 'ticket')}">${cartes.length}<span class="sr-only"> ticket${cartes.length > 1 ? 's' : ''}</span></span>
            ${htmlPointsDeColonne(statsAffichees.colonnes[rang])}
          </span>
          <div class="kb-infos"><span>${statsAffichees.colonnes[rang].pourcentage}\u00a0% des tickets</span>${indicateurWip}${htmlRetardsDeColonne(cartes)}</div>
        </header>
        ${cartes.length
          ? `<ol class="kb-cartes" aria-label="Tickets «\u00a0${echapper(colonne.titre)}\u00a0»">${cartes.map(ticket => htmlCarteKanban(ticket, COLONNES[rang - 1], COLONNES[rang + 1], motsTapes)).join('')}</ol>`
          : '<p class="kb-vide">Aucun ticket</p>'}
      </section>`;
    }).join(''));
  }

  /* ---------- Fonction principale d’affichage ---------- */
  let idsAffiches = [];   // ordre actuel de la liste (sert aux déplacements au clavier)

  // Tickets affichés du projet, dans l’ordre de la liste (recherche, filtres, tri ou ordre personnalisé)
  function ticketsAffiches(projet) {
    const motsTapes = mots(etat.filtres.texte);
    return { motsTapes, visibles: ordonner(filtrer(projet.tickets, motsTapes), projet) };   // filtrer() renvoie une copie
  }

  function rendre() {
    demarrerSprintsDuJour();                          // B6 : les sprints dont la date de début est atteinte démarrent
    noterRelevesDuJour();                             // B1.8 : relevé du jour des sprints ouverts (burndown)
    rendreLaPage();
    sauvegarder();
    if (annonceDeDemarrage) { const message = annonceDeDemarrage; annonceDeDemarrage = null; notifier(message); }                                    // chaque modification passe par ici : elle est enregistrée
  }
  // Journal des déplacements du projet affiché
  function rendreJournal(projet) {
    const journal = projet.journal || [];
    trouver('#btn-annuler-deplacement').disabled = !journal.length;
    remplacerContenu(trouver('#journal-liste'), journal.length
      ? journal.map((entree, rang) => {
          const heure = new Date(entree.quand);
          const quand = Number.isNaN(heure.getTime()) ? '' : heure.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
          const quoi = entree.de === entree.vers
            ? `changé de place dans «\u00a0${echapper(libelleDe(STATUTS, entree.de))}\u00a0»`
            : `${echapper(libelleDe(STATUTS, entree.de))} → <strong>${echapper(libelleDe(STATUTS, entree.vers))}</strong>`;
          const lies = entreesAAnnuler(journal, rang).length - 1;   // déplacements plus récents du même ticket, annulés avec
          const enPlus = lies ? ` (annule aussi ${lies > 1 ? `les ${lies} déplacements plus récents` : 'le déplacement plus récent'} de ce ticket)` : '';
          const resume = `#${entree.id} ${entree.titre}, ${entree.de === entree.vers ? `changé de place dans ${libelleDe(STATUTS, entree.de)}` : `${libelleDe(STATUTS, entree.de)} vers ${libelleDe(STATUTS, entree.vers)}`}`;
          return `<li data-rang="${rang}" data-id="${entree.id}"${rang === 0 ? ' class="is-dernier"' : ''}><span class="journal-heure">${quand}</span><span><strong>#${entree.id}</strong> ${echapper(entree.titre)}\u00a0: ${quoi}</span>`
            + `<button type="button" class="journal-annuler" data-annuler-rang="${rang}" title="Annuler ce déplacement${echapper(enPlus)}" aria-label="Annuler : ${echapper(resume)}${echapper(enPlus)}">Annuler${lies ? ` <span class="journal-lies">+${lies}</span>` : ''}</button></li>`;
        }).join('')
      : '<li class="journal-vide">Aucun déplacement pour l’instant.</li>');
  }

  function rendreLaPage() {
    const projet = projetActif();
    rendreJournal(projet);
    rendreRetards(projet);
    const tousLesTickets = projet.tickets;
    const { motsTapes, visibles } = ticketsAffiches(projet);
    const filtresActifs = nombreDeFiltresActifs(motsTapes);
    const ordreManuelActif = !!projet.ordreManuel;
    const statsAffichees = calculerStats(visibles);
    const statsDuProjet = calculerStats(tousLesTickets);
    idsAffiches = visibles.map(ticket => ticket.id);
    rendreSprints(projet, visibles);                  // B4.4 : les filtres s’appliquent aux tickets disponibles

    // Projet : titre et liste déroulante
    page.titreProjet.textContent = projet.nom;
    remplacerContenu(page.choixProjet, etat.projets
      .map(element => `<option value="${element.id}">${echapper(element.nom)} (${pluriel(element.tickets.length, 'ticket')})</option>`).join(''));
    page.choixProjet.value = String(projet.id);

    // Les 3 compteurs portent toujours sur les tickets affichés
    mettreAJourCompteur(page.compteurTickets, page.sousCompteurTickets, statsAffichees.total, statsDuProjet.total, filtresActifs > 0);
    mettreAJourCompteur(page.compteurPoints, page.sousCompteurPoints, statsAffichees.points, statsDuProjet.points, filtresActifs > 0);
    mettreAJourCompteur(page.compteurNonEstimes, page.sousCompteurNonEstimes, statsAffichees.nonEstimes, statsDuProjet.nonEstimes, filtresActifs > 0);
    page.blocNonEstimes.classList.toggle('has-ne', statsAffichees.nonEstimes > 0);
    mettreAJourIndicateurs(statsAffichees, statsDuProjet);

    // État des filtres
    for (const puce of page.puces) {
      puce.setAttribute('aria-pressed', etat.filtres[puce.dataset.groupe].has(puce.dataset.valeur) ? 'true' : 'false');
    }
    page.boutonEffacerFiltres.disabled = filtresActifs === 0;
    // « Mes tickets » : actif seulement quand « Je suis » est rempli ; liste des noms déjà utilisés
    const puceMesTickets = trouver('#chip-mes-tickets');
    puceMesTickets.setAttribute('aria-pressed', etat.filtres.mesTickets ? 'true' : 'false');
    puceMesTickets.disabled = !etat.utilisateur;
    puceMesTickets.title = etat.utilisateur ? `Seulement les tickets assignés à ${etat.utilisateur}` : 'Indiquez d’abord votre prénom dans « Je suis »';
    remplacerContenu(trouver('#liste-assignes'), [...new Set(etat.projets.flatMap(element => element.tickets.map(ticket => ticket.assigne)).filter(Boolean))]
      .sort((a, b) => a.localeCompare(b, 'fr')).map(nom => `<option value="${echapper(nom)}"></option>`).join(''));
    page.nombreFiltres.textContent = filtresActifs ? `(${filtresActifs})` : '';
    page.resumeFiltres.textContent = resumeDesFiltres(motsTapes);
    page.avertissementDates.hidden = !(etat.filtres.du && etat.filtres.au && etat.filtres.du > etat.filtres.au);

    // Phrase lue par les lecteurs d’écran
    const nombre = visibles.length;
    let phrase;
    if (!tousLesTickets.length) phrase = 'Aucun ticket dans ce projet pour l’instant.';
    else if (filtresActifs) phrase = `${pluriel(nombre, 'ticket')} affiché${nombre > 1 ? 's' : ''} sur ${tousLesTickets.length}`;
    else phrase = `${pluriel(nombre, 'ticket')} dans le backlog`;
    if (tousLesTickets.length) phrase += nombre > 1 ? (ordreManuelActif ? ', dans votre ordre personnalisé.' : `, triés ${descriptionDuTri()}.`) : '.';
    page.phraseResultat.textContent = phrase;

    // Panneau de tri
    page.panneauTri.classList.toggle('is-manuel', ordreManuelActif);
    page.bandeauOrdreManuel.hidden = !ordreManuelActif;
    page.boutonTriParDefaut.disabled = !ordreManuelActif && triIdentique(etat.tri, triParDefaut());
    page.resumeTri.textContent = ordreManuelActif
      ? 'Ordre personnalisé\u00a0: les tickets ont été déplacés à la main.'
      : `Tickets triés ${descriptionDuTri()}.`;

    rendreGraphiques(visibles, statsAffichees, filtresActifs > 0);

    // Seule la vue visible est reconstruite ; l’autre le sera quand on l’affichera (JS 18)
    if (etat.vue === 'kanban') {
      // B5 : pendant un sprint, le Kanban n’affiche que ses tickets (recherche et filtres compris)
      const kanban = ticketsDuKanban(visibles, projet.sprints, aujourdhuiIso());
      rendreBandeauSprintKanban(projet, kanban.sprints);
      rendreKanban(kanban.tickets, motsTapes, statsDuProjet, kanban.sprints.length ? calculerStats(kanban.tickets) : statsAffichees, horsSprintParColonne(projet, kanban.sprints));
    } else if (etat.vue === 'calendrier') {
      rendreCalendrier(visibles);
    } else {
      rendreEnTetes(ordreManuelActif);
      rendreTableau(visibles, motsTapes, tousLesTickets.length);
    }
  }

  // B5.7 · En vue Kanban pendant un sprint, un ticket affichable (recherche et filtres) peut être hors du sprint
  function ticketHorsDuKanban(id) {
    if (etat.vue !== 'kanban' || !idsAffiches.includes(id)) return false;
    const projet = projetActif();
    const ticket = projet.tickets.find(element => element.id === id);
    const enCours = sprintsEnCours(projet.sprints, aujourdhuiIso());
    return !!ticket && enCours.length > 0 && !enCours.some(sprint => sprint.id === ticket.sprintId);
  }
  const allerAuBacklog = { libelle: 'Voir le Backlog', faire: () => afficherVue('backlog') };

  // Élément qui contient les tickets de la vue affichée (Backlog, Kanban ou Calendrier)
  const conteneurDeLaVue = () => (etat.vue === 'kanban' ? page.kanban : etat.vue === 'calendrier' ? calendrierUI.grille : etat.vue === 'sprints' ? sprintsUI.vue : page.liste);

  // Met en valeur un ticket qui vient d’être ajouté ; renvoie false s’il est masqué par les filtres
  function surlignerTicket(id) {
    // Vue calendrier : un ticket affiché peut n’avoir aucune case (pas d’échéance, autre mois) sans être masqué par les filtres
    if (etat.vue === 'sprints') return idsAffiches.includes(id);
    if (etat.vue === 'calendrier') {
      const bouton = calendrierUI.grille.querySelector(`[data-modifier="${id}"]`);
      if (bouton) { bouton.classList.add('is-new'); setTimeout(() => bouton.classList.remove('is-new'), 2800); }
      return idsAffiches.includes(id);
    }
    const element = etat.vue === 'kanban'
      ? page.kanban.querySelector(`.kb-carte[data-id="${id}"]`)
      : (page.tableau.hidden ? null : page.liste.querySelector(`tr[data-id="${id}"]`));
    if (!element) return false;
    element.classList.add('is-new');
    if (typeof element.scrollIntoView === 'function') {
      element.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: mouvementReduit() ? 'auto' : 'smooth' });
    }
    setTimeout(() => element.classList.remove('is-new'), 2800);
    return true;
  }


  /* ========================================================================
     JS 11 · NOTIFICATION ET FENÊTRES
     ======================================================================== */

  // Message en bas de l’écran, avec un bouton d’action facultatif { libelle, faire }
  let minuterieNotification = null;
  function notifier(message, action) {
    page.texteNotification.textContent = message;
    if (action) {
      page.boutonNotification.hidden = false;
      page.boutonNotification.textContent = action.libelle;
      page.boutonNotification.onclick = () => { masquerNotification(); action.faire(); };
    } else {
      page.boutonNotification.hidden = true;
      page.boutonNotification.onclick = null;
    }
    page.notification.hidden = false;
    page.notification.classList.remove('is-visible');
    void page.notification.offsetWidth;                    // relance l’animation d’apparition
    page.notification.classList.add('is-visible');
    clearTimeout(minuterieNotification);
    minuterieNotification = setTimeout(masquerNotification, action ? 9000 : 4500);
  }
  function masquerNotification() { page.notification.hidden = true; }

  // Fenêtres <dialog> : à la fermeture, le focus revient sur le bouton qui les a ouvertes
  const focusApresFermeture = new WeakMap();
  function ouvrirFenetre(fenetre, boutonDeclencheur) {
    focusApresFermeture.set(fenetre, boutonDeclencheur || document.activeElement);
    if (fenetre.open) return;
    if (typeof fenetre.showModal === 'function') fenetre.showModal();
    else fenetre.setAttribute('open', '');               // très vieux navigateurs
  }
  function fermerFenetre(fenetre, elementAFocaliser) {
    if (elementAFocaliser) focusApresFermeture.set(fenetre, elementAFocaliser);
    if (typeof fenetre.close === 'function') fenetre.close();
    else { fenetre.removeAttribute('open'); fenetre.dispatchEvent(new Event('close')); }
  }
  for (const fenetre of trouverTous('dialog')) {
    for (const bouton of fenetre.querySelectorAll('[data-fermer]')) bouton.addEventListener('click', () => fermerFenetre(fenetre));
    fenetre.addEventListener('close', () => {
      const cible = focusApresFermeture.get(fenetre);
      if (cible && document.body.contains(cible) && typeof cible.focus === 'function') cible.focus({ preventScroll: true });
    });
  }
  // La fenêtre de suppression se ferme aussi d’un clic à côté (équivaut à « Annuler »)
  let clicCommenceDehors = false;
  page.fenetreSuppression.addEventListener('pointerdown', evenement => { clicCommenceDehors = evenement.target === page.fenetreSuppression; });
  page.fenetreSuppression.addEventListener('click', evenement => {
    if (evenement.target === page.fenetreSuppression && clicCommenceDehors) fermerFenetre(page.fenetreSuppression);
  });


  /* ========================================================================
     JS 12 · FORMULAIRE « AJOUTER / MODIFIER UN TICKET »
     La même fenêtre sert aux deux : ticketEnModification vaut null pour un ajout.
     ======================================================================== */

  // Crée les choix du formulaire à partir des listes de référence (aucune valeur en dur)
  function genererFormulaire() {
    page.choixType.innerHTML = TYPES.map(type =>
      `<label class="opt"><input type="radio" name="type" value="${type.valeur}"${type.valeur === 'story' ? ' checked' : ''}><span class="opt-face">${ICONES_TYPE[type.valeur]}${type.libelle}</span></label>`
    ).join('');
    page.choixPriorite.innerHTML = PRIORITES.map(priorite =>
      `<label class="opt prio prio-${priorite.valeur}"><input type="radio" name="priorite" value="${priorite.valeur}"${priorite.valeur === 2 ? ' checked' : ''}><span class="opt-face"><span class="prio-num">${priorite.valeur}</span> ${priorite.libelle}</span></label>`
    ).join('');
    // Points : une carte de planning poker par valeur autorisée, plus la carte « ? » (non estimé)
    page.choixPoints.innerHTML = POINTS.map(points =>
      `<label class="carte"><input type="radio" name="points" value="${points}"><span class="carte-face"><span class="carte-coin" aria-hidden="true">${points}</span><span class="carte-num">${points}</span><span class="carte-coin carte-coin-bas" aria-hidden="true">${points}</span></span></label>`
    ).join('') +
      `<label class="carte carte-nv"><input type="radio" name="points" value="${NON_ESTIME}" checked><span class="carte-face"><span class="carte-num" aria-hidden="true">?</span></span><span class="carte-legende">Non estimé</span></label>`;
    page.champStatut.innerHTML = STATUTS.map(statut =>
      `<option value="${statut.valeur}"${statut.valeur === COLONNE_BACKLOG.id ? ' selected' : ''}>${statut.libelle}</option>`
    ).join('');
    // Aide sous le statut : rappelle R2 et les limites WIP lues dans COLONNES
    const limites = COLONNES.filter(colonne => colonne.wip !== null).map(colonne => `«\u00a0${colonne.titre}\u00a0» accepte ${colonne.wip} tickets au maximum`);
    const passages = COLONNES.filter(colonne => colonne.depuis).map(colonne => `on n’entre dans «\u00a0${colonne.titre}\u00a0» que depuis ${originesAdmises(colonne)}`);
    page.aideStatut.textContent = [`Un ticket non estimé reste dans le «\u00a0${COLONNE_BACKLOG.titre}\u00a0»`, ...limites, ...passages].join(' ; ') + '.';
  }

  const CHAMPS_AVEC_ERREUR = ['titre', 'type', 'priorite', 'points', 'statut', 'assigne', 'bloquePar', 'echeance'];
  let titreDejaSaisi = false;   // on n’affiche l’erreur du titre qu’après une première saisie ou un envoi

  function afficherErreur(champ, message) {
    const paragraphe = trouver(`#err-${champ}`);
    paragraphe.textContent = message || '';
    paragraphe.hidden = !message;
    if (champ === 'titre') page.champTitre.setAttribute('aria-invalid', message ? 'true' : 'false');
  }
  function effacerErreurs() {
    for (const champ of CHAMPS_AVEC_ERREUR) afficherErreur(champ, '');
    afficherErreur('global', '');
  }

  // Compteur « 12 / 80 » sous le titre, en rouge si la longueur ne convient pas
  function mettreAJourCompteurTitre() {
    const longueur = nombreDeCaracteres(page.champTitre.value.trim());
    const erreur = verifierTitre(page.champTitre.value);
    page.compteurTitre.textContent = `${longueur} / ${TITRE_MAX}`;
    page.compteurTitre.classList.toggle('is-ko', titreDejaSaisi && !!erreur);
    if (titreDejaSaisi) afficherErreur('titre', erreur);
  }

  let ticketEnModification = null;   // ticket ouvert dans le formulaire, ou null pour un nouveau ticket

  // Ouvre le formulaire : vide pour un ajout, prérempli avec « ticketAModifier » pour une modification
  function ouvrirFormulaireTicket(boutonDeclencheur, ticketAModifier = null) {
    ticketEnModification = ticketAModifier;
    page.formulaireTicket.reset();
    titreDejaSaisi = false;
    effacerErreurs();
    const enModification = !!ticketAModifier;
    page.titreFenetreTicket.textContent = enModification ? `Modifier le ticket #${ticketAModifier.id}` : 'Ajouter un ticket';
    page.boutonValiderTicket.textContent = enModification ? 'Enregistrer les modifications' : 'Ajouter le ticket';
    page.boutonFermerTicket.setAttribute('aria-label', enModification ? 'Fermer sans enregistrer' : 'Fermer sans ajouter de ticket');
    page.libelleNumero.textContent = enModification ? 'Numéro du ticket' : 'Numéro attribué automatiquement';
    page.numeroPrevu.textContent = `#${enModification ? ticketAModifier.id : prochainNumeroLibre()}`;
    page.datePrevue.textContent = dateEnFrancais(enModification ? ticketAModifier.creeLe : aujourdhuiIso());
    page.noteDate.textContent = enModification ? '(ne change pas)' : '(aujourd’hui)';
    page.projetDuFormulaire.textContent = `Projet\u00a0: ${projetActif().nom}`;
    if (enModification) {
      // Préremplissage : chaque choix est coché d’après les valeurs actuelles du ticket
      page.champTitre.value = ticketAModifier.titre;
      const cocher = (nom, valeur) => { const choix = page.formulaireTicket.querySelector(`input[name="${nom}"][value="${valeur}"]`); if (choix) choix.checked = true; };
      cocher('type', ticketAModifier.type);
      cocher('priorite', ticketAModifier.priorite);
      cocher('points', clePoints(ticketAModifier.points));
      page.champStatut.value = ticketAModifier.statut;
      trouver('#f-assigne').value = ticketAModifier.assigne || '';
      trouver('#f-echeance').value = ticketAModifier.echeance || '';
    }
    remplirChoixBloquants(enModification ? ticketAModifier.id : null);   // B8.4
    const note = enModification ? noteImportDe(ticketAModifier.id) : null;
    page.blocNoteFormulaire.hidden = !note;
    page.caseNoteFormulaire.checked = false;
    if (note) page.listeNoteFormulaire.innerHTML = note.corrections.map(texte => `<li>${echapper(texte)}</li>`).join('');
    mettreAJourCompteurTitre();
    ouvrirFenetre(page.fenetreTicket, boutonDeclencheur);
    page.champTitre.focus();
  }

  // B8.4 à B8.6 · Liste déroulante « Bloqué par » : tous les autres tickets ; ceux qui créeraient un cycle sont grisés
  function remplirChoixBloquants(id) {
    const choix = choixDeBloquants(projetActif().tickets, id);
    trouver('#f-bloque-liste').innerHTML = choix.length
      ? choix.map(element => `<label class="choix-bloquant${element.possible ? '' : ' is-impossible'}"${element.possible ? '' : ` title="${echapper(element.raison)}"`}>`
        + `<input type="checkbox" name="bloquePar" value="${element.id}"${element.choisi ? ' checked' : ''}${element.possible ? '' : ' disabled'}>`
        + `<span><strong>#${element.id}</strong> ${echapper(element.titre)} · ${echapper(libelleDe(STATUTS, element.statut))}${element.possible ? '' : `<small>${echapper(element.raison)}</small>`}</span></label>`).join('')
      : '<p class="aide">Aucun autre ticket dans ce projet.</p>';
    trouver('#f-bloque').open = false;
    majResumeDesBloquants();
  }
  const numerosDeBloquantsCoches = () => [...trouverTous('#f-bloque-liste input:checked')].map(caseACocher => Number(caseACocher.value));
  function majResumeDesBloquants() { trouver('#f-bloque-resume').textContent = resumeDesBloquantsChoisis(numerosDeBloquantsCoches()); }
  trouver('#f-bloque-liste').addEventListener('change', majResumeDesBloquants);

  // Lit le formulaire et convertit les valeurs dans les types du modèle (nombres, null)
  function lireFormulaire() {
    const donnees = new FormData(page.formulaireTicket);
    const priorite = donnees.get('priorite');
    const points = donnees.get('points');
    return {
      titre: String(donnees.get('titre') ?? ''),
      type: donnees.get('type'),
      priorite: priorite === null ? null : Number(priorite),
      points: points === NON_ESTIME ? null : points === null ? undefined : Number(points),   // « 4 » reste 4 : refusé par validerTicket
      statut: donnees.get('statut'),
      assigne: String(donnees.get('assigne') ?? '').trim() || null,
      bloquePar: donnees.getAll('bloquePar').map(Number),          // B8 : cases cochées de la liste « Bloqué par »
      echeance: String(donnees.get('echeance') ?? '').trim() || null
    };
  }

  page.champTitre.addEventListener('input', mettreAJourCompteurTitre);
  page.champTitre.addEventListener('blur', () => {
    if (page.champTitre.value !== '') { titreDejaSaisi = true; mettreAJourCompteurTitre(); }
  });

  page.formulaireTicket.addEventListener('submit', evenement => {
    evenement.preventDefault();
    titreDejaSaisi = true;
    effacerErreurs();
    const enModification = !!ticketEnModification;
    const resultat = enModification
      ? enregistrerModification(ticketEnModification.id, lireFormulaire())
      : ajouterTicket(lireFormulaire());
    if (!resultat.ok) {
      const erreurs = resultat.erreurs;
      for (const champ of CHAMPS_AVEC_ERREUR) afficherErreur(champ, erreurs[champ]);
      if (erreurs.id || erreurs.creeLe) afficherErreur('global', erreurs.id || erreurs.creeLe);
      if (erreurs.bloquePar) trouver('#f-bloque').open = true;
      mettreAJourCompteurTitre();
      // Le focus va sur le premier champ en erreur
      const premierChamp = CHAMPS_AVEC_ERREUR.find(champ => erreurs[champ]);
      if (premierChamp === 'titre') page.champTitre.focus();
      else if (premierChamp) {
        const cible = page.formulaireTicket.querySelector(`[name="${premierChamp}"]:checked`) || page.formulaireTicket.querySelector(`[name="${premierChamp}"]`);
        if (cible) cible.focus();
      }
      return;
    }
    const ticket = resultat.ticket;
    const notePriseEnCompte = enModification && !page.blocNoteFormulaire.hidden && page.caseNoteFormulaire.checked;
    if (notePriseEnCompte) { retirerNotesImport([ticket.id]); idsCorrigesDuDernierImport = idsCorrigesDuDernierImport.filter(numero => numero !== ticket.id); }
    fermerFenetre(page.fenetreTicket);
    rendre();
    if (enModification) { apresModification(ticket, resultat.inchange && !notePriseEnCompte, notePriseEnCompte); return; }
    if (ticketHorsDuKanban(ticket.id)) {
      notifier(`Ticket #${ticket.id} ajouté au backlog. Il n’est pas dans le sprint en cours\u00a0: retrouvez-le dans la vue Backlog.`, allerAuBacklog);
      return;
    }
    if (surlignerTicket(ticket.id)) {
      notifier(projetActif().ordreManuel
        ? `Ticket #${ticket.id} ajouté en bas de votre ordre personnalisé.`
        : `Ticket #${ticket.id} ajouté au backlog.`);
    } else {
      notifier(`Ticket #${ticket.id} ajouté, mais masqué par votre recherche ou vos filtres.`, {
        libelle: 'Tout afficher',
        faire: () => { reinitialiserFiltres(); surlignerTicket(ticket.id); }
      });
    }
  });


  // Après une modification : le ticket est mis en valeur et garde le focus sur son bouton « Modifier »
  function apresModification(ticket, inchange, notePriseEnCompte = false) {
    ticketEnModification = null;
    if (inchange) { notifier('Aucune modification à enregistrer.'); return; }
    if (ticketHorsDuKanban(ticket.id)) {
      notifier(`Ticket #${ticket.id} modifié. Il n’est pas dans le sprint en cours\u00a0: retrouvez-le dans la vue Backlog.`, allerAuBacklog);
      return;
    }
    const message = notePriseEnCompte ? `Ticket #${ticket.id} modifié, corrections de l’import prises en compte.` : `Ticket #${ticket.id} modifié.`;
    const conteneur = conteneurDeLaVue();
    if (surlignerTicket(ticket.id)) {
      const bouton = conteneur.querySelector(`[data-modifier="${ticket.id}"]`);
      if (bouton) bouton.focus({ preventScroll: true });
      page.annonce.textContent = message;
      notifier(message);
    } else {
      notifier(`Ticket #${ticket.id} modifié, mais masqué par votre recherche ou vos filtres.`, {
        libelle: 'Tout afficher',
        faire: () => { reinitialiserFiltres(); surlignerTicket(ticket.id); }
      });
    }
  }

  /* ---------- Fenêtre « Corrigé à l’import » ---------- */
  let idDeLaNoteOuverte = null;
  function ouvrirNoteImport(bouton) {
    const id = Number(bouton.dataset.noteImport);
    const note = noteImportDe(id);
    const ticket = projetActif().tickets.find(element => element.id === id);
    if (!note || !ticket) return;
    idDeLaNoteOuverte = id;
    page.ticketDeLaNote.textContent = `Ticket #${ticket.id} · ${ticket.titre}`;
    page.sourceDeLaNote.innerHTML = `Fichier&nbsp;: <strong>${echapper(note.source)}</strong>, ${echapper(note.repere.charAt(0).toLowerCase() + note.repere.slice(1))}<br>Importé le ${dateEnFrancais(note.date)}`;
    page.listeDeLaNote.innerHTML = note.corrections.map(texte => `<li>${echapper(texte)}</li>`).join('');
    ouvrirFenetre(page.fenetreNote, bouton);
  }
  // Confirme qu’une mention a été vue : elle disparaît, le ticket redevient un ticket comme les autres
  function prendreEnCompte(id) {
    retirerNotesImport([id]);
    idsCorrigesDuDernierImport = idsCorrigesDuDernierImport.filter(numero => numero !== id);
    rendre();
    page.annonce.textContent = `Corrections du ticket #${id} prises en compte.`;
    notifier(`Ticket #${id} : corrections prises en compte.`);
  }
  page.boutonNoteOk.addEventListener('click', () => {
    const id = idDeLaNoteOuverte;
    fermerFenetre(page.fenetreNote, conteneurDeLaVue());
    if (id !== null) prendreEnCompte(id);
    const bouton = (conteneurDeLaVue()).querySelector(`[data-modifier="${id}"]`);
    if (bouton) bouton.focus({ preventScroll: true });
  });
  page.boutonNoteModifier.addEventListener('click', () => {
    const ticket = projetActif().tickets.find(element => element.id === idDeLaNoteOuverte);
    fermerFenetre(page.fenetreNote);
    if (ticket) ouvrirFormulaireTicket(page.boutonAjouter, ticket);
  });

  // Ouvre la modification depuis un bouton « Modifier » (tableau ou carte Kanban)
  function ouvrirModificationDepuis(bouton) {
    const ticket = projetActif().tickets.find(element => element.id === Number(bouton.dataset.modifier));
    if (ticket) ouvrirFormulaireTicket(bouton, ticket);
  }


  /* ========================================================================
     JS 13 · SUPPRESSION D’UN TICKET ET PROJETS
     ======================================================================== */
  let idASupprimer = null;
  page.liste.addEventListener('click', evenement => {
    const mention = evenement.target.closest('[data-note-import]');
    if (mention) { ouvrirNoteImport(mention); return; }
    const boutonModifier = evenement.target.closest('[data-modifier]');
    if (boutonModifier) { ouvrirModificationDepuis(boutonModifier); return; }
    const bouton = evenement.target.closest('[data-suppr]');
    if (!bouton) return;
    const ticket = projetActif().tickets.find(element => element.id === Number(bouton.dataset.suppr));
    if (!ticket) return;
    idASupprimer = ticket.id;
    const debloques = projetActif().tickets.filter(element => Array.isArray(element.bloquePar) && element.bloquePar.includes(ticket.id));
    page.texteSuppression.innerHTML = `Le ticket <strong>#${ticket.id} «\u00a0${echapper(ticket.titre)}\u00a0»</strong> sera retiré définitivement du backlog. Cette action est irréversible.`
      + (debloques.length ? ` ${debloques.length > 1 ? `Les tickets ${debloques.map(element => `#${element.id}`).join(', ')} ne seront plus bloqués par lui.` : `Le ticket #${debloques[0].id} ne sera plus bloqué par lui.`}` : '');
    ouvrirFenetre(page.fenetreSuppression, bouton);
  });
  page.boutonConfirmerSuppression.addEventListener('click', () => {
    const ticketSupprime = idASupprimer === null ? null : supprimerTicket(idASupprimer);
    idASupprimer = null;
    fermerFenetre(page.fenetreSuppression, page.phraseResultat);   // le bouton d’origine a disparu
    rendre();
    if (ticketSupprime) notifier(`Ticket #${ticketSupprime.id} supprimé.`);
  });
  page.fenetreSuppression.addEventListener('close', () => { idASupprimer = null; });

  // Projets
  function afficherErreurNomProjet(message) {
    page.erreurNomProjet.textContent = message;
    page.erreurNomProjet.hidden = !message;
    page.champNomProjet.setAttribute('aria-invalid', message ? 'true' : 'false');
  }
  page.boutonNouveauProjet.addEventListener('click', () => {
    page.formulaireProjet.reset();
    afficherErreurNomProjet('');
    ouvrirFenetre(page.fenetreProjet, page.boutonNouveauProjet);
    page.champNomProjet.focus();
  });
  page.champNomProjet.addEventListener('input', () => {
    // Une fois l’erreur affichée, elle se met à jour à chaque lettre
    if (page.champNomProjet.getAttribute('aria-invalid') === 'true') afficherErreurNomProjet(verifierNomProjet(page.champNomProjet.value));
  });
  page.formulaireProjet.addEventListener('submit', evenement => {
    evenement.preventDefault();
    const erreur = verifierNomProjet(page.champNomProjet.value);
    if (erreur) { afficherErreurNomProjet(erreur); page.champNomProjet.focus(); return; }
    const projet = creerProjet(page.champNomProjet.value);
    etat.projetActifId = projet.id;
    etat.filtres = filtresVides();
    synchroniserChamps();
    fermerFenetre(page.fenetreProjet, page.boutonAjouter);
    rendre();
    notifier(`Projet «\u00a0${projet.nom}\u00a0» créé. Ajoutez maintenant ses tickets.`);
  });
  page.choixProjet.addEventListener('change', () => {
    etat.projetActifId = Number(page.choixProjet.value);
    etat.filtres = filtresVides();
    synchroniserChamps();
    rendre();
  });


  /* ========================================================================
     JS 14 · RECHERCHE, FILTRES ET TRI : RÉACTIONS AUX ACTIONS
     ======================================================================== */

  // Recopie les filtres de l’état dans les champs (après une réinitialisation, un changement de projet…)
  function synchroniserChamps() {
    page.recherche.value = etat.filtres.texte;
    page.filtreNumero.value = etat.filtres.numero;
    page.filtreDu.value = etat.filtres.du;
    page.filtreAu.value = etat.filtres.au;
    trouver('#filtre-moi').value = etat.utilisateur;
  }
  function reinitialiserFiltres() {
    etat.filtres = filtresVides();
    synchroniserChamps();
    rendre();
  }

  // Crée les puces de filtre à partir des listes de référence
  function genererPuces() {
    const groupes = {
      types: TYPES.map(type => ({ valeur: type.valeur, html: ICONES_TYPE[type.valeur] + type.libelle })),
      priorites: PRIORITES.map(priorite => ({ valeur: String(priorite.valeur), html: `${priorite.libelle} (${priorite.valeur})` })),
      points: [...POINTS.map(points => ({ valeur: String(points), html: String(points) })), { valeur: NON_ESTIME, html: 'Non estimé' }],
      statuts: STATUTS.map(statut => ({ valeur: statut.valeur, html: statut.libelle })),
      urgences: URGENCES.map(valeur => ({ valeur, html: LIBELLES_URGENCE[valeur] }))   // B3
    };
    for (const conteneur of trouverTous('.chips[data-groupe]')) {
      const groupe = conteneur.dataset.groupe;
      conteneur.innerHTML = groupes[groupe].map(choix =>
        `<button type="button" class="chip" data-groupe="${groupe}" data-valeur="${choix.valeur}" aria-pressed="false">${choix.html}</button>`
      ).join('');
    }
    page.puces = trouverTous('.chip[data-groupe]');   // « Mes tickets » a son propre bouton
  }

  // Un clic sur une puce l’ajoute ou la retire de son groupe
  page.panneauFiltres.addEventListener('click', evenement => {
    const puce = evenement.target.closest('.chip[data-groupe]');
    if (!puce) return;
    const choisies = etat.filtres[puce.dataset.groupe];
    if (choisies.has(puce.dataset.valeur)) choisies.delete(puce.dataset.valeur);
    else choisies.add(puce.dataset.valeur);
    rendre();
  });
  page.recherche.addEventListener('input', () => { etat.filtres.texte = page.recherche.value; rendre(); });
  page.filtreNumero.addEventListener('input', () => { etat.filtres.numero = page.filtreNumero.value.trim(); rendre(); });
  for (const typeEvenement of ['input', 'change']) {
    page.filtreDu.addEventListener(typeEvenement, () => { etat.filtres.du = page.filtreDu.value; rendre(); });
    page.filtreAu.addEventListener(typeEvenement, () => { etat.filtres.au = page.filtreAu.value; rendre(); });
  }
  page.boutonEffacerFiltres.addEventListener('click', () => { reinitialiserFiltres(); page.recherche.focus(); });

  // Panneau de tri : changer la colonne ou le sens d’un critère
  page.criteresTri.addEventListener('change', evenement => {
    const liste = evenement.target.closest('select[data-niveau]');
    if (!liste) return;
    const nouveauxCriteres = copieDuTri();
    nouveauxCriteres[Number(liste.dataset.niveau)][liste.dataset.champ] = liste.value;
    changerTri(nouveauxCriteres, liste.dataset.cleFocus);
  });
  // Panneau de tri : monter, descendre ou retirer un critère
  page.criteresTri.addEventListener('click', evenement => {
    const bouton = evenement.target.closest('button[data-operation]');
    if (!bouton || bouton.disabled) return;
    const rang = Number(bouton.dataset.niveau);
    const nouveauxCriteres = copieDuTri();
    let cleFocus;
    if (bouton.dataset.operation === 'monter' && rang > 0) {
      [nouveauxCriteres[rang - 1], nouveauxCriteres[rang]] = [nouveauxCriteres[rang], nouveauxCriteres[rang - 1]];
      cleFocus = `monter-${rang - 1}`;
    } else if (bouton.dataset.operation === 'descendre' && rang < nouveauxCriteres.length - 1) {
      [nouveauxCriteres[rang], nouveauxCriteres[rang + 1]] = [nouveauxCriteres[rang + 1], nouveauxCriteres[rang]];
      cleFocus = `descendre-${rang + 1}`;
    } else if (bouton.dataset.operation === 'retirer' && nouveauxCriteres.length > 1) {
      nouveauxCriteres.splice(rang, 1);
      cleFocus = `critere-${Math.min(rang, nouveauxCriteres.length - 1)}`;
    } else return;
    changerTri(nouveauxCriteres, cleFocus);
  });
  page.boutonAjouterCritere.addEventListener('click', () => {
    const critereLibre = Object.keys(CRITERES_TRI).find(cle => !etat.tri.some(element => element.critere === cle));
    if (critereLibre) changerTri([...copieDuTri(), { critere: critereLibre, sens: 'asc' }], `critere-${etat.tri.length}`);
  });
  page.boutonTriParDefaut.addEventListener('click', () => changerTri(triParDefaut()));
  page.boutonReprendreTri.addEventListener('click', () => { changerTri(copieDuTri()); page.phraseResultat.focus(); });

  // Clic sur un en-tête : la colonne devient le critère 1 (un 2e clic inverse son ordre)
  page.enTeteTableau.addEventListener('click', evenement => {
    const bouton = evenement.target.closest('.th-btn');
    if (!bouton) return;
    const critere = bouton.dataset.col;
    let nouveauxCriteres = copieDuTri();
    if (!projetActif().ordreManuel && nouveauxCriteres[0].critere === critere) {
      nouveauxCriteres[0].sens = nouveauxCriteres[0].sens === 'asc' ? 'desc' : 'asc';
    } else {
      const existant = nouveauxCriteres.find(element => element.critere === critere);
      nouveauxCriteres = [{ critere, sens: existant ? existant.sens : 'asc' }, ...nouveauxCriteres.filter(element => element.critere !== critere)];
    }
    changerTri(nouveauxCriteres);
  });

  page.boutonAjouter.addEventListener('click', () => ouvrirFormulaireTicket(page.boutonAjouter));
  // Boutons du message « liste vide »
  page.messageListeVide.addEventListener('click', evenement => {
    const bouton = evenement.target.closest('[data-action]');
    if (!bouton) return;
    if (bouton.dataset.action === 'ajouter') ouvrirFormulaireTicket(page.boutonAjouter);
    if (bouton.dataset.action === 'reset') { reinitialiserFiltres(); page.recherche.focus(); }
  });


  /* ========================================================================
     JS 15 · DÉPLACER UN TICKET DANS LA LISTE
     Deux façons : la poignée + flèches haut/bas du clavier, ou le glisser-déposer.
     Un déplacement active l’ordre personnalisé (abandonné dès qu’on retrie).
     ======================================================================== */
  function apresDeplacement(id, ordreManuelDejaActif, garderLeFocus) {
    rendre();
    const ligne = page.liste.querySelector(`tr[data-id="${id}"]`);
    if (ligne) {
      ligne.classList.add('is-deplace');
      setTimeout(() => ligne.classList.remove('is-deplace'), 1400);
      if (garderLeFocus) ligne.querySelector('[data-poignee]').focus({ preventScroll: true });
      if (typeof ligne.scrollIntoView === 'function') ligne.scrollIntoView({ block: 'nearest' });
    }
    page.annonce.textContent = `Ticket #${id} déplacé en position ${idsAffiches.indexOf(id) + 1} sur ${idsAffiches.length}.`;
    if (!ordreManuelDejaActif) {
      notifier('Ordre personnalisé activé. Modifiez le tri pour revenir à l’ordre trié.', {
        libelle: 'Reprendre le tri',
        faire: () => changerTri(copieDuTri())
      });
    }
  }

  // Clavier : poignée sélectionnée + flèche haut ou bas
  page.liste.addEventListener('keydown', evenement => {
    const poignee = evenement.target.closest('[data-poignee]');
    if (!poignee || (evenement.key !== 'ArrowUp' && evenement.key !== 'ArrowDown')) return;
    evenement.preventDefault();
    const id = Number(poignee.dataset.poignee);
    const rang = idsAffiches.indexOf(id);
    const versLeHaut = evenement.key === 'ArrowUp';
    const voisin = idsAffiches[versLeHaut ? rang - 1 : rang + 1];
    if (voisin === undefined) return;
    const ordreManuelDejaActif = !!projetActif().ordreManuel;
    if (changerDePlace(id, voisin, versLeHaut ? 'avant' : 'apres', idsAffiches)) apresDeplacement(id, ordreManuelDejaActif, true);
  });

  /* ---------- Glisser-déposer ----------
     Souris ou stylet : on attrape la ligne n’importe où (sauf sur un bouton).
     Doigt : on attrape la poignée (le reste de la ligne sert à faire défiler la page).
     Pendant le glisser, un emplacement en pointillés occupe la place exacte où le
     ticket sera déposé, et les autres tickets s’écartent pour lui laisser la place. */
  const SEUIL_GLISSER = 5;          // pixels à parcourir avant que le glisser commence (un clic ne déplace rien)
  let appui = null;                 // bouton enfoncé, glisser pas encore commencé
  let glissement = null;            // glisser en cours
  let atterrissageEnCours = false;  // animation de dépôt en cours

  // Ligne de ticket voisine de « noeud » (en ignorant la ligne masquée et l’emplacement)
  function ligneVoisine(noeud, direction) {
    const suivant = element => (direction === 'suivante' ? element.nextElementSibling : element.previousElementSibling);
    let voisin = suivant(noeud);
    while (voisin && (voisin.hidden || !voisin.dataset.id)) voisin = suivant(voisin);
    return voisin;
  }

  function positionnerFantome() {
    glissement.fantome.style.transform = `translate(${glissement.x - glissement.decalageX}px, ${glissement.y - glissement.decalageY}px) rotate(1.2deg)`;
  }

  // Place le texte « sera déposé ici » du côté de l’emplacement que la carte glissée ne cache pas
  function eviterFantome() {
    const zone = glissement.zone.getBoundingClientRect();
    const centreFantomeX = glissement.x - glissement.decalageX + glissement.largeur / 2;
    const centreFantomeY = glissement.y - glissement.decalageY + glissement.fantome.offsetHeight / 2;
    glissement.zone.dataset.texte = zone.width > glissement.largeur + 160
      ? (centreFantomeX < zone.left + zone.width / 2 ? 'droite' : 'gauche')
      : (centreFantomeY < zone.top + zone.height / 2 ? 'bas' : 'haut');
  }

  function mettreAJourTexteEmplacement() {
    let position = 1;
    for (let element = glissement.emplacement.previousElementSibling; element; element = element.previousElementSibling) {
      if (element.dataset.id && !element.hidden) position += 1;
    }
    glissement.texte.textContent = `(position ${position} sur ${idsAffiches.length})`;
  }

  // Les tickets s’écartent en douceur quand l’emplacement change de place (technique FLIP :
  // on mesure avant, on déplace, puis on anime depuis l’ancienne position)
  function animerDecalage(lignes, positionsAvant) {
    if (mouvementReduit()) return;
    for (const ligne of lignes) {
      const ecart = positionsAvant.get(ligne) - ligne.getBoundingClientRect().top;
      if (!ecart) continue;
      ligne.style.transition = 'none';
      ligne.style.transform = `translateY(${ecart}px)`;
      void ligne.offsetHeight;
      ligne.style.transition = 'transform .18s ease';
      ligne.style.transform = '';
    }
  }

  // Place l’emplacement selon la hauteur du pointeur (positions de mise en page, sans les animations)
  function placerEmplacement() {
    const hautDuTableau = page.tableau.getBoundingClientRect().top;
    let ligneDApres = null;
    for (const ligne of glissement.lignes) {
      if (glissement.y < hautDuTableau + ligne.offsetTop + ligne.offsetHeight / 2) { ligneDApres = ligne; break; }
    }
    if (ligneVoisine(glissement.emplacement, 'suivante') === ligneDApres) return;   // rien à déplacer
    const positionsAvant = new Map(glissement.lignes.map(ligne => [ligne, ligne.getBoundingClientRect().top]));
    if (ligneDApres) page.liste.insertBefore(glissement.emplacement, ligneDApres);
    else page.liste.appendChild(glissement.emplacement);
    mettreAJourTexteEmplacement();
    animerDecalage(glissement.lignes, positionsAvant);
  }

  // Défilement automatique quand le pointeur approche du haut ou du bas de l’écran
  function defilerAutomatiquement() {
    if (!glissement) return;
    const marge = 80;
    let vitesse = 0;
    if (glissement.y < marge) vitesse = -Math.ceil((marge - glissement.y) / 5);
    else if (glissement.y > window.innerHeight - marge) vitesse = Math.ceil((glissement.y - (window.innerHeight - marge)) / 5);
    if (vitesse) { window.scrollBy(0, vitesse); placerEmplacement(); eviterFantome(); }
    glissement.animation = requestAnimationFrame(defilerAutomatiquement);
  }

  function commencerGlissement() {
    const { ligne, id } = appui;
    const ticket = projetActif().tickets.find(element => element.id === id);
    if (!ticket) { appui = null; return; }
    const cadre = ligne.getBoundingClientRect();
    const largeur = Math.min(cadre.width, 640);

    // Carte « fantôme » qui suit le pointeur
    const fantome = document.createElement('div');
    fantome.className = 'fantome';
    fantome.style.width = `${largeur}px`;
    fantome.setAttribute('aria-hidden', 'true');
    fantome.innerHTML = `<span class="fantome-poignee">${ICONE_POIGNEE}</span><span class="fantome-id">#${ticket.id}</span>
      <span class="fantome-titre">${echapper(ticket.titre)}</span>
      ${htmlType(ticket)}${htmlPriorite(ticket, false)}<span class="pts"><span class="carte-mini${ticket.points === null ? ' carte-mini-nv' : ''}">${ticket.points === null ? '?' : ticket.points}</span></span>`;

    // Emplacement en pointillés, de la hauteur de la ligne, à sa place
    const emplacement = document.createElement('tr');
    emplacement.className = 'emplacement';
    emplacement.setAttribute('aria-hidden', 'true');
    emplacement.innerHTML = `<td colspan="8"><div class="emplacement-zone" style="height:${Math.max(44, Math.round(cadre.height) - 12)}px">Le ticket #${ticket.id} sera déposé ici <small></small></div></td>`;
    oublierContenu(page.liste);                       // la liste est modifiée à la main pendant le glisser
    page.liste.insertBefore(emplacement, ligne);
    ligne.hidden = true;                              // le ticket « quitte » la liste : l’emplacement prend sa place
    document.body.appendChild(fantome);

    glissement = {
      id, ligne, fantome, emplacement, largeur,
      zone: emplacement.querySelector('.emplacement-zone'),
      texte: emplacement.querySelector('small'),
      lignes: [...page.liste.querySelectorAll('tr[data-id]')].filter(element => !element.hidden),   // mesurées une fois
      decalageX: Math.min(Math.max(appui.departX - cadre.left, 18), largeur - 18),
      decalageY: appui.departY - cadre.top,
      x: appui.x, y: appui.y, animation: 0
    };
    appui = null;
    masquerNotification();                            // un message en bas de l’écran ne doit pas gêner le dépôt
    document.body.classList.add('glisse-en-cours');
    positionnerFantome();
    mettreAJourTexteEmplacement();
    placerEmplacement();
    eviterFantome();
    glissement.animation = requestAnimationFrame(defilerAutomatiquement);
  }

  function nettoyerGlissement(glissementTermine) {
    cancelAnimationFrame(glissementTermine.animation);
    glissementTermine.fantome.remove();
    glissementTermine.emplacement.remove();
    glissementTermine.ligne.hidden = false;
    for (const ligne of glissementTermine.lignes) { ligne.style.transition = ''; ligne.style.transform = ''; }
    document.body.classList.remove('glisse-en-cours');
  }

  function annulerGlissement() {
    if (glissement) { nettoyerGlissement(glissement); glissement = null; }
    appui = null;
  }

  function deposer() {
    const glissementTermine = glissement;
    glissement = null;
    cancelAnimationFrame(glissementTermine.animation);
    const ligneSuivante = ligneVoisine(glissementTermine.emplacement, 'suivante');
    const lignePrecedente = ligneVoisine(glissementTermine.emplacement, 'precedente');
    const terminer = () => {
      nettoyerGlissement(glissementTermine);
      atterrissageEnCours = false;
      const ordreManuelDejaActif = !!projetActif().ordreManuel;
      let deplace = false;
      if (ligneSuivante) deplace = changerDePlace(glissementTermine.id, Number(ligneSuivante.dataset.id), 'avant', idsAffiches);
      else if (lignePrecedente) deplace = changerDePlace(glissementTermine.id, Number(lignePrecedente.dataset.id), 'apres', idsAffiches);
      if (deplace) apresDeplacement(glissementTermine.id, ordreManuelDejaActif);
    };
    if (mouvementReduit()) { terminer(); return; }
    // La carte « atterrit » dans son emplacement avant d’y être insérée
    atterrissageEnCours = true;
    const cible = glissementTermine.zone.getBoundingClientRect();
    glissementTermine.fantome.style.transition = 'transform .16s ease-out';
    glissementTermine.fantome.style.transform = `translate(${cible.left}px, ${cible.top + (cible.height - glissementTermine.fantome.offsetHeight) / 2}px) rotate(0deg)`;
    setTimeout(terminer, 160);
  }

  page.liste.addEventListener('pointerdown', evenement => {
    if (glissement || atterrissageEnCours || (evenement.pointerType === 'mouse' && evenement.button !== 0)) return;
    const ligne = evenement.target.closest('tr[data-id]');
    if (!ligne) return;
    const surLaPoignee = !!evenement.target.closest('[data-poignee]');
    if (!surLaPoignee && evenement.target.closest('button, a, input, select, textarea')) return;
    if (evenement.pointerType === 'touch' && !surLaPoignee) return;
    if (evenement.pointerType === 'mouse') evenement.preventDefault();   // évite de sélectionner le texte
    appui = { id: Number(ligne.dataset.id), ligne, departX: evenement.clientX, departY: evenement.clientY, x: evenement.clientX, y: evenement.clientY };
    if (evenement.target.setPointerCapture && evenement.pointerType !== 'mouse') {
      try { evenement.target.setPointerCapture(evenement.pointerId); } catch (erreur) { /* sans conséquence */ }
    }
  });
  document.addEventListener('pointermove', evenement => {
    if (appui) {
      appui.x = evenement.clientX;
      appui.y = evenement.clientY;
      if (Math.hypot(evenement.clientX - appui.departX, evenement.clientY - appui.departY) >= SEUIL_GLISSER) commencerGlissement();
      return;
    }
    if (!glissement) return;
    glissement.x = evenement.clientX;
    glissement.y = evenement.clientY;
    positionnerFantome();
    placerEmplacement();
    eviterFantome();
  });
  document.addEventListener('pointerup', () => {
    appui = null;
    if (glissement) deposer();
  });
  document.addEventListener('pointercancel', annulerGlissement);
  window.addEventListener('scroll', () => { if (glissement) placerEmplacement(); }, { passive: true });
  document.addEventListener('keydown', evenement => {
    if (glissement && evenement.key === 'Escape') { evenement.preventDefault(); annulerGlissement(); }
  });


  /* ========================================================================
     JS 16 · KANBAN : BOUTONS ◀ ▶ (règle R3), GLISSER-DÉPOSER ET BOUTON MODIFIER
     Chaque changement de colonne passe par la fonction pure deplacerTicket().
     ======================================================================== */

  // Affiche le refus dans la carte concernée (pas de alert()) et signale la colonne visée
  function signalerRefus(id, versStatut, erreur) {
    masquerNotification();
    oublierContenu(page.kanban);                       // le message disparaîtra au prochain affichage
    for (const message of page.kanban.querySelectorAll('.kb-refus')) message.remove();
    for (const element of page.kanban.querySelectorAll('.is-refus')) element.classList.remove('is-refus');
    const carte = page.kanban.querySelector(`.kb-carte[data-id="${id}"]`);
    if (!carte) return;
    const message = document.createElement('p');
    message.className = 'kb-refus';
    message.setAttribute('role', 'alert');            // lu immédiatement par les lecteurs d’écran
    message.innerHTML = `<strong>Déplacement refusé.</strong> ${echapper(expliquerRefus(erreur, versStatut))}`;
    carte.querySelector('.kb-actions').before(message);
    void carte.offsetWidth;                           // relance l’animation « secoue la tête »
    carte.classList.add('is-refus');
    const colonne = page.kanban.querySelector(`.kb-col[data-colonne="${versStatut}"]`);
    if (colonne) { colonne.classList.add('is-refus'); setTimeout(() => colonne.classList.remove('is-refus'), 1300); }
  }

  // Après un déplacement : la carte est mise en valeur et, si besoin, garde le focus.
  // « choisirFocus(carte) » indique quel bouton de la carte doit recevoir le focus. Renvoie la carte (ou null).
  function mettreEnValeurCarte(id, choisirFocus) {
    const carte = page.kanban.querySelector(`.kb-carte[data-id="${id}"]`);
    if (!carte) return null;                          // la carte est masquée par les filtres
    carte.classList.add('is-deplace');
    setTimeout(() => carte.classList.remove('is-deplace'), 1400);
    const aFocaliser = choisirFocus && choisirFocus(carte);
    if (aFocaliser) aFocaliser.focus({ preventScroll: true });
    if (typeof carte.scrollIntoView === 'function') carte.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    return carte;
  }

  // Message quand la carte déplacée n’est plus visible à cause des filtres
  function signalerCarteMasquee(id, titreColonne) {
    notifier(`Ticket #${id} déplacé vers «\u00a0${titreColonne}\u00a0», mais masqué par vos filtres.`, {
      libelle: 'Tout afficher', faire: () => { reinitialiserFiltres(); surlignerTicket(id); }
    });
  }

  // Change un ticket de colonne, à la place donnée par le tri (boutons ◀ ▶ et clavier)
  function deplacerCarte(id, versStatut, choisirFocus) {
    const projet = projetActif();
    const resultat = deplacerTicket(projet.tickets, id, versStatut);
    if (!resultat.ok) { signalerRefus(id, versStatut, resultat.erreur); return false; }
    const avant = instantane(projet);
    const de = projet.tickets.find(element => element.id === id).statut;
    projet.tickets = resultat.tickets;                // le Backlog et le Kanban lisent ce même tableau
    noterDeplacement(projet, id, de, versStatut, avant);
    rendre();
    const titreColonne = libelleDe(STATUTS, versStatut);
    if (!mettreEnValeurCarte(id, choisirFocus)) { signalerCarteMasquee(id, titreColonne); return true; }
    page.annonce.textContent = `Ticket #${id} déplacé vers ${titreColonne}.`;
    notifier(`Ticket #${id} déplacé vers «\u00a0${titreColonne}\u00a0».`, { libelle: 'Annuler', faire: annulerLeDernierDeplacement });
    return true;
  }

  // Change un ticket de colonne ET le place où l’utilisateur l’a déposé (glisser-déposer).
  // idSuivante / idPrecedente : cartes entre lesquelles il a été lâché (null s’il n’y en a pas).
  function deposerDansUneAutreColonne(id, versStatut, idSuivante, idPrecedente, idsColonne) {
    const projet = projetActif();
    const resultat = deplacerTicket(projet.tickets, id, versStatut);      // règles R1, R2 et R5
    if (!resultat.ok) { signalerRefus(id, versStatut, resultat.erreur); return false; }
    const ordreManuelDejaActif = !!projet.ordreManuel;
    const avant = instantane(projet);
    const de = projet.tickets.find(element => element.id === id).statut;
    projet.tickets = resultat.tickets;
    // La place choisie ne compte que si elle diffère de celle que donnerait le tri
    let placeChoisie = false;
    if (idSuivante !== null) placeChoisie = reordonnerTicket(id, idSuivante, 'avant', idsColonne);
    else if (idPrecedente !== null) placeChoisie = reordonnerTicket(id, idPrecedente, 'apres', idsColonne);
    noterDeplacement(projet, id, de, versStatut, avant);
    rendre();
    const titreColonne = libelleDe(STATUTS, versStatut);
    const carte = mettreEnValeurCarte(id, null);
    if (!carte) { signalerCarteMasquee(id, titreColonne); return true; }
    const cartes = [...carte.parentElement.querySelectorAll('.kb-carte')];
    page.annonce.textContent = `Ticket #${id} déplacé vers ${titreColonne}, en position ${cartes.indexOf(carte) + 1} sur ${cartes.length}.`;
    if (placeChoisie && !ordreManuelDejaActif) {
      notifier(`Ticket #${id} déplacé vers «\u00a0${titreColonne}\u00a0», à la place choisie. Ordre personnalisé activé.`, {
        libelle: 'Reprendre le tri', faire: () => changerTri(copieDuTri())
      });
    } else {
      notifier(`Ticket #${id} déplacé vers «\u00a0${titreColonne}\u00a0».`, { libelle: 'Annuler', faire: annulerLeDernierDeplacement });
    }
    return true;
  }

  // « Annuler » : défait le dernier déplacement du journal (bouton, notification ou Ctrl+Z)
  function annulerLeDeplacement(rang = 0) {
    const projet = projetActif();
    const cible = (projet.journal || [])[rang];
    const resultat = annulerDeplacement(projet, rang);
    if (!resultat.ok) {
      const message = `Impossible d’annuler ce déplacement\u00a0: ${resultat.erreur}. Rien n’a été changé.`;
      page.annonce.textContent = message;
      notifier(message);
      return;
    }
    projet.tickets = resultat.tickets;
    projet.ordreManuel = resultat.ordreManuel;
    projet.journal = resultat.journal;
    rendre();
    surlignerTicket(cible.id);
    // Le focus reste dans le journal (le bouton cliqué a disparu avec sa ligne)
    const boutons = trouverTous('#journal-liste [data-annuler-rang]');
    (boutons[Math.min(rang, boutons.length - 1)] || trouver('#btn-annuler-deplacement')).focus({ preventScroll: true });
    const nombre = resultat.annules.length;
    const message = nombre > 1
      ? `${nombre} déplacements du ticket #${cible.id} annulés\u00a0: il revient dans «\u00a0${libelleDe(STATUTS, cible.de)}\u00a0».`
      : cible.de === cible.vers
        ? `Changement de place annulé\u00a0: le ticket #${cible.id} reprend sa place précédente.`
        : `Déplacement annulé\u00a0: le ticket #${cible.id} revient dans «\u00a0${libelleDe(STATUTS, cible.de)}\u00a0».`;
    page.annonce.textContent = message;
    notifier(message);
  }
  const annulerLeDernierDeplacement = () => annulerLeDeplacement(0);

  // Identifiants des cartes affichées dans une colonne du Kanban
  const idsDeLaColonne = colonne => [...colonne.querySelectorAll('.kb-carte')].map(carte => Number(carte.dataset.id));

  // Change une carte de place dans sa colonne : c’est l’ordre personnalisé, partagé avec le Backlog
  function reordonnerCarte(id, idVoisin, position, choisirFocus, idsColonne) {
    const ordreManuelDejaActif = !!projetActif().ordreManuel;
    if (!changerDePlace(id, idVoisin, position, idsColonne)) return false;
    rendre();
    const carte = mettreEnValeurCarte(id, choisirFocus);
    if (carte) {
      const cartes = [...carte.parentElement.querySelectorAll('.kb-carte')];
      page.annonce.textContent = `Ticket #${id} déplacé en position ${cartes.indexOf(carte) + 1} sur ${cartes.length}.`;
    }
    if (!ordreManuelDejaActif) {
      notifier('Ordre personnalisé activé. Modifiez le tri pour revenir à l’ordre trié.', {
        libelle: 'Reprendre le tri', faire: () => changerTri(copieDuTri())
      });
    }
    return true;
  }

  // Clics : bouton Modifier, ou bouton ◀ ▶
  page.kanban.addEventListener('click', evenement => {
    const mention = evenement.target.closest('[data-note-import]');
    if (mention) { ouvrirNoteImport(mention); return; }
    const boutonModifier = evenement.target.closest('[data-modifier]');
    if (boutonModifier) { ouvrirModificationDepuis(boutonModifier); return; }
    const bouton = evenement.target.closest('[data-vers]');
    if (!bouton) return;
    const cote = bouton.classList.contains('kb-fleche-droite') ? 'droite' : 'gauche';
    // Le focus reste sur la carte, sur le bouton du même côté pour enchaîner les déplacements
    deplacerCarte(Number(bouton.dataset.kanban), bouton.dataset.vers,
      carte => carte.querySelector(`.kb-fleche-${cote}`) || carte.querySelector('.kb-fleche'));
  });

  // Clavier sur la poignée : ← → changent de colonne, ↑ ↓ changent de place dans la colonne
  page.kanban.addEventListener('keydown', evenement => {
    const poignee = evenement.target.closest('[data-poignee-kanban]');
    if (!poignee || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(evenement.key)) return;
    evenement.preventDefault();
    const id = Number(poignee.dataset.poigneeKanban);
    const carte = poignee.closest('.kb-carte');
    const garderLaPoignee = carteAffichee => carteAffichee.querySelector('[data-poignee-kanban]');
    if (evenement.key === 'ArrowLeft' || evenement.key === 'ArrowRight') {
      const rangColonne = COLONNES.findIndex(colonne => colonne.id === carte.closest('.kb-col').dataset.colonne);
      const voisine = COLONNES[rangColonne + (evenement.key === 'ArrowRight' ? 1 : -1)];
      if (voisine) deplacerCarte(id, voisine.id, garderLaPoignee);
      return;
    }
    const versLeHaut = evenement.key === 'ArrowUp';
    const voisine = versLeHaut ? carte.previousElementSibling : carte.nextElementSibling;
    if (voisine) reordonnerCarte(id, Number(voisine.dataset.id), versLeHaut ? 'avant' : 'apres', garderLaPoignee, idsDeLaColonne(carte.closest('.kb-col')));
  });

  /* ---------- Kanban : glisser-déposer ----------
     Souris ou stylet : glisser-déposer NATIF du navigateur (draggable, dragstart,
     dragover, drop), sans bibliothèque. Les trois pièges sont traités :
       Piège 1 · dragover appelle e.preventDefault(), sinon le navigateur refuse le dépôt ;
       Piège 2 · getData renvoie du texte : l’id est converti avec Number(…) et vérifié ;
       Piège 3 · le dépôt passe par deplacerTicket(), comme les boutons ◀ ▶ (WIP, DoR).
     Doigt : le glisser natif est mal pris en charge sur écran tactile ; on attrape
     la poignée ⠿ et le geste est suivi avec les événements de pointeur.
     – Dans toutes les colonnes, l’emplacement en pointillés suit le pointeur :
       la carte sera déposée exactement là (ordre personnalisé si cette place
       diffère de celle du tri).
     – Si R1 ou R2 interdisent la colonne survolée, elle passe en rouge et
       l’étiquette de la carte donne la raison.
     Le changement de colonne passe par deplacerTicket() : les règles des boutons ◀ ▶. */
  let appuiKanban = null;               // bouton enfoncé sur une carte, glisser pas encore commencé
  let glissementKanban = null;          // glisser en cours
  let atterrissageKanbanEnCours = false;

  // Liste des cartes d’une colonne (créée à la volée si la colonne est vide)
  function listeDeCartes(colonne) {
    let liste = colonne.querySelector('.kb-cartes');
    if (!liste) {
      liste = document.createElement('ol');
      liste.className = 'kb-cartes';
      colonne.querySelector('.kb-vide').before(liste);
    }
    return liste;
  }

  // Cartes visibles d’une colonne, sans la carte glissée (mises en cache : elles ne changent pas pendant le glisser)
  function cartesVisiblesDe(colonne) {
    if (!glissementKanban.cartesParColonne.has(colonne)) {
      glissementKanban.cartesParColonne.set(colonne, [...colonne.querySelectorAll('.kb-carte')].filter(carte => !carte.hidden));
    }
    return glissementKanban.cartesParColonne.get(colonne);
  }

  // Carte voisine de l’emplacement (en ignorant la carte masquée) : 'suivante' ou 'precedente'
  function carteVoisineDe(emplacement, direction) {
    const suivant = element => (direction === 'suivante' ? element.nextElementSibling : element.previousElementSibling);
    let voisine = suivant(emplacement);
    while (voisine && (voisine.hidden || !voisine.classList.contains('kb-carte'))) voisine = suivant(voisine);
    return voisine ? Number(voisine.dataset.id) : null;
  }

  // Colonne sous le pointeur ; null si le pointeur est sorti du tableau
  function colonneSousLePointeur(x, y) {
    const tableau = page.kanban.getBoundingClientRect();
    if (x < tableau.left - 40 || x > tableau.right + 40 || y < tableau.top - 40 || y > tableau.bottom + 40) return null;
    let plusProche = null;
    let distanceMinimale = Infinity;
    for (const colonne of glissementKanban.colonnes) {
      const cadre = colonne.getBoundingClientRect();
      const distance = x < cadre.left ? cadre.left - x : x > cadre.right ? x - cadre.right : 0;
      if (distance < distanceMinimale) { distanceMinimale = distance; plusProche = colonne; }
    }
    return plusProche;
  }

  // Simulation du dépôt dans une colonne (mise en cache : les tickets ne changent pas pendant le glisser)
  function simulerDepot(idColonne) {
    if (!glissementKanban.simulations.has(idColonne)) {
      const projet = projetActif();
      const essai = deplacerTicket(projet.tickets, glissementKanban.id, idColonne);
      // La carte restera-t-elle visible avec les filtres actuels ?
      const masque = essai.ok && !filtrer(essai.tickets.filter(ticket => ticket.id === glissementKanban.id), mots(etat.filtres.texte)).length;
      glissementKanban.simulations.set(idColonne, { ok: essai.ok, erreur: essai.erreur, masque });
    }
    return glissementKanban.simulations.get(idColonne);
  }

  function positionnerFantomeKanban() {
    const g = glissementKanban;
    if (g.fantome) g.fantome.style.transform = `translate(${g.x - g.decalageX}px, ${g.y - g.decalageY}px)`;
  }

  // Met à jour la colonne visée, l’emplacement et l’étiquette selon la position du pointeur
  function placerEmplacementKanban() {
    const g = glissementKanban;
    if (!g || !g.pret) return;                          // glisser natif : l’emplacement n’est pas encore posé
    const etiqueter = texte => { if (g.etiquette) g.etiquette.textContent = texte; };
    const colonne = colonneSousLePointeur(g.x, g.y) || g.colonneSource;
    const horsDuTableau = !colonneSousLePointeur(g.x, g.y);
    const memeColonne = colonne === g.colonneSource;
    const liste = listeDeCartes(colonne);
    const titreColonne = libelleDe(STATUTS, colonne.dataset.colonne);
    let ref = null;            // carte avant laquelle placer l’emplacement (null = en bas de la colonne)
    let etatDepot;             // 'neutre', 'possible' ou 'refuse'
    let texte;

    if (horsDuTableau) {
      ref = g.suivanteDOrigine;                       // l’emplacement revient à la place d’origine
      etatDepot = 'neutre';
      texte = `Le ticket #${g.id} reste à sa place`;
      etiqueter('Relâchez dans une colonne');
    } else {
      // L’emplacement suit le pointeur : il se place avant la première carte dont le milieu est plus bas
      const hautDuTableau = page.kanban.getBoundingClientRect().top;
      for (const carte of cartesVisiblesDe(colonne)) {
        if (g.y < hautDuTableau + carte.offsetTop + carte.offsetHeight / 2) { ref = carte; break; }
      }
      if (memeColonne) {
        etatDepot = 'neutre';
        texte = `Le ticket #${g.id} sera déposé ici`;
        etiqueter(`Changer de place dans «\u00a0${titreColonne}\u00a0»`);
      } else {
        const simulation = simulerDepot(colonne.dataset.colonne);
        if (simulation.ok) {
          etatDepot = 'possible';
          texte = simulation.masque ? `Arrivera dans «\u00a0${titreColonne}\u00a0» (masqué par vos filtres)` : `Le ticket #${g.id} arrivera ici`;
          etiqueter(`Déposer dans «\u00a0${titreColonne}\u00a0»`);
        } else {
          etatDepot = 'refuse';
          texte = `Refusé\u00a0: ${simulation.erreur}`;
          etiqueter(`Refusé\u00a0: ${simulation.erreur}`);
        }
      }
    }

    // Couleur de la colonne visée et de la carte glissée
    for (const autre of g.colonnes) {
      autre.classList.toggle('is-cible', autre === colonne && etatDepot === 'possible');
      autre.classList.toggle('is-interdit', autre === colonne && etatDepot === 'refuse');
    }
    if (g.fantome) {
      g.fantome.classList.toggle('is-refuse', etatDepot === 'refuse');
      g.fantome.classList.toggle('is-neutre', etatDepot === 'neutre');
    }
    g.emplacement.classList.toggle('is-refuse', etatDepot === 'refuse');
    g.texteEmplacement.textContent = texte;
    g.colonneCible = horsDuTableau ? null : colonne;
    g.etatDepot = etatDepot;

    // Déplacement de l’emplacement, avec l’écartement en douceur des cartes (FLIP)
    if (g.emplacement.parentElement === liste && g.emplacement.nextElementSibling === ref) return;
    const cartes = [...page.kanban.querySelectorAll('.kb-carte')].filter(carte => !carte.hidden);
    const positionsAvant = new Map(cartes.map(carte => [carte, carte.getBoundingClientRect().top]));
    const ancienneColonne = g.emplacement.closest('.kb-col');
    if (ref) liste.insertBefore(g.emplacement, ref); else liste.appendChild(g.emplacement);
    // Le message « Aucun ticket » d’une colonne vide s’efface quand l’emplacement y entre
    for (const autre of new Set([ancienneColonne, colonne])) {
      const messageVide = autre && autre.querySelector('.kb-vide');
      if (messageVide) messageVide.hidden = !!autre.querySelector('.kb-emplacement');
    }
    animerDecalage(cartes, positionsAvant);
  }

  // Défilement automatique : vertical (page) et horizontal (colonnes, sur petit écran)
  function defilerKanbanAutomatiquement() {
    const g = glissementKanban;
    if (!g) return;
    const marge = 70;
    let vertical = 0;
    let horizontal = 0;
    if (g.y < marge) vertical = -Math.ceil((marge - g.y) / 5);
    else if (g.y > window.innerHeight - marge) vertical = Math.ceil((g.y - (window.innerHeight - marge)) / 5);
    if (page.kanban.scrollWidth > page.kanban.clientWidth) {
      const cadre = page.kanban.getBoundingClientRect();
      if (g.x < cadre.left + marge) horizontal = -Math.ceil((cadre.left + marge - g.x) / 4);
      else if (g.x > cadre.right - marge) horizontal = Math.ceil((g.x - (cadre.right - marge)) / 4);
    }
    if (vertical) window.scrollBy(0, vertical);
    if (horizontal) page.kanban.scrollLeft += horizontal;
    if (vertical || horizontal) placerEmplacementKanban();
    g.animation = requestAnimationFrame(defilerKanbanAutomatiquement);
  }

  // Prépare un glisser : mode « doigt » (événements de pointeur) ou « natif » (glisser-déposer du navigateur)
  function commencerGlissementKanban(mode, carte, x, y) {
    const id = Number(carte.dataset.id);
    const cadre = carte.getBoundingClientRect();
    let fantome = null;
    let etiquette = null;
    if (mode === 'doigt') {
      // Carte « fantôme » qui suit le doigt, surmontée d’une étiquette
      fantome = document.createElement('div');
      fantome.className = 'kb-fantome is-neutre';
      fantome.style.width = `${cadre.width}px`;
      fantome.setAttribute('aria-hidden', 'true');
      etiquette = document.createElement('p');
      etiquette.className = 'kb-fantome-etiquette';
      fantome.append(etiquette, carte.cloneNode(true));
    }
    // Emplacement en pointillés, de la hauteur de la carte : il montre où la carte sera déposée
    const emplacement = document.createElement('li');
    emplacement.className = 'kb-emplacement';
    emplacement.setAttribute('aria-hidden', 'true');
    emplacement.innerHTML = `<div class="kb-emplacement-zone" style="min-height:${Math.round(cadre.height)}px"><span></span></div>`;
    const colonneSource = carte.closest('.kb-col');
    glissementKanban = {
      mode, id, carte, fantome, etiquette, emplacement, colonneSource,
      suivanteDOrigine: carte.nextElementSibling,
      texteEmplacement: emplacement.querySelector('span'),
      colonnes: [...page.kanban.querySelectorAll('.kb-col')],
      cartesParColonne: new Map(),
      simulations: new Map(),
      decalageX: x - cadre.left,
      decalageY: y - cadre.top + (etiquette ? 34 : 0),     // la carte reste sous le doigt
      x, y, colonneCible: colonneSource, etatDepot: 'neutre', animation: 0, pret: false
    };
    masquerNotification();
    document.body.classList.add('glisse-en-cours');
    // La carte d’origine laisse place à l’emplacement. En glisser natif, on attend que le
    // navigateur ait photographié la carte (sinon il annule le glisser).
    const poserLEmplacement = () => {
      const g = glissementKanban;
      if (!g || g.carte !== carte || g.pret) return;
      oublierContenu(page.kanban);                   // le Kanban est modifié à la main pendant le glisser
      for (const message of page.kanban.querySelectorAll('.kb-refus')) message.remove();
      carte.parentElement.insertBefore(emplacement, carte);
      carte.hidden = true;
      g.pret = true;
      placerEmplacementKanban();
    };
    if (mode === 'natif') setTimeout(poserLEmplacement, 0);
    else {
      document.body.appendChild(fantome);
      poserLEmplacement();
      positionnerFantomeKanban();
      glissementKanban.animation = requestAnimationFrame(defilerKanbanAutomatiquement);
    }
  }

  function nettoyerGlissementKanban(g) {
    cancelAnimationFrame(g.animation);
    if (g.fantome) g.fantome.remove();
    g.emplacement.remove();
    g.carte.hidden = false;
    for (const colonne of g.colonnes) {
      colonne.classList.remove('is-cible', 'is-interdit');
      const messageVide = colonne.querySelector('.kb-vide');
      if (messageVide) messageVide.hidden = false;
    }
    for (const carte of page.kanban.querySelectorAll('.kb-carte')) { carte.style.transition = ''; carte.style.transform = ''; }
    document.body.classList.remove('glisse-en-cours');
  }

  function annulerGlissementKanban() {
    if (glissementKanban) { nettoyerGlissementKanban(glissementKanban); glissementKanban = null; }
    appuiKanban = null;
  }

  function deposerKanban() {
    const g = glissementKanban;
    glissementKanban = null;
    cancelAnimationFrame(g.animation);
    const colonneCible = g.colonneCible;
    // Cartes entre lesquelles la carte a été lâchée (relevées avant de retirer l’emplacement)
    const idSuivante = carteVoisineDe(g.emplacement, 'suivante');
    const idPrecedente = carteVoisineDe(g.emplacement, 'precedente');
    // Cartes visibles de la colonne visée, carte glissée comprise : seul leur ordre compte
    const idsColonne = colonneCible
      ? [...colonneCible.querySelectorAll('.kb-carte')].filter(carte => !carte.hidden).map(carte => Number(carte.dataset.id)).concat(g.id)
      : [];
    const terminer = () => {
      nettoyerGlissementKanban(g);
      atterrissageKanbanEnCours = false;
      if (!colonneCible) return;                     // relâché hors du tableau : rien ne change
      if (colonneCible !== g.colonneSource) {
        // Autre colonne : R1 et R2 d’abord (refus éventuel signalé dans la carte), puis la place choisie
        deposerDansUneAutreColonne(g.id, colonneCible.dataset.colonne, idSuivante, idPrecedente, idsColonne);
        return;
      }
      // Même colonne : nouvelle place parmi les cartes visibles
      if (idSuivante !== null) reordonnerCarte(g.id, idSuivante, 'avant', null, idsColonne);
      else if (idPrecedente !== null) reordonnerCarte(g.id, idPrecedente, 'apres', null, idsColonne);
    };
    if (!g.fantome || mouvementReduit() || g.etatDepot === 'refuse') { terminer(); return; }
    // La carte « atterrit » dans son emplacement avant d’y être insérée
    atterrissageKanbanEnCours = true;
    const cible = g.emplacement.getBoundingClientRect();
    const decalageCarte = g.fantome.lastElementChild.offsetTop;
    g.fantome.style.transition = 'transform .16s ease-out';
    g.fantome.style.transform = `translate(${cible.left}px, ${cible.top - decalageCarte}px)`;
    setTimeout(terminer, 160);
  }

  // Au doigt : on attrape la poignée ⠿
  page.kanban.addEventListener('pointerdown', evenement => {
    if (evenement.pointerType !== 'touch' || glissementKanban || atterrissageKanbanEnCours || glissement) return;
    const poignee = evenement.target.closest('[data-poignee-kanban]');
    const carte = poignee && poignee.closest('.kb-carte');
    if (!carte) return;
    appuiKanban = { carte, departX: evenement.clientX, departY: evenement.clientY, x: evenement.clientX, y: evenement.clientY };
    try { poignee.setPointerCapture(evenement.pointerId); } catch (erreur) { /* sans conséquence */ }
  });
  document.addEventListener('pointermove', evenement => {
    if (appuiKanban) {
      appuiKanban.x = evenement.clientX;
      appuiKanban.y = evenement.clientY;
      if (Math.hypot(evenement.clientX - appuiKanban.departX, evenement.clientY - appuiKanban.departY) >= SEUIL_GLISSER) {
        const { carte, departX, departY } = appuiKanban;
        appuiKanban = null;
        commencerGlissementKanban('doigt', carte, departX, departY);
        glissementKanban.x = evenement.clientX;
        glissementKanban.y = evenement.clientY;
        positionnerFantomeKanban();
        placerEmplacementKanban();
      }
      return;
    }
    if (!glissementKanban || glissementKanban.mode !== 'doigt') return;
    glissementKanban.x = evenement.clientX;
    glissementKanban.y = evenement.clientY;
    positionnerFantomeKanban();
    placerEmplacementKanban();
  });
  document.addEventListener('pointerup', () => {
    appuiKanban = null;
    if (glissementKanban && glissementKanban.mode === 'doigt') deposerKanban();
  });
  document.addEventListener('pointercancel', () => { if (!glissementKanban || glissementKanban.mode === 'doigt') annulerGlissementKanban(); });

  /* ---------- Glisser-déposer natif (souris, stylet) ---------- */
  page.kanban.addEventListener('dragstart', evenement => {
    const carte = evenement.target.closest && evenement.target.closest('.kb-carte');
    if (!carte || glissementKanban || atterrissageKanbanEnCours || glissement) { if (carte) evenement.preventDefault(); return; }
    evenement.dataTransfer.effectAllowed = 'move';
    evenement.dataTransfer.setData('text/plain', carte.dataset.id);   // arrivera en texte (piège 2)
    commencerGlissementKanban('natif', carte, evenement.clientX, evenement.clientY);
  });
  // Piège 1 : sans preventDefault sur dragover, le navigateur refuse tout dépôt (la carte revient sans erreur).
  // Même chose pour dragenter : quand l’emplacement en pointillés apparaît sous le pointeur, il devient
  // le nouvel élément survolé ; s’il n’accepte pas le dépôt, le « drop » n’arrive jamais.
  page.kanban.addEventListener('dragenter', evenement => {
    if (glissementKanban && glissementKanban.mode === 'natif') evenement.preventDefault();
  });
  page.kanban.addEventListener('dragover', evenement => {
    if (!glissementKanban || glissementKanban.mode !== 'natif') return;   // un glisser venu d’ailleurs reste refusé
    evenement.preventDefault();
    evenement.dataTransfer.dropEffect = 'move';
    glissementKanban.x = evenement.clientX;
    glissementKanban.y = evenement.clientY;
    placerEmplacementKanban();                       // colonne survolée en surbrillance, emplacement à jour
  });
  // Sortie du tableau : l’emplacement revient à la place d’origine
  page.kanban.addEventListener('dragleave', evenement => {
    const g = glissementKanban;
    if (!g || g.mode !== 'natif') return;
    const cadre = page.kanban.getBoundingClientRect();
    const dehors = evenement.clientX < cadre.left || evenement.clientX > cadre.right || evenement.clientY < cadre.top || evenement.clientY > cadre.bottom;
    if (!dehors) return;
    g.x = -99999;
    g.y = -99999;
    placerEmplacementKanban();
  });
  page.kanban.addEventListener('drop', evenement => {
    const g = glissementKanban;
    if (!g || g.mode !== 'natif') return;
    evenement.preventDefault();
    // Piège 2 : getData renvoie toujours du texte (« 7 ») ; sans Number(…), find(id === 7) ne trouverait rien
    const id = Number(evenement.dataTransfer.getData('text/plain'));
    if (!Number.isInteger(id) || id !== g.id) { annulerGlissementKanban(); return; }
    g.x = evenement.clientX;
    g.y = evenement.clientY;
    placerEmplacementKanban();
    deposerKanban();                                 // piège 3 : passe par deplacerTicket(), règles R1 et R2 comprises
  });
  // Glisser abandonné (Échap, relâché hors du tableau) : tout revient comme avant
  page.kanban.addEventListener('dragend', () => {
    if (glissementKanban && glissementKanban.mode === 'natif') annulerGlissementKanban();
  });
  page.kanban.addEventListener('scroll', () => { if (glissementKanban) placerEmplacementKanban(); }, { passive: true });
  window.addEventListener('scroll', () => { if (glissementKanban) placerEmplacementKanban(); }, { passive: true });
  document.addEventListener('keydown', evenement => {
    if (glissementKanban && evenement.key === 'Escape') { evenement.preventDefault(); annulerGlissementKanban(); }
  });


  /* ========================================================================
     JS 17 · IMPORT ET EXPORT : FENÊTRES ET TÉLÉCHARGEMENT
     Dans claude.ai, un fichier ne peut être proposé que par la capacité
     « downloads » (le visiteur confirme l’enregistrement). Ouverte ailleurs
     (fichier enregistré sur l’ordinateur), la page utilise un lien classique.
     ======================================================================== */
  const dansClaude = !!(window.claude && typeof window.claude.use === 'function');
  const capaciteTelechargement = dansClaude ? window.claude.use('downloads') : Promise.resolve(null);
  // Sans capacité dans claude.ai, l’export est impossible : on masque le bouton
  if (dansClaude) capaciteTelechargement.then(capacite => { if (!capacite) page.boutonExporter.hidden = true; });

  async function enregistrerFichier(nomFichier, contenu) {
    if (dansClaude) {
      const telechargements = await capaciteTelechargement;
      if (!telechargements) throw { code: 'unavailable' };
      return telechargements.save({ filename: nomFichier, data: contenu });
    }
    const type = nomFichier.endsWith('.json') ? 'application/json' : 'text/csv';
    const adresse = URL.createObjectURL(new Blob([contenu], { type: `${type};charset=utf-8` }));
    const lien = document.createElement('a');
    lien.href = adresse;
    lien.download = nomFichier;
    document.body.appendChild(lien);
    lien.click();
    lien.remove();
    setTimeout(() => URL.revokeObjectURL(adresse), 1000);
    return { status: 'saved' };
  }

  /* ---------- Exporter ---------- */
  const AIDES_FORMAT = {
    csv: 'Pour un tableur (Excel, LibreOffice, Google Sheets)\u00a0: une ligne par ticket, colonnes séparées par des points-virgules.',
    json: 'Pour un autre outil ou une sauvegarde\u00a0: une liste d’objets qui suivent exactement le modèle de ticket.'
  };
  const formatExport = () => new FormData(page.formulaireExport).get('format');
  const contenuExport = () => new FormData(page.formulaireExport).get('contenu');

  function mettreAJourFenetreExport() {
    page.aideFormatExport.textContent = AIDES_FORMAT[formatExport()];
    page.nomFichierExport.textContent = nomDeFichier(projetActif().nom, aujourdhuiIso(), formatExport());
    page.erreurExport.hidden = true;
  }
  page.boutonExporter.addEventListener('click', () => {
    const projet = projetActif();
    const { visibles } = ticketsAffiches(projet);
    page.formulaireExport.reset();
    page.projetExport.textContent = `Projet\u00a0: ${projet.nom}`;
    page.libelleTousExport.textContent = `Tous les tickets (${projet.tickets.length})`;
    page.libelleAffichesExport.textContent = `Seulement les tickets affichés (${visibles.length})`;
    // Le choix n’a de sens que si la recherche ou des filtres masquent des tickets
    page.choixContenuExport.hidden = visibles.length === projet.tickets.length;
    page.boutonValiderExport.disabled = projet.tickets.length === 0;
    mettreAJourFenetreExport();
    if (!projet.tickets.length) { page.erreurExport.textContent = 'Ce projet ne contient aucun ticket à exporter.'; page.erreurExport.hidden = false; }
    ouvrirFenetre(page.fenetreExport, page.boutonExporter);
  });
  page.formulaireExport.addEventListener('change', mettreAJourFenetreExport);
  page.formulaireExport.addEventListener('submit', async evenement => {
    evenement.preventDefault();
    const projet = projetActif();
    const format = formatExport();
    const tickets = contenuExport() === 'affiches' && !page.choixContenuExport.hidden
      ? ticketsAffiches(projet).visibles
      : ordonner([...projet.tickets], projet);                  // dans l’ordre de la liste
    const nomFichier = nomDeFichier(projet.nom, aujourdhuiIso(), format);
    page.boutonValiderExport.disabled = true;
    try {
      await enregistrerFichier(nomFichier, format === 'json' ? ticketsEnJson(tickets) : ticketsEnCsv(tickets));
      fermerFenetre(page.fenetreExport);
      notifier(`${pluriel(tickets.length, 'ticket')} exporté${tickets.length > 1 ? 's' : ''} dans «\u00a0${nomFichier}\u00a0».`);
    } catch (erreur) {
      const code = erreur && erreur.code;
      if (code === 'declined') { fermerFenetre(page.fenetreExport); notifier('Export annulé\u00a0: le fichier n’a pas été enregistré.'); return; }
      page.erreurExport.textContent = code === 'extension_not_enabled' || code === 'rejected_extension'
        ? `Le format ${format.toUpperCase()} n’est pas disponible ici.`
        : code === 'rate_limited' ? 'Une demande d’enregistrement est déjà ouverte : terminez-la, puis réessayez.'
        : 'L’export de fichiers n’est pas disponible dans cet affichage.';
      page.erreurExport.hidden = false;
    } finally {
      page.boutonValiderExport.disabled = false;
    }
  });

  /* ---------- Rapport d’import (règle I5) ---------- */
  const LIBELLES_COLONNES = { id: 'id (nouveaux numéros)', type: 'type (Story)', priorite: 'priorité (2, Moyenne)', points: 'points (non estimé)', statut: 'statut (Backlog)', creeLe: 'creeLe (date du jour)' };

  // HTML du rapport renvoyé par importerTickets : bilan exact, rejets, corrections, normalisations
  function htmlRapport(rapport, analyse) {
    const { rejets, ajustements } = rapport;
    const [partieImportes, partieRejetes] = rapport.bilan.split(' · ');
    const morceaux = [`<p class="rapport-bilan"><span class="is-ok">${partieImportes}</span> · <span class="${rejets.length ? 'is-ko' : 'is-neutre'}">${partieRejetes}</span></p>`];
    const corrigees = ajustements.filter(ligne => ligne.details.some(detail => detail.nature === 'correction'));
    const normalisees = ajustements.filter(ligne => !corrigees.includes(ligne));
    if (corrigees.length) {
      morceaux.push(`<p class="rapport-precision">Dont ${pluriel(corrigees.length, 'ligne')} importée${corrigees.length > 1 ? 's' : ''} après correction, pour respecter les règles.</p>`);
    }
    const liste = (elements, texteDe) => {
      const lignes = elements.slice(0, 40).map(element => `<li><strong>${echapper(element.repere)}</strong>\u00a0: ${echapper(texteDe(element))}</li>`).join('');
      return lignes + (elements.length > 40 ? `<li>… et ${elements.length - 40} autre${elements.length - 40 > 1 ? 's' : ''}.</li>` : '');
    };
    if (rejets.length) {
      morceaux.push(`<div class="rapport-bloc is-ko"><p class="rapport-sous-titre">${ICONE_CROIX}Rejets (rien à importer)</p><ul>${liste(rejets, rejet => rejet.motif)}</ul></div>`);
    }
    if (corrigees.length) {
      morceaux.push(`<div class="rapport-bloc is-corrige"><p class="rapport-sous-titre">${ICONE_CRAYON}Corrections apportées (problème → modification)</p><ul>${liste(corrigees, ligne => ligne.details.map(detail => detail.texte).join(' ; '))}</ul></div>`);
    }
    const absentes = analyse.colonnesAbsentes.filter(colonne => colonne !== 'titre' && colonne !== 'assigne');   // assigne est facultatif
    const ignorees = analyse.colonnesIgnorees || [];
    if (normalisees.length || absentes.length || ignorees.length) {
      const colonnes = absentes.length ? `<li>Colonnes absentes, valeurs par défaut\u00a0: ${absentes.map(colonne => LIBELLES_COLONNES[colonne]).join(', ')}.</li>` : '';
      const horsModele = ignorees.length ? `<li>Colonnes hors du modèle, ignorées\u00a0: ${ignorees.map(nom => echapper(nom)).join(', ')}.</li>` : '';
      morceaux.push(`<div class="rapport-bloc is-info"><p class="rapport-sous-titre">${ICONE_INFO}Normalisations (règles I2 et I4, même valeur écrite autrement)</p><ul>${liste(normalisees, ligne => ligne.details.map(detail => detail.texte).join(' ; '))}${colonnes}${horsModele}</ul></div>`);
    }
    return morceaux.join('');
  }

  let idsCorrigesDuDernierImport = [];
  function afficherRapportImport(rapport, analyse, source, destination) {
    page.fichierRapportImport.textContent = `${source} → ${destination}`;
    const nombre = idsCorrigesDuDernierImport.length;
    const mentions = nombre ? `<div class="rapport-mentions" id="rapport-mentions">
        <p>${nombre > 1 ? `Les ${nombre} tickets corrigés portent` : 'Le ticket corrigé porte'} la mention ${ICONE_ALERTE}<strong>Corrigé à l’import</strong>. Cliquez dessus pour revoir les corrections\u00a0; confirmez quand vous en avez pris connaissance, la mention disparaît.</p>
        <button type="button" class="btn btn-secondary btn-petit" id="btn-tout-pris-en-compte">Tout marquer comme pris en compte</button>
      </div>` : '';
    page.contenuRapportImport.innerHTML = htmlRapport(rapport, analyse) + mentions;
    page.rapportImport.classList.toggle('has-rejets', rapport.rejets.length > 0);
    page.rapportImport.classList.toggle('has-corrections', rapport.ajustements.some(ligne => ligne.details.some(detail => detail.nature === 'correction')));
    page.rapportImport.hidden = false;
  }
  page.boutonFermerRapport.addEventListener('click', () => { page.rapportImport.hidden = true; page.boutonImporter.focus(); });
  page.contenuRapportImport.addEventListener('click', evenement => {
    if (!evenement.target.closest('#btn-tout-pris-en-compte')) return;
    const retirees = retirerNotesImport(idsCorrigesDuDernierImport);
    idsCorrigesDuDernierImport = [];
    const bloc = trouver('#rapport-mentions');
    if (bloc) bloc.innerHTML = `<p>${ICONE_OK_PETIT}Corrections prises en compte\u00a0: les tickets sont redevenus des tickets comme les autres.</p>`;
    rendre();
    notifier(retirees ? `${pluriel(retirees, 'mention')} «\u00a0Corrigé à l’import\u00a0» retirée${retirees > 1 ? 's' : ''}.` : 'Ces mentions avaient déjà été retirées.');
  });

  /* ---------- Importer ---------- */
  let analyseImport = null;        // contenu du fichier (ou du texte collé), déjà lu et découpé
  let sourceImport = '';           // nom du fichier, ou « texte collé »
  let preparationImport = null;    // rapport d’importerTickets pour la destination choisie

  const destinationImport = () => new FormData(page.formulaireImport).get('destination');

  // Lit le fichier en UTF-8, ou en Windows-1252 s’il vient d’un ancien tableur
  async function lireTexteDuFichier(fichier) {
    const octets = await fichier.arrayBuffer();
    try { return new TextDecoder('utf-8', { fatal: true }).decode(octets); }
    catch (erreur) { return new TextDecoder('windows-1252').decode(octets); }
  }

  // Numéros déjà pris pour une destination (en cas de remplacement, ceux du projet actuel se libèrent)
  function numerosPrisPour(destination) {
    if (destination !== 'remplacer') return numerosUtilises();
    const projet = projetActif();
    const numeros = new Set();
    for (const autre of etat.projets) if (autre !== projet) for (const ticket of autre.tickets) numeros.add(ticket.id);
    return numeros;
  }

  // Calcule et affiche l’aperçu du rapport pour la destination choisie
  function previsualiserImport() {
    const destination = destinationImport();
    const projet = projetActif();
    page.blocNomProjetImport.hidden = destination !== 'nouveau';
    page.avertissementRemplacement.hidden = destination !== 'remplacer';
    page.avertissementRemplacement.textContent = `Les ${pluriel(projet.tickets.length, 'ticket')} actuel${projet.tickets.length > 1 ? 's' : ''} de «\u00a0${projet.nom}\u00a0» seront supprimés avant l’import.`;
    const ticketsDeLaDestination = destination === 'actuel' ? projet.tickets : [];
    preparationImport = importerTickets(analyseImport.lignes, ticketsDeLaDestination,
      { numerosPris: numerosPrisPour(destination), numerosAEviter: numerosAEviter(), prochainId: etat.prochainIdTicket, dateDuJour: aujourdhuiIso() });
    page.resumeImport.innerHTML = `<p class="rapport-apercu">Aperçu du rapport d’import</p>${htmlRapport(preparationImport, analyseImport)}`;
    page.resumeImport.hidden = false;
    const nombre = preparationImport.importes.length;
    page.boutonValiderImport.disabled = nombre === 0;
    page.boutonValiderImport.textContent = nombre ? `Importer ${pluriel(nombre, 'ticket')}` : 'Importer';
  }

  // Analyse un contenu (fichier ou texte collé) puis affiche l’aperçu
  function chargerContenuImport(nom, texte) {
    analyseImport = null;
    page.resumeImport.hidden = true;
    page.choixDestinationImport.hidden = true;
    page.boutonValiderImport.disabled = true;
    page.erreurImport.hidden = true;
    const analyse = analyserFichier(nom, texte);
    if (!analyse.ok) { page.erreurImport.textContent = analyse.erreur; page.erreurImport.hidden = false; return; }
    analyseImport = analyse;
    sourceImport = nom;
    // Nom proposé pour un nouveau projet : celui du fichier, sans extension ni préfixe « taskflow- »
    const nomPropose = nom.replace(/\.[^.]+$/, '').replace(/^taskflow-/, '').replace(/-\d{4}-\d{2}-\d{2}$/, '').replace(/[-_]+/g, ' ').trim() || 'Projet importé';
    page.champNomProjetImport.value = (nomPropose.charAt(0).toUpperCase() + nomPropose.slice(1)).slice(0, NOM_PROJET_MAX);
    page.choixDestinationImport.hidden = false;
    previsualiserImport();
  }

  page.boutonImporter.addEventListener('click', () => {
    const projet = projetActif();
    page.formulaireImport.reset();
    analyseImport = null;
    preparationImport = null;
    page.resumeImport.hidden = true;
    page.choixDestinationImport.hidden = true;
    page.erreurImport.hidden = true;
    page.erreurNomProjetImport.hidden = true;
    page.boutonValiderImport.disabled = true;
    page.boutonValiderImport.textContent = 'Importer';
    page.libelleProjetActuelImport.textContent = `Ajouter à «\u00a0${projet.nom}\u00a0»`;
    page.libelleRemplacerImport.textContent = `Remplacer les tickets de «\u00a0${projet.nom}\u00a0»`;
    ouvrirFenetre(page.fenetreImport, page.boutonImporter);
  });

  page.champFichierImport.addEventListener('change', async () => {
    const fichier = page.champFichierImport.files[0];
    if (!fichier) return;
    chargerContenuImport(fichier.name, await lireTexteDuFichier(fichier));
  });
  page.boutonAnalyserTexte.addEventListener('click', () => {
    if (!page.champTexteImport.value.trim()) { page.erreurImport.textContent = 'Collez d’abord le contenu CSV ou JSON.'; page.erreurImport.hidden = false; return; }
    page.champFichierImport.value = '';
    chargerContenuImport('texte collé', page.champTexteImport.value);
  });
  page.choixDestinationImport.addEventListener('change', () => { if (analyseImport) previsualiserImport(); });

  page.formulaireImport.addEventListener('submit', evenement => {
    evenement.preventDefault();
    if (!analyseImport) return;
    const destination = destinationImport();
    if (destination === 'nouveau') {
      const erreur = verifierNomProjet(page.champNomProjetImport.value);
      page.erreurNomProjetImport.textContent = erreur;
      page.erreurNomProjetImport.hidden = !erreur;
      if (erreur) { page.champNomProjetImport.focus(); return; }
    }
    previsualiserImport();                           // recalcul juste avant d’importer
    const preparation = preparationImport;
    if (!preparation.importes.length) return;
    let projet = projetActif();
    if (destination === 'nouveau') {
      projet = creerProjet(page.champNomProjetImport.value);
      etat.projetActifId = projet.id;
      etat.filtres = filtresVides();
      synchroniserChamps();
    }
    const projetEtaitVide = destination !== 'actuel' || projet.tickets.length === 0;
    projet.tickets = destination === 'remplacer' ? [...preparation.importes] : [...projet.tickets, ...preparation.importes];   // nouveau tableau
    if (projetEtaitVide) {
      // Projet vide ou remplacé : on retrouve l’ordre du fichier (ordre personnalisé seulement s’il diffère du tri)
      projet.ordreManuel = null;
      const ordreTrie = ordonner([...projet.tickets], projet).map(ticket => ticket.id);
      const ordreDuFichier = preparation.importes.map(ticket => ticket.id);
      if (ordreTrie.some((id, rang) => id !== ordreDuFichier[rang])) projet.ordreManuel = ordreDuFichier;
    } else if (projet.ordreManuel) {
      projet.ordreManuel = [...projet.ordreManuel, ...preparation.importes.map(ticket => ticket.id)];
    }
    retenirNumeros(preparation.importes);
    etat.prochainIdTicket = Math.max(etat.prochainIdTicket, preparation.prochainId);
    // Chaque ticket corrigé garde la liste de ses corrections, jusqu’à ce qu’on confirme les avoir vues
    if (destination === 'remplacer') { projet.notesImport = {}; projet.journal = []; }
    idsCorrigesDuDernierImport = [];
    for (const ligne of preparation.ajustements) {
      const corrections = ligne.details.filter(detail => detail.nature === 'correction').map(detail => detail.texte);
      if (!corrections.length) continue;
      projet.notesImport[ligne.id] = { source: sourceImport, repere: ligne.repere, date: aujourdhuiIso(), corrections };
      idsCorrigesDuDernierImport.push(ligne.id);
    }
    fermerFenetre(page.fenetreImport, page.boutonImporter);
    rendre();
    afficherRapportImport(preparation, analyseImport, sourceImport, `«\u00a0${projet.nom}\u00a0»`);
    notifier(`Import terminé\u00a0: ${preparation.bilan}.`);
  });

  /* ---------- Réinitialiser ---------- */
  page.boutonReinitialiser.addEventListener('click', () => {
    const projet = projetActif();
    page.formulaireReinit.reset();
    page.projetReinit.textContent = `Projet\u00a0: ${projet.nom}`;
    page.avertissementReinit.textContent = projet.tickets.length
      ? `Les ${pluriel(projet.tickets.length, 'ticket')} actuel${projet.tickets.length > 1 ? 's' : ''} seront supprimés. Exportez d’abord le projet en JSON si vous voulez le retrouver à l’identique.`
      : 'Le projet ne contient aucun ticket pour l’instant.';
    ouvrirFenetre(page.fenetreReinit, page.boutonReinitialiser);
  });
  page.boutonExporterAvantReinit.addEventListener('click', () => {
    fermerFenetre(page.fenetreReinit);
    page.boutonExporter.click();
    const choixJson = page.formulaireExport.querySelector('input[name="format"][value="json"]');
    choixJson.checked = true;
    page.formulaireExport.dispatchEvent(new Event('change'));
  });
  page.formulaireReinit.addEventListener('submit', evenement => {
    evenement.preventDefault();
    const mode = new FormData(page.formulaireReinit).get('mode');
    const projet = reinitialiserProjet(mode);
    synchroniserChamps();
    fermerFenetre(page.fenetreReinit, page.boutonReinitialiser);
    rendre();
    notifier(mode === 'demo'
      ? `Projet «\u00a0${projet.nom}\u00a0» réinitialisé avec les ${pluriel(projet.tickets.length, 'ticket')} de démonstration.`
      : `Projet «\u00a0${projet.nom}\u00a0» vidé. Importez un fichier JSON exporté pour le retrouver.`);
  });


  /* ---------- « Je suis », « Mes tickets », « Annuler » ---------- */
  trouver('#filtre-moi').addEventListener('input', evenement => {
    etat.utilisateur = evenement.target.value.trim().replace(/\s+/g, ' ').slice(0, ASSIGNE_MAX);
    if (!etat.utilisateur) etat.filtres.mesTickets = false;
    rendre();
  });
  trouver('#chip-mes-tickets').addEventListener('click', () => {
    if (!etat.utilisateur) return;
    etat.filtres.mesTickets = !etat.filtres.mesTickets;
    rendre();
  });
  trouver('#btn-annuler-deplacement').addEventListener('click', annulerLeDernierDeplacement);
  // « Annuler » sur une ligne du journal : ce déplacement-là (et les plus récents du même ticket)
  const listeDuJournal = trouver('#journal-liste');
  listeDuJournal.addEventListener('click', evenement => {
    const bouton = evenement.target.closest('[data-annuler-rang]');
    if (bouton) annulerLeDeplacement(Number(bouton.dataset.annulerRang));
  });
  // Au survol ou au focus d’un bouton, les lignes qui seront annulées ensemble sont surlignées
  const surlignerLesLiees = evenement => {
    for (const ligne of listeDuJournal.querySelectorAll('.is-concerne')) ligne.classList.remove('is-concerne');
    const bouton = evenement.type === 'mouseout' || evenement.type === 'focusout' ? null : evenement.target.closest('[data-annuler-rang]');
    if (!bouton) return;
    const ligneCible = bouton.closest('li');
    for (const ligne of listeDuJournal.querySelectorAll(`li[data-id="${ligneCible.dataset.id}"]`)) {
      if (Number(ligne.dataset.rang) <= Number(ligneCible.dataset.rang)) ligne.classList.add('is-concerne');
    }
  };
  for (const type of ['mouseover', 'focusin', 'mouseout', 'focusout']) listeDuJournal.addEventListener(type, surlignerLesLiees);
  document.addEventListener('keydown', evenement => {
    if (!(evenement.ctrlKey || evenement.metaKey) || evenement.shiftKey || evenement.key.toLowerCase() !== 'z') return;
    if (evenement.target.closest('input, textarea, select, [contenteditable]') || document.querySelector('dialog[open]')) return;
    if (!(projetActif().journal || []).length) return;
    evenement.preventDefault();
    annulerLeDernierDeplacement();
  });

  /* ---------- Réinitialiser la démo, bandeau de chargement, guide ---------- */
  page.boutonReinitialiserDemo.addEventListener('click', () => ouvrirFenetre(page.fenetreDemo, page.boutonReinitialiserDemo));
  page.boutonConfirmerDemo.addEventListener('click', () => {
    fermerFenetre(page.fenetreDemo, page.boutonAjouter);
    reinitialiserLaDemo();
    notifier('Démonstration réinitialisée : les 12 tickets de départ sont de retour.');
  });
  page.boutonExporterAvantDemo.addEventListener('click', () => {
    fermerFenetre(page.fenetreDemo);
    page.boutonExporter.click();
    page.formulaireExport.querySelector('input[name="format"][value="json"]').checked = true;
    page.formulaireExport.dispatchEvent(new Event('change'));
  });
  trouver('#btn-fermer-bandeau').addEventListener('click', () => { page.bandeauChargement.hidden = true; });
  trouver('#btn-guide-ok').addEventListener('click', () => {
    page.guide.hidden = true;
    enregistrerPreference(CLE_GUIDE_VU, 'oui');
    page.boutonAjouter.focus();
  });


  /* ========================================================================
     JS 17b · SPRINTS : PANNEAU, JAUGE DE CAPACITÉ, GLISSER-DÉPOSER, CLÔTURE, BURNDOWN (B1)
     Toutes les décisions passent par les fonctions pures de JS 5b
     (ajouterAuSprint, retirerDuSprint, cloturerSprint, calculerBurndown) :
     l’interface ne fait qu’appliquer leur résultat, ou expliquer leur refus.
     ======================================================================== */
  const sprintsUI = {
    vue: trouver('#vue-sprints'),
    blocChoix: trouver('#sprints-choix'),
    choix: trouver('#choix-sprint'),
    boutonNouveau: trouver('#btn-nouveau-sprint'),
    vide: trouver('#sprint-vide'),
    detail: trouver('#sprint-detail'),
    etat: trouver('#sprint-etat'),
    dates: trouver('#sprint-dates'),
    jaugeTexte: trouver('#sprint-jauge-texte'),
    jauge: trouver('#sprint-jauge'),
    jaugeRemplie: trouver('#sprint-jauge-remplie'),
    boutonCloturer: trouver('#btn-cloturer-sprint'),
    zoneDans: trouver('#sprint-zone-dans'),
    zoneDisponibles: trouver('#sprint-zone-disponibles'),
    listeDans: trouver('#sprint-dans'),
    listeDisponibles: trouver('#sprint-disponibles'),
    titreDans: trouver('#sprint-dans-titre'),
    titreDisponibles: trouver('#sprint-disponibles-titre'),
    burndown: trouver('#burndown'),
    // Fenêtre « Nouveau sprint »
    fenetre: trouver('#dlg-sprint'),
    formulaire: trouver('#form-sprint'),
    champNom: trouver('#s-nom'),
    champDebut: trouver('#s-debut'),
    champFin: trouver('#s-fin'),
    champCapacite: trouver('#s-capacite'),
    duree: trouver('#s-duree'),
    // Fenêtre « Clôturer le sprint »
    fenetreCloture: trouver('#dlg-cloture'),
    texteCloture: trouver('#dlg-cloture-texte'),
    boutonConfirmerCloture: trouver('#btn-confirmer-cloture')
  };
  const CHAMPS_SPRINT = { nom: 'champNom', debut: 'champDebut', fin: 'champFin', capacite: 'champCapacite' };

  // Sprint affiché : celui choisi, sinon le dernier sprint ouvert, sinon le dernier créé
  function sprintAffiche(projet) {
    const sprints = projet.sprints || [];
    return sprints.find(sprint => sprint.id === etat.sprintAfficheId)
      || [...sprints].reverse().find(sprint => sprint.statut === SPRINT_OUVERT)
      || sprints[sprints.length - 1] || null;
  }

  // B6 · Démarre les sprints du projet affiché dont la date de début est atteinte ; l’annonce suit l’affichage
  let annonceDeDemarrage = null;
  function demarrerSprintsDuJour() {
    const projet = projetActif();
    if (!projet || !Array.isArray(projet.sprints) || !projet.sprints.length) return;
    const resultat = demarrerSprints(projet.tickets, projet.sprints, aujourdhuiIso());
    if (!resultat.demarres.length) return;
    projet.tickets = resultat.tickets;
    projet.sprints = resultat.sprints;
    const messages = resultat.demarres.filter(demarre => demarre.tickets.length).map(demarre => {
      const sprint = projet.sprints.find(element => element.id === demarre.sprintId);
      return `Sprint «\u00a0${sprint.nom}\u00a0» démarré\u00a0: ${pluriel(demarre.tickets.length, 'ticket')} passé${demarre.tickets.length > 1 ? 's' : ''} «\u00a0${COLONNE_A_FAIRE.titre}\u00a0».`;
    });
    if (messages.length) annonceDeDemarrage = messages.join(' ');
  }

  // Le relevé du jour de chaque sprint ouvert (appelé avant chaque affichage, donc avant chaque sauvegarde)
  function noterRelevesDuJour() {
    const projet = projetActif();
    if (!projet || !Array.isArray(projet.sprints) || !projet.sprints.length) return;
    const jour = aujourdhuiIso();
    projet.sprints = projet.sprints.map(sprint => noterReleve(sprint, projet.tickets, jour));
  }

  // Dessin SVG du burndown. Aucune division par zéro : n ≥ 1 jour, échelle verticale ≥ 1 point.
  function dessinerBurndown(burndown) {
    const LARGEUR = 640;
    const HAUTEUR = 260;
    const MARGE = { gauche: 46, droite: 18, haut: 16, bas: 42 };
    const fini = valeur => (typeof valeur === 'number' && Number.isFinite(valeur) ? valeur : 0);
    const jours = Array.isArray(burndown.jours) ? burndown.jours : [];
    const n = Math.max(1, jours.length);
    const ideal = (Array.isArray(burndown.ideal) ? burndown.ideal : []).map(fini);
    const restant = Array.isArray(burndown.restant) ? burndown.restant : [];
    const maximum = Math.max(1, fini(burndown.engage), ...ideal, ...restant.filter(valeur => valeur !== null).map(fini));
    const arrondi = valeur => Math.round(valeur * 10) / 10;
    const x = rang => arrondi(MARGE.gauche + (rang * (LARGEUR - MARGE.gauche - MARGE.droite)) / n);
    const y = valeur => arrondi(MARGE.haut + (HAUTEUR - MARGE.haut - MARGE.bas) * (1 - valeur / maximum));
    const enPoints = valeurs => valeurs.map(([rang, valeur]) => `${x(rang)},${y(valeur)}`).join(' ');

    // Graduations : 0, la moitié et le maximum (sans doublon quand le maximum vaut 1)
    const graduations = [...new Set([0, Math.round(maximum / 2), maximum])];
    const lignesHorizontales = graduations.map(valeur => `<line class="bd-grille" x1="${MARGE.gauche}" x2="${LARGEUR - MARGE.droite}" y1="${y(valeur)}" y2="${y(valeur)}"/>`
      + `<text class="bd-texte" x="${MARGE.gauche - 8}" y="${arrondi(y(valeur) + 4)}" text-anchor="end">${valeur}</text>`).join('');
    // Étiquettes des jours (au plus 8, pour rester lisibles) : fin du jour k
    const pas = Math.ceil(n / 8);
    const etiquettes = jours.map((jour, rang) => ((rang + 1) % pas === 0 || rang === n - 1
      ? `<text class="bd-texte" x="${x(rang + 1)}" y="${HAUTEUR - MARGE.bas + 18}" text-anchor="middle">${jour.slice(8, 10)}/${jour.slice(5, 7)}</text>` : '')).join('');
    const pointsRestants = restant.map((valeur, rang) => [rang, valeur]).filter(([, valeur]) => valeur !== null).map(([rang, valeur]) => [rang, fini(valeur)]);
    const dernier = pointsRestants.length ? pointsRestants[pointsRestants.length - 1][1] : fini(burndown.engage);
    const titre = `Burndown : ${pluriel(fini(burndown.engage), 'point')} engagé${fini(burndown.engage) > 1 ? 's' : ''} sur ${pluriel(n, 'jour')}. `
      + `Ligne idéale de ${fini(burndown.engage)} à 0 ; ${pluriel(dernier, 'point')} restant${dernier > 1 ? 's' : ''} au dernier relevé.`;
    return `<svg class="burndown-svg" viewBox="0 0 ${LARGEUR} ${HAUTEUR}" role="img" focusable="false"><title>${echapper(titre)}</title>`
      + `${lignesHorizontales}<line class="bd-axe" x1="${MARGE.gauche}" x2="${MARGE.gauche}" y1="${MARGE.haut}" y2="${HAUTEUR - MARGE.bas}"/>`
      + `<line class="bd-axe" x1="${MARGE.gauche}" x2="${LARGEUR - MARGE.droite}" y1="${HAUTEUR - MARGE.bas}" y2="${HAUTEUR - MARGE.bas}"/>${etiquettes}`
      + `<polyline class="bd-ideal" points="${enPoints(ideal.map((valeur, rang) => [rang, valeur]))}"/>`
      + `<polyline class="bd-restant" points="${enPoints(pointsRestants)}"/>`
      + pointsRestants.map(([rang, valeur]) => `<circle class="bd-point" cx="${x(rang)}" cy="${y(valeur)}" r="3.5"/>`).join('')
      + '</svg>';
  }

  // Une ligne de ticket dans « Dans le sprint » ou « Tickets disponibles »
  function htmlTicketDeSprint(ticket, { dansLeSprint, modifiable, autreSprint }) {
    // B7 · Priorité (même pastille que la liste Backlog) et points en clair, lisibles par un lecteur d’écran
    const priorite = `<span class="prio prio-${ticket.priorite}"><span class="sr-only">Priorité </span><span class="prio-num" aria-hidden="true">${ticket.priorite}</span> ${libelleDe(PRIORITES, ticket.priorite)}</span>`;
    const points = ticket.points === null
      ? '<span class="sprint-pts is-nv" title="Non estimé\u00a0: à estimer avant d’entrer dans un sprint">Non estimé</span>'
      : `<span class="sprint-pts"><span aria-hidden="true">${ticket.points} pt${ticket.points > 1 ? 's' : ''}</span><span class="sr-only">${ticket.points} point${ticket.points > 1 ? 's' : ''} de complexité</span></span>`;
    const mentions = [
      estTermine(ticket) ? '<span class="sprint-mention is-termine">Terminé</span>' : `<span class="sprint-mention">${echapper(libelleDe(STATUTS, ticket.statut))}</span>`,
      ticket.points === null ? '<span class="sprint-mention is-alerte">non estimé</span>' : '',
      autreSprint ? `<span class="sprint-mention is-info">dans «\u00a0${echapper(autreSprint.nom)}\u00a0»</span>` : ''
    ].join('');
    const bouton = !modifiable ? ''
      : dansLeSprint
        ? `<button type="button" class="sprint-btn" data-sprint-retirer="${ticket.id}" aria-label="Sortir le ticket #${ticket.id} du sprint" title="Sortir du sprint">${ICONE_CROIX}</button>`
        : `<button type="button" class="sprint-btn is-ajouter" data-sprint-ajouter="${ticket.id}" aria-label="Mettre le ticket #${ticket.id} dans le sprint" title="Mettre dans le sprint">+</button>`;
    return `<li class="sprint-ticket${estTermine(ticket) ? ' is-termine' : ''}" data-id="${ticket.id}"${modifiable ? ' draggable="true"' : ''}>`
      + `<span class="sprint-num">#${ticket.id}</span><span class="sprint-titre">${echapper(ticket.titre)}<span class="sprint-mentions">${mentions}</span></span><span class="sprint-carac">${priorite}${points}</span>${bouton}</li>`;
  }

  function rendreSprints(projet, visibles = projet.tickets) {
    const sprints = projet.sprints || [];
    const sprint = sprintAffiche(projet);
    etat.sprintAfficheId = sprint ? sprint.id : null;
    sprintsUI.blocChoix.hidden = !sprints.length;
    remplacerContenu(sprintsUI.choix, sprints.map(element => `<option value="${element.id}">${echapper(element.nom)}${element.statut === SPRINT_CLOTURE ? ' (clôturé)' : ''}</option>`).join(''));
    sprintsUI.choix.value = sprint ? String(sprint.id) : '';
    sprintsUI.vide.hidden = !!sprint;
    sprintsUI.detail.hidden = !sprint;
    if (!sprint) return;

    const ouvert = sprint.statut === SPRINT_OUVERT;
    const aujourdhui = aujourdhuiIso();
    const jours = nombreDeJours(sprint.debut, sprint.fin);
    const quand = !ouvert ? `Clôturé le ${dateEnFrancais(sprint.clotureLe || sprint.fin)}`
      : aujourdhui < sprint.debut ? 'À venir' : aujourdhui > sprint.fin ? 'Date de fin dépassée : à clôturer' : 'En cours';
    sprintsUI.etat.textContent = quand;
    sprintsUI.etat.className = `sprint-etat${!ouvert ? ' is-cloture' : aujourdhui > sprint.fin ? ' is-alerte' : ''}`;
    sprintsUI.dates.textContent = `Du ${dateEnFrancais(sprint.debut)} au ${dateEnFrancais(sprint.fin)} · ${pluriel(jours, 'jour')}`;

    // Jauge de capacité : barre plafonnée à 100 % ; « pile » et « dépassée » se distinguent
    const engages = ouvert ? pointsEngages(projet.tickets, sprint) : (sprint.bilan ? sprint.bilan.engage : 0);
    const capacite = sprint.capacite;
    const pile = engages === capacite;
    const depasse = engages > capacite;
    sprintsUI.jaugeTexte.innerHTML = ouvert
      ? `<strong>${engages} / ${capacite}</strong> points engagés · ${depasse ? `<span class="is-ko">capacité dépassée de ${engages - capacite}</span>` : pile ? '<span class="is-pile">capacité atteinte</span>' : `${pluriel(capacite - engages, 'point')} libre${capacite - engages > 1 ? 's' : ''}`}`
      : `<strong>${sprint.bilan.termine} / ${sprint.bilan.engage}</strong> points terminés · ${pluriel(sprint.bilan.restant, 'point')} remis au backlog · capacité ${capacite}`;
    sprintsUI.jauge.className = `sprint-jauge${depasse ? ' is-depasse' : pile ? ' is-pile' : ''}`;
    sprintsUI.jaugeRemplie.style.width = `${capacite > 0 ? Math.min(100, Math.round((engages / capacite) * 100)) : 0}%`;
    sprintsUI.boutonCloturer.hidden = !ouvert;

    // Les deux listes
    const dans = projet.tickets.filter(ticket => ticket.sprintId === sprint.id && (ouvert || estTermine(ticket)));
    sprintsUI.titreDans.textContent = ouvert ? `Dans le sprint (${dans.length})` : `Terminés dans ce sprint (${dans.length})`;
    remplacerContenu(sprintsUI.listeDans, dans.length
      ? dans.map(ticket => htmlTicketDeSprint(ticket, { dansLeSprint: true, modifiable: ouvert })).join('')
      : `<li class="sprint-liste-vide">${ouvert ? 'Glissez ici des tickets estimés, ou utilisez le bouton +.' : 'Aucun ticket terminé.'}</li>`);
    sprintsUI.zoneDisponibles.hidden = !ouvert;
    if (ouvert) {
      const disponibles = visibles.filter(ticket => ticket.sprintId !== sprint.id && !estTermine(ticket));
      const masques = projet.tickets.filter(ticket => ticket.sprintId !== sprint.id && !estTermine(ticket)).length - disponibles.length;
      remplacerContenu(sprintsUI.listeDisponibles, disponibles.length
        ? disponibles.map(ticket => htmlTicketDeSprint(ticket, { dansLeSprint: false, modifiable: true, autreSprint: sprintOuvertDe(ticket, projet.sprints) })).join('')
        : `<li class="sprint-liste-vide">${masques ? 'Aucun ticket disponible ne correspond à la recherche ou aux filtres.' : 'Aucun autre ticket à planifier.'}</li>`);
      sprintsUI.titreDisponibles.textContent = masques ? `Tickets disponibles (${disponibles.length}, ${masques} masqué${masques > 1 ? 's' : ''} par les filtres)` : `Tickets disponibles (${disponibles.length})`;
    }
    remplacerContenu(sprintsUI.burndown, dessinerBurndown(calculerBurndown(sprint, projet.tickets, aujourdhui)));
  }

  // Refus d’une règle de sprint → message avec un conseil
  function expliquerRefusSprint(erreur) {
    if (/^Capacité dépassée/.test(erreur)) return `${erreur}. Sortez un ticket du sprint, ou choisissez-en un plus petit.`;
    if (/^Definition of Ready/.test(erreur)) return `${erreur}. Estimez-le d’abord (bouton Modifier).`;
    if (/déjà terminé$/.test(erreur)) return `${erreur} : il n’a rien à faire dans un sprint.`;
    return erreur;
  }
  function appliquerAuSprint(resultat, messageReussi) {
    if (!resultat.ok) { notifier(expliquerRefusSprint(resultat.erreur)); return false; }
    projetActif().tickets = resultat.tickets;
    rendre();
    page.annonce.textContent = messageReussi;
    return true;
  }
  function mettreDansLeSprint(id) {
    const projet = projetActif();
    const sprint = sprintAffiche(projet);
    if (!sprint) return;
    const resultat = ajouterAuSprint(projet.tickets, projet.sprints, id, sprint.id);
    if (!resultat.ok) { appliquerAuSprint(resultat); return; }
    const tickets = aFaireSiSprintDemarre(resultat.tickets, projet.sprints, id);
    const passe = tickets !== resultat.tickets;
    const message = `Ticket #${id} mis dans le sprint «\u00a0${sprint.nom}\u00a0»${passe ? `, et passé «\u00a0${COLONNE_A_FAIRE.titre}\u00a0» (le sprint est démarré)` : ''}.`;
    appliquerAuSprint({ ok: true, tickets }, message);
    if (passe) notifier(message);
  }
  function sortirDuSprint(id) {
    const projet = projetActif();
    appliquerAuSprint(retirerDuSprint(projet.tickets, projet.sprints, id), `Ticket #${id} sorti du sprint.`);
  }

  sprintsUI.choix.addEventListener('change', () => { etat.sprintAfficheId = Number(sprintsUI.choix.value); rendre(); });
  sprintsUI.detail.addEventListener('click', evenement => {
    const ajouter = evenement.target.closest('[data-sprint-ajouter]');
    if (ajouter) { mettreDansLeSprint(Number(ajouter.dataset.sprintAjouter)); return; }
    const retirer = evenement.target.closest('[data-sprint-retirer]');
    if (retirer) sortirDuSprint(Number(retirer.dataset.sprintRetirer));
  });

  // Glisser-déposer entre les deux listes (souris) ; au clavier et au doigt : les boutons + et ×
  let idGlisseVersSprint = null;
  sprintsUI.detail.addEventListener('dragstart', evenement => {
    const ligne = evenement.target.closest('.sprint-ticket[draggable="true"]');
    if (!ligne) return;
    idGlisseVersSprint = Number(ligne.dataset.id);
    evenement.dataTransfer.effectAllowed = 'move';
    evenement.dataTransfer.setData('text/plain', String(idGlisseVersSprint));
    ligne.classList.add('is-glisse');
  });
  sprintsUI.detail.addEventListener('dragend', evenement => {
    const ligne = evenement.target.closest('.sprint-ticket');
    if (ligne) ligne.classList.remove('is-glisse');
    idGlisseVersSprint = null;
    for (const zone of [sprintsUI.zoneDans, sprintsUI.zoneDisponibles]) zone.classList.remove('is-survol');
  });
  for (const zone of [sprintsUI.zoneDans, sprintsUI.zoneDisponibles]) {
    zone.addEventListener('dragover', evenement => {
      if (idGlisseVersSprint === null) return;
      evenement.preventDefault();
      evenement.dataTransfer.dropEffect = 'move';
      zone.classList.add('is-survol');
    });
    zone.addEventListener('dragleave', evenement => { if (!zone.contains(evenement.relatedTarget)) zone.classList.remove('is-survol'); });
    zone.addEventListener('drop', evenement => {
      if (idGlisseVersSprint === null) return;
      evenement.preventDefault();
      zone.classList.remove('is-survol');
      const id = idGlisseVersSprint;
      idGlisseVersSprint = null;
      const ticket = projetActif().tickets.find(element => element.id === id);
      const sprint = sprintAffiche(projetActif());
      if (!ticket || !sprint) return;
      const versLeSprint = zone === sprintsUI.zoneDans;
      if (versLeSprint && ticket.sprintId !== sprint.id) mettreDansLeSprint(id);
      else if (!versLeSprint && ticket.sprintId === sprint.id) sortirDuSprint(id);
    });
  }

  // Fenêtre « Nouveau sprint »
  function afficherErreursSprint(erreurs) {
    for (const [champ, nomDuChamp] of Object.entries(CHAMPS_SPRINT)) {
      const message = erreurs[champ] || '';
      const zoneErreur = trouver(`#err-s-${champ}`);
      zoneErreur.textContent = message;
      zoneErreur.hidden = !message;
      sprintsUI[nomDuChamp].setAttribute('aria-invalid', message ? 'true' : 'false');
    }
  }
  function lireFormulaireSprint() {
    const capacite = sprintsUI.champCapacite.value.trim();
    return { nom: sprintsUI.champNom.value, debut: sprintsUI.champDebut.value, fin: sprintsUI.champFin.value, capacite: capacite === '' ? NaN : Number(capacite) };
  }
  function afficherDureeSprint() {
    const { debut, fin } = lireFormulaireSprint();
    const valide = dateIsoValide(debut) && dateIsoValide(fin) && fin >= debut;
    sprintsUI.duree.textContent = valide ? `Durée\u00a0: ${pluriel(nombreDeJours(debut, fin), 'jour')} (${SPRINT_JOURS_MAX} au maximum).` : `De 1 à ${SPRINT_JOURS_MAX} jours, bornes incluses.`;
  }
  sprintsUI.boutonNouveau.addEventListener('click', () => {
    const projet = projetActif();
    sprintsUI.formulaire.reset();
    const debut = aujourdhuiIso();
    sprintsUI.champNom.value = `Sprint ${(projet.sprints || []).reduce((plusGrand, sprint) => Math.max(plusGrand, sprint.id), 0) + 1}`;
    sprintsUI.champDebut.value = debut;
    sprintsUI.champFin.value = datePlusJours(debut, 13);           // 2 semaines par défaut
    sprintsUI.champCapacite.value = '20';
    afficherErreursSprint({});
    afficherDureeSprint();
    ouvrirFenetre(sprintsUI.fenetre, sprintsUI.boutonNouveau);
    sprintsUI.champNom.focus();
    sprintsUI.champNom.select();
  });
  for (const champ of [sprintsUI.champDebut, sprintsUI.champFin]) champ.addEventListener('input', afficherDureeSprint);
  sprintsUI.formulaire.addEventListener('input', () => {
    // Une fois les erreurs affichées, elles se mettent à jour à chaque saisie
    if (Object.values(CHAMPS_SPRINT).some(nom => sprintsUI[nom].getAttribute('aria-invalid') === 'true')) afficherErreursSprint(verifierSprint(lireFormulaireSprint()));
  });
  sprintsUI.formulaire.addEventListener('submit', evenement => {
    evenement.preventDefault();
    const projet = projetActif();
    const resultat = creerSprint(projet.sprints, lireFormulaireSprint());
    if (!resultat.ok) {
      afficherErreursSprint(resultat.erreurs);
      const premier = Object.keys(CHAMPS_SPRINT).find(champ => resultat.erreurs[champ]);
      if (premier) sprintsUI[CHAMPS_SPRINT[premier]].focus();
      return;
    }
    projet.sprints = resultat.sprints;
    etat.sprintAfficheId = resultat.sprint.id;
    fermerFenetre(sprintsUI.fenetre, sprintsUI.choix);
    rendre();
    notifier(`Sprint «\u00a0${resultat.sprint.nom}\u00a0» créé (${resultat.sprint.capacite} points). Glissez-y des tickets estimés.`);
  });

  // Fenêtre « Clôturer le sprint »
  sprintsUI.boutonCloturer.addEventListener('click', () => {
    const projet = projetActif();
    const sprint = sprintAffiche(projet);
    if (!sprint || sprint.statut !== SPRINT_OUVERT) return;
    const aRendre = projet.tickets.filter(ticket => ticket.sprintId === sprint.id && !estTermine(ticket));
    const termines = projet.tickets.filter(ticket => ticket.sprintId === sprint.id && estTermine(ticket));
    sprintsUI.texteCloture.innerHTML = `<p>${pluriel(termines.length, 'ticket')} terminé${termines.length > 1 ? 's' : ''} ${termines.length > 1 ? 'restent' : 'reste'} dans le bilan du sprint «\u00a0${echapper(sprint.nom)}\u00a0».</p>`
      + (aRendre.length
        ? `<p><strong>${pluriel(aRendre.length, 'ticket')} non terminé${aRendre.length > 1 ? 's' : ''} ${aRendre.length > 1 ? 'reviennent' : 'revient'} dans la colonne «\u00a0${echapper(COLONNE_BACKLOG.titre)}\u00a0», hors sprint\u00a0:</strong></p><ul class="sprint-cloture-liste">${aRendre.map(ticket => `<li>#${ticket.id} ${echapper(ticket.titre)}</li>`).join('')}</ul>`
        : '<p>Tous les tickets du sprint sont terminés.</p>')
      + '<p>Un sprint clôturé ne peut plus être modifié.</p>';
    ouvrirFenetre(sprintsUI.fenetreCloture, sprintsUI.boutonCloturer);
  });
  sprintsUI.boutonConfirmerCloture.addEventListener('click', () => {
    const projet = projetActif();
    const sprint = sprintAffiche(projet);
    if (!sprint) { fermerFenetre(sprintsUI.fenetreCloture); return; }
    const resultat = cloturerSprint(projet.tickets, projet.sprints, sprint.id, aujourdhuiIso());
    fermerFenetre(sprintsUI.fenetreCloture, sprintsUI.choix);
    if (!resultat.ok) { notifier(resultat.erreur); return; }
    projet.tickets = resultat.tickets;
    projet.sprints = resultat.sprints;
    rendre();
    notifier(`Sprint «\u00a0${sprint.nom}\u00a0» clôturé${resultat.retournes.length ? `\u00a0: ${pluriel(resultat.retournes.length, 'ticket')} ${resultat.retournes.length > 1 ? 'retournent' : 'retourne'} au backlog` : ''}.`);
  });


  /* ========================================================================
     JS 17c · ÉCHÉANCES : BADGES, RÉSUMÉ DES RETARDS, VUE CALENDRIER (B3)
     La date du jour vient d’aujourdhuiIso() : elle peut être imposée par
     l’adresse (index.html?aujourdhui=2026-02-27) pour tester l’interface.
     ======================================================================== */
  const calendrierUI = {
    vue: trouver('#vue-calendrier'),
    titre: trouver('#cal-titre'),
    grille: trouver('#calendrier'),
    resume: trouver('#cal-resume'),
    precedent: trouver('#btn-mois-precedent'),
    suivant: trouver('#btn-mois-suivant'),
    courant: trouver('#btn-mois-courant'),
    retards: trouver('#retards')
  };
  const FORMAT_MOIS = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  const FORMAT_JOUR_COURT = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const titreDuMois = mois => FORMAT_MOIS.format(new Date(jourUtc(`${mois}-01`)));
  const dateCourte = dateIso => FORMAT_JOUR_COURT.format(new Date(jourUtc(dateIso)));
  const ICONE_ECHEANCE = '<svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><rect x="2.5" y="3.5" width="11" height="10" rx="1.8" stroke="currentColor" stroke-width="1.5"/><path d="M2.5 6.6h11M5.5 2v3M10.5 2v3" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>';
  const CLASSES_URGENCE = { retard: 'is-retard', aujourdhui: 'is-proche', proche: 'is-proche', 'plus-tard': '', terminee: 'is-terminee', aucune: '' };

  // Badge d’échéance (liste et Kanban) : « En retard », « Aujourd’hui », « J-1 », « J-2 », sinon la date
  function htmlEcheance(ticket) {
    if (!dateIsoValide(ticket.echeance)) return '';
    const { niveau, jours, libelle } = urgence(ticket, aujourdhuiIso());
    const texte = niveau === 'retard' ? `En retard · ${pluriel(-jours, 'jour')}` : libelle || dateCourte(ticket.echeance);
    return `<span class="echeance ${CLASSES_URGENCE[niveau]}" title="Échéance\u00a0: ${echapper(dateEnFrancais(ticket.echeance))}${niveau === 'terminee' ? ' (ticket terminé)' : ''}">${ICONE_ECHEANCE}${echapper(texte)}</span>`;
  }

  // Résumé des retards, au-dessus des vues (tous les tickets du projet, filtres ou non)
  function rendreRetards(projet) {
    const { total, colonnes } = resumeDesRetards(projet.tickets, aujourdhuiIso());
    calendrierUI.retards.hidden = !total;
    if (!total) return;
    remplacerContenu(calendrierUI.retards, `${ICONE_ALERTE}<strong>${pluriel(total, 'ticket')} en retard</strong>\u00a0: `
      + colonnes.filter(colonne => colonne.nombre).map(colonne => `${echapper(colonne.titre)} ${colonne.nombre}`).join(' · ')
      + ' <button type="button" class="btn btn-texte" id="btn-voir-retards">Les afficher</button>');
  }
  calendrierUI.retards.addEventListener('click', evenement => {
    if (!evenement.target.closest('#btn-voir-retards')) return;
    etat.filtres = { ...filtresVides(), urgences: new Set(['retard']) };
    synchroniserChamps();
    rendre();
  });

  // Nombre de retards d’une colonne du Kanban (parmi les cartes affichées)
  function htmlRetardsDeColonne(cartes) {
    const aujourdhui = aujourdhuiIso();
    const nombre = cartes.filter(ticket => urgence(ticket, aujourdhui).niveau === 'retard').length;
    return nombre ? `<span class="kb-retard">${nombre} en retard</span>` : '';
  }

  // Vue calendrier : les tickets affichés (recherche et filtres compris) dans la case de leur échéance
  function rendreCalendrier(visibles) {
    const aujourdhui = aujourdhuiIso();
    const mois = moisValide(etat.moisAffiche) ? etat.moisAffiche : moisDe(aujourdhui);
    const grille = grilleDuMois(mois, visibles);
    const parNumero = new Map(visibles.map(ticket => [ticket.id, ticket]));
    calendrierUI.titre.textContent = titreDuMois(mois);
    calendrierUI.courant.disabled = mois === moisDe(aujourdhui);
    const dansLeMois = visibles.filter(ticket => dateIsoValide(ticket.echeance) && ticket.echeance.startsWith(`${mois}-`)).length;
    const sansEcheance = visibles.filter(ticket => !dateIsoValide(ticket.echeance)).length;
    calendrierUI.resume.textContent = `${pluriel(dansLeMois, 'échéance')} ce mois-ci${sansEcheance ? ` · ${pluriel(sansEcheance, 'ticket')} affiché${sansEcheance > 1 ? 's' : ''} sans échéance` : ''}.`;
    const JOURS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
    remplacerContenu(calendrierUI.grille, `<thead><tr>${JOURS.map(jour => `<th scope="col">${jour}</th>`).join('')}</tr></thead><tbody>`
      + grille.semaines.map(semaine => `<tr>${semaine.map(jour => {
        const classes = ['cal-jour', jour.dansLeMois ? '' : 'is-hors-mois', jour.date === aujourdhui ? 'is-aujourdhui' : ''].filter(Boolean).join(' ');
        const tickets = jour.tickets.map(id => {
          const ticket = parNumero.get(id);
          const { niveau, libelle } = urgence(ticket, aujourdhui);
          return `<li><button type="button" class="cal-ticket ${CLASSES_URGENCE[niveau]}" data-modifier="${id}" title="Modifier #${id} «\u00a0${echapper(ticket.titre)}\u00a0»${libelle ? ` (${libelle})` : ''}">#${id} ${echapper(ticket.titre)}</button></li>`;
        }).join('');
        return `<td class="${classes}"${jour.date === aujourdhui ? ' aria-current="date"' : ''}><span class="cal-num"><span class="sr-only">${echapper(dateEnFrancais(jour.date))}</span><span aria-hidden="true">${Number(jour.date.slice(8))}</span></span>${tickets ? `<ul class="cal-tickets">${tickets}</ul>` : ''}</td>`;
      }).join('')}</tr>`).join('') + '</tbody>');
  }
  const changerDeMois = nombre => {
    const mois = moisValide(etat.moisAffiche) ? etat.moisAffiche : moisDe(aujourdhuiIso());
    etat.moisAffiche = ajouterAuMois(mois, nombre);
    rendre();
  };
  calendrierUI.precedent.addEventListener('click', () => changerDeMois(-1));
  trouver('#kb-sprint').addEventListener('click', evenement => { if (evenement.target.closest('[data-voir-backlog]')) afficherVue('backlog'); });
  calendrierUI.suivant.addEventListener('click', () => changerDeMois(1));
  calendrierUI.courant.addEventListener('click', () => { etat.moisAffiche = null; rendre(); });
  calendrierUI.grille.addEventListener('click', evenement => {
    const bouton = evenement.target.closest('[data-modifier]');
    if (bouton) ouvrirModificationDepuis(bouton);
  });


  /* ========================================================================
     JS 18 · ONGLETS BACKLOG / SPRINTS / KANBAN / CALENDRIER
     ======================================================================== */
  const VUES = ['backlog', 'sprints', 'kanban', 'calendrier'];   // B4 : Sprints devient une vue
  function afficherVue(vue) {
    etat.vue = VUES.includes(vue) ? vue : 'backlog';
    page.vueBacklog.hidden = etat.vue !== 'backlog';
    page.vueKanban.hidden = etat.vue !== 'kanban';
    calendrierUI.vue.hidden = etat.vue !== 'calendrier';
    sprintsUI.vue.hidden = etat.vue !== 'sprints';
    for (const onglet of page.onglets) {
      const actif = onglet.dataset.vue === etat.vue;
      onglet.setAttribute('aria-selected', actif ? 'true' : 'false');
      onglet.tabIndex = actif ? 0 : -1;               // seul l’onglet actif est atteint avec Tab
    }
    enregistrerPreference(CLE_VUE, etat.vue);
    trouver('#vue-aide').textContent = etat.vue === 'sprints'
      ? 'Planifiez\u00a0: créez un sprint, glissez-y des tickets estimés dans la limite de sa capacité, suivez le burndown, puis clôturez. La recherche et les filtres s’appliquent aux tickets disponibles.'
      : etat.vue === 'calendrier'
      ? 'Les échéances du mois, du lundi au dimanche. Cliquez sur un ticket pour le modifier ; la recherche et les filtres s’appliquent aussi ici.'
      : etat.vue === 'kanban'
      ? `Une colonne par étape. Glissez une carte (ou utilisez ◀ ▶) pour la faire avancer. Limites WIP\u00a0: ${COLONNES.filter(colonne => colonne.wip !== null).map(colonne => `«\u00a0${colonne.titre}\u00a0» ${colonne.wip} tickets`).join(', ')}. ${COLONNES.filter(colonne => colonne.depuis).map(colonne => `On n’entre dans «\u00a0${colonne.titre}\u00a0» que depuis ${originesAdmises(colonne)}`).join('. ')}, et un ticket non estimé reste dans le «\u00a0${COLONNE_BACKLOG.titre}\u00a0» (Definition of Ready).`
      : 'Tous les tickets en liste. Cliquez sur un en-tête pour trier, combinez les filtres, ou glissez une ligne par sa poignée ⠿ pour changer l’ordre.';
    rendre();                                         // la vue affichée est mise à jour
  }
  page.ongletsVues.addEventListener('click', evenement => {
    const onglet = evenement.target.closest('[data-vue]');
    if (onglet) afficherVue(onglet.dataset.vue);
  });
  // Clavier : flèches gauche/droite, Début et Fin (comportement standard des onglets)
  page.ongletsVues.addEventListener('keydown', evenement => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(evenement.key)) return;
    evenement.preventDefault();
    let rang = page.onglets.findIndex(onglet => onglet.dataset.vue === etat.vue);
    if (evenement.key === 'Home') rang = 0;
    else if (evenement.key === 'End') rang = page.onglets.length - 1;
    else rang = (rang + (evenement.key === 'ArrowRight' ? 1 : -1) + page.onglets.length) % page.onglets.length;
    afficherVue(page.onglets[rang].dataset.vue);
    page.onglets[rang].focus();
  });


  /* ========================================================================
     JS 19 · PANNEAUX REPLIABLES (choix mémorisé dans ce navigateur)
     ======================================================================== */
  const panneauxReduits = new Set();
  try { (JSON.parse(lirePreference(CLE_PANNEAUX_REDUITS)) || []).forEach(nom => panneauxReduits.add(nom)); } catch (erreur) { /* préférence illisible : on l’ignore */ }

  function appliquerRepli(panneau) {
    const reduit = panneauxReduits.has(panneau.dataset.repliable);
    panneau.classList.toggle('is-reduit', reduit);
    const bouton = panneau.querySelector('.btn-replier');
    bouton.setAttribute('aria-expanded', reduit ? 'false' : 'true');
    bouton.querySelector('.btn-replier-txt').textContent = reduit ? 'Afficher' : 'Réduire';
    bouton.title = reduit ? 'Afficher de nouveau ce panneau' : 'Réduire ce panneau pour gagner de la place';
  }
  document.addEventListener('click', evenement => {
    const bouton = evenement.target.closest('.btn-replier');
    if (!bouton) return;
    const panneau = bouton.closest('[data-repliable]');
    const nom = panneau.dataset.repliable;
    if (panneauxReduits.has(nom)) panneauxReduits.delete(nom);
    else panneauxReduits.add(nom);
    enregistrerPreference(CLE_PANNEAUX_REDUITS, JSON.stringify([...panneauxReduits]));
    appliquerRepli(panneau);
  });


  /* ========================================================================
     JS 20 · THÈME CLAIR / SOMBRE
     Sans choix de l’utilisateur, la page suit le réglage de l’appareil.
     ======================================================================== */
  const racine = document.documentElement;
  const REQUETE_THEME_SOMBRE = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;

  function themeActuel() {
    const themeChoisi = racine.dataset.theme;
    if (themeChoisi === 'light' || themeChoisi === 'dark') return themeChoisi;
    return REQUETE_THEME_SOMBRE && REQUETE_THEME_SOMBRE.matches ? 'dark' : 'light';
  }
  function mettreAJourBoutonsTheme() {
    const theme = themeActuel();
    for (const bouton of page.boutonsTheme) bouton.setAttribute('aria-pressed', bouton.dataset.themeChoix === theme ? 'true' : 'false');
  }
  page.choixTheme.addEventListener('click', evenement => {
    const bouton = evenement.target.closest('[data-theme-choix]');
    if (!bouton) return;
    racine.dataset.theme = bouton.dataset.themeChoix;
    enregistrerPreference(CLE_THEME, bouton.dataset.themeChoix);
    mettreAJourBoutonsTheme();
  });
  if (REQUETE_THEME_SOMBRE) {
    const suivreLAppareil = () => { if (!racine.dataset.theme) mettreAJourBoutonsTheme(); };
    if (REQUETE_THEME_SOMBRE.addEventListener) REQUETE_THEME_SOMBRE.addEventListener('change', suivreLAppareil);
    else if (REQUETE_THEME_SOMBRE.addListener) REQUETE_THEME_SOMBRE.addListener(suivreLAppareil);   // anciens Safari
  }


  /* ========================================================================
     JS 22 · SAUVEGARDE ET CHARGEMENT (localStorage versionné)
     1 · Une enveloppe versionnée : on n’enregistre pas un tableau nu mais
         { version: 2, tickets, projets, … } : l’application sait toujours qui a
         écrit la donnée. Les tickets restent au modèle exact ; les projets
         listent les numéros de leurs tickets.
     2 · Une migration explicite : une ancienne version (v1) enregistrait un tableau
         nu de tickets ; migrerV1versV2 complète chaque champ manquant avec sa
         valeur par défaut, au lieu de laisser des undefined partout.
     3 · Un plan B : charger() ne lève jamais d’exception. Donnée absente →
         démonstration ; donnée illisible ou d’une version inconnue → démonstration,
         avec un message, et une copie de la donnée abîmée est gardée à part.
     La sauvegarde se fait après chaque modification (à la fin de rendre()).
     ======================================================================== */

  // Enveloppe à enregistrer, construite à partir d’un état (fonction pure)
  function enveloppeDeSauvegarde(source) {
    const filtres = source.filtres;
    return {
      version: VERSION_SAUVEGARDE,
      tickets: source.projets.flatMap(projet => projet.tickets.map(construireTicket)),
      projets: source.projets.map(projet => ({
        id: projet.id, nom: projet.nom, tickets: projet.tickets.map(ticket => ticket.id),
        ordreManuel: projet.ordreManuel ? [...projet.ordreManuel] : null,
        notesImport: projet.notesImport || {},
        journal: projet.journal || [],
        sprints: (projet.sprints || []).map(sprint => ({ ...sprint, releves: { ...(sprint.releves || {}) }, bilan: sprint.bilan ? { ...sprint.bilan } : null }))
      })),
      projetActif: source.projetActifId,
      compteurs: { prochainTicket: source.prochainIdTicket, prochainProjet: source.prochainIdProjet, numerosAttribues: [...source.numerosAttribues] },
      affichage: {
        vue: source.vue,
        utilisateur: source.utilisateur || '',
        tri: source.tri.map(critere => ({ critere: critere.critere, sens: critere.sens })),
        filtres: {
          texte: filtres.texte, numero: filtres.numero, du: filtres.du, au: filtres.au, mesTickets: !!filtres.mesTickets,
          types: [...filtres.types], priorites: [...filtres.priorites], points: [...filtres.points], statuts: [...filtres.statuts], urgences: [...filtres.urgences]
        }
      }
    };
  }

  // Valeurs admises pour chaque groupe de filtres (les mêmes que les puces)
  const VALEURS_DE_FILTRE = {
    types: TYPES.map(element => element.valeur),
    priorites: PRIORITES.map(element => String(element.valeur)),
    points: [...POINTS.map(String), NON_ESTIME],
    statuts: STATUTS.map(element => element.valeur),
    urgences: URGENCES                // B3
  };
  function filtresDepuis(brut) {
    const filtres = filtresVides();
    if (!brut || typeof brut !== 'object') return filtres;
    if (typeof brut.texte === 'string') filtres.texte = brut.texte.slice(0, 200);
    if (/^\d{1,7}$/.test(String(brut.numero ?? ''))) filtres.numero = String(brut.numero);
    if (dateIsoValide(brut.du)) filtres.du = brut.du;
    if (dateIsoValide(brut.au)) filtres.au = brut.au;
    filtres.mesTickets = brut.mesTickets === true;
    for (const groupe of Object.keys(VALEURS_DE_FILTRE)) {
      if (Array.isArray(brut[groupe])) for (const valeur of brut[groupe]) if (VALEURS_DE_FILTRE[groupe].includes(String(valeur))) filtres[groupe].add(String(valeur));
    }
    return filtres;
  }
  function triDepuis(brut) {
    if (!Array.isArray(brut)) return triParDefaut();
    const vus = new Set();
    const tri = brut.filter(element => element && CRITERES_TRI[element.critere] && ['asc', 'desc'].includes(element.sens) && !vus.has(element.critere) && vus.add(element.critere))
      .map(element => ({ critere: element.critere, sens: element.sens }));
    return tri.length ? tri : triParDefaut();
  }

  // Lit une enveloppe version 2 et la vérifie entièrement ; lève une erreur si sa structure est inutilisable.
  // Chaque ticket repasse par importerTickets : une valeur abîmée est corrigée plutôt que de tout perdre.
  function lireEnveloppeV2(brut, dateDuJour = aujourdhuiIso()) {
    if (!brut || !Array.isArray(brut.tickets) || !Array.isArray(brut.projets) || !brut.projets.length) {
      throw new Error('enveloppe incomplète (tickets ou projets manquants)');
    }
    const ticketsParNumero = new Map();
    for (const ticket of brut.tickets) if (ticket && typeof ticket === 'object' && !ticketsParNumero.has(String(ticket.id))) ticketsParNumero.set(String(ticket.id), ticket);
    const compteurs = brut.compteurs && typeof brut.compteurs === 'object' ? brut.compteurs : {};
    const pris = new Set();
    const idsProjets = new Set();
    let prochainId = Number.isInteger(compteurs.prochainTicket) && compteurs.prochainTicket >= 1 ? compteurs.prochainTicket : 1;
    let corrections = 0;
    const projets = [];
    brut.projets.forEach((projetBrut, rang) => {
      if (!projetBrut || typeof projetBrut !== 'object') return;
      let id = Number.isInteger(projetBrut.id) && projetBrut.id >= 1 && !idsProjets.has(projetBrut.id) ? projetBrut.id : 0;
      if (!id) { id = 1; while (idsProjets.has(id)) id++; }
      idsProjets.add(id);
      const nom = typeof projetBrut.nom === 'string' && projetBrut.nom.trim() ? projetBrut.nom.trim().slice(0, NOM_PROJET_MAX) : `Projet ${rang + 1}`;
      const lignes = (Array.isArray(projetBrut.tickets) ? projetBrut.tickets : [])
        .map(numero => ticketsParNumero.get(String(numero))).filter(Boolean)
        .map((ticket, position) => ({ numero: position + 1, repere: `Ticket ${position + 1}`, valeurs: ticket }));
      const rapport = importerTickets(lignes, [], { numerosPris: pris, prochainId, dateDuJour });
      for (const ticket of rapport.importes) pris.add(ticket.id);
      prochainId = rapport.prochainId;
      corrections += rapport.rejets.length + rapport.ajustements.filter(ligne => ligne.details.some(detail => detail.nature === 'correction')).length;
      const numeros = new Set(rapport.importes.map(ticket => ticket.id));
      let ordreManuel = null;
      if (Array.isArray(projetBrut.ordreManuel)) {
        ordreManuel = [...new Set(projetBrut.ordreManuel.map(Number).filter(numero => numeros.has(numero)))];
        for (const ticket of rapport.importes) if (!ordreManuel.includes(ticket.id)) ordreManuel.push(ticket.id);
      }
      const notesImport = {};
      if (projetBrut.notesImport && typeof projetBrut.notesImport === 'object') {
        for (const [cle, note] of Object.entries(projetBrut.notesImport)) {
          if (numeros.has(Number(cle)) && note && Array.isArray(note.corrections) && note.corrections.length) {
            notesImport[Number(cle)] = { source: String(note.source || 'fichier'), repere: String(note.repere || 'ligne'), date: dateIsoValide(note.date) ? note.date : dateDuJour, corrections: note.corrections.map(String) };
          }
        }
      }
      // Journal : chaque entrée doit être complète, avec un état d’avant conforme au modèle
      const journal = [];
      if (Array.isArray(projetBrut.journal)) {
        for (const entree of projetBrut.journal.slice(0, JOURNAL_MAX)) {
          const avant = entree && entree.avant;
          if (!entree || !Number.isInteger(entree.id) || !STATUTS.some(statut => statut.valeur === entree.de) || !STATUTS.some(statut => statut.valeur === entree.vers)
            || !avant || !Array.isArray(avant.tickets) || typeof entree.apres !== 'string') continue;
          const ticketsAvant = avant.tickets.map(element => construireTicket(element || {}));
          const vus = new Set();
          if (ticketsAvant.some(ticket => Object.keys(validerTicket(ticket, vus)).length || !vus.add(ticket.id))) continue;
          journal.push({ id: entree.id, titre: String(entree.titre || ''), de: entree.de, vers: entree.vers, quand: String(entree.quand || ''),
            avant: { tickets: ticketsAvant, ordreManuel: Array.isArray(avant.ordreManuel) ? avant.ordreManuel.map(Number) : null,
              ordreAffiche: Array.isArray(avant.ordreAffiche) ? avant.ordreAffiche.map(Number) : null }, apres: entree.apres });
        }
      }
      // B1.10 · Sprints : les invalides sont écartés ; un ticket garde son sprintId seulement si ce sprint
      // existe, et s’il est estimé quand le sprint est ouvert. Correspondance par numéro : un ticket
      // renuméroté (numéro en double) n’a pas de correspondance sûr, il redevient hors sprint.
      const sprints = lireSprints(projetBrut.sprints);
      // B2.7d · Bloquants : même correspondance par numéro, puis nettoyage (inconnus, doublons, cycles)
      const brutsParNumero = new Map();
      for (const ligne of lignes) if (!brutsParNumero.has(String(ligne.valeurs.id))) brutsParNumero.set(String(ligne.valeurs.id), ligne.valeurs);
      const tickets = nettoyerBloquants(rapport.importes.map(ticket => {
        const brut = brutsParNumero.get(String(ticket.id)) || {};
        const sprintId = brut.sprintId;
        const sprint = Number.isInteger(sprintId) ? sprints.find(element => element.id === sprintId) : null;
        const garde = sprint && !(sprint.statut === SPRINT_OUVERT && ticket.points === null);
        return { ...ticket, sprintId: garde ? sprintId : null, bloquePar: Array.isArray(brut.bloquePar) ? brut.bloquePar : [], echeance: dateIsoValide(brut.echeance) ? brut.echeance : null };
      }));
      projets.push({ id, nom, tickets, ordreManuel, notesImport, journal, sprints });
    });
    if (!projets.length) throw new Error('aucun projet lisible');
    const tousLesNumeros = projets.flatMap(projet => projet.tickets.map(ticket => ticket.id));
    const attribues = new Set(tousLesNumeros);
    if (Array.isArray(compteurs.numerosAttribues)) for (const numero of compteurs.numerosAttribues) if (Number.isInteger(numero) && numero >= 1 && numero <= ID_MAX) attribues.add(numero);
    const affichage = brut.affichage && typeof brut.affichage === 'object' ? brut.affichage : {};
    return {
      donnees: {
        projets,
        projetActifId: projets.some(projet => projet.id === brut.projetActif) ? brut.projetActif : projets[0].id,
        prochainIdTicket: prochainId,                 // les numéros déjà attribués sont sautés (numerosAttribues)
        prochainIdProjet: Math.max(Number.isInteger(compteurs.prochainProjet) ? compteurs.prochainProjet : 0, Math.max(...idsProjets) + 1),
        numerosAttribues: [...attribues],
        vue: ['sprints', 'kanban', 'calendrier'].includes(affichage.vue) ? affichage.vue : 'backlog',
        tri: triDepuis(affichage.tri),
        filtres: filtresDepuis(affichage.filtres),
        utilisateur: typeof affichage.utilisateur === 'string' ? affichage.utilisateur.trim().replace(/\s+/g, ' ').slice(0, ASSIGNE_MAX) : ''
      },
      corrections
    };
  }

  // 2 · Migration : la version 1 enregistrait un tableau nu de tickets, parfois sans tous les champs.
  // Chaque champ manquant reçoit sa valeur par défaut (statut Backlog, points non estimé, date du jour…).
  function migrerV1versV2(tableau, dateDuJour = aujourdhuiIso()) {
    const lignes = tableau.map((element, rang) => ({
      numero: rang + 1, repere: `Ticket ${rang + 1}`,
      valeurs: element && typeof element === 'object' && !Array.isArray(element) ? element : { __invalide: true }
    }));
    const rapport = importerTickets(lignes, [], { dateDuJour });
    return {
      version: 2,
      tickets: rapport.importes,
      projets: [{ id: 1, nom: 'Mon projet', tickets: rapport.importes.map(ticket => ticket.id), ordreManuel: null, notesImport: {} }],
      projetActif: 1,
      compteurs: { prochainTicket: rapport.prochainId, prochainProjet: 2, numerosAttribues: rapport.importes.map(ticket => ticket.id) },
      affichage: { vue: 'backlog', tri: triParDefaut(), filtres: {} }
    };
  }

  // Migration v2 → v3 : les tickets d’hier n’ont pas « assigne » (→ null), les projets pas de journal (→ vide)
  function migrerV2versV3(brut) {
    return {
      ...brut,
      version: 3,
      tickets: Array.isArray(brut.tickets) ? brut.tickets.map(ticket => (ticket && typeof ticket === 'object' ? { ...ticket, assigne: ticket.assigne ?? null } : ticket)) : brut.tickets,
      projets: Array.isArray(brut.projets) ? brut.projets.map(projet => (projet && typeof projet === 'object' ? { ...projet, journal: [] } : projet)) : brut.projets,
      affichage: { ...(brut.affichage && typeof brut.affichage === 'object' ? brut.affichage : {}), utilisateur: '' }
    };
  }

  // Migration v3 → v4 (B1) : chaque ticket est hors sprint (sprintId null), chaque projet sans sprint
  function migrerV3versV4(brut) {
    return {
      ...brut,
      version: 4,
      tickets: Array.isArray(brut.tickets) ? brut.tickets.map(ticket => (ticket && typeof ticket === 'object' ? { ...ticket, sprintId: null } : ticket)) : brut.tickets,
      projets: Array.isArray(brut.projets) ? brut.projets.map(projet => (projet && typeof projet === 'object' ? { ...projet, sprints: [] } : projet)) : brut.projets
    };
  }

  // Migration v4 → v5 (B2) : aucun ticket n’est bloqué ; les sprints sont gardés tels quels
  function migrerV4versV5(brut) {
    return {
      ...brut,
      version: 5,
      tickets: Array.isArray(brut.tickets) ? brut.tickets.map(ticket => (ticket && typeof ticket === 'object' ? { ...ticket, bloquePar: [] } : ticket)) : brut.tickets
    };
  }

  // Migration v5 → v6 (B3) : aucun ticket n’a d’échéance ; sprints et bloquants sont gardés tels quels
  function migrerV5versV6(brut) {
    return {
      ...brut,
      version: 6,
      tickets: Array.isArray(brut.tickets) ? brut.tickets.map(ticket => (ticket && typeof ticket === 'object' ? { ...ticket, echeance: null } : ticket)) : brut.tickets
    };
  }

  // Migration v6 → v7 (B6) : aucun sprint n’est encore marqué démarré ; un sprint déjà commencé démarrera au premier affichage
  function migrerV6versV7(brut) {
    return {
      ...brut,
      version: 7,
      projets: Array.isArray(brut.projets) ? brut.projets.map(projet => (projet && typeof projet === 'object' && Array.isArray(projet.sprints)
        ? { ...projet, sprints: projet.sprints.map(sprint => (sprint && typeof sprint === 'object' ? { ...sprint, demarreLe: null } : sprint)) } : projet)) : brut.projets
    };
  }

  // charger([texte]) → { origine, donnees, ... } ; ne lève JAMAIS d’exception.
  //   origine : 'premier-lancement' | 'sauvegarde' | 'migration-v1' | 'migration-v2' | 'migration-v3' | 'migration-v4' | 'migration-v5' | 'migration-v6' | 'illisible' | 'version-inconnue'
  //   donnees : l’état à appliquer, ou null (→ démonstration)
  //   Sans argument, lit la sauvegarde de ce navigateur.
  function charger(texte) {
    if (arguments.length === 0) {
      try { texte = localStorage.getItem(CLE_SAUVEGARDE); } catch (erreur) { texte = null; }
    }
    try {
      if (texte === null || texte === undefined || texte === '') return { origine: 'premier-lancement', donnees: null };
      const brut = JSON.parse(texte);
      if (!brut) return { origine: 'premier-lancement', donnees: null };
      if (Array.isArray(brut)) {
        const lu = lireEnveloppeV2(migrerV6versV7(migrerV5versV6(migrerV4versV5(migrerV3versV4(migrerV2versV3(migrerV1versV2(brut)))))));
        return { origine: 'migration-v1', donnees: lu.donnees, nombre: brut.length };
      }
      if (typeof brut === 'object' && brut.version === 2) {
        const lu = lireEnveloppeV2(migrerV6versV7(migrerV5versV6(migrerV4versV5(migrerV3versV4(migrerV2versV3(brut))))));
        return { origine: 'migration-v2', donnees: lu.donnees, nombre: lu.donnees.projets.reduce((total, projet) => total + projet.tickets.length, 0) };
      }
      if (typeof brut === 'object' && brut.version === 3) {
        const lu = lireEnveloppeV2(migrerV6versV7(migrerV5versV6(migrerV4versV5(migrerV3versV4(brut)))));
        return { origine: 'migration-v3', donnees: lu.donnees, nombre: lu.donnees.projets.reduce((total, projet) => total + projet.tickets.length, 0) };
      }
      if (typeof brut === 'object' && brut.version === 4) {
        const lu = lireEnveloppeV2(migrerV6versV7(migrerV5versV6(migrerV4versV5(brut))));
        return { origine: 'migration-v4', donnees: lu.donnees, nombre: lu.donnees.projets.reduce((total, projet) => total + projet.tickets.length, 0) };
      }
      if (typeof brut === 'object' && brut.version === 5) {
        const lu = lireEnveloppeV2(migrerV6versV7(migrerV5versV6(brut)));
        return { origine: 'migration-v5', donnees: lu.donnees, nombre: lu.donnees.projets.reduce((total, projet) => total + projet.tickets.length, 0) };
      }
      if (typeof brut === 'object' && brut.version === 6) {
        const lu = lireEnveloppeV2(migrerV6versV7(brut));
        return { origine: 'migration-v6', donnees: lu.donnees, nombre: lu.donnees.projets.reduce((total, projet) => total + projet.tickets.length, 0) };
      }
      if (typeof brut === 'object' && brut.version === VERSION_SAUVEGARDE) {
        const lu = lireEnveloppeV2(brut);
        return { origine: 'sauvegarde', donnees: lu.donnees, corrections: lu.corrections, enregistreLe: brut.enregistreLe || null };
      }
      if (typeof brut === 'object' && Number.isInteger(brut.version) && brut.version > VERSION_SAUVEGARDE) {
        return { origine: 'version-inconnue', donnees: null, version: brut.version };
      }
      return { origine: 'illisible', donnees: null, detail: 'format inconnu' };
    } catch (erreur) {
      return { origine: 'illisible', donnees: null, detail: erreur.message };   // 3 · plan B
    }
  }

  // Applique un état chargé à l’application
  function appliquerDonnees(donnees) {
    etat.projets = donnees.projets.map(projet => ({ ...projet, tickets: [...projet.tickets], sprints: [...(projet.sprints || [])] }));
    etat.sprintAfficheId = null;
    etat.projetActifId = donnees.projetActifId;
    etat.prochainIdTicket = donnees.prochainIdTicket;
    etat.prochainIdProjet = donnees.prochainIdProjet;
    etat.numerosAttribues = new Set(donnees.numerosAttribues);
    etat.filtres = donnees.filtres;
    etat.tri = donnees.tri;
    etat.vue = donnees.vue;
    etat.utilisateur = donnees.utilisateur || '';
  }

  // Le projet de démonstration : chaque ticket de départ est validé comme un ticket saisi
  function installerDemonstration() {
    etat.projets = [];
    etat.prochainIdProjet = 1;
    etat.numerosAttribues = new Set();
    const numeros = new Set();
    const tickets = [];
    for (const donnees of TICKETS_INITIAUX) {
      const ticket = construireTicket(donnees);
      const erreurs = validerTicket(ticket, numeros);
      if (Object.keys(erreurs).length) { console.error('Ticket de départ non conforme au modèle :', donnees, erreurs); continue; }
      numeros.add(ticket.id);
      tickets.push(ticket);
    }
    const projet = creerProjet('Refonte de l’espace client');
    projet.tickets = tickets;
    etat.projetActifId = projet.id;
    etat.prochainIdTicket = tickets.reduce((plusGrand, ticket) => Math.max(plusGrand, ticket.id), 0) + 1;
    retenirNumeros(tickets);
    etat.filtres = filtresVides();
    etat.tri = triParDefaut();
  }

  // Enregistre l’état après chaque modification (appelée à la fin de rendre())
  let sauvegardeActive = false;                       // pas d’écriture avant la fin du démarrage
  function sauvegarder() {
    if (!sauvegardeActive) return;
    const enveloppe = { ...enveloppeDeSauvegarde(etat), enregistreLe: new Date().toISOString() };
    // Le journal garde l’état d’avant chaque déplacement : c’est la partie la plus lourde.
    // Si le stockage est plein, on réessaie avec moins d’entrées (3, puis aucune) avant d’abandonner.
    for (const entrees of [JOURNAL_MAX, 3, 0]) {
      try {
        const essai = entrees === JOURNAL_MAX ? enveloppe : { ...enveloppe, projets: enveloppe.projets.map(projet => ({ ...projet, journal: projet.journal.slice(0, entrees) })) };
        localStorage.setItem(CLE_SAUVEGARDE, JSON.stringify(essai));
        afficherEtatSauvegarde(true, entrees < JOURNAL_MAX ? entrees : null);
        return;
      } catch (erreur) { /* on réessaie plus léger */ }
    }
    afficherEtatSauvegarde(false);
  }
  function afficherEtatSauvegarde(reussie, entreesGardees = null) {   // entreesGardees : journal allégé faute de place
    const heure = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    page.etatSauvegarde.classList.toggle('is-ko', !reussie);
    page.etatSauvegarde.textContent = reussie
      ? `Enregistré automatiquement dans ce navigateur à ${heure}. Vos tickets, vos filtres et la vue choisie seront là au prochain chargement.${entreesGardees === null ? '' : entreesGardees ? ` Stockage presque plein\u00a0: seuls les ${entreesGardees} derniers déplacements du journal sont gardés.` : ' Stockage presque plein\u00a0: le journal des déplacements n’a pas pu être gardé (« Annuler » ne marchera plus après rechargement).'}`
      : 'Enregistrement impossible dans ce navigateur (stockage bloqué ou plein)\u00a0: exportez vos tickets pour ne pas les perdre.';
  }

  // Message affiché au démarrage quand la sauvegarde n’a pas pu être reprise telle quelle
  function afficherBandeauChargement(chargement) {
    const messages = {
      'illisible': ['La sauvegarde de ce navigateur était illisible.', 'TaskFlow a redémarré avec la démonstration. Une copie de la donnée abîmée a été gardée à part (clé «\u00a0taskflow-illisible\u00a0»).'],
      'version-inconnue': [`La sauvegarde vient d’une version plus récente de TaskFlow (version ${chargement.version}).`, 'Cette version ne sait pas la lire : TaskFlow a démarré avec la démonstration. Une copie a été gardée à part (clé «\u00a0taskflow-illisible\u00a0»).'],
      'migration-v2': ['Votre sauvegarde venait de la version précédente de TaskFlow.', `Elle a été mise à jour\u00a0: ${pluriel(chargement.nombre || 0, 'ticket')} repris, avec un nouveau champ «\u00a0Assigné à\u00a0», vide pour l’instant.`],
      'migration-v6': ['Votre sauvegarde venait de la version précédente de TaskFlow.', `Elle a été mise à jour\u00a0: ${pluriel(chargement.nombre || 0, 'ticket')} repris, avec vos sprints, blocages et échéances. Désormais, au démarrage d’un sprint, ses tickets «\u00a0Backlog\u00a0» passent «\u00a0À faire\u00a0».`],
      'migration-v5': ['Votre sauvegarde venait de la version précédente de TaskFlow.', `Elle a été mise à jour\u00a0: ${pluriel(chargement.nombre || 0, 'ticket')} repris, sprints et blocages compris. Vous pouvez maintenant donner une échéance à vos tickets et les voir dans le calendrier.`],
      'migration-v4': ['Votre sauvegarde venait de la version précédente de TaskFlow.', `Elle a été mise à jour\u00a0: ${pluriel(chargement.nombre || 0, 'ticket')} repris, sprints compris. Vous pouvez maintenant indiquer qu’un ticket est «\u00a0bloqué par\u00a0» d’autres.`],
      'migration-v3': ['Votre sauvegarde venait de la version précédente de TaskFlow.', `Elle a été mise à jour\u00a0: ${pluriel(chargement.nombre || 0, 'ticket')} repris. Vous pouvez maintenant planifier des sprints.`],
      'migration-v1': ['Votre sauvegarde venait d’une ancienne version de TaskFlow.', `Elle a été convertie au nouveau format\u00a0: ${pluriel(chargement.nombre || 0, 'ticket')} repris, les champs manquants complétés par leur valeur par défaut.`]
    };
    if (chargement.origine === 'sauvegarde' && chargement.corrections) {
      messages.sauvegarde = ['La sauvegarde contenait des valeurs abîmées.', `${pluriel(chargement.corrections, 'ticket')} ${chargement.corrections > 1 ? 'ont été corrigés' : 'a été corrigé'} pour respecter les règles.`];
    }
    const message = messages[chargement.origine];
    page.bandeauChargement.hidden = !message;
    page.bandeauChargement.classList.toggle('is-info', /^migration-/.test(chargement.origine));
    if (message) { page.titreBandeauChargement.textContent = message[0]; page.texteBandeauChargement.textContent = message[1]; }
  }

  // « Réinitialiser la démo » : toute l’application revient à son état de départ
  function reinitialiserLaDemo() {
    try { localStorage.removeItem(CLE_SAUVEGARDE); } catch (erreur) { /* rien à effacer */ }
    installerDemonstration();
    etat.utilisateur = '';
    idsCorrigesDuDernierImport = [];
    page.rapportImport.hidden = true;
    page.bandeauChargement.hidden = true;
    synchroniserChamps();
    rendreCriteresTri();
    afficherVue('backlog');                           // dessine la page et enregistre l’état de départ
  }


  /* ========================================================================
     JS 23 · DÉMARRAGE
     ======================================================================== */
  function demarrer() {
    genererPuces();
    genererFormulaire();
    // Chargement protégé : charger() ne lève jamais d’exception, et si l’affichage d’une
    // sauvegarde échoue malgré tout, on repart de la démonstration (jamais d’écran blanc)
    let chargement = charger();
    if (chargement.origine === 'illisible' || chargement.origine === 'version-inconnue') {
      try { localStorage.setItem(CLE_SAUVEGARDE_ILLISIBLE, localStorage.getItem(CLE_SAUVEGARDE)); } catch (erreur) { /* sans conséquence */ }
    }
    try {
      if (chargement.donnees) appliquerDonnees(chargement.donnees);
      else { installerDemonstration(); etat.vue = ['sprints', 'kanban', 'calendrier'].includes(lirePreference(CLE_VUE)) ? lirePreference(CLE_VUE) : 'backlog'; }
      synchroniserChamps();
      rendreCriteresTri();
      afficherVue(etat.vue);                          // affiche la vue (et dessine la page)
    } catch (erreur) {
      console.error('Sauvegarde inutilisable, retour à la démonstration :', erreur);
      chargement = { origine: 'illisible', donnees: null };
      installerDemonstration();
      synchroniserChamps();
      rendreCriteresTri();
      afficherVue('backlog');
    }
    afficherBandeauChargement(chargement);
    sauvegardeActive = true;
    sauvegarder();                                    // la sauvegarde (éventuellement réparée) est réécrite au propre
    trouverTous('[data-repliable]').forEach(appliquerRepli);
    mettreAJourBoutonsTheme();
    if (COLONNE_LIMITEE) page.titreWip.textContent = `En cours (limite WIP)`;
    page.guide.hidden = lirePreference(CLE_GUIDE_VU) === 'oui';
  }


  /* ========================================================================
     JS 24 · CE QUE tests.js PEUT LIRE (lecture seule)
     Les auto-tests vivent dans tests.js, chargé après ce fichier. Ils ont besoin
     des données de référence, des fonctions pures et de quelques éléments de
     l’interface : ils sont exposés ici, dans un objet gelé.
     ======================================================================== */
  window.TaskFlow = Object.freeze({
    // Zone 1 · Données
    COLONNES, COLONNE_BACKLOG, COLONNE_LIMITEE, TICKETS_INITIAUX, VERSION_SAUVEGARDE, JOURNAL_MAX,
    // Zone 2 · Règles (fonctions pures)
    construireTicket, deplacerTicket, calculerStats, parserCSV, importerTickets,
    journaliser, entreeDeJournal, annulerDernierDeplacement, annulerDeplacement, replacerDansLOrdre,
    charger, enveloppeDeSauvegarde, triParDefaut, filtresVides,
    modifierTicket, ticketsEnCsv, ticketsEnJson, analyserFichier,
    // B1 · Sprints et burndown (JS 5b)
    nombreDeJours, creerSprint, ajouterAuSprint, retirerDuSprint, cloturerSprint, calculerBurndown, noterReleve,
    // B2 · Dépendances et blocages (JS 5c)
    definirBloquants, bloquantsActifs, retirerDesBloquants,
    // B8 · Listes déroulantes des bloquants (JS 5c, JS 10)
    listeDesBloquants, choixDeBloquants, resumeDesBloquantsChoisis,
    // B3 · Échéances et calendrier (JS 5d, et le tri de JS 8)
    urgence, creerComparateur, correspondAUrgence, ajouterMois, grilleDuMois, resumeDesRetards,
    // B5 · Kanban du sprint en cours (JS 5b)
    sprintsEnCours, ticketsDuKanban,
    // B6 · Démarrage d’un sprint (JS 5b)
    demarrerSprints, aFaireSiSprintDemarre,
    // Zone 3 · UI
    dessinerBurndown, htmlTicketDeSprint, htmlBloquants,
    page, trouver, echapper, mouvementReduit, ICONE_COCHE, ICONE_CROIX
  });
  demarrer();
})();
