/**
 * Génération d'un fichier GPX : le trajet vers la montre connectée.
 *
 * GPX est LE format que toutes les montres et apps de plein air comprennent :
 * Garmin (via Garmin Connect), Suunto, Coros, komoot, l'Apple Watch via
 * WorkOutDoors… On écrit un fichier, la feuille de partage système fait le
 * reste. Pas d'API propriétaire, pas de compte à lier, rien ne part tout seul.
 *
 * Contenu :
 *   - une trace (<trk>) : le tracé de l'itinéraire, à suivre sur la montre ;
 *   - un point de passage (<wpt>) par Invader du couloir, nommé par son
 *     identifiant. La plupart des Garmin sonnent à l'approche d'un waypoint :
 *     la montre reprend ainsi le rôle de l'alerte de proximité, sans téléphone.
 *
 * Module PUR : entrées → chaîne XML. Aucun accès fichier ni état global, pour
 * la même raison que les exports de collection (utils/importList.js) : une
 * fonction pure d'arguments ne peut pas embarquer par accident une donnée
 * sensible qui traînerait ailleurs.
 */

// Les cinq caractères à échapper en XML. Les indices (`hint`) viennent d'une
// source externe : sans échappement, un « & » dans une adresse produirait un
// fichier que Garmin Connect refuse silencieusement.
function xml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// 6 décimales ≈ 11 cm : largement assez, et des nombres courts font des
// fichiers légers (un trajet urbain compte des centaines de points).
const coord = (n) => Number(n).toFixed(6);

/**
 * @param {object} p
 * @param {string} p.nom                nom du parcours affiché par la montre
 * @param {Array<[number,number]>} p.coords  tracé [lng, lat] (ordre GeoJSON !)
 * @param {Array<{id, lat, lng, hint?, along?, nom?}>} [p.invaders]  points de
 *        passage. `nom` prime sur `id` : la Chasse s'en sert pour numéroter ses
 *        étapes comme à l'écran (« 1 · PA_632 »), un ordre qui n'a de sens que
 *        là-bas. Le Trajet, lui, n'affiche pas de numéros et garde l'identifiant.
 * @param {string} [p.date]             AAAA-MM-JJ, pour les métadonnées
 * @returns {string|null} le document GPX, ou null si le tracé est inutilisable
 */
export function genererGpx({ nom, coords, invaders, date }) {
  const points = (coords ?? []).filter(
    (c) => Array.isArray(c) && Number.isFinite(c[0]) && Number.isFinite(c[1]),
  );
  if (points.length < 2) return null; // une trace à moins de 2 points n'existe pas

  // Sens de la marche : `along` (distance le long du tracé) quand il existe.
  // La Chasse fournit ses étapes DÉJÀ ordonnées et sans `along` : le tri les
  // laisse alors en place, `?? 0` rendant la comparaison neutre.
  const wpts = [...(invaders ?? [])]
    .filter((i) => Number.isFinite(i?.lat) && Number.isFinite(i?.lng))
    .sort((a, b) => (a.along ?? 0) - (b.along ?? 0));

  const lignes = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<gpx version="1.1" creator="InvaderQuest" xmlns="http://www.topografix.com/GPX/1/1">',
    '<metadata>',
    `<name>${xml(nom)}</name>`,
    ...(date ? [`<time>${xml(date)}T00:00:00Z</time>`] : []),
    '</metadata>',
  ];

  for (const inv of wpts) {
    lignes.push(`<wpt lat="${coord(inv.lat)}" lon="${coord(inv.lng)}">`);
    lignes.push(`<name>${xml(inv.nom || inv.id)}</name>`);
    if (inv.hint) lignes.push(`<desc>${xml(inv.hint)}</desc>`);
    lignes.push('<sym>Flag, Blue</sym>');
    lignes.push('</wpt>');
  }

  lignes.push(`<trk><name>${xml(nom)}</name><trkseg>`);
  for (const [lng, lat] of points) {
    lignes.push(`<trkpt lat="${coord(lat)}" lon="${coord(lng)}"></trkpt>`);
  }
  lignes.push('</trkseg></trk>');
  lignes.push('</gpx>');

  return lignes.join('\n');
}

export default genererGpx;
