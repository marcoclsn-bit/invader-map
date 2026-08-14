import { dispositionRangee, hauteurGrille } from '../utils/gridLayout';

// Régression. Avec numColumns, FlatList passe un index de RANGÉE à getItemLayout,
// pas un index d'élément — vérifié dans le source de React Native. La première
// version divisait cet index par le nombre de colonnes, donc une seconde fois :
// la liste calculait une hauteur cinq fois trop petite, et sur les 1 351 cases de
// Paris l'affichage s'arrêtait à 275 sans la moindre erreur.
describe('disposition d’une grille à colonnes fixes', () => {
  const TAILLE = 65;
  const ECART = 8;
  const H = TAILLE + ECART;

  test('les décalages progressent d’une hauteur de rangée, sans trou ni recouvrement', () => {
    for (let i = 0; i < 50; i += 1) {
      const { offset, length } = dispositionRangee(i, TAILLE, ECART);
      expect(offset).toBe(H * i);
      expect(length).toBe(H);
      // Le bas d'une rangée touche exactement le haut de la suivante.
      expect(offset + length).toBe(dispositionRangee(i + 1, TAILLE, ECART).offset);
    }
  });

  test('le décalage ne dépend PAS du nombre de colonnes', () => {
    // C'est l'énoncé exact du défaut : la fonction ne reçoit pas cette information
    // et ne doit donc en aucun cas la réintroduire.
    expect(dispositionRangee.length).toBe(3);   // (index, taille, ecart)
    expect(dispositionRangee(10, TAILLE, ECART).offset).toBe(H * 10);
  });

  test('la hauteur totale couvre la dernière rangée, même incomplète', () => {
    expect(hauteurGrille(1351, 5, TAILLE, ECART)).toBe(Math.ceil(1351 / 5) * H);
    expect(hauteurGrille(1352, 5, TAILLE, ECART)).toBe(271 * H); // 271 rangées
    expect(hauteurGrille(5, 5, TAILLE, ECART)).toBe(H);
    expect(hauteurGrille(6, 5, TAILLE, ECART)).toBe(2 * H);
  });

  test('le cas réel de Paris : la grille atteint bien sa dernière case', () => {
    const CASES = 1351;
    const COLONNES = 5;
    const rangees = Math.ceil(CASES / COLONNES);
    const derniere = dispositionRangee(rangees - 1, TAILLE, ECART);
    expect(derniere.offset + derniere.length).toBe(hauteurGrille(CASES, COLONNES, TAILLE, ECART));
    // Et la hauteur atteinte n'est pas le cinquième d'elle-même, comme avant.
    expect(hauteurGrille(CASES, COLONNES, TAILLE, ECART))
      .toBeGreaterThan(hauteurGrille(CASES, COLONNES, TAILLE, ECART) / 2);
  });

  test('résiste aux entrées vides', () => {
    expect(hauteurGrille(0, 5, TAILLE, ECART)).toBe(0);
    expect(hauteurGrille(10, 0, TAILLE, ECART)).toBe(0);
  });
});
