import { createContext, useContext, useState, useEffect, useRef, useMemo, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

import * as Location from 'expo-location';
import { INVADERS as EMBEDDED_PA, INVADERS_VERSION, INVADERS_UPDATED_AT } from '../data/invaders';
import { ALL_STATUSES, STATUS_COLOR, DEFAULT_LABEL_DEFS } from '../constants';
import { initInvaderService, loadCityData, onCityUpdate, checkCityForUpdate, getCityIndex, getCityData } from '../services/invaderData';
import { getCachedNews, fetchNews } from '../services/newsData';
import { enableNewsNotify, disableNewsNotify, syncNewsNotify } from '../services/newsNotify';
import i18n, { applyLanguage, LANGUAGE_STORAGE_KEY } from '../i18n';
import { ENABLED_CITIES, DEFAULT_CITY_CODE, CITIES } from '../cities/registry';
import { ALL_POI_FAMILIES } from '../data/poiFamilies';
import { initPoiService, checkPoiUpdate, getPoiVersion, setPoiLanguage } from '../services/poiData';
import { track } from '../services/analytics';

const AppContext = createContext(null);

// Réglages « Mode balade » (UI posée maintenant ; moteur de proximité branché au dev build).
// Persistés tels quels — le futur moteur lira cet objet sans refactor.
const DEFAULT_STROLL = {
  enabled:       false,  // toggle principal — éteint par défaut
  radius:        50,     // rayon d'alerte en mètres (50 / 100 / 150)
  vibration:     true,   // alerter par vibration
  notification:  true,   // alerter par notification
  son:           true,   // jouer le son d'alerte (lequel : SON_ALERTE, côté moteur)
  // Statuts qui déclenchent une alerte. Défaut « à faire » : ok / endommagé / inconnu.
  // Les flashés sont TOUJOURS exclus ; les détruits ne sont jamais proposés (non flashables).
  alertStatuses: ['ok', 'damaged', 'unknown'],
};

// Statuts proposables dans le sélecteur du Mode balade (jamais 'destroyed', jamais 'hidden')
export const STROLL_STATUS_OPTIONS = ['ok', 'damaged', 'unknown'];

// Lieux d'intérêt — préférence UNIQUE partagée par la Carte, le Trajet et la Chasse :
// on choisit une fois, les trois écrans obéissent.
// `families` est un Set en mémoire, sérialisé en tableau au stockage (même motif
// que `filters`). Défaut : couche éteinte, pour ne rien changer à l'expérience
// existante tant que l'utilisateur n'a pas répondu à l'invitation sur la carte.
// Rôle de chaque champ, pour qu'ils ne se marchent pas dessus :
//   enabled   → affichage de la couche sur la CARTE seulement.
//   objective → quantité de lieux proposés dans le TRAJET et la CHASSE
//               (pure = aucun). Indépendant de `enabled`.
//   families  → filtre commun aux TROIS écrans.
const DEFAULT_POI_PREFS = {
  // Allumée d'emblée : les lieux sont devenus la promesse de l'app, et quelqu'un
  // qui l'installe après avoir vu cette promesse ouvrait une carte qui n'en
  // montrait aucun. N'affecte QUE les nouvelles installations — au chargement,
  // `enabled: p.enabled === true` fait primer la valeur déjà mémorisée.
  enabled:   true,
  families:  ALL_POI_FAMILIES,          // tableau ici ; converti en Set dans le state
  objective: 'balanced',                // pure | balanced | visit
};

// Pas de plafond : quand la couche est active, on affiche tous les lieux des
// familles cochées présents dans la zone visible. À Paris, au zoom « ville
// entière », cela peut faire 689 marqueurs qui s'ajoutent aux 1 528 Invaders.
// C'est volontaire, pour mesurer le comportement réel plutôt que de le supposer.

// État de la carte au tout premier lancement : tous les statuts SAUF les
// détruits, et les Invaders flashés RESTENT visibles.
//
// Auparavant on masquait les flashés. Le retour du terrain a été net : voir
// disparaître ce qu'on vient d'accomplir agit comme une punition. La carte se
// vidait à mesure qu'on progressait, alors que c'est précisément la progression
// qu'on a envie de contempler. Le filtre « Reste à faire » existe toujours pour
// qui le veut, il n'est simplement plus imposé.
function makeDefaultFilters() {
  return {
    statuses: new Set(ALL_STATUSES.filter((s) => s !== 'destroyed')),
    flashedState: 'all',
  };
}

export function useAppContext() {
  return useContext(AppContext);
}

// Ville activée la plus proche d'une coordonnée GPS
function _nearestCity(lat, lng) {
  return ENABLED_CITIES.reduce((best, c) => {
    const dlat = lat - c.center.lat;
    const dlng = (lng - c.center.lng) * Math.cos(lat * Math.PI / 180);
    const d2 = dlat * dlat + dlng * dlng;
    return d2 < best.d2 ? { city: c, d2 } : best;
  }, { city: ENABLED_CITIES[0], d2: Infinity }).city;
}


export function AppProvider({ children }) {
  // ─── Ville courante ───────────────────────────────────────────────────────────
  const [currentCityCode, setCurrentCityCode] = useState(DEFAULT_CITY_CODE);
  const currentCityCodeRef   = useRef(DEFAULT_CITY_CODE);
  const changingCityTimer    = useRef(null);
  const cityChangeLock       = useRef(false); // empêche deux changements simultanés

  // Index des villes (liste légère depuis index.json, initialisée depuis le registre)
  const [cityIndex, setCityIndex] = useState(
    ENABLED_CITIES.map(c => ({
      code:    c.code,
      name:    c.name,
      count:   c.code === 'PA' ? EMBEDDED_PA.length : null,
      version: c.code === 'PA' ? INVADERS_VERSION : null,
      center:  c.center,
      bbox:    c.bbox,
    }))
  );

  // ─── Données Invaders (ville courante) ────────────────────────────────────────
  const [invaders,        setInvaders]        = useState(EMBEDDED_PA);
  const [cityVersion,     setCityVersion]     = useState(INVADERS_VERSION);
  const [cityUpdatedAt,   setCityUpdatedAt]   = useState(INVADERS_UPDATED_AT);
  const [isChangingCity,  setIsChangingCity]  = useState(false);
  // Ville cible pendant la transition (affichée dans l'overlay avant le commit)
  const [pendingCityCode, setPendingCityCode] = useState(null);

  const [flashed,      setFlashed]      = useState(new Set());
  // Map<id, isoString> — absente = null (Invader flashé avant cette version)
  const [flashedDates, setFlashedDates] = useState(new Map());
  // Notes personnelles, id → texte. Ce que l'app ne saura jamais deviner : avec
  // qui on y était, ce qu'on a galéré à trouver, pourquoi celui-là compte.
  // Objet simple plutôt qu'une Map : il se sérialise tel quel, et il restera
  // petit — on n'écrit pas une note sur mille mosaïques.
  const [notes, setNotes] = useState({});
  // Invaders RETIRÉS À LA MAIN. Sans cette mémoire, la synchronisation suivante
  // les remet : ils sont toujours dans la galerie FlashInvaders, donc absents
  // d'ici, donc « manquants ». Décocher serait sans effet durable, ce qui est la
  // pire réponse possible à un geste délibéré.
  const [retires, setRetires] = useState(new Set());
  // Registre persistant de progression par ville — alimenté par la ville ACTIVE
  // (points exacts, complétion « juste »). Sert aux trophées (points cumulés,
  // villes terminées) sans devoir charger les données de toutes les villes.
  // { [code]: { flashedCount, flashedPts, denominator, posed, completed } }
  const [cityProgress, setCityProgress] = useState({});
  const [labels, setLabels] = useState({});
  const [labelDefs, setLabelDefs] = useState([...DEFAULT_LABEL_DEFS]);
  const [statusColors, setStatusColorsState] = useState({ ...STATUS_COLOR });
  const [colorOverrides, setColorOverrides] = useState({});
  // Défaut « à faire » (1er lancement) : on masque les détruits et les flashés.
  // Les autres statuts non flashés (ok / endommagé / inconnu) restent visibles.
  const [filters, setFilters] = useState(makeDefaultFilters);
  const [mapsApp, setMapsApp] = useState(null);

  // ── News ──────────────────────────────────────────────────────────────────
  const [news, setNews]               = useState({ version: 0, events: [] });
  const [newsCities, setNewsCities]   = useState(null);  // Set<code> ; null = pas encore choisi
  const [newsLastSeen, setNewsLastSeen] = useState(null); // ISO de la dernière ouverture de News
  const [newsNotify, setNewsNotifyState] = useState(true); // notifs d'actualité (défaut ON)

  // ── Mode explorateur ────────────────────────────────────────────────────────
  // L'app cesse de montrer OÙ sont les Invaders non flashés. Elle continue de
  // dire lesquels et combien ils valent : la promesse n'est pas « tu ne sais
  // rien », c'est « l'app ne pose jamais d'épingle dessus ». Le tracé d'une
  // chasse désigne une rue, jamais un mur, trouver une mosaïque de quarante
  // centimètres sur cent mètres de façades reste entièrement le travail du
  // chasseur.
  // Défaut OFF : c'est une contrainte qu'on choisit, jamais qu'on subit.
  const [explorer, setExplorerState] = useState(false);
  // Suggestions de proximité dans le volet de saisie. ACTIVÉES par défaut : sans
  // distance affichée, une pastille dit « il y en a un dans le coin » et non « il
  // est à 30 m par là ». Reste un interrupteur pour qui veut la saisie strictement
  // aveugle.
  const [explorerSuggest, setExplorerSuggestState] = useState(true);
  // Gestes de test (appui long) réservés au porteur du projet. Ils envoient de
  // VRAIES notifications et rejouent des panneaux : en production, un utilisateur
  // qui laisse le doigt sur une ligne les déclenche sans comprendre, et sans
  // moyen de faire le lien. `__DEV__` ne convient pas : les essais se font sur
  // une build de production, où il vaut faux.
  const [devMode, setDevModeState] = useState(false);
  // Présentation à une seule apparition, pour ceux qui ont DÉJÀ terminé
  // l'onboarding : `@invader_onboarding_done` vaut 1 chez eux, ils ne le
  // reverront jamais. Sans ce second chemin, le mode n'existerait que pour les
  // nouveaux installés, soit personne, aujourd'hui.
  // Drapeau distinct, sinon un nouvel installé se prendrait les deux.
  const [explorerIntroSeen, setExplorerIntroSeen] = useState(true);
  // Réaffichage DEMANDÉ depuis les Réglages. Distinct de `explorerIntroSeen` :
  // il autorise le panneau à s'afficher alors que le mode tourne déjà, ce que
  // la garde de <ExplorerIntro> interdit normalement.
  const [explorerIntroForced, setExplorerIntroForced] = useState(false);

  // Villes favorites. 84 villes dans le sélecteur : chercher « Paris » à chaque
  // sortie est une friction quotidienne pour un bénéfice nul.
  const [favCities, setFavCities] = useState(() => new Set());

  // ── Mode balade (réglages seulement ; moteur au dev build) ──────────────────
  const [stroll, setStroll] = useState(DEFAULT_STROLL);

  // ── Lieux d'intérêt (Carte + Trajet + Chasse) ───────────────────────────────
  const [poiPrefs, setPoiPrefs] = useState(() => ({
    ...DEFAULT_POI_PREFS,
    families: new Set(DEFAULT_POI_PREFS.families),
  }));
  // Invitation « nouveaux lieux » : proposée une seule fois sur la carte.
  const [poiIntroSeen, setPoiIntroSeen] = useState(false);
  // Incrémenté quand une version plus récente des lieux prend le relais : les
  // écrans lisent getPois() de façon synchrone, il leur faut ce signal.
  const [poiDataVersion, setPoiDataVersion] = useState(0);

  // Légende des couleurs : affichée sur la carte au 1er usage, puis masquée.
  const [legendSeen, setLegendSeen] = useState(false);
  const [language, setLanguageState] = useState('system');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // ─── Lieux d'intérêt : cache + mise à jour distante ──────────────────────────
  useEffect(() => {
    initPoiService(() => setPoiDataVersion((v) => v + 1)).catch(() => {});
  }, []);

  // Changement de langue : les résumés traduits sont téléchargés à la demande,
  // le français servant de repli tant qu'ils ne sont pas arrivés.
  useEffect(() => {
    if (!loaded) return;
    setPoiLanguage(i18n.language).catch(() => {});
  }, [language, loaded]);

  // ─── Initialisation du service de données ────────────────────────────────────
  useEffect(() => {
    // Charge l'index des villes (cache puis remote en arrière-plan)
    // Deux applications : le cache dès qu'il est lu, puis le réseau quand il
    // répond. La seconde est indispensable au premier lancement, où il n'y a
    // aucun cache et où le tableau rendu serait vide.
    initInvaderService((index) => { if (index.length > 0) setCityIndex(index); })
      .then(index => { if (index.length > 0) setCityIndex(index); });

    // Charge les données Paris (cache puis remote en arrière-plan)
    loadCityData('PA').then(data => {
      if (data && currentCityCodeRef.current === 'PA') {
        setInvaders(data.invaders);
        setCityVersion(data.version);
        setCityUpdatedAt(data.updatedAt);
      }
    });

    // Écoute les mises à jour distantes (toutes villes)
    const unsub = onCityUpdate(({ cityCode, invaders: data, version, updatedAt }) => {
      if (cityCode === currentCityCodeRef.current) {
        setInvaders(data);
        setCityVersion(version);
        setCityUpdatedAt(updatedAt);
        // NE PAS libérer le verrou ici : _fetchCity peut résoudre en <1s depuis le CDN,
        // ce qui déclencherait RAF + animateToRegion simultanément → crash MKMapView.
        // Le verrou est exclusivement géré par l'ANIM_GUARD dans setCurrentCity.
      }
      setCityIndex(prev => prev.map(c =>
        c.code === cityCode ? { ...c, count: data.length, version } : c
      ));
    });

    return unsub;
  }, []);

  // ─── Changement de ville ──────────────────────────────────────────────────────
  function _releaseCityLock() {
    cityChangeLock.current = false;
    setIsChangingCity(false);
    setPendingCityCode(null);
    if (changingCityTimer.current) {
      clearTimeout(changingCityTimer.current);
      changingCityTimer.current = null;
    }
  }

  function setCurrentCity(code) {
    if (code === currentCityCodeRef.current) return;
    if (cityChangeLock.current) return;
    cityChangeLock.current = true;
    // Placé APRÈS les deux gardes : sinon chaque tentative redondante ou bloquée
    // compterait comme un changement. C'est la mesure qui décidera d'étendre les
    // lieux d'intérêt hors de Paris.
    track('city_change', { city: code });
    currentCityCodeRef.current = code;
    AsyncStorage.setItem('@invader_current_city', code);

    // Phase 1 : overlay (nom de la ville cible), supprime les marqueurs de l'ancienne ville
    setIsChangingCity(true);
    setPendingCityCode(code);
    setInvaders([]);

    // Fallback de sécurité (10 s)
    if (changingCityTimer.current) clearTimeout(changingCityTimer.current);
    changingCityTimer.current = setTimeout(() => _releaseCityLock(), 10000);

    // Déclenche le chargement cache + fetch réseau en arrière-plan
    // onCityUpdate mettra à jour invaders si une version réseau plus fraîche arrive
    loadCityData(code).catch(() => {});

    // Phase 2 : 500 ms de drain (le RAF est terminé quand l'utilisateur peut switcher,
    // mais il reste des suppressions de marqueurs dans le pont → on laisse le temps de drainer)
    // puis commit atomique avec les données les plus fraîches disponibles
    setTimeout(() => {
      if (!cityChangeLock.current) return; // fallback de sécurité déjà déclenché
      if (currentCityCodeRef.current !== code) return;

      // getCityData() retourne toujours la version la plus récente en mémoire
      // (soit le cache, soit les données réseau si _fetchCity a déjà résolu)
      const latest = getCityData(code);
      setCurrentCityCode(code);        // city.center → useEffect va appeler animateToRegion
      setInvaders(latest?.invaders ?? []);
      if (latest) {
        setCityVersion(latest.version);
        setCityUpdatedAt(latest.updatedAt);
      }

      if (changingCityTimer.current) clearTimeout(changingCityTimer.current);
      changingCityTimer.current = setTimeout(() => {
        _releaseCityLock();
      }, 500);
    }, 500);
  }

  // ─── Vérification manuelle (Réglages) ────────────────────────────────────────
  async function checkDataUpdate() {
    return checkCityForUpdate(currentCityCodeRef.current);
  }

  // ─── Chargement au démarrage ──────────────────────────────────────────────────
  useEffect(() => {
    (async () => {
      const [
        flashedRaw, flashedDatesRaw, labelsRaw, labelDefsRaw, statusColorsRaw, colorOverridesRaw,
        mapsAppRaw, langRaw, onboardingRaw, currentCityRaw, filtersRaw,
      ] = await Promise.all([
        AsyncStorage.getItem('invader_flashed'),
        AsyncStorage.getItem('invader_flashed_dates'),
        AsyncStorage.getItem('invader_labels'),
        AsyncStorage.getItem('invader_label_defs'),
        AsyncStorage.getItem('invader_status_colors'),
        AsyncStorage.getItem('invader_color_overrides'),
        AsyncStorage.getItem('invader_maps_app'),
        AsyncStorage.getItem(LANGUAGE_STORAGE_KEY),
        AsyncStorage.getItem('@invader_onboarding_done'),
        AsyncStorage.getItem('@invader_current_city'),
        AsyncStorage.getItem('invader_filters'),
      ]);
      const [newsCitiesRaw, newsLastSeenRaw, strollRaw, legendSeenRaw, newsNotifyRaw, cityProgressRaw,
             poiPrefsRaw, poiIntroRaw] = await Promise.all([
        AsyncStorage.getItem('@invader_news_cities'),
        AsyncStorage.getItem('@invader_news_last_seen'),
        AsyncStorage.getItem('@invader_stroll'),
        AsyncStorage.getItem('@invader_legend_seen'),
        AsyncStorage.getItem('@invader_news_notify'),
        AsyncStorage.getItem('@invader_city_progress'),
        AsyncStorage.getItem('@invader_poi_prefs'),
        AsyncStorage.getItem('@invader_poi_intro_seen'),
      ]);
      const [explorerRaw, explorerIntroRaw, favCitiesRaw, explorerSuggestRaw, devRaw] = await Promise.all([
        AsyncStorage.getItem('@invader_explorer'),
        AsyncStorage.getItem('@invader_explorer_intro'),
        AsyncStorage.getItem('@invader_fav_cities'),
        AsyncStorage.getItem('@invader_explorer_suggest'),
        AsyncStorage.getItem('@invader_dev'),
      ]);
      const retiresRaw = await AsyncStorage.getItem('@invader_retires');
      if (retiresRaw) { try { setRetires(new Set(JSON.parse(retiresRaw))); } catch { /* illisible */ } }
      const notesRaw = await AsyncStorage.getItem('@invader_notes');
      if (notesRaw) { try { setNotes(JSON.parse(notesRaw) || {}); } catch { /* illisible */ } }
      // Ménage unique : ces trois clés servaient aux photos personnelles
      // FlashInvaders et aux deux réglages qui les gouvernaient. La
      // fonctionnalité est retirée ; laisser les URL collectées sur l'appareil
      // n'aurait plus aucune raison d'être.
      AsyncStorage.multiRemove([
        '@invader_fi_photos', '@invader_photos_liste', '@invader_photos_spotter',
      ]).catch(() => {});
      // Comparé à '0' et non à '1' : le défaut est ACTIF, seul un refus explicite
      // est enregistré. Tester l'inverse aurait éteint l'option chez tout le monde.
      if (explorerSuggestRaw === '0') setExplorerSuggestState(false);
      if (devRaw === '1') setDevModeState(true);
      if (favCitiesRaw) {
        try { setFavCities(new Set(JSON.parse(favCitiesRaw))); } catch {}
      }
      if (explorerRaw === '1') setExplorerState(true);
      // Ne s'affiche qu'aux anciens : un onboarding tout juste terminé porte
      // déjà le choix, et le marque vu au passage (completeOnboarding).
      if (onboardingRaw === '1' && explorerIntroRaw !== '1') setExplorerIntroSeen(false);
      if (cityProgressRaw) { try { setCityProgress(JSON.parse(cityProgressRaw)); } catch {} }
      if (legendSeenRaw === '1') setLegendSeen(true);
      // Notifs d'actualité : défaut ON (sauf si l'utilisateur a explicitement désactivé).
      const notifyOn = newsNotifyRaw !== '0';
      setNewsNotifyState(notifyOn);
      syncNewsNotify(notifyOn); // (ré)planifie la tâche de fond, sans prompt

      if (flashedRaw)       setFlashed(new Set(JSON.parse(flashedRaw)));
      // Migration douce : les IDs sans date gardent flashedAt: null (absents du Map)
      if (flashedDatesRaw)  setFlashedDates(new Map(Object.entries(JSON.parse(flashedDatesRaw))));
      // Étiquettes personnalisées retirées : on ne conserve que les défs système
      // (lbl_flashed), en réutilisant la couleur éventuellement personnalisée en stockage.
      if (labelDefsRaw) {
        const parsed = JSON.parse(labelDefsRaw);
        const systemDefs = DEFAULT_LABEL_DEFS.filter(d => d.system);
        setLabelDefs(systemDefs.map(s => {
          const stored = parsed.find(p => p.id === s.id);
          return stored ? { ...s, color: stored.color } : s;
        }));
      }
      if (statusColorsRaw)   setStatusColorsState(JSON.parse(statusColorsRaw));
      if (colorOverridesRaw) setColorOverrides(JSON.parse(colorOverridesRaw));
      if (mapsAppRaw)        setMapsApp(mapsAppRaw);
      // Filtres : on réapplique le dernier état mémorisé. Sinon (1er lancement),
      // on garde le défaut « à faire » défini à l'initialisation du state.
      if (filtersRaw) {
        try {
          const p = JSON.parse(filtersRaw);
          setFilters({
            statuses: new Set(Array.isArray(p.statuses) ? p.statuses : ALL_STATUSES),
            flashedState: p.flashedState ?? 'all',
          });
        } catch (_) {}
      }
      const storedLang = langRaw ?? 'system';
      setLanguageState(storedLang);
      applyLanguage(storedLang);
      if (!onboardingRaw) setShowOnboarding(true);

      // ── News : abonnement villes + dernière consultation, puis cache + fetch ──
      if (newsCitiesRaw) {
        try {
          const arr = JSON.parse(newsCitiesRaw);
          if (Array.isArray(arr)) setNewsCities(new Set(arr));
        } catch (_) {}
      }
      if (newsLastSeenRaw) setNewsLastSeen(newsLastSeenRaw);
      getCachedNews().then(setNews);                 // instantané (cache)
      fetchNews().then(setNews).catch(() => {});      // arrière-plan (réseau)

      // Mode balade : fusion avec les défauts (tolérant aux clés futures/manquantes)
      if (strollRaw) {
        try {
          const parsed = JSON.parse(strollRaw);
          if (parsed && typeof parsed === 'object') {
            const merged = { ...DEFAULT_STROLL, ...parsed };
            // Rayons hérités < 50 m (peu fiables) → ramenés à 50 m.
            if (!(merged.radius >= 50)) merged.radius = 50;
            setStroll(merged);
          }
        } catch (_) {}
      }

      // Lieux d'intérêt : fusion avec les défauts (tolérant aux familles ajoutées
      // plus tard par une mise à jour de données — elles arrivent alors cochées).
      if (poiIntroRaw === '1') setPoiIntroSeen(true);
      if (poiPrefsRaw) {
        try {
          const p = JSON.parse(poiPrefsRaw);
          if (p && typeof p === 'object') {
            const stored = Array.isArray(p.families) ? p.families : null;
            const known  = stored ? stored.filter(f => ALL_POI_FAMILIES.includes(f)) : null;
            setPoiPrefs({
              enabled:   p.enabled === true,
              families:  new Set(known?.length ? known : ALL_POI_FAMILIES),
              objective: ['pure', 'balanced', 'visit'].includes(p.objective) ? p.objective : 'balanced',
            });
          }
        } catch (_) {}
      }

      // Ville de démarrage : GPS > préférence stockée > défaut (PA)
      let cityToLoad = DEFAULT_CITY_CODE;
      try {
        const pos = await Location.getLastKnownPositionAsync({ maxAge: 3_600_000 });
        if (pos) {
          cityToLoad = _nearestCity(pos.coords.latitude, pos.coords.longitude).code;
        } else if (currentCityRaw && CITIES[currentCityRaw]) {
          cityToLoad = currentCityRaw;
        }
      } catch (_) {
        if (currentCityRaw && CITIES[currentCityRaw]) cityToLoad = currentCityRaw;
      }

      if (cityToLoad !== DEFAULT_CITY_CODE) {
        currentCityCodeRef.current = cityToLoad;
        setCurrentCityCode(cityToLoad);
        setInvaders([]);
        loadCityData(cityToLoad).then(data => {
          if (data && currentCityCodeRef.current === cityToLoad) {
            setInvaders(data.invaders);
            setCityVersion(data.version);
            setCityUpdatedAt(data.updatedAt);
          }
        });
      }

      setLoaded(true);
    })();
  }, []);

  // ─── Persistance automatique ──────────────────────────────────────────────────
  // flashed / flashedDates : gros objets (1500+ ids) → écriture DÉBOUNCÉE (400 ms)
  // pour ne pas resérialiser tout le Set à chaque flash pendant une chasse.
  const flashedSaveTimer = useRef(null);
  useEffect(() => {
    if (!loaded) return;
    clearTimeout(flashedSaveTimer.current);
    flashedSaveTimer.current = setTimeout(() => {
      AsyncStorage.setItem('invader_flashed', JSON.stringify([...flashed]));
      AsyncStorage.setItem('invader_flashed_dates', JSON.stringify(Object.fromEntries(flashedDates)));
    }, 400);
    return () => clearTimeout(flashedSaveTimer.current);
  }, [flashed, flashedDates, loaded]);

  // Registre de progression par ville (trophées) : recalculé pour la ville ACTIVE
  // avec la formule « juste » du Palmarès (un détruit jamais flashé ne compte pas ;
  // un détruit flashé reste acquis). Débouncé comme les flashs.
  const cityProgressTimer = useRef(null);
  useEffect(() => {
    if (!loaded || !currentCityCode || invaders.length === 0) return;
    clearTimeout(cityProgressTimer.current);
    cityProgressTimer.current = setTimeout(() => {
      let posed = 0, destroyed = 0, flashedCount = 0, flashedDestroyed = 0, flashedPts = 0;
      for (const inv of invaders) {
        posed++;
        const isDestroyed = inv.status === 'destroyed';
        if (isDestroyed) destroyed++;
        if (flashed.has(inv.id)) {
          flashedCount++;
          flashedPts += inv.points ?? 0;
          if (isDestroyed) flashedDestroyed++;
        }
      }
      const denominator = (posed - destroyed) + flashedDestroyed;
      const entry = {
        flashedCount, flashedPts, denominator, posed,
        completed: denominator > 0 && flashedCount >= denominator,
      };
      setCityProgress(prev => {
        const cur = prev[currentCityCode];
        if (cur && JSON.stringify(cur) === JSON.stringify(entry)) return prev; // inchangé
        const next = { ...prev, [currentCityCode]: entry };
        AsyncStorage.setItem('@invader_city_progress', JSON.stringify(next));
        return next;
      });
    }, 500);
    return () => clearTimeout(cityProgressTimer.current);
  }, [flashed, invaders, currentCityCode, loaded]);

  // Remplissage initial du registre : les villes où tu as des flashs mais aucune
  // entrée (ex. 1er lancement après l'arrivée du registre). On charge leurs
  // données en arrière-plan (cache disque, puis réseau) SANS changer de ville —
  // sinon les points cumulés affichent 0 tant que chaque ville n'a pas été rouverte.
  const backfillRun = useRef(false);
  useEffect(() => {
    if (!loaded || backfillRun.current || flashed.size === 0) return;
    backfillRun.current = true;
    (async () => {
      const codes = new Set();
      for (const id of flashed) {
        const i = id.lastIndexOf('_');
        if (i > 0) codes.add(id.slice(0, i));
      }
      for (const code of codes) {
        if (code === currentCityCode || cityProgress[code]) continue;
        try {
          const data = getCityData(code) ?? await loadCityData(code);
          const invs = data?.invaders ?? [];
          if (!invs.length) continue;
          let posed = 0, destroyed = 0, flashedCount = 0, flashedDestroyed = 0, flashedPts = 0;
          for (const inv of invs) {
            posed++;
            const isDestroyed = inv.status === 'destroyed';
            if (isDestroyed) destroyed++;
            if (flashed.has(inv.id)) {
              flashedCount++;
              flashedPts += inv.points ?? 0;
              if (isDestroyed) flashedDestroyed++;
            }
          }
          const denominator = (posed - destroyed) + flashedDestroyed;
          const entry = {
            flashedCount, flashedPts, denominator, posed,
            completed: denominator > 0 && flashedCount >= denominator,
          };
          setCityProgress(prev => {
            const next = { ...prev, [code]: entry };
            AsyncStorage.setItem('@invader_city_progress', JSON.stringify(next));
            return next;
          });
        } catch {} // hors-ligne / ville inconnue → réessaiera au prochain démarrage
      }
    })();
  }, [loaded, flashed]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (loaded) AsyncStorage.setItem('invader_labels',          JSON.stringify(labels));              }, [labels,         loaded]);
  useEffect(() => { if (loaded) AsyncStorage.setItem('invader_label_defs',      JSON.stringify(labelDefs));           }, [labelDefs,      loaded]);
  useEffect(() => { if (loaded) AsyncStorage.setItem('invader_status_colors',   JSON.stringify(statusColors));        }, [statusColors,   loaded]);
  useEffect(() => { if (loaded) AsyncStorage.setItem('invader_color_overrides', JSON.stringify(colorOverrides));      }, [colorOverrides, loaded]);
  // Dernier état des filtres (Set sérialisé en tableau) — réappliqué à l'ouverture
  useEffect(() => { if (loaded) AsyncStorage.setItem('invader_filters', JSON.stringify({ statuses: [...filters.statuses], flashedState: filters.flashedState })); }, [filters, loaded]);
  // News : abonnement villes (Set→array) + dernière consultation
  useEffect(() => { if (loaded && newsCities) AsyncStorage.setItem('@invader_news_cities', JSON.stringify([...newsCities])); }, [newsCities, loaded]);
  useEffect(() => { if (loaded && newsLastSeen) AsyncStorage.setItem('@invader_news_last_seen', newsLastSeen); }, [newsLastSeen, loaded]);
  // Mode balade : réglages persistés (lus tels quels par le futur moteur de proximité)
  useEffect(() => { if (loaded) AsyncStorage.setItem('@invader_stroll', JSON.stringify(stroll)); }, [stroll, loaded]);
  // Lieux d'intérêt : Set sérialisé en tableau, comme les filtres de statut
  useEffect(() => {
    if (!loaded) return;
    AsyncStorage.setItem('@invader_poi_prefs', JSON.stringify({
      enabled: poiPrefs.enabled, families: [...poiPrefs.families], objective: poiPrefs.objective,
    }));
  }, [poiPrefs, loaded]);

  // ─── Flashé ──────────────────────────────────────────────────────────────────

  // dated=true (Carte/Trajet/Chasse) : flash horodaté → compte dans les stats temporelles.
  // dated=false (Liste) : flash « historique » sans date → compte dans les totaux/géo
  // mais PAS dans les stats temporelles (courbe, série, meilleure journée, jour/nuit).
  function toggleFlash(id, { dated = true } = {}) {
    const removing = flashed.has(id);
    noterRetrait(removing ? [id] : [], removing ? [] : [id]);
    setFlashed(prev => {
      const next = new Set(prev);
      removing ? next.delete(id) : next.add(id);
      return next;
    });
    setFlashedDates(prev => {
      const next = new Map(prev);
      if (removing) next.delete(id);
      else if (dated) next.set(id, new Date().toISOString());
      // dated=false : on n'ajoute AUCUNE date (flash hors historique temporel)
      return next;
    });
  }

  // Tient le registre des retraits manuels. `ajoutes` efface le refus : remettre
  // un Invader à la main est aussi délibéré que l'avoir retiré.
  const noterRetrait = useCallback((retraits, ajoutes) => {
    if (!retraits.length && !ajoutes.length) return;
    setRetires((prev) => {
      const next = new Set(prev);
      for (const id of retraits) next.add(id);
      for (const id of ajoutes) next.delete(id);
      if (next.size === prev.size && [...next].every((x) => prev.has(x))) return prev;
      AsyncStorage.setItem('@invader_retires', JSON.stringify([...next])).catch(() => {});
      return next;
    });
  }, []);

  // Marquage en masse. FUSIONNE, ne remplace jamais (les autres villes restent).
  //
  // `dates` est facultatif : objet id → ISO. Sans lui — marquage depuis la Liste,
  // liste collée sans horodatage — on n'écrit AUCUNE date, et ces flashs comptent
  // dans les totaux et la géographie mais pas dans les statistiques temporelles.
  // Dater « maintenant » un passé de deux ans empilerait tout sur aujourd'hui.
  //
  // Avec lui — synchronisation FlashInvaders, qui fournit `date_flash` pour
  // chaque entrée — on pose la vraie date, et l'historique devient exploitable.
  //
  // Une date DÉJÀ POSÉE n'est jamais écrasée : si l'utilisateur a coché cet
  // Invader ici, c'est son geste et son horodatage qui font foi, pas ceux d'une
  // autre app.
  // STABLE — et ce n'est pas une optimisation, c'est une correction. Déclarée par
  // `function`, cette fonction était recréée à chaque rendu du contexte. La fiche
  // s'en sert dans un effet temporisé : à chaque rendu, le nettoyage de l'effet
  // annulait le minuteur en attente, et l'enregistrement ne partait jamais.
  //
  // Écriture immédiate, sans temporisation ici : une note se saisit à la main, on
  // ne peut pas en produire cent à la seconde, et la perdre serait impardonnable —
  // c'est la seule donnée de l'app que l'utilisateur a VRAIMENT créée.
  const setNote = useCallback((id, texte) => {
    setNotes((prev) => {
      const propre = String(texte ?? '').trim();
      const suivant = { ...prev };
      if (propre) suivant[id] = propre; else delete suivant[id];
      AsyncStorage.setItem('@invader_notes', JSON.stringify(suivant)).catch(() => {});
      return suivant;
    });
  }, []);

  function bulkFlash(ids, dates) {
    const list = ids ?? invaders.map(inv => inv.id);
    noterRetrait([], list);   // les remettre efface le refus
    setFlashed(prev => {
      const next = new Set(prev);
      for (const id of list) next.add(id);
      return next;
    });
    if (!dates) return;
    // La datation NE SE LIMITE PAS aux identifiants ajoutés à l'instant. Quelqu'un
    // qui avait déjà importé sa galerie possède déjà tous ces Invaders : la liste
    // des ajouts serait vide, et son historique resterait éternellement sans date.
    // On date donc tout ce dont on connaît la date ET qu'on possède — soit ceux
    // qu'on vient d'ajouter, soit ceux qu'on avait déjà.
    const ajoutes = new Set(list);
    setFlashedDates(prev => {
      const next = new Map(prev);
      let change = false;
      for (const [id, d] of Object.entries(dates)) {
        if (!d || next.has(id)) continue;              // date déjà posée : elle fait foi
        if (!ajoutes.has(id) && !flashed.has(id)) continue;  // pas à nous : on n'invente rien
        next.set(id, d);
        change = true;
      }
      return change ? next : prev;
    });
  }

  // Efface tout l'historique temporel (garde les flashés). Utile pour repartir
  // d'une timeline propre après un import massif daté par erreur.
  function clearFlashDates() {
    setFlashedDates(new Map());
  }

  function bulkUnflash(ids) {
    const list = ids ?? invaders.map(inv => inv.id);
    noterRetrait(list, []);
    setFlashed(prev => {
      const next = new Set(prev);
      for (const id of list) next.delete(id);
      return next;
    });
    setFlashedDates(prev => {
      const next = new Map(prev);
      for (const id of list) next.delete(id);
      return next;
    });
  }

  // Sélecteur Stats : liste triée des flashs avec leur date (null = antérieur à cette version)
  function getFlashHistory() {
    return [...flashed]
      .map(id => ({ id, flashedAt: flashedDates.get(id) ?? null }))
      .sort((a, b) => {
        if (!a.flashedAt && !b.flashedAt) return 0;
        if (!a.flashedAt) return 1;  // sans date → après les datés
        if (!b.flashedAt) return -1;
        return b.flashedAt.localeCompare(a.flashedAt); // ISO = tri lexicographique = chronologique
      });
  }

  // ─── News ──────────────────────────────────────────────────────────────────

  // Abonnement villes (alimente le fil ; structuré pour alimenter le push plus tard)
  function setNewsCitiesPref(codes) {
    setNewsCities(new Set(codes));
  }
  // Marque le fil comme consulté (réinitialise le badge « nouveau »)
  function markNewsSeen() {
    setNewsLastSeen(new Date().toISOString());
  }

  // Ferme la légende des couleurs sur la carte (mémorisé)
  function dismissLegend() {
    setLegendSeen(true);
    AsyncStorage.setItem('@invader_legend_seen', '1');
  }

  // ─── Mode balade ────────────────────────────────────────────────────────────
  // Modifie un ou plusieurs réglages (fusion partielle). Le moteur de proximité
  // (futur dev build) lira simplement l'objet `stroll`.
  function setStrollPref(partial) {
    setStroll(prev => ({ ...prev, ...partial }));
  }

  // ─── Lieux d'intérêt ────────────────────────────────────────────────────────
  // Fusion partielle, comme le Mode balade. `families` accepte un Set ou un tableau.
  function setPoiPref(partial) {
    setPoiPrefs(prev => ({
      ...prev,
      ...partial,
      families: partial.families ? new Set(partial.families) : prev.families,
    }));
  }

  // Coche / décoche une famille. On refuse de tout décocher : une couche active
  // et vide n'aurait aucun sens visible, on éteint plutôt la couche.
  function togglePoiFamily(key) {
    setPoiPrefs(prev => {
      const families = new Set(prev.families);
      if (families.has(key)) families.delete(key); else families.add(key);
      if (families.size === 0) return { ...prev, families: new Set(prev.families), enabled: false };
      return { ...prev, families };
    });
  }

  // Invitation « nouveaux lieux » vue (ou refusée) : ne plus la proposer.
  function dismissPoiIntro() {
    setPoiIntroSeen(true);
    AsyncStorage.setItem('@invader_poi_intro_seen', '1');
  }

  // Rejouer l'invitation (bouton de test dans les Réglages)
  function resetPoiIntro() {
    setPoiIntroSeen(false);
    AsyncStorage.removeItem('@invader_poi_intro_seen');
  }

  function dismissExplorerIntro() {
    setExplorerIntroSeen(true);
    setExplorerIntroForced(false);
    AsyncStorage.setItem('@invader_explorer_intro', '1').catch(() => {});
  }

  // Réaffiche la présentation SANS toucher au mode.
  //
  // La première version le désactivait, pour contourner la garde qui masque le
  // panneau quand le mode tourne déjà. Mais basculer le mode fait apparaître ou
  // disparaître d'un coup tous les Invaders de la ville sur la carte, et un
  // ajout massif d'annotations est une cause connue de plantage de MKMapView
  // (voir le débounce des filtres dans MapScreen) — un plantage natif, donc un
  // redémarrage de l'application. Signalé sur le terrain.
  //
  // On lève donc la garde plutôt que de changer d'état : réafficher un panneau
  // ne devrait de toute façon jamais modifier silencieusement un réglage.
  function toggleFavCity(code) {
    setFavCities((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      AsyncStorage.setItem('@invader_fav_cities', JSON.stringify([...next])).catch(() => {});
      return next;
    });
  }

  function resetExplorerIntro() {
    setExplorerIntroSeen(false);
    setExplorerIntroForced(true);
    AsyncStorage.removeItem('@invader_explorer_intro').catch(() => {});
  }

  function setExplorer(on) {
    setExplorerState(on);
    AsyncStorage.setItem('@invader_explorer', on ? '1' : '0').catch(() => {});
  }

  function setDevMode(on) {
    setDevModeState(on);
    AsyncStorage.setItem('@invader_dev', on ? '1' : '0').catch(() => {});
  }

  function setExplorerSuggest(on) {
    setExplorerSuggestState(on);
    AsyncStorage.setItem('@invader_explorer_suggest', on ? '1' : '0').catch(() => {});
  }

  // Notifs d'actualité : bascule (persiste + planifie/retire la tâche + prompt à l'activation).
  function setNewsNotifyPref(on) {
    setNewsNotifyState(on);
    if (on) enableNewsNotify(); else disableNewsNotify();
  }

  // Nombre d'événements non vus pour les villes suivies (badge du menu)
  const newsUnreadCount = (() => {
    if (!newsCities || newsCities.size === 0) return 0;
    const seenDay = newsLastSeen ? newsLastSeen.slice(0, 10) : null;
    return news.events.reduce((n, e) => {
      if (!newsCities.has(e.city)) return n;
      if (seenDay && e.date <= seenDay) return n;
      return n + 1;
    }, 0);
  })();

  // ─── Couleurs des statuts ─────────────────────────────────────────────────────

  function setStatusColor(status, color) {
    setStatusColorsState(prev => ({ ...prev, [status]: color }));
  }

  // Couleur des Invaders flashés (étiquette système lbl_flashed)
  function setFlashedColor(color) {
    setLabelDefs(prev => prev.map(d => d.id === 'lbl_flashed' ? { ...d, color } : d));
  }

  // ─── App de cartes ────────────────────────────────────────────────────────────

  function setMapsAppPref(val) {
    setMapsApp(val);
    AsyncStorage.setItem('invader_maps_app', val);
  }

  // ─── Langue ───────────────────────────────────────────────────────────────────

  async function setLanguage(lang) {
    setLanguageState(lang);
    await AsyncStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
    await applyLanguage(lang);
  }

  // ─── Onboarding ──────────────────────────────────────────────────────────────

  function completeOnboarding() {
    setShowOnboarding(false);
    AsyncStorage.setItem('@invader_onboarding_done', '1');
    // Le choix vient d'être fait dans l'onboarding : la présentation destinée
    // aux anciens n'a plus lieu d'être, et l'enchaîner serait absurde.
    setExplorerIntroSeen(true);
    AsyncStorage.setItem('@invader_explorer_intro', '1').catch(() => {});
  }

  function resetOnboarding() {
    setShowOnboarding(true);
    AsyncStorage.removeItem('@invader_onboarding_done');
  }

  // ─── Réinitialisation (préserve flashed) ─────────────────────────────────────

  // Réinitialise l'apparence (couleurs de statut + couleur « flashé » + overrides)
  function resetLabels() {
    setLabelDefs([...DEFAULT_LABEL_DEFS]);
    setStatusColorsState({ ...STATUS_COLOR });
    setColorOverrides({});
  }

  // Aliases de compatibilité (utilisés par SettingsScreen)
  const dataVersion   = cityVersion;
  const dataUpdatedAt = cityUpdatedAt;

  // value mémoïsé : l'objet n'est recréé que si un état exposé change, sinon
  // TOUS les consommateurs du contexte re-rendaient à chaque render du provider.
  // Les fonctions internes lisent uniquement des états présents dans les deps
  // (flashed, invaders, …) → pas de closure périmée.
  const value = useMemo(() => ({
    // Villes
    currentCityCode, setCurrentCity, cityIndex, isChangingCity, pendingCityCode,
    // Invaders (ville courante)
    invaders, dataVersion, dataUpdatedAt, checkDataUpdate,
    // Progression
    flashed, flashedDates, getFlashHistory, cityProgress,
    labels, labelDefs, statusColors, colorOverrides,
    filters, setFilters,
    toggleFlash, bulkFlash, bulkUnflash, clearFlashDates,
    notes, setNote,
    retires,
    setStatusColor, setFlashedColor,
    // News
    news, newsCities, setNewsCitiesPref, newsLastSeen, markNewsSeen, newsUnreadCount,
    newsNotify, setNewsNotifyPref,
    // Mode explorateur (masque les Invaders non flashés)
    explorer, setExplorer, explorerIntroSeen, explorerIntroForced, dismissExplorerIntro, resetExplorerIntro,
    // Villes favorites
    favCities, toggleFavCity,
    explorerSuggest, setExplorerSuggest,
    devMode, setDevMode,
    // Légende des couleurs
    legendSeen, dismissLegend,
    // Mode balade (réglages ; moteur au dev build)
    stroll, setStrollPref,
    // Lieux d'intérêt (Carte + Trajet + Chasse)
    poiPrefs, setPoiPref, togglePoiFamily,
    poiIntroSeen, dismissPoiIntro, resetPoiIntro,
    poiDataVersion, checkPoiUpdate, getPoiVersion,
    mapsApp, setMapsAppPref,
    language, setLanguage,
    showOnboarding, completeOnboarding, resetOnboarding,
    loaded,
    resetLabels,
  }), [ // eslint-disable-line react-hooks/exhaustive-deps
    currentCityCode, cityIndex, isChangingCity, pendingCityCode,
    invaders, dataVersion, dataUpdatedAt,
    flashed, flashedDates, cityProgress,
    labels, labelDefs, statusColors, colorOverrides,
    filters,
    news, newsCities, newsLastSeen, newsUnreadCount, newsNotify,
    legendSeen, explorer, explorerSuggest, devMode, explorerIntroSeen, explorerIntroForced, favCities,
    stroll, mapsApp, language,
    poiPrefs, poiIntroSeen, poiDataVersion,
    showOnboarding, loaded,
    // Ajoutés après coup, et oubliés ici — d'où quatre pannes silencieuses : la
    // note qui restait « Enregistrement… » pour toujours, les photos personnelles
    // qui n'apparaissaient qu'au prochain rendu fortuit, et les deux réglages de
    // photos sans effet immédiat. La valeur du contexte n'étant pas recréée, les
    // consommateurs continuaient de lire l'ancien objet. Un test statique vérifie
    // désormais que tout état exposé figure dans cette liste.
    notes, retires,
  ]);

  return (
    <AppContext.Provider value={value}>
      {children}
    </AppContext.Provider>
  );
}
