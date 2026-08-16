const { decisionRetour } = require('../utils/sondageSync');

// Le scénario réel, celui que Marco a vu sur le terrain : on est dans
// InvaderQuest, on bascule vers FlashInvaders, on photographie, on revient. Ça
// prend beaucoup moins d'une minute — donc pile dans le repos anti-rafale.
const ALLER_RETOUR = 25000;

describe('resondage au retour au premier plan', () => {
  test('un aller-retour vers FlashInvaders force le sondage', () => {
    expect(decisionRetour({
      etat: 'active', partiEnFond: 1000, maintenant: 1000 + ALLER_RETOUR, enAttente: false,
    })).toEqual({ force: true });
  });

  test('un clignotement d’état ne force rien', () => {
    // Boîte de dialogue système, volet de contrôle effleuré : l'app repasse
    // active en une fraction de seconde. Sonder à chaque fois serait une rafale.
    expect(decisionRetour({
      etat: 'active', partiEnFond: 1000, maintenant: 1400, enAttente: false,
    })).toEqual({ force: false });
  });

  test('exactement au seuil, on force', () => {
    expect(decisionRetour({
      etat: 'active', partiEnFond: 0 + 1, maintenant: 3001, enAttente: false, seuilRetour: 3000,
    })).toEqual({ force: true });
  });

  test('un état non actif ne déclenche jamais de sondage', () => {
    for (const etat of ['background', 'inactive', 'unknown', 'extension']) {
      expect(decisionRetour({
        etat, partiEnFond: 1000, maintenant: 1000 + ALLER_RETOUR, enAttente: false,
      })).toBeNull();
    }
  });

  test('un bandeau en attente n’est jamais écrasé', () => {
    // L'utilisateur est peut-être en train de lire la liste des identifiants :
    // resonder la remplacerait sous ses yeux, et le serveur n'a rien de plus à dire.
    expect(decisionRetour({
      etat: 'active', partiEnFond: 1000, maintenant: 1000 + ALLER_RETOUR, enAttente: true,
    })).toBeNull();
  });

  test('jamais parti : sondage normal, soumis au repos', () => {
    // Premier passage à 'active' après le montage. L'effet vient déjà de sonder ;
    // forcer ici doublerait l'appel au démarrage.
    expect(decisionRetour({
      etat: 'active', partiEnFond: 0, maintenant: 99999, enAttente: false,
    })).toEqual({ force: false });
  });
});
