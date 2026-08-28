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
 *     1. la veille à 20 h 30 : « demain 04 h 12, mets un réveil » ;
 *     2. 10 min avant, pour celui qui s'est levé, téléphone en main.
 *
 *   Passage à HEURE OUVRABLE :
 *     seulement 10 min avant. Un rappel du matin pour un passage de 15 h a
 *     existé, puis a été retiré à la demande de Marco : c'était du bruit, on
 *     n'a pas besoin qu'on nous prévienne d'avance pour un événement auquel on
 *     est déjà éveillé.
 *
 * Pure fonction : passages + instant courant → liste d'instants et de types.
 * Les textes appartiennent à l'interface (i18n) ; ici, seulement le calendrier.
 * Aucune horloge interne, testable au déterminisme près.
 */

// Bornes « nocturnes » : un passage entre 22 h et 9 h du matin ne sera pas vu
// sans réveil. Heures du LIEU OBSERVÉ, pas de l'appareil : c'est là qu'on lèvera
// les yeux. Et quand on y est, iOS règle de toute façon le téléphone sur ce
// fuseau, donc les deux coïncident dans le cas normal.
const NUIT_DEBUT_H = 22;
const NUIT_FIN_H = 9;
const VEILLE_H = 20.5;      // 20 h 30 : après le dîner, avant le coucher
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

// ─── Heure murale dans un fuseau donné ───────────────────────────────────────
//
// Aucune bibliothèque de fuseaux : on s'appuie sur `toLocale*Date/TimeString`,
// déjà employé ailleurs dans l'app et adossé à l'ICU du système. `en-CA` rend
// AAAA-MM-JJ et `en-GB` en 24 h rend HH:MM:SS, deux formats stables.
// `fuseau` non renseigné = fuseau de l'appareil, ce qui couvre les lieux
// mémorisés avant l'ajout des fuseaux.

/** { annee, mois, jour, heure, minute } lus sur une horloge de ce fuseau. */
export function mural(ms, fuseau) {
  const d = new Date(ms);
  const opt = fuseau ? { timeZone: fuseau } : {};
  const [annee, mois, jour] = d.toLocaleDateString('en-CA', opt).split('-').map(Number);
  const [heure, minute] = d.toLocaleTimeString('en-GB', { ...opt, hour12: false })
    .split(':').map(Number);
  // Certaines plateformes rendent minuit « 24:00 » : on le ramène à 0.
  return { annee, mois, jour, heure: heure % 24, minute };
}

/**
 * L'instant absolu où l'horloge de `fuseau` affichera cette date et cette heure.
 * On pose l'heure murale comme si elle était en UTC, on mesure l'écart réel du
 * fuseau à cet instant, puis on corrige. Une seconde passe rattrape les
 * changements d'heure, où le premier écart peut être celui de l'autre côté de
 * la bascule.
 */
export function instantMural({ annee, mois, jour, heure, minute }, fuseau) {
  const cible = Date.UTC(annee, mois - 1, jour, heure, minute, 0);
  let t = cible;
  for (let i = 0; i < 2; i++) {
    const m = mural(t, fuseau);
    const vu = Date.UTC(m.annee, m.mois - 1, m.jour, m.heure, m.minute, 0);
    const ecart = vu - t;
    t = cible - ecart;
  }
  return t;
}

function estNocturne(picMs, fuseau) {
  const m = mural(picMs, fuseau);
  const h = m.heure + m.minute / 60;
  return h < NUIT_FIN_H || h >= NUIT_DEBUT_H;
}

// L'instant « veille au soir » : 20 h 30 sur l'horloge DU LIEU. Le jour retenu
// est celui du pic si le passage tombe assez tard dans la soirée (on prévient à
// 20 h 30 pour un passage à 23 h), sinon la veille civile.
function veilleAuSoir(picMs, fuseau) {
  const m = mural(picMs, fuseau);
  const H = Math.floor(VEILLE_H);
  const M = Math.round((VEILLE_H % 1) * 60);

  let t = instantMural({ ...m, heure: H, minute: M }, fuseau);
  // Moins de 2 h de préavis : le rappel n'a plus d'utilité, on recule d'un jour.
  if (t >= picMs - 2 * 3600000) {
    const veille = mural(picMs - 86400000, fuseau);
    t = instantMural({ ...veille, heure: H, minute: M }, fuseau);
  }
  return t;
}

/**
 * @param {Array<{picMs, elevationMaxDeg, flashableDebutMs, flashableFinMs}>} passages
 * @param {number} maintenantMs
 * @param {number} [max=3]  nombre de passages à planifier (iOS plafonne à 64
 *                          notifications locales : on reste très en dessous)
 * @param {string} [fuseau] fuseau IANA du LIEU observé. Non renseigné = celui de
 *                          l'appareil, ce qui couvre les lieux mémorisés avant
 *                          l'ajout des fuseaux à l'annuaire.
 * @returns {Array<{quandMs, type: 'veille'|'imminent', passage}>}
 *          triés par date, uniquement dans le futur.
 */
export function planNotificationsISS(passages, maintenantMs, max = 3, fuseau) {
  const plan = [];
  for (const p of (passages || []).slice(0, max)) {
    if (p.picMs <= maintenantMs) continue;

    // Passage NOCTURNE : deux crans, parce qu'une alerte à 4 h du matin ne
    // réveille personne. Passage à une heure OUVRABLE : un seul cran, le rappel
    // imminent — prévenir la veille pour un passage de 15 h serait du bruit.
    if (estNocturne(p.picMs, fuseau)) {
      const v = veilleAuSoir(p.picMs, fuseau);
      if (v > maintenantMs) plan.push({ quandMs: v, type: 'veille', passage: p });
    }

    const imminent = p.flashableDebutMs - AVANT_MS;
    if (imminent > maintenantMs) plan.push({ quandMs: imminent, type: 'imminent', passage: p });
  }
  return plan.sort((a, b) => a.quandMs - b.quandMs);
}

export default planNotificationsISS;
