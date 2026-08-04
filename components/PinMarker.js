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
 * FENÊTRE INSUFFISANTE SUR ANDROID. Signalé sur le terrain : un Invader flashé
 * pendant une chasse gardait sa pastille verte numérotée, sans ✓ ni extinction.
 * Rouvrir `tracksViewChanges` ne suffit pas quand seules les COULEURS du contenu
 * changent : la taille du marqueur restant identique, la vue native ne se juge
 * pas invalidée et ne recapture rien.
 *
 * Le remède fiable est de démonter le marqueur : `stateKey`, quand il change,
 * remonte un <Marker> neuf, qui capture forcément l'apparence courante. C'est le
 * mécanisme déjà employé pour InvaderMarker sur iOS (clé porteuse de l'état
 * flashé). Coût : un remontage, uniquement pour le marqueur qui change.
 *
 * ANDROID SEULEMENT. iOS recapture correctement dans la fenêtre de tracking : y
 * ajouter un remontage n'apporterait rien et ferait clignoter un marqueur qui se
 * met à jour proprement aujourd'hui. On ne répare pas ce qui fonctionne.
 *
 * @param {*} redrawKey  valeur qui, en changeant, rouvre la fenêtre de tracking
 * @param {*} stateKey   apparence du marqueur ; en changeant, force un remontage
 */
function PinMarkerInner({ redrawKey, children, ...props }) {
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

export default function PinMarker({ stateKey, ...props }) {
  // Sur Android la clé porte l'apparence : un changement de couleur ou de libellé
  // remonte le marqueur, ce qui garantit une capture fraîche là où le tracking
  // échoue. Sur iOS la clé reste constante : le comportement d'origine est intact.
  return Platform.OS === 'android'
    ? <PinMarkerInner key={stateKey ?? 'x'} {...props} />
    : <PinMarkerInner {...props} />;
}
