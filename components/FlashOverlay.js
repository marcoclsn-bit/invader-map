import { useRef, useEffect } from 'react';
import { Animated, Image } from 'react-native';

// Animation de récompense au flash d'un Invader : l'alien « pop » et un score jaune
// (« +X PTS ») jaillit puis monte et s'estompe. Rendu EN DEHORS de la MapView
// (non clippé, non snapshotté), positionné via mapRef.pointForCoordinate → coordonnées
// relatives au container de la carte.
//
// Partagé entre l'écran Carte et l'écran Trajet.

const FLASHED_IMG = require('../assets/markers/alien_flashed.png');
const MARKER_SIZE = 30;
const SCORE_W = 220; // largeur fixe du texte score, centré sur le marqueur

export default function FlashOverlay({ invader, point, theme, onDone }) {
  const markerScale = useRef(new Animated.Value(1)).current;
  const scoreScale  = useRef(new Animated.Value(0.6)).current;
  const transY      = useRef(new Animated.Value(0)).current;
  const ptsAlpha    = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      // Pop du marqueur : plus prononcé
      Animated.sequence([
        Animated.timing(markerScale, { toValue: 2.1, duration: 120, useNativeDriver: true }),
        Animated.spring(markerScale, { toValue: 1, useNativeDriver: true, damping: 4, stiffness: 260, mass: 0.5 }),
      ]),
      // Score jaune : jaillit (scale 0.6→1.3 avec rebond), reste visible ~1.1 s
      Animated.sequence([
        Animated.parallel([
          Animated.timing(ptsAlpha, { toValue: 1, duration: 70, useNativeDriver: true }),
          Animated.sequence([
            Animated.timing(scoreScale, { toValue: 1.3, duration: 150, useNativeDriver: true }),
            Animated.spring(scoreScale, { toValue: 1, useNativeDriver: true, damping: 6, stiffness: 200, mass: 0.6 }),
          ]),
        ]),
        Animated.delay(680),
        Animated.timing(ptsAlpha, { toValue: 0, duration: 350, useNativeDriver: true }),
      ]),
      // Monte bien plus haut
      Animated.timing(transY, { toValue: -110, duration: 1100, useNativeDriver: true }),
    ]).start(onDone);
  }, []);

  const { x, y } = point;
  const half = MARKER_SIZE / 2;

  return (
    <>
      {/* Alien flashé en pop */}
      <Animated.View
        pointerEvents="none"
        style={{
          position: 'absolute',
          left: x - half, top: y - half,
          width: MARKER_SIZE, height: MARKER_SIZE,
          transform: [{ scale: markerScale }],
          zIndex: 900,
        }}
      >
        <Image source={FLASHED_IMG} style={{ width: MARKER_SIZE, height: MARKER_SIZE }} resizeMode="contain" fadeDuration={0} />
      </Animated.View>

      {/* Score arcade : jaune, Press Start 2P, ombre sombre pour lisibilité */}
      <Animated.Text
        pointerEvents="none"
        style={{
          position: 'absolute',
          width: SCORE_W,
          left: x - SCORE_W / 2,
          top: y - MARKER_SIZE - 20,
          fontFamily: 'PressStart2P_400Regular',
          fontSize: 22,
          color: theme.accentScore,
          textAlign: 'center',
          textShadowColor: 'rgba(0,0,0,0.85)',
          textShadowOffset: { width: 0, height: 2 },
          textShadowRadius: 6,
          opacity: ptsAlpha,
          transform: [{ scale: scoreScale }, { translateY: transY }],
          zIndex: 999,
        }}
      >
        {invader.points != null ? `+${invader.points} PTS` : '✓'}
      </Animated.Text>
    </>
  );
}
