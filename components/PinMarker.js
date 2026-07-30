import { useState, useEffect, useRef } from 'react';
import { Platform } from 'react-native';
import { Marker } from 'react-native-maps';

/**
 * Marqueur à vue personnalisée (drapeau, pastille numérotée…) fiable sur Android.
 *
 * Sur Android, un <Marker> avec une vue enfant et tracksViewChanges={false} reste
 * INVISIBLE : le bitmap de la vue n'est jamais capturé. On active donc le "tracking"
 * au montage (et à chaque changement de `redrawKey`, ex. sélection) pour capturer la
 * vue, puis on le coupe pour la perf.
 *
 * iOS capture correctement la vue au montage, mais avec tracksViewChanges={false}
 * il ne la recapture JAMAIS ensuite : un marqueur dont l'apparence change en cours
 * de route (Invader flashé pendant une chasse) gardait son ancien bitmap
 * indéfiniment. On rouvre donc une brève fenêtre de tracking sur iOS aussi, mais
 * seulement à partir du DEUXIÈME rendu, pour ne pas payer la capture au montage.
 *
 * @param {*} redrawKey  valeur qui, en changeant, force une re-capture (ex. état sélectionné)
 */
export default function PinMarker({ redrawKey, children, ...props }) {
  const [tracks, setTracks] = useState(Platform.OS === 'android');
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) {
      firstRun.current = false;
      if (Platform.OS !== 'android') return;
    }
    setTracks(true);
    const id = setTimeout(() => setTracks(false), 700);
    return () => clearTimeout(id);
  }, [redrawKey]);

  return (
    <Marker tracksViewChanges={tracks} {...props}>
      {children}
    </Marker>
  );
}
