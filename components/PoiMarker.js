// Marqueur d'un lieu d'intérêt : losange doré, même signe que dans la Chasse.
//
// Android : bitmap NATIF via la prop `image`, comme InvaderMarker. Une vue React
// obligerait react-native-maps à capturer chaque marqueur, ce qui sature le fil
// graphique et bloque le rendu des tuiles (le problème déjà rencontré avec les
// 1 528 Invaders). Trois densités fournies → 30 dp rendus partout.
//
// iOS : vue personnalisée, MKMapView la gère sans capture dès lors que
// tracksViewChanges vaut false.

import { memo } from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { Marker } from 'react-native-maps';

const ANDROID_IMAGE = require('../assets/markers/android/poi.png');
const SIZE = 13;
const ANCHOR = { x: 0.5, y: 0.5 };

const PoiMarker = memo(function PoiMarker({ poi, color, borderColor, onPress }) {
  const coordinate = { latitude: poi.lat, longitude: poi.lng };

  if (Platform.OS === 'android') {
    return (
      <Marker
        coordinate={coordinate}
        anchor={ANCHOR}
        image={ANDROID_IMAGE}
        tracksViewChanges={false}
        stopPropagation
        onPress={onPress}
      />
    );
  }

  return (
    <Marker coordinate={coordinate} anchor={ANCHOR} tracksViewChanges={false} stopPropagation onPress={onPress}>
      <View style={[styles.diamond, { backgroundColor: color, borderColor }]} />
    </Marker>
  );
});

export default PoiMarker;

const styles = StyleSheet.create({
  diamond: {
    width: SIZE, height: SIZE, borderRadius: 3, borderWidth: 1.5,
    transform: [{ rotate: '45deg' }],
  },
});
