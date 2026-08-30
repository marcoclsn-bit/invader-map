import { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import {
  View, Text, Image, FlatList, TouchableOpacity, StyleSheet, useWindowDimensions,
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
import { illustrations } from '../assets/onboarding';

// ─── Données des panneaux ─────────────────────────────────────────────────────
//
// Six panneaux, dans cet ordre : ce qu'on propose, ce qu'on prépare pour toi,
// ce qu'on t'évite de rater, ce que tu apportes, ce que tu accumules, ce qu'on
// te demande en échange. La permission arrive en dernier parce qu'elle ne se
// justifie qu'une fois les trois usages qui en dépendent montrés.
//
// Pour modifier un panneau : éditez les clés dans locales/fr.json (et en/es/it).
// Pour l'illustrer : déposez l'image et déclarez-la dans assets/onboarding/index.js.
// Icônes : n'importe quelle icône Ionicons — https://ionic.io/ionicons
//
// Le mode Explorateur n'est plus présenté ici : il VIDE la carte, et le choix
// n'a aucun sens avant d'avoir vu ce à quoi il fait renoncer. Il est proposé au
// lancement suivant par components/ExplorerIntro.js.

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
      key: 'chasse',
      icons: ['navigate-outline', 'compass-outline'],
      title: t('onboarding.slides.chasse.title'),
      body: t('onboarding.slides.chasse.body'),
    },
    {
      key: 'alerte',
      icons: ['notifications-outline'],
      title: t('onboarding.slides.alerte.title'),
      body: t('onboarding.slides.alerte.body'),
    },
    {
      key: 'import',
      icons: ['download-outline'],
      title: t('onboarding.slides.import.title'),
      body: t('onboarding.slides.import.body'),
      isImportSlide: true,
    },
    {
      key: 'collection',
      icons: ['grid-outline'],
      title: t('onboarding.slides.collection.title'),
      body: t('onboarding.slides.collection.body'),
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

function Slide({ slide, slotWidth, illustrationHeight, theme, t, locationDenied, onRetry, onImport }) {
  const iconSize = slide.icons.length > 1 ? 52 : 80;
  const image = illustrations[slide.key];

  return (
    <View style={{ width: slotWidth }}>

      {/* ── Zone illustration ── */}
      <View style={[styles.illustrationArea, { height: illustrationHeight }]}>
        {image ? (
          // resizeMode "contain" et non "cover" : une capture recadrée par la
          // hauteur perdrait justement la partie qui porte le message.
          <Image
            source={image}
            style={{ width: slotWidth, height: illustrationHeight }}
            resizeMode="contain"
            accessible
            accessibilityLabel={slide.title}
          />
        ) : slide.logo ? (
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

        {/* Raccourci vers l'import.
            Pas de bouton « Plus tard » en face : le « Suivant » du bas le dit
            déjà, et deux façons de ne rien faire brouillent la seule action. */}
        {slide.isImportSlide ? (
          <TouchableOpacity
            style={[styles.secondaryBtn, { borderColor: theme.accent }]}
            onPress={onImport}
            activeOpacity={0.8}
            accessibilityRole="button"
          >
            <Ionicons name="download-outline" size={18} color={theme.accent} />
            <Text style={[styles.secondaryBtnText, { color: theme.accent }]}>
              {t('onboarding.slides.import.action')}
            </Text>
          </TouchableOpacity>
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
  // Cliquet : une fois le panneau localisation VU, « Passer » disparaît pour de
  // bon, même si l'on glisse en arrière. Sans lui, voir le message puis reculer
  // d'un panneau redonnait l'échappatoire que le refus Apple 5.1.1(iv) vise —
  // le relecteur a cité le bouton sur le panneau même, la phrase couvre le reste.
  const [panneauLocalisationVu, setPanneauLocalisationVu] = useState(false);
  useEffect(() => { if (isLast) setPanneauLocalisationVu(true); }, [isLast]);

  // Les textes des six panneaux sont longs et la zone texte ne défile pas.
  // Sur un petit écran l'illustration cède donc de la place ; sur un grand elle
  // est plafonnée, sans quoi elle s'étirerait pour rien au détriment du texte.
  const illustrationHeight = Math.round(
    height < 700 ? height * 0.32 : Math.min(height * 0.40, 330),
  );

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

  // ── Raccourci « Importer mes flashs » ──────────────────────────────────────
  //
  // On termine l'onboarding et on ouvre l'import tout de suite : différer le
  // geste jusqu'au dernier panneau trahirait le bouton. La permission GPS n'est
  // pas perdue pour autant — la Carte, le Trajet et la Chasse la redemandent
  // chacun au premier usage.
  function handleImport() {
    track('onboarding_import', { panneau: currentIndex });
    onComplete({ import: true });
  }

  // ── Action du bouton principal ─────────────────────────────────────────────

  function handlePrimary() {
    if (!isLast) { goNext(); return; }
    if (locationDenied) { onComplete(); return; } // Continuer sans GPS
    requestLocation();
  }

  // « Commencer », PAS « Autoriser » : refus Apple 5.1.1(iv) du 30/08/2026 sur
  // la 1.5.0 (25). Un bouton qui precede la boite systeme ne doit pas employer
  // le vocabulaire de la permission — mot neutre exige (« Continue », « Next »).
  const primaryLabel = !isLast
    ? t('onboarding.next')
    : locationDenied
      ? t('onboarding.continueWithoutGps')
      : t('onboarding.start');

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
      onImport={handleImport}
    />
  ), [width, illustrationHeight, theme, t, locationDenied, currentIndex]); // eslint-disable-line

  return (
    <View style={[styles.container, { backgroundColor: theme.bg, paddingTop: insets.top }]}>

      {/* ── Bouton Passer (haut droite) ──
          MASQUÉ sur le panneau localisation : second grief du refus Apple
          5.1.1(iv) du 30/08/2026. Une fois le message préparatoire affiché,
          l'utilisateur doit toujours aboutir à la boîte système — c'est elle,
          et elle seule, qui permet de refuser. « Passer » depuis les panneaux
          précédents reste possible : le message n'a alors pas été montré, et
          les écrans redemandent chacun au premier usage. */}
      {!isLast && !panneauLocalisationVu && (
        <TouchableOpacity style={styles.skipBtn} onPress={onComplete} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={[styles.skipText, { color: theme.textSecondary }]}>{t('onboarding.skip')}</Text>
        </TouchableOpacity>
      )}

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

  secondaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: 8,
    marginTop: 20,
    borderRadius: 12,
    borderWidth: 1.5,
    paddingVertical: 12,
    paddingHorizontal: 16,
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '700' },

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
