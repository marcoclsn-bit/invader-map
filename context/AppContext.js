import { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { INVADERS as EMBEDDED_INVADERS, INVADERS_VERSION, INVADERS_UPDATED_AT } from '../data/invaders';
import { ALL_STATUSES, DEFAULT_LABELS, STATUS_COLOR, DEFAULT_LABEL_DEFS } from '../constants';
import { initInvaderData, onDataUpdate, checkForUpdate } from '../services/invaderData';

const AppContext = createContext(null);

export function useAppContext() {
  return useContext(AppContext);
}

export function AppProvider({ children }) {
  // ─── Données Invaders (dynamiques : embarquées → cache → distantes) ──────────
  const [invaders,     setInvaders]     = useState(EMBEDDED_INVADERS);
  const [dataVersion,  setDataVersion]  = useState(INVADERS_VERSION);
  const [dataUpdatedAt, setDataUpdatedAt] = useState(INVADERS_UPDATED_AT);

  const [flashed, setFlashed] = useState(new Set());
  const [labels, setLabels] = useState({});           // invaderID → [labelId, ...]
  const [labelDefs, setLabelDefs] = useState([...DEFAULT_LABEL_DEFS]);
  const [statusColors, setStatusColorsState] = useState({ ...STATUS_COLOR });
  const [colorOverrides, setColorOverrides] = useState({});
  const [filters, setFilters] = useState({
    statuses: new Set(ALL_STATUSES),
    flashedState: 'all',
    activeLabels: new Set(),
  });
  const [mapsApp, setMapsApp] = useState(null);
  const [loaded, setLoaded] = useState(false);

  // ─── Initialisation des données Invaders (cache + remote en arrière-plan) ───
  useEffect(() => {
    initInvaderData().then(({ invaders: data, version, updatedAt }) => {
      setInvaders(data);
      setDataVersion(version);
      setDataUpdatedAt(updatedAt);
    });
    const unsub = onDataUpdate(({ invaders: data, version, updatedAt }) => {
      setInvaders(data);
      setDataVersion(version);
      setDataUpdatedAt(updatedAt);
    });
    return unsub;
  }, []);

  // ─── Vérification manuelle (Réglages) ────────────────────────────────────────
  async function checkDataUpdate() {
    const status = await checkForUpdate();
    // Si une mise à jour a eu lieu, le listener onDataUpdate met déjà à jour l'état
    return status;
  }

  // Chargement au démarrage (tout en parallèle)
  useEffect(() => {
    Promise.all([
      AsyncStorage.getItem('invader_flashed'),
      AsyncStorage.getItem('invader_labels'),
      AsyncStorage.getItem('invader_label_defs'),
      AsyncStorage.getItem('invader_status_colors'),
      AsyncStorage.getItem('invader_color_overrides'),
      AsyncStorage.getItem('invader_maps_app'),
    ]).then(([flashedRaw, labelsRaw, labelDefsRaw, statusColorsRaw, colorOverridesRaw, mapsAppRaw]) => {
      if (flashedRaw)       setFlashed(new Set(JSON.parse(flashedRaw)));
      if (labelsRaw)        setLabels(JSON.parse(labelsRaw));
      if (labelDefsRaw) {
        const parsed = JSON.parse(labelDefsRaw);
        // Migration : s'assurer que les étiquettes système sont toujours présentes
        const systemDefs = DEFAULT_LABEL_DEFS.filter((d) => d.system);
        const missing = systemDefs.filter((s) => !parsed.find((p) => p.id === s.id));
        // Préserver la couleur personnalisée si elle a déjà été stockée
        const systemWithColor = systemDefs
          .filter((s) => parsed.find((p) => p.id === s.id))
          .map((s) => ({ ...s, color: parsed.find((p) => p.id === s.id).color }));
        const nonSystem = parsed.filter((p) => !p.system);
        setLabelDefs([...missing, ...systemWithColor, ...nonSystem]);
      }
      if (statusColorsRaw)  setStatusColorsState(JSON.parse(statusColorsRaw));
      if (colorOverridesRaw) setColorOverrides(JSON.parse(colorOverridesRaw));
      if (mapsAppRaw)       setMapsApp(mapsAppRaw);
    }).finally(() => setLoaded(true));
  }, []);

  // Sauvegarde automatique après le chargement initial
  useEffect(() => { if (loaded) AsyncStorage.setItem('invader_flashed',        JSON.stringify([...flashed]));        }, [flashed,        loaded]);
  useEffect(() => { if (loaded) AsyncStorage.setItem('invader_labels',         JSON.stringify(labels));               }, [labels,         loaded]);
  useEffect(() => { if (loaded) AsyncStorage.setItem('invader_label_defs',     JSON.stringify(labelDefs));            }, [labelDefs,      loaded]);
  useEffect(() => { if (loaded) AsyncStorage.setItem('invader_status_colors',  JSON.stringify(statusColors));         }, [statusColors,   loaded]);
  useEffect(() => { if (loaded) AsyncStorage.setItem('invader_color_overrides',JSON.stringify(colorOverrides));       }, [colorOverrides, loaded]);

  // ─── Flashé ──────────────────────────────────────────────────────────────────

  function toggleFlash(id) {
    setFlashed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function bulkFlash()   { setFlashed(new Set(invaders.map((inv) => inv.id))); }
  function bulkUnflash() { setFlashed(new Set()); }

  // ─── Étiquettes — association invader → label IDs ─────────────────────────

  function toggleLabel(invId, labelId) {
    setLabels((prev) => {
      const current = prev[invId] ?? [];
      const next = current.includes(labelId)
        ? current.filter((id) => id !== labelId)
        : [...current, labelId];
      if (next.length === 0) { const { [invId]: _, ...rest } = prev; return rest; }
      return { ...prev, [invId]: next };
    });
  }

  // ─── Définitions d'étiquettes ─────────────────────────────────────────────

  function addLabel(name, color) {
    setLabelDefs((prev) => [...prev, { id: `lbl_${Date.now()}`, name, color, isDefault: false }]);
  }

  function updateLabel(id, changes) {
    setLabelDefs((prev) => prev.map((d) => (d.id === id ? { ...d, ...changes } : d)));
  }

  function deleteLabel(id) {
    setLabelDefs((prev) => prev.filter((d) => d.id !== id));
    setLabels((prev) => {
      const next = { ...prev };
      for (const invId of Object.keys(next)) {
        next[invId] = next[invId].filter((lId) => lId !== id);
        if (next[invId].length === 0) delete next[invId];
      }
      return next;
    });
    setFilters((prev) => {
      const activeLabels = new Set(prev.activeLabels);
      activeLabels.delete(id);
      return { ...prev, activeLabels };
    });
  }

  // ─── Couleurs des statuts ─────────────────────────────────────────────────

  function setStatusColor(status, color) {
    setStatusColorsState((prev) => ({ ...prev, [status]: color }));
  }

  // ─── App de cartes ────────────────────────────────────────────────────────

  function setMapsAppPref(val) {
    setMapsApp(val);
    AsyncStorage.setItem('invader_maps_app', val);
  }

  // ─── Réinitialisation complète (préserve flashed) ─────────────────────────

  function resetLabels() {
    setLabels({ ...DEFAULT_LABELS });
    setLabelDefs([...DEFAULT_LABEL_DEFS]);
    setStatusColorsState({ ...STATUS_COLOR });
    setColorOverrides({});
    setFilters((prev) => ({ ...prev, activeLabels: new Set() }));
  }

  return (
    <AppContext.Provider value={{
      invaders, dataVersion, dataUpdatedAt, checkDataUpdate,
      flashed, labels, labelDefs, statusColors, colorOverrides,
      filters, setFilters,
      toggleFlash, bulkFlash, bulkUnflash,
      toggleLabel, addLabel, updateLabel, deleteLabel,
      setStatusColor,
      mapsApp, setMapsAppPref,
      resetLabels,
    }}>
      {children}
    </AppContext.Provider>
  );
}
