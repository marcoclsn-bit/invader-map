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
 * On rend AUSSI la géométrie de l'itinéraire. La carte de partage reliait les
 * mosaïques en lignes droites, qui traversaient les immeubles : on avait déjà
 * le vrai tracé sous la main — c'est la même réponse — et on le jetait.
 *
 * @param {string} sortieId   identifiant DÉTERMINISTE (voir utils/sorties.js)
 * @param {Array<[number,number]>} trace  [[lon, lat], …] dans l'ordre chronologique
 * @returns {Promise<{km: number, coords: Array}|null>} null si indisponible
 */
export async function distanceSortie(sortieId, trace) {
  if (!sortieId || !trace || trace.length < 2) return null;

  const cache = await lire();
  // Seuls les KILOMÈTRES sont mis en cache, pas la géométrie : un itinéraire
  // parisien de 31 étapes pèse plusieurs dizaines de kilo-octets, et le stocker
  // pour 200 sorties gonflerait le stockage local pour un tracé qu'on redemande
  // rarement. `multiRoute` a de toute façon son propre cache mémoire.
  const connu = typeof cache[sortieId] === 'number' && cache[sortieId] > 0;

  let r = null;
  try {
    r = await multiRoute(trace, 'foot-walking');
  } catch {
    // Hors ligne, quota épuisé, aucun itinéraire piéton entre deux points : le
    // récap garde ses lignes droites et « — », exactement comme avant. Jamais
    // d'erreur montrée pour un chiffre décoratif.
    return connu ? { km: cache[sortieId], coords: null } : null;
  }
  // Zéro n'est pas une distance : c'est le symptôme d'un itinéraire qui n'a pas
  // abouti. Le laisser passer afficherait « 0,0 KM » sur une image partagée.
  const km = Number.isFinite(r?.distanceKm) && r.distanceKm > 0 ? r.distanceKm : null;
  const coords = Array.isArray(r?.coords) && r.coords.length > 1 ? r.coords : null;
  if (km == null) return coords ? { km: null, coords } : null;

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

  return { km, coords };
}

export default distanceSortie;
