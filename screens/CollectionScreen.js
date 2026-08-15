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
import { usePhotoCreneau, PRIORITE_LISTE, PRIORITE_FICHE, POIDS_FLASHINVADERS, POIDS_SPOTTER } from '../services/photoQueue';
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
// l'ouverture, ceux qui sont flashés sans avoir été montrés sont présentés.
//
// PREMIÈRE VERSION, ABANDONNÉE : la case se retournait sur place, dans la grille.
// Ça ne pouvait pas marcher, et pas à cause d'un bug — par conception. Une prise
// se trouve à la rangée 200 aussi souvent qu'à la première : l'animation jouait
// hors écran, pour personne. Marco l'a formulé exactement ainsi.
//
// VERSION ACTUELLE : la carte est présentée EN GRAND, au centre, face cachée.
// Elle se retourne, on voit la prise, puis elle rejoint sa place dans la grille —
// que l'on a fait défiler d'avance pour qu'elle soit visible à l'atterrissage.
// La mise en scène ne dépend donc plus du tout de la position de défilement.
const CLE_VUS = '@invader_collection_vus';
const MAX_REVELATIONS = 12;   // au-delà, ce n'est plus une fête mais une attente
const MS_DEFILEMENT = 420;    // le temps que la rangée visée arrive au centre
const MS_RETOURNEMENT = 620;
const MS_CONTEMPLATION = 420; // on laisse le temps de regarder ce qu'on a pris
const MS_ATTERRISSAGE = 560;
const GRANDE_CARTE = Math.min(Math.round(Dimensions.get('window').width * 0.58), 250);

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

// `cache` : la case est flashée mais son tour de révélation n'est pas passé. Elle
// reste une ombre jusque-là, sinon la carte qui atterrit trouverait sa place déjà
// occupée par sa propre photo et la mise en scène perdrait son sens.
const Case = memo(function Case({ inv, etat, photoUrl, spotterUrl, taille, theme, onPress, t, cache }) {
  const st = getStyles(theme);
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
  const acquis = (etat === 'photo' || etat === 'done') && !cache;
  const perso = etat === 'photo' && !cache ? photoUrl : null;
  const url = acquis ? (perso || spotterUrl) : null;
  const { src, fini } = usePhotoCreneau(
    url, PRIORITE_LISTE, perso ? POIDS_FLASHINVADERS : POIDS_SPOTTER,
  );
  const dim = { width: taille, height: taille };

  const teinte = cache ? theme.textSecondary
    : etat === 'done' ? theme.flashed
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

  return (
    <TouchableOpacity
      style={[st.case, dim, st[cache ? 'case_todo' : `case_${etat}`]]}
      onPress={() => onPress(inv)}
      activeOpacity={0.7}
      accessibilityRole="button"
      accessibilityLabel={`${inv.id}, ${t(`collection.state.${etat}`)}`}
    >
      {contenu}
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

/**
 * La carte présentée en grand, puis reposée à sa place.
 *
 * Les coordonnées d'arrivée sont CALCULÉES, jamais mesurées : la colonne se
 * déduit de l'index, et la ligne est au centre vertical de la liste parce qu'on
 * a demandé `viewPosition: 0.5` au défilement. Mesurer une cellule virtualisée
 * qui vient d'apparaître aurait été une course perdue d'avance.
 */
function CarteRevelation({ inv, index, zone, etat, photoUrl, spotterUrl, theme, phase, t }) {
  const st = getStyles(theme);
  const flip = useRef(new Animated.Value(0)).current;
  const pose = useRef(new Animated.Value(0)).current;
  const [face, setFace] = useState('dos');

  const perso = etat === 'photo' ? photoUrl : null;
  const url = perso || spotterUrl;
  const { src, fini } = usePhotoCreneau(
    url, PRIORITE_FICHE, perso ? POIDS_FLASHINVADERS : POIDS_SPOTTER,
  );

  const { width: LARGEUR } = Dimensions.get('window');
  const centreX = LARGEUR / 2;
  const centreY = zone.y + zone.h / 2;
  const colonne = index % COLONNES;
  const cibleX = MARGE + colonne * (TAILLE + ECART) + TAILLE / 2;
  const cibleY = centreY;   // la rangée a été centrée par le défilement

  useEffect(() => {
    if (phase === 'retourne') {
      const a = Animated.timing(flip, {
        toValue: 1, duration: MS_RETOURNEMENT, easing: Easing.out(Easing.cubic), useNativeDriver: true,
      });
      const mi = setTimeout(() => setFace('face'), MS_RETOURNEMENT / 2);
      a.start();
      return () => { a.stop(); clearTimeout(mi); };
    }
    if (phase === 'pose') {
      const a = Animated.timing(pose, {
        toValue: 1, duration: MS_ATTERRISSAGE, easing: Easing.in(Easing.cubic), useNativeDriver: true,
      });
      a.start();
      return () => a.stop();
    }
    return undefined;
  }, [phase, flip, pose]);

  const rotation = flip.interpolate({ inputRange: [0, 1], outputRange: ['180deg', '360deg'] });
  const echelle = pose.interpolate({ inputRange: [0, 1], outputRange: [1, TAILLE / GRANDE_CARTE] });
  const dx = pose.interpolate({ inputRange: [0, 1], outputRange: [0, cibleX - centreX] });
  const dy = pose.interpolate({ inputRange: [0, 1], outputRange: [0, cibleY - centreY] });
  const opacite = pose.interpolate({ inputRange: [0, 0.82, 1], outputRange: [1, 1, 0] });

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        st.grandeCarte,
        {
          width: GRANDE_CARTE, height: GRANDE_CARTE,
          left: centreX - GRANDE_CARTE / 2, top: centreY - GRANDE_CARTE / 2,
          opacity: opacite,
          transform: [
            { translateX: dx }, { translateY: dy },
            { perspective: 900 }, { rotateY: rotation }, { scale: echelle },
          ],
        },
      ]}
    >
      {face === 'face' && src ? (
        <Image
          source={{ uri: src }}
          style={[StyleSheet.absoluteFill, { borderRadius: 20 }]}
          contentFit="cover" transition={0} cachePolicy="disk"
          onLoadEnd={fini} onError={fini}
        />
      ) : (
        <Image
          source={ALIEN[statusKey(inv.status)] ?? ALIEN.unknown}
          style={{ width: '46%', height: '34%' }}
          contentFit="contain"
          tintColor={face === 'face' ? theme.flashed : theme.textSecondary}
          transition={0}
        />
      )}
      <View style={st.grandeCarteBas}>
        <Text style={st.grandeCarteId} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
          {inv.id}
        </Text>
        <Text style={st.grandeCartePts}>{inv.points} {t('common.pts')}</Text>
      </View>
    </Animated.View>
  );
}

