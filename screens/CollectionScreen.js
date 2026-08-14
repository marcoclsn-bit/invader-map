import { useState, useMemo, useCallback, useEffect, useRef, memo } from 'react';
import {
  View, Text, FlatList, TouchableOpacity, StyleSheet, Switch, Dimensions,
  Modal, TextInput, Animated, Easing,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { DrawerActions, useFocusEffect } from '@react-navigation/native';
import { useAppContext } from '../context/AppContext';
import { useTheme } from '../theme/ThemeContext';
import { typography } from '../theme/tokens';
import { statusKey } from '../constants';
import { CITIES } from '../cities/registry';
import { usePhotoCreneau, PRIORITE_LISTE, POIDS_FLASHINVADERS, POIDS_SPOTTER } from '../services/photoQueue';
import { track } from '../services/analytics';
import { dispositionRangee } from '../utils/gridLayout';

/**
 * Collection — la vue « Pokédex ».
 *
 * PAR DÉFAUT, la grille est faite de nos cinq aliens pixel : 1,2 Ko pièce, déjà
 * dans le binaire, affichés hors ligne, et ils nous appartiennent. C'est aussi ce
 * qui fait marcher un Pokédex — il ne montre pas la photo de ce qu'on n'a pas
 * attrapé, il montre une OMBRE.
 *
 * UN RÉGLAGE EXPÉRIMENTAL montre la vraie mosaïque — SUR LES CASES ACQUISES
 * SEULEMENT. J'avais d'abord écrit ici que des photos dans une grille étaient
 * arithmétiquement impossibles, en extrapolant le poids des photos FlashInvaders :
 * 216 Ko pièce, donc 319 Mo pour Paris. MESURE FAITE : les gros plans
 * d'invader-spotter pèsent 20 Ko — des recadrages serrés, pas des photos pleines.
 * Je m'étais trompé d'un facteur dix.
 *
 * Première version : photo partout, assombrie à 38 % sur les cases non acquises.
 * Ça ne cachait rien du tout — la mosaïque restait parfaitement identifiable, et
 * la grille livrait d'avance ce qu'elle est censée faire chercher. Une case non
 * acquise est donc redevenue une ombre, sans exception.
 *
 * Le gain est double. Ludique : la surprise revient. Et technique : sur une
 * collection parisienne à 329 flashs sur 1 597, on passe de 1 597 photos
 * téléchargées à 329, soit 31 Mo → 6,6 Mo. Un nouvel utilisateur, qui n'a rien
 * flashé, ne télécharge RIEN — c'est exactement l'inverse du profil de charge
 * qu'on redoutait pour invader-spotter.
 *
 * Reste la question des droits : InvaderPhoto.js porte le renoncement d'origine,
 * « reproduction de l'œuvre d'Invader ». D'où un réglage allumé sur le seul canal
 * preview, éteint partout ailleurs.
 *
 * Cinq états :
 *   photo  — flashé, et le cliché personnel de l'utilisateur est disponible
 *            (uID renseigné ET vignettes activées dans les Réglages)
 *   done   — flashé : l'alien en violet
 *   todo   — pas encore trouvé : la silhouette. Le moteur du jeu.
 *   gone   — détruit et jamais flashé : hachuré. Une catégorie que Pokémon n'a
 *            pas, et qui appartient en propre à ce sujet : on ne l'aura jamais.
 */

// Révélation. On retient les identifiants DÉJÀ montrés dans la Collection ; à
// l'ouverture, ceux qui sont flashés sans avoir été montrés se retournent, l'un
// après l'autre. C'est la récompense d'être sorti marcher.
const CLE_VUS = '@invader_collection_vus';
const MAX_REVELATIONS = 24;   // au-delà, ce n'est plus une fête mais une attente
const PAS_MS = 130;           // décalage entre deux cartes
const DUREE_MS = 520;

const COLONNES = 5;
const MARGE = 14;
const ECART = 8;
const TAILLE = Math.floor(
  (Dimensions.get('window').width - MARGE * 2 - ECART * (COLONNES - 1)) / COLONNES,
);

const ALIEN = {
  ok: require('../assets/markers/alien_ok.png'),
  damaged: require('../assets/markers/alien_damaged.png'),
  destroyed: require('../assets/markers/alien_destroyed.png'),
  hidden: require('../assets/markers/alien_unknown.png'),
  unknown: require('../assets/markers/alien_unknown.png'),
};

// L'identifiant s'affiche ENTIER, préfixe compris. J'avais coupé « PA_1247 » en
// « 1247 » pour gagner de la place, en me disant que l'en-tête de ville suffisait.
// C'est le nom sous lequel les chasseurs connaissent une mosaïque : le tronquer
// oblige à recomposer mentalement ce qu'on venait lire. Onze caractères au pire
// (un seul cas dans toute la base), sept en pratique : la police se réduit
// d'elle-même plutôt que de tronquer.

const Case = memo(function Case({ inv, etat, photoUrl, spotterUrl, taille, theme, onPress, t, ordre }) {
  const st = getStyles(theme);
  // `ordre` vaut null pour l'immense majorité des cases : rien n'est animé, et
  // aucun coût n'est payé. Seules les prises jamais montrées se retournent.
  const flip = useRef(new Animated.Value(ordre == null ? 1 : 0)).current;
  const [retourne, setRetourne] = useState(ordre == null);

  useEffect(() => {
    // Remise à plat AVANT toute chose. Les révélations arrivent après la lecture
    // du disque, donc la case a déjà été rendue une fois avec `ordre` à null :
    // sa valeur animée valait 1 et sa face était déjà retournée. Sans cette
    // réinitialisation, l'animation jouait de 1 vers 1 — invisible.
    if (ordre == null) { flip.setValue(1); setRetourne(true); return undefined; }
    flip.setValue(0);
    setRetourne(false);

    const anim = Animated.timing(flip, {
      toValue: 1,
      duration: DUREE_MS,
      delay: Math.min(ordre * PAS_MS, 2600),
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    // À mi-course la carte est de profil : c'est le seul instant où l'on peut
    // échanger les faces sans que ça se voie.
    const mi = setTimeout(() => setRetourne(true), Math.min(ordre * PAS_MS, 2600) + DUREE_MS / 2);
    anim.start();
    return () => { anim.stop(); clearTimeout(mi); };
  }, [ordre, flip]);

  const rotation = flip.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });
  // UNE PHOTO NE S'AFFICHE QUE SUR UNE CASE ACQUISE. Assombrir la photo d'un
  // Invader non trouvé ne cachait rien : à 38 %, la mosaïque restait parfaitement
  // identifiable et la grille livrait d'avance ce qu'elle devait faire chercher.
  // Une case non acquise est donc une ombre, un point.
  //
  // Le gain n'est pas que ludique : sur une collection parisienne à 329 flashs
  // sur 1 597, on passe de 1 597 photos à 329, soit 31 Mo → 6,6 Mo. Et un
  // nouvel utilisateur, qui n'a rien flashé, ne télécharge RIEN.
  //
  // Deux sources possibles, deux poids très différents : la photo personnelle
  // pèse 216 Ko, le gros plan d'invader-spotter 20 Ko. La file règle sa cadence
  // là-dessus, sinon les vignettes légères attendraient dix fois trop.
  const acquis = etat === 'photo' || etat === 'done';
  const perso = etat === 'photo' ? photoUrl : null;
  // Tant que la carte n'a pas basculé, elle montre encore sa face d'ombre : on ne
  // demande donc pas la photo, ce qui évite de la charger pour rien si l'écran
  // est quitté pendant l'attente.
  const url = acquis && retourne ? (perso || spotterUrl) : null;
  const { src, fini } = usePhotoCreneau(
    url, PRIORITE_LISTE, perso ? POIDS_FLASHINVADERS : POIDS_SPOTTER,
  );
  const dim = { width: taille, height: taille };

  const teinte = etat === 'done' ? theme.flashed
    : etat === 'gone' ? theme.statusDestroyed
      : theme.textSecondary;

  const contenu = (
    <>
      {src ? (
        <Image
          source={{ uri: src }}
          style={[StyleSheet.absoluteFill, { borderRadius: 10 }]}
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
      <Text
        style={[st.num, src && st.numSurPhoto]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
      >
        {inv.id}
      </Text>
      {etat === 'gone' ? <View style={st.barre} pointerEvents="none" /> : null}
    </>
  );

  const dedans = ordre == null ? contenu : (
    <Animated.View
      style={[
        StyleSheet.absoluteFill,
        { alignItems: 'center', justifyContent: 'center', transform: [{ perspective: 700 }, { rotateY: rotation }] },
      ]}
    >
      {retourne ? contenu : (
        <Image
          source={ALIEN[statusKey(inv.status)] ?? ALIEN.unknown}
          style={st.px}
          contentFit="contain"
          tintColor={theme.textSecondary}
          transition={0}
        />
      )}
    </Animated.View>
  );

  return (
    <TouchableOpacity
      style={[st.case, dim, st[`case_${etat}`]]}
      onPress={() => onPress(inv)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${inv.id}, ${t(`collection.state.${etat}`)}`}
    >
      {dedans}
    </TouchableOpacity>
  );
});

// Sélecteur de ville. Il vit ICI et non dans un écran séparé : le parcours
// d'avant obligeait à passer par Villes, puis la Carte, puis le menu, pour
// revenir à la Collection — cinq écrans pour changer un mot dans un en-tête.
function SelecteurVille({ visible, cityIndex, courante, onChoisir, onFermer, theme, t }) {
  const st = getStyles(theme);
  const [recherche, setRecherche] = useState('');
  const villes = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return [...cityIndex]
      .filter((c) => !q || c.name.toLowerCase().includes(q))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [cityIndex, recherche]);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onFermer}>
      <View style={st.modalFond}>
        <View style={st.modalCorps}>
          <View style={st.modalTete}>
            <Text style={st.modalTitre}>{t('list.picker.title')}</Text>
            <TouchableOpacity onPress={onFermer} hitSlop={12}>
              <Ionicons name="close" size={22} color={theme.textSecondary} />
            </TouchableOpacity>
          </View>
          <TextInput
            style={st.modalRecherche}
            value={recherche}
            onChangeText={setRecherche}
            placeholder={t('list.picker.searchPlaceholder')}
            placeholderTextColor={theme.textSecondary}
            autoCorrect={false}
          />
          <FlatList
            data={villes}
            keyExtractor={(c) => c.code}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const active = item.code === courante;
              return (
                <TouchableOpacity
                  style={st.modalLigne}
                  onPress={() => onChoisir(item.code)}
                  activeOpacity={0.7}
                >
                  <Text style={[st.modalVille, active && { color: theme.accent, fontWeight: '700' }]}>
                    {item.name}
                  </Text>
                  <Text style={st.modalCompte}>{item.count ?? ''}</Text>
                  {active ? <Ionicons name="checkmark" size={17} color={theme.accent} /> : null}
                </TouchableOpacity>
              );
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

export default function CollectionScreen({ navigation }) {
  const { invaders, flashed, currentCityCode, setCurrentCity, cityIndex,
    isChangingCity, fiPhotos, photosListe, photosSpotter } = useAppContext();
  const [selecteurOuvert, setSelecteurOuvert] = useState(false);
  // id → rang d'apparition. Calculé UNE fois à l'ouverture de l'écran : flasher
  // depuis la Collection ne doit pas déclencher une animation sous les doigts.
  const [revelations, setRevelations] = useState(null);
  const flashedRef = useRef(flashed);
  flashedRef.current = flashed;
  const { theme } = useTheme();
  const { t } = useTranslation();
  const st = getStyles(theme);
  const insets = useSafeAreaInsets();
  const [masquerImpossibles, setMasquerImpossibles] = useState(false);

  const ville = CITIES[currentCityCode]?.name ?? currentCityCode;

  // À CHAQUE PRISE DE FOCUS, et non au seul montage. Les écrans d'un tiroir de
  // navigation ne se démontent PAS quand on les quitte : un `useEffect` à
  // dépendances vides ne s'exécutait donc qu'une fois dans toute la vie de l'app.
  // On ouvrait la Collection, elle enregistrait tout comme vu, et plus jamais
  // rien ne se retournait — sans la moindre erreur pour le signaler.
  useFocusEffect(useCallback(() => {
    let vivant = true;
    (async () => {
      let vus = [];
      try {
        const brut = await AsyncStorage.getItem(CLE_VUS);
        vus = brut ? JSON.parse(brut) : [];
      } catch { vus = []; }
      if (!vivant) return;
      const dejaVus = new Set(Array.isArray(vus) ? vus : []);
      const tous = [...flashedRef.current];
      const nouveaux = tous.filter((id) => !dejaVus.has(id));

      // Premier lancement : tout est « nouveau », et retourner quatre cents
      // cartes serait une punition, pas une fête. On note tout comme vu sans
      // rien animer — la mise en scène commence à la prochaine sortie.
      const anime = dejaVus.size > 0 && nouveaux.length <= MAX_REVELATIONS;
      const carte = new Map();
      if (anime) nouveaux.forEach((id, i) => carte.set(id, i));
      if (vivant) setRevelations(carte);

      if (nouveaux.length) {
        try { await AsyncStorage.setItem(CLE_VUS, JSON.stringify(tous)); } catch { /* sans effet */ }
      }
      if (anime) track('collection_reveal', { count: nouveaux.length });
    })();
    return () => { vivant = false; };
  }, []));

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
      ordre={revelations?.has(item.id) ? revelations.get(item.id) : null}
      taille={TAILLE}
      theme={theme}
      onPress={ouvrir}
      t={t}
    />
  ), [etatDe, fiPhotos, photosSpotter, revelations, theme, ouvrir, t]);

  // `index` est ici un index de RANGÉE, pas d'élément : voir utils/gridLayout.js.
  const getItemLayout = useCallback((_, index) => dispositionRangee(index, TAILLE, ECART), []);

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
        onPress={() => setSelecteurOuvert(true)}
        activeOpacity={0.75}
        accessibilityRole="button"
        accessibilityLabel={t('list.picker.title')}
      >
        <View style={st.villeLigne}>
          <Ionicons name="business-outline" size={16} color={theme.accent} />
          <Text style={st.villeNom} numberOfLines={1}>{ville}</Text>
          <View style={st.pastille}>
            <Text style={st.pastilleTexte}>{faits} / {total}</Text>
          </View>
          <Ionicons name="chevron-down" size={15} color={theme.textSecondary} />
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

      <SelecteurVille
        visible={selecteurOuvert}
        cityIndex={cityIndex ?? []}
        courante={currentCityCode}
        onChoisir={(code) => { setSelecteurOuvert(false); setCurrentCity(code); }}
        onFermer={() => setSelecteurOuvert(false)}
        theme={theme}
        t={t}
      />

      <FlatList
        data={isChangingCity ? [] : cases}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        numColumns={COLONNES}
        getItemLayout={getItemLayout}
        extraData={[flashed, theme, photosListe, photosSpotter, fiPhotos, revelations]}
        columnWrapperStyle={{ gap: ECART, marginBottom: ECART }}
        contentContainerStyle={{ paddingHorizontal: MARGE, paddingBottom: insets.bottom + 24 }}
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
    case_gone: { opacity: 0.55, borderStyle: 'dashed' },

    px: { width: '52%', height: '38%', opacity: 0.55 },
    num: {
      position: 'absolute', bottom: 3, left: 2, right: 2, fontSize: 9,
      color: t.textSecondary, fontVariant: ['tabular-nums'], textAlign: 'center',
    },
    numSurPhoto: {
      color: '#FFF', backgroundColor: 'rgba(0,0,0,0.55)',
      paddingHorizontal: 4, borderRadius: 4, overflow: 'hidden',
    },
    modalFond: { flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' },
    modalCorps: {
      maxHeight: '75%', backgroundColor: t.surface,
      borderTopLeftRadius: 18, borderTopRightRadius: 18, paddingBottom: 28,
    },
    modalTete: {
      flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
      paddingHorizontal: 18, paddingTop: 16, paddingBottom: 10,
    },
    modalTitre: { ...typography.arcadeTitle, fontSize: 14, color: t.textPrimary },
    modalRecherche: {
      marginHorizontal: 18, marginBottom: 8, paddingHorizontal: 12, paddingVertical: 10,
      backgroundColor: t.surfaceHigh, borderRadius: 10, borderWidth: 1, borderColor: t.border,
      color: t.textPrimary, fontSize: 14,
    },
    modalLigne: {
      flexDirection: 'row', alignItems: 'center', gap: 10,
      paddingHorizontal: 18, paddingVertical: 13,
      borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: t.border,
    },
    modalVille: { flex: 1, fontSize: 15, color: t.textPrimary },
    modalCompte: { fontSize: 12, color: t.textSecondary, fontVariant: ['tabular-nums'] },

    barre: {
      position: 'absolute', left: -4, right: -4, top: '48%', height: 1.5,
      backgroundColor: t.statusDestroyed, opacity: 0.6, transform: [{ rotate: '-24deg' }],
    },
  });
}
