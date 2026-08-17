const { decisionRetour } = require('../utils/sondageSync');

// Le scénario réel, celui que Marco a vu sur le terrain : on est dans
// InvaderQuest, on bascule vers FlashInvaders, on photographie, on revient. Ça
// prend beaucoup moins d'une minute — donc pile dans le repos anti-rafale.
const ALLER_RETOUR = 25000;

describe('resondage au retour au premier plan', () => {
  test('un aller-retour vers FlashInvaders force le sondage', () => {
    expect(decisionRetour({
      etat: 'active', partiEnFond: 1000, maintenant: 1000 + ALLER_RETOUR,
    })).toEqual({ force: true });
  });

  test('un clignotement d’état ne force rien', () => {
    // Boîte de dialogue système, volet de contrôle effleuré : l'app repasse
    // active en une fraction de seconde. Sonder à chaque fois serait une rafale.
    expect(decisionRetour({
      etat: 'active', partiEnFond: 1000, maintenant: 1400,
    })).toEqual({ force: false });
  });

  test('exactement au seuil, on force', () => {
    expect(decisionRetour({
      etat: 'active', partiEnFond: 0 + 1, maintenant: 3001, seuilRetour: 3000,
    })).toEqual({ force: true });
  });

  test('un état non actif ne déclenche jamais de sondage', () => {
    for (const etat of ['background', 'inactive', 'unknown', 'extension']) {
      expect(decisionRetour({
        etat, partiEnFond: 1000, maintenant: 1000 + ALLER_RETOUR,
      })).toBeNull();
    }
  });

  test('un bandeau déjà affiché ne bloque PAS le resondage', () => {
    // Le geste central de la chasse : le bandeau annonce « 1 Invader », on repart
    // en flasher trois autres, on revient. Il doit passer à 4. Il restait à 1
    // jusqu'à ce qu'on ferme et rouvre l'app. La galerie reste protégée par
    // `compteAnalyse` : si le compteur serveur n'a pas bougé, rien n'est
    // retéléchargé.
    expect(decisionRetour({
      etat: 'active', partiEnFond: 1000, maintenant: 1000 + ALLER_RETOUR,
    })).toEqual({ force: true });
  });

  test('jamais parti : sondage normal, soumis au repos', () => {
    // Premier passage à 'active' après le montage. L'effet vient déjà de sonder ;
    // forcer ici doublerait l'appel au démarrage.
    expect(decisionRetour({
      etat: 'active', partiEnFond: 0, maintenant: 99999,
    })).toEqual({ force: false });
  });
});
