// Renommés : `it` masquerait le `it()` de Jest, et le fichier ne se chargerait
// même pas. C'est le test lui-même qui l'a attrapé.
import francais from '../locales/fr.json';
import anglais from '../locales/en.json';
import espagnol from '../locales/es.json';
import italien from '../locales/it.json';

// `lng` est une OPTION RÉSERVÉE d'i18next : elle force la langue de traduction.
// Une chaîne qui déclare {{lng}} pousse donc l'appelant à écrire
// t('cle', { lng: 5.44 }), ce qui demande de traduire dans la langue « 5.44 » :
// i18next tente `lng.toLowerCase()` sur un nombre et lève.
//
// Ça a cassé le signalement de statut pendant des semaines, silencieusement,
// l'exception survenant avant toute ouverture de compositeur ou de partage.
// Le même piège existe pour les autres options réservées.
const RESERVEES = ['lng', 'lngs', 'ns', 'context', 'defaultValue', 'replace', 'returnObjects'];

function chaines(objet, prefixe = '') {
  const out = [];
  for (const [k, v] of Object.entries(objet)) {
    if (typeof v === 'string') out.push([prefixe + k, v]);
    else if (Array.isArray(v)) v.forEach((x, i) => typeof x === 'string' && out.push([`${prefixe}${k}[${i}]`, x]));
    else if (v && typeof v === 'object') out.push(...chaines(v, `${prefixe}${k}.`));
  }
  return out;
}

describe('interpolations i18next', () => {
  for (const [langue, dict] of Object.entries({ fr: francais, en: anglais, es: espagnol, it: italien })) {
    it(`${langue} n'utilise aucun nom d'option réservée comme variable`, () => {
      const fautives = [];
      for (const [cle, texte] of chaines(dict)) {
        for (const m of texte.matchAll(/\{\{\s*([a-zA-Z0-9_]+)/g)) {
          if (RESERVEES.includes(m[1])) fautives.push(`${cle} → {{${m[1]}}}`);
        }
      }
      expect(fautives).toEqual([]);
    });
  }
});

// ─── Notifications du mode explorateur ────────────────────────────────────────

describe('paires de notification en mode explorateur', () => {
  const LANGUES = { fr: francais, en: anglais, es: espagnol, it: italien };

  test('les quatre langues ont le même nombre de paires, toutes complètes', () => {
    const tailles = new Set();
    for (const [langue, dict] of Object.entries(LANGUES)) {
      const paires = dict.stroll.notif.blindAlerts;
      expect(Array.isArray(paires)).toBe(true);
      tailles.add(paires.length);
      for (const p of paires) {
        expect(typeof p.title).toBe('string');
        expect(typeof p.body).toBe('string');
        expect(p.title.length).toBeGreaterThan(0);
        expect(p.body.length).toBeGreaterThan(0);
        // Aucune ne doit nommer un Invader : c'est la promesse du mode.
        expect(`${langue} ${p.title} ${p.body}`).not.toMatch(/\{\{|\{id\}|[A-Z]{2,5}_\d/);
      }
    }
    expect(tailles.size).toBe(1);
  });

  // Le titre est coupé par iOS bien avant le corps. Budget mesuré sur appareil
  // (capture du 2026-08-09) : « Quelque chose dans les parag » est exactement ce
  // qui tenait, soit 28 caractères sur un écran de 402 pt. On garde une marge
  // pour les écrans de 375 pt, d'où 24. Garde-fou grossier — la vraie mesure est
  // en pixels — mais il attrape une traduction qui déborde franchement.
  test('aucun titre ne dépasse 24 caractères', () => {
    for (const [langue, dict] of Object.entries(LANGUES)) {
      for (const p of dict.stroll.notif.blindAlerts) {
        expect(`${langue}: ${p.title} (${p.title.length})`).toBe(
          `${langue}: ${p.title} (${p.title.length <= 24 ? p.title.length : 'TROP LONG'})`,
        );
      }
    }
  });
});

// Marco a demandé deux fois de les retirer : un test vaut mieux qu'une intention.
describe('typographie', () => {
  test('aucun cadratin dans les quatre langues', () => {
    for (const [langue, dict] of Object.entries({ fr: francais, en: anglais, es: espagnol, it: italien })) {
      const plat = JSON.stringify(dict);
      expect(`${langue}:${(plat.match(/—/g) ?? []).length}`).toBe(`${langue}:0`);
    }
  });
});
