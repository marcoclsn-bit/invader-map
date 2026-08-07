import { spillOffer } from '../utils/huntSpill';

const inv = (n) => ({ id: `PA_${n}`, points: 10 });
const poi = { isPoi: true };
const ar7 = new Set([7]);

// Cas nominal : 10 Invaders éligibles, les 10 sont pris, 90 min de budget libre.
const CANDIDATS = Array.from({ length: 10 }, (_, i) => inv(i));
const PRIS = [...CANDIDATS, poi];

describe('spillOffer', () => {
  it('propose quand l\'arrondissement est vidé et le budget largement libre', () => {
    expect(spillOffer(ar7, null, CANDIDATS, PRIS, 30, 120)).toEqual({ ar: 7, leftoverMin: 90 });
  });

  // LA raison d'être de la condition littérale : un parcours court n'est pas la
  // preuve d'un arrondissement vide. Il peut buter sur le plafond d'étapes.
  it('ne propose pas s\'il reste des Invaders à prendre sur place', () => {
    const pris = CANDIDATS.slice(0, 6);
    expect(spillOffer(ar7, null, CANDIDATS, pris, 30, 120)).toBeNull();
  });

  it('ne compte pas les lieux d\'intérêt comme des Invaders pris', () => {
    const pris = [...CANDIDATS.slice(0, 9), poi, poi];
    expect(spillOffer(ar7, null, CANDIDATS, pris, 30, 120)).toBeNull();
  });

  it('ne propose pas pour un reliquat négligeable', () => {
    // 15 min libres sur 120 : sous le plancher absolu de 20 min.
    expect(spillOffer(ar7, null, CANDIDATS, PRIS, 105, 120)).toBeNull();
    // 25 min libres sur 180 : au-dessus du plancher, mais sous les 20 % du budget.
    expect(spillOffer(ar7, null, CANDIDATS, PRIS, 155, 180)).toBeNull();
    // 40 min sur 180 : les deux seuils sont franchis.
    expect(spillOffer(ar7, null, CANDIDATS, PRIS, 140, 180)).toEqual({ ar: 7, leftoverMin: 40 });
  });

  it('ne propose pas si le budget est dépassé', () => {
    expect(spillOffer(ar7, null, CANDIDATS, PRIS, 140, 120)).toBeNull();
  });

  it('ne repropose pas une fois qu\'on a débordé', () => {
    expect(spillOffer(ar7, new Set([1, 6]), CANDIDATS, PRIS, 30, 120)).toBeNull();
  });

  it('ne propose rien hors du mode quartier', () => {
    expect(spillOffer(null, null, CANDIDATS, PRIS, 30, 120)).toBeNull();
  });

  it('ne propose rien sur une sélection multiple ou vide', () => {
    expect(spillOffer(new Set([7, 15]), null, CANDIDATS, PRIS, 30, 120)).toBeNull();
    expect(spillOffer(new Set(), null, CANDIDATS, PRIS, 30, 120)).toBeNull();
  });

  it('arrondit le reliquat affiché', () => {
    expect(spillOffer(ar7, null, CANDIDATS, PRIS, 29.4, 120).leftoverMin).toBe(91);
  });
});
