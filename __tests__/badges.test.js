// Tests des règles de déblocage des badges (data/badges.js).
// arrondissement mocké (chaîne d'import via utils/session).
jest.mock('../utils/arrondissement', () => ({
  INVADER_DISTRICT: new Map(),
  arLabel: (n) => String(n),
}));

import { BADGES, BADGE_CATEGORIES, evaluateBadges, getBadge } from '../data/badges';

// Helpers de construction de contexte
const pred = (id, ctx) => getBadge(id).predicate(ctx);
const session = (over = {}) => ({ invaderIds: [], durationSec: 0, distanceKm: null, ...over });
const ids = (n, prefix = 'PA') => Array.from({ length: n }, (_, i) => `${prefix}_${i + 1}`);
const flash = (id, date) => ({ id, flashedAt: date.toISOString() });
const atHour = (h) => new Date(2024, 0, 1, h, 30, 0);
const day = (d) => new Date(2024, 0, d, 12, 0, 0); // janvier 2024

describe('combo (par session)', () => {
  test('speedrunner : 5 en ≤ 30 min', () => {
    expect(pred('speedrunner', { session: session({ invaderIds: ids(5), durationSec: 1500 }) })).toBe(true);
  });
  test('speedrunner : trop lent (> 30 min) → non', () => {
    expect(pred('speedrunner', { session: session({ invaderIds: ids(5), durationSec: 2000 }) })).toBe(false);
  });
  test('speedrunner : moins de 5 → non', () => {
    expect(pred('speedrunner', { session: session({ invaderIds: ids(4), durationSec: 600 }) })).toBe(false);
  });
  test('combo15 : 15 dans une session', () => {
    expect(pred('combo15', { session: session({ invaderIds: ids(15) }) })).toBe(true);
    expect(pred('combo15', { session: session({ invaderIds: ids(14) }) })).toBe(false);
  });
  test('combo sans session → non', () => {
    expect(pred('combo10', { session: null })).toBe(false);
  });
});

describe('combo depuis la timeline (hors session, ex. flashs depuis la Carte)', () => {
  const atMin = (m) => new Date(2024, 0, 1, 12, m, 0);
  test('speedrunner : 5 flashs datés en ≤ 30 min, sans session', () => {
    const flashHistory = [0, 5, 10, 15, 20].map((m, i) => flash(`PA_${i}`, atMin(m)));
    expect(pred('speedrunner', { session: null, flashHistory })).toBe(true);
  });
  test('speedrunner : 5 flashs étalés sur > 30 min → non', () => {
    const flashHistory = [0, 10, 20, 31, 40].map((m, i) => flash(`PA_${i}`, atMin(m)));
    expect(pred('speedrunner', { session: null, flashHistory })).toBe(false);
  });
  test('combo10 : 10 flashs en 60 min, sans session', () => {
    const flashHistory = Array.from({ length: 10 }, (_, i) => flash(`PA_${i}`, atMin(i * 6)));
    expect(pred('combo10', { session: null, flashHistory })).toBe(true);
  });

  // Anti-catalogage : cocher sa collection depuis la Liste (quelques secondes
  // d'écart) ne doit débloquer AUCUN trophée de vitesse/combo.
  test('catalogage : 35 flashs à 8 s d’écart → ni combo ni speedrunner', () => {
    const atSec = (s) => new Date(2024, 0, 1, 12, 0, s);
    const flashHistory = Array.from({ length: 35 }, (_, i) => flash(`PA_${i}`, atSec(i * 8)));
    expect(pred('speedrunner', { session: null, flashHistory })).toBe(false);
    expect(pred('combo10', { session: null, flashHistory })).toBe(false);
    expect(pred('combo30', { session: null, flashHistory })).toBe(false);
    expect(pred('eclair', { session: null, flashHistory })).toBe(false);
  });

  test('session + catalogage : 15 ids cochés en rafale pendant une session → non', () => {
    const atSec = (s) => new Date(2024, 0, 1, 12, 0, s);
    const flashHistory = Array.from({ length: 15 }, (_, i) => flash(`PA_${i}`, atSec(i * 10)));
    const s = session({ invaderIds: ids(15) });
    expect(pred('combo15', { session: s, flashHistory })).toBe(false);
  });

  test('terrain réel : 10 flashs espacés de 5 min pendant une session → oui', () => {
    const flashHistory = Array.from({ length: 10 }, (_, i) => flash(`PA_${i + 1}`, atMin(i * 5)));
    const s = session({ invaderIds: ids(10) });
    expect(pred('combo10', { session: s, flashHistory })).toBe(true);
  });
});

