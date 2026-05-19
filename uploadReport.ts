// src/screens/MatchSetup.tsx
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, TextInput, Pressable, Platform,
  Alert, KeyboardAvoidingView, ScrollView, ActivityIndicator,
} from 'react-native';
import DateTimePicker, { DateTimePickerEvent } from '@react-native-community/datetimepicker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';
import { initDb } from '../storage/db';
import { cryptoId, createMatch, getLastMatchSummary, getLineup, saveLineup } from '../storage/repository';
import {
  makeDefaultConfig, saveMatchConfig, getMatchConfig,
  normalizeMatchConfig, getDefaultConfig, saveDefaultConfig,
  type MatchTrackConfig,
} from '../storage/matchConfig';
import { getStatLibrary } from '../storage/customStats';
import StatLibraryManager from '../components/StatLibraryManager';
import MatchStatPicker from '../components/MatchStatPicker';

const LAST_MATCH_ID_KEY = 'last_match_id';
const DEFAULT_PRETICK = ['goal', 'miss'];
const FALLBACK_PLAYER = ['goal', 'miss', 'assist', 'rebound_off', 'cpr'];

function formatDDMMYYYY(d: Date) {
  return `${String(d.getDate()).padStart(2,'0')}-${String(d.getMonth()+1).padStart(2,'0')}-${d.getFullYear()}`;
}
function stripTime(d: Date) { return new Date(d.getFullYear(), d.getMonth(), d.getDate()); }
function parseDDMMYYYY(s?: string | null) {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(s?.trim() ?? '');
  return m ? new Date(Number(m[3]), Number(m[2])-1, Number(m[1])) : null;
}
function parseYYYYMMDD(s?: string | null) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s?.trim() ?? '');
  return m ? new Date(Number(m[1]), Number(m[2])-1, Number(m[3])) : null;
}

