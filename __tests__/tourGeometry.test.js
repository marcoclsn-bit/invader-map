import { backtrackScore, BACKTRACK_DOT_MIN } from '../utils/tourGeometry';

const P = (lat, lng) => ({ lat, lng });
const S = [48.85, 2.30]; // la chasse est une boucle : départ ET arrivée

// Boucle propre : quatre côtés, que des virages à angle droit.
const CARRE = [P(48.85, 2.32), P(48.84, 2.32), P(48.84, 2.30)];
// Le même carré, avec un éperon greffé sur le deuxième sommet, le motif exact
// qu'on cherche à décourager : on descend le chercher, on remonte par où on est
// venu.
const CARRE_EPERON = [P(48.85, 2.32), P(48.84, 2.32), P(48.835, 2.322), P(48.84, 2.30)];
// Aller simple puis retour par le même axe : le pire cas possible.
const ALLER_RETOUR = [P(48.85, 2.32), P(48.85, 2.33), P(48.85, 2.34)];

describe('backtrackScore', () => {
  it('ne coûte rien à une boucle sans demi-tour', () => {
    expect(backtrackScore(CARRE, ...S)).toBeCloseTo(0, 6);
  });

  it('coûte le maximum à un aller-retour en ligne droite', () => {
    // On repart exactement d'où l'on vient : un demi-tour complet, donc 1.
    expect(backtrackScore(ALLER_RETOUR, ...S)).toBeCloseTo(1, 3);
  });

  it('classe la boucle devant l\'aller-retour', () => {
    // C'est LA propriété dont dépend le correctif : à durée comparable, le
    // planificateur doit préférer la première forme à la seconde.
    expect(backtrackScore(CARRE, ...S)).toBeLessThan(backtrackScore(ALLER_RETOUR, ...S));
  });

  it('détecte un éperon greffé sur une boucle propre', () => {
    expect(backtrackScore(CARRE_EPERON, ...S)).toBeGreaterThan(backtrackScore(CARRE, ...S));
  });

  // Le seuil garantit qu'un parcours en angles droits reste gratuit : sans lui,
  // on paierait chaque coin de rue et TOUS les parcours seraient déformés, pas
  // seulement ceux qui piquent.
  it('ne facture rien avant 90°', () => {
    expect(BACKTRACK_DOT_MIN).toBe(0); // cos(90°)
    expect(backtrackScore(CARRE, ...S)).toBeCloseTo(0, 6);
  });

  // C'est le cas que le premier réglage laissait passer et que le terrain a
  // signalé : l'éperon vers une étape isolée, qu'on rejoint et qu'on quitte en
  // pivotant d'une centaine de degrés.
  it('facture désormais les épingles autour de 100°', () => {
    const epingle = [P(48.8560, 2.3100), P(48.8500, 2.3160)];
    expect(backtrackScore(epingle, ...S)).toBeGreaterThan(0.2);
  });

  it('tolère les cas dégénérés sans produire de NaN', () => {
    expect(backtrackScore([], ...S)).toBe(0);
    expect(backtrackScore([P(48.85, 2.30)], ...S)).toBe(0);
    expect(backtrackScore(null, ...S)).toBe(0);
    expect(backtrackScore(undefined, ...S)).toBe(0);
    // Deux étapes exactement confondues : aucun angle définissable.
    expect(backtrackScore([P(48.85, 2.31), P(48.85, 2.31)], ...S)).not.toBeNaN();
  });
});
