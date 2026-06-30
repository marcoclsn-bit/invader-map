import { memo } from 'react';
import { Marker } from 'react-native-maps';

// Marqueurs « légers » : on passe par la prop native `image` (pas de vue React
// par marqueur) → permet d'afficher des milliers de marqueurs sans saturer la
// mémoire de MKMapView (Paris ~1568). Images multi-échelles dans assets/pins/.
const IMAGES = {
  flashed:   require('../assets/pins/alien_flashed.png'),
  ok:        require('../assets/pins/alien_ok.png'),
  damaged:   require('../assets/pins/alien_damaged.png'),
  destroyed: require('../assets/pins/alien_destroyed.png'),
  unknown:   require('../assets/pins/alien_unknown.png'),
};

const ANCHOR = { x: 0.5, y: 0.5 };

// La clé (côté MapScreen) inclut l'état flashé pour forcer un nouveau Marker natif
// quand le statut change (tracksViewChanges=false fige le rendu).
const InvaderMarker = memo(function InvaderMarker({ invader, isFlashed, onPress, stopPropagation }) {
  const img = isFlashed ? IMAGES.flashed : (IMAGES[invader.status] ?? IMAGES.unknown);
  return (
    <Marker
      coordinate={{ latitude: invader.lat, longitude: invader.lng }}
      anchor={ANCHOR}
      image={img}
      tracksViewChanges={false}
      stopPropagation={stopPropagation}
      onPress={onPress}
    />
  );
});

export default InvaderMarker;
