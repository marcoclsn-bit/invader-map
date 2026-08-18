import { useMemo, useCallback } from 'react';
import { useAppContext } from '../../context/AppContext';
import { useGamification } from '../../context/GamificationContext';
import { decouperSorties, traceSortie } from '../../utils/sorties';
import { makeSession } from '../../utils/session';

/**
 * Les sorties reconstituées, et de quoi en ouvrir le récap.
 *
 * Partagé entre la Carte (bouton « partager ma sortie ») et l'écran Mes
 * sorties : la construction de la session est délicate — identifiant
 * déterministe, distance volontairement absente, tracé chronologique — et la
 * dupliquer aurait garanti qu'une des deux copies dérive.
 */
export function useSorties() {
  const { flashedDates, invaders } = useAppContext();
  const { previewRecap } = useGamification();

  const sorties = useMemo(() => decouperSorties(flashedDates), [flashedDates]);

  // Index par identifiant : `traceSortie` en a besoin à chaque ouverture, et
  // Paris compte 1 351 mosaïques.
  const parId = useMemo(
    () => new Map((invaders ?? []).map((i) => [i.id, i])),
    [invaders],
  );

  const ouvrir = useCallback((sortie) => {
    if (!sortie) return;
    const session = makeSession({
      source: 'auto',
      startedAt: sortie.startedAt,
      endedAt: sortie.endedAt,
      city: sortie.city,
      invaderIds: sortie.invaderIds,
      // PAS de distance : sans trace GPS, relier les mosaïques en ligne droite
      // sous-estimerait toujours le trajet réel. Le récap affiche « — », ce qui
      // est honnête ; annoncer 2 km à qui en a marché 5 ne le serait pas.
      distanceKm: null,
      routeCoords: traceSortie(sortie, parId),
    });
    // L'identifiant déterministe l'emporte sur celui, tiré au hasard, que
    // produit makeSession. Sans effet tant qu'on ne fait qu'afficher ;
    // indispensable le jour où ces sorties seront enregistrées.
    previewRecap({ ...session, id: sortie.id });
  }, [parId, previewRecap]);

  return { sorties, derniere: sorties[0] ?? null, ouvrir };
}

export default useSorties;
