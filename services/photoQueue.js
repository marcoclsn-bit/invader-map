import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * File d'attente des photos personnelles — lissage de la charge.
 *
 * CE QU'ELLE NE PEUT PAS FAIRE, et il faut le savoir avant de lire la suite :
 * l'app n'a pas de serveur. Chaque téléphone est seul et ignore les autres. On ne
 * peut donc PAS plafonner le nombre d'utilisateurs simultanés — seulement ce que
 * chaque appareil s'autorise. Cent appareils restent cent appareils. Le lissage
 * réduit le pic, pas le volume total.
 *
 * Ce que ça change quand même, et ce n'est pas rien : un serveur encaisse
 * beaucoup mieux une charge modérée et continue qu'une pointe brutale. Dérouler
 * une liste de mille vignettes lançait mille requêtes aussi vite que le
 * défilement les faisait apparaître ; ici, deux à la fois, quatre par seconde au
 * plus. Le même volume s'étale au lieu de frapper d'un coup.
 *
 * Deux priorités. Une fiche ouverte à la main est un geste explicite qui attend
 * une réponse immédiate : elle passe devant. Une vignette de liste défile et
 * personne ne la regarde vraiment : elle attend son tour.
 *
 * Le créneau est rendu quand l'image a fini de charger, échoué, ou quitté
 * l'écran. Un minuteur de sûreté le rend de toute façon : une image qu'on
 * n'affiche jamais ne doit pas geler la file pour les suivantes.
 */

const MAX_SIMULTANEES = 2;     // requêtes en vol par appareil
const INTERVALLE_MS   = 250;   // 4 départs par seconde au plus
const SECOURS_MS      = 15000; // rend le créneau même si l'image ne dit rien

export const PRIORITE_FICHE  = 10;
export const PRIORITE_LISTE  = 0;

let enCours = 0;
let dernierDepart = 0;
let minuteur = null;
const file = [];

function pomper() {
  if (enCours >= MAX_SIMULTANEES || file.length === 0) return;
  const attente = dernierDepart + INTERVALLE_MS - Date.now();
  if (attente > 0) {
    if (!minuteur) minuteur = setTimeout(() => { minuteur = null; pomper(); }, attente);
    return;
  }
  // Tri à chaque départ, et non à l'insertion : une fiche ouverte pendant que
  // cinquante vignettes patientent doit passer devant celles déjà en file.
  file.sort((a, b) => b.priorite - a.priorite);
  const t = file.shift();
  enCours += 1;
  dernierDepart = Date.now();
  t.accorder();
  if (file.length) pomper();
}

function demander(priorite, accorder) {
  const jeton = { priorite, accorder, rendu: false };
  file.push(jeton);
  pomper();
  return jeton;
}

function rendre(jeton) {
  if (!jeton) return;
  const i = file.indexOf(jeton);
  if (i >= 0) { file.splice(i, 1); return; }   // jamais parti : rien à rendre
  if (!jeton.rendu) { jeton.rendu = true; enCours = Math.max(0, enCours - 1); pomper(); }
}

/** Pour les tests et le diagnostic. */
export function etatFile() { return { enCours, enAttente: file.length }; }

// Exposés pour les tests : la logique de file se vérifie sans monter de composant.
export const _interne = { demander, rendre, MAX_SIMULTANEES, INTERVALLE_MS,
  reinitialiser() { enCours = 0; dernierDepart = 0; file.length = 0;
    if (minuteur) { clearTimeout(minuteur); minuteur = null; } } };

/**
 * Rend `{ src, fini }`. `src` vaut null tant que la file n'a pas donné le feu
 * vert ; `fini` doit être appelé quand l'image a chargé OU échoué, pour rendre
 * le créneau au suivant sans attendre le minuteur de secours.
 */
export function usePhotoCreneau(url, priorite = PRIORITE_LISTE) {
  const [src, setSrc] = useState(null);
  const jetonRef = useRef(null);

  useEffect(() => {
    if (!url) { setSrc(null); return undefined; }
    let vivant = true;
    let secours = null;
    const jeton = demander(priorite, () => {
      if (!vivant) { rendre(jeton); return; }
      setSrc(url);
      // Une image hors écran peut n'émettre aucun événement : sans ce filet, un
      // seul créneau perdu bloquerait la moitié de la file pour toujours.
      secours = setTimeout(() => rendre(jeton), SECOURS_MS);
    });
    jetonRef.current = { jeton, effacer: () => clearTimeout(secours) };
    return () => {
      vivant = false;
      clearTimeout(secours);
      rendre(jeton);          // sortie d'écran : le créneau repart aux suivants
      jetonRef.current = null;
      setSrc(null);
    };
  }, [url, priorite]);

  const fini = useCallback(() => {
    const j = jetonRef.current;
    if (!j) return;
    j.effacer();
    rendre(j.jeton);
  }, []);

  return { src, fini };
}
