// services/poiData.js — Points d'intérêt touristiques (« Chasse & visite »).
//
// Le fichier embarqué dans le bundle sert de base : l'app fonctionne hors ligne
// et dès la première seconde. Un exemplaire plus récent peut ensuite être
// récupéré depuis le dépôt, mis en cache, et prendre le relais — même principe
// que invaderData, dont on reprend l'hébergement.
//
// Pourquoi c'est nécessaire : les lieux bougent. La Fondation Cartier a
// déménagé au Palais-Royal en 2025, le musée de l'Érotisme a fermé, des
// résumés ont dû être corrigés. Sans ce mécanisme, chaque correction imposerait
// une mise à jour complète de l'app sur les magasins.
//
// Données : lieux et notoriété Wikidata (CC0) ; résumés rédigés d'après les
// articles Wikipédia (CC BY-SA) — l'attribution est affichée sur la fiche.

import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from '../i18n';
import PA from '../data/poi_PA.json';

const BASE_URL  = 'https://raw.githubusercontent.com/marcoclsn-bit/invader-map/main/data';
const INDEX_URL = `${BASE_URL}/poi_index.json`;
const cityUrl   = (code) => `${BASE_URL}/poi_${code}.json`;
const langUrl   = (code, lang) => `${BASE_URL}/poi_${code}_${lang}.json`;

const KEY      = (code) => `@invader_poi_${code}`;
const KEY_LANG = (code, lang) => `@invader_poi_${code}_${lang}`;

// Les résumés traduits ne sont PAS embarqués : ils pèsent environ 196 Ko par
// langue, et le fichier de base part déjà dans chaque mise à jour par-dessus
// les airs. Un francophone ne doit pas porter le poids de l'italien. Ils sont
// donc téléchargés à la première ouverture dans une langue non française, puis
// gardés en cache. Tant qu'ils ne sont pas là, on affiche le français.

// Version embarquée, immuable, toujours disponible.
const BUNDLED = { PA };

// Versions plus récentes chargées depuis le cache ou le réseau.
const _fresh = new Map();   // code -> { version, updatedAt, pois }

// Résumés traduits, par ville et par langue.
const _trad = new Map();    // `${code}:${lang}` -> { version, summaries }
// Téléchargements en cours, pour ne pas lancer deux fois le même : setPoiLanguage
// est appelé au démarrage par l'initialisation ET par l'effet qui suit la langue.
// Sans ce garde, un utilisateur non francophone téléchargeait le paquet en double.
const _enCours = new Map(); // `${code}:${lang}` -> Promise

let _notify = null;
let _lang = 'fr';

/** Liste des POI d'une ville (tableau vide si la ville n'en a pas). */
export function getPois(cityCode) {
  return (_fresh.get(cityCode) ?? BUNDLED[cityCode])?.pois ?? [];
}

/** true si la ville dispose d'assez de lieux pour proposer le mode visite. */
export function hasPois(cityCode) {
  return getPois(cityCode).length >= 10;
}

/**
 * Résumé d'un lieu dans la langue de l'app, avec repli sur le français.
 * Les écrans doivent passer par ici plutôt que de lire `poi.summary`.
 */
export function summaryOf(poi, cityCode = 'PA') {
  if (_lang === 'fr') return poi?.summary ?? '';
  return _trad.get(`${cityCode}:${_lang}`)?.summaries?.[poi?.id] ?? poi?.summary ?? '';
}

/** true si les résumés sont affichés dans une autre langue que le français. */
export function isTranslated(cityCode = 'PA') {
  return _lang !== 'fr' && !!_trad.get(`${cityCode}:${_lang}`);
}

/** Version actuellement servie (affichée dans les Réglages). */
export function getPoiVersion(cityCode) {
  return (_fresh.get(cityCode) ?? BUNDLED[cityCode])?.version ?? null;
}

/**
 * À appeler une fois au démarrage. Restaure le cache (synchrone du point de vue
 * de l'utilisateur), puis vérifie le réseau en arrière-plan sans bloquer.
 * `onUpdate` est appelé si les données servies changent.
 */
export async function initPoiService(onUpdate) {
  _notify = onUpdate ?? null;
  for (const code of Object.keys(BUNDLED)) {
    try {
      const raw = await AsyncStorage.getItem(KEY(code));
      if (!raw) continue;
      const cached = JSON.parse(raw);
      // Le bundle peut être plus récent que le cache après une mise à jour de
      // l'app : on ne garde le cache que s'il apporte réellement du neuf.
      if (cached?.pois?.length && cached.version > BUNDLED[code].version) {
        _fresh.set(code, cached);
      } else {
        await AsyncStorage.removeItem(KEY(code));
      }
    } catch (_) { /* cache illisible → on reste sur le bundle */ }
  }
  await setPoiLanguage(i18n.language);
  checkPoiUpdate().catch(() => {});
}