export default function MatchSetup({ onCreated }: { onCreated?: (matchId: string) => void }) {
  const { theme } = useTheme();
  const c = theme.colors;

  const today = useMemo(() => stripTime(new Date()), []);
  const [home, setHome]           = useState('');
  const [away, setAway]           = useState('');
  const [venue, setVenue]         = useState('');
  const [competition, setCompetition] = useState('');
  const [notes, setNotes]         = useState('');
  const [date, setDate]           = useState<Date>(today);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [lastMatch, setLastMatch] = useState<any>(null);
  const [trackingCfg, setTrackingCfg] = useState<MatchTrackConfig>(makeDefaultConfig());
  const [libBump, setLibBump]     = useState(0);
  const [saving, setSaving]       = useState(false);

  const onLibraryChanged = useCallback(() => setLibBump(b => b+1), []);

  // Load last match + default config on mount
  useEffect(() => {
    (async () => {
      try {
        await initDb();
        const [last, defaultCfg] = await Promise.all([
          getLastMatchSummary(),
          getDefaultConfig(),
        ]);
        if (last) {
          setLastMatch(last);
          if (last.venue) setVenue(String(last.venue));
          if (last.competition) setCompetition(String(last.competition));
        }
        // Apply saved default config if it has stats selected
        if ((defaultCfg.player?.length ?? 0) > 0 || (defaultCfg.team?.length ?? 0) > 0) {
          setTrackingCfg(normalizeMatchConfig(defaultCfg));
        }
      } catch {}
    })();
  }, []);

  // Auto-preselect Goal + Miss if empty
  useEffect(() => {
    if ((trackingCfg.player?.length ?? 0) === 0) {
      setTrackingCfg(cur => normalizeMatchConfig({ ...cur, player: DEFAULT_PRETICK }));
    }
  }, [trackingCfg.player?.length]);

  const formattedDate = useMemo(() => formatDDMMYYYY(date), [date]);

  const onChangeDate = (event: DateTimePickerEvent, selected?: Date) => {
    if (Platform.OS === 'android') {
      if (event.type === 'set' && selected) setDate(stripTime(selected));
      setPickerOpen(false);
    } else {
      if (selected) setDate(stripTime(selected));
    }
  };

  const usePreviousAll = async () => {
    if (!lastMatch) { Alert.alert('No previous match', 'No previous match to copy from.'); return; }
    setHome(String(lastMatch.home_team ?? ''));
    setAway(String(lastMatch.away_team ?? ''));
    setCompetition(String(lastMatch.competition ?? ''));
    setVenue(String(lastMatch.venue ?? ''));
    const parsed = parseDDMMYYYY(lastMatch.match_date) ?? parseYYYYMMDD(lastMatch.match_date);
    setDate(parsed ?? today);

    try {
      const lastId = await AsyncStorage.getItem(LAST_MATCH_ID_KEY);
      if (!lastId) { Alert.alert('Could not load', 'Last match ID missing.'); return; }
      const prevCfg = await getMatchConfig(String(lastId));
      if (prevCfg) {
        const cleaned = normalizeMatchConfig(prevCfg);
        setTrackingCfg(cleaned);
        setLibBump(b => b+1);
        if (prevCfg.notes) setNotes(prevCfg.notes);
      }
    } catch (err: any) {
      Alert.alert('Could not load', err?.message ?? 'Failed to apply previous settings.');
    }
  };

  const reset = () => {
    setHome(''); setAway(''); setCompetition(''); setVenue(''); setNotes('');
    setDate(today); setTrackingCfg(makeDefaultConfig());
  };

  const save = async () => {
    if (saving) return;
    try {
      setSaving(true);
      if (pickerOpen) { setPickerOpen(false); await new Promise(r => setTimeout(r, 50)); }
      await initDb();

      const homeTeam = home.trim(), awayTeam = away.trim();
      if (!homeTeam || !awayTeam) { Alert.alert('Missing info', 'Please enter BOTH team names.'); return; }

      let cfgToSave = normalizeMatchConfig({ ...trackingCfg, notes: notes.trim() });
      if ((cfgToSave.player?.length ?? 0) === 0 && (cfgToSave.team?.length ?? 0) === 0) {
        cfgToSave = { ...cfgToSave, player: FALLBACK_PLAYER, team: [] };
        setTrackingCfg(cfgToSave);
      }

      const id = cryptoId();
      await createMatch({ id, home_team: homeTeam, away_team: awayTeam, match_date: formattedDate, competition: competition.trim() || null, venue: venue.trim() || null });

      // Copy previous Q1 lineup
      const prevId = await AsyncStorage.getItem(LAST_MATCH_ID_KEY);
      if (prevId) {
        const prevQ1 = await getLineup(prevId, 'Q1');
        if (Object.values(prevQ1 || {}).some(Boolean)) {
          await saveLineup(id, 'Q1', prevQ1, { replace: true });
        }
      }

      await saveMatchConfig(String(id), cfgToSave);
      // ✅ Auto-save as new default
      await saveDefaultConfig(cfgToSave);
      await AsyncStorage.setItem(LAST_MATCH_ID_KEY, String(id));

      Alert.alert(
        'Match created',
        `${homeTeam} vs ${awayTeam} on ${formattedDate}`,
        [{ text: 'OK', onPress: () => onCreated?.(id) }],
        { cancelable: false }
      );
    } catch (e: any) {
      Alert.alert('Save failed', e?.message ?? 'Could not save match.');
    } finally {
      setSaving(false);
    }
  };

  const inp = { borderWidth: 1, borderColor: c.inputBorder, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: c.text, backgroundColor: c.inputBg };

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: c.bg }} behavior={Platform.select({ ios: 'padding', android: undefined })} keyboardVerticalOffset={80}>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16, paddingBottom: 48 }} keyboardShouldPersistTaps="handled">

        <View style={s.headRow}>
          <Text style={[s.h1, { color: c.text }]}>Match Setup</Text>
          <Pressable style={[s.prevBtn, !lastMatch && { opacity: 0.4 }, { backgroundColor: c.primary }]} onPress={usePreviousAll} disabled={!lastMatch}>
            <Text style={{ fontWeight: '900', color: '#fff' }}>⟲ Use previous</Text>
          </Pressable>
        </View>

        <Text style={[s.label, { color: c.textSecondary }]}>Home team</Text>
        <TextInput value={home} onChangeText={setHome} placeholder="Enter home team" placeholderTextColor={c.muted} style={inp} autoCapitalize="words" returnKeyType="next" />

        <Text style={[s.label, { color: c.textSecondary }]}>Away team</Text>
        <TextInput value={away} onChangeText={setAway} placeholder="Enter away team" placeholderTextColor={c.muted} style={inp} autoCapitalize="words" returnKeyType="next" />

        <Text style={[s.label, { color: c.textSecondary }]}>Match date</Text>
        <Pressable style={[inp, { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }]} onPress={() => setPickerOpen(true)}>
          <Text style={{ color: c.text, fontWeight: '700' }}>{formattedDate}</Text>
          <Text>📅</Text>
        </Pressable>

        {pickerOpen && (Platform.OS === 'ios' ? (
          <View style={[s.iosPickerWrap, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
            <DateTimePicker mode="date" value={date} onChange={onChangeDate} display="inline" />
            <Pressable style={[s.btn, { backgroundColor: c.primary, marginTop: 8 }]} onPress={() => setPickerOpen(false)}>
              <Text style={{ color: '#fff', fontWeight: '900' }}>Done</Text>
            </Pressable>
          </View>
        ) : (
          <DateTimePicker mode="date" value={date} onChange={onChangeDate} display="calendar" />
        ))}

        <Text style={[s.label, { color: c.textSecondary }]}>Competition (optional)</Text>
        <TextInput value={competition} onChangeText={setCompetition} placeholder="e.g. Premier Grade" placeholderTextColor={c.muted} style={inp} autoCapitalize="words" returnKeyType="next" />

        <Text style={[s.label, { color: c.textSecondary }]}>Venue (optional)</Text>
        <TextInput value={venue} onChangeText={setVenue} placeholder="e.g. Main Court" placeholderTextColor={c.muted} style={inp} autoCapitalize="words" returnKeyType="next" />

        <Text style={[s.label, { color: c.textSecondary }]}>Game plan / notes (optional)</Text>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder="e.g. Focus on CP defence, press high..."
          placeholderTextColor={c.muted}
          style={[inp, { minHeight: 70, textAlignVertical: 'top' }]}
          multiline
          numberOfLines={3}
        />

        <View style={{ height: 12 }} />
        <StatLibraryManager onLibraryChanged={onLibraryChanged} />
        <View style={{ height: 8 }} />
        <MatchStatPicker
          value={trackingCfg as any}
          onChange={next => setTrackingCfg(normalizeMatchConfig(next))}
          refreshKey={libBump}
        />

        <View style={s.actionRow}>
          <Pressable style={[s.btn, { backgroundColor: c.card, borderWidth: 1, borderColor: c.cardBorder }]} onPress={reset}>
            <Text style={[{ fontWeight: '900' }, { color: c.text }]}>Reset</Text>
          </Pressable>
          <Pressable style={[s.btn, { backgroundColor: c.primary, opacity: saving ? 0.6 : 1 }]} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '900' }}>Create Match</Text>}
          </Pressable>
        </View>
        <View style={{ height: 16 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  headRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  h1: { fontSize: 22, fontWeight: '800' },
  prevBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 10 },
  label: { fontWeight: '700', marginTop: 10, marginBottom: 4 },
  iosPickerWrap: { marginTop: 8, padding: 10, borderWidth: 1, borderRadius: 10 },
  actionRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 10, marginTop: 16 },
  btn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
});
