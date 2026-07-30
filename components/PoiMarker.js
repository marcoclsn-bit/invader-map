// Marqueur d'un lieu d'intérêt : losange doré, même signe que dans la Chasse.
//
// Le losange est une IMAGE aux 3 densités, pas une vue stylée. Deux raisons :
//   • iOS — une vue avec `transform: rotate` laissait apparaître le pin rouge
//     par défaut de MKMapView tant que la vue n'était pas capturée. Une image
//     statique est résolue dès la première mise en page, comme InvaderMarker.
//   • Android — la prop `image` donne un marqueur natif : aucune capture de vue,
//     donc pas de saturation du fil graphique quand plusieurs centaines de
//     marqueurs arrivent d'un coup.

import { memo } from 'react';
import { Image, View, StyleSheet, Platform } from 'react-native';
import { Marker } from 'react-native-maps';

// L'image fait 30 dp de côté sur les deux plateformes, mais le losange n'en
// occupe que 60 % : la marge transparente sert de zone tactile. Sans elle, le
// signe était trop petit pour être touché avec précision.
// (Auparavant iOS rendait l'image à 15 pt et Android à 30 dp, via le même
// fichier : le losange était deux fois plus gros sur Android.)
const IMAGE = require('../assets/markers/poi.png');
const SIZE = 30;
const ANCHOR = { x: 0.5, y: 0.5 };

const PoiMarker = memo(function PoiMarker({ poi, onPress, label, hint }) {
  const coordinate = { latitude: poi.lat, longitude: poi.lng };

  if (Platform.OS === 'android') {
    return (
      <Marker
        coordinate={coordinate}
        anchor={ANCHOR}
        image={IMAGE}
        tracksViewChanges={false}
        stopPropagation
        onPress={onPress}
        accessible
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={hint}
      />
    );
  }

  return (
    <Marker
      coordinate={coordinate}
      anchor={ANCHOR}
      tracksViewChanges={false}
      stopPropagation
      onPress={onPress}
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
    >
      <View style={styles.wrap} importantForAccessibility="no-hide-descendants">
        <Image source={IMAGE} style={styles.img} resizeMode="contain" fadeDuration={0} />
      </View>
    </Marker>
  );
});

export default PoiMarker;

const styles = StyleSheet.create({
  wrap: { width: SIZE, height: SIZE, alignItems: 'center', justifyContent: 'center' },
  img:  { width: SIZE, height: SIZE },
});
