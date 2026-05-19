// src/context/ThemeContext.tsx
import React, { createContext, useContext, useState, useEffect } from 'react';
import { useColorScheme } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Theme, lightTheme, darkTheme } from '../theme';

type ThemeMode = 'system' | 'dark' | 'light';

type ThemeContextType = {
  theme: Theme;
  mode: ThemeMode;
  setMode: (m: ThemeMode) => void;
  toggleDark: () => void;
};

const ThemeContext = createContext<ThemeContextType>({
  theme: lightTheme,
  mode: 'system',
  setMode: () => {},
  toggleDark: () => {},
});

const MODE_KEY = 'app_theme_mode';

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const systemScheme = useColorScheme();
  const [mode, setModeState] = useState<ThemeMode>('system');

  useEffect(() => {
    AsyncStorage.getItem(MODE_KEY).then(v => {
      if (v === 'dark' || v === 'light' || v === 'system') setModeState(v);
    });
  }, []);

  const setMode = async (m: ThemeMode) => {
    setModeState(m);
    await AsyncStorage.setItem(MODE_KEY, m);
  };

  const isDark =
    mode === 'dark' ? true :
    mode === 'light' ? false :
    systemScheme === 'dark';

  const theme = isDark ? darkTheme : lightTheme;

  const toggleDark = () => setMode(isDark ? 'light' : 'dark');

  return (
    <ThemeContext.Provider value={{ theme, mode, setMode, toggleDark }}>
      {children}
    </ThemeContext.Provider>
  );
}

export const useTheme = () => useContext(ThemeContext);
