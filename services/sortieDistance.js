import AsyncStorage from '@react-native-async-storage/async-storage';
import { multiRoute } from './routing';

/**
 * Distance réellement marchée pendant une sortie reconstituée.
 *
 * POURQUOI PAS UNE SOMME DE LIGNES DROITES. Personne ne marche d'une mosaïque à
 * l'autre à vol d'oiseau : on suit des rues, on contourne des pâtés. Sur une
 * sortie parisienne dense, l'écart atteint facilement 30 %. Annoncer 5 km à qui
 * en a marché 7 sur une image destinée à être partagée, c'est publier un chiffre
 * faux sous son nom.
 *
 * On demande donc un VRAI itinéraire piéton, avec le service déjà utilisé par le
 * Trajet et la Chasse. Les sessions guidées, elles, mesurent au GPS : elles ne
 * passent pas par ici.
 *
 * LE CACHE EST CE QUI REND LA CHOSE VIABLE, et il repose entièrement sur
 * l'identifiant déterministe des sorties. Une sortie ne change plus une fois
 * terminée : sa distance est calculée UNE FOIS dans la vie de l'appareil, puis
 * relue. Rouvrir un récap dix fois ne coûte rien. C'est le bénéfice concret de
 * n'avoir pas tiré cet identifiant au hasard.
 */

const CLE = '@invader_sortie_km';
// Borne du cache : une entrée pèse ~30 octets, mais rien ne justifie de le
// laisser croître sans fin. Les sorties anciennes sont les moins rouvertes.
const MAX_ENTREES = 200;

async function lire() {
  try { return JSON.parse(await AsyncStorage.getItem(CLE)) || {}; }
  catch { return {}; }
}

/**
 * @param {string} sortieId   identifiant DÉTERMINISTE (voir utils/sorties.js)
 * @param {Array<[number,number]>} trace  [[lon, lat], …] dans l'ordre chronologique
 * @returns {Promise<number|null>} kilomètres, ou null si indisponible
 */
export async function distanceSortie(sortieId, trace) {
  if (!sortieId || !trace || trace.length < 2) return null;

  const cache = await lire();
  // `null` mis en cache = « déjà tenté, sans succès ». On ne le distingue pas
  // d'une absence : un échec vient presque toujours du réseau ou du quota, deux
  // choses qui changent. Retenter à la prochaine ouverture est le bon défaut.
  if (typeof cache[sortieId] === 'number') return cache[sortieId];

  let km = null;
  try {
    const r = await multiRoute(trace, 'foot-walking');
    km = Number.isFinite(r?.distanceKm) ? r.distanceKm : null;
  } catch {
    // Hors ligne, quota épuisé, aucun itinéraire piéton entre deux points : le
    // récap affichera « — », exactement comme avant. Jamais d'erreur montrée
    // pour un chiffre décoratif.
    return null;
  }
  if (km == null) return null;

  try {
    const suivant = { ...cache, [sortieId]: km };
    const cles = Object.keys(suivant);
    if (cles.length > MAX_ENTREES) {
      // Les identifiants portent l'horodatage du premier flash : l'ordre
      // alphabétique suffit à retrouver les plus anciens.
      for (const k of cles.sort().slice(0, cles.length - MAX_ENTREES)) delete suivant[k];
    }
    await AsyncStorage.setItem(CLE, JSON.stringify(suivant));
  } catch { /* le cache est un confort, pas une condition */ }

  return km;
}

export default distanceSortie;
