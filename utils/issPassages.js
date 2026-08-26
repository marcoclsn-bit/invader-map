import {
  twoline2satrec, propagate, gstime, eciToEcf, ecfToLookAngles, eciToGeodetic,
  degreesToRadians, radiansToDegrees,
} from 'satellite.js';

/**
 * Prédiction des passages de l'ISS au-dessus d'un point — pour SPACE_02.
 *
 * POURQUOI EN LOCAL. Toutes les applications de suivi font le même calcul :
 * les paramètres orbitaux publics (TLE, NORAD) propagés par l'algorithme
 * standard SGP4 — dont satellite.js est l'implémentation JavaScript de
 * référence. Il n'existe pas de source « plus précise » : la précision vient de
 * la fraîcheur du TLE, pas de qui calcule. En local : pas de quota partagé,
 * pas de serveur, hors-ligne une fois le TLE en cache, et des notifications
 * programmables — l'ADN de l'app.
 *
 * CE QU'ON CHERCHE. FlashInvaders valide SPACE_02 quand la station est
 * quasiment au zénith — invamap documente « élévation ≥ 80° » (à confirmer sur
 * le terrain). Ces passages sont rares : c'est précisément ce qui rend une
 * alerte précieuse. Le seuil est un paramètre, pas une constante enfouie : le
 * jour où le terrain le contredira, on ajuste sans retoucher le moteur.
 *
 * MÉTHODE. Balayage grossier de l'élévation (pas de 30 s), détection des
 * fenêtres au-dessus de l'horizon de travail (10°), puis affinage du pic et
 * des bords de la fenêtre flashable par dichotomie à la seconde. Un passage
 * zénithal dure ~10 min d'horizon à horizon mais la fenêtre ≥ 80° n'excède pas
 * quelques dizaines de secondes : le pas grossier de 30 s ne peut pas manquer
 * la CLOCHE du passage (largeur ≥ 4 min au-dessus de 10°), et l'affinage
 * retrouve la fenêtre étroite à l'intérieur.
 *
 * AUCUNE horloge interne : l'instant de départ est un paramètre. Déterministe,
 * donc testable — et les tests comparent l'affinage à un balayage exhaustif.
 */

const HORIZON_TRAVAIL_DEG = 10;   // en dessous, l'ISS est « couchée » : hors passage

/** Élévation de l'ISS (degrés) vue d'un observateur, à un instant donné. */
export function elevationISS(satrec, observateur, tMs) {
  const date = new Date(tMs);
  const pos = propagate(satrec, date);
  if (!pos || !pos.position) return null;   // TLE trop vieux ou propagation en échec
  const gmst = gstime(date);
  const ecf = eciToEcf(pos.position, gmst);
  const regard = ecfToLookAngles(observateur, ecf);
  const deg = radiansToDegrees(regard.elevation);
  // satellite.js v7 propage un TLE illisible en positions NaN, sans erreur.
  // NaN n'est ni vrai ni faux dans une comparaison : il traverserait tout le
  // balayage en silence. On le convertit en « pas de mesure ».
  return Number.isFinite(deg) ? deg : null;
}

/** Observateur au format satellite.js (radians + km). */
export function observateurDepuis(lat, lng, altKm = 0) {
  return {
    latitude: degreesToRadians(lat),
    longitude: degreesToRadians(lng),
    height: altKm,
  };
}

/** Point au sol survolé par l'ISS à un instant — sert aux tests (élévation ≈ 90°). */
export function pointSousISS(satrec, tMs) {
  const date = new Date(tMs);
  const pos = propagate(satrec, date);
  if (!pos || !pos.position) return null;
  const gmst = gstime(date);
  const geo = eciToGeodetic(pos.position, gmst);
  return { lat: radiansToDegrees(geo.latitude), lng: radiansToDegrees(geo.longitude) };
}

