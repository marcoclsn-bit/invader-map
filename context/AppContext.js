import { createContext, useContext, useState, useEffect, useRef } from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { INVADERS as EMBEDDED_PA, INVADERS_VERSION, INVADERS_UPDATED_AT } from '../data/invaders';
import { ALL_STATUSES, STATUS_COLOR, DEFAULT_LABEL_DEFS } from '../constants';
import { initInvaderService, loadCityData, onCityUpdate, checkCityForUpdate, getCityIndex, getCityData } from '../services/invaderData';
import { getCachedNews, fetchNews } from '../services/newsData';
import { applyLanguage, LANGUAGE_STORAGE_KEY } from '../i18n';
import { ENABLED_CITIES, DEFAULT_CITY_CODE, CITIES } from '../cities/registry';

const AppContext = createContext(null);

// Réglages « Mode balade » (UI posée maintenant ; moteur de proximité branché au dev build).
// Persistés tels quels — le futur moteur lira cet objet sans refactor.
const DEFAULT_STROLL = {
  enabled:       false,  // toggle principal — éteint par défaut
  radius:        50,     // rayon d'alerte en mètres (25–150)
  vibration:     true,   // alerter par vibration
  notification:  true,   // alerter par notification
  // Statuts qui déclenchent une alerte. Défaut « à faire » : ok / endommagé / inconnu.
  // Les flashés sont TOUJOURS exclus ; les détruits ne sont jamais proposés (non flashables).
  alertStatuses: ['ok', 'damaged', 'unknown'],
};

// Statuts proposables dans le sélecteur du Mode balade (jamais 'destroyed', jamais 'hidden')
export const STROLL_STATUS_OPTIONS = ['ok', 'damaged', 'unknown'];

