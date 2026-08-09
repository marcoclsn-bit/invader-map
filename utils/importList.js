/**
 * utils/importList.js — Analyse d'une liste d'Invaders collée par l'utilisateur.
 *
 * L'entrée n'est PAS un format : c'est ce que quelqu'un a réussi à copier. Un
 * export FlashInvaders ligne à ligne, un CSV avec en-tête, une capture de notes,
 * un paragraphe en vrac. On ne découpe donc rien — on EXTRAIT les jetons qui
 * ressemblent à un identifiant et on ignore tout le reste. Virgules, tabulations,
 * guillemets, colonnes de dates : rien de tout ça n'a besoin d'être prévu.
 *
 * La validation se fait contre `data/invader_ids.json`, index des 4 288 Invaders
 * des 84 villes encodé par plages (« 1-42 », « 1-10,12-14,16-132 »). Il pèse 4,8 Ko
 * et rend l'analyse exacte ET hors ligne : quelqu'un qui colle une liste
 * barcelonaise depuis Bruxelles obtient un verdict juste sans réseau.
 *
 * Pourquoi un index plutôt qu'une borne « numéro <= total » : 18 villes sur 84 ont
 * une numérotation à trous (Hong Kong compte 130 Invaders mais va jusqu'à HK_132)
 * et Lille commence à LIL_00. Une validation par le compte rejetterait des
 * identifiants valides et en accepterait d'invalides.
 */

import IDS from '../data/invader_ids.json';

// Un identifiant = 2 à 5 lettres majuscules, un souligné, 1 à 4 chiffres.
// Les frontières \b évitent d'attraper un morceau de mot plus long.
const JETON = /\b[A-Z]{2,5}_\d{1,4}\b/g;

// Même motif sans le drapeau global : `JETON.test()` est à état et rendrait un
// résultat sur deux.
const JETON_UNIQUE = /\b[A-Z]{2,5}_\d{1,4}\b/;

/**
 * Normalise UNE saisie manuelle avant analyse (volet du mode explorateur).
 *
 * En chasse, on tape à une main en marchant : réclamer « PA_284 » au caractère
 * près fait perdre plus de temps que le flash lui-même. On accepte donc
 * « PA_284 », « PA284 », « pa 284 », « pa-284 », et « 284 » tout court — la ville
 * étant déjà connue par la carte affichée, la répéter n'apporte rien.
 *
 * Un texte contenant déjà un identifiant complet n'est PAS touché : coller
 * « YOU FOUND PA_554 » depuis FlashInvaders doit continuer de marcher tel quel.
 *
 * @param texte           saisie brute
 * @param villeParDefaut  code de la ville courante, pour un numéro seul
 */
export function normaliseSaisie(texte, villeParDefaut) {
  const brut = String(texte ?? '').toUpperCase().trim();
  if (!brut) return brut;
  if (JETON_UNIQUE.test(brut)) return brut;

  const colle = brut.match(/^([A-Z]{2,5})[\s._-]*(\d{1,4})$/);
  if (colle) return `${colle[1]}_${colle[2]}`;

  const nu = brut.match(/^(\d{1,4})$/);
  if (nu && villeParDefaut) return `${villeParDefaut}_${nu[1]}`;

  return brut;
}

/** « 1-10,12-14,16 » → Set(1,2,…,10,12,13,14,16). */
function decompresse(plages) {
  const out = new Set();
  if (!plages) return out;
  for (const bloc of plages.split(',')) {
    const [a, b] = bloc.split('-');
    const deb = Number(a);
    const fin = b === undefined ? deb : Number(b);
    for (let n = deb; n <= fin; n++) out.add(n);
  }
  return out;
}

// Décompression à la demande, puis mémorisée : une liste ne cite qu'une poignée
// de villes, inutile de déplier les 84.
const _cache = new Map();
function villeSets(code) {
  if (!_cache.has(code)) {
    const e = IDS[code];
    _cache.set(code, e ? { tous: decompresse(e.n), detruits: decompresse(e.d) } : null);
  }
  return _cache.get(code);
}

/**
 * Analyse le texte collé.
 *
 * @param texte    contenu brut du champ
 * @param flashed  Set des ids déjà flashés (pour distinguer « nouveaux »)
 * @returns {{
 *   nouveaux: string[],      // à écrire : reconnus et pas déjà flashés
 *   dejaFlashes: string[],   // reconnus mais déjà acquis
 *   detruits: string[],      // parmi les nouveaux, mosaïques disparues
 *   inconnus: string[],      // bien formés mais absents de l'index
 *   villes: Record<string, number>,  // nombre de reconnus par ville
 *   total: number,           // jetons extraits
 * }}
 */
export function analyseListe(texte, flashed) {
  const jetons = String(texte || '').toUpperCase().match(JETON) ?? [];

  // Dédoublonnage en conservant l'ordre : une même photo peut apparaître deux fois.
  const vus = new Set();
  const uniques = [];
  for (const j of jetons) if (!vus.has(j)) { vus.add(j); uniques.push(j); }

  const nouveaux = [], dejaFlashes = [], detruits = [], inconnus = [];
  const villes = {};

  for (const jeton of uniques) {
    const i = jeton.lastIndexOf('_');
    const code = jeton.slice(0, i);
    const num = Number(jeton.slice(i + 1));
    const ville = villeSets(code);

    if (!ville || !ville.tous.has(num)) { inconnus.push(jeton); continue; }

    // FORME CANONIQUE, et non le jeton tel qu'il a été tapé. Les 4 288
    // identifiants padent le numéro sur DEUX chiffres au minimum : le premier
    // Invader de Paris est `PA_01`, pas `PA_1`. Renvoyer le jeton brut écrivait
    // « PA_1 » dans les flashés — une chaîne qui ne correspond à aucun Invader,
    // donc un flash perdu en silence, jamais affiché sur la carte. Le défaut
    // existait déjà à l'import ; la saisie d'un numéro seul le rendait courant.
    const id = `${code}_${String(num).padStart(2, '0')}`;

    villes[code] = (villes[code] ?? 0) + 1;
    if (flashed?.has?.(id)) { dejaFlashes.push(id); continue; }
    nouveaux.push(id);
    if (ville.detruits.has(num)) detruits.push(id);
  }

  return { nouveaux, dejaFlashes, detruits, inconnus, villes, total: uniques.length };
}

/**
 * Texte d'export : une ligne par identifiant, triés par ville puis par numéro.
 * Format volontairement identique à celui qu'on sait relire — ce que l'app
 * exporte, l'app le réimporte. C'est la sauvegarde avant changement de téléphone,
 * sans compte ni serveur.
 */
export function exportListe(flashed) {
  return [...(flashed ?? [])]
    .sort((a, b) => {
      const [va, na] = [a.slice(0, a.lastIndexOf('_')), Number(a.slice(a.lastIndexOf('_') + 1))];
      const [vb, nb] = [b.slice(0, b.lastIndexOf('_')), Number(b.slice(b.lastIndexOf('_') + 1))];
      return va === vb ? na - nb : va.localeCompare(vb);
    })
    .join('\n');
}
