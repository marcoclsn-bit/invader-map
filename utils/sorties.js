/**
 * utils/sorties.js — Reconstituer les sorties depuis l'historique des flashs.
 *
 * POURQUOI PAS UN BOUTON « DÉMARRER ».
 *
 * L'envie de partager arrive APRÈS la balade, pas avant. Un bouton de départ
 * demanderait de prévoir une intention qu'on n'a pas encore, et le jour où on
 * oublie de l'appuyer, la sortie est perdue sans recours. Or depuis la 1.4.0
 * chaque flash porte son horodatage réel : une sortie n'est rien d'autre qu'une
 * grappe de flashs séparée des autres par un trou. On la retrouve après coup,
 * sans rien avoir demandé à personne.
 *
 * DEUX RUPTURES, PAS UNE.
 *
 * Le temps, et la VILLE. Sans la seconde, un flash à Paris le matin et un à
 * Lyon l'après-midi formeraient une seule « sortie » dès que le trou est court —
 * ce qui arrive en train.
 *
 * LES DATES À MINUIT PILE SONT ÉCARTÉES.
 *
 * FlashInvaders renvoie parfois « 2026-08-12 00:00:00 » : la date est connue,
 * l'heure ne l'est pas. Les traiter comme un flash de minuit les collerait à la
 * sortie de la veille au soir, ou en inventerait une au milieu de la nuit. Une
 * heure inconnue n'est pas une heure ; ces flashs ne participent à aucune sortie.
 */

import { extractCityCode } from './session';

// 90 minutes, et non 60. Une pause déjeuner en pleine chasse dépasse facilement
// l'heure, et couper là scinderait une vraie sortie en deux. Valeur à confronter
// à un historique réel : c'est un pari raisonnable, pas une mesure.
export const TROU_MS = 90 * 60 * 1000;

// En dessous, ce n'est pas une sortie mais un flash isolé — croisé en allant au
// travail. Rien à raconter, et un récap pour une seule mosaïque serait ridicule.
export const MIN_FLASHS = 2;

/** Un horodatage à minuit pile signale une heure inconnue, pas une heure. */
export function heureInconnue(iso) {
  return /T00:00:00/.test(String(iso));
}

/**
 * Découpe l'historique en sorties, de la plus récente à la plus ancienne.
 *
 * @param {Map<string,string>} flashedDates  id → ISO local (sans Z)
 * @param {object} [opts]  { trouMs, minFlashs }
 * @returns {Array<{ id, startedAt, endedAt, city, invaderIds }>}
 */
export function decouperSorties(flashedDates, opts = {}) {
  const trouMs = opts.trouMs ?? TROU_MS;
  const minFlashs = opts.minFlashs ?? MIN_FLASHS;
  if (!flashedDates || typeof flashedDates.forEach !== 'function') return [];

  const points = [];
  flashedDates.forEach((iso, id) => {
    if (!iso || heureInconnue(iso)) return;
    const ts = new Date(iso).getTime();
    if (!Number.isFinite(ts)) return;
    points.push({ id, iso, ts, city: extractCityCode(id) });
  });
  if (points.length < minFlashs) return [];

  points.sort((a, b) => a.ts - b.ts);

  const groupes = [];
  let courant = [points[0]];
  for (let i = 1; i < points.length; i += 1) {
    const p = points[i];
    const prec = courant[courant.length - 1];
    const rupture = p.ts - prec.ts > trouMs || p.city !== prec.city;
    if (rupture) { groupes.push(courant); courant = [p]; }
    else courant.push(p);
  }
  groupes.push(courant);

  return groupes
    .filter((g) => g.length >= minFlashs)
    .map((g) => ({
      // IDENTIFIANT DÉTERMINISTE, dérivé du contenu et jamais tiré au hasard.
      // Tant qu'on ne fait qu'afficher, ça n'a aucune importance. Mais le jour
      // où ces sorties seront enregistrées — pour compter dans Stats, pour le
      // badge des dix sessions — partager deux fois la même balade en créerait
      // deux. `addSession` empile sans dédupliquer : c'est ici que ça se joue,
      // et ça ne coûte rien de le décider maintenant.
      id: `out_${g[0].city}_${g[0].ts}`,
      startedAt: g[0].iso,
      endedAt: g[g.length - 1].iso,
      city: g[0].city,
      invaderIds: g.map((p) => p.id),
    }))
    .reverse();   // la plus récente en tête
}

/**
 * Coordonnées des flashs d'une sortie, dans l'ordre chronologique.
 *
 * Ce n'est PAS un itinéraire : personne n'a marché en ligne droite d'une
 * mosaïque à l'autre. C'est la forme de la balade, et à ce titre elle est
 * honnête — d'où l'absence de distance affichée, qui serait toujours
 * sous-évaluée donc fausse.
 *
 * Rend [[lon, lat], …] pour coller à `routeCoords`, qui suit l'ordre GeoJSON.
 */
export function traceSortie(sortie, invaders) {
  if (!sortie?.invaderIds?.length || !invaders) return null;
  const parId = invaders instanceof Map
    ? invaders
    : new Map(invaders.map((i) => [i.id, i]));
  const coords = [];
  for (const id of sortie.invaderIds) {
    const inv = parId.get(id);
    if (inv && Number.isFinite(inv.lat) && Number.isFinite(inv.lng)) {
      coords.push([inv.lng, inv.lat]);
    }
  }
  return coords.length > 1 ? coords : null;
}

export default decouperSorties;
