// Tests de failureReason (services/analytics.js).
//
// Enjeu : les erreurs de routing.js sont levées DÉJÀ TRADUITES. Si la
// normalisation cesse de les reconnaître, tous les échecs tombent en « other »
// et la mesure devient muette — sans que rien ne casse visiblement. D'où ce test.
//
// On mocke i18n (module natif expo-localization, non chargeable sous Node) et le
// SDK Aptabase, en gardant les VRAIS textes français du fichier de traduction.
import fr from '../locales/fr.json';

const tr = (key, vars) => {
  const raw = key.split('.').reduce((o, k) => o?.[k], fr);
  if (typeof raw !== 'string') return key;
  return raw.replace(/\{\{(\w+)\}\}/g, (_, n) => vars?.[n] ?? '');
};

jest.mock('../i18n', () => ({ __esModule: true, default: { t: (k, v) => tr(k, v) } }));
jest.mock('@aptabase/react-native', () => ({
  __esModule: true, default: { init: jest.fn() }, trackEvent: jest.fn(),
}));

import { failureReason } from '../services/analytics';

describe('failureReason', () => {
  test('reconnaît le plafond d’API, le seul vrai quota de l’app', () => {
    expect(failureReason(new Error(tr('routing.error.limit')))).toBe('api_limit');
  });

  test('reconnaît un itinéraire introuvable', () => {
    expect(failureReason(new Error(tr('routing.error.routeNotFound')))).toBe('route_not_found');
  });

  test('reconnaît l’absence d’Invader atteignable', () => {
    expect(failureReason(new Error(tr('hunt.error.noInvadersReachable')))).toBe('no_invaders');
  });

  test('n’expose JAMAIS l’adresse saisie par l’utilisateur', () => {
    const saisie = '12 rue de mon domicile';
    const r = failureReason(new Error(tr('routing.error.addressNotFoundFor', { text: saisie })));
    expect(r).toBe('address_not_found');
    expect(r).not.toContain(saisie);
    expect(r).not.toMatch(/rue|domicile|\d/);
  });

  test('classe les erreurs HTTP à part', () => {
    expect(failureReason(new Error('HTTP 502'))).toBe('http_error');
  });

  test('reste défini sur une erreur vide ou absente', () => {
    expect(failureReason(new Error(''))).toBe('unknown');
    expect(failureReason(null)).toBe('unknown');
    expect(failureReason(undefined)).toBe('unknown');
  });

  test('ne renvoie que des identifiants stables, jamais du texte traduit', () => {
    const cas = [
      tr('routing.error.limit'), tr('routing.error.routeNotFound'),
      tr('hunt.error.noInvadersReachable'), 'quelque chose d’inattendu', 'HTTP 500',
    ];
    for (const msg of cas) {
      expect(failureReason(new Error(msg))).toMatch(/^[a-z_]+$/);
    }
  });
});
