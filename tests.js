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
    // Zone 3 · UI
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
     ======================================================================== */
  function gelerEnProfondeur(objet) {
    for (const valeur of Object.values(objet)) if (valeur && typeof valeur === 'object') gelerEnProfondeur(valeur);
    return Object.freeze(objet);
  }
  const ticketDeTest = (id, statut, points) => ({ id, titre: `Ticket de test ${id}`, type: 'story', priorite: 2, points, statut, creeLe: '2026-11-03', assigne: null });
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
      const cles = 'id,titre,type,priorite,points,statut,creeLe,assigne';
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
        ['chaque ticket reçoit « assigne » = null ; le ticket terminé reste « Terminé »', tickets.every(ticket => ticket.assigne === null && Object.keys(ticket).join(',') === 'id,titre,type,priorite,points,statut,creeLe,assigne') && tickets[0].statut === 'termine'],
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
    } }
  ];

  // Titres des groupes de tests dans le panneau
  const GROUPES_DE_TESTS = { regles: 'Règles métier du Kanban', piege: 'Fichier piégé backlog-import.csv, importé dans le tableau de départ', sauvegarde: 'Sauvegarde et chargement', po: 'Demandes du Product Owner (phase 2)', audit: 'Audit des cas limites (deplacerTicket, importerTickets)' };

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
