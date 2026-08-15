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

// Date de flash accolée à un identifiant : « PA_1247 2026-08-12T14:33:01 ».
//
// Le motif des jetons exige DES LETTRES suivies d'un tiret bas et de chiffres :
// une date n'y répond jamais. Les anciennes versions de l'app, et tout autre
// outil qui relit ce format, ignorent donc simplement cette seconde colonne au
// lieu de s'y perdre. C'est ce qui permet de l'ajouter sans rien casser.
const DATE_COLLEE = /\b(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}(?::\d{2})?))?\b/;

/** Forme canonique d'un jeton : « PA_1 » → « PA_01 ». */
function canonique(jeton) {
  const i = jeton.lastIndexOf('_');
  return `${jeton.slice(0, i)}_${String(Number(jeton.slice(i + 1))).padStart(2, '0')}`;
}

/**
 * Dates trouvées dans le texte, par identifiant canonique.
 *
 * Lecture LIGNE PAR LIGNE, et uniquement quand la ligne ne porte qu'un seul
 * identifiant : sur « PA_01, PA_02  2026-08-12 », on ne saurait pas à qui
 * attribuer la date, et deviner serait pire que renoncer.
 *
 * Sans heure, on écrit minuit LOCAL — jamais un « Z ». La fiche traite minuit
 * pile comme « heure inconnue » et n'affiche alors que le jour ; ajouter un
 * fuseau décalerait la date d'un jour pour la moitié de la planète.
 */
export function datesDuTexte(texte) {
  const out = new Map();
  for (const ligne of String(texte || '').split(/\r?\n/)) {
    const jetons = ligne.toUpperCase().match(JETON);
    if (!jetons || jetons.length !== 1) continue;
    const m = DATE_COLLEE.exec(ligne);
    if (!m) continue;
    const heure = m[2] ? (m[2].length === 5 ? `${m[2]}:00` : m[2]) : '00:00:00';
    const iso = `${m[1]}T${heure}`;
    if (Number.isFinite(new Date(iso).getTime())) out.set(canonique(jetons[0]), iso);
  }
  return out;
}

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

  // Dates éventuellement présentes en seconde colonne. Restreintes aux
  // identifiants effectivement reconnus : une date orpheline n'a pas de sens.
  const brutes = datesDuTexte(texte);
  const dates = {};
  for (const id of [...nouveaux, ...dejaFlashes]) {
    const d = brutes.get(id);
    if (d) dates[id] = d;
  }

  return {
    nouveaux, dejaFlashes, detruits, inconnus, villes,
    dates, avecDates: Object.keys(dates).length,
    total: uniques.length,
  };
}

/**
 * Texte d'export : une ligne par identifiant, triés par ville puis par numéro.
 * Format volontairement identique à celui qu'on sait relire — ce que l'app
 * exporte, l'app le réimporte. C'est la sauvegarde avant changement de téléphone,
 * sans compte ni serveur.
 */
export function exportListe(flashed, flashedDates) {
  return [...(flashed ?? [])]
    .sort((a, b) => {
      const [va, na] = [a.slice(0, a.lastIndexOf('_')), Number(a.slice(a.lastIndexOf('_') + 1))];
      const [vb, nb] = [b.slice(0, b.lastIndexOf('_')), Number(b.slice(b.lastIndexOf('_') + 1))];
      return va === vb ? na - nb : va.localeCompare(vb);
    })
    .map((id) => {
      const d = flashedDates?.get?.(id);
      return d ? `${id} ${d}` : id;
    })
    .join('\n');
}

// ─── Notes personnelles ──────────────────────────────────────────────────────
//
// À PART, et volontairement. Une note contient des retours à la ligne, des
// virgules, des accents : la mettre dans un format « un identifiant par ligne »
// aurait exigé un échappement, donc un format que plus personne ne peut relire à
// l'œil. Et mêler quatre cents identifiants à vingt notes donne un bloc que l'on
// ne peut plus coller nulle part.
//
// D'où deux exports séparés : la liste reste du texte simple, les notes sont un
// petit objet JSON. À l'IMPORT en revanche, un seul champ accepte les deux — on
// colle, l'app reconnaît.

const MARQUE = 'invaderquest-notes';

export function exportNotes(notes, quand) {
  const propres = {};
  for (const [id, texte] of Object.entries(notes ?? {})) {
    const t = String(texte ?? '').trim();
    if (t) propres[id] = t;
  }
  return JSON.stringify({ [MARQUE]: 1, date: quand ?? null, notes: propres }, null, 1);
}

/**
 * Rend { notes, nouvelles, existantes } ou null si le texte n'est pas une
 * sauvegarde de notes. Ne lève jamais : un collage hasardeux doit être refusé,
 * pas planter l'écran.
 */
export function analyseNotes(texte, notesActuelles) {
  const brut = String(texte ?? '').trim();
  if (!brut.startsWith('{')) return null;
  let json;
  try { json = JSON.parse(brut); } catch { return null; }
  if (!json || typeof json !== 'object' || !json[MARQUE]) return null;
  const recues = json.notes && typeof json.notes === 'object' ? json.notes : {};

  const notes = {};
  let nouvelles = 0, existantes = 0;
  for (const [id, valeur] of Object.entries(recues)) {
    const t = String(valeur ?? '').trim();
    if (!t || !JETON_UNIQUE.test(id)) continue;
    notes[id] = t;
    if ((notesActuelles?.[id] ?? '') === '') nouvelles += 1;
    else if (notesActuelles[id] !== t) existantes += 1;
  }
  return { notes, nouvelles, existantes, total: Object.keys(notes).length };
}
