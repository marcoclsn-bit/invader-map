import { useSyncExternalStore, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_AVATAR_KEY } from './avatars';

// Profil 100 % LOCAL : pseudo + avatar/photo stockés sur l'appareil. Pas de compte.
//
// STORE SINGLETON (module) : un seul état partagé par tous les montages du
// composant. Le remontage (ex. bascule des volets Profil/Stats) ne relit plus le
// stockage et ne peut plus écraser la photo via une course lecture/écriture —
// c'était la cause de la photo « perdue » en changeant de volet.
const KEY_PROFILE = '@invader_profile';

let state = { name: '', avatar: DEFAULT_AVATAR_KEY, photoUri: null, loaded: false };
const listeners = new Set();
let loadStarted = false;

function notify() { for (const l of listeners) l(); }

// Mutation utilisateur : met à jour l'état partagé + persiste (après chargement).
function emit(patch) {
  state = { ...state, ...patch };
  notify();
  if (state.loaded) {
    AsyncStorage.setItem(KEY_PROFILE, JSON.stringify({
      name: state.name, avatar: state.avatar, photoUri: state.photoUri,
    })).catch(() => {});
  }
}

// Chargement unique par session d'app (jamais relancé au remontage).
function ensureLoaded() {
  if (loadStarted) return;
  loadStarted = true;
  AsyncStorage.getItem(KEY_PROFILE)
    .then((raw) => {
      const next = {};
      if (raw) {
        try {
          const p = JSON.parse(raw);
          if (typeof p.name === 'string') next.name = p.name;
          if (typeof p.avatar === 'string') next.avatar = p.avatar;
          if (typeof p.photoUri === 'string') next.photoUri = p.photoUri;
        } catch (_) {}
      }
      state = { ...state, ...next, loaded: true }; // pas d'écriture au chargement
      notify();
    })
    .catch(() => { state = { ...state, loaded: true }; notify(); });
}

const subscribe = (l) => { listeners.add(l); return () => listeners.delete(l); };
const getSnapshot = () => state;

export function useProfile() {
  ensureLoaded();
  const s = useSyncExternalStore(subscribe, getSnapshot);
  const setName = useCallback((v) => emit({ name: v }), []);
  // Choisir un avatar par défaut efface la photo perso
  const setAvatar = useCallback((v) => emit({ avatar: v, photoUri: null }), []);
  const setPhoto = useCallback((uri) => emit({ photoUri: uri }), []);
  const clearPhoto = useCallback(() => emit({ photoUri: null }), []);
  return {
    name: s.name, avatar: s.avatar, photoUri: s.photoUri, loaded: s.loaded,
    setName, setAvatar, setPhoto, clearPhoto,
  };
}
