import { memo } from 'react';
import { Image, View, StyleSheet, Platform } from 'react-native';
import { Marker } from 'react-native-maps';

// iOS : images pleine résolution, affichées dans une vue personnalisée (permet le halo néon).
const IMAGES = {
  flashed:   require('../assets/markers/alien_flashed.png'),
  ok:        require('../assets/markers/alien_ok.png'),
  damaged:   require('../assets/markers/alien_damaged.png'),
  destroyed: require('../assets/markers/alien_destroyed.png'),
  unknown:   require('../assets/markers/alien_unknown.png'),
};

// Android : versions redimensionnées (~90 px) pour la prop native `image`.
// Le marqueur natif rend le bitmap tel quel (pas de mise à l'échelle en dp).
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

  // Android : marqueur NATIF via la prop `image` (bitmap direct, pas de vue React).
  // → pas de capture de vue (donc pas de « pin rouge » par défaut le temps du rendu),
  //   pas de marqueur vide, pas de doublon, et le changement d'icône au flash est
  //   atomique côté natif (avec une clé stable, le marqueur est mis à jour en place).
  //   Le halo néon des flashés n'existe pas sur Android de toute façon.
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
  const img = IMAGES[key];
  return (
    <Marker
      coordinate={{ latitude: invader.lat, longitude: invader.lng }}
      anchor={ANCHOR}
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
