import { useRef, useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import { useTheme } from '../theme/ThemeContext';
import { typography } from '../theme/tokens';

// ─── Données des slides ───────────────────────────────────────────────────────
//
// Pour modifier un slide : éditez les clés correspondantes dans locales/fr.json
// (et en.json / es.json / it.json pour les traductions).
//
// Pour ajouter un slide : ajoutez un objet ici ET les clés i18n dans les 4 fichiers.
// Pour retirer un slide : supprimez l'objet ici (et les clés i18n orphelines si souhaité).
//
// Icônes disponibles : n'importe quelle icône Ionicons.
// https://ionic.io/ionicons
//
// Pour remplacer les icônes par de vraies illustrations :
//   dans le composant Slide ci-dessous, cherchez le commentaire « 📸 Illustration ».

function buildSlides(t) {
  return [
    {
      key: 'welcome',
      icons: ['game-controller-outline'],
      title: t('onboarding.slides.welcome.title'),
      subtitle: t('onboarding.slides.welcome.subtitle'),
    },
    {
      key: 'map',
      icons: ['map-outline', 'ribbon-outline'],
      title: t('onboarding.slides.map.title'),
      body: t('onboarding.slides.map.body'),
    },
    {
      key: 'route',
      icons: ['navigate-outline', 'trophy-outline'],
      title: t('onboarding.slides.route.title'),
      body: t('onboarding.slides.route.body'),
    },
    {
      key: 'location',
      icons: ['location-outline'],
      title: t('onboarding.slides.location.title'),
      body: t('onboarding.slides.location.body'),
      isLocationSlide: true,
    },
  ];
}

// ─── Slide individuel ─────────────────────────────────────────────────────────

function Slide({ slide, slotWidth, illustrationHeight, theme, t, locationDenied, onRetry }) {
  const iconSize = slide.icons.length > 1 ? 52 : 80;

  return (
    <View style={{ width: slotWidth }}>

      {/* ── Zone illustration ── */}
      <View style={[styles.illustrationArea, { height: illustrationHeight }]}>
        {/*
          📸 Illustration — pour remplacer par une vraie image :
          Supprimez le <View style={styles.iconCircle}> ci-dessous et ajoutez :
          <Image
            source={require('../assets/onboarding/slide_${slide.key}.png')}
            style={{ width: slotWidth, height: illustrationHeight, resizeMode: 'contain' }}
          />
          (créez le dossier assets/onboarding/ et déposez vos images dedans)
        */}
        <View style={[styles.iconCircle, { backgroundColor: theme.accentDim }]}>
          {slide.icons.length === 1 ? (
            <Ionicons name={slide.icons[0]} size={iconSize} color={theme.accent} />
          ) : (
            <View style={styles.iconPair}>
              {slide.icons.map((name, i) => (
                <Ionicons key={i} name={name} size={iconSize} color={theme.accent} />
              ))}
            </View>
          )}
        </View>
      </View>

      {/* ── Zone texte ── */}
      <View style={styles.textArea}>
        <Text
          style={[typography.arcadeTitle, styles.slideTitle, { color: theme.textPrimary, fontSize: 18 }]}
          numberOfLines={2}
        >
          {slide.title}
        </Text>

        {slide.subtitle ? (
          <Text style={[styles.slideSubtitle, { color: theme.accent }]}>{slide.subtitle}</Text>
        ) : null}

        {slide.body ? (
          <Text style={[styles.slideBody, { color: theme.textSecondary }]}>{slide.body}</Text>
        ) : null}

        {/* Message de refus de localisation */}
        {slide.isLocationSlide && locationDenied ? (
          <View style={[styles.deniedCard, { backgroundColor: theme.surfaceHigh, borderColor: theme.border }]}>
            <Text style={[styles.deniedText, { color: theme.textSecondary }]}>
              {t('onboarding.locationDenied')}
            </Text>
            <TouchableOpacity onPress={onRetry} style={styles.retryBtn}>
              <Text style={[styles.retryText, { color: theme.accent }]}>
                {t('onboarding.retryPermission')}
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </View>
    </View>
  );
}

// ─── Écran Onboarding ─────────────────────────────────────────────────────────

export default function OnboardingScreen({ onComplete }) {
  const { t } = useTranslation();
  const { theme } = useTheme();
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();

  const flatListRef = useRef(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [locationDenied, setLocationDenied] = useState(false);
  const [requesting, setRequesting] = useState(false);

  const slides = useMemo(() => buildSlides(t), [t]);
  const isLast = currentIndex === slides.length - 1;

  const illustrationHeight = Math.round(height * 0.40);

  // ── Navigation entre slides ────────────────────────────────────────────────

  function goNext() {
    const next = Math.min(currentIndex + 1, slides.length - 1);
    flatListRef.current?.scrollToIndex({ index: next, animated: true });
    setCurrentIndex(next);
    setLocationDenied(false);
  }

  function handleScrollEnd(e) {
    const idx = Math.round(e.nativeEvent.contentOffset.x / width);
    if (idx !== currentIndex) {
      setCurrentIndex(idx);
      setLocationDenied(false);
    }
  }

  // ── Demande de permission GPS ──────────────────────────────────────────────

  async function requestLocation() {
    if (requesting) return;
    setRequesting(true);
    try {
      // Si permission déjà accordée (ex : replay onboarding), on complète directement
      const existing = await Location.getForegroundPermissionsAsync();
      if (existing.status === 'granted') { onComplete(); return; }

      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        onComplete();
      } else {
        setLocationDenied(true);
      }
    } catch {
      setLocationDenied(true);
    } finally {
      setRequesting(false);
    }
  }

  // ── Action du bouton principal ─────────────────────────────────────────────

  function handlePrimary() {
    if (!isLast) { goNext(); return; }
    if (locationDenied) { onComplete(); return; } // Continuer sans GPS
    requestLocation();
  }

  const primaryLabel = !isLast
    ? t('onboarding.next')
    : locationDenied
      ? t('onboarding.continueWithoutGps')
      : t('onboarding.allowAndStart');

  // ── Rendu ─────────────────────────────────────────────────────────────────

  const renderItem = useCallback(({ item }) => (
    <Slide
      slide={item}
      slotWidth={width}
      illustrationHeight={illustrationHeight}
      theme={theme}
      t={t}
      locationDenied={locationDenied}
      onRetry={requestLocation}
    />
  ), [width, illustrationHeight, theme, t, locationDenied]); // eslint-disable-line

  return (
    <View style={[styles.container, { backgroundColor: theme.bg, paddingTop: insets.top }]}>

      {/* ── Bouton Passer (haut droite) ── */}
      <TouchableOpacity style={styles.skipBtn} onPress={onComplete} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
        <Text style={[styles.skipText, { color: theme.textSecondary }]}>{t('onboarding.skip')}</Text>
      </TouchableOpacity>

      {/* ── Carrousel ── */}
      <FlatList
        ref={flatListRef}
        data={slides}
        horizontal
        showsHorizontalScrollIndicator={false}
        snapToInterval={width}
        decelerationRate="fast"
        bounces={false}
        keyExtractor={(item) => item.key}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
        onMomentumScrollEnd={handleScrollEnd}
        renderItem={renderItem}
        style={styles.flatList}
      />

      {/* ── Zone inférieure (fixe) ── */}
      <View style={[styles.bottom, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>

        {/* Indicateurs de progression */}
        <View style={styles.dots}>
          {slides.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                { backgroundColor: i === currentIndex ? theme.accent : theme.border },
                i === currentIndex && styles.dotActive,
              ]}
            />
          ))}
        </View>

        {/* Bouton principal */}
        <TouchableOpacity
          style={[styles.primaryBtn, { backgroundColor: theme.accent }]}
          onPress={handlePrimary}
          activeOpacity={0.8}
          disabled={requesting}
        >
          <Text style={[styles.primaryBtnText, { color: theme.bg }]}>{primaryLabel}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },

  skipBtn: {
    alignSelf: 'flex-end',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  skipText: { fontSize: 15 },

  flatList: { flex: 1 },

  illustrationArea: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconCircle: {
    width: 160,
    height: 160,
    borderRadius: 80,
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconPair: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 18,
  },

  textArea: {
    paddingHorizontal: 32,
    paddingTop: 28,
  },
  slideTitle: {
    marginBottom: 12,
    lineHeight: 28,
  },
  slideSubtitle: {
    fontSize: 17,
    lineHeight: 25,
    marginTop: 4,
  },
  slideBody: {
    fontSize: 16,
    lineHeight: 25,
    marginTop: 4,
  },

  deniedCard: {
    marginTop: 20,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  deniedText: {
    fontSize: 14,
    lineHeight: 21,
  },
  retryBtn: { marginTop: 10, alignSelf: 'flex-start' },
  retryText: { fontSize: 15, fontWeight: '600' },

  bottom: {
    paddingHorizontal: 24,
    paddingTop: 16,
    gap: 16,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  dotActive: {
    width: 20,
    borderRadius: 4,
  },

  primaryBtn: {
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
  },
  primaryBtnText: {
    fontSize: 16,
    fontWeight: '700',
  },
});