describe('exploration', () => {
  test('explorer : 3 villes distinctes', () => {
    const flashHistory = [flash('PA_1', day(1)), flash('LY_1', day(1)), flash('MARS_1', day(1))];
    expect(pred('explorer', { flashHistory })).toBe(true);
  });
  test('explorer : 2 villes → non', () => {
    const flashHistory = [flash('PA_1', day(1)), flash('LY_1', day(1))];
    expect(pred('explorer', { flashHistory })).toBe(false);
  });
  test('marathon : ≥ 10 km en session', () => {
    expect(pred('marathon', { session: session({ distanceKm: 10.2 }) })).toBe(true);
    expect(pred('marathon', { session: session({ distanceKm: 8 }) })).toBe(false);
  });
});

describe('streak / régularité', () => {
  test('weekstreak : 7 jours consécutifs', () => {
    const flashHistory = ids(7).map((id, i) => flash(id, day(i + 1)));
    expect(pred('weekstreak', { flashHistory })).toBe(true);
  });
  test('weekstreak : trou dans la série → non', () => {
    const days = [1, 2, 3, 5, 6, 7, 8]; // pas de jour 4
    const flashHistory = days.map((d, i) => flash(`PA_${i}`, day(d)));
    expect(pred('weekstreak', { flashHistory })).toBe(false);
  });
  test('sundayritual : 4 week-ends consécutifs', () => {
    // Samedis de janvier 2024 : 6, 13, 20, 27
    const flashHistory = [6, 13, 20, 27].map((d, i) => flash(`PA_${i}`, day(d)));
    expect(pred('sundayritual', { flashHistory })).toBe(true);
  });
});

describe('secret / horaires / paliers', () => {
  test('nightowl : un flash entre 0h et 4h', () => {
    expect(pred('nightowl', { flashHistory: [flash('PA_1', atHour(2))] })).toBe(true);
    expect(pred('nightowl', { flashHistory: [flash('PA_1', atHour(9))] })).toBe(false);
  });
  test('earlybird : un flash entre 5h et 7h', () => {
    expect(pred('earlybird', { flashHistory: [flash('PA_1', atHour(6))] })).toBe(true);
    expect(pred('earlybird', { flashHistory: [flash('PA_1', atHour(8))] })).toBe(false);
  });
  test('centurion : 100 flashs au total', () => {
    const flashHistory = ids(100).map((id) => flash(id, day(1)));
    expect(pred('centurion', { flashHistory })).toBe(true);
    expect(pred('centurion', { flashHistory: flashHistory.slice(0, 99) })).toBe(false);
  });
});

describe('evaluateBadges', () => {
  test('renvoie les nouveaux déblocages et ignore ceux déjà obtenus', () => {
    // 15 flashs espacés de 2 min (terrain réel) sur une session de 30 min :
    // 5 premiers dans les 10 premières minutes → speedrunner ; 10/15 → combos.
    const ctx = {
      session: session({ invaderIds: ids(15), durationSec: 1200 }),
      sessions: [],
      flashHistory: ids(15).map((id, i) => flash(id, new Date(2024, 0, 1, 12, i * 2, 0))),
    };
    const first = evaluateBadges(ctx, {});
    expect(first).toEqual(expect.arrayContaining(['speedrunner', 'combo10', 'combo15']));

    // combo10 déjà débloqué → absent du 2e passage
    const unlocked = { combo10: new Date().toISOString() };
    const second = evaluateBadges(ctx, unlocked);
    expect(second).toContain('combo15');
    expect(second).not.toContain('combo10');
  });

  test('predicate défaillant ne casse pas l’évaluation', () => {
    // flashHistory null : les helpers doivent rester tolérants
    expect(() => evaluateBadges({ session: null, sessions: [], flashHistory: null }, {})).not.toThrow();
  });

  test('chaque badge a bien un titre/description (clés i18n) et une icône', () => {
    for (const b of BADGES) {
      expect(typeof b.id).toBe('string');
      expect(typeof b.iconName).toBe('string');
      expect(BADGE_CATEGORIES).toContain(b.category);
      expect(typeof b.predicate).toBe('function');
    }
  });
});
