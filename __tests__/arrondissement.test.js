import {
  INVADER_DISTRICT, ARRONDISSEMENT_CENTERS, ensureDistricts, districtOfPoint, districtRing, arLabel,
} from '../utils/arrondissement';

// Repères vérifiables à la main, loin des frontières.
const TOUR_EIFFEL = { lng: 2.2945, lat: 48.8584 };   // 7e
const PERE_LACHAISE = { lng: 2.3934, lat: 48.8614 }; // 20e
const VERSAILLES = { lng: 2.1204, lat: 48.8049 };    // hors Paris

describe('districtOfPoint', () => {
  it('situe un point dans son arrondissement', () => {
    expect(districtOfPoint(TOUR_EIFFEL.lng, TOUR_EIFFEL.lat)).toBe(7);
    expect(districtOfPoint(PERE_LACHAISE.lng, PERE_LACHAISE.lat)).toBe(20);
  });

  it('renvoie undefined hors des vingt arrondissements', () => {
    expect(districtOfPoint(VERSAILLES.lng, VERSAILLES.lat)).toBeUndefined();
  });
});

describe('ensureDistricts', () => {
  it('rattache un Invader absent du fichier embarqué', () => {
    const id = '__TEST_NOUVEAU__';
    expect(INVADER_DISTRICT.has(id)).toBe(false);
    ensureDistricts([{ id, ...TOUR_EIFFEL }]);
    expect(INVADER_DISTRICT.get(id)).toBe(7);
  });

  // La régression que le correctif visait : un Invader plus récent que
  // data/invaders.js n'avait aucun arrondissement, donc Set.has() le rejetait
  // en silence du mode quartier de la Chasse comme du décompte du Palmarès.
  it('n\'invente pas d\'arrondissement hors de Paris', () => {
    const id = '__TEST_BANLIEUE__';
    ensureDistricts([{ id, ...VERSAILLES }]);
    expect(INVADER_DISTRICT.has(id)).toBe(false);
  });

  it('est idempotent et tolère une liste vide', () => {
    const id = '__TEST_IDEM__';
    ensureDistricts([{ id, ...PERE_LACHAISE }]);
    const taille = INVADER_DISTRICT.size;
    ensureDistricts([{ id, ...PERE_LACHAISE }]);
    ensureDistricts([]);
    ensureDistricts(null);
    expect(INVADER_DISTRICT.size).toBe(taille);
  });
});

describe('districtRing', () => {
  it('rend un anneau fermé au format react-native-maps', () => {
    const ring = districtRing(7);
    expect(ring.length).toBeGreaterThan(50);
    expect(ring[0]).toEqual(expect.objectContaining({
      latitude: expect.any(Number), longitude: expect.any(Number),
    }));
    // Un contour d'arrondissement est fermé : dernier point = premier point.
    expect(ring[ring.length - 1]).toEqual(ring[0]);
    // Et il entoure bien son centroïde officiel.
    const c = ARRONDISSEMENT_CENTERS.get(7);
    expect(districtOfPoint(c.lon, c.lat)).toBe(7);
  });

  it('renvoie null pour un numéro inexistant', () => {
    expect(districtRing(21)).toBeNull();
  });
});

describe('arLabel', () => {
  it('écrit 1er puis e', () => {
    expect(arLabel(1)).toBe('1er arr.');
    expect(arLabel(7)).toBe('7e arr.');
  });
});
