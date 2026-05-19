// src/screens/Settings.tsx
import React from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, Switch,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';

type ModeOption = { label: string; value: 'system' | 'light' | 'dark'; emoji: string };

const MODES: ModeOption[] = [
  { label: 'Follow device', value: 'system', emoji: '📱' },
  { label: 'Light',         value: 'light',  emoji: '☀️' },
  { label: 'Dark',          value: 'dark',   emoji: '🌙' },
];

export default function Settings() {
  const { theme, mode, setMode } = useTheme();
  const c = theme.colors;

  return (
    <ScrollView style={[s.container, { backgroundColor: c.bg }]} contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <Text style={[s.h1, { color: c.text }]}>Settings</Text>

      {/* Appearance */}
      <Text style={[s.section, { color: c.muted }]}>APPEARANCE</Text>
      <View style={[s.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
        <Text style={[s.label, { color: c.textSecondary }]}>Theme</Text>
        <View style={s.modeRow}>
          {MODES.map(m => {
            const active = mode === m.value;
            return (
              <Pressable
                key={m.value}
                style={[s.modePill, { borderColor: c.cardBorder, backgroundColor: active ? c.primary : c.scoreBg }]}
                onPress={() => setMode(m.value)}
              >
                <Text style={{ fontSize: 16 }}>{m.emoji}</Text>
                <Text style={[s.modeLabel, { color: active ? '#fff' : c.text }]}>{m.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      {/* About */}
      <Text style={[s.section, { color: c.muted }]}>ABOUT</Text>
      <View style={[s.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
        <View style={s.row}>
          <Text style={[s.rowLabel, { color: c.text }]}>App version</Text>
          <Text style={[s.rowValue, { color: c.muted }]}>2.0.0</Text>
        </View>
        <View style={[s.divider, { backgroundColor: c.cardBorder }]} />
        <View style={s.row}>
          <Text style={[s.rowLabel, { color: c.text }]}>Built for</Text>
          <Text style={[s.rowValue, { color: c.muted }]}>Netball coaching</Text>
        </View>
      </View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  h1:       { fontSize: 24, fontWeight: '900', marginBottom: 16 },
  section:  { fontSize: 11, fontWeight: '800', letterSpacing: 1, marginTop: 16, marginBottom: 8 },
  card:     { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 4 },
  label:    { fontWeight: '700', marginBottom: 10 },
  modeRow:  { flexDirection: 'row', gap: 8 },
  modePill: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 12, borderWidth: 1, gap: 4 },
  modeLabel:{ fontWeight: '700', fontSize: 12 },
  row:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  rowLabel: { fontWeight: '600', fontSize: 15 },
  rowValue: { fontSize: 14 },
  divider:  { height: 1, marginVertical: 2 },
});
