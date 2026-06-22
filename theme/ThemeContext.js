import { createContext, useContext, useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { THEMES } from './tokens';

const Ctx = createContext(null);
const STORAGE_KEY = '@invader_theme';

export function ThemeProvider({ children }) {
  const [isDark, setIsDark] = useState(true); // sombre par défaut

  useEffect(() => {
    AsyncStorage.getItem(STORAGE_KEY).then(val => {
      if (val === 'light') setIsDark(false);
    });
  }, []);

  function toggle() {
    const next = !isDark;
    setIsDark(next);
    AsyncStorage.setItem(STORAGE_KEY, next ? 'dark' : 'light');
  }

  return (
    <Ctx.Provider value={{ theme: THEMES[isDark ? 'dark' : 'light'], isDark, toggle }}>
      {children}
    </Ctx.Provider>
  );
}

// Hook à utiliser dans n'importe quel écran ou composant :
//   const { theme, isDark, toggle } = useTheme();
export function useTheme() {
  return useContext(Ctx);
}