// Filtres « à faire » : tous les statuts visibles SAUF les détruits, et seulement
// les non-flashés. C'est l'état par défaut de la carte au tout premier lancement.
function makeTodoFilters() {
  return {
    statuses: new Set(ALL_STATUSES.filter((s) => s !== 'destroyed')),
    flashedState: 'unflashed',
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

// Débit estimé : nombre d'Invaders rendus par seconde sur le pont JS→natif.
// Paris (1528 inv) → ceil(1528 / 16) = 96 s ≈ 1 min 36 s.
const INVADERS_PER_SECOND = 16;

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
  // Timestamp (ms) jusqu'auquel le changement de ville est verrouillé.
  // Initialisé pour Paris au démarrage : ceil(1528 / 16) = 96 s.
  // mapLockDuration = durée originale du verrou courant (ne change PAS lors d'une extension background).
  // Permet de calculer la progression : 1 - remainingMs / mapLockDuration.
  const _initialLockDuration = Math.ceil(EMBEDDED_PA.length / INVADERS_PER_SECOND) * 1000;
  const [mapLockUntil,    setMapLockUntil]    = useState(() => Date.now() + _initialLockDuration);
  const [mapLockDuration, setMapLockDuration] = useState(_initialLockDuration);

  const [flashed,      setFlashed]      = useState(new Set());
  // Map<id, isoString> — absente = null (Invader flashé avant cette version)
  const [flashedDates, setFlashedDates] = useState(new Map());
  const [labels, setLabels] = useState({});
  const [labelDefs, setLabelDefs] = useState([...DEFAULT_LABEL_DEFS]);
  const [statusColors, setStatusColorsState] = useState({ ...STATUS_COLOR });
  const [colorOverrides, setColorOverrides] = useState({});
  // Défaut « à faire » (1er lancement) : on masque les détruits et les flashés.
  // Les autres statuts non flashés (ok / endommagé / inconnu) restent visibles.
  const [filters, setFilters] = useState(makeTodoFilters);
  const [mapsApp, setMapsApp] = useState(null);

  // ── News ──────────────────────────────────────────────────────────────────
  const [news, setNews]               = useState({ version: 0, events: [] });
  const [newsCities, setNewsCities]   = useState(null);  // Set<code> ; null = pas encore choisi
  const [newsLastSeen, setNewsLastSeen] = useState(null); // ISO de la dernière ouverture de News

  // ── Mode balade (réglages seulement ; moteur au dev build) ──────────────────
  const [stroll, setStroll] = useState(DEFAULT_STROLL);

  // Légende des couleurs : affichée sur la carte au 1er usage, puis masquée.
  const [legendSeen, setLegendSeen] = useState(false);
  const [language, setLanguageState] = useState('system');
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [loaded, setLoaded] = useState(false);

  // ─── Initialisation du service de données ────────────────────────────────────
  useEffect(() => {
    // Charge l'index des villes (cache puis remote en arrière-plan)
    initInvaderService().then(index => {
      if (index.length > 0) setCityIndex(index);
    });

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
        // Verrouille le changement de ville pendant le temps de chargement estimé.
        // On utilise le nombre réel d'Invaders si déjà en mémoire, sinon cityIndex, sinon 100.
        const count = getCityData(code)?.invaders?.length
          ?? cityIndex.find(c => c.code === code)?.count
          ?? 100;
        const lockMs = Math.ceil(count / INVADERS_PER_SECOND) * 1000;
        setMapLockDuration(lockMs);
        setMapLockUntil(Date.now() + lockMs);
      }, 500);
    }, 500);
  }

  // ─── Pause du timer quand l'app passe en arrière-plan ───────────────────────
  // Quand l'app revient au premier plan, on ajoute le temps écoulé en arrière-plan
  // à mapLockUntil pour que le timer ne s'écoule pas pendant que les RAF sont gelés.
  // À la fermeture complète, AppProvider se démonte → mapLockUntil repart de 0 au relancement.
  useEffect(() => {
    let backgroundedAt = null;

    const sub = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') {
        // App en arrière-plan ou inactive : mémoriser l'heure
        if (backgroundedAt === null) backgroundedAt = Date.now();
      } else {
        // Retour au premier plan
        if (backgroundedAt !== null) {
          const elapsed = Date.now() - backgroundedAt;
          backgroundedAt = null;
          setMapLockUntil(prev => (prev > Date.now() ? prev + elapsed : prev));
        }
      }
    });

    return () => sub.remove();
  }, []);

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
      const [newsCitiesRaw, newsLastSeenRaw, strollRaw, legendSeenRaw] = await Promise.all([
        AsyncStorage.getItem('@invader_news_cities'),
        AsyncStorage.getItem('@invader_news_last_seen'),
        AsyncStorage.getItem('@invader_stroll'),
        AsyncStorage.getItem('@invader_legend_seen'),
      ]);
      if (legendSeenRaw === '1') setLegendSeen(true);

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
          if (parsed && typeof parsed === 'object') setStroll({ ...DEFAULT_STROLL, ...parsed });
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
        // Verrou provisoire (100 inv = ~7 s) en attendant le nombre réel.
        const provisionalMs = Math.ceil(100 / INVADERS_PER_SECOND) * 1000;
        setMapLockDuration(provisionalMs);
        setMapLockUntil(Date.now() + provisionalMs);
        loadCityData(cityToLoad).then(data => {
          if (data && currentCityCodeRef.current === cityToLoad) {
            setInvaders(data.invaders);
            setCityVersion(data.version);
            setCityUpdatedAt(data.updatedAt);
            // Maintenant qu'on connaît le nombre exact, on corrige le verrou.
            const realMs = Math.ceil(data.invaders.length / INVADERS_PER_SECOND) * 1000;
            setMapLockDuration(realMs);
            setMapLockUntil(Date.now() + realMs);
          }
        });
      }

      setLoaded(true);
    })();
  }, []);

  // ─── Persistance automatique ──────────────────────────────────────────────────
  useEffect(() => { if (loaded) AsyncStorage.setItem('invader_flashed',         JSON.stringify([...flashed]));                              }, [flashed,        loaded]);
  useEffect(() => { if (loaded) AsyncStorage.setItem('invader_flashed_dates',   JSON.stringify(Object.fromEntries(flashedDates)));           }, [flashedDates,   loaded]);
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

  // ─── Flashé ──────────────────────────────────────────────────────────────────

  // dated=true (Carte/Trajet/Chasse) : flash horodaté → compte dans les stats temporelles.
  // dated=false (Liste) : flash « historique » sans date → compte dans les totaux/géo
  // mais PAS dans les stats temporelles (courbe, série, meilleure journée, jour/nuit).
  function toggleFlash(id, { dated = true } = {}) {
    const removing = flashed.has(id);
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

  // Marquage en masse (Liste) = mise à jour de l'historique déjà flashé.
  // On N'AJOUTE PAS de date → ces flashs comptent dans les totaux/géo mais pas
  // dans les stats temporelles. FUSIONNE (ne touche pas aux autres villes).
  function bulkFlash(ids) {
    const list = ids ?? invaders.map(inv => inv.id);
    setFlashed(prev => {
      const next = new Set(prev);
      for (const id of list) next.add(id);
      return next;
    });
    // volontairement : aucune écriture dans flashedDates (voir commentaire ci-dessus)
  }

  // Efface tout l'historique temporel (garde les flashés). Utile pour repartir
  // d'une timeline propre après un import massif daté par erreur.
  function clearFlashDates() {
    setFlashedDates(new Map());
  }

  function bulkUnflash(ids) {
    const list = ids ?? invaders.map(inv => inv.id);
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

  return (
    <AppContext.Provider value={{
      // Villes
      currentCityCode, setCurrentCity, cityIndex, isChangingCity, pendingCityCode,
      mapLockUntil, mapLockDuration,
      // Invaders (ville courante)
      invaders, dataVersion, dataUpdatedAt, checkDataUpdate,
      // Progression
      flashed, flashedDates, getFlashHistory,
      labels, labelDefs, statusColors, colorOverrides,
      filters, setFilters,
      toggleFlash, bulkFlash, bulkUnflash, clearFlashDates,
      setStatusColor, setFlashedColor,
      // News
      news, newsCities, setNewsCitiesPref, newsLastSeen, markNewsSeen, newsUnreadCount,
      // Légende des couleurs
      legendSeen, dismissLegend,
      // Mode balade (réglages ; moteur au dev build)
      stroll, setStrollPref,
      mapsApp, setMapsAppPref,
      language, setLanguage,
      showOnboarding, completeOnboarding, resetOnboarding,
      loaded,
      resetLabels,
    }}>
      {children}
    </AppContext.Provider>
  );
}
