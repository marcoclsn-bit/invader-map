import { useState, useMemo, useCallback, memo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Switch, Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { DrawerActions } from '@react-navigation/native';
import { useAppContext } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import { typography } from '../theme/tokens';
import { statusKey } from '../constants';
import { CITIES } from '../cities/registry';
import { usePhotoCreneau, PRIORITE_LISTE, POIDS_FLASHINVADERS, POIDS_SPOTTER } from '../services/photoQueue';
import { track } from '../services/analytics';

/**
 * Collection — la vue « Pokédex ».
 *
 * PAR DÉFAUT, la grille est faite de nos cinq aliens pixel : 1,2 Ko pièce, déjà
 * dans le binaire, affichés hors ligne, et ils nous appartiennent. C'est aussi ce
 * qui fait marcher un Pokédex — il ne montre pas la photo de ce qu'on n'a pas
 * attrapé, il montre une OMBRE.
 *
 * UN RÉGLAGE EXPÉRIMENTAL remplace ces ombres par les gros plans
 * d'invader-spotter. J'avais d'abord écrit ici que c'était arithmétiquement
 * impossible, en extrapolant le poids des photos FlashInvaders : 216 Ko pièce,
 * donc 319 Mo pour Paris. MESURE FAITE : les gros plans d'invader-spotter pèsent
 * 20 Ko — ce sont des recadrages serrés, pas des photos pleines. Une grille de
 * Paris tient en 31 Mo, un écran en 600 Ko, et rien ne bloque le lien externe.
 * Je m'étais trompé d'un facteur dix et j'en tirais une impossibilité.
 *
 * Reste la question des droits, elle : InvaderPhoto.js porte le renoncement
 * d'origine, « reproduction de l'œuvre d'Invader ». D'où un réglage éteint par
 * défaut, activé sciemment, et pour l'instant destiné à la seule preview.
 *
 * Même avec les photos, une case NON acquise reste une silhouette : l'image est
 * assombrie à 38 %. Sans ça, trouvé et pas-trouvé se ressembleraient et la grille
 * perdrait son moteur.
 *
 * Cinq états :
 *   photo  — flashé, et le cliché personnel de l'utilisateur est disponible
 *            (uID renseigné ET vignettes activées dans les Réglages)
 *   done   — flashé : l'alien en violet
 *   todo   — pas encore trouvé : la silhouette. Le moteur du jeu.
 *   gone   — détruit et jamais flashé : hachuré. Une catégorie que Pokémon n'a
 *            pas, et qui appartient en propre à ce sujet : on ne l'aura jamais.
 */

const COLONNES = 5;
const MARGE = 14;
const ECART = 8;
const TAILLE = Math.floor(
  (Dimensions.get('window').width - MARGE * 2 - ECART * (COLONNES - 1)) / COLONNES,
);
const HAUTEUR_RANGEE = TAILLE + ECART;

const ALIEN = {
  ok: require('../assets/markers/alien_ok.png'),
  damaged: require('../assets/markers/alien_damaged.png'),
  destroyed: require('../assets/markers/alien_destroyed.png'),
  hidden: require('../assets/markers/alien_unknown.png'),
  unknown: require('../assets/markers/alien_unknown.png'),
};

// « PA_1247 » → « 1247 ». Le préfixe est déjà donné par l'en-tête de ville, le
// répéter mille fois volerait la place du seul chiffre qui distingue les cases.
function numero(id) {
  const i = id.lastIndexOf('_');
  return i > 0 ? id.slice(i + 1) : id;
}

const Case = memo(function Case({ inv, etat, photoUrl, spotterUrl, taille, theme, onPress, t }) {
  const st = getStyles(theme);
  // Deux sources possibles, deux poids très différents : la photo personnelle
  // pèse 216 Ko, le gros plan d'invader-spotter 20 Ko. La file règle sa cadence
  // là-dessus, sinon les vignettes légères attendraient dix fois trop.
  const perso = etat === 'photo' ? photoUrl : null;
  const url = perso || (etat !== 'gone' ? spotterUrl : null);
  const { src, fini } = usePhotoCreneau(
    url, PRIORITE_LISTE, perso ? POIDS_FLASHINVADERS : POIDS_SPOTTER,
  );
  const dim = { width: taille, height: taille };

  const teinte = etat === 'done' ? theme.flashed
    : etat === 'gone' ? theme.statusDestroyed
      : theme.textSecondary;

  return (
    <TouchableOpacity
      style={[st.case, dim, st[`case_${etat}`]]}
      onPress={() => onPress(inv)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${inv.id}, ${t(`collection.state.${etat}`)}`}
    >
      {src ? (
        <Image
          source={{ uri: src }}
          style={[StyleSheet.absoluteFill, { borderRadius: 10 }, etat !== 'photo' && etat !== 'done' && st.imgTodo]}
          contentFit="cover"
          transition={120}
          cachePolicy="disk"
          onLoadEnd={fini}
          onError={fini}
        />
      ) : (
        <Image
          source={ALIEN[statusKey(inv.status)] ?? ALIEN.unknown}
          style={st.px}
          contentFit="contain"
          tintColor={teinte}
          transition={0}
        />
      )}
      <Text style={[st.num, src && st.numSurPhoto]} numberOfLines={1}>
        {numero(inv.id)}
      </Text>
      {etat === 'gone' ? <View style={st.barre} pointerEvents="none" /> : null}
    </TouchableOpacity>
  );
});

export default function CollectionScreen({ navigation }) {
  const { invaders, flashed, currentCityCode, fiPhotos, photosListe, photosSpotter } = useAppContext();
  const { theme } = useTheme();
  const { t } = useTranslation();
  const st = getStyles(theme);
  const insets = useSafeAreaInsets();
  const [masquerImpossibles, setMasquerImpossibles] = useState(false);

  const ville = CITIES[currentCityCode]?.name ?? currentCityCode;

  // Un « impossible » est un Invader détruit que l'utilisateur n'a jamais flashé :
  // il ne pourra jamais l'obtenir. Le masquer n'est pas de la triche, c'est la
  // seule façon d'avoir un pourcentage qui veuille dire quelque chose — sinon la
  // barre plafonne à un maximum inatteignable, et l'écran punit sans raison.
  const { cases, faits, total, impossibles } = useMemo(() => {
    const tous = invaders ?? [];
    let nImpossibles = 0;
    const gardees = [];
    for (const inv of tous) {
      const estFlashe = flashed.has(inv.id);
      const detruit = statusKey(inv.status) === 'destroyed';
      const impossible = detruit && !estFlashe;
      if (impossible) nImpossibles += 1;
      if (impossible && masquerImpossibles) continue;
      gardees.push(inv);
    }
    const n = gardees.reduce((s, inv) => s + (flashed.has(inv.id) ? 1 : 0), 0);
    return { cases: gardees, faits: n, total: gardees.length, impossibles: nImpossibles };
  }, [invaders, flashed, masquerImpossibles]);

  const pct = total > 0 ? (faits / total) * 100 : 0;

  const etatDe = useCallback((inv) => {
    const estFlashe = flashed.has(inv.id);
    if (estFlashe) {
      if (photosListe && fiPhotos?.[inv.id]) return 'photo';
      return 'done';
    }
    return statusKey(inv.status) === 'destroyed' ? 'gone' : 'todo';
  }, [flashed, photosListe, fiPhotos]);

  const ouvrir = useCallback((inv) => {
    track('collection_open_invader', { state: etatDe(inv) });
    navigation.navigate('Tabs', {
      screen: 'Carte',
      params: { focusId: inv.id, _ts: Date.now() },
    });
  }, [navigation, etatDe]);

  const renderItem = useCallback(({ item }) => (
    <Case
      inv={item}
      etat={etatDe(item)}
      photoUrl={fiPhotos?.[item.id] || null}
      spotterUrl={photosSpotter ? (item.photoUrl || null) : null}
      taille={TAILLE}
      theme={theme}
      onPress={ouvrir}
      t={t}
    />
  ), [etatDe, fiPhotos, photosSpotter, theme, ouvrir, t]);

  const getItemLayout = useCallback((_, index) => ({
    length: HAUTEUR_RANGEE, offset: HAUTEUR_RANGEE * Math.floor(index / COLONNES), index,
  }), []);

  return (
    <View style={[st.page, { paddingTop: insets.top }]}>
      <View style={st.header}>
        <TouchableOpacity
          onPress={() => navigation.dispatch(DrawerActions.openDrawer())}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Ionicons name="menu" size={24} color={theme.textPrimary} />
        </TouchableOpacity>
        <Text style={st.titre} numberOfLines={1}>{t('collection.title')}</Text>
      </View>

      {/* En-tête de ville : le compte, le pourcentage, la barre. */}
      <TouchableOpacity
        style={st.villeBloc}
        onPress={() => navigation.navigate('Palmarès')}
        activeOpacity={0.75}
      >
        <View style={st.villeLigne}>
          <Ionicons name="business-outline" size={16} color={theme.accent} />
          <Text style={st.villeNom} numberOfLines={1}>{ville}</Text>
          <View style={st.pastille}>
            <Text style={st.pastilleTexte}>{faits} / {total}</Text>
          </View>
          <Ionicons name="chevron-forward" size={15} color={theme.textSecondary} />
        </View>
        <View style={st.barreFond}>
          <View style={[st.barrePleine, { width: `${Math.min(100, pct)}%` }]} />
        </View>
        <Text style={st.pct}>{pct.toFixed(1)} %{' '}
          <Text style={st.pctNote}>{t('collection.completed')}</Text>
        </Text>
      </TouchableOpacity>

      {/* Le filtre. Le libellé dit ce qu'il fait ET ce qu'il change au calcul. */}
      {impossibles > 0 ? (
        <View style={st.filtre}>
          <View style={{ flex: 1 }}>
            <Text style={st.filtreLabel}>{t('collection.hideImpossible')}</Text>
            <Text style={st.filtreAide}>
              {t('collection.hideImpossibleHint', { count: impossibles })}
            </Text>
          </View>
          <Switch
            value={masquerImpossibles}
            onValueChange={(v) => { setMasquerImpossibles(v); track('collection_filter', { on: v }); }}
            trackColor={{ false: theme.border, true: theme.accent }}
            thumbColor={theme.bg}
            ios_backgroundColor={theme.border}
          />
        </View>
      ) : null}

      <FlatList
        data={cases}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        numColumns={COLONNES}
        getItemLayout={getItemLayout}
        extraData={[flashed, theme, photosListe, photosSpotter, fiPhotos]}
        columnWrapperStyle={{ gap: ECART }}
        contentContainerStyle={{ paddingHorizontal: MARGE, paddingBottom: insets.bottom + 24, gap: ECART }}
        initialNumToRender={40}
        maxToRenderPerBatch={40}
        windowSize={7}
        removeClippedSubviews
      />
    </View>
  );
}

function getStyles(t) {
  return StyleSheet.create({
    page: { flex: 1, backgroundColor: t.bg },
    header: {
      flexDirection: 'row', alignItems: 'center', gap: 14,
      paddingHorizontal: 18, paddingTop: 14, paddingBottom: 10,
    },
    titre: { ...typography.arcadeTitle, color: t.textPrimary, fontSize: 16, flex: 1 },

    villeBloc: {
      marginHorizontal: MARGE, marginBottom: 12, padding: 14,
      backgroundColor: t.surface, borderRadius: 14, borderWidth: 1, borderColor: t.border,
    },
    villeLigne: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    villeNom: { fontSize: 14, fontWeight: '700', color: t.textPrimary, flex: 1 },
    pastille: {
      backgroundColor: t.accent, borderRadius: 999, paddingHorizontal: 11, paddingVertical: 3,
    },
    pastilleTexte: { fontSize: 12.5, fontWeight: '700', color: t.bg, fontVariant: ['tabular-nums'] },
    barreFond: {
      height: 5, borderRadius: 3, backgroundColor: t.surfaceHigh, overflow: 'hidden', marginTop: 12,
    },
    barrePleine: { height: '100%', backgroundColor: t.accent, borderRadius: 3 },
    pct: { fontSize: 12.5, color: t.accent, fontWeight: '700', marginTop: 8 },
    pctNote: { color: t.textSecondary, fontWeight: '400' },

    filtre: {
      flexDirection: 'row', alignItems: 'center', gap: 12,
      marginHorizontal: MARGE, marginBottom: 12, paddingHorizontal: 14, paddingVertical: 11,
      backgroundColor: t.surface, borderRadius: 12, borderWidth: 1, borderColor: t.border,
    },
    filtreLabel: { fontSize: 13.5, fontWeight: '600', color: t.textPrimary },
    filtreAide: { fontSize: 11.5, color: t.textSecondary, marginTop: 2, lineHeight: 16 },

    case: {
      borderRadius: 10, alignItems: 'center', justifyContent: 'center',
      backgroundColor: t.surfaceHigh, borderWidth: 1, borderColor: t.border,
      overflow: 'hidden',
    },
    case_photo: { borderColor: t.flashed },
    case_done: { borderColor: t.flashed, backgroundColor: t.flashedDim },
    case_todo: {},
    // Une photo sur une case NON acquise reste une silhouette : assombrie et
    // désaturée. Sans ça, trouvé et pas-trouvé se ressembleraient, et la grille
    // perdrait la seule chose qui fait marcher un Pokédex.
    imgTodo: { opacity: 0.38 },
    case_gone: { opacity: 0.55, borderStyle: 'dashed' },

    px: { width: '52%', height: '38%', opacity: 0.9 },
    num: {
      position: 'absolute', bottom: 3, fontSize: 9, color: t.textSecondary,
      fontVariant: ['tabular-nums'],
    },
    numSurPhoto: {
      color: '#FFF', backgroundColor: 'rgba(0,0,0,0.55)',
      paddingHorizontal: 4, borderRadius: 4, overflow: 'hidden',
    },
    barre: {
      position: 'absolute', left: -4, right: -4, top: '48%', height: 1.5,
      backgroundColor: t.statusDestroyed, opacity: 0.6, transform: [{ rotate: '-24deg' }],
    },
  });
}
