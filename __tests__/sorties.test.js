const { decouperSorties, traceSortie, heureInconnue, TROU_MS } = require('../utils/sorties');

// Raccourci : « 12 14:30 » → « 2026-08-12T14:30:00 »
const d = (jour, heure) => `2026-08-${String(jour).padStart(2, '0')}T${heure}:00`;
const carte = (paires) => new Map(paires);

describe('découpage en sorties', () => {
  test('une balade continue forme une seule sortie', () => {
    const s = decouperSorties(carte([
      ['PA_01', d(12, '14:00')],
      ['PA_02', d(12, '14:20')],
      ['PA_03', d(12, '15:10')],
    ]));
    expect(s).toHaveLength(1);
    expect(s[0].invaderIds).toEqual(['PA_01', 'PA_02', 'PA_03']);
    expect(s[0].startedAt).toBe(d(12, '14:00'));
    expect(s[0].endedAt).toBe(d(12, '15:10'));
  });

  test('un trou de plus de 90 minutes sépare deux sorties', () => {
    const s = decouperSorties(carte([
      ['PA_01', d(12, '10:00')], ['PA_02', d(12, '10:30')],
      ['PA_03', d(12, '13:00')], ['PA_04', d(12, '13:20')],
    ]));
    expect(s).toHaveLength(2);
    // La plus récente en tête : c'est celle qu'on veut proposer d'abord.
    expect(s[0].invaderIds).toEqual(['PA_03', 'PA_04']);
    expect(s[1].invaderIds).toEqual(['PA_01', 'PA_02']);
  });

  test('une pause déjeuner d’une heure ne coupe PAS la sortie', () => {
    // Le motif exact qui a fait retenir 90 min plutôt que 60.
    const s = decouperSorties(carte([
      ['PA_01', d(12, '11:30')], ['PA_02', d(12, '12:00')],
      ['PA_03', d(12, '13:05')], ['PA_04', d(12, '13:30')],
    ]));
    expect(s).toHaveLength(1);
    expect(s[0].invaderIds).toHaveLength(4);
  });

  test('un changement de ville coupe, même sans trou', () => {
    // Paris le matin, Lyon l'après-midi : en train, l'écart est court.
    const s = decouperSorties(carte([
      ['PA_01', d(12, '11:00')], ['PA_02', d(12, '11:10')],
      ['LY_01', d(12, '11:40')], ['LY_02', d(12, '11:50')],
    ]));
    expect(s).toHaveLength(2);
    expect(s.map((x) => x.city).sort()).toEqual(['LY', 'PA']);
  });

  test('un flash isolé ne fait pas une sortie', () => {
    const s = decouperSorties(carte([
      ['PA_01', d(12, '09:00')],                       // croisé en allant au travail
      ['PA_02', d(12, '18:00')], ['PA_03', d(12, '18:20')],
    ]));
    expect(s).toHaveLength(1);
    expect(s[0].invaderIds).toEqual(['PA_02', 'PA_03']);
  });

  test('les heures inconnues (minuit pile) sont écartées', () => {
    // FlashInvaders renvoie parfois 00:00:00 : la date est connue, pas l'heure.
    // Les garder collerait ces flashs à la soirée de la veille.
    expect(heureInconnue(d(12, '00:00'))).toBe(true);
    expect(heureInconnue(d(12, '14:00'))).toBe(false);
    const s = decouperSorties(carte([
      ['PA_09', d(12, '00:00')], ['PA_10', d(12, '00:00')],
      ['PA_01', d(12, '14:00')], ['PA_02', d(12, '14:30')],
    ]));
    expect(s).toHaveLength(1);
    expect(s[0].invaderIds).toEqual(['PA_01', 'PA_02']);
  });

  test('l’identifiant est déterministe et ne dépend pas de l’ordre d’insertion', () => {
    // Ce que ça protège : `addSession` empile sans dédupliquer. Un identifiant
    // tiré au hasard ferait compter deux fois la même sortie le jour où on
    // l'enregistrera, et le badge des dix sessions se débloquerait à coups de
    // partages répétés.
    const a = decouperSorties(carte([['PA_01', d(12, '14:00')], ['PA_02', d(12, '14:30')]]));
    const b = decouperSorties(carte([['PA_02', d(12, '14:30')], ['PA_01', d(12, '14:00')]]));
    expect(a[0].id).toBe(b[0].id);
    expect(a[0].id).toMatch(/^out_PA_\d+$/);
  });

  test('entrées illisibles, vides ou absentes : jamais de plantage', () => {
    expect(decouperSorties(null)).toEqual([]);
    expect(decouperSorties(new Map())).toEqual([]);
    expect(decouperSorties(carte([['PA_01', null], ['PA_02', 'pas une date']]))).toEqual([]);
    // Une seule date valide sur trois entrées : sous le minimum, donc rien.
    expect(decouperSorties(carte([['PA_01', d(12, '14:00')], ['PA_02', 'zzz']]))).toEqual([]);
  });

  test('le seuil de rupture est exactement TROU_MS', () => {
    const base = new Date(d(12, '10:00')).getTime();
    const iso = (ms) => new Date(base + ms).toISOString().slice(0, 19);
    // Pile au seuil : pas de rupture (la coupure est stricte).
    expect(decouperSorties(carte([['PA_01', iso(0)], ['PA_02', iso(TROU_MS)]]))).toHaveLength(1);
    expect(decouperSorties(carte([['PA_01', iso(0)], ['PA_02', iso(TROU_MS + 1000)]]))).toEqual([]);
  });
});

