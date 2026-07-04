import { useState, useEffect } from 'react';
import { Platform } from 'react-native';
import { Marker } from 'react-native-maps';

/**
 * Marqueur à vue personnalisée (drapeau, pastille numérotée…) fiable sur Android.
 *
 * Sur Android, un <Marker> avec une vue enfant et tracksViewChanges={false} reste
 * INVISIBLE : le bitmap de la vue n'est jamais capturé. On active donc le "tracking"
 * au montage (et à chaque changement de `redrawKey`, ex. sélection) pour capturer la
 * vue, puis on le coupe pour la perf. iOS conserve false (comportement d'origine, OK).
 *
 * @param {*} redrawKey  valeur qui, en changeant, force une re-capture (ex. état sélectionné)
 */
export default function PinMarker({ redrawKey, children, ...props }) {
  const [tracks, setTracks] = useState(Platform.OS === 'android');
  useEffect(() => {
    if (Platform.OS !== 'android') return;
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
