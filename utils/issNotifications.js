/**
 * Plan de notifications pour un passage de l'ISS — la remarque de Marco.
 *
 * Les passages flashables tombent presque tous entre 1 h et 7 h du matin, et
 * la fenêtre dure entre 5 et 20 secondes. Une alerte « 10 minutes avant » à
 * 4 h 02 ne réveille personne : elle s'empile sur l'écran verrouillé d'un
 * dormeur et se lit au réveil, trop tard. Pour un événement nocturne, la
 * SEULE notification qui compte est celle de la VEILLE AU SOIR, à une heure où
 * l'on est éveillé pour décider — et mettre un réveil.
 *
 * D'où une échelle à deux ou trois crans selon l'heure du passage :
 *
 *   Passage NOCTURNE (avant l'heure de réveil du commun des mortels) :
 *     1. la veille à 20 h 30 — « demain 04 h 12, mets un réveil » ;
 *     2. 10 min avant — pour celui qui s'est levé, téléphone en main.
 *
 *   Passage DIURNE :
 *     1. le matin même à 9 h, si le passage est après 10 h ;
 *     2. 10 min avant.
 *
 * Pure fonction : passages + instant courant → liste d'instants et de types.
 * Les textes appartiennent à l'interface (i18n) ; ici, seulement le calendrier.
 * Aucune horloge interne — testable au déterminisme près.
 */

// Bornes « nocturnes » : un passage entre 22 h et 9 h du matin ne sera pas vu
// sans réveil. Heures LOCALES de l'appareil — c'est le sommeil de l'utilisateur
// qui compte, pas UTC.
const NUIT_DEBUT_H = 22;
const NUIT_FIN_H = 9;
const VEILLE_H = 20.5;      // 20 h 30 : après le dîner, avant le coucher
const MATIN_H = 9;          // rappel du matin pour les passages diurnes
const AVANT_MS = 10 * 60000;

// ─── Identité d'un passage à travers les recalculs ───────────────────────────
//
// L'écran mémorise l'instant du pic pour savoir quelle cloche est armée. Mais
// cet instant est RECALCULÉ à chaque ouverture, et le TLE se rafraîchit toutes
// les 12 h : les heures de passage se décalent alors de quelques secondes.
// Comparer à la milliseconde près décrochait donc l'alerte une à deux fois par
// jour, sans que rien ne l'explique à l'écran — signalé par Marco.
//
// D'où une tolérance. Deux passages distincts ne peuvent pas être proches :
// l'ISS met ~93 min à faire un tour, et deux passages au zénith d'une même nuit
// sont séparés d'au moins deux orbites (mesuré sur Paris : 194 min). Une
// demi-heure absorbe largement la dérive sans jamais confondre deux passages.
export const TOLERANCE_MS = 30 * 60000;

/** L'instant mémorisé correspondant à ce passage, ou null. */
export function armePour(armes, picMs) {
  if (!armes) return null;
  for (const t of armes) if (Math.abs(t - picMs) < TOLERANCE_MS) return t;
  return null;
}

function estNocturne(picMs) {
  const h = new Date(picMs).getHours() + new Date(picMs).getMinutes() / 60;
  return h < NUIT_FIN_H || h >= NUIT_DEBUT_H;
}

// L'instant « veille au soir » d'un passage : 20 h 30 le jour CIVIL précédent
// le pic — sauf si le pic est après 22 h le soir même, auquel cas la veille
// est ce soir-là (on prévient à 20 h 30 pour un passage à 23 h).
function veilleAuSoir(picMs) {
  const pic = new Date(picMs);
  const veille = new Date(pic);
  veille.setHours(Math.floor(VEILLE_H), Math.round((VEILLE_H % 1) * 60), 0, 0);
  if (veille.getTime() >= picMs - 2 * 3600000) {
    // moins de 2 h entre le rappel et le pic : reculer d'un jour n'a pas de
    // sens (le pic est ce soir), on garde ce soir si ça laisse du temps…
    veille.setDate(veille.getDate() - 1);
  }
  // pic entre 20 h 30 et minuit : la « veille » calculée serait le soir même,
  // très bien — sinon elle est déjà la veille civile.
  if (veille.getTime() > picMs) veille.setDate(veille.getDate() - 1);
  return veille.getTime();
}

/**
 * @param {Array<{picMs, elevationMaxDeg, flashableDebutMs, flashableFinMs}>} passages
 * @param {number} maintenantMs
 * @param {number} [max=3]  nombre de passages à planifier (iOS plafonne à 64
 *                          notifications locales : on reste très en dessous)
 * @returns {Array<{quandMs, type: 'veille'|'matin'|'imminent', passage}>}
 *          triés par date, uniquement dans le futur.
 */
export function planNotificationsISS(passages, maintenantMs, max = 3) {
  const plan = [];
  for (const p of (passages || []).slice(0, max)) {
    if (p.picMs <= maintenantMs) continue;

    // Passage NOCTURNE : deux crans, parce qu'une alerte à 4 h du matin ne
    // réveille personne. Passage à une heure OUVRABLE : un seul cran, le rappel
    // imminent — prévenir la veille pour un passage de 15 h serait du bruit.
    if (estNocturne(p.picMs)) {
      const v = veilleAuSoir(p.picMs);
      if (v > maintenantMs) plan.push({ quandMs: v, type: 'veille', passage: p });
    }

    const imminent = p.flashableDebutMs - AVANT_MS;
    if (imminent > maintenantMs) plan.push({ quandMs: imminent, type: 'imminent', passage: p });
  }
  return plan.sort((a, b) => a.quandMs - b.quandMs);
}

export default planNotificationsISS;
