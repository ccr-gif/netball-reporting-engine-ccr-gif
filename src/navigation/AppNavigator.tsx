// src/navigation/AppNavigator.tsx
import React, { useRef } from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useTheme } from '../context/ThemeContext';

import MatchSetup     from '../screens/MatchSetup';
import Players        from '../screens/Players';
import MatchCenter    from '../screens/MatchCenter';
import Reports        from '../screens/Reports';
import HistoryReports from '../screens/HistoryReports';
import Analytics      from '../screens/Analytics';
import Settings       from '../screens/Settings';

const Tab = createBottomTabNavigator();

const ICONS: Record<string, string> = {
  Setup:     '⚙️',
  Players:   '👥',
  Match:     '🏐',
  Report:    '📊',
  History:   '📁',
  Analytics: '🔍',
  Settings:  '🌙',
};

function TabIcon({ name, focused }: { name: string; focused: boolean }) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: focused ? 22 : 18 }}>{ICONS[name] ?? '•'}</Text>
    </View>
  );
}

// Wrapper so MatchSetup can navigate to Match tab after creation
function MatchSetupWrapper({ onMatchCreated }: { onMatchCreated: (id: string) => void }) {
  const navigation = useNavigation<any>();
  return (
    <MatchSetup
      onCreated={(id: string) => {
        onMatchCreated(id);
        // FIX Bug 4: auto-navigate to Match tab after creating a match
        navigation.navigate('Match');
      }}
    />
  );
}

export default function AppNavigator({
  currentMatchId,
  onMatchCreated,
}: {
  currentMatchId: string | null;
  onMatchCreated: (id: string) => void;
}) {
  const { theme } = useTheme();
  const c = theme.colors;

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerShown: true,
        headerStyle:      { backgroundColor: c.headerBg },
        headerTintColor:  c.text,
        headerTitleStyle: { fontWeight: '800' },
        tabBarStyle:      { backgroundColor: c.navBg, borderTopColor: c.navBorder },
        tabBarActiveTintColor:   c.primary,
        tabBarInactiveTintColor: c.muted,
        tabBarIcon: ({ focused, color }) => <TabIcon name={route.name} focused={focused} />,
        tabBarLabelStyle: { fontWeight: '700', fontSize: 11 },
      })}
    >
      <Tab.Screen name="Setup" options={{ title: 'Match Setup', tabBarLabel: 'Setup' }}>
        {() => <MatchSetupWrapper onMatchCreated={onMatchCreated} />}
      </Tab.Screen>

      <Tab.Screen name="Players" options={{ title: 'Players', tabBarLabel: 'Players' }}>
        {() => <Players />}
      </Tab.Screen>

      <Tab.Screen name="Match" options={{ title: 'Match Center', tabBarLabel: 'Match' }}>
        {() => <MatchCenter matchId={currentMatchId} />}
      </Tab.Screen>

      <Tab.Screen name="Report" options={{ title: 'Live Report', tabBarLabel: 'Report' }}>
        {() => <Reports />}
      </Tab.Screen>

      <Tab.Screen name="History" options={{ title: 'Report History', tabBarLabel: 'History' }}>
        {() => <HistoryReports />}
      </Tab.Screen>

      <Tab.Screen name="Analytics" options={{ title: 'Analytics', tabBarLabel: 'Analytics' }}>
        {() => <Analytics />}
      </Tab.Screen>

      <Tab.Screen name="Settings" options={{ title: 'Settings', tabBarLabel: 'Settings' }}>
        {() => <Settings />}
      </Tab.Screen>
    </Tab.Navigator>
  );
}