// Dichotomie : l'instant où l'élévation franchit `seuil`, entre a (sous) et b (sur)
// — ou l'inverse. Précision : la seconde.
function franchissement(satrec, obs, aMs, bMs, seuil) {
  let lo = aMs, hi = bMs;
  while (hi - lo > 1000) {
    const mid = (lo + hi) / 2;
    const e = elevationISS(satrec, obs, mid);
    const dessusLo = elevationISS(satrec, obs, lo) >= seuil;
    if ((e >= seuil) === dessusLo) lo = mid; else hi = mid;
  }
  return Math.round((lo + hi) / 2);
}

// Affine le pic par recherche au pas de 1 s autour du maximum grossier.
function affinerPic(satrec, obs, centreMs, rayonMs) {
  let meilleurT = centreMs;
  let meilleurE = elevationISS(satrec, obs, centreMs) ?? -90;
  for (let t = centreMs - rayonMs; t <= centreMs + rayonMs; t += 1000) {
    const e = elevationISS(satrec, obs, t);
    if (e != null && e > meilleurE) { meilleurE = e; meilleurT = t; }
  }
  return { tMs: meilleurT, elevationDeg: meilleurE };
}

/**
 * Les passages de l'ISS dont le pic dépasse `seuilDeg`, sur `dureeJours`.
 *
 * @param {object} p
 * @param {string} p.tle1 / p.tle2   les deux lignes du TLE
 * @param {number} p.lat / p.lng     l'observateur, en degrés
 * @param {number} p.debutMs         départ de la fenêtre de recherche
 * @param {number} [p.dureeJours=5]
 * @param {number} [p.seuilDeg=80]   seuil « flashable » (invamap, à confirmer)
 * @param {number} [p.pasSec=30]     pas du balayage grossier
 * @returns {Array<{picMs, elevationMaxDeg, flashableDebutMs, flashableFinMs}>}
 *   `flashable*` : la fenêtre où l'élévation ≥ seuil (null si seul le pic passe).
 */
export function passagesISS({ tle1, tle2, lat, lng, altKm = 0, debutMs, dureeJours = 5, seuilDeg = 80, pasSec = 30 }) {
  const satrec = twoline2satrec(tle1, tle2);
  const obs = observateurDepuis(lat, lng, altKm);
  // satellite.js v7 avale un TLE illisible sans poser satrec.error : il rend
  // des champs NaN et propagate échoue en silence. Un tableau vide serait
  // alors un mensonge — « aucun passage » quand la vérité est « données
  // illisibles ». On sonde donc une propagation avant de balayer.
  if (satrec.error || elevationISS(satrec, obs, debutMs) == null) {
    throw new Error(`TLE invalide (code ${satrec.error || 'propagation impossible'})`);
  }

  const finMs = debutMs + dureeJours * 86400000;
  const pas = pasSec * 1000;
  const passages = [];

  let dansPassage = false;
  let maxE = -90, maxT = 0;

  for (let t = debutMs; t <= finMs; t += pas) {
    const e = elevationISS(satrec, obs, t);
    if (e == null) break;   // TLE hors de son domaine de validité : on s'arrête proprement
    if (e >= HORIZON_TRAVAIL_DEG) {
      if (!dansPassage) { dansPassage = true; maxE = -90; }
      if (e > maxE) { maxE = e; maxT = t; }
    } else if (dansPassage) {
      dansPassage = false;
      if (maxE >= seuilDeg - 5) {
        // -5° : le pas grossier peut sous-estimer le pic ; l'affinage tranche.
        const pic = affinerPic(satrec, obs, maxT, pas);
        if (pic.elevationDeg >= seuilDeg) {
          // Bords de la fenêtre flashable, par dichotomie depuis le pic.
          const avant = franchissement(satrec, obs, pic.tMs - 5 * 60000, pic.tMs, seuilDeg);
          const apres = franchissement(satrec, obs, pic.tMs, pic.tMs + 5 * 60000, seuilDeg);
          passages.push({
            picMs: pic.tMs,
            elevationMaxDeg: Math.round(pic.elevationDeg * 10) / 10,
            flashableDebutMs: avant,
            flashableFinMs: apres,
          });
        }
      }
    }
  }
  return passages;
}

export default passagesISS;
