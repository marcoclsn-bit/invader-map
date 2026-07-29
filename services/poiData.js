// services/poiData.js — Points d'intérêt touristiques (« Chasse & visite »).
//
// V1 : Paris uniquement, fichier embarqué dans le bundle (27 Ko — négligeable,
// et zéro requête réseau). Quand d'autres villes arriveront, il suffira de
// remplacer getPois() par un chargement distant + cache, comme invaderData.
//
// Données : lieux et notoriété Wikidata (CC0) ; résumés rédigés d'après les
// articles Wikipédia (CC BY-SA) — l'attribution est affichée sur la fiche.

import PA from '../data/poi_PA.json';

const CITY_FILES = { PA };

/** Liste des POI d'une ville (tableau vide si la ville n'en a pas). */
export function getPois(cityCode) {
  return CITY_FILES[cityCode]?.pois ?? [];
}

/** true si la ville dispose d'assez de lieux pour proposer le mode visite. */
export function hasPois(cityCode) {
  return getPois(cityCode).length >= 10;
}

/** URL de l'article Wikipédia (bouton « Voir plus »). */
export function wikiUrl(poi) {
  if (!poi?.wiki) return null;
  return `https://fr.wikipedia.org/wiki/${encodeURIComponent(poi.wiki.replace(/ /g, '_'))}`;
}
