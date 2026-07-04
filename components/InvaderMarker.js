import { memo, useState, useEffect } from 'react';
import { Image, View, StyleSheet, Platform } from 'react-native';
import { Marker } from 'react-native-maps';

const IMAGES = {
  flashed:   require('../assets/markers/alien_flashed.png'),
  ok:        require('../assets/markers/alien_ok.png'),
  damaged:   require('../assets/markers/alien_damaged.png'),
  destroyed: require('../assets/markers/alien_destroyed.png'),
  unknown:   require('../assets/markers/alien_unknown.png'),
};

const SIZE = 30;
const ANCHOR = { x: 0.5, y: 0.5 };

const InvaderMarker = memo(function InvaderMarker({ invader, isFlashed, onPress, stopPropagation }) {
  const statusKey = IMAGES[invader.status] ? invader.status : 'unknown';
  const img = isFlashed ? IMAGES.flashed : IMAGES[statusKey];

  // Vue dimensionnée en dp (SIZE) → taille cohérente sur TOUS les écrans, identique à
  // iOS. (La prop `image` native rendait une taille en pixels physiques, donc dépendante
  // de la densité de l'écran = incohérente d'un téléphone à l'autre.)
  //
  // Android : une vue-marqueur doit être « trackée » au moins une fois pour capturer son
  // bitmap (sinon invisible) ; on re-track à chaque changement d'état flashé (maj d'icône
  // en place) puis on coupe pour la perf. iOS reste sur false (comportement d'origine).
  const [tracks, setTracks] = useState(Platform.OS === 'android');
  useEffect(() => {
    if (Platform.OS !== 'android') return;
    setTracks(true);
    const id = setTimeout(() => setTracks(false), 800);
    return () => clearTimeout(id);
  }, [isFlashed]);

  return (
    <Marker
      coordinate={{ latitude: invader.lat, longitude: invader.lng }}
      anchor={ANCHOR}
      tracksViewChanges={tracks}
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