/**
 * Vérifie l'index distant et télécharge les villes dont la version a bougé.
 * Renvoie 'up_to_date' | 'updated' | 'offline'.
 */
export async function checkPoiUpdate(cityCode = null) {
  let index;
  try {
    const r = await fetch(INDEX_URL, { cache: 'no-store' });
    if (!r.ok) return 'offline';
    index = await r.json();
  } catch (_) {
    return 'offline';
  }

  const codes = cityCode ? [cityCode] : Object.keys(BUNDLED);
  let bougé = false;

  for (const code of codes) {
    const distante = index?.cities?.[code]?.version;
    if (!distante || distante <= (getPoiVersion(code) ?? 0)) continue;
    try {
      const r = await fetch(cityUrl(code), { cache: 'no-store' });
      if (!r.ok) continue;
      const json = await r.json();
      if (!Array.isArray(json?.pois) || json.pois.length < 10) continue; // garde-fou
      const payload = { version: json.version, updatedAt: json.updatedAt, pois: json.pois };
      _fresh.set(code, payload);
      await AsyncStorage.setItem(KEY(code), JSON.stringify(payload));
      bougé = true;
    } catch (_) { /* on garde ce qu'on a */ }
  }

  // Traductions : une correction doit atteindre ceux qui ont déjà téléchargé.
  if (_lang !== 'fr') {
    for (const code of codes) {
      const attendue = index?.cities?.[code]?.langs?.[_lang];
      const enPlace = _trad.get(`${code}:${_lang}`)?.version ?? 0;
      if (attendue && attendue > enPlace) {
        try { await prefetchTranslations(code, _lang); bougé = true; } catch (_) { /* on garde */ }
      }
    }
  }

  if (bougé) _notify?.();
  return bougé ? 'updated' : 'up_to_date';
}

/**
 * Fixe la langue des résumés. À appeler au démarrage et à chaque changement de
 * langue dans les Réglages. Restaure le cache si présent, sinon télécharge en
 * arrière-plan sans bloquer l'affichage : d'ici là, le français fait office de
 * repli. `onUpdate` est rappelé quand les traductions arrivent.
 */
export async function setPoiLanguage(lang) {
  const code = (lang || 'fr').split('-')[0];
  _lang = ['en', 'es', 'it'].includes(code) ? code : 'fr';
  if (_lang === 'fr') { _notify?.(); return; }

  for (const city of Object.keys(BUNDLED)) {
    const key = `${city}:${_lang}`;
    if (_trad.has(key)) continue;             // déjà en mémoire
    try {
      const raw = await AsyncStorage.getItem(KEY_LANG(city, _lang));
      if (raw) {
        const cached = JSON.parse(raw);
        if (cached?.summaries) { _trad.set(key, cached); continue; }
      }
    } catch (_) { /* cache illisible */ }
    prefetchTranslations(city, _lang);
  }
  _notify?.();
}

/** Lance le téléchargement d'une langue, ou rejoint celui déjà en cours. */
function prefetchTranslations(city, lang) {
  const key = `${city}:${lang}`;
  if (_trad.has(key)) return Promise.resolve();
  let p = _enCours.get(key);
  if (!p) {
    p = fetchTranslations(city, lang)
      .catch(() => {})
      .finally(() => _enCours.delete(key));
    _enCours.set(key, p);
  }
  return p;
}

/** Télécharge et met en cache les résumés traduits d'une ville. */
async function fetchTranslations(city, lang) {
  const r = await fetch(langUrl(city, lang), { cache: 'no-store' });
  if (!r.ok) return;
  const json = await r.json();
  if (!json?.summaries || Object.keys(json.summaries).length < 10) return;  // garde-fou
  const payload = { version: json.version ?? 1, summaries: json.summaries };
  _trad.set(`${city}:${lang}`, payload);
  await AsyncStorage.setItem(KEY_LANG(city, lang), JSON.stringify(payload));
  if (lang === _lang) _notify?.();            // la langue n'a pas changé entre-temps
}

/**
 * URL de l'article Wikipédia (bouton « Voir plus »), dans la langue de l'app.
 *
 * Les résumés sont en français, mais l'article complet existe souvent dans la
 * langue de l'utilisateur : 88 % des lieux ont une page anglaise, 65 % une
 * espagnole, 61 % une italienne. Les titres correspondants sont dans `alt`.
 * À défaut, on retombe sur le français plutôt que sur une page d'erreur.
 */
export function wikiUrl(poi) {
  if (!poi?.wiki) return null;
  const lang = (i18n.language || 'fr').split('-')[0];
  const title = lang !== 'fr' ? poi.alt?.[lang] : null;
  const host = title ? lang : 'fr';
  const page = title ?? poi.wiki;
  return `https://${host}.wikipedia.org/wiki/${encodeURIComponent(page.replace(/ /g, '_'))}`;
}
