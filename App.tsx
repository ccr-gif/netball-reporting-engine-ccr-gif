// App.tsx
import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, StatusBar, Platform } from 'react-native';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';

import { initDb } from './src/storage/db';
import { processOutbox } from './src/storage/reportOutbox';
import { ThemeProvider, useTheme } from './src/context/ThemeContext';
import { OfflineBanner, ErrorBoundary } from './src/components/ui';
import AppNavigator from './src/navigation/AppNavigator';

const LAST_MATCH_KEY = 'last_match_id';

function AppInner() {
  const { theme } = useTheme();
  const c = theme.colors;

  const [currentMatchId, setCurrentMatchId] = useState<string | null>(null);
  const [isOffline, setIsOffline]           = useState(false);
  const outboxTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Restore last active match
  useEffect(() => {
    (async () => {
      await initDb();
      const saved = await AsyncStorage.getItem(LAST_MATCH_KEY);
      if (saved) setCurrentMatchId(saved);
    })();
  }, []);

  // Network + outbox
  useEffect(() => {
    const unsub = NetInfo.addEventListener(state => {
      const offline = !(state.isConnected && state.isInternetReachable !== false);
      setIsOffline(offline);
      if (!offline) processOutbox().catch(() => {});
    });

    // Process outbox every 5 min while app is open
    outboxTimerRef.current = setInterval(() => {
      processOutbox().catch(() => {});
    }, 5 * 60 * 1000);

    return () => {
      unsub();
      if (outboxTimerRef.current) clearInterval(outboxTimerRef.current);
    };
  }, []);

  const handleMatchCreated = async (id: string) => {
    setCurrentMatchId(id);
    await AsyncStorage.setItem(LAST_MATCH_KEY, id);
  };

  const navTheme = theme.dark
    ? { ...DarkTheme,  colors: { ...DarkTheme.colors,  background: c.bg, card: c.card, text: c.text, border: c.cardBorder, primary: c.primary, notification: c.danger } }
    : { ...DefaultTheme, colors: { ...DefaultTheme.colors, background: c.bg, card: c.card, text: c.text, border: c.cardBorder, primary: c.primary, notification: c.danger } };

  return (
    <View style={[styles.root, { backgroundColor: c.bg }]}>
      <StatusBar
        barStyle={theme.dark ? 'light-content' : 'dark-content'}
        backgroundColor={c.headerBg}
      />
      <OfflineBanner visible={isOffline} />
      <NavigationContainer theme={navTheme}>
        <AppNavigator
          currentMatchId={currentMatchId}
          onMatchCreated={handleMatchCreated}
        />
      </NavigationContainer>
    </View>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <AppInner />
      </ThemeProvider>
    </ErrorBoundary>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
