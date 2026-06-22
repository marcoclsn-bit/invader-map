import { memo } from 'react';
import { Image, View, StyleSheet } from 'react-native';
import { Marker } from 'react-native-maps';

// Pré-requis statiques — Metro bundle les PNGs au build, zéro chargement async,
// zéro bug de teintage iOS (pas de prop `image`, toujours des children).
const IMAGES = {
  flashed:   require('../assets/markers/alien_flashed.png'),
  ok:        require('../assets/markers/alien_ok.png'),
  damaged:   require('../assets/markers/alien_damaged.png'),
  destroyed: require('../assets/markers/alien_destroyed.png'),
  unknown:   require('../assets/markers/alien_unknown.png'),
};

const SIZE = 30;

// La clé doit inclure l'état flashé (ex. `${id}-${isFlashed?1:0}`) pour forcer
// un nouveau Marker natif quand le statut change, car tracksViewChanges=false
// empêche la mise à jour du snapshot natif en place.
const InvaderMarker = memo(function InvaderMarker({ invader, isFlashed, onPress, stopPropagation }) {
  const img = isFlashed ? IMAGES.flashed : (IMAGES[invader.status] ?? IMAGES.unknown);
  return (
    <Marker
      coordinate={{ latitude: invader.lat, longitude: invader.lng }}
      anchor={{ x: 0.5, y: 0.5 }}
      tracksViewChanges={false}
      stopPropagation={stopPropagation}
      onPress={onPress}
    >
      <View style={isFlashed ? styles.glowWrap : styles.wrap}>
        <Image source={img} style={styles.img} resizeMode="contain" fadeDuration={0} />
      </View>
    </Marker>
  );
});

export default InvaderMarker;

const styles = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  glowWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#3DF96B',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 7,
  },
  img: { width: SIZE, height: SIZE },
});
