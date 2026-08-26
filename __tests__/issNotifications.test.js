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

describe('passage diurne (15 h) : rappel du matin, pas de réveil à mettre', () => {
  const pic = new Date(2026, 7, 27, 15, 0);
  const maintenant = new Date(2026, 7, 27, 7, 0);
  const plan = planNotificationsISS([passage(pic)], maintenant.getTime());

  test('un rappel à 9 h et l\'imminente, aucune « veille »', () => {
    expect(plan.map((n) => n.type)).toEqual(['matin', 'imminent']);
    expect(new Date(plan[0].quandMs).getHours()).toBe(9);
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
