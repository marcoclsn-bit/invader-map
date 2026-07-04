import { memo } from 'react';
import { Image, View, StyleSheet, Platform } from 'react-native';
import { Marker } from 'react-native-maps';

// iOS : images pleine résolution dans une vue personnalisée (permet le halo néon).
const IMAGES = {
  flashed:   require('../assets/markers/alien_flashed.png'),
  ok:        require('../assets/markers/alien_ok.png'),
  damaged:   require('../assets/markers/alien_damaged.png'),
  destroyed: require('../assets/markers/alien_destroyed.png'),
  unknown:   require('../assets/markers/alien_unknown.png'),
};

// Android : marqueur NATIF via la prop `image` (bitmap direct, aucune capture de vue
// → rendu instantané des 1 528 marqueurs, pas de pin rouge ni de doublon).
// Chaque image existe en 3 densités (30px @1x, 60px @2x, 90px @3x) : dans un build,
// React Native les range dans les drawable-*dpi Android → taille rendue = 30 dp
// partout, identique à iOS, quelle que soit la densité de l'écran.
// (Un PNG unique sans densité rendait une taille en pixels physiques → incohérente.)
const ANDROID_IMAGES = {
  flashed:   require('../assets/markers/android/alien_flashed.png'),
  ok:        require('../assets/markers/android/alien_ok.png'),
  damaged:   require('../assets/markers/android/alien_damaged.png'),
  destroyed: require('../assets/markers/android/alien_destroyed.png'),
  unknown:   require('../assets/markers/android/alien_unknown.png'),
};

const SIZE = 30;
const ANCHOR = { x: 0.5, y: 0.5 };

const InvaderMarker = memo(function InvaderMarker({ invader, isFlashed, onPress, stopPropagation }) {
  const statusKey = IMAGES[invader.status] ? invader.status : 'unknown';
  const key = isFlashed ? 'flashed' : statusKey;

  if (Platform.OS === 'android') {
    return (
      <Marker
        coordinate={{ latitude: invader.lat, longitude: invader.lng }}
        anchor={ANCHOR}
        image={ANDROID_IMAGES[key]}
        tracksViewChanges={false}
        stopPropagation={stopPropagation}
        onPress={onPress}
      />
    );
  }

  // iOS : vue personnalisée (halo néon sur les flashés). tracksViewChanges=false = OK.
  return (
    <Marker
      coordinate={{ latitude: invader.lat, longitude: invader.lng }}
      anchor={ANCHOR}
      tracksViewChanges={false}
      stopPropagation={stopPropagation}
      onPress={onPress}
    >
      <View style={isFlashed ? styles.glowWrap : styles.wrap}>
        <Image source={IMAGES[key]} style={styles.img} resizeMode="contain" fadeDuration={0} />
      </View>
    </Marker>
  );
});

export default InvaderMarker;

const styles = StyleSheet.create({
  wrap:     { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  glowWrap: {
    width: SIZE, height: SIZE,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#3DF96B',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.95,
    shadowRadius: 7,
  },
  img: { width: SIZE, height: SIZE },
});