describe('tracé d’une sortie', () => {
  const invaders = [
    { id: 'PA_01', lat: 48.85, lng: 2.35 },
    { id: 'PA_02', lat: 48.86, lng: 2.36 },
    { id: 'PA_03', lat: 48.87, lng: 2.37 },
  ];

  test('les points suivent l’ordre chronologique, en [lon, lat]', () => {
    const sortie = { invaderIds: ['PA_01', 'PA_02', 'PA_03'] };
    // Ordre GeoJSON, comme routeCoords : longitude d'abord. L'inverser mettrait
    // la balade au large de la Somalie.
    expect(traceSortie(sortie, invaders)).toEqual([[2.35, 48.85], [2.36, 48.86], [2.37, 48.87]]);
  });

  test('les mosaïques inconnues sont ignorées sans casser le tracé', () => {
    const sortie = { invaderIds: ['PA_01', 'ZZ_99', 'PA_03'] };
    expect(traceSortie(sortie, invaders)).toEqual([[2.35, 48.85], [2.37, 48.87]]);
  });

  test('moins de deux points : pas de tracé', () => {
    expect(traceSortie({ invaderIds: ['PA_01'] }, invaders)).toBeNull();
    expect(traceSortie({ invaderIds: [] }, invaders)).toBeNull();
    expect(traceSortie(null, invaders)).toBeNull();
  });
});

describe('plafond d’affichage', () => {
  // Le cas réel : quelqu'un importe dix ans de FlashInvaders. Des centaines de
  // sorties, un écran impraticable, et autant d'occasions d'ouvrir un récap —
  // chacun demandant un itinéraire au réseau.
  const beaucoup = () => {
    const m = new Map();
    for (let j = 1; j <= 120; j += 1) {
      const jour = String((j % 28) + 1).padStart(2, '0');
      const mois = String((j % 12) + 1).padStart(2, '0');
      m.set(`PA_${j}a`, `2020-${mois}-${jour}T10:00:00`);
      m.set(`PA_${j}b`, `2020-${mois}-${jour}T10:20:00`);
    }
    return m;
  };

  test('la liste est plafonnée, et garde les plus RÉCENTES', () => {
    const { MAX_SORTIES } = require('../utils/sorties');
    const s = decouperSorties(beaucoup());
    expect(s).toHaveLength(MAX_SORTIES);
    // Décroissant strict : la première est bien la plus récente de toutes.
    const dates = s.map((x) => new Date(x.startedAt).getTime());
    expect([...dates].sort((a, b) => b - a)).toEqual(dates);
    const toutes = decouperSorties(beaucoup(), { maxSorties: Infinity });
    expect(toutes.length).toBeGreaterThan(MAX_SORTIES);
    expect(s[0].id).toBe(toutes[0].id);
  });
});
