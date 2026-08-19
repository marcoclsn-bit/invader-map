import AsyncStorage from '@react-native-async-storage/async-storage';
import { multiRoute } from './routing';
import { simplifyPath } from '../utils/tourGeometry';

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
 * terminée : son itinéraire est demandé UNE FOIS dans la vie de l'appareil,
 * puis relu. C'est le bénéfice concret de n'avoir pas tiré cet identifiant au
 * hasard.
 *
 * ET LE TRACÉ EST MIS EN CACHE AVEC, pas seulement les kilomètres. Ne garder que
 * la distance faisait rappeler l'itinéraire à chaque ouverture — le cache du
 * module de routage vit en mémoire, il disparaît au redémarrage de l'app. Le
 * tracé est simplifié avant d'être rangé : un itinéraire piéton parisien de
 * trente étapes compte des centaines de points dont l'immense majorité est
 * invisible à la taille d'une carte de partage.
 */

const CLE = '@invader_sortie_km';
// Borne du cache. Une entrée porte désormais un tracé simplifié : compter
// environ 2 Ko pour une sortie parisienne dense, contre quelques octets quand
// on ne gardait que la distance. Cent entrées plafonnent donc l'ensemble aux
// alentours de 200 Ko, et les sorties les plus anciennes sont les moins
// rouvertes.
const MAX_ENTREES = 100;

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

  // LA CLÉ PORTE LE NOMBRE D'ÉTAPES, et pas seulement l'identifiant de la sortie.
  // Celui-ci ne dépend que du PREMIER flash : une sortie qui s'allonge le
  // conserve. Sans le compte, on partageait 10 mosaïques avec la distance et le
  // tracé des 5 premières — le chiffre faux publié sous son nom que ce module
  // dit précisément vouloir éviter. Le geste est banal : on partage en cours de
  // balade, on continue, on repartage.
  const cle = `${sortieId}|${trace.length}`;
  const cache = await lire();
  const dejaVu = cache[cle];
  // Déjà calculé : on ne redemande RIEN au réseau. C'est tout l'intérêt de
  // persister aussi le tracé.
  if (dejaVu && dejaVu.km > 0) return { km: dejaVu.km, coords: dejaVu.coords ?? null };

  let r = null;
  try {
    r = await multiRoute(trace, 'foot-walking');
  } catch {
    // Hors ligne, quota épuisé, aucun itinéraire piéton entre deux points : le
    // récap garde ses lignes droites et « — », exactement comme avant. Jamais
    // d'erreur montrée pour un chiffre décoratif.
    return null;
  }
  // Zéro n'est pas une distance : c'est le symptôme d'un itinéraire qui n'a pas
  // abouti. Le laisser passer afficherait « 0,0 KM » sur une image partagée.
  const km = Number.isFinite(r?.distanceKm) && r.distanceKm > 0 ? r.distanceKm : null;
  const coords = Array.isArray(r?.coords) && r.coords.length > 1 ? r.coords : null;
  // Simplifié AVANT tout usage, et pas seulement avant rangement. On rendait le
  // tracé brut au premier appel et la version simplifiée aux suivants : un
  // itinéraire piéton en compte plus d'un millier de points, et `missedAlongRoute`
  // les croise avec les 1 350 Invaders parisiens — deux millions d'itérations sur
  // le fil JS, modale déjà ouverte. Le même récap ne se comportait donc pas
  // pareil selon qu'on l'ouvrait pour la première fois ou non.
  //
  // Douglas-Peucker retire les points alignés, ceux qui ne changent rien au
  // rendu. C'est le traitement que le mode explorateur applique déjà aux tracés
  // partagés.
  const compact = coords
    ? simplifyPath(coords.map(([lng, lat]) => ({ latitude: lat, longitude: lng })), true)
        .map((pt) => [Math.round(pt.longitude * 1e5) / 1e5, Math.round(pt.latitude * 1e5) / 1e5])
    : null;
  if (km == null) return compact ? { km: null, coords: compact } : null;

  try {
    const suivant = { ...cache, [cle]: { km, coords: compact } };
    const cles = Object.keys(suivant);
    if (cles.length > MAX_ENTREES) {
      // Par HORODATAGE, extrait de la clé. L'ordre alphabétique paraissait
      // suffire, mais la clé commence par le code de la ville :
      // « out_LDN_1755… », récent, triait avant « out_PA_1500… », ancien. On
      // purgeait donc les villes en tête d'alphabet plutôt que les vieilles
      // sorties.
      const quand = (k) => Number(k.split('_')[2]?.split('|')[0]) || 0;
      const tries = cles.sort((a, b) => quand(a) - quand(b));
      for (const k of tries.slice(0, cles.length - MAX_ENTREES)) delete suivant[k];
    }
    await AsyncStorage.setItem(CLE, JSON.stringify(suivant));
  } catch { /* le cache est un confort, pas une condition */ }

  return { km, coords };
}

export default distanceSortie;
