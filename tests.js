/* ##########################################################################
   TaskFlow · tests.js — AUTO-TESTS DES RÈGLES MÉTIER ET DU FICHIER PIÉGÉ
   --------------------------------------------------------------------------
   Chargé après app.js. Il lit les fonctions et données de l’application dans
   window.TaskFlow (exposé à la fin de app.js) : il ne touche ni à l’état de
   l’application ni à la sauvegarde ; chaque test a ses propres données.
   Au chargement : affiche le fichier piégé, exécute tous les tests et branche
   le bouton « Relancer les tests ».
   ########################################################################## */
(function () {
  'use strict';

  const {
    // Zone 1 · Données
    COLONNES, COLONNE_BACKLOG, COLONNE_LIMITEE, TICKETS_INITIAUX, VERSION_SAUVEGARDE, JOURNAL_MAX,
    // Zone 2 · Règles (fonctions pures)
    construireTicket, deplacerTicket, calculerStats, parserCSV, importerTickets,
    journaliser, entreeDeJournal, annulerDernierDeplacement, annulerDeplacement, replacerDansLOrdre,
    charger, enveloppeDeSauvegarde, triParDefaut, filtresVides,
    modifierTicket, ticketsEnCsv, ticketsEnJson, analyserFichier,
    // B1 · Sprints et burndown (docs/spec.md)
    nombreDeJours, creerSprint, ajouterAuSprint, retirerDuSprint, cloturerSprint, calculerBurndown, noterReleve,
    // B2 · Dépendances et blocages (docs/spec.md)
    definirBloquants, bloquantsActifs, retirerDesBloquants,
    // Zone 3 · UI
    dessinerBurndown,
    page, trouver, echapper, mouvementReduit, ICONE_COCHE, ICONE_CROIX
  } = window.TaskFlow;

  /* ========================================================================
     JS 21 · AUTO-TESTS DES RÈGLES MÉTIER ET DU FICHIER PIÉGÉ
     Chaque test utilise son propre jeu de données, gelé avec Object.freeze :
     toute modification du tableau reçu ferait échouer le test (règle R4).
     Les limites sont lues dans COLONNES : les tests suivent les données.
     T1 à T6 : deplacerTicket et calculerStats. T7 et T8 : parserCSV et
     importerTickets sur le fichier piégé, importé dans le tableau de départ.
     T9 : charger() (premier lancement, migration v1, donnée corrompue, aller-retour).
     T10, T11 : demandes du Product Owner (colonne « En revue », passage obligé,
     champ « assigne » et migration v2 → v3, journal et « Annuler »).
     T12 : annuler n’importe lequel des 10 derniers déplacements.
     T13 à T15 : audit des cas limites. T16 à T28 : B1 sprints et burndown.
     T29 à T36 : B2 dépendances et blocages.
     ======================================================================== */
  function gelerEnProfondeur(objet) {
    for (const valeur of Object.values(objet)) if (valeur && typeof valeur === 'object') gelerEnProfondeur(valeur);
    return Object.freeze(objet);
  }
  // Un ticket au modèle exact (10 champs depuis B2 : sprintId, puis bloquePar en dernier)
  const ticketDeTest = (id, statut, points, sprintId = null, bloquePar = []) => ({ id, titre: `Ticket de test ${id}`, type: 'story', priorite: 2, points, statut, creeLe: '2026-11-03', assigne: null, sprintId, bloquePar });
  const LIMITE_WIP = COLONNE_LIMITEE ? COLONNE_LIMITEE.wip : 0;
  const COLONNE_SUIVANTE = COLONNES[1];
  const estPleineSelonLesStats = tickets => calculerStats(tickets).colonnes.find(colonne => colonne.id === COLONNE_LIMITEE.id).plein;

  // Le fichier piégé du sujet (backlog-import.csv), recopié tel quel
  const FICHIER_PIEGE = [
    'id,titre,type,priorite,points,statut',
    '21,"Corriger le login, page d’accueil",bug,1,3,afaire',
    '22,Export PDF des factures,Story ,2,8,backlog',
    '23,,tache,3,2,backlog',
    '24,Notifications e-mail,story,2,?,backlog',
    '21,Tableau de bord client,story,1,5,encours',
    '25,Audit accessibilité,tache,4,3,backlog'
  ].join('\n');
  // Import du fichier piégé dans le tableau de départ (les 12 tickets de démonstration, gelés), à date fixe.
  // « colonnePleine » : on remplit d’abord la colonne limitée, pour vérifier la correction R1.
  function importerLeFichierPiege(colonnePleine = false) {
    let depart = TICKETS_INITIAUX.map(construireTicket);
    if (colonnePleine && COLONNE_LIMITEE) {
      let place = COLONNE_LIMITEE.wip - depart.filter(ticket => ticket.statut === COLONNE_LIMITEE.id).length;
      depart = depart.map(ticket => (place > 0 && ticket.points !== null && ticket.statut !== COLONNE_LIMITEE.id && place-- ? { ...ticket, statut: COLONNE_LIMITEE.id } : ticket));
    }
    const existants = gelerEnProfondeur(depart);
    const lignes = gelerEnProfondeur(parserCSV(FICHIER_PIEGE));
    return { existants, lignes, rapport: importerTickets(lignes, existants, { dateDuJour: '2026-11-03' }) };
  }

  /* ---------- Outils des tests B1 (sprints et burndown, docs/spec.md) ---------- */
  const DERNIERE = COLONNES[COLONNES.length - 1];                         // « Terminé »
  const NBSP = ' ';                                                  // espace insécable des messages (« ␣: »)
  // Fonctions attendues mais absentes de window.TaskFlow (le test est alors rouge, avec ce détail)
  const absentes = fonctions => Object.entries(fonctions).filter(([, fonction]) => typeof fonction !== 'function').map(([nom]) => `${nom}()`);
  const testAbsent = manquantes => ({ reussi: false, detail: `Pas encore codé : ${manquantes.join(', ')} absente${manquantes.length > 1 ? 's' : ''} de window.TaskFlow` });
  const sprintDeTest = (id, capacite, options = {}) => ({ id, nom: options.nom || `Sprint ${id}`, debut: options.debut || '2026-11-02', fin: options.fin || '2026-11-13',
    capacite, statut: options.statut || 'ouvert', releves: options.releves || {}, bilan: options.bilan || null, clotureLe: options.clotureLe || null });
  // JSON aux clés triées, à toutes les profondeurs : compare des objets sans dépendre de l’ordre des clés
  const jsonTrie = valeur => JSON.stringify(valeur, (cle, element) => (element && typeof element === 'object' && !Array.isArray(element)
    ? Object.keys(element).sort().reduce((trie, nom) => { trie[nom] = element[nom]; return trie; }, {}) : element));
  const essayer = fonction => { try { return fonction(); } catch (erreur) { return { exception: erreur.message }; } };
  const ticketParId = (tickets, id) => (tickets || []).find(ticket => ticket && ticket.id === id);
  // Résultat d’un test à étapes : la 1re étape fausse est expliquée
  function bilanDesEtapes(etapes, obtenu, detailSiReussi) {
    const etapeEchouee = etapes.find(([, valide]) => !valide);
    return etapeEchouee ? { reussi: false, detail: `Échec, attendu : ${etapeEchouee[0]}. Obtenu : ${obtenu()}` } : { reussi: true, detail: detailSiReussi };
  }

  const AUTO_TESTS = [
    { code: 'T1', nom: 'déplacement valide', executer() {
      const depart = gelerEnProfondeur([ticketDeTest(1, COLONNE_BACKLOG.id, 3), ticketDeTest(2, COLONNE_SUIVANTE.id, 5)]);
      const resultat = deplacerTicket(depart, 1, COLONNE_SUIVANTE.id);
      const ticketDeplace = resultat.ok && resultat.tickets.find(ticket => ticket.id === 1);
      const reussi = resultat.ok === true && resultat.tickets.length === 2 && ticketDeplace.statut === COLONNE_SUIVANTE.id
        && resultat.tickets.find(ticket => ticket.id === 2).statut === COLONNE_SUIVANTE.id;
      return { reussi, detail: reussi ? `#1 passe de « ${COLONNE_BACKLOG.titre} » à « ${COLONNE_SUIVANTE.titre} » : ok: true` : `Obtenu : ${JSON.stringify(resultat)}` };
    } },

    { code: 'T2', nom: 'non estimé bloqué', executer() {
      const depart = gelerEnProfondeur([ticketDeTest(1, COLONNE_BACKLOG.id, null)]);
      const essais = COLONNES.slice(1).map(colonne => deplacerTicket(depart, 1, colonne.id));
      const reussi = essais.every(essai => essai.ok === false && /Definition of Ready/.test(essai.erreur)) && depart[0].statut === COLONNE_BACKLOG.id;
      return { reussi, detail: reussi ? `Refusé vers les ${essais.length} autres colonnes : « ${essais[0].erreur} »` : `Obtenu : ${JSON.stringify(essais)}` };
    } },

    { code: 'T3', nom: COLONNE_LIMITEE ? `${LIMITE_WIP} en cours → ${LIMITE_WIP + 1}e refusé` : 'limite WIP', executer() {
      if (!COLONNE_LIMITEE) return { reussi: false, detail: 'Échec : aucune colonne n’a de limite WIP dans COLONNES, la règle R1 ne peut pas être vérifiée.' };
      const ticketsDansLaColonne = (nombre, premierId) => Array.from({ length: nombre }, (_, rang) => ticketDeTest(premierId + rang, COLONNE_LIMITEE.id, 2));
      // Juste sous la limite, puis pile à la limite, puis un de trop
      const depart = gelerEnProfondeur([...ticketsDansLaColonne(LIMITE_WIP - 1, 1), ticketDeTest(50, COLONNE_SUIVANTE.id, 3), ticketDeTest(51, COLONNE_SUIVANTE.id, 5)]);
      const essaiLimite = deplacerTicket(depart, 50, COLONNE_LIMITEE.id);
      const nombreApres = essaiLimite.ok ? essaiLimite.tickets.filter(ticket => ticket.statut === COLONNE_LIMITEE.id).length : -1;
      const essaiDeTrop = essaiLimite.ok ? deplacerTicket(essaiLimite.tickets, 51, COLONNE_LIMITEE.id) : essaiLimite;
      // Au-delà : colonne déjà en dépassement → tout ajout reste refusé
      const enDepassement = gelerEnProfondeur([...ticketsDansLaColonne(LIMITE_WIP + 1, 1), ticketDeTest(60, COLONNE_SUIVANTE.id, 1)]);
      const essaiAuDela = deplacerTicket(enDepassement, 60, COLONNE_LIMITEE.id);
      const erreurAttendue = `WIP atteint (${LIMITE_WIP}/${LIMITE_WIP})`;
      const etapes = [
        [`à ${LIMITE_WIP - 1}/${LIMITE_WIP}, la colonne n’est pas signalée pleine`, estPleineSelonLesStats(depart) === false],
        [`le ${LIMITE_WIP}e ticket est accepté (limite exacte ${LIMITE_WIP}/${LIMITE_WIP})`, essaiLimite.ok === true && nombreApres === LIMITE_WIP],
        [`à ${LIMITE_WIP}/${LIMITE_WIP}, la colonne est signalée pleine`, essaiLimite.ok === true && estPleineSelonLesStats(essaiLimite.tickets) === true],
        [`le ${LIMITE_WIP + 1}e ticket est refusé avec « ${erreurAttendue} »`, essaiDeTrop.ok === false && essaiDeTrop.erreur === erreurAttendue],
        [`au-delà de la limite (${LIMITE_WIP + 1}/${LIMITE_WIP}), tout nouvel ajout est refusé`, essaiAuDela.ok === false && /^WIP atteint/.test(essaiAuDela.erreur || '')],
        [`à ${LIMITE_WIP + 1}/${LIMITE_WIP}, la colonne est signalée pleine`, estPleineSelonLesStats(enDepassement) === true]
      ];
      const etapeEchouee = etapes.find(([, valide]) => !valide);
      if (etapeEchouee) {
        const obtenu = { limite: essaiLimite.ok, nombreApres, deTrop: essaiDeTrop.erreur || essaiDeTrop.ok, auDela: essaiAuDela.erreur || essaiAuDela.ok };
        return { reussi: false, detail: `Échec, attendu : ${etapeEchouee[0]}. Obtenu : ${JSON.stringify(obtenu)}` };
      }
      return { reussi: true, detail: `${LIMITE_WIP - 1}/${LIMITE_WIP} → ${LIMITE_WIP}e accepté (${LIMITE_WIP}/${LIMITE_WIP}), ${LIMITE_WIP + 1}e refusé : « ${essaiDeTrop.erreur} » ; au-delà aussi refusé` };
    } },

    { code: 'T4', nom: 'id inconnu, sans planter', executer() {
      const depart = gelerEnProfondeur([ticketDeTest(1, COLONNE_BACKLOG.id, 3)]);
      const idInconnu = deplacerTicket(depart, 999, COLONNE_SUIVANTE.id);
      const listeVide = deplacerTicket([], 1, COLONNE_SUIVANTE.id);
      const reussi = idInconnu.ok === false && /introuvable/.test(idInconnu.erreur) && listeVide.ok === false && /introuvable/.test(listeVide.erreur);
      return { reussi, detail: reussi ? `« ${idInconnu.erreur} » ; liste vide : « ${listeVide.erreur} »` : `Obtenu : ${JSON.stringify({ idInconnu, listeVide })}` };
    } },

    { code: 'T5', nom: 'tableau d’origine intact', executer() {
      const ticketsLimites = Array.from({ length: LIMITE_WIP }, (_, rang) => ticketDeTest(10 + rang, COLONNE_LIMITEE ? COLONNE_LIMITEE.id : COLONNE_SUIVANTE.id, 1));
      const depart = gelerEnProfondeur([ticketDeTest(1, COLONNE_BACKLOG.id, 3), ticketDeTest(2, COLONNE_BACKLOG.id, null), ...ticketsLimites, ticketDeTest(20, COLONNE_SUIVANTE.id, 2)]);
      const copieAvant = JSON.stringify(depart);
      const resultat = deplacerTicket(depart, 1, COLONNE_SUIVANTE.id);               // accepté
      deplacerTicket(depart, 2, COLONNE_SUIVANTE.id);                                  // refusé (R2)
      if (COLONNE_LIMITEE) deplacerTicket(depart, 20, COLONNE_LIMITEE.id);             // refusé (R1)
      const reussi = JSON.stringify(depart) === copieAvant && resultat.ok && resultat.tickets !== depart
        && depart[0].statut === COLONNE_BACKLOG.id && resultat.tickets[0] !== depart[0];
      return { reussi, detail: reussi ? 'Tableau gelé : identique après 3 appels, nouveau tableau renvoyé' : 'Le tableau reçu a été modifié' };
    } },

    { code: 'T6', nom: 'stats vides : 0 %, pas NaN', executer() {
      const stats = calculerStats([]);
      const nombres = [stats.total, stats.points, stats.nonEstimes, stats.pointsTermines, stats.avancement,
        ...stats.colonnes.flatMap(colonne => [colonne.nombre, colonne.points, colonne.pourcentage])];
      const reussi = nombres.every(nombre => typeof nombre === 'number' && Number.isFinite(nombre))
        && stats.colonnes.length === COLONNES.length && stats.colonnes.every(colonne => colonne.pourcentage === 0)
        && stats.total === 0 && stats.avancement === 0;
      return { reussi, detail: reussi ? `Avancement ${stats.avancement} % ; ${stats.colonnes.map(colonne => `${colonne.titre} ${colonne.pourcentage} %`).join(', ')}` : `Obtenu : ${JSON.stringify(stats)}` };
    } },

    { code: 'T7', groupe: 'piege', nom: 'fichier piégé : 6 importés · 0 rejeté, chaque correction expliquée', executer() {
      const { rapport } = importerLeFichierPiege();
      const correctionsDe = (leRapport, repere) => {
        const ligne = leRapport.ajustements.find(element => element.repere === repere);
        return ligne ? ligne.details.filter(detail => detail.nature === 'correction').map(detail => detail.texte) : [];
      };
      const parTitre = titre => rapport.importes.find(ticket => ticket.titre === titre);
      const sansTitre = parTitre('Titre à compléter (ligne 4)');
      const audit = parTitre('Audit accessibilité');
      // Même fichier, mais « En cours » déjà plein : la ligne 6 est importée dans la colonne précédente
      const plein = importerLeFichierPiege(true).rapport;
      const tableauDeBord = plein.importes.find(ticket => ticket.titre === 'Tableau de bord client');
      const colonnePrecedente = COLONNE_LIMITEE ? COLONNES[COLONNES.findIndex(colonne => colonne.id === COLONNE_LIMITEE.id) - 1] : null;
      const etapes = [
        ['bilan exact « 6 importés · 0 rejeté »', rapport.bilan === '6 importés · 0 rejeté' && rapport.importes.length === 6 && !rapport.rejets.length],
        ['ligne 4 : titre vide → « Titre à compléter (ligne 4) », correction expliquée, autres colonnes gardées',
          !!sansTitre && sansTitre.type === 'tache' && sansTitre.priorite === 3 && sansTitre.points === 2
          && correctionsDe(rapport, 'Ligne 4').includes('titre vide → «\u00a0Titre à compléter (ligne 4)\u00a0»')],
        ['ligne 7 : priorité « 4 » → 3 (valeur la plus proche), correction expliquée',
          !!audit && audit.priorite === 3 && correctionsDe(rapport, 'Ligne 7').includes('priorité «\u00a04\u00a0» hors 1–3 → 3 (valeur la plus proche)')],
        ['ligne 6 : id 21 déjà pris → nouvel id, correction expliquée', correctionsDe(rapport, 'Ligne 6').some(texte => /^id 21 déjà pris → nouvel id \d+$/.test(texte))],
        ['« En cours » déjà plein : toujours « 6 importés · 0 rejeté », la ligne 6 corrigée vers la colonne précédente',
          plein.bilan === '6 importés · 0 rejeté' && !!tableauDeBord && !!colonnePrecedente && tableauDeBord.statut === colonnePrecedente.id
          && correctionsDe(plein, 'Ligne 6').some(texte => /^WIP atteint/.test(texte))]
      ];
      const etapeEchouee = etapes.find(([, valide]) => !valide);
      return etapeEchouee
        ? { reussi: false, detail: `Échec, attendu : ${etapeEchouee[0]}. Obtenu : « ${rapport.bilan} » ; ${rapport.ajustements.map(ligne => `${ligne.repere} : ${ligne.details.map(detail => detail.texte).join(', ')}`).join(' | ')}` }
        : { reussi: true, detail: `« ${rapport.bilan} » ; ligne 4 : titre vide → « Titre à compléter (ligne 4) » ; ligne 7 : priorité 4 → 3 ; ligne 6 : nouvel id (et « ${colonnePrecedente ? colonnePrecedente.titre : ''} » si « ${COLONNE_LIMITEE ? COLONNE_LIMITEE.titre : ''} » est plein)` };
    } },

    { code: 'T8', groupe: 'piege', nom: 'fichier piégé : guillemets, « Story », « ? » et id 21 en double', executer() {
      const { existants, rapport } = importerLeFichierPiege();
      const parTitre = titre => rapport.importes.find(ticket => ticket.titre === titre);
      const login = parTitre('Corriger le login, page d’accueil');
      const exportPdf = parTitre('Export PDF des factures');
      const notifications = parTitre('Notifications e-mail');
      const tableauDeBord = parTitre('Tableau de bord client');
      const tousLesId = [...existants, ...rapport.importes].map(ticket => ticket.id);
      // Une normalisation (même valeur écrite autrement) n’est pas une correction : pas de mention sur le ticket
      const sansCorrection = repere => !rapport.ajustements.some(ligne => ligne.repere === repere && ligne.details.some(detail => detail.nature === 'correction'));
      const etapes = [
        ['I1 : « Corriger le login, page d’accueil » garde son titre complet, le type bug et ses colonnes', !!login && login.id === 21 && login.type === 'bug' && login.priorite === 1 && login.points === 3 && login.statut === 'afaire'],
        ['I2 : « Story » (avec un espace) devient "story", simple normalisation (le ticket n’est pas signalé comme corrigé)', !!exportPdf && exportPdf.type === 'story' && sansCorrection('Ligne 3')],
        ['I2 : les points « ? » deviennent null, simple normalisation', !!notifications && notifications.points === null && sansCorrection('Ligne 5')],
        ['I4 : le second 21 reçoit un nouvel id', !!tableauDeBord && tableauDeBord.id !== 21],
        ['I4 : aucun id en double, aucun ticket existant écrasé', new Set(tousLesId).size === tousLesId.length && existants.length === 12 && existants[0].id === 1]
      ];
      const etapeEchouee = etapes.find(([, valide]) => !valide);
      return etapeEchouee
        ? { reussi: false, detail: `Échec, attendu : ${etapeEchouee[0]}. Obtenu : ${JSON.stringify(rapport.importes.map(ticket => [ticket.id, ticket.titre, ticket.type, ticket.points]))}` }
        : { reussi: true, detail: `Titre complet et type bug ; « Story » → "story" ; « ? » → null ; second 21 → id ${tableauDeBord.id} ; ${tousLesId.length} id tous différents` };
    } },

    { code: 'T9', groupe: 'sauvegarde', nom: 'charger() : premier lancement, ancienne version, donnée corrompue', executer() {
      // Un petit état de test, enregistré puis relu
      const projetTest = { id: 7, nom: 'Projet de test', tickets: gelerEnProfondeur([ticketDeTest(1, COLONNE_BACKLOG.id, null), ticketDeTest(2, COLONNE_SUIVANTE.id, 5)]), ordreManuel: [2, 1], notesImport: {} };
      const etatTest = { projets: [projetTest], projetActifId: 7, prochainIdTicket: 3, prochainIdProjet: 8, numerosAttribues: new Set([1, 2]),
        vue: 'kanban', tri: triParDefaut(), filtres: { ...filtresVides(), texte: 'login', types: new Set(['bug']) } };
      const relu = charger(JSON.stringify(enveloppeDeSauvegarde(etatTest)));
      const v1 = charger(JSON.stringify([{ id: 4, titre: 'Ticket écrit par la version 1' }, { titre: 'Sans numéro', points: 5 }]));
      const ticketV1 = v1.donnees && v1.donnees.projets[0].tickets[0];
      const cles = 'id,titre,type,priorite,points,statut,creeLe,assigne,sprintId,bloquePar';   // B1 : sprintId ; B2 : bloquePar
      const etapes = [
        ['premier lancement (rien d’enregistré) → démonstration', charger(null).origine === 'premier-lancement' && charger(null).donnees === null],
        ['« {oups » (donnée corrompue) → démonstration, sans exception', charger('{oups').origine === 'illisible' && charger('{oups').donnees === null],
        ['structure abîmée ou version inconnue → démonstration', charger('{"version":2,"tickets":"x"}').origine === 'illisible' && charger(`{"version":${VERSION_SAUVEGARDE + 1},"tickets":[]}`).origine === 'version-inconnue'],
        ['aller-retour : tickets, ordre, filtres et vue identiques',
          relu.origine === 'sauvegarde' && JSON.stringify(relu.donnees.projets[0].tickets) === JSON.stringify(projetTest.tickets)
          && JSON.stringify(relu.donnees.projets[0].ordreManuel) === '[2,1]' && relu.donnees.vue === 'kanban'
          && relu.donnees.filtres.texte === 'login' && relu.donnees.filtres.types.has('bug')],
        ['tableau nu (version 1) → migré, chaque champ complété (aucun undefined)',
          v1.origine === 'migration-v1' && v1.donnees.projets[0].tickets.length === 2 && !!ticketV1 && Object.keys(ticketV1).join(',') === cles
          && Object.values(ticketV1).every(valeur => valeur !== undefined) && ticketV1.statut === COLONNE_BACKLOG.id && ticketV1.points === null]
      ];
      const etapeEchouee = etapes.find(([, valide]) => !valide);
      return etapeEchouee
        ? { reussi: false, detail: `Échec, attendu : ${etapeEchouee[0]}. Obtenu : ${JSON.stringify({ relu: relu.origine, v1: v1.origine })}` }
        : { reussi: true, detail: `Rien → démo ; « {oups » → démo ; version ${VERSION_SAUVEGARDE + 1} → démo ; aller-retour identique ; tableau v1 migré sans undefined` };
    } },

    { code: 'T10', groupe: 'po', nom: '« En revue » (WIP 2) : « Terminé » seulement depuis « En revue »', executer() {
      const arrivee = COLONNES.find(colonne => colonne.depuis);                 // « Terminé »
      const passage = arrivee && COLONNES.find(colonne => colonne.id === arrivee.depuis[0]);   // « En revue »
      if (!arrivee || !passage || !COLONNE_LIMITEE) return { reussi: false, detail: 'Il manque la colonne de passage obligé dans COLONNES' };
      const rang = COLONNES.indexOf(passage);
      const base = gelerEnProfondeur([ticketDeTest(1, COLONNE_LIMITEE.id, 3), ticketDeTest(2, passage.id, 5), ticketDeTest(3, passage.id, 2), ticketDeTest(4, COLONNE_LIMITEE.id, 1)]);
      const sauter = deplacerTicket(base, 1, arrivee.id);
      const depuisLaRevue = deplacerTicket(base, 2, arrivee.id);
      const revuePleine = deplacerTicket(base, 4, passage.id);
      const avecUnePlace = deplacerTicket(base.filter(ticket => ticket.id !== 3), 4, passage.id);
      const etapes = [
        [`« ${passage.titre} » placée entre « ${COLONNE_LIMITEE.titre} » et « ${arrivee.titre} », WIP ${passage.wip}`, COLONNES[rang - 1] === COLONNE_LIMITEE && COLONNES[rang + 1] === arrivee && passage.wip === 2],
        [`« ${COLONNE_LIMITEE.titre} » → « ${arrivee.titre} » refusé (passage interdit)`, !sauter.ok && /^Passage interdit/.test(sauter.erreur)],
        [`« ${passage.titre} » → « ${arrivee.titre} » accepté`, depuisLaRevue.ok && depuisLaRevue.tickets.find(ticket => ticket.id === 2).statut === arrivee.id],
        [`« ${passage.titre} » pleine (2/2) : 3e refusé, accepté s’il reste une place`, !revuePleine.ok && revuePleine.erreur === 'WIP atteint (2/2)' && avecUnePlace.ok]
      ];
      const etapeEchouee = etapes.find(([, valide]) => !valide);
      return etapeEchouee
        ? { reussi: false, detail: `Échec, attendu : ${etapeEchouee[0]}. Obtenu : ${sauter.ok ? 'saut accepté' : sauter.erreur}` }
        : { reussi: true, detail: `« ${sauter.erreur} » ; depuis « ${passage.titre} » : accepté ; « ${passage.titre} » pleine : « ${revuePleine.erreur} »` };
    } },

    { code: 'T11', groupe: 'po', nom: 'sauvegarde v2 sans « assigne » migrée en v3 ; « Annuler » rend l’état précédent', executer() {
      // Une sauvegarde écrite hier par la version 2 : pas de champ « assigne », un ticket déjà terminé
      const hier = JSON.stringify({ version: 2,
        tickets: [{ id: 1, titre: 'Ticket enregistré hier', type: 'bug', priorite: 1, points: 3, statut: 'termine', creeLe: '2026-11-02' }, { id: 2, titre: 'Autre ticket d’hier', type: 'story', priorite: 2, points: 5, statut: 'encours', creeLe: '2026-11-02' }],
        projets: [{ id: 1, nom: 'Hier', tickets: [1, 2], ordreManuel: null, notesImport: {} }], projetActif: 1,
        compteurs: { prochainTicket: 3, prochainProjet: 2, numerosAttribues: [1, 2] }, affichage: { vue: 'kanban', tri: triParDefaut(), filtres: { types: ['bug'] } } });
      const lu = charger(hier);
      const tickets = lu.donnees ? lu.donnees.projets[0].tickets : [];
      // Journal : un déplacement puis « Annuler » doit rendre exactement l’état d’avant
      const avant = { tickets: gelerEnProfondeur([ticketDeTest(1, COLONNE_BACKLOG.id, 3), ticketDeTest(2, COLONNE_SUIVANTE.id, 5)]), ordreManuel: [2, 1] };
      const deplace = deplacerTicket(avant.tickets, 1, COLONNE_SUIVANTE.id);
      const apres = { tickets: deplace.tickets, ordreManuel: [2, 1] };
      const journal = journaliser([], entreeDeJournal(avant, apres, 1, COLONNE_BACKLOG.id, COLONNE_SUIVANTE.id, '2026-11-03T10:00:00.000Z'));
      const annule = annulerDernierDeplacement({ ...apres, journal });
      const relu = charger(JSON.stringify(enveloppeDeSauvegarde({ projets: [{ id: 1, nom: 'P', ...apres, notesImport: {}, journal }], projetActifId: 1, prochainIdTicket: 3, prochainIdProjet: 2, numerosAttribues: new Set([1, 2]), vue: 'kanban', tri: triParDefaut(), filtres: filtresVides(), utilisateur: 'Camille' })));
      const projetRelu = relu.donnees && relu.donnees.projets[0];
      const annuleApresF5 = projetRelu ? annulerDernierDeplacement(projetRelu) : { ok: false };
      const identique = resultat => resultat.ok && resultat.exact && JSON.stringify(resultat.tickets) === JSON.stringify(avant.tickets.map(construireTicket)) && JSON.stringify(resultat.ordreManuel) === '[2,1]';
      const etapes = [
        ['sauvegarde v2 → migrée en v3, sans erreur', lu.origine === 'migration-v2' && tickets.length === 2],
        ['chaque ticket reçoit « assigne » = null (et « sprintId » = null, B1.7c) ; le ticket terminé reste « Terminé »', tickets.every(ticket => ticket.assigne === null && Object.keys(ticket).join(',') === 'id,titre,type,priorite,points,statut,creeLe,assigne,sprintId,bloquePar' && ticket.sprintId === null && Array.isArray(ticket.bloquePar) && ticket.bloquePar.length === 0) && tickets[0].statut === 'termine'],
        ['« Annuler » rend exactement l’état d’avant (tickets et ordre)', identique(annule) && annule.journal.length === 0],
        ['… y compris après rechargement (journal sauvegardé)', relu.origine === 'sauvegarde' && identique(annuleApresF5) && relu.donnees.utilisateur === 'Camille'],
        ['journal limité aux 10 derniers déplacements', Array.from({ length: 14 }).reduce(liste => journaliser(liste, { id: 1 }), []).length === JOURNAL_MAX],
        ['un changement de place (même colonne) s’annule aussi', (() => {
          const place = { tickets: apres.tickets, ordreManuel: [1, 2] };
          const r = annulerDernierDeplacement({ ...place, journal: journaliser([], entreeDeJournal(apres, place, 1, COLONNE_SUIVANTE.id, COLONNE_SUIVANTE.id, '2026-11-03T10:01:00.000Z')) });
          // … même si autre chose a changé depuis (ici, un titre) : seul l’ordre revient, le titre modifié reste
          const ensuite = { tickets: place.tickets.map(ticket => (ticket.id === 2 ? { ...ticket, titre: 'Titre modifié depuis' } : ticket)), ordreManuel: [1, 2] };
          const r2 = annulerDernierDeplacement({ ...ensuite, journal: journaliser([], entreeDeJournal(apres, place, 1, COLONNE_SUIVANTE.id, COLONNE_SUIVANTE.id, '2026-11-03T10:01:00.000Z')) });
          return r.ok && r.exact && JSON.stringify(r.ordreManuel) === '[2,1]'
            && r2.ok && !r2.exact && JSON.stringify(r2.ordreManuel) === '[2,1]' && r2.tickets.find(ticket => ticket.id === 2).titre === 'Titre modifié depuis';
        })()]
      ];
      const etapeEchouee = etapes.find(([, valide]) => !valide);
      return etapeEchouee
        ? { reussi: false, detail: `Échec, attendu : ${etapeEchouee[0]}. Obtenu : ${lu.origine} / ${relu.origine}` }
        : { reussi: true, detail: 'v2 → v3 : « assigne » = null, Terminé gardé ; Annuler = état d’avant, même après rechargement ; journal à 10 entrées' };
    } },

    { code: 'T12', groupe: 'po', nom: 'annuler n’importe lequel des 10 derniers déplacements', executer() {
      if (!COLONNE_LIMITEE) return { reussi: false, detail: 'Il faut une colonne limitée dans COLONNES' };
      const ici = COLONNES[COLONNES.indexOf(COLONNE_LIMITEE) - 1].id;           // « À faire »
      const limitee = COLONNE_LIMITEE.id;                                        // « En cours »
      const apres = COLONNES[COLONNES.indexOf(COLONNE_LIMITEE) + 1].id;          // « En revue »
      // Rejoue des déplacements en les notant au journal, comme l’application
      const rejouer = (depart, deplacements) => deplacements.reduce((projet, [id, vers]) => {
        const de = projet.tickets.find(ticket => ticket.id === id).statut;
        const essai = deplacerTicket(projet.tickets, id, vers);
        const suivant = { tickets: essai.tickets, ordreManuel: projet.ordreManuel };
        return { ...suivant, journal: journaliser(projet.journal, entreeDeJournal(projet, suivant, id, de, vers, '2026-11-03T10:00:00.000Z')) };
      }, { tickets: gelerEnProfondeur(depart), ordreManuel: null, journal: [] });
      const statutDe = (projet, id) => projet.tickets.find(ticket => ticket.id === id).statut;
      // 1 · Annuler le plus ancien de deux déplacements : seul ce ticket revient, l’autre reste
      const p1 = rejouer([ticketDeTest(1, ici, 3), ticketDeTest(2, ici, 5)], [[1, limitee], [2, limitee]]);
      const r1 = annulerDeplacement(p1, 1);
      // 2 · Le même ticket a bougé depuis : ses déplacements plus récents sont annulés avec
      const p2 = rejouer([ticketDeTest(1, ici, 3), ticketDeTest(2, ici, 5)], [[1, limitee], [2, limitee], [1, apres]]);
      const r2 = annulerDeplacement(p2, 2);
      // 3 · La colonne d’origine s’est remplie depuis : refus, rien ne change
      const plein = Array.from({ length: COLONNE_LIMITEE.wip - 1 }, (_, rang) => ticketDeTest(10 + rang, limitee, 1));
      const p3 = rejouer([ticketDeTest(1, limitee, 3), ticketDeTest(2, ici, 5), ...plein], [[1, ici], [2, limitee]]);
      const r3 = annulerDeplacement(p3, 1);
      // 4 · Un ticket sorti de « Terminé » par erreur y revient : c’est une restauration, pas un passage
      const arrivee = COLONNES.find(colonne => colonne.depuis);
      const p4 = arrivee ? rejouer([ticketDeTest(1, arrivee.id, 3), ticketDeTest(2, ici, 5)], [[1, ici], [2, limitee]]) : null;
      const r4 = p4 ? annulerDeplacement(p4, 1) : { ok: true, tickets: [{ id: 1, statut: '' }] };
      const etapes = [
        ['annuler le 2e plus récent : seul ce ticket revient, l’autre reste déplacé',
          r1.ok && !r1.exact && statutDe(r1, 1) === ici && statutDe(r1, 2) === limitee && r1.journal.length === 1 && r1.journal[0].id === 2],
        ['même ticket déplacé depuis : ses 2 déplacements annulés ensemble, retour à la colonne d’alors',
          r2.ok && r2.annules.length === 2 && statutDe(r2, 1) === ici && statutDe(r2, 2) === limitee && r2.journal.length === 1],
        [`colonne d’origine pleine depuis (WIP ${COLONNE_LIMITEE.wip}/${COLONNE_LIMITEE.wip}) : annulation refusée, rien ne change`,
          !r3.ok && /WIP atteint/.test(r3.erreur) && statutDe(p3, 1) === ici && p3.journal.length === 2],
        ['le ticket retrouve sa place d’avant dans l’ordre personnalisé', JSON.stringify(replacerDansLOrdre([2, 3, 1, 4], 1, [2, 1, 3, 4])) === '[2,1,3,4]'],
        ['sorti de « Terminé » par erreur : l’annulation l’y remet (restauration)', !arrivee || (r4.ok && statutDe(r4, 1) === arrivee.id && statutDe(r4, 2) === limitee)]
      ];
      const etapeEchouee = etapes.find(([, valide]) => !valide);
      return etapeEchouee
        ? { reussi: false, detail: `Échec, attendu : ${etapeEchouee[0]}. Obtenu : ${[r1, r2, r3].map(r => (r.ok ? 'ok' : r.erreur)).join(' / ')}` }
        : { reussi: true, detail: `Ancien déplacement annulé seul ; même ticket : ${r2.annules.length} annulés ensemble ; colonne pleine : « ${r3.erreur} » ; place d’avant retrouvée` };
    } },

    /* ---------- Audit des cas limites (Testeur-QA) ----------
       Résultats attendus tirés de docs/regles-metier.md et docs/import-export.md. */

    // docs/regles-metier.md : « Liste invalide → Liste de tickets invalide » ; une erreur est renvoyée, jamais levée
    { code: 'T13', groupe: 'audit', nom: 'Audit · deplacerTicket : un élément vide dans la liste → « Liste de tickets invalide », sans planter', executer() {
      const essayer = (depart, vers) => { try { return deplacerTicket(depart, 1, vers); } catch (erreur) { return { exception: erreur.message }; } };
      const versColonneLibre = essayer(gelerEnProfondeur([null, ticketDeTest(1, COLONNE_BACKLOG.id, 3)]), COLONNE_SUIVANTE.id);
      const versColonneLimitee = COLONNE_LIMITEE ? essayer(gelerEnProfondeur([ticketDeTest(1, COLONNE_SUIVANTE.id, 3), null]), COLONNE_LIMITEE.id) : versColonneLibre;
      const etapes = [
        [`vers « ${COLONNE_SUIVANTE.titre} » (sans limite) : refus « Liste de tickets invalide », sans exception`, versColonneLibre.ok === false && versColonneLibre.erreur === 'Liste de tickets invalide'],
        [`vers « ${COLONNE_LIMITEE ? COLONNE_LIMITEE.titre : ''} » (limite WIP) : refus « Liste de tickets invalide », sans exception`, versColonneLimitee.ok === false && versColonneLimitee.erreur === 'Liste de tickets invalide']
      ];
      const etapeEchouee = etapes.find(([, valide]) => !valide);
      return etapeEchouee
        ? { reussi: false, detail: `Échec, attendu : ${etapeEchouee[0]}. Obtenu : ${JSON.stringify({ versColonneLibre, versColonneLimitee })}` }
        : { reussi: true, detail: `Liste [null, ticket] : « ${versColonneLibre.erreur} », vers une colonne libre comme vers une colonne limitée` };
    } },

    // docs/regles-metier.md : « Déjà dans la colonne → accepté, copie du tableau » (contrôlé avant R1)
    { code: 'T14', groupe: 'audit', nom: COLONNE_LIMITEE ? `Audit · deplacerTicket : rester dans « ${COLONNE_LIMITEE.titre} » pleine (${LIMITE_WIP}/${LIMITE_WIP}) est accepté` : 'Audit · rester dans sa colonne', executer() {
      if (!COLONNE_LIMITEE) return { reussi: false, detail: 'Il faut une colonne limitée dans COLONNES' };
      const depart = gelerEnProfondeur(Array.from({ length: LIMITE_WIP }, (_, rang) => ticketDeTest(1 + rang, COLONNE_LIMITEE.id, 2)));
      const resultat = deplacerTicket(depart, 1, COLONNE_LIMITEE.id);
      const reussi = resultat.ok === true && resultat.tickets !== depart && resultat.tickets.length === LIMITE_WIP
        && resultat.tickets.every(ticket => ticket.statut === COLONNE_LIMITEE.id) && estPleineSelonLesStats(resultat.tickets) === true;
      return { reussi, detail: reussi ? `Colonne à ${LIMITE_WIP}/${LIMITE_WIP} : le ticket #1 y reste, ok: true, nouveau tableau (pas de « WIP atteint »)` : `Échec, attendu : ok: true et un nouveau tableau. Obtenu : ${JSON.stringify(resultat)}` };
    } },

    // docs/import-export.md : « Colonne pleine (R1) → colonne précédente », chaque correction expliquée.
    // T7 couvre une colonne déjà pleine AVANT l’import ; ici, c’est le fichier lui-même qui la remplit.
    { code: 'T15', groupe: 'audit', nom: 'Audit · importerTickets : la colonne limitée remplie par le fichier lui-même → le surplus va dans la colonne précédente', executer() {
      if (!COLONNE_LIMITEE) return { reussi: false, detail: 'Il faut une colonne limitée dans COLONNES' };
      const precedente = COLONNES[COLONNES.indexOf(COLONNE_LIMITEE) - 1];
      const existants = gelerEnProfondeur([ticketDeTest(1, COLONNE_LIMITEE.id, 2)]);          // 1 place prise sur LIMITE_WIP
      const nombreDeLignes = LIMITE_WIP + 1;                                                // de quoi déborder de 2
      const fichier = ['titre,points,statut', ...Array.from({ length: nombreDeLignes }, (_, rang) => `Ticket importé ${rang + 1},3,${COLONNE_LIMITEE.id}`)].join('\n');
      const rapport = importerTickets(gelerEnProfondeur(parserCSV(fichier)), existants, { dateDuJour: '2026-11-03' });
      const dansLaLimitee = rapport.importes.filter(ticket => ticket.statut === COLONNE_LIMITEE.id);
      const deplaces = rapport.importes.filter(ticket => ticket.statut === precedente.id);
      const placesLibres = LIMITE_WIP - 1;
      const corrections = rapport.ajustements.flatMap(ligne => ligne.details.filter(detail => detail.nature === 'correction').map(detail => detail.texte));
      const etapes = [
        [`bilan « ${nombreDeLignes} importés · 0 rejeté »`, rapport.bilan === `${nombreDeLignes} importés · 0 rejeté` && !rapport.rejets.length],
        [`${placesLibres} tickets entrent dans « ${COLONNE_LIMITEE.titre} » (jusqu’à ${LIMITE_WIP}/${LIMITE_WIP})`, dansLaLimitee.length === placesLibres],
        [`les ${nombreDeLignes - placesLibres} suivants vont dans « ${precedente.titre} »`, deplaces.length === nombreDeLignes - placesLibres],
        ['chaque ticket déplacé a une correction « WIP atteint … » expliquée', corrections.filter(texte => /^WIP atteint/.test(texte)).length === nombreDeLignes - placesLibres],
        ['le ticket existant reste intact', existants.length === 1 && existants[0].statut === COLONNE_LIMITEE.id]
      ];
      const etapeEchouee = etapes.find(([, valide]) => !valide);
      return etapeEchouee
        ? { reussi: false, detail: `Échec, attendu : ${etapeEchouee[0]}. Obtenu : « ${rapport.bilan} » ; ${JSON.stringify(rapport.importes.map(ticket => [ticket.titre, ticket.statut]))}` }
        : { reussi: true, detail: `« ${rapport.bilan} » ; ${placesLibres} dans « ${COLONNE_LIMITEE.titre} », ${deplaces.length} dans « ${precedente.titre} » avec « ${corrections.find(texte => /^WIP/.test(texte))} »` };
    } },

    /* ---------- B1 · Sprints et burndown (docs/spec.md) ---------- */

    { code: 'T16', groupe: 'b1', nom: 'B1.1 · créer un sprint : nom, dates, durée de 1 à 31 jours, capacité de 1 à 999', executer() {
      const manquantes = absentes({ creerSprint });
      if (manquantes.length) return testAbsent(manquantes);
      const vide = gelerEnProfondeur([]);
      const donnees = { nom: 'Sprint 1', debut: '2026-11-02', fin: '2026-11-13', capacite: 20 };
      const cree = creerSprint(vide, donnees);
      const attendu = { id: 1, nom: 'Sprint 1', debut: '2026-11-02', fin: '2026-11-13', capacite: 20, statut: 'ouvert', releves: {}, bilan: null, clotureLe: null };
      const suivant = creerSprint(gelerEnProfondeur([sprintDeTest(1, 10), sprintDeTest(4, 10)]), donnees);
      const avec = changements => creerSprint(vide, { ...donnees, ...changements });
      const erreur = (changements, champ) => { const resultat = avec(changements); return resultat.ok === false && resultat.erreurs ? resultat.erreurs[champ] : 'accepté'; };
      const accepte = changements => avec(changements).ok === true;
      const MSG_NOM = 'Le nom du sprint fait de 3 à 40 caractères.';
      const MSG_CAPACITE = 'La capacité est un nombre entier de points, de 1 à 999.';
      return bilanDesEtapes([
        ['B1.1a : sprint créé avec exactement les champs attendus, tableau reçu intact', cree.ok === true && jsonTrie(cree.sprint) === jsonTrie(attendu) && Array.isArray(cree.sprints) && cree.sprints.length === 1 && cree.sprints[0] === cree.sprint && vide.length === 0],
        ['B1.1a : espaces autour du nom retirés', accepte({ nom: '  Sprint 1  ' }) && avec({ nom: '  Sprint 1  ' }).sprint.nom === 'Sprint 1'],
        ['B1.1b : id = plus grand id + 1 (sprints 1 et 4 → 5)', suivant.ok === true && suivant.sprint.id === 5 && suivant.sprints.length === 3],
        ['B1.1c : nom de 2 caractères, de 41 caractères, ou « ab » entouré d’espaces → erreur nom', erreur({ nom: 'S1' }, 'nom') === MSG_NOM && erreur({ nom: 'x'.repeat(41) }, 'nom') === MSG_NOM && erreur({ nom: '   ab   ' }, 'nom') === MSG_NOM],
        ['B1.1c : 3 et 40 caractères acceptés', accepte({ nom: 'abc' }) && accepte({ nom: 'x'.repeat(40) })],
        ['B1.1d : début invalide (2026-02-30) → erreur debut', erreur({ debut: '2026-02-30' }, 'debut') === 'La date de début doit être au format AAAA-MM-JJ.'],
        ['B1.1d : fin vide → erreur fin', erreur({ fin: '' }, 'fin') === 'La date de fin doit être au format AAAA-MM-JJ.'],
        ['B1.1e : fin avant début → erreur fin', erreur({ debut: '2026-11-02', fin: '2026-11-01' }, 'fin') === 'La fin ne peut pas précéder le début.'],
        ['B1.1f : 32 jours refusé, 31 jours accepté', erreur({ debut: '2026-11-01', fin: '2026-12-02' }, 'fin') === 'Un sprint dure au plus 31 jours.' && accepte({ debut: '2026-11-01', fin: '2026-12-01' })],
        ['B1.1g : capacité 0, 1000, 2.5, « abc » → erreur capacite', [0, 1000, 2.5, 'abc'].every(capacite => erreur({ capacite }, 'capacite') === MSG_CAPACITE)],
        ['B1.1g : capacité 1 et 999 acceptées', accepte({ capacite: 1 }) && accepte({ capacite: 999 })],
        ['B1.1h : sprint d’un seul jour (début = fin) accepté', accepte({ debut: '2026-11-04', fin: '2026-11-04' })]
      ], () => JSON.stringify({ cree, nomCourt: avec({ nom: 'S1' }), capacite0: avec({ capacite: 0 }) }), 'Création conforme ; nom 3–40, dates valides, fin ≥ début, 1 à 31 jours, capacité 1–999 ; sprint d’un jour accepté');
    } },

    { code: 'T17', groupe: 'b1', nom: 'B1.1 · nombre de jours : bornes incluses, changement d’heure et année bissextile', executer() {
      const manquantes = absentes({ nombreDeJours });
      if (manquantes.length) return testAbsent(manquantes);
      const cas = [['2026-11-04', '2026-11-04', 1, 'B1.1i : un seul jour'], ['2026-03-27', '2026-03-31', 5, 'B1.1j : passage à l’heure d’été'],
        ['2026-10-23', '2026-10-27', 5, 'B1.1k : retour à l’heure d’hiver'], ['2028-02-27', '2028-03-01', 4, 'B1.1l : année bissextile']];
      const obtenus = cas.map(([debut, fin]) => essayer(() => nombreDeJours(debut, fin)));
      return bilanDesEtapes(cas.map(([debut, fin, attendu, libelle], rang) => [`${libelle} (${debut} → ${fin}) = ${attendu}`, obtenus[rang] === attendu]),
        () => JSON.stringify(obtenus), 'Un jour = 1 ; 5 jours malgré le changement d’heure (mars et octobre) ; 4 jours autour du 29 février');
    } },

    { code: 'T18', groupe: 'b1', nom: 'B1.2 et B1.3 · mettre un ticket dans un sprint : capacité atteinte pile, dépassée, non estimé, terminé', executer() {
      const manquantes = absentes({ ajouterAuSprint });
      if (manquantes.length) return testAbsent(manquantes);
      const sprints = gelerEnProfondeur([sprintDeTest(1, 20)]);
      const depart = gelerEnProfondeur([ticketDeTest(1, COLONNES[1].id, 5, 1), ticketDeTest(2, COLONNES[2].id, 5, 1), ticketDeTest(3, COLONNE_BACKLOG.id, 5, 1),
        ticketDeTest(4, COLONNE_BACKLOG.id, 5), ticketDeTest(5, COLONNE_BACKLOG.id, 8), ticketDeTest(6, COLONNE_BACKLOG.id, 1),
        ticketDeTest(7, COLONNE_BACKLOG.id, null), ticketDeTest(8, DERNIERE.id, 3)]);                // sprint 1 : 15/20
      const copieAvant = JSON.stringify(depart);
      const pile = ajouterAuSprint(depart, sprints, 4, 1);
      const deTrop = ajouterAuSprint(depart, sprints, 5, 1);
      const surPlein = pile.ok ? ajouterAuSprint(pile.tickets, sprints, 6, 1) : { erreur: 'étape précédente refusée' };
      const nonEstime = ajouterAuSprint(depart, sprints, 7, 1);
      const termine = ajouterAuSprint(depart, sprints, 8, 1);
      return bilanDesEtapes([
        ['B1.2a : 15/20 + 5 points → accepté (20/20, capacité atteinte pile)', pile.ok === true && ticketParId(pile.tickets, 4).sprintId === 1 && pile.tickets.length === depart.length],
        ['B1.2a : seul le sprintId du ticket ajouté change, nouveau tableau, tableau reçu intact',
          pile.ok === true && pile.tickets !== depart && JSON.stringify(depart) === copieAvant
          && JSON.stringify({ ...ticketParId(pile.tickets, 4), sprintId: null }) === JSON.stringify(ticketParId(depart, 4))
          && depart.filter(ticket => ticket.id !== 4).every(ticket => JSON.stringify(ticketParId(pile.tickets, ticket.id)) === JSON.stringify(ticket))],
        ['B1.2b : 15/20 + 8 points → « Capacité dépassée (23/20 points) »', deTrop.ok === false && deTrop.erreur === 'Capacité dépassée (23/20 points)'],
        ['B1.2c : sprint plein 20/20 + 1 point → « Capacité dépassée (21/20 points) »', surPlein.ok === false && surPlein.erreur === 'Capacité dépassée (21/20 points)'],
        ['B1.3a : ticket #7 non estimé → refus Definition of Ready', nonEstime.ok === false && nonEstime.erreur === `Definition of Ready${NBSP}: le ticket #7 n’est pas estimé`],
        ['B1.3b : ticket #8 terminé → « Le ticket #8 est déjà terminé »', termine.ok === false && termine.erreur === 'Le ticket #8 est déjà terminé']
      ], () => JSON.stringify({ pile: pile.ok || pile.erreur, deTrop, surPlein, nonEstime, termine }), `Pile 20/20 accepté ; « ${deTrop.erreur} » ; « ${surPlein.erreur} » ; non estimé et terminé refusés`);
    } },

    { code: 'T19', groupe: 'b1', nom: 'B1.2 et B1.3 · sprint clôturé, introuvable, ajout en double, changement de sprint, terminés comptés, liste abîmée', executer() {
      const manquantes = absentes({ ajouterAuSprint });
      if (manquantes.length) return testAbsent(manquantes);
      const sprints = gelerEnProfondeur([sprintDeTest(1, 20), sprintDeTest(2, 20, { statut: 'cloture', bilan: { engage: 3, termine: 3, restant: 0 }, clotureLe: '2026-11-01' }),
        sprintDeTest(3, 10), sprintDeTest(4, 13)]);
      const depart = gelerEnProfondeur([ticketDeTest(1, COLONNES[1].id, 5, 1), ticketDeTest(2, COLONNES[2].id, 5, 1), ticketDeTest(3, COLONNE_BACKLOG.id, 10, 1),   // sprint 1 : 20/20
        ticketDeTest(4, COLONNE_BACKLOG.id, 5), ticketDeTest(5, COLONNE_BACKLOG.id, 8), ticketDeTest(9, COLONNE_BACKLOG.id, 3, 2),
        ticketDeTest(10, DERNIERE.id, 8, 4)]);                                                                                                        // sprint 4 : 8/13 (terminé)
      const cloture = ajouterAuSprint(depart, sprints, 4, 2);
      const ticketInconnu = ajouterAuSprint(depart, sprints, 99, 1);
      const sprintInconnu = ajouterAuSprint(depart, sprints, 4, 99);
      const doublon = ajouterAuSprint(depart, sprints, 1, 1);
      const changement = ajouterAuSprint(depart, sprints, 1, 3);
      const apresChangement = changement.ok ? ajouterAuSprint(changement.tickets, sprints, 4, 1) : { erreur: 'changement refusé' };   // A a libéré 5 points
      const depuisCloture = ajouterAuSprint(depart, sprints, 9, 3);
      const terminesComptes = ajouterAuSprint(depart, sprints, 5, 4);
      const listeAbimee = essayer(() => ajouterAuSprint(gelerEnProfondeur([null, ticketDeTest(4, COLONNE_BACKLOG.id, 5)]), sprints, 4, 1));
      return bilanDesEtapes([
        ['B1.3c : sprint clôturé → refus « Sprint clôturé : on ne peut plus le modifier »', cloture.ok === false && cloture.erreur === `Sprint clôturé${NBSP}: on ne peut plus le modifier`],
        ['B1.3d : ticket 99 → « Ticket introuvable (id 99) »', ticketInconnu.ok === false && ticketInconnu.erreur === 'Ticket introuvable (id 99)'],
        ['B1.3d : sprint 99 → « Sprint introuvable (id 99) »', sprintInconnu.ok === false && sprintInconnu.erreur === 'Sprint introuvable (id 99)'],
        ['B1.2d : ticket déjà dans ce sprint plein → accepté, rien ne change', doublon.ok === true && JSON.stringify(doublon.tickets) === JSON.stringify(depart) && doublon.tickets !== depart],
        ['B1.2e : changer de sprint ouvert → accepté, le ticket quitte A', changement.ok === true && ticketParId(changement.tickets, 1).sprintId === 3],
        ['B1.2e : A a libéré 5 points (15/20 + 5 → accepté)', apresChangement.ok === true],
        ['B1.2f : ticket d’un sprint clôturé → considéré hors sprint, accepté', depuisCloture.ok === true && ticketParId(depuisCloture.tickets, 9).sprintId === 3],
        ['B1.2g : les tickets terminés comptent (8 + 8 > 13) → « Capacité dépassée (16/13 points) »', terminesComptes.ok === false && terminesComptes.erreur === 'Capacité dépassée (16/13 points)'],
        ['B1.3e : liste avec un élément vide → « Liste de tickets invalide », sans exception', listeAbimee.ok === false && listeAbimee.erreur === 'Liste de tickets invalide']
      ], () => JSON.stringify({ cloture, ticketInconnu, sprintInconnu, doublon: doublon.ok || doublon.erreur, changement: changement.ok || changement.erreur, apresChangement: apresChangement.ok || apresChangement.erreur, depuisCloture: depuisCloture.ok || depuisCloture.erreur, terminesComptes, listeAbimee }),
      `Clôturé, introuvables, liste abîmée : refus clairs ; doublon sans effet ; changement de sprint ; « ${terminesComptes.erreur} »`);
    } },

    { code: 'T20', groupe: 'b1', nom: 'B1.3 · sortir un ticket d’un sprint ouvert', executer() {
      const manquantes = absentes({ retirerDuSprint });
      if (manquantes.length) return testAbsent(manquantes);
      const sprints = gelerEnProfondeur([sprintDeTest(1, 20), sprintDeTest(2, 20, { statut: 'cloture', bilan: { engage: 3, termine: 3, restant: 0 }, clotureLe: '2026-11-01' })]);
      const depart = gelerEnProfondeur([ticketDeTest(1, COLONNES[1].id, 5, 1), ticketDeTest(2, COLONNES[2].id, 3, 1), ticketDeTest(4, COLONNE_BACKLOG.id, 5), ticketDeTest(9, DERNIERE.id, 3, 2)]);
      const retire = retirerDuSprint(depart, sprints, 1);
      const horsSprint = retirerDuSprint(depart, sprints, 4);
      const sprintClos = retirerDuSprint(depart, sprints, 9);
      return bilanDesEtapes([
        ['B1.3f : retiré → sprintId null, les autres tickets intacts, tableau reçu intact', retire.ok === true && ticketParId(retire.tickets, 1).sprintId === null && depart[0].sprintId === 1
          && depart.filter(ticket => ticket.id !== 1).every(ticket => JSON.stringify(ticketParId(retire.tickets, ticket.id)) === JSON.stringify(ticket))],
        ['B1.3g : ticket #4 hors sprint → « Le ticket #4 n’est dans aucun sprint ouvert »', horsSprint.ok === false && horsSprint.erreur === 'Le ticket #4 n’est dans aucun sprint ouvert'],
        ['B1.3g : ticket #9 d’un sprint clôturé → « Le ticket #9 n’est dans aucun sprint ouvert »', sprintClos.ok === false && sprintClos.erreur === 'Le ticket #9 n’est dans aucun sprint ouvert']
      ], () => JSON.stringify({ retire: retire.ok || retire.erreur, horsSprint, sprintClos }), 'Retiré du sprint ouvert ; refus pour un ticket hors sprint ou d’un sprint clôturé');
    } },

    { code: 'T21', groupe: 'b1', nom: 'B1.4 · modifier les points d’un ticket de sprint : pile accepté, dépassement et « non estimé » refusés', executer() {
      const sprints = gelerEnProfondeur([sprintDeTest(1, 20)]);
      const depart = gelerEnProfondeur([ticketDeTest(1, COLONNES[1].id, 3, 1), ticketDeTest(2, COLONNES[2].id, 5, 1), ticketDeTest(3, COLONNE_BACKLOG.id, 10, 1)]);   // 18/20
      const modifier = (id, changements, avecSprints = true) => essayer(() => (avecSprints ? modifierTicket(depart, id, changements, sprints) : modifierTicket(depart, id, changements)));
      const pile = modifier(1, { points: 5 });
      const deTrop = modifier(1, { points: 8 });
      const nonEstime = modifier(3, { points: null });
      const sprintForce = modifier(1, { sprintId: 99, titre: 'Titre modifié' });
      const sansSprints = modifier(1, { points: 8 }, false);
      // B1.4e : sprint déjà au-delà de sa capacité (13/10, ancienne sauvegarde) : seule une hausse des points est contrôlée
      const sprintsDepasses = gelerEnProfondeur([sprintDeTest(1, 10)]);
      const departDepasse = gelerEnProfondeur([ticketDeTest(1, COLONNES[1].id, 8, 1), ticketDeTest(2, COLONNES[1].id, 5, 1)]);
      const modifierDepasse = (id, changements) => essayer(() => modifierTicket(departDepasse, id, changements, sprintsDepasses));
      const titreDepasse = modifierDepasse(1, { titre: 'Titre corrigé' });
      const baisseDepasse = modifierDepasse(2, { points: 3 });
      const hausseDepasse = modifierDepasse(2, { points: 8 });
      return bilanDesEtapes([
        ['B1.4a : 3 → 5 points (18/20 → 20/20) accepté', pile.ok === true && pile.ticket.points === 5],
        ['B1.4b : 3 → 8 points → erreur « Capacité dépassée (23/20 points) dans le sprint « Sprint 1 ». »', deTrop.ok === false && !!deTrop.erreurs
          && /^Capacité dépassée \(23\/20 points\) dans le sprint «\s?Sprint 1\s?»\.$/.test(deTrop.erreurs.points || '')],
        ['B1.4c : ticket de sprint (colonne Backlog) → non estimé refusé', nonEstime.ok === false && !!nonEstime.erreurs && nonEstime.erreurs.points === `Definition of Ready${NBSP}: un ticket d’un sprint doit rester estimé.`],
        ['B1.4d : changements.sprintId ignoré (le titre change, le sprint non)', sprintForce.ok === true && sprintForce.ticket.sprintId === 1 && sprintForce.ticket.titre === 'Titre modifié'],
        ['sans 4e paramètre : comportement d’avant (aucun contrôle de sprint)', sansSprints.ok === true && sansSprints.ticket.points === 8],
        ['B1.4e : sprint déjà à 13/10 → modifier un titre ou baisser des points reste possible', titreDepasse.ok === true && titreDepasse.ticket.titre === 'Titre corrigé'
          && baisseDepasse.ok === true && baisseDepasse.ticket.points === 3],
        ['B1.4e : … mais une hausse des points reste refusée (13/10 → 16/10)', hausseDepasse.ok === false && /^Capacité dépassée \(16\/10 points\)/.test((hausseDepasse.erreurs && hausseDepasse.erreurs.points) || '')]
      ], () => JSON.stringify({ pile: pile.ok || pile.erreurs || pile.exception, deTrop: deTrop.erreurs || deTrop.ok, nonEstime: nonEstime.erreurs || nonEstime.ok, sprintForce: sprintForce.ticket || sprintForce.erreurs,
        titreDepasse: titreDepasse.ok || titreDepasse.erreurs, baisseDepasse: baisseDepasse.ok || baisseDepasse.erreurs, hausseDepasse: hausseDepasse.ok || hausseDepasse.erreurs }),
      'Pile 20/20 accepté ; 23/20 refusé ; non estimé refusé ; sprintId non modifiable ici ; sprint déjà dépassé : seule une hausse est refusée');
    } },

    { code: 'T22', groupe: 'b1', nom: 'B1.5 · clôturer : le non-terminé revient au Backlog, bilan figé, dernier relevé', executer() {
      const manquantes = absentes({ cloturerSprint });
      if (manquantes.length) return testAbsent(manquantes);
      const sprints = gelerEnProfondeur([sprintDeTest(1, 20), sprintDeTest(2, 10)]);
      const depart = gelerEnProfondeur([ticketDeTest(1, DERNIERE.id, 5, 1), ticketDeTest(2, DERNIERE.id, 3, 1), ticketDeTest(3, COLONNES[1].id, 2, 1), ticketDeTest(4, COLONNES[2].id, 3, 1),
        ticketDeTest(5, COLONNE_BACKLOG.id, null), ticketDeTest(6, COLONNES[1].id, 1, 2)]);                                       // sprint 1 : 13 engagés, 8 terminés, 5 restants
      const copies = JSON.stringify({ depart, sprints });
      const clos = cloturerSprint(depart, sprints, 1, '2026-11-13');
      const sprint = clos.ok ? clos.sprints.find(element => element.id === 1) : null;
      const deuxFois = clos.ok ? cloturerSprint(clos.tickets, clos.sprints, 1, '2026-11-14') : { erreur: 'première clôture refusée' };
      const apresLaFin = cloturerSprint(depart, sprints, 1, '2026-11-20');
      const avantLeDebut = cloturerSprint(depart, sprints, 1, '2026-11-01');
      const sprintDe = resultat => (resultat.ok ? resultat.sprints.find(element => element.id === 1) : { releves: null });
      return bilanDesEtapes([
        ['B1.5a : #3 et #4 non terminés → colonne Backlog, sprintId null', clos.ok === true && [3, 4].every(id => ticketParId(clos.tickets, id).statut === COLONNE_BACKLOG.id && ticketParId(clos.tickets, id).sprintId === null)],
        ['B1.5a : #1 et #2 terminés gardent leur colonne et leur sprintId', clos.ok === true && [1, 2].every(id => ticketParId(clos.tickets, id).statut === DERNIERE.id && ticketParId(clos.tickets, id).sprintId === 1)],
        ['B1.5a : retournes = [3, 4]', clos.ok === true && JSON.stringify([...clos.retournes].sort((a, b) => a - b)) === '[3,4]'],
        ['B1.5b : sprint clôturé le 2026-11-13, bilan { engage: 13, termine: 8, restant: 5 }', !!sprint && sprint.statut === 'cloture' && sprint.clotureLe === '2026-11-13'
          && jsonTrie(sprint.bilan) === jsonTrie({ engage: 13, termine: 8, restant: 5 })],
        ['B1.5c : tickets #5 et #6 et sprint 2 intacts ; tableaux reçus intacts', clos.ok === true && JSON.stringify(ticketParId(clos.tickets, 5)) === JSON.stringify(depart[4])
          && JSON.stringify(ticketParId(clos.tickets, 6)) === JSON.stringify(depart[5]) && JSON.stringify(clos.sprints.find(element => element.id === 2)) === JSON.stringify(sprints[1])
          && JSON.stringify({ depart, sprints }) === copies],
        ['B1.5d : clôturer deux fois → « Sprint clôturé : on ne peut plus le modifier »', deuxFois.ok === false && deuxFois.erreur === `Sprint clôturé${NBSP}: on ne peut plus le modifier`],
        ['B1.5e : relevé final des restants (5) à la date de clôture', !!sprint && !!sprint.releves && sprint.releves['2026-11-13'] === 5],
        ['B1.5e : clôturé après la fin → relevé à la date de fin (2026-11-13)', !!sprintDe(apresLaFin).releves && sprintDe(apresLaFin).releves['2026-11-13'] === 5 && !('2026-11-20' in sprintDe(apresLaFin).releves)],
        ['B1.5e : clôturé avant son début → aucun relevé', !!sprintDe(avantLeDebut).releves && Object.keys(sprintDe(avantLeDebut).releves).length === 0]
      ], () => JSON.stringify({ clos: clos.ok ? { tickets: clos.tickets.map(ticket => [ticket.id, ticket.statut, ticket.sprintId]), sprint, retournes: clos.retournes } : clos, deuxFois }),
      `2 tickets remis au Backlog ; bilan 13 engagés · 8 terminés · 5 restants ; relevé final ; double clôture refusée`);
    } },

    { code: 'T23', groupe: 'b1', nom: 'B1.6 · ligne idéale : 5 jours, sprint d’un seul jour (pas de division par zéro), arrondi, 0 point', executer() {
      const manquantes = absentes({ calculerBurndown });
      if (manquantes.length) return testAbsent(manquantes);
      const finies = valeurs => Array.isArray(valeurs) && valeurs.every(valeur => valeur === null || (typeof valeur === 'number' && Number.isFinite(valeur)));
      const cinqJours = gelerEnProfondeur(sprintDeTest(1, 20, { debut: '2026-11-02', fin: '2026-11-06' }));
      const unJour = gelerEnProfondeur(sprintDeTest(1, 20, { debut: '2026-11-04', fin: '2026-11-04' }));
      const troisJours = gelerEnProfondeur(sprintDeTest(1, 20, { debut: '2026-11-02', fin: '2026-11-04' }));
      const dix = gelerEnProfondeur([ticketDeTest(1, COLONNES[1].id, 5, 1), ticketDeTest(2, COLONNES[1].id, 5, 1)]);
      const huit = gelerEnProfondeur([ticketDeTest(1, COLONNES[1].id, 8, 1)]);
      const a = essayer(() => calculerBurndown(cinqJours, dix, '2026-11-02'));
      const b = essayer(() => calculerBurndown(unJour, huit, '2026-11-04'));
      const c = essayer(() => calculerBurndown(troisJours, dix, '2026-11-02'));
      const d = essayer(() => calculerBurndown(cinqJours, gelerEnProfondeur([ticketDeTest(1, COLONNES[1].id, 5)]), '2026-11-04'));   // aucun ticket dans le sprint
      return bilanDesEtapes([
        ['B1.6a : 5 jours, 10 points → ideal [10, 8, 6, 4, 2, 0], 5 dates', JSON.stringify(a.ideal) === '[10,8,6,4,2,0]' && a.engage === 10
          && JSON.stringify(a.jours) === '["2026-11-02","2026-11-03","2026-11-04","2026-11-05","2026-11-06"]'],
        ['B1.6b : sprint d’un seul jour, 8 points → ideal [8, 0], aucun NaN ni Infinity', JSON.stringify(b.ideal) === '[8,0]' && finies(b.ideal) && finies(b.restant) && Array.isArray(b.jours) && b.jours.length === 1],
        ['B1.6c : 3 jours, 10 points → ideal [10, 6.67, 3.33, 0]', JSON.stringify(c.ideal) === '[10,6.67,3.33,0]'],
        ['B1.6d : 0 point engagé → que des 0 (et null pour le futur), aucun NaN', d.engage === 0 && finies(d.ideal) && finies(d.restant)
          && d.ideal.every(valeur => valeur === 0) && d.restant.every(valeur => valeur === 0 || valeur === null)]
      ], () => JSON.stringify({ a, b, c, d }), 'Idéal [10…0] ; un jour : [8, 0] ; 6.67 / 3.33 ; 0 point : que des 0 ; jamais NaN');
    } },

    { code: 'T24', groupe: 'b1', nom: 'B1.6 · restants : relevés, aujourd’hui en direct, jours sans relevé, futur, sprint clôturé', executer() {
      const manquantes = absentes({ calculerBurndown });
      if (manquantes.length) return testAbsent(manquantes);
      const tickets = gelerEnProfondeur([ticketDeTest(1, DERNIERE.id, 3, 1), ticketDeTest(2, DERNIERE.id, 3, 1), ticketDeTest(3, COLONNES[1].id, 4, 1)]);   // 10 engagés, 4 restants
      const sprint = releves => gelerEnProfondeur(sprintDeTest(1, 20, { debut: '2026-11-02', fin: '2026-11-06', releves }));
      const e = essayer(() => calculerBurndown(sprint({ '2026-11-02': 10, '2026-11-03': 7 }), tickets, '2026-11-04'));
      const f1 = essayer(() => calculerBurndown(sprint({ '2026-11-02': 9 }), tickets, '2026-11-05'));
      const f2 = essayer(() => calculerBurndown(sprint({}), tickets, '2026-11-04'));
      const g = essayer(() => calculerBurndown(sprint({}), tickets, '2026-11-01'));
      const clos = gelerEnProfondeur(sprintDeTest(1, 20, { debut: '2026-11-02', fin: '2026-11-06', statut: 'cloture', clotureLe: '2026-11-04',
        releves: { '2026-11-02': 12, '2026-11-04': 4 }, bilan: { engage: 12, termine: 8, restant: 4 } }));
      const h = essayer(() => calculerBurndown(clos, tickets, '2026-11-10'));
      return bilanDesEtapes([
        ['B1.6e : restant [10, 10, 7, 4, null, null] (relevés, aujourd’hui = 4 en direct, futur null)', JSON.stringify(e.restant) === '[10,10,7,4,null,null]'],
        ['B1.6f : jours sans relevé → dernier relevé reporté : [10, 9, 9, 9, 4, null]', JSON.stringify(f1.restant) === '[10,9,9,9,4,null]'],
        ['B1.6f : aucun relevé → l’engagé est reporté : [10, 10, 10, 4, null, null]', JSON.stringify(f2.restant) === '[10,10,10,4,null,null]'],
        ['B1.6g : pas commencé → [10, null, null, null, null, null]', JSON.stringify(g.restant) === '[10,null,null,null,null,null]'],
        ['B1.6h : clôturé → engage = bilan.engage (12), [12, 12, 12, 4, null, null]', h.engage === 12 && JSON.stringify(h.restant) === '[12,12,12,4,null,null]' && h.ideal[0] === 12]
      ], () => JSON.stringify({ e: e.restant || e, f1: f1.restant || f1, f2: f2.restant || f2, g: g.restant || g, h: h.restant || h, hEngage: h.engage }),
      'Relevés et report du dernier relevé ; aujourd’hui en direct ; futur null ; sprint clôturé figé');
    } },

    { code: 'T25', groupe: 'b1', nom: 'B1.6 · relevé quotidien des points restants', executer() {
      const manquantes = absentes({ noterReleve });
      if (manquantes.length) return testAbsent(manquantes);
      const tickets = gelerEnProfondeur([ticketDeTest(1, DERNIERE.id, 6, 1), ticketDeTest(2, COLONNES[1].id, 4, 1), ticketDeTest(3, COLONNES[1].id, 5)]);    // 4 restants dans le sprint
      const ouvert = gelerEnProfondeur(sprintDeTest(1, 20, { debut: '2026-11-02', fin: '2026-11-06', releves: { '2026-11-02': 10 } }));
      const clos = gelerEnProfondeur(sprintDeTest(1, 20, { debut: '2026-11-02', fin: '2026-11-06', statut: 'cloture', clotureLe: '2026-11-03', bilan: { engage: 10, termine: 6, restant: 4 } }));
      const note = essayer(() => noterReleve(ouvert, tickets, '2026-11-04'));
      return bilanDesEtapes([
        ['B1.6i : nouveau sprint avec releves["2026-11-04"] = 4, anciens relevés gardés, sprint reçu intact', note !== ouvert && !!note.releves && note.releves['2026-11-04'] === 4
          && note.releves['2026-11-02'] === 10 && !('2026-11-04' in ouvert.releves)],
        ['B1.6j : pas commencé, après la fin ou clôturé → le même sprint, sans changement', noterReleve(ouvert, tickets, '2026-11-01') === ouvert
          && noterReleve(ouvert, tickets, '2026-11-07') === ouvert && noterReleve(clos, tickets, '2026-11-04') === clos]
      ], () => JSON.stringify(note), 'Relevé du jour noté sur un nouveau sprint ; rien hors des dates ou après clôture');
    } },

    { code: 'T26', groupe: 'b1', nom: 'B1.6 · dessin SVG du burndown : jamais de NaN, lignes idéale et restante, titre accessible', executer() {
      const manquantes = absentes({ calculerBurndown, dessinerBurndown });
      if (manquantes.length) return testAbsent(manquantes);
      const unJour = calculerBurndown(gelerEnProfondeur(sprintDeTest(1, 20, { debut: '2026-11-04', fin: '2026-11-04' })), gelerEnProfondeur([ticketDeTest(1, COLONNES[1].id, 8, 1)]), '2026-11-04');
      const zero = calculerBurndown(gelerEnProfondeur(sprintDeTest(1, 20, { debut: '2026-11-02', fin: '2026-11-06' })), gelerEnProfondeur([]), '2026-11-04');
      const normal = calculerBurndown(gelerEnProfondeur(sprintDeTest(1, 20, { debut: '2026-11-02', fin: '2026-11-13', releves: { '2026-11-02': 10 } })),
        gelerEnProfondeur([ticketDeTest(1, COLONNES[1].id, 5, 1), ticketDeTest(2, DERNIERE.id, 5, 1)]), '2026-11-04');
      const svgs = [unJour, zero, normal].map(burndown => essayer(() => dessinerBurndown(burndown)));
      const estSvg = svg => typeof svg === 'string' && /^\s*<svg[\s>]/.test(svg) && /<\/svg>\s*$/.test(svg);
      const aClasse = (svg, classe) => new RegExp(`class="[^"]*\\b${classe}\\b`).test(svg);
      return bilanDesEtapes([
        ['B1.6k : sprint d’un seul jour et sprint à 0 point → SVG sans NaN ni Infinity', svgs.every(estSvg) && svgs.every(svg => !/NaN|Infinity/.test(svg))],
        ['B1.6l : ligne idéale (bd-ideal) et ligne des restants (bd-restant) présentes', svgs.every(svg => aClasse(svg, 'bd-ideal') && aClasse(svg, 'bd-restant'))],
        ['B1.6l : un <title> décrit le graphique', svgs.every(svg => /<title[^>]*>[^<]{10,}<\/title>/.test(svg))]
      ], () => svgs.map(svg => (typeof svg === 'string' ? svg.slice(0, 160) : JSON.stringify(svg))).join(' | '), 'SVG valide dans les 3 cas (un jour, 0 point, normal) ; lignes idéale et restante ; titre');
    } },

    { code: 'T27', groupe: 'b1', nom: 'B1.7 · sauvegarde v4 : aller-retour des sprints, migration v3, réparation d’une sauvegarde abîmée', executer() {
      const sprintClos = sprintDeTest(1, 20, { statut: 'cloture', clotureLe: '2026-10-30', debut: '2026-10-19', fin: '2026-10-30', releves: { '2026-10-19': 8, '2026-10-30': 0 }, bilan: { engage: 8, termine: 8, restant: 0 } });
      const sprintOuvert = sprintDeTest(2, 20, { releves: { '2026-11-02': 5 } });
      const projet = { id: 1, nom: 'Projet sprints', tickets: gelerEnProfondeur([ticketDeTest(1, DERNIERE.id, 8, 1), ticketDeTest(2, COLONNES[1].id, 5, 2), ticketDeTest(3, COLONNE_BACKLOG.id, null)]),
        ordreManuel: null, notesImport: {}, journal: [], sprints: gelerEnProfondeur([sprintClos, sprintOuvert]) };
      const etatTest = { projets: [projet], projetActifId: 1, prochainIdTicket: 4, prochainIdProjet: 2, numerosAttribues: new Set([1, 2, 3]), vue: 'backlog', tri: triParDefaut(), filtres: filtresVides(), utilisateur: '' };
      const relu = charger(JSON.stringify(enveloppeDeSauvegarde(etatTest)));
      const projetRelu = relu.donnees && relu.donnees.projets[0];
      const ticketV3 = { id: 1, titre: 'Ticket de la version 3', type: 'bug', priorite: 1, points: 3, statut: COLONNES[1].id, creeLe: '2026-11-01', assigne: 'Camille' };
      const v3 = charger(JSON.stringify({ version: 3, tickets: [ticketV3], projets: [{ id: 1, nom: 'Hier', tickets: [1], ordreManuel: null, notesImport: {}, journal: [] }], projetActif: 1,
        compteurs: { prochainTicket: 2, prochainProjet: 2, numerosAttribues: [1] }, affichage: { vue: 'backlog', utilisateur: '', tri: triParDefaut(), filtres: {} } }));
      // v4 abîmée : sprints invalides (dates, capacité, durée), sprintId inconnu, ticket non estimé dans un sprint ouvert
      const abimee = charger(JSON.stringify({ version: VERSION_SAUVEGARDE,          // la version actuelle, abîmée
        tickets: [ticketDeTest(1, COLONNES[1].id, 3, 1), ticketDeTest(2, COLONNES[1].id, 3, 99), ticketDeTest(3, COLONNES[1].id, 3, 2), ticketDeTest(4, COLONNE_BACKLOG.id, null, 1),
          ticketDeTest(5, COLONNES[1].id, 3, 3), ticketDeTest(6, COLONNES[1].id, 3, 4)],
        projets: [{ id: 1, nom: 'Abîmé', tickets: [1, 2, 3, 4, 5, 6], ordreManuel: null, notesImport: {}, journal: [],
          sprints: [sprintDeTest(1, 20), sprintDeTest(2, 20, { debut: '2026-02-30' }), sprintDeTest(3, 0), sprintDeTest(4, 20, { debut: '2026-01-01', fin: '2026-03-01' })] }],
        projetActif: 1, compteurs: { prochainTicket: 7, prochainProjet: 2, numerosAttribues: [1, 2, 3, 4, 5, 6] }, affichage: { vue: 'backlog', utilisateur: '', tri: triParDefaut(), filtres: {} } }));
      const projetAbime = abimee.donnees && abimee.donnees.projets[0];
      const cles = 'id,titre,type,priorite,points,statut,creeLe,assigne,sprintId,bloquePar';
      return bilanDesEtapes([
        ['VERSION_SAUVEGARDE vaut au moins 4 (B1)', VERSION_SAUVEGARDE >= 4],
        ['B1.7a : aller-retour → origine « sauvegarde », tickets (sprintId compris) identiques', relu.origine === 'sauvegarde' && !!projetRelu && JSON.stringify(projetRelu.tickets) === JSON.stringify(projet.tickets)],
        ['B1.7a : sprints (relevés, bilan, statut) identiques', !!projetRelu && jsonTrie(projetRelu.sprints) === jsonTrie(projet.sprints)],
        ['B1.7b : sauvegarde v3 → « migration-v3 », sprintId null, sprints []', v3.origine === 'migration-v3' && !!v3.donnees && Object.keys(v3.donnees.projets[0].tickets[0]).join(',') === cles
          && v3.donnees.projets[0].tickets[0].sprintId === null && v3.donnees.projets[0].tickets[0].assigne === 'Camille' && JSON.stringify(v3.donnees.projets[0].sprints) === '[]'],
        ['B1.7d : sprints aux dates, capacité ou durée invalides écartés ; seul le sprint 1 reste', abimee.origine === 'sauvegarde' && !!projetAbime && JSON.stringify(projetAbime.sprints.map(element => element.id)) === '[1]'],
        ['B1.7d : #1 garde son sprint ; sprint inconnu, écarté ou ticket non estimé → sprintId null', !!projetAbime && ticketParId(projetAbime.tickets, 1).sprintId === 1
          && [2, 3, 4, 5, 6].every(id => ticketParId(projetAbime.tickets, id) && ticketParId(projetAbime.tickets, id).sprintId === null)],
        [`B1.7e : version ${VERSION_SAUVEGARDE + 1} (plus récente) → « version-inconnue »`, charger(`{"version":${VERSION_SAUVEGARDE + 1},"tickets":[],"projets":[]}`).origine === 'version-inconnue']
      ], () => JSON.stringify({ relu: relu.origine, sprintsRelus: projetRelu && projetRelu.sprints, v3: v3.origine, abimee: abimee.origine, sprintsAbimes: projetAbime && projetAbime.sprints.map(element => element.id),
        ticketsAbimes: projetAbime && projetAbime.tickets.map(ticket => [ticket.id, ticket.sprintId]) }), 'v4 : aller-retour identique ; v3 migrée (sprintId null, sprints []) ; sauvegarde abîmée réparée ; v5 inconnue');
    } },

    { code: 'T28', groupe: 'b1', nom: 'B1.7 · import et export : le sprint n’est ni exporté ni importé', executer() {
      const manquantes = absentes({ ticketsEnCsv, ticketsEnJson, analyserFichier });
      if (manquantes.length) return testAbsent(manquantes);
      const tickets = gelerEnProfondeur([ticketDeTest(1, COLONNES[1].id, 3, 2)]);
      const enteteCsv = ticketsEnCsv(tickets).replace(/^﻿/, '').split(/\r?\n/)[0];
      const json = JSON.parse(ticketsEnJson(tickets));
      const analyseJson = analyserFichier('import.json', JSON.stringify([{ titre: 'Ticket avec sprint', points: 3, sprintId: 3 }]));
      const analyseCsv = analyserFichier('import.csv', 'titre;points;sprintId\nTicket CSV avec sprint;3;3');
      const importe = analyse => (analyse.ok ? importerTickets(analyse.lignes, [], { dateDuJour: '2026-11-04' }).importes : []);
      return bilanDesEtapes([
        ['B1.7f : en-tête CSV = id;titre;type;priorite;points;statut;creeLe;assigne', enteteCsv === 'id;titre;type;priorite;points;statut;creeLe;assigne'],
        ['B1.7f : JSON exporté sans sprintId', Array.isArray(json) && Object.keys(json[0]).join(',') === 'id,titre,type,priorite,points,statut,creeLe,assigne'],
        ['B1.7g : colonne sprintId signalée « hors du modèle, ignorée » (JSON et CSV)', analyseJson.ok && analyseJson.colonnesIgnorees.includes('sprintId') && analyseCsv.ok && analyseCsv.colonnesIgnorees.includes('sprintId')],
        ['B1.7g : tickets importés avec sprintId null', [analyseJson, analyseCsv].every(analyse => { const importes = importe(analyse); return importes.length === 1 && importes[0].sprintId === null; })]
      ], () => JSON.stringify({ enteteCsv, json: json[0], ignoreesJson: analyseJson.colonnesIgnorees, importes: [...importe(analyseJson), ...importe(analyseCsv)] }), 'Export sans sprintId ; à l’import, sprintId ignoré et signalé, tickets hors sprint');
    } },

    /* ---------- B2 · Dépendances et blocages (docs/spec.md) ---------- */

    { code: 'T29', groupe: 'b2', nom: 'B2.1 · déclarer les bloquants : liste, doublons, vider, ticket déjà en cours, modifierTicket les ignore', executer() {
      const manquantes = absentes({ definirBloquants });
      if (manquantes.length) return testAbsent(manquantes);
      const depart = gelerEnProfondeur([ticketDeTest(1, COLONNES[1].id, 3), ticketDeTest(2, COLONNES[1].id, 2), ticketDeTest(3, COLONNES[1].id, 1), ticketDeTest(4, COLONNES[2].id, 5, null, [2])]);
      const copieAvant = JSON.stringify(depart);
      const a = essayer(() => definirBloquants(depart, 1, [2, 3]));
      const b = essayer(() => definirBloquants(depart, 1, [3, 2, 3]));
      const c = essayer(() => definirBloquants(depart, 4, []));
      const d = essayer(() => definirBloquants(depart, 4, [2, 3]));                         // #4 est déjà « En cours »
      const e = essayer(() => modifierTicket(depart, 4, { bloquePar: [9], titre: 'Titre modifié' }));
      return bilanDesEtapes([
        ['B2.1a : #1 bloqué par [2, 3] ; seul #1 change ; tableau reçu intact', a.ok === true && JSON.stringify(ticketParId(a.tickets, 1).bloquePar) === '[2,3]'
          && a.tickets !== depart && JSON.stringify(depart) === copieAvant && [2, 3, 4].every(id => ticketParId(a.tickets, id) === ticketParId(depart, id))],
        ['B2.1b : [3, 2, 3] → [3, 2] (doublon retiré, ordre gardé)', b.ok === true && JSON.stringify(ticketParId(b.tickets, 1).bloquePar) === '[3,2]'],
        ['B2.1c : [] → #4 n’est plus bloqué', c.ok === true && JSON.stringify(ticketParId(c.tickets, 4).bloquePar) === '[]'],
        ['B2.1d : ticket déjà en cours : bloquants acceptés, il reste en cours', d.ok === true && ticketParId(d.tickets, 4).statut === COLONNES[2].id && JSON.stringify(ticketParId(d.tickets, 4).bloquePar) === '[2,3]'],
        ['B2.1e : modifierTicket ignore bloquePar (le titre change, pas les bloquants)', e.ok === true && e.ticket.titre === 'Titre modifié' && JSON.stringify(e.ticket.bloquePar) === '[2]']
      ], () => JSON.stringify({ a, b, c: c.ok || c.erreur, d: d.ok || d.erreur, e: e.ticket || e.erreurs || e.exception }), 'Bloquants déclarés, dédoublonnés, vidés ; ticket en cours accepté ; modifierTicket sans effet sur eux');
    } },

    { code: 'T30', groupe: 'b2', nom: 'B2.2 · refuser une déclaration impossible : ticket ou bloquant inconnu, liste invalide', executer() {
      const manquantes = absentes({ definirBloquants });
      if (manquantes.length) return testAbsent(manquantes);
      const depart = gelerEnProfondeur([ticketDeTest(1, COLONNES[1].id, 3), ticketDeTest(2, COLONNES[1].id, 2)]);
      const ticketInconnu = essayer(() => definirBloquants(depart, 99, [2]));
      const bloquantInconnu = essayer(() => definirBloquants(depart, 1, [2, 99]));
      const pasUneListe = essayer(() => definirBloquants(depart, 1, '2'));
      const pasDesNumeros = essayer(() => definirBloquants(depart, 1, [1.5]));
      const listeAbimee = essayer(() => definirBloquants(gelerEnProfondeur([null, ticketDeTest(1, COLONNES[1].id, 3)]), 1, []));
      return bilanDesEtapes([
        ['B2.2a : ticket 99 → « Ticket introuvable (id 99) »', ticketInconnu.ok === false && ticketInconnu.erreur === 'Ticket introuvable (id 99)'],
        ['B2.2b : bloquant 99 → « Ticket bloquant introuvable (id 99) »', bloquantInconnu.ok === false && bloquantInconnu.erreur === 'Ticket bloquant introuvable (id 99)'],
        ['B2.2c : « 2 » ou [1.5] → « Liste de bloquants invalide »', pasUneListe.ok === false && pasUneListe.erreur === 'Liste de bloquants invalide' && pasDesNumeros.ok === false && pasDesNumeros.erreur === 'Liste de bloquants invalide'],
        ['B2.2d : élément vide → « Liste de tickets invalide », sans exception', listeAbimee.ok === false && listeAbimee.erreur === 'Liste de tickets invalide']
      ], () => JSON.stringify({ ticketInconnu, bloquantInconnu, pasUneListe, pasDesNumeros, listeAbimee }), 'Ticket et bloquant inconnus, liste invalide, liste abîmée : refus clairs');
    } },

    { code: 'T31', groupe: 'b2', nom: 'B2.3 · cycles refusés avec le cycle affiché (A → B → C → A, à deux, sur soi-même) ; losange accepté', executer() {
      const manquantes = absentes({ definirBloquants });
      if (manquantes.length) return testAbsent(manquantes);
      const chaine = gelerEnProfondeur([ticketDeTest(1, COLONNES[1].id, 3, null, [2]), ticketDeTest(2, COLONNES[1].id, 2, null, [3]), ticketDeTest(3, COLONNES[1].id, 1), ticketDeTest(4, COLONNES[1].id, 1)]);
      const copieAvant = JSON.stringify(chaine);
      const a = essayer(() => definirBloquants(chaine, 3, [1]));
      const b = essayer(() => definirBloquants(gelerEnProfondeur([ticketDeTest(1, COLONNES[1].id, 3, null, [2]), ticketDeTest(2, COLONNES[1].id, 2)]), 2, [1]));
      const c = essayer(() => definirBloquants(chaine, 4, [4]));
      const d = essayer(() => definirBloquants(gelerEnProfondeur([ticketDeTest(1, COLONNES[1].id, 3, null, [2, 3]), ticketDeTest(2, COLONNES[1].id, 2), ticketDeTest(3, COLONNES[1].id, 1)]), 2, [3]));
      const e = essayer(() => definirBloquants(chaine, 3, [4, 1]));
      // Cycle par le 2e bloquant d’un ticket (#1 attend #2 ET #3) : tous les chemins sont suivis, pas seulement le premier
      const branches = gelerEnProfondeur([ticketDeTest(1, COLONNES[1].id, 3, null, [2, 3]), ticketDeTest(2, COLONNES[1].id, 2), ticketDeTest(3, COLONNES[1].id, 1, null, [4]), ticketDeTest(4, COLONNES[1].id, 1)]);
      const f = essayer(() => definirBloquants(branches, 4, [1]));
      return bilanDesEtapes([
        ['B2.3a : #3 bloqué par #1 → « Cycle refusé : #3 → #1 → #2 → #3 », rien ne change', a.ok === false && a.erreur === `Cycle refusé${NBSP}: #3 → #1 → #2 → #3` && JSON.stringify(chaine) === copieAvant],
        ['B2.3b : cycle à deux → « Cycle refusé : #2 → #1 → #2 »', b.ok === false && b.erreur === `Cycle refusé${NBSP}: #2 → #1 → #2`],
        ['B2.3c : #4 bloqué par lui-même → « Cycle refusé : #4 → #4 »', c.ok === false && c.erreur === `Cycle refusé${NBSP}: #4 → #4`],
        ['B2.3d : losange (#1 → #2, #1 → #3, puis #2 → #3) accepté', d.ok === true && JSON.stringify(ticketParId(d.tickets, 2).bloquePar) === '[3]'],
        ['B2.3e : [4, 1] → le cycle par #1 est signalé', e.ok === false && e.erreur === `Cycle refusé${NBSP}: #3 → #1 → #2 → #3`],
        ['B2.3a : cycle passant par le 2e bloquant (#1 → [2, 3], #3 → #4, puis #4 → #1) → « Cycle refusé : #4 → #1 → #3 → #4 »', f.ok === false && f.erreur === `Cycle refusé${NBSP}: #4 → #1 → #3 → #4`]
      ], () => JSON.stringify({ a, b, c, d: d.ok || d.erreur, e }), `« ${a.erreur} » ; « ${b.erreur} » ; « ${c.erreur} » ; losange accepté`);
    } },

    { code: 'T32', groupe: 'b2', nom: 'B2.4 · R6 : un ticket bloqué n’entre ni en cours ni au-delà ; reculer reste permis ; ordre des règles', executer() {
      const [AFAIRE, ENCOURS, ENREVUE] = [COLONNES[1].id, COLONNES[2].id, COLONNES[3].id];
      const deplacer = (tickets, id, vers) => essayer(() => deplacerTicket(gelerEnProfondeur(tickets), id, vers));
      const a = deplacer([ticketDeTest(2, AFAIRE, 3, null, [3, 5]), ticketDeTest(3, AFAIRE, 2), ticketDeTest(5, DERNIERE.id, 1)], 2, ENCOURS);
      const b = deplacer([ticketDeTest(2, AFAIRE, 3, null, [3, 4]), ticketDeTest(3, AFAIRE, 2), ticketDeTest(4, AFAIRE, 1)], 2, ENREVUE);
      const dejaEnCours = [ticketDeTest(2, ENCOURS, 3, null, [3]), ticketDeTest(3, AFAIRE, 2)];
      const cAvance = deplacer(dejaEnCours, 2, ENREVUE);
      const cRecule = deplacer(dejaEnCours, 2, AFAIRE);
      const cBacklog = deplacer(dejaEnCours, 2, COLONNE_BACKLOG.id);
      const d = deplacer([ticketDeTest(2, AFAIRE, 3, null, [5]), ticketDeTest(5, DERNIERE.id, 1)], 2, ENCOURS);
      const e = deplacer([ticketDeTest(2, COLONNE_BACKLOG.id, 3, null, [3]), ticketDeTest(3, AFAIRE, 2)], 2, AFAIRE);
      // Ordre : R2 avant R6 ; R6 avant R5 (passage obligé) et avant R1 (WIP)
      const nonEstime = deplacer([ticketDeTest(2, COLONNE_BACKLOG.id, null, null, [3]), ticketDeTest(3, AFAIRE, 2)], 2, ENCOURS);
      const versTermine = deplacer([ticketDeTest(2, AFAIRE, 3, null, [3]), ticketDeTest(3, AFAIRE, 2)], 2, DERNIERE.id);
      const pleine = Array.from({ length: LIMITE_WIP }, (_, rang) => ticketDeTest(10 + rang, ENCOURS, 1));
      const versPleine = deplacer([...pleine, ticketDeTest(2, AFAIRE, 3, null, [3]), ticketDeTest(3, AFAIRE, 2)], 2, ENCOURS);
      return bilanDesEtapes([
        ['B2.4a : #2 (bloquants #3 actif, #5 terminé) → En cours : « Bloqué : #2 attend #3 »', a.ok === false && a.erreur === `Bloqué${NBSP}: #2 attend #3`],
        ['B2.4b : saut direct vers En revue : « Bloqué : #2 attend #3, #4 »', b.ok === false && b.erreur === `Bloqué${NBSP}: #2 attend #3, #4`],
        ['B2.4c : déjà en cours → En revue refusé ; → À faire et → Backlog acceptés', cAvance.ok === false && cAvance.erreur === `Bloqué${NBSP}: #2 attend #3` && cRecule.ok === true && cBacklog.ok === true],
        ['B2.4d : tous les bloquants terminés → En cours accepté', d.ok === true],
        ['B2.4e : bloqué → À faire (hors zone de travail) accepté', e.ok === true],
        ['ordre : non estimé et bloqué → Definition of Ready d’abord (R2 avant R6)', nonEstime.ok === false && /^Definition of Ready/.test(nonEstime.erreur || '')],
        ['ordre : bloqué → Terminé : « Bloqué » (R6 avant R5) ; vers En cours pleine : « Bloqué » (R6 avant R1)', versTermine.ok === false && /^Bloqué/.test(versTermine.erreur || '') && versPleine.ok === false && /^Bloqué/.test(versPleine.erreur || '')]
      ], () => JSON.stringify({ a, b, cAvance, cRecule: cRecule.ok || cRecule.erreur, d: d.ok || d.erreur, e: e.ok || e.erreur, nonEstime, versTermine, versPleine }), `« ${a.erreur} » ; « ${b.erreur} » ; reculer permis ; débloqué une fois les bloquants terminés`);
    } },

    { code: 'T33', groupe: 'b2', nom: 'B2.5 · bloquants actifs (badge 🔒) : non terminés, dans l’ordre, inconnus ignorés', executer() {
      const manquantes = absentes({ bloquantsActifs });
      if (manquantes.length) return testAbsent(manquantes);
      const tickets = gelerEnProfondeur([ticketDeTest(1, COLONNES[1].id, 3, null, [3, 5, 4, 99]), ticketDeTest(3, COLONNES[1].id, 2), ticketDeTest(4, COLONNES[2].id, 1), ticketDeTest(5, DERNIERE.id, 1),
        ticketDeTest(6, COLONNES[1].id, 1, null, [5]), ticketDeTest(7, COLONNES[1].id, 1)]);
      const actifs = essayer(() => bloquantsActifs(tickets[0], tickets));
      return bilanDesEtapes([
        ['B2.5a et c : #1 bloqué par [3, 5, 4, 99] → [3, 4] (#5 terminé, 99 inconnu)', JSON.stringify(actifs) === '[3,4]'],
        ['B2.5b : bloquants tous terminés, ou aucun → []', JSON.stringify(bloquantsActifs(tickets[4], tickets)) === '[]' && JSON.stringify(bloquantsActifs(tickets[5], tickets)) === '[]']
      ], () => JSON.stringify(actifs), 'Badge : #3 et #4 (le terminé et l’inconnu ne sont pas cités)');
    } },

    { code: 'T34', groupe: 'b2', nom: 'B2.6 · supprimer un ticket nettoie toutes les références', executer() {
      const manquantes = absentes({ retirerDesBloquants });
      if (manquantes.length) return testAbsent(manquantes);
      // #3 vient d’être supprimé ; #5 le cite en 2e position (la référence n’est pas toujours la première)
      const depart = gelerEnProfondeur([ticketDeTest(1, COLONNES[1].id, 3, null, [3, 2]), ticketDeTest(2, COLONNES[1].id, 2, null, [3]), ticketDeTest(4, COLONNES[1].id, 1), ticketDeTest(5, COLONNES[1].id, 1, null, [2, 3, 4])]);
      const copieAvant = JSON.stringify(depart);
      const nettoye = essayer(() => retirerDesBloquants(depart, 3));
      return bilanDesEtapes([
        ['B2.6a : #1 → [2], #2 → [], #5 [2, 3, 4] → [2, 4]', Array.isArray(nettoye) && JSON.stringify(ticketParId(nettoye, 1).bloquePar) === '[2]' && JSON.stringify(ticketParId(nettoye, 2).bloquePar) === '[]'
          && JSON.stringify(ticketParId(nettoye, 5).bloquePar) === '[2,4]'],
        ['B2.6a : nouveau tableau, tableau reçu intact, ticket non concerné (#4) = même objet', Array.isArray(nettoye) && nettoye !== depart && JSON.stringify(depart) === copieAvant && ticketParId(nettoye, 4) === ticketParId(depart, 4)]
      ], () => JSON.stringify(nettoye), 'Plus aucune référence à #3 ; les autres tickets sont intacts');
    } },

    { code: 'T35', groupe: 'b2', nom: 'B2.7 · sauvegarde v5 : aller-retour, migration v4 → v5 (sprints gardés), sauvegarde abîmée réparée', executer() {
      const projet = { id: 1, nom: 'Projet bloqué', tickets: gelerEnProfondeur([ticketDeTest(1, COLONNES[1].id, 3, null, [2, 3]), ticketDeTest(2, COLONNES[1].id, 2, null, [3]), ticketDeTest(3, COLONNES[1].id, 1)]),
        ordreManuel: null, notesImport: {}, journal: [], sprints: [] };
      const etatTest = { projets: [projet], projetActifId: 1, prochainIdTicket: 4, prochainIdProjet: 2, numerosAttribues: new Set([1, 2, 3]), vue: 'backlog', tri: triParDefaut(), filtres: filtresVides(), utilisateur: '' };
      const relu = charger(JSON.stringify(enveloppeDeSauvegarde(etatTest)));
      // Une sauvegarde d’hier, en version 4 : des sprints, pas de bloquePar
      const ticketV4 = (id, statut, points, sprintId) => ({ id, titre: `Ticket d’hier ${id}`, type: 'story', priorite: 2, points, statut, creeLe: '2026-11-03', assigne: 'Camille', sprintId });
      const v4 = charger(JSON.stringify({ version: 4, tickets: [ticketV4(1, COLONNES[1].id, 3, 1), ticketV4(2, COLONNE_BACKLOG.id, 5, null)],
        projets: [{ id: 1, nom: 'Hier', tickets: [1, 2], ordreManuel: null, notesImport: {}, journal: [], sprints: [sprintDeTest(1, 20, { releves: { '2026-11-03': 3 } })] }],
        projetActif: 1, compteurs: { prochainTicket: 3, prochainProjet: 2, numerosAttribues: [1, 2] }, affichage: { vue: 'kanban', utilisateur: 'Camille', tri: triParDefaut(), filtres: {} } }));
      const projetV4 = v4.donnees && v4.donnees.projets[0];
      // v5 abîmée : bloquant inconnu, lui-même, en double, d’un autre projet ; et un cycle #1 → #2 → #3 → #1
      const abimee = charger(JSON.stringify({ version: 5,
        tickets: [ticketDeTest(1, COLONNES[1].id, 3, null, [99, 1, 2, 2, 5]), ticketDeTest(2, COLONNES[1].id, 2, null, [3]), ticketDeTest(3, COLONNES[1].id, 1, null, [1]), ticketDeTest(4, COLONNES[1].id, 1, null, [3]), ticketDeTest(5, COLONNES[1].id, 1)],
        projets: [{ id: 1, nom: 'Abîmé', tickets: [1, 2, 3, 4], ordreManuel: null, notesImport: {}, journal: [], sprints: [] }, { id: 2, nom: 'Autre', tickets: [5], ordreManuel: null, notesImport: {}, journal: [], sprints: [] }],
        projetActif: 1, compteurs: { prochainTicket: 6, prochainProjet: 3, numerosAttribues: [1, 2, 3, 4, 5] }, affichage: { vue: 'backlog', utilisateur: '', tri: triParDefaut(), filtres: {} } }));
      const tousAbimes = abimee.donnees ? abimee.donnees.projets.flatMap(element => element.tickets) : [];
      const liens = id => { const ticket = ticketParId(tousAbimes, id); return ticket ? JSON.stringify(ticket.bloquePar) : 'absent'; };
      return bilanDesEtapes([
        ['VERSION_SAUVEGARDE vaut au moins 5', VERSION_SAUVEGARDE >= 5],
        ['B2.7a : aller-retour → « sauvegarde », bloquePar identiques', relu.origine === 'sauvegarde' && !!relu.donnees && JSON.stringify(relu.donnees.projets[0].tickets) === JSON.stringify(projet.tickets)],
        ['B2.7b : sauvegarde v4 → « migration-v4 », bloquePar [] partout', v4.origine === 'migration-v4' && !!projetV4 && projetV4.tickets.every(ticket => Array.isArray(ticket.bloquePar) && ticket.bloquePar.length === 0)],
        ['B2.7b : sprints, sprintId, « Je suis » et vue conservés', !!projetV4 && projetV4.sprints.length === 1 && projetV4.sprints[0].releves['2026-11-03'] === 3 && ticketParId(projetV4.tickets, 1).sprintId === 1
          && ticketParId(projetV4.tickets, 1).assigne === 'Camille' && v4.donnees.vue === 'kanban' && v4.donnees.utilisateur === 'Camille'],
        ['B2.7d : #1 [99, 1, 2, 2, 5] → [2] (inconnu, lui-même, doublon, autre projet retirés)', liens(1) === '[2]'],
        ['B2.7d : cycle #1 → #2 → #3 → #1 : le lien qui le ferme (#3 → #1) est retiré ; #4 → [3] gardé', liens(2) === '[3]' && liens(3) === '[]' && liens(4) === '[3]' && liens(5) === '[]'],
        [`B2.7e : version ${VERSION_SAUVEGARDE + 1} → « version-inconnue »`, charger(`{"version":${VERSION_SAUVEGARDE + 1},"tickets":[],"projets":[]}`).origine === 'version-inconnue']
      ], () => JSON.stringify({ relu: relu.origine, v4: v4.origine, sprintsV4: projetV4 && projetV4.sprints.length, abimee: abimee.origine, liens: [1, 2, 3, 4, 5].map(liens) }),
      'v5 : aller-retour identique ; sauvegarde d’hier v4 migrée, sprints gardés ; liens invalides et cycle retirés');
    } },

    { code: 'T36', groupe: 'b2', nom: 'B2.7 · import et export : les bloquants ne sont ni exportés ni importés', executer() {
      const tickets = gelerEnProfondeur([ticketDeTest(1, COLONNES[1].id, 3, null, [2])]);
      const enteteCsv = ticketsEnCsv(tickets).replace(/^﻿/, '').split(/\r?\n/)[0];
      const json = JSON.parse(ticketsEnJson(tickets));
      const analyse = analyserFichier('import.json', JSON.stringify([{ titre: 'Ticket avec bloquants', points: 3, bloquePar: [1, 2] }]));
      const importes = analyse.ok ? importerTickets(analyse.lignes, [], { dateDuJour: '2026-11-04' }).importes : [];
      return bilanDesEtapes([
        ['B2.7f : export CSV et JSON sans bloquePar', enteteCsv === 'id;titre;type;priorite;points;statut;creeLe;assigne' && Array.isArray(json) && !('bloquePar' in json[0])],
        ['B2.7g : import → bloquePar [] et colonne signalée « hors du modèle, ignorée »', analyse.ok && analyse.colonnesIgnorees.includes('bloquePar') && importes.length === 1
          && Array.isArray(importes[0].bloquePar) && importes[0].bloquePar.length === 0]
      ], () => JSON.stringify({ enteteCsv, json: json[0], ignorees: analyse.colonnesIgnorees, importes }), 'Export sans bloquePar ; import : bloquePar ignoré et signalé, tickets sans bloquant');
    } }
  ];

  // Titres des groupes de tests dans le panneau
  const GROUPES_DE_TESTS = { regles: 'Règles métier du Kanban', piege: 'Fichier piégé backlog-import.csv, importé dans le tableau de départ', sauvegarde: 'Sauvegarde et chargement', po: 'Demandes du Product Owner (phase 2)', audit: 'Audit des cas limites (deplacerTicket, importerTickets)', b1: 'B1 · Sprints et burndown (docs/spec.md)', b2: 'B2 · Dépendances et blocages (docs/spec.md)' };

  // Exécute un test ; un test qui plante est un test échoué
  function executerUnTest(test) {
    const base = { code: test.code, groupe: test.groupe || 'regles', nom: test.nom };
    try {
      const { reussi, detail } = test.executer();
      return { ...base, reussi: !!reussi, detail };
    } catch (erreur) {
      return { ...base, reussi: false, detail: `Erreur pendant le test : ${erreur.message}` };
    }
  }

  // Contenu d’une carte de test : 'attente' (pas encore lancé), 'en-cours', ou le résultat
  function htmlCarteDeTest(test, etatDuTest, resultat) {
    const termine = etatDuTest === 'termine';
    const icone = termine ? (resultat.reussi ? ICONE_COCHE : ICONE_CROIX) : '<span class="at-rond"></span>';
    const etatLu = termine ? (resultat.reussi ? 'réussi' : 'échoué') : (etatDuTest === 'en-cours' ? 'en cours' : 'en attente');
    const detail = termine ? resultat.detail : (etatDuTest === 'en-cours' ? 'Test en cours…' : 'En attente…');
    return `<span class="at-icone" aria-hidden="true">${icone}</span>
        <span class="at-nom">${test.code} · ${echapper(test.nom)}<span class="sr-only"> : ${etatLu}</span></span>
        <span class="at-detail">${echapper(detail)}</span>`;
  }
  const classeCarteDeTest = (etatDuTest, resultat) =>
    `at-test ${etatDuTest === 'termine' ? (resultat.reussi ? 'is-ok' : 'is-ko') : `is-${etatDuTest}`}`;

  // Toutes les cartes dans un même état, avec les titres des groupes
  function dessinerCartesDeTests(etatDuTest, resultats = []) {
    page.listeTests.innerHTML = AUTO_TESTS.map((test, rang) => {
      const groupe = test.groupe || 'regles';
      const titreDuGroupe = rang === 0 || (AUTO_TESTS[rang - 1].groupe || 'regles') !== groupe ? `<li class="at-groupe">${GROUPES_DE_TESTS[groupe]}</li>` : '';
      return `${titreDuGroupe}<li class="${classeCarteDeTest(etatDuTest, resultats[rang])}" data-test="${test.code}">${htmlCarteDeTest(test, etatDuTest, resultats[rang])}</li>`;
    }).join('');
  }

  // Bilan « 8/8 réussis » et note avec l’heure d’exécution
  function afficherBilanDesTests(resultats) {
    const nombreReussis = resultats.filter(resultat => resultat.reussi).length;
    const tousReussis = nombreReussis === resultats.length;
    page.bilanTests.textContent = `${nombreReussis}/${resultats.length} réussis`;
    page.bilanTests.className = `at-bilan ${tousReussis ? 'is-ok' : 'is-ko'}`;
    page.panneauTests.classList.toggle('is-echec', !tousReussis);
    const heure = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    page.noteTests.textContent = `Tests exécutés à ${heure} sur deplacerTicket(), calculerStats(), parserCSV(), importerTickets() et charger(), avec des jeux de données dédiés : vos tickets et votre sauvegarde ne sont pas modifiés.`;
    return { nombreReussis, tousReussis, heure };
  }

  // Au chargement : tous les tests d’un coup, sans attendre
  function executerAutoTests() {
    const resultats = AUTO_TESTS.map(executerUnTest);
    dessinerCartesDeTests('termine', resultats);
    afficherBilanDesTests(resultats);
  }

  // « Relancer les tests » : on voit chaque test repasser en attente, s’exécuter, puis s’afficher
  const attendre = duree => new Promise(fin => setTimeout(fin, duree));
  let relanceEnCours = false;
  async function relancerAutoTests() {
    if (relanceEnCours) return;
    relanceEnCours = true;
    const bouton = page.boutonRelancerTests;
    bouton.disabled = true;
    bouton.classList.add('is-en-cours');
    bouton.setAttribute('aria-busy', 'true');
    bouton.innerHTML = '<span class="at-rond" aria-hidden="true"></span>Tests en cours…';
    page.panneauTests.classList.remove('is-echec');
    page.bilanTests.className = 'at-bilan is-en-cours';
    page.bilanTests.textContent = `0/${AUTO_TESTS.length}`;
    page.noteTests.textContent = 'Exécution des tests…';
    dessinerCartesDeTests('attente');
    // Durée d’affichage de chaque test : la relance entière reste sous la seconde, quel que soit le nombre de tests
    const rythme = mouvementReduit() ? 40 : Math.min(110, Math.round(700 / AUTO_TESTS.length));
    await attendre(mouvementReduit() ? 60 : 220);

    const resultats = [];
    for (const test of AUTO_TESTS) {
      const carte = page.listeTests.querySelector(`[data-test="${test.code}"]`);
      carte.className = classeCarteDeTest('en-cours');
      carte.innerHTML = htmlCarteDeTest(test, 'en-cours');
      await attendre(rythme);
      const resultat = executerUnTest(test);
      resultats.push(resultat);
      carte.className = `${classeCarteDeTest('termine', resultat)} is-revele`;
      carte.innerHTML = htmlCarteDeTest(test, 'termine', resultat);
      page.bilanTests.textContent = `${resultats.length}/${AUTO_TESTS.length}`;
    }

    const { nombreReussis, tousReussis, heure } = afficherBilanDesTests(resultats);
    void page.bilanTests.offsetWidth;                 // relance l’animation du bilan
    page.bilanTests.classList.add('is-maj');
    page.noteTests.classList.remove('is-maj');
    void page.noteTests.offsetWidth;
    page.noteTests.classList.add('is-maj');
    bouton.classList.remove('is-en-cours');
    bouton.removeAttribute('aria-busy');
    bouton.innerHTML = `${tousReussis ? ICONE_COCHE : ICONE_CROIX}Tests relancés`;
    bouton.classList.add(tousReussis ? 'is-fini-ok' : 'is-fini-ko');
    page.annonce.textContent = `Tests relancés à ${heure} : ${nombreReussis} sur ${resultats.length} réussis.`;
    await attendre(1400);
    bouton.classList.remove('is-fini-ok', 'is-fini-ko');
    bouton.textContent = 'Relancer les tests';
    bouton.disabled = false;
    relanceEnCours = false;
  }


  /* ========================================================================
     DÉMARRAGE DES AUTO-TESTS (après le démarrage de l’application)
     ======================================================================== */
  page.boutonRelancerTests.addEventListener('click', relancerAutoTests);
  trouver('#at-fichier-piege').textContent = FICHIER_PIEGE;
  executerAutoTests();
})();
