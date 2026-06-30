// Pays des villes : code ISO extrait de `orsCountry` ("boundary.country=FR" → "FR")
// + noms localisés (fr/en/es/it). La France est mise en tête dans le Palmarès.

export const COUNTRY_NAMES = {
  FR: { fr: 'France',         en: 'France',          es: 'Francia',         it: 'Francia' },
  GB: { fr: 'Royaume-Uni',    en: 'United Kingdom',   es: 'Reino Unido',     it: 'Regno Unito' },
  US: { fr: 'États-Unis',     en: 'United States',    es: 'Estados Unidos',  it: 'Stati Uniti' },
  NL: { fr: 'Pays-Bas',       en: 'Netherlands',      es: 'Países Bajos',    it: 'Paesi Bassi' },
  BE: { fr: 'Belgique',       en: 'Belgium',          es: 'Bélgica',         it: 'Belgio' },
  CH: { fr: 'Suisse',         en: 'Switzerland',      es: 'Suiza',           it: 'Svizzera' },
  DE: { fr: 'Allemagne',      en: 'Germany',          es: 'Alemania',        it: 'Germania' },
  TR: { fr: 'Turquie',        en: 'Turkey',           es: 'Turquía',         it: 'Turchia' },
  IT: { fr: 'Italie',         en: 'Italy',            es: 'Italia',          it: 'Italia' },
  ES: { fr: 'Espagne',        en: 'Spain',            es: 'España',          it: 'Spagna' },
  SE: { fr: 'Suède',          en: 'Sweden',           es: 'Suecia',          it: 'Svezia' },
  AT: { fr: 'Autriche',       en: 'Austria',          es: 'Austria',         it: 'Austria' },
  SI: { fr: 'Slovénie',       en: 'Slovenia',         es: 'Eslovenia',       it: 'Slovenia' },
  IL: { fr: 'Israël',         en: 'Israel',           es: 'Israel',          it: 'Israele' },
  PT: { fr: 'Portugal',       en: 'Portugal',         es: 'Portugal',        it: 'Portogallo' },
  MA: { fr: 'Maroc',          en: 'Morocco',          es: 'Marruecos',       it: 'Marocco' },
  TN: { fr: 'Tunisie',        en: 'Tunisia',          es: 'Túnez',           it: 'Tunisia' },
  JP: { fr: 'Japon',          en: 'Japan',            es: 'Japón',           it: 'Giappone' },
  HK: { fr: 'Hong Kong',      en: 'Hong Kong',        es: 'Hong Kong',       it: 'Hong Kong' },
  TH: { fr: 'Thaïlande',      en: 'Thailand',         es: 'Tailandia',       it: 'Thailandia' },
  KR: { fr: 'Corée du Sud',   en: 'South Korea',      es: 'Corea del Sur',   it: 'Corea del Sud' },
  NP: { fr: 'Népal',          en: 'Nepal',            es: 'Nepal',           it: 'Nepal' },
  BR: { fr: 'Brésil',         en: 'Brazil',           es: 'Brasil',          it: 'Brasile' },
  MX: { fr: 'Mexique',        en: 'Mexico',           es: 'México',          it: 'Messico' },
  BO: { fr: 'Bolivie',        en: 'Bolivia',          es: 'Bolivia',         it: 'Bolivia' },
  AU: { fr: 'Australie',      en: 'Australia',        es: 'Australia',       it: 'Australia' },
  DZ: { fr: 'Algérie',        en: 'Algeria',          es: 'Argelia',         it: 'Algeria' },
  KE: { fr: 'Kenya',          en: 'Kenya',            es: 'Kenia',           it: 'Kenya' },
};

// Libellé du groupe « sans pays connu »
const OTHER = { fr: 'Autres', en: 'Other', es: 'Otros', it: 'Altri' };

/** Code pays ISO d'une ville (ou null si inconnu). */
export function countryCodeOf(city) {
  const m = city?.orsCountry?.match(/=\s*([A-Za-z]{2})/);
  return m ? m[1].toUpperCase() : null;
}

/** Nom localisé d'un pays (ou « Autres » si code null/inconnu). */
export function countryName(code, lang = 'fr') {
  const entry = code && COUNTRY_NAMES[code];
  if (!entry) return OTHER[lang] ?? OTHER.fr;
  return entry[lang] ?? entry.fr;
}
