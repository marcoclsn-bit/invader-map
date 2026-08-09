// Saisie du volet explorateur. Le format tapé sur le trottoir n'est pas le
// format stocké : « 284 » doit devenir l'identifiant réel de l'Invader, et cet
// identifiant pade le numéro sur deux chiffres (PA_01, jamais PA_1).

import { normaliseSaisie, analyseListe } from '../utils/importList';

describe('normaliseSaisie', () => {
  test('laisse intact un identifiant complet', () => {
    expect(normaliseSaisie('PA_284', 'PA')).toBe('PA_284');
  });

  test('recolle un indicatif sans souligné, quelle que soit la casse', () => {
    for (const saisie of ['pa284', 'PA 284', 'pa-284', 'Pa.284']) {
      expect(normaliseSaisie(saisie, 'PA')).toBe('PA_284');
    }
  });

  test('complète un numéro seul avec la ville courante', () => {
    expect(normaliseSaisie('284', 'PA')).toBe('PA_284');
    expect(normaliseSaisie('284', 'LDN')).toBe('LDN_284');
    expect(normaliseSaisie('  284  ', 'PA')).toBe('PA_284');
  });

  test('ne touche pas à un texte collé qui contient déjà un identifiant', () => {
    expect(normaliseSaisie('YOU FOUND PA_554', 'PA')).toBe('YOU FOUND PA_554');
  });

  test('ne fabrique rien sans ville de repli', () => {
    expect(normaliseSaisie('284', null)).toBe('284');
  });

  test('supporte le vide et le non-numérique', () => {
    expect(normaliseSaisie('', 'PA')).toBe('');
    expect(normaliseSaisie(null, 'PA')).toBe('');
    expect(normaliseSaisie('bonjour', 'PA')).toBe('BONJOUR');
  });
});

describe('identifiant canonique', () => {
  const vide = new Set();

  test("un numéro à un chiffre rend l'identifiant padé, pas le jeton tapé", () => {
    // PA_1 n'existe pas : le premier Invader de Paris est PA_01. Écrire le jeton
    // brut dans les flashés perdait le flash en silence.
    expect(analyseListe(normaliseSaisie('1', 'PA'), vide).nouveaux).toEqual(['PA_01']);
  });

  test('les zéros de tête superflus sont normalisés', () => {
    expect(analyseListe('PA_0042', vide).nouveaux).toEqual(['PA_42']);
  });

  test('un numéro à trois ou quatre chiffres est inchangé', () => {
    expect(analyseListe(normaliseSaisie('284', 'PA'), vide).nouveaux).toEqual(['PA_284']);
    expect(analyseListe(normaliseSaisie('1265', 'PA'), vide).nouveaux).toEqual(['PA_1265']);
  });

  test('« déjà flashé » se compare sur la forme canonique', () => {
    const deja = new Set(['PA_01']);
    const r = analyseListe(normaliseSaisie('1', 'PA'), deja);
    expect(r.nouveaux).toEqual([]);
    expect(r.dejaFlashes).toEqual(['PA_01']);
  });

  test('un numéro hors de la ville reste inconnu', () => {
    expect(analyseListe(normaliseSaisie('9999', 'PA'), vide).inconnus.length).toBe(1);
  });
});
