const { planNotificationsISS } = require('../utils/issNotifications');

/**
 * Les dates sont construites en heure LOCALE (new Date(y,m,d,h)) : la logique
 * jour/nuit raisonne sur le sommeil de l'utilisateur, pas sur UTC. Les tests
 * sont donc indépendants du fuseau de la machine qui les exécute.
 */
const passage = (picLocal, fenetreSec = 15) => ({
  picMs: picLocal.getTime(),
  elevationMaxDeg: 85,
  flashableDebutMs: picLocal.getTime() - (fenetreSec / 2) * 1000,
  flashableFinMs: picLocal.getTime() + (fenetreSec / 2) * 1000,
});

describe('passage nocturne — le cas réel (04 h 12)', () => {
  const pic = new Date(2026, 7, 27, 4, 12);           // 27/08 04:12 locale
  const maintenant = new Date(2026, 7, 26, 12, 0);    // la veille, midi

  const plan = planNotificationsISS([passage(pic)], maintenant.getTime());

  test('une alerte la veille au soir, à 20 h 30', () => {
    const veille = plan.find((n) => n.type === 'veille');
    expect(veille).toBeDefined();
    const d = new Date(veille.quandMs);
    expect([d.getDate(), d.getHours(), d.getMinutes()]).toEqual([26, 20, 30]);
  });

  test('et une alerte imminente, 10 min avant la fenêtre', () => {
    const imm = plan.find((n) => n.type === 'imminent');
    expect(imm).toBeDefined();
    expect(imm.passage.flashableDebutMs - imm.quandMs).toBe(10 * 60000);
  });

  test('le plan est trié : veille d\'abord, imminente ensuite', () => {
    expect(plan.map((n) => n.type)).toEqual(['veille', 'imminent']);
  });
});

describe('passage en soirée (23 h) : la « veille » est le soir même', () => {
  const pic = new Date(2026, 7, 27, 23, 15);
  const maintenant = new Date(2026, 7, 27, 8, 0);
  const plan = planNotificationsISS([passage(pic)], maintenant.getTime());

  test('rappel à 20 h 30 le jour J, pas la veille', () => {
    const veille = plan.find((n) => n.type === 'veille');
    expect(new Date(veille.quandMs).getDate()).toBe(27);
    expect(new Date(veille.quandMs).getHours()).toBe(20);
  });
});

describe('passage diurne (15 h) : une seule alerte, aucun réveil à mettre', () => {
  const pic = new Date(2026, 7, 27, 15, 0);
  const maintenant = new Date(2026, 7, 27, 7, 0);
  const plan = planNotificationsISS([passage(pic)], maintenant.getTime());

  test('seulement l\'imminente : prévenir la veille pour 15 h serait du bruit', () => {
    expect(plan.map((n) => n.type)).toEqual(['imminent']);
  });
});

describe('le nombre d\'alertes dépend de l\'heure du passage', () => {
  test('nuit → DEUX alertes (la veille au soir, puis 10 min avant)', () => {
    const plan = planNotificationsISS(
      [passage(new Date(2026, 7, 29, 4, 12))],
      new Date(2026, 7, 28, 12, 0).getTime(),
    );
    expect(plan.map((n) => n.type)).toEqual(['veille', 'imminent']);
  });

  test('heure ouvrable → UNE seule alerte', () => {
    const plan = planNotificationsISS(
      [passage(new Date(2026, 7, 29, 14, 30))],
      new Date(2026, 7, 28, 12, 0).getTime(),
    );
    expect(plan.map((n) => n.type)).toEqual(['imminent']);
  });
});

describe('garde-fous', () => {
  test('rien dans le passé : un passage déjà survenu ne produit rien', () => {
    const pic = new Date(2026, 7, 25, 4, 0);
    const maintenant = new Date(2026, 7, 26, 12, 0);
    expect(planNotificationsISS([passage(pic)], maintenant.getTime())).toEqual([]);
  });

  test('découvert APRÈS la veille au soir : l\'imminente reste, la veille saute', () => {
    // On ouvre l'app à 22 h pour un passage à 4 h du matin : trop tard pour le
    // rappel de 20 h 30, mais l'alerte imminente reste programmable.
    const pic = new Date(2026, 7, 27, 4, 12);
    const maintenant = new Date(2026, 7, 26, 22, 0);
    const plan = planNotificationsISS([passage(pic)], maintenant.getTime());
    expect(plan.map((n) => n.type)).toEqual(['imminent']);
  });

  test('plafonné : au plus `max` passages planifiés, iOS limite à 64 notifs', () => {
    const passages = Array.from({ length: 10 }, (_, i) =>
      passage(new Date(2026, 7, 27 + i, 4, 12)));
    const plan = planNotificationsISS(passages, new Date(2026, 7, 26, 12, 0).getTime());
    const pics = new Set(plan.map((n) => n.passage.picMs));
    expect(pics.size).toBeLessThanOrEqual(3);
  });

  test('entrées vides ou nulles : tableau vide, jamais d\'erreur', () => {
    expect(planNotificationsISS([], Date.UTC(2026, 7, 26))).toEqual([]);
    expect(planNotificationsISS(null, Date.UTC(2026, 7, 26))).toEqual([]);
  });
});

