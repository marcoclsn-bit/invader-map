import { normaliseDate } from '../services/flashinvaders';

// L'horodatage renvoyé par FlashInvaders est une HEURE MURALE LOCALE. Mesuré,
// pas supposé : sur un compte réel, le flash le plus récent tombait à 0,2 h de
// l'heure locale de la machine et à −1,8 h d'UTC — donc dans le futur si on
// lisait ces dates en UTC, ce qui est impossible.
//
// Cette famille de tests existe pour une seule raison : ajouter un « Z » ou un
// décalage décalerait tout l'historique de plusieurs heures. Un flash fait
// pendant un trajet sortirait de la fenêtre de sa session et le récap de fin de
// sortie afficherait zéro Invader, sans qu'aucune erreur ne soit levée.
describe('normaliseDate — horodatage FlashInvaders', () => {
  test('convertit « AAAA-MM-JJ hh:mm:ss » en ISO sans décalage', () => {
    expect(normaliseDate('2026-08-12 14:33:01')).toBe('2026-08-12T14:33:01');
  });

  test('est relue comme heure LOCALE, et non comme UTC', () => {
    const d = new Date(normaliseDate('2026-08-12 14:33:01'));
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);      // août
    expect(d.getDate()).toBe(12);
    expect(d.getHours()).toBe(14);     // 14 h locales, quel que soit le fuseau
    expect(d.getMinutes()).toBe(33);
  });

  test('ne porte aucun suffixe de fuseau', () => {
    const iso = normaliseDate('2026-08-12 14:33:01');
    expect(iso).not.toMatch(/[Zz]$/);
    expect(iso).not.toMatch(/[+-]\d{2}:?\d{2}$/);
  });

  test('accepte la forme déjà séparée par un T', () => {
    expect(normaliseDate('2026-01-05T09:07:00')).toBe('2026-01-05T09:07:00');
  });

  test('rejette tout ce qui n’est pas exactement cette forme', () => {
    for (const mauvais of ['2026-8-2 4:3:1', '2026-08-12', '12/08/2026 14:33:01',
                           'bidon', '', null, undefined, 42, {}]) {
      expect(normaliseDate(mauvais)).toBeNull();
    }
  });

  test('rejette une date syntaxiquement correcte mais impossible', () => {
    expect(normaliseDate('2026-13-45 99:99:99')).toBeNull();
  });
});
