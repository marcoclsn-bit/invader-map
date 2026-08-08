import { useRef, useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, useWindowDimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import { useAppContext } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import { typography } from '../theme/tokens';
import Logo from '../components/Logo';
import { track } from '../services/analytics';

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
      logo: true,
      icons: ['game-controller-outline'], // repli si le logo est retiré
      title: t('onboarding.slides.welcome.title'),
      subtitle: t('onboarding.slides.welcome.subtitle'),
    },
    {
      key: 'map',
      icons: ['map-outline'],
      title: t('onboarding.slides.map.title'),
      body: t('onboarding.slides.map.body'),
    },
    {
      key: 'trajet',
      icons: ['navigate-outline'],
      title: t('onboarding.slides.trajet.title'),
      body: t('onboarding.slides.trajet.body'),
    },
    {
      key: 'chasse',
      icons: ['compass-outline'],
      title: t('onboarding.slides.chasse.title'),
      body: t('onboarding.slides.chasse.body'),
    },
    {
      key: 'balade',
      icons: ['walk-outline'],
      title: t('onboarding.slides.balade.title'),
      body: t('onboarding.slides.balade.body'),
    },
    {
      key: 'explorer',
      icons: ['eye-off-outline'],
      title: t('onboarding.slides.explorer.title'),
      body: t('onboarding.slides.explorer.body'),
      isExplorerSlide: true,
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

function Slide({ slide, slotWidth, illustrationHeight, theme, t, locationDenied, onRetry, explorer, onExplorer }) {
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
        {slide.logo ? (
          // Logo InvaderQuest (variante auto selon le thème — jamais invisible)
          <Logo size={Math.min(140, illustrationHeight * 0.7)} />
        ) : (
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
        )}
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
        {/* Le choix se fait ICI, pas dans un réglage qu'on ne trouvera jamais.
            Mais le défaut reste « tout voir » : personne ne doit se retrouver
            avec une carte vide sans l'avoir demandé, et le mode se comprend
            mieux une fois qu'on a vu à quoi il renonce. */}
        {slide.isExplorerSlide ? (
          <View style={styles.modeRow}>
            {[
              { on: false, label: t('onboarding.slides.explorer.normal'), sub: t('onboarding.slides.explorer.normalSub') },
              { on: true, label: t('onboarding.slides.explorer.blind'), sub: t('onboarding.slides.explorer.blindSub') },
            ].map((opt) => {
              const actif = explorer === opt.on;
              return (
                <TouchableOpacity
                  key={String(opt.on)}
                  style={[
                    styles.modeCard,
                    { backgroundColor: theme.surfaceHigh, borderColor: actif ? theme.accent : theme.border },
                  ]}
                  onPress={() => onExplorer(opt.on)}
                  activeOpacity={0.85}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: actif }}
                >
                  <Text style={[styles.modeCardLabel, { color: actif ? theme.accent : theme.textPrimary }]}>
                    {opt.label}
                  </Text>
                  <Text style={[styles.modeCardSub, { color: theme.textSecondary }]}>{opt.sub}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        ) : null}

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
  const { explorer, setExplorer } = useAppContext();
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
      // Mesuré ici et nulle part ailleurs quand c'est accordé : c'est le seul
      // endroit où la question est posée, une fois par installation — donc un
      // événement par utilisateur, pas un par ouverture. Sans GPS, la Chasse,
      // le Trajet et la Balade sont inutilisables : ce taux conditionne tout.
      track('location_permission', { result: status === 'granted' ? 'granted' : 'denied', from: 'onboarding' });
      if (status === 'granted') {
        onComplete();
      } else {
        setLocationDenied(true);
      }
    } catch {
      track('location_permission', { result: 'error', from: 'onboarding' });
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
      explorer={explorer}
      onExplorer={setExplorer}
    />
  ), [width, illustrationHeight, theme, t, locationDenied, explorer, setExplorer]); // eslint-disable-line

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

  modeRow: { flexDirection: 'row', gap: 10, marginTop: 18, paddingHorizontal: 4 },
  modeCard: {
    flex: 1, borderRadius: 12, borderWidth: 1.5, paddingVertical: 12, paddingHorizontal: 11,
  },
  modeCardLabel: { fontSize: 13.5, fontWeight: '700' },
  modeCardSub: { fontSize: 11.5, marginTop: 4, lineHeight: 15 },

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
