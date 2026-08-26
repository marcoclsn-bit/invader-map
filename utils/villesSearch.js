/**
 * Recherche de lieu, 100 % LOCALE — pour choisir le point d'observation d'un
 * passage de l'ISS. Aucune requête réseau, aucune coordonnée qui quitte le
 * téléphone : l'utilisateur tape un nom de ville, on cherche dans l'annuaire
 * embarqué `data/villes.json` (GeoNames, ODbL — France ≥1 000 hab + monde
 * ≥50 000 hab). Pour l'ISS, à 400 km d'altitude, le centre-ville suffit.
 *
 * Chargement PARESSEUX : le mégaoctet de JSON n'est lu et normalisé qu'à la
 * première recherche, jamais au démarrage de l'app.
 */

let INDEX = null; // [{ nom, label, lat, lng, norm }] — construit une seule fois

// « Saint-Denis », « Saint Denis », « saint-denis » → « saint denis ».
// Accents retirés, séparateurs unifiés, minuscules : la comparaison devient
// insensible à la casse, aux accents et aux tirets/apostrophes.
function normaliser(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[-'’\s]+/g, ' ')
    .trim();
}

function charger() {
  if (INDEX) return INDEX;
  // require ici (pas en tête de module) : Metro n'inline le JSON qu'au premier appel.
  const { cities } = require('../data/villes.json');
  INDEX = cities.map(([nom, label, lat, lng]) => ({
    nom,
    label,
    lat,
    lng,
    norm: normaliser(nom),
  }));
  return INDEX;
}

/**
 * @param {string} requete   texte tapé par l'utilisateur
 * @param {number} [limite=8]
 * @returns {Array<{nom, label, lat, lng}>} triés par pertinence puis population
 *          (l'annuaire est déjà ordonné par population décroissante).
 */
export function rechercherVilles(requete, limite = 8) {
  const nq = normaliser(requete);
  if (nq.length < 2) return [];

  const index = charger();
  const espace = ' ' + nq;
  const trouves = [];

  for (let i = 0; i < index.length; i++) {
    const v = index[i];
    const n = v.norm;
    let rang;
    if (n === nq) rang = 0;                       // égalité exacte
    else if (n.startsWith(nq)) rang = 1;          // préfixe (« bord » → Bordeaux)
    else if (n.includes(espace)) rang = 2;        // début d'un mot (« denis » → Saint-Denis)
    else if (n.includes(nq)) rang = 3;            // sous-chaîne quelconque
    else continue;
    // i = position dans l'annuaire = rang de population : sert de départage.
    trouves.push({ v, rang, i });
  }

  trouves.sort((a, b) => a.rang - b.rang || a.i - b.i);
  return trouves.slice(0, limite).map(({ v }) => ({
    nom: v.nom,
    label: v.label,
    lat: v.lat,
    lng: v.lng,
  }));
}

export default rechercherVilles;
