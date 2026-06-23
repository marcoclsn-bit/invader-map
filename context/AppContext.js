import { createContext, useContext, useState, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { INVADERS as EMBEDDED_PA, INVADERS_VERSION, INVADERS_UPDATED_AT } from '../data/invaders';
import { ALL_STATUSES, DEFAULT_LABELS, STATUS_COLOR, DEFAULT_LABEL_DEFS } from '../constants';
import { initInvaderService, loadCityData, onCityUpdate, checkCityForUpdate, getCityIndex } from '../services/invaderData';
import { applyLanguage, LANGUAGE_STORAGE_KEY } from '../i18n';
import { ENABLED_CITIES, DEFAULT_CITY_CODE, CITIES } from '../cities/registry';

const AppContext = createContext(null);

export function useAppContext() {
  return useContext(AppContext);
}

export function AppProvider({ children }) {
  // ─── Ville courante ───────────────────────────────────────────────────────────
  const [currentCityCode, setCurrentCityCode] = useState(DEFAULT_CITY_CODE);
  const currentCityCodeRef = useRef(DEFAULT_CITY_CODE);

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
  const [invaders,      setInvaders]      = useState(EMBEDDED_PA);
  const [cityVersion,   setCityVersion]   = useState(INVADERS_VERSION);
  const [cityUpdatedAt, setCityUpdatedAt] = useState(INVADERS_UPDATED_AT);

  const [flashed, setFlashed] = useState(new Set());
  const [labels, setLabels] = useState({});
  const [labelDefs, setLabelDefs] = useState([...DEFAULT_LABEL_DEFS]);
  const [statusColors, setStatusColorsState] = useState({ ...STATUS_COLOR });
  const [colorOverrides, setColorOverrides] = useState({});
  const [filters, setFilters] = useState({
    statuses: new Set(ALL_STATUSES),
    flashedState: 'all',
    activeLabels: new Set(),
  });
  const [mapsApp, setMapsApp] = useState(null);
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
      }
      // Met à jour le count dans l'index si disponible
      setCityIndex(prev => prev.map(c =>
        c.code === cityCode ? { ...c, count: data.length, version } : c
      ));
    });

    return unsub;
  }, []);

  // ─── Changement de ville ──────────────────────────────────────────────────────
  function setCurrentCity(code) {
    if (code === currentCityCodeRef.current) return;
    currentCityCodeRef.current = code;
    setCurrentCityCode(code);
    AsyncStorage.setItem('@invader_current_city', code);

    // Vide les invaders : la MapView repart de zéro (key=code) avant d'afficher la nouvelle ville
    setInvaders([]);
    loadCityData(code).then(data => {
      if (data && currentCityCodeRef.current === code) {
        setInvaders(data.invaders);
        setCityVersion(data.version);
        setCityUpdatedAt(data.updatedAt);
      }
    });
  }

  // ─── Vérification manuelle (Réglages) ────────────────────────────────────────
  async function checkDataUpdate() {
    return checkCityForUpdate(currentCityCodeRef.current);
  }

  // ─── Chargement au démarrage ──────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem('invader_flashed'),
      AsyncStorage.getItem('invader_labels'),
      AsyncStorage.getItem('invader_label_defs'),
      AsyncStorage.getItem('invader_status_colors'),
      AsyncStorage.getItem('invader_color_overrides'),
      AsyncStorage.getItem('invader_maps_app'),
      AsyncStorage.getItem(LANGUAGE_STORAGE_KEY),
      AsyncStorage.getItem('@invader_onboarding_done'),
      AsyncStorage.getItem('@invader_current_city'),
    ]).then(([
      flashedRaw, labelsRaw, labelDefsRaw, statusColorsRaw, colorOverridesRaw,
      mapsAppRaw, langRaw, onboardingRaw, currentCityRaw,
    ]) => {
      if (flashedRaw)       setFlashed(new Set(JSON.parse(flashedRaw)));
      if (labelsRaw)        setLabels(JSON.parse(labelsRaw));
      if (labelDefsRaw) {
        const parsed = JSON.parse(labelDefsRaw);
        const systemDefs = DEFAULT_LABEL_DEFS.filter(d => d.system);
        const missing = systemDefs.filter(s => !parsed.find(p => p.id === s.id));
        const systemWithColor = systemDefs
          .filter(s => parsed.find(p => p.id === s.id))
          .map(s => ({ ...s, color: parsed.find(p => p.id === s.id).color }));
        const nonSystem = parsed.filter(p => !p.system);
        setLabelDefs([...missing, ...systemWithColor, ...nonSystem]);
      }
      if (statusColorsRaw)   setStatusColorsState(JSON.parse(statusColorsRaw));
      if (colorOverridesRaw) setColorOverrides(JSON.parse(colorOverridesRaw));
      if (mapsAppRaw)        setMapsApp(mapsAppRaw);
      const storedLang = langRaw ?? 'system';
      setLanguageState(storedLang);
      applyLanguage(storedLang);
      if (!onboardingRaw) setShowOnboarding(true);

      // Restaure la ville précédente si elle est dans le registre
      if (currentCityRaw && CITIES[currentCityRaw]) {
        currentCityCodeRef.current = currentCityRaw;
        setCurrentCityCode(currentCityRaw);
        if (currentCityRaw !== 'PA') {
          setInvaders([]);
          loadCityData(currentCityRaw).then(data => {
            if (data && currentCityCodeRef.current === currentCityRaw) {
              setInvaders(data.invaders);
              setCityVersion(data.version);
              setCityUpdatedAt(data.updatedAt);
            }
          });
        }
      }
    }).finally(() => setLoaded(true));
  }, []);

  // ─── Persistance automatique ──────────────────────────────────────────────────
  useEffect(() => { if (loaded) AsyncStorage.setItem('invader_flashed',         JSON.stringify([...flashed]));       }, [flashed,        loaded]);
  useEffect(() => { if (loaded) AsyncStorage.setItem('invader_labels',          JSON.stringify(labels));              }, [labels,         loaded]);
  useEffect(() => { if (loaded) AsyncStorage.setItem('invader_label_defs',      JSON.stringify(labelDefs));           }, [labelDefs,      loaded]);
  useEffect(() => { if (loaded) AsyncStorage.setItem('invader_status_colors',   JSON.stringify(statusColors));        }, [statusColors,   loaded]);
  useEffect(() => { if (loaded) AsyncStorage.setItem('invader_color_overrides', JSON.stringify(colorOverrides));      }, [colorOverrides, loaded]);

  // ─── Flashé ──────────────────────────────────────────────────────────────────

  function toggleFlash(id) {
    setFlashed(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function bulkFlash()   { setFlashed(new Set(invaders.map(inv => inv.id))); }
  function bulkUnflash() { setFlashed(prev => {
    const next = new Set(prev);
    invaders.forEach(inv => next.delete(inv.id));
    return next;
  }); }

  // ─── Étiquettes ──────────────────────────────────────────────────────────────

  function toggleLabel(invId, labelId) {
    setLabels(prev => {
      const current = prev[invId] ?? [];
      const next = current.includes(labelId)
        ? current.filter(id => id !== labelId)
        : [...current, labelId];
      if (next.length === 0) { const { [invId]: _, ...rest } = prev; return rest; }
      return { ...prev, [invId]: next };
    });
  }

  function addLabel(name, color) {
    setLabelDefs(prev => [...prev, { id: `lbl_${Date.now()}`, name, color, isDefault: false }]);
  }

  function updateLabel(id, changes) {
    setLabelDefs(prev => prev.map(d => d.id === id ? { ...d, ...changes } : d));
  }

  function deleteLabel(id) {
    setLabelDefs(prev => prev.filter(d => d.id !== id));
    setLabels(prev => {
      const next = { ...prev };
      for (const invId of Object.keys(next)) {
        next[invId] = next[invId].filter(lId => lId !== id);
        if (next[invId].length === 0) delete next[invId];
      }
      return next;
    });
    setFilters(prev => {
      const activeLabels = new Set(prev.activeLabels);
      activeLabels.delete(id);
      return { ...prev, activeLabels };
    });
  }

  // ─── Couleurs des statuts ─────────────────────────────────────────────────────

  function setStatusColor(status, color) {
    setStatusColorsState(prev => ({ ...prev, [status]: color }));
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

  function resetLabels() {
    setLabels({ ...DEFAULT_LABELS });
    setLabelDefs([...DEFAULT_LABEL_DEFS]);
    setStatusColorsState({ ...STATUS_COLOR });
    setColorOverrides({});
    setFilters(prev => ({ ...prev, activeLabels: new Set() }));
  }

  // Aliases de compatibilité (utilisés par SettingsScreen)
  const dataVersion   = cityVersion;
  const dataUpdatedAt = cityUpdatedAt;

  return (
    <AppContext.Provider value={{
      // Villes
      currentCityCode, setCurrentCity, cityIndex,
      // Invaders (ville courante)
      invaders, dataVersion, dataUpdatedAt, checkDataUpdate,
      // Progression
      flashed, labels, labelDefs, statusColors, colorOverrides,
      filters, setFilters,
      toggleFlash, bulkFlash, bulkUnflash,
      toggleLabel, addLabel, updateLabel, deleteLabel,
      setStatusColor,
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
