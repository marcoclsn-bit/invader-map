import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../../theme/ThemeContext';
import { typography } from '../../theme/tokens';
import { useGamification } from '../../context/GamificationContext';

// Annonce groupée des trophées débloqués d'un coup (« tout marquer », import).
//
// Pourquoi un écran distinct de BadgeCelebration : celui-ci montre UN trophée et
// se referme seul après 3,5 s. Enchaîné dix fois, il retient l'utilisateur une
// demi-minute pour une action qu'il a demandée une seule fois. Ici on annonce le
// compte, on nomme les trois premiers, et on dit où retrouver le reste.
//
// Pas de fermeture automatique, contrairement à la célébration unitaire : ce
// panneau porte une information à lire, pas une animation à subir. Il part au
// toucher.
const APERCU = 3;

export default function BadgeBatch() {
  const { theme } = useTheme();
  const { t } = useTranslation();
  const { batchBadges, clearBatchBadges } = useGamification();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (!batchBadges) return;
    anim.setValue(0);
    Animated.spring(anim, { toValue: 1, useNativeDriver: true, friction: 6 }).start();
  }, [batchBadges]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!batchBadges) return null;

  const { ids } = batchBadges;
  const apercu = ids.slice(0, APERCU);
  const reste = ids.length - apercu.length;

  return (
    <Pressable style={styles.overlay} onPress={clearBatchBadges}>
      <Animated.View
        style={[
          styles.card,
          { backgroundColor: theme.surface, borderColor: theme.accent, shadowColor: theme.accent,
            opacity: anim, transform: [{ scale: anim.interpolate({ inputRange: [0, 1], outputRange: [0.8, 1] }) }] },
        ]}
      >
        <View style={[styles.iconRing, { borderColor: theme.accent, backgroundColor: theme.accentDim }]}>
          <Ionicons name="trophy" size={30} color={theme.accent} />
        </View>

        <Text style={[typography.arcadeHeading, styles.kicker, { color: theme.accent }]}>
          {t('batchBadges.title', { count: ids.length })}
        </Text>

        <View style={styles.list}>
          {apercu.map((id) => (
            <Text key={id} style={[styles.name, { color: theme.textPrimary }]} numberOfLines={1}>
              {t(`badges.${id}.title`)}
            </Text>
          ))}
          {reste > 0 && (
            <Text style={[styles.more, { color: theme.textSecondary }]}>
              {t('batchBadges.more', { count: reste })}
            </Text>
          )}
        </View>

        <Text style={[styles.where, { color: theme.textSecondary }]}>{t('batchBadges.where')}</Text>
        <Text style={[styles.hint, { color: theme.textSecondary }]}>{t('batchBadges.dismiss')}</Text>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)', zIndex: 999,
  },
  card: {
    width: 288, borderRadius: 20, borderWidth: 1.5, padding: 24, alignItems: 'center',
    shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.6, shadowRadius: 16, elevation: 12,
  },
  iconRing: {
    width: 64, height: 64, borderRadius: 32, borderWidth: 2,
    alignItems: 'center', justifyContent: 'center', marginBottom: 14,
  },
  kicker: { fontSize: 12, letterSpacing: 1, marginBottom: 10, textAlign: 'center' },
  list: { alignSelf: 'stretch', alignItems: 'center', gap: 3 },
  name: { fontSize: 15, fontWeight: '700', textAlign: 'center' },
  more: { fontSize: 12.5, marginTop: 2 },
  where: { fontSize: 12.5, textAlign: 'center', marginTop: 14, lineHeight: 18 },
  hint: { fontSize: 11, textAlign: 'center', marginTop: 10, opacity: 0.7 },
});
