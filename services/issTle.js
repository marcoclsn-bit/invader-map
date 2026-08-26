import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Le TLE de l'ISS : les paramètres orbitaux dont dépend toute prédiction.
 *
 * Source : Celestrak, la référence publique — un fichier texte de trois lignes,
 * quelques centaines d'octets, sans clé d'API. C'est la MÊME donnée que
 * consomment tous les trackers ; la fraîcheur du TLE est le seul déterminant
 * de la précision.
 *
 * CACHE : un TLE reste exploitable plusieurs jours (l'ISS dérive lentement,
 * hors manœuvres de rehaussement). On rafraîchit au-delà de 12 h, on accepte
 * jusqu'à 5 jours en secours hors-ligne, on refuse au-delà — mieux vaut
 * « indisponible » qu'une heure de passage fausse de plusieurs minutes.
 */

const URL_CELESTRAK = 'https://celestrak.org/NORAD/elements/gp.php?CATNR=25544&FORMAT=tle';
const CLE_CACHE = '@invader_iss_tle';
const FRAIS_MS = 12 * 3600000;
const PERIME_MS = 5 * 86400000;
const DELAI_MS = 10000;

function analyseTexte(texte) {
  const lignes = String(texte || '').trim().split(/\r?\n/).map((l) => l.trim());
  // Format Celestrak : nom, ligne 1, ligne 2. On accepte aussi sans le nom.
  const l1 = lignes.find((l) => l.startsWith('1 25544'));
  const l2 = lignes.find((l) => l.startsWith('2 25544'));
  if (!l1 || !l2 || l1.length < 60 || l2.length < 60) return null;
  return { tle1: l1, tle2: l2 };
}

/**
 * Rend { tle1, tle2, ageMs } ou null si rien d'exploitable.
 * Ne lève jamais : l'appelant affiche « indisponible », pas une erreur.
 */
export async function obtenirTle(maintenantMs) {
  let cache = null;
  try { cache = JSON.parse(await AsyncStorage.getItem(CLE_CACHE)); } catch { /* illisible */ }

  const age = cache ? maintenantMs - cache.quandMs : Infinity;
  if (cache && age < FRAIS_MS) return { ...cache.tle, ageMs: age };

  try {
    const ctrl = new AbortController();
    const minuteur = setTimeout(() => ctrl.abort(), DELAI_MS);
    const res = await fetch(URL_CELESTRAK, { signal: ctrl.signal });
    clearTimeout(minuteur);
    if (res.ok) {
      const tle = analyseTexte(await res.text());
      if (tle) {
        try {
          await AsyncStorage.setItem(CLE_CACHE, JSON.stringify({ tle, quandMs: maintenantMs }));
        } catch { /* le cache est un confort */ }
        return { ...tle, ageMs: 0 };
      }
    }
  } catch { /* hors-ligne, délai : on retombe sur le cache */ }

  // Secours : le cache, tant qu'il n'est pas périmé au point de mentir.
  if (cache && age < PERIME_MS) return { ...cache.tle, ageMs: age };
  return null;
}

export default obtenirTle;
