import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../theme/ThemeContext';
import { typography } from '../../theme/tokens';
import { useGamification } from '../../context/GamificationContext';

// Affiche le 1er badge de la file ; auto-fermeture après quelques secondes.
export default function BadgeCelebration() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { celebration, dismissCelebration } = useGamification();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!celebration) return;
    anim.setValue(0);
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 6 }).start();
    const tm = setTimeout(dismissCelebration, 3500);
    return () => clearTimeout(tm);
  }, [celebration]);

  if (!celebration) return null;

  return (
    <Pressable style={styles.overlay} onPress={dismissCelebration}>
      <Animated.View
        style={[
          styles.card,
          { backgroundColor: theme.surface, borderColor: theme.accent, shadowColor: theme.accent,
            opacity: anim, transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }] },
        ]}
      >
        <View style={[styles.iconRing, { borderColor: theme.accent, backgroundColor: theme.accentDim }]}>
          <Ionicons name={celebration.iconName} size={30} color={theme.accent} />
        </View>
        <Text style={[typography.arcadeHeading, styles.kicker, { color: theme.accent }]}>{t('celebration.title')}</Text>
        <Text style={[styles.name, { color: theme.textPrimary }]}>{t(`badges.${celebration.id}.title`)}</Text>
        <Text style={[styles.desc, { color: theme.textSecondary }]}>{t(`badges.${celebration.id}.desc`)}</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 999 },
  card: {
    width: 280, borderRadius: 20, borderWidth: 1.5, padding: 24, alignItems: 'center',
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 16, elevation: 12,
  },
  iconRing: { width: 64, height: 64, borderRadius: 32, borderWidth: 2, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  kicker: { fontSize: 12, letterSpacing: 1, marginBottom: 6 },
  name: { fontSize: 18, fontWeight: '800', textAlign: 'center' },
  desc: { fontSize: 12, textAlign: 'center', marginTop: 6, lineHeight: 18 },
});