describe('armePour — l\'alerte survit à la dérive du TLE', () => {
  const { armePour, TOLERANCE_MS } = require('../utils/issNotifications');

  test('un décalage de quelques secondes retrouve le passage armé', () => {
    // Le TLE se rafraîchit toutes les 12 h : le pic recalculé bouge un peu.
    // Sans tolérance, la cloche se décochait toute seule une à deux fois par jour.
    const arme = new Set([Date.UTC(2026, 8, 3, 3, 3, 21)]);
    const recalcule = Date.UTC(2026, 8, 3, 3, 3, 47); // 26 s plus tard
    expect(armePour(arme, recalcule)).not.toBeNull();
  });

  test('un décalage de plusieurs minutes aussi', () => {
    const arme = new Set([Date.UTC(2026, 8, 3, 3, 3, 21)]);
    expect(armePour(arme, Date.UTC(2026, 8, 3, 3, 12, 0))).not.toBeNull();
  });

  test('mais deux passages distincts ne se confondent jamais', () => {
    // Mesuré : deux passages au zénith d'une même nuit sont séparés de 194 min,
    // soit bien plus que la tolérance.
    const arme = new Set([Date.UTC(2026, 8, 2, 23, 49, 26)]);
    expect(armePour(arme, Date.UTC(2026, 8, 3, 3, 3, 21))).toBeNull();
    expect(TOLERANCE_MS).toBeLessThan(90 * 60000); // sous une orbite complète
  });

  test('entrées vides : jamais d\'erreur', () => {
    expect(armePour(null, Date.now())).toBeNull();
    expect(armePour(new Set(), Date.now())).toBeNull();
  });
});

describe('heure murale : tout raisonne sur le fuseau DU LIEU', () => {
  const { mural, instantMural } = require('../utils/issNotifications');

  test('lit l\'heure qu\'affiche une horloge sur place', () => {
    // 12:23 UTC le 28/08/2026 : 06:23 à Medicine Hat, 21:23 à Tokyo (déjà le 28)
    const t = Date.UTC(2026, 7, 28, 12, 23);
    expect(mural(t, 'America/Edmonton')).toMatchObject({ jour: 28, heure: 6, minute: 23 });
    expect(mural(t, 'Asia/Tokyo')).toMatchObject({ jour: 28, heure: 21, minute: 23 });
    expect(mural(t, 'Europe/Paris')).toMatchObject({ jour: 28, heure: 14, minute: 23 });
  });

  test('le jour civil change avec le fuseau', () => {
    // 23:30 UTC : on est déjà le lendemain à Tokyo, pas encore à New York.
    const t = Date.UTC(2026, 7, 28, 23, 30);
    expect(mural(t, 'Asia/Tokyo').jour).toBe(29);
    expect(mural(t, 'America/New_York').jour).toBe(28);
  });

  test('instantMural est l\'inverse exact de mural', () => {
    for (const tz of ['Europe/Paris', 'Asia/Tokyo', 'America/Edmonton', 'Pacific/Auckland']) {
      const vise = { annee: 2026, mois: 9, jour: 15, heure: 20, minute: 30 };
      const t = instantMural(vise, tz);
      expect(mural(t, tz)).toMatchObject(vise);
    }
  });

  test('resiste au changement d\'heure', () => {
    // Nuit du 25/10/2026 : la France repasse à l'heure d'hiver. 20 h 30 le soir
    // même reste 20 h 30 sur l'horloge, quel que soit le décalage appliqué.
    const t = instantMural({ annee: 2026, mois: 10, jour: 25, heure: 20, minute: 30 }, 'Europe/Paris');
    expect(mural(t, 'Europe/Paris')).toMatchObject({ jour: 25, heure: 20, minute: 30 });
  });
});

describe('le calendrier suit le fuseau du lieu, pas celui du téléphone', () => {
  const pass = (picMs) => ({
    picMs, elevationMaxDeg: 85,
    flashableDebutMs: picMs - 8000, flashableFinMs: picMs + 8000,
  });

  test('un passage nocturne à Tokyo déclenche la veille à 20 h 30 heure de Tokyo', () => {
    // 19:00 UTC le 2 septembre = 04:00 le 3 à Tokyo : nocturne LÀ-BAS.
    const pic = Date.UTC(2026, 8, 2, 19, 0);
    const plan = planNotificationsISS([pass(pic)], Date.UTC(2026, 8, 1), 3, 'Asia/Tokyo');
    expect(plan.map((n) => n.type)).toEqual(['veille', 'imminent']);
    const { mural } = require('../utils/issNotifications');
    expect(mural(plan[0].quandMs, 'Asia/Tokyo')).toMatchObject({ jour: 2, heure: 20, minute: 30 });
  });

  test('le même instant, jugé sur un autre fuseau, devient diurne', () => {
    // 19:00 UTC = 13:00 à Medicine Hat : heure ouvrable, donc une seule alerte.
    const pic = Date.UTC(2026, 8, 2, 19, 0);
    const plan = planNotificationsISS([pass(pic)], Date.UTC(2026, 8, 1), 3, 'America/Edmonton');
    expect(plan.map((n) => n.type)).toEqual(['imminent']);
  });
});
