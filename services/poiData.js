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

const KEY = (code) => `@invader_poi_${code}`;

// Version embarquée, immuable, toujours disponible.
const BUNDLED = { PA };

// Versions plus récentes chargées depuis le cache ou le réseau.
const _fresh = new Map();   // code -> { version, updatedAt, pois }

let _notify = null;

/** Liste des POI d'une ville (tableau vide si la ville n'en a pas). */
export function getPois(cityCode) {
  return (_fresh.get(cityCode) ?? BUNDLED[cityCode])?.pois ?? [];
}

/** true si la ville dispose d'assez de lieux pour proposer le mode visite. */
export function hasPois(cityCode) {
  return getPois(cityCode).length >= 10;
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

  if (bougé) _notify?.();
  return bougé ? 'updated' : 'up_to_date';
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
