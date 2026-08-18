import { useMemo, useCallback } from 'react';
import { useAppContext } from '../../context/AppContext';
import { useGamification } from '../../context/GamificationContext';
import { decouperSorties, traceSortie } from '../../utils/sorties';
import { makeSession } from '../../utils/session';
import { distanceSortie } from '../../services/sortieDistance';

/**
 * Les sorties reconstituées, et de quoi en ouvrir le récap.
 *
 * Partagé entre la Carte (bouton « partager ma sortie ») et l'écran Mes
 * sorties : la construction de la session est délicate — identifiant
 * déterministe, distance calculée en différé, tracé chronologique — et la
 * dupliquer aurait garanti qu'une des deux copies dérive.
 */
export function useSorties() {
  const { flashedDates, invaders } = useAppContext();
  const { previewRecap, majDistanceRecap } = useGamification();

  const sorties = useMemo(() => decouperSorties(flashedDates), [flashedDates]);

  // Index par identifiant : `traceSortie` en a besoin à chaque ouverture, et
  // Paris compte 1 351 mosaïques.
  const parId = useMemo(
    () => new Map((invaders ?? []).map((i) => [i.id, i])),
    [invaders],
  );

  const ouvrir = useCallback((sortie) => {
    if (!sortie) return;
    const trace = traceSortie(sortie, parId);
    const session = makeSession({
      source: 'auto',
      startedAt: sortie.startedAt,
      endedAt: sortie.endedAt,
      city: sortie.city,
      invaderIds: sortie.invaderIds,
      // Inconnue à cet instant : sans trace GPS, il faut un itinéraire piéton
      // pour la connaître, et il arrive quelques instants plus tard (voir plus
      // bas). Le récap affiche « — » en attendant.
      distanceKm: null,
      // Provisoire : mosaïques reliées en ligne droite. Remplacé par le vrai
      // cheminement dès que l'itinéraire répond — les lignes droites traversent
      // les immeubles, ce qui se voit sur une carte partagée.
      routeCoords: trace,
    });
    // L'identifiant déterministe l'emporte sur celui, tiré au hasard, que
    // produit makeSession. Sans effet tant qu'on ne fait qu'afficher ;
    // indispensable le jour où ces sorties seront enregistrées.
    previewRecap({ ...session, id: sortie.id });
    // Distance ET tracé réel en différé : le récap s'ouvre immédiatement avec
    // « — » et des lignes droites, puis se complète quand l'itinéraire piéton
    // répond. Un seul appel réseau sert les deux.
    distanceSortie(sortie.id, trace)
      .then((r) => r && majDistanceRecap(sortie.id, r))
      .catch(() => { /* le récap garde ses lignes droites, comme avant */ });
  }, [parId, previewRecap, majDistanceRecap]);

  return { sorties, derniere: sorties[0] ?? null, ouvrir };
}

export default useSorties;
