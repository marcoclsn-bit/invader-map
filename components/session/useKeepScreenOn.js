// Garde l'écran allumé pendant un parcours suivi (Trajet ou Chasse).
//
// Pourquoi c'est indispensable et pas confortable : l'app ne demande que la
// permission de localisation « pendant l'utilisation », et le suivi d'arrière-plan
// iOS est désactivé (isIosBackgroundLocationEnabled: false). Dès que l'écran
// s'éteint, iOS suspend l'app et watchPositionAsync cesse de livrer des points.
// La session n'enregistrait donc que les instants où l'utilisateur regardait son
// téléphone : une marche d'une heure pouvait produire 400 m de distance, et la
// session finissait souvent jetée par le filtre des 100 m.
//
// On n'active le verrou que pendant le suivi, jamais en dehors : c'est le
// comportement de n'importe quelle app de navigation, et l'utilisateur a
// explicitement demandé à démarrer.

import { useEffect } from 'react';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';

const TAG = 'invaderquest-run';

// Le module natif est livré avec Expo et déjà présent dans les builds, mais on
// reste défensif : si l'appel échoue, le parcours doit continuer sans bruit.
function safe(fn) {
  try {
    const r = fn();
    if (r && typeof r.catch === 'function') r.catch(() => {});
  } catch {
    /* verrou indisponible : on n'empêche pas le parcours pour autant */
  }
}

export default function useKeepScreenOn(active) {
  useEffect(() => {
    if (!active) return undefined;
    safe(() => activateKeepAwakeAsync(TAG));
    return () => safe(() => deactivateKeepAwake(TAG));
  }, [active]);
}
