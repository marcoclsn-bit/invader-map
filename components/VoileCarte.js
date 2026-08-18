import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet } from 'react-native';
import { useTheme } from '../theme/ThemeContext';

/**
 * Voile sombre par-dessus une carte, le temps qu'elle s'affiche.
 *
 * Apple Maps montre un fond BLANC pendant l'instant qui précède son premier
 * rendu — visible sur une vidéo décomposée : l'interface est déjà dessinée,
 * boutons et barre d'onglets compris, et seule la zone de carte est blanche.
 * Dans une app sombre, l'éclair saute aux yeux, au lancement comme au premier
 * passage sur Trajet ou sur Chasse.
 *
 * POURQUOI NOTRE PROPRE VOILE, et non `loadingEnabled` de react-native-maps.
 * Cette prop existe, elle est déclarée pour Apple Maps, et l'activer n'a pas
 * suffi : le blanc survient avant que la vue de chargement native ne soit
 * peinte. Un voile React monté au-dessus de la carte ne dépend, lui, d'aucun
 * calendrier interne à la bibliothèque — il est là dès le premier rendu de
 * l'écran, donc avant que la carte n'existe.
 *
 * Il DISPARAÎT EN FONDU plutôt que d'un coup : la carte apparaît alors comme si
 * elle se révélait, au lieu de remplacer brutalement un aplat.
 *
 * @param {boolean} pret  la carte a signalé qu'elle est prête
 */
export default function VoileCarte({ pret }) {
  const { theme } = useTheme();
  const opacite = useRef(new Animated.Value(1)).current;
  const [monte, setMonte] = useState(true);
  const [expire, setExpire] = useState(false);

  // BUTÉE DE SÉCURITÉ. `onMapReady` peut ne jamais se déclencher — MapScreen
  // prévoit déjà ce cas pour ses marqueurs. Sans elle, un voile opaque
  // masquerait la carte POUR TOUJOURS : le remède serait alors bien pire que
  // l'éclair d'un dixième de seconde qu'il corrige.
  useEffect(() => {
    const t = setTimeout(() => setExpire(true), 2500);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!pret && !expire) return undefined;
    const anim = Animated.timing(opacite, {
      toValue: 0, duration: 260, useNativeDriver: true,
    });
    anim.start(({ finished }) => { if (finished) setMonte(false); });
    return () => anim.stop();
  }, [pret, expire, opacite]);

  // Une fois retiré, plus rien : garder une vue transparente au-dessus de la
  // carte intercepterait les gestes, ou coûterait une couche de composition à
  // chaque image.
  if (!monte) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFillObject, { backgroundColor: theme.bg, opacity: opacite }]}
    />
  );
}
