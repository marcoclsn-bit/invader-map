import { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { INVADERS } from '../data/invaders';
import { ALL_STATUSES } from '../constants';

const AppContext = createContext(null);

export function useAppContext() {
  return useContext(AppContext);
}

export function AppProvider({ children }) {
  const [flashed, setFlashed] = useState(new Set());
  const [labels, setLabels] = useState({});
  const [filters, setFilters] = useState({
    statuses: new Set(ALL_STATUSES),
    flashedState: 'all',
    activeLabels: new Set(),
  });
  const [flashedLoaded, setFlashedLoaded] = useState(false);

  // Chargement au démarrage
  useEffect(() => {
    AsyncStorage.getItem('invader_flashed')
      .then((raw) => { if (raw) setFlashed(new Set(JSON.parse(raw))); })
      .finally(() => setFlashedLoaded(true));
  }, []);

  // Sauvegarde à chaque changement (après le chargement initial)
  useEffect(() => {
    if (!flashedLoaded) return;
    AsyncStorage.setItem('invader_flashed', JSON.stringify([...flashed]));
  }, [flashed, flashedLoaded]);

  function toggleFlash(id) {
    setFlashed((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function bulkFlash() {
    setFlashed(new Set(INVADERS.map((inv) => inv.id)));
  }

  function bulkUnflash() {
    setFlashed(new Set());
  }

  return (
    <AppContext.Provider value={{
      flashed, labels, setLabels,
      filters, setFilters,
      toggleFlash, bulkFlash, bulkUnflash,
    }}>
      {children}
    </AppContext.Provider>
  );
}
