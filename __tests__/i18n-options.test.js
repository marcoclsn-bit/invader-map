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