export default function CollectionScreen({ navigation }) {
  const { invaders, flashed, currentCityCode, setCurrentCity, cityIndex,
    isChangingCity, fiPhotos, photosListe, photosSpotter } = useAppContext();
  const [selecteurOuvert, setSelecteurOuvert] = useState(false);
  // id → rang d'apparition. Calculé UNE fois à l'ouverture de l'écran : flasher
  // depuis la Collection ne doit pas déclencher une animation sous les doigts.
  const flashedRef = useRef(flashed);
  flashedRef.current = flashed;
  // File des prises à présenter, et celle du moment.
  const [aReveler, setAReveler] = useState([]);       // ids en attente de présentation
  const [courante, setCourante] = useState(null);      // { inv, index, phase }
  const [zone, setZone] = useState({ y: 0, h: 0 });    // aire de la liste, mesurée
  const listeRef = useRef(null);
  const casesRef = useRef([]);
  const abandon = useRef(false);
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
      if (vivant) setAReveler(anime ? nouveaux : []);

      if (nouveaux.length) {
        try { await AsyncStorage.setItem(CLE_VUS, JSON.stringify(tous)); } catch { /* sans effet */ }
      }
      if (anime) track('collection_reveal', { count: nouveaux.length });
    })();
    return () => { vivant = false; abandon.current = true; setCourante(null); };
  }, []));

  // Déroulé d'une présentation. Une seule à la fois, en série : chacune attend
  // que la précédente ait rejoint sa place.
  // La dépendance est la TÊTE de file, pas `courante`. Poser `courante` aurait
  // sinon déclenché le nettoyage de cet effet — donc l'annulation des minuteurs
  // qui devaient enchaîner le retournement et l'atterrissage. La carte serait
  // apparue puis restée figée, voile compris, sans aucune erreur.
  const tete = aReveler.length ? aReveler[0] : null;
  useEffect(() => {
    if (!tete || !zone.h) return undefined;
    abandon.current = false;
    const id = tete;
    const index = casesRef.current.findIndex((c) => c.id === id);
    // La prise peut appartenir à une autre ville, ou être masquée par le filtre :
    // dans ce cas on la retire de la file sans rien montrer.
    if (index < 0) { setAReveler((f) => f.slice(1)); return undefined; }
    const inv = casesRef.current[index];

    const minuteurs = [];
    const plus_tard = (fn, ms) => minuteurs.push(setTimeout(fn, ms));

    // On amène la RANGÉE au centre. scrollToIndex compte en rangées, comme
    // getItemLayout — vérifié dans le source de React Native, pas supposé.
    try {
      listeRef.current?.scrollToIndex({
        index: Math.floor(index / COLONNES), viewPosition: 0.5, animated: true,
      });
    } catch { /* liste pas encore prête : on présente quand même */ }

    plus_tard(() => setCourante({ inv, index, phase: 'retourne' }), MS_DEFILEMENT);
    plus_tard(() => setCourante((c) => (c ? { ...c, phase: 'pose' } : c)),
      MS_DEFILEMENT + MS_RETOURNEMENT + MS_CONTEMPLATION);
    plus_tard(() => {
      if (abandon.current) return;
      setCourante(null);
      setAReveler((f) => f.slice(1));
    }, MS_DEFILEMENT + MS_RETOURNEMENT + MS_CONTEMPLATION + MS_ATTERRISSAGE);

    return () => minuteurs.forEach(clearTimeout);
  }, [tete, zone.h]);

  // Tout écarter d'un geste : on ne retient personne devant une animation.
  const passerLaSuite = useCallback(() => {
    abandon.current = true;
    setCourante(null);
    setAReveler([]);
  }, []);

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

  casesRef.current = cases;
  // Une prise encore en file, ou en cours de présentation, reste une ombre dans
  // la grille : sa place doit être vide quand la grande carte vient s'y poser.
  const masquees = useMemo(() => {
    const s = new Set(aReveler);
    if (courante) s.add(courante.inv.id);
    return s;
  }, [aReveler, courante]);

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
      cache={masquees.has(item.id)}
      taille={TAILLE}
      theme={theme}
      onPress={ouvrir}
      t={t}
    />
  ), [etatDe, fiPhotos, photosSpotter, masquees, theme, ouvrir, t]);

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

      <View style={{ flex: 1 }} onLayout={(e) => {
        const { y, height } = e.nativeEvent.layout;
        setZone((z) => (z.y === y && z.h === height ? z : { y, h: height }));
      }}>
      <FlatList
        ref={listeRef}
        data={isChangingCity ? [] : cases}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        numColumns={COLONNES}
        getItemLayout={getItemLayout}
        extraData={[flashed, theme, photosListe, photosSpotter, fiPhotos, masquees]}
        columnWrapperStyle={{ gap: ECART, marginBottom: ECART }}
        contentContainerStyle={{ paddingHorizontal: MARGE, paddingBottom: insets.bottom + 24 }}
        initialNumToRender={40}
        maxToRenderPerBatch={40}
        windowSize={7}
        removeClippedSubviews
        onScrollToIndexFailed={({ index, averageItemLength }) => {
          // Peut arriver si la rangée visée n'a jamais été rendue. On y va au
          // décalage estimé, puis on retente : sans ce filet, la présentation
          // resterait bloquée sur une prise inatteignable.
          listeRef.current?.scrollToOffset({
            offset: index * (averageItemLength || TAILLE + ECART), animated: false,
          });
          setTimeout(() => {
            try { listeRef.current?.scrollToIndex({ index, viewPosition: 0.5, animated: false }); }
            catch { /* on renonce, la présentation continue */ }
          }, 60);
        }}
      />
      </View>

      {/* Voile + carte présentée. Un appui n'importe où écarte la mise en scène. */}
      {courante ? (
        <>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={passerLaSuite}
            accessibilityRole="button"
            accessibilityLabel={t('collection.skipReveal')}
          >
            <View style={[StyleSheet.absoluteFill, st.voile]} />
          </TouchableOpacity>
          <CarteRevelation
            inv={courante.inv}
            index={courante.index}
            zone={zone}
            phase={courante.phase}
            etat={etatDe(courante.inv)}
            photoUrl={fiPhotos?.[courante.inv.id] || null}
            spotterUrl={photosSpotter ? (courante.inv.photoUrl || null) : null}
            theme={theme}
            t={t}
          />
          <Text style={[st.passer, { top: zone.y + zone.h - 26 }]} pointerEvents="none">
            {t('collection.skipReveal')}
          </Text>
        </>
      ) : null}
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
    voile: { backgroundColor: 'rgba(0,0,0,0.72)' },
    grandeCarte: {
      position: 'absolute', borderRadius: 20, overflow: 'hidden',
      backgroundColor: t.surfaceHigh, borderWidth: 2, borderColor: t.flashed,
      alignItems: 'center', justifyContent: 'center',
      shadowColor: t.flashed, shadowOpacity: 0.5, shadowRadius: 26,
      shadowOffset: { width: 0, height: 8 }, elevation: 16,
    },
    grandeCarteBas: {
      position: 'absolute', left: 0, right: 0, bottom: 0,
      backgroundColor: 'rgba(0,0,0,0.55)', paddingVertical: 8, paddingHorizontal: 10,
      alignItems: 'center', gap: 2,
    },
    grandeCarteId: { ...typography.arcadeTitle, fontSize: 15, color: '#FFF' },
    grandeCartePts: { fontSize: 11.5, color: t.accent, fontWeight: '700' },
    passer: {
      position: 'absolute', left: 0, right: 0, textAlign: 'center',
      fontSize: 11.5, color: 'rgba(255,255,255,0.55)',
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
