import { useState, useEffect, useRef, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_AVATAR_KEY } from './avatars';

// Profil 100 % LOCAL : pseudo + avatar stockés sur l'appareil. Pas de compte.
const KEY_PROFILE = '@invader_profile';

export function useProfile() {
  const [name, setNameState] = useState('');
  const [avatar, setAvatarState] = useState(DEFAULT_AVATAR_KEY);
  const [loaded, setLoaded] = useState(false);
  const didLoad = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY_PROFILE).then((raw) => {
      if (raw) {
        try {
          const p = JSON.parse(raw);
          if (typeof p.name === 'string') setNameState(p.name);
          if (typeof p.avatar === 'string') setAvatarState(p.avatar);
        } catch (_) {}
      }
      didLoad.current = true;
      setLoaded(true);
    });
  }, []);

  // Persiste à chaque changement (après le chargement initial)
  useEffect(() => {
    if (!didLoad.current) return;
    AsyncStorage.setItem(KEY_PROFILE, JSON.stringify({ name, avatar }));
  }, [name, avatar]);

  const setName = useCallback((v) => setNameState(v), []);
  const setAvatar = useCallback((v) => setAvatarState(v), []);

  return { name, avatar, setName, setAvatar, loaded };
}
