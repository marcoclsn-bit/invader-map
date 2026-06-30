import { useState, useEffect, useRef, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { DEFAULT_AVATAR_KEY } from './avatars';

// Profil 100 % LOCAL : pseudo + avatar/photo stockés sur l'appareil. Pas de compte.
const KEY_PROFILE = '@invader_profile';

export function useProfile() {
  const [name, setNameState] = useState('');
  const [avatar, setAvatarState] = useState(DEFAULT_AVATAR_KEY);
  const [photoUri, setPhotoState] = useState(null); // photo perso (prioritaire si présente)
  const [loaded, setLoaded] = useState(false);
  const didLoad = useRef(false);

  useEffect(() => {
    AsyncStorage.getItem(KEY_PROFILE).then((raw) => {
      if (raw) {
        try {
          const p = JSON.parse(raw);
          if (typeof p.name === 'string') setNameState(p.name);
          if (typeof p.avatar === 'string') setAvatarState(p.avatar);
          if (typeof p.photoUri === 'string') setPhotoState(p.photoUri);
        } catch (_) {}
      }
      didLoad.current = true;
      setLoaded(true);
    });
  }, []);

  // Persiste à chaque changement (après le chargement initial)
  useEffect(() => {
    if (!didLoad.current) return;
    AsyncStorage.setItem(KEY_PROFILE, JSON.stringify({ name, avatar, photoUri }));
  }, [name, avatar, photoUri]);

  const setName = useCallback((v) => setNameState(v), []);
  // Choisir un avatar par défaut efface la photo perso
  const setAvatar = useCallback((v) => { setAvatarState(v); setPhotoState(null); }, []);
  const setPhoto = useCallback((uri) => setPhotoState(uri), []);
  const clearPhoto = useCallback(() => setPhotoState(null), []);

  return { name, avatar, photoUri, setName, setAvatar, setPhoto, clearPhoto, loaded };
}
