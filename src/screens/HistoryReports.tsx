// src/screens/HistoryReports.tsx
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, Share, Alert,
  ActivityIndicator, useWindowDimensions, FlatList,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as MailComposer from 'expo-mail-composer';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';
import { useReportData, buildHtml, buildCsv } from '../hooks/useReportData';
import { listAllMatchesBasic, getPeriodScores, deleteMatch } from '../storage/repository';
import { addToOutbox } from '../storage/reportOutbox';

const LAST_MATCH_KEY = 'last_match_id';

type MatchSummary = {
  id: string; home_team: string; away_team: string;
  match_date: string; competition?: string | null; isComplete?: boolean;
};

export default function HistoryReports() {
  const { theme } = useTheme();
  const c = theme.colors;
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const [matches, setMatches]         = useState<MatchSummary[]>([]);
  const [selectedId, setSelectedId]   = useState<string | null>(null);
  const [listOpen, setListOpen]       = useState(false);
  const [sending, setSending]         = useState(false);
  const [orientation, setOrientation] = useState<'portrait'|'landscape'>('portrait');

  useEffect(() => { setOrientation(isLandscape ? 'landscape' : 'portrait'); }, [isLandscape]);

  const loadMatches = useCallback(async () => {
    try {
      const all: any[] = await listAllMatchesBasic();
      const enriched = await Promise.all(all.map(async (m): Promise<MatchSummary> => {
        try {
          const q4 = await getPeriodScores(m.id, 4);
          return { ...m, isComplete: (q4?.home ?? 0) > 0 || (q4?.away ?? 0) > 0 };
        } catch { return { ...m, isComplete: false }; }
      }));
      setMatches(enriched);
    } catch (e: any) {
      Alert.alert('Load failed', e?.message ?? 'Could not load matches');
    }
  }, []);

  useEffect(() => { loadMatches(); }, [loadMatches]);

  const handleDelete = (m: MatchSummary) => {
    Alert.alert(
      'Delete match?',
      `This will permanently delete "${m.home_team} vs ${m.away_team}" on ${m.match_date} and ALL its stats. This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete', style: 'destructive',
          onPress: async () => {
            try {
              await deleteMatch(m.id);
              // If this was the current match, clear it
              const lastId = await AsyncStorage.getItem(LAST_MATCH_KEY);
              if (lastId === m.id) await AsyncStorage.removeItem(LAST_MATCH_KEY);
              if (selectedId === m.id) setSelectedId(null);
              await loadMatches();
            } catch (e: any) {
              Alert.alert('Delete failed', e?.message);
            }
          },
        },
      ]
    );
  };

  const report = useReportData(selectedId);
  const { cols, quarters, grouped, nameMap, scorelines, teamFlowMap, teamCustomStats,
          heading, homeName, awayName, finalHome, finalAway, matchCfg, loading,
          enabledStats, playerStyles } = report;

  const html = React.useMemo(() => {
    if (!selectedId || loading || !matchCfg) return '';
    return buildHtml({ cols, quarters, rows: report.rows, grouped, nameMap, scorelines,
      teamFlowMap, teamCustomStats, heading, homeName, awayName, finalHome, finalAway,
      enabledStats, playerStyles, isLandscape: orientation === 'landscape', matchCfg });
  }, [selectedId, loading, matchCfg, orientation, quarters.join(','), finalHome, finalAway]);

  const csv = React.useMemo(() => {
    if (!selectedId || loading || !matchCfg) return '';
    return buildCsv({ cols, quarters, grouped, nameMap, heading, homeName, awayName,
      finalHome, finalAway, scorelines, teamFlowMap, teamCustomStats, matchCfg });
  }, [selectedId, loading, matchCfg, quarters.join(',')]);

  const sendEmail = async () => {
    if (!selectedId || sending) return;
    setSending(true);
    try {
      const safeTitle = (heading.title || 'match').replace(/[^a-zA-Z0-9 _-]/g, '_');
      const htmlUri = `${FileSystem.cacheDirectory}${safeTitle}.html`;
      const csvUri  = `${FileSystem.cacheDirectory}${safeTitle}.csv`;
      await FileSystem.writeAsStringAsync(htmlUri, html || '<p>No data</p>', { encoding: 'utf8' });
      await FileSystem.writeAsStringAsync(csvUri,  csv  || '',              { encoding: 'utf8' });
      const isAvail = await MailComposer.isAvailableAsync();
      if (isAvail) {
        await MailComposer.composeAsync({
          subject: `Match Report – ${heading.title}`,
          body: `Please find the match report attached.\n\n${heading.sub || ''}`,
          attachments: [htmlUri, csvUri],
        });
      } else {
        await addToOutbox({ matchId: selectedId!, heading: heading.title,
          sub: heading.sub || '', addresses: [], csvUri, htmlUri });
        Alert.alert('Saved to outbox', 'No mail app available. Report queued and will send when mail is available.');
      }
    } catch (e: any) {
      if (!String(e?.message || '').toLowerCase().includes('cancel'))
        Alert.alert('Send failed', e?.message ?? 'Could not send report.');
    } finally { setSending(false); }
  };

  const shareReport = async () => {
    try {
      await Share.share({ title: `Match Report – ${heading.title}`,
        message: `${heading.title}\n${heading.sub || ''}\nFinal: ${homeName} ${finalHome} – ${finalAway} ${awayName}` });
    } catch {}
  };

  const selectedMatch = matches.find(m => m.id === selectedId);

  // ── Match list ────────────────────────────────────────────────────────────────
  if (listOpen) return (
    <View style={[{ flex: 1 }, { backgroundColor: c.bg }]}>
      <View style={[s.listHeader, { borderBottomColor: c.cardBorder, backgroundColor: c.card }]}>
        <Text style={[s.listTitle, { color: c.text }]}>Select Match</Text>
        <Pressable onPress={() => setListOpen(false)}>
          <Text style={{ color: c.primary, fontWeight: '700', fontSize: 16 }}>Done</Text>
        </Pressable>
      </View>

      {/* Legend for status badges */}
      <View style={[s.legendBar, { backgroundColor: c.scoreBg, borderBottomColor: c.cardBorder }]}>
        <View style={[s.badge, { backgroundColor: c.success }]}><Text style={s.badgeText}>Complete</Text></View>
        <Text style={[s.legendText, { color: c.muted }]}>= Q4 score recorded</Text>
        <View style={[s.badge, { backgroundColor: c.warning, marginLeft: 12 }]}><Text style={s.badgeText}>In Progress</Text></View>
        <Text style={[s.legendText, { color: c.muted }]}>= no Q4 score yet</Text>
      </View>

      <FlatList
        data={matches}
        keyExtractor={m => m.id}
        ListEmptyComponent={
          <Text style={{ color: c.muted, textAlign: 'center', marginTop: 30 }}>No matches recorded yet</Text>
        }
        renderItem={({ item: m }) => (
          <Pressable
            style={[s.listItem, { borderBottomColor: c.cardBorder },
              m.id === selectedId && { backgroundColor: c.tabActive }]}
            onPress={() => { setSelectedId(m.id); setListOpen(false); }}
          >
            <View style={{ flex: 1 }}>
              <Text style={[s.listItemTitle, { color: c.text }]}>{m.home_team} vs {m.away_team}</Text>
              <Text style={[s.listItemSub, { color: c.muted }]}>
                {m.match_date}{m.competition ? ` · ${m.competition}` : ''}
              </Text>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={[s.badge, { backgroundColor: m.isComplete ? c.success : c.warning }]}>
                <Text style={s.badgeText}>{m.isComplete ? 'Complete' : 'In Progress'}</Text>
              </View>
              {/* Delete button */}
              <Pressable
                style={[s.deleteBtn, { backgroundColor: c.danger }]}
                onPress={() => handleDelete(m)}
              >
                <Text style={{ color: '#fff', fontWeight: '900', fontSize: 14 }}>🗑</Text>
              </Pressable>
            </View>
          </Pressable>
        )}
      />
    </View>
  );

  // ── Main view ─────────────────────────────────────────────────────────────────
  return (
    <View style={[s.container, { backgroundColor: c.bg }]}>
      <View style={[s.topBar, { borderBottomColor: c.cardBorder }]}>
        <Pressable
          style={[s.matchPicker, { backgroundColor: c.card, borderColor: c.cardBorder }]}
          onPress={() => setListOpen(true)}
        >
          {selectedMatch ? (
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[s.pickerTitle, { color: c.text }]} numberOfLines={1}>
                  {selectedMatch.home_team} vs {selectedMatch.away_team}
                </Text>
                <View style={[s.badge, { backgroundColor: selectedMatch.isComplete ? c.success : c.warning }]}>
                  <Text style={s.badgeText}>{selectedMatch.isComplete ? 'Complete' : 'In Progress'}</Text>
                </View>
              </View>
              <Text style={[s.pickerSub, { color: c.muted }]}>
                {selectedMatch.match_date}{selectedMatch.competition ? ` · ${selectedMatch.competition}` : ''}
              </Text>
            </View>
          ) : (
            <Text style={[s.pickerTitle, { color: c.muted }]}>Select a match…</Text>
          )}
          <Text style={{ color: c.primary, fontWeight: '700' }}>▾</Text>
        </Pressable>

        {selectedId && (
          <View style={s.btnRow}>
            <Pressable style={[s.iconBtn, { backgroundColor: c.scoreBg, borderColor: c.cardBorder }]} onPress={shareReport}>
              <Text style={{ fontSize: 16 }}>📤</Text>
            </Pressable>
            <Pressable style={[s.iconBtn, { backgroundColor: c.primary, opacity: sending ? 0.6 : 1 }]}
              onPress={sendEmail} disabled={sending}>
              {sending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ fontSize: 16 }}>✉️</Text>}
            </Pressable>
          </View>
        )}
      </View>

      {!selectedId
        ? <View style={s.center}>
            <Text style={{ color: c.muted, fontSize: 15, textAlign: 'center', paddingHorizontal: 32 }}>
              Tap the selector above to choose a match.
            </Text>
          </View>
        : loading
          ? <View style={s.center}><ActivityIndicator color={c.primary} size="large" /></View>
          : html
            ? <WebView source={{ html }} style={{ flex: 1 }} scrollEnabled startInLoadingState originWhitelist={['*']} />
            : <View style={s.center}><Text style={{ color: c.muted }}>No data recorded for this match yet.</Text></View>}
    </View>
  );
}

const s = StyleSheet.create({
  container:     { flex: 1 },
  topBar:        { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  matchPicker:   { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  pickerTitle:   { fontWeight: '700', fontSize: 14 },
  pickerSub:     { fontSize: 11, marginTop: 1 },
  btnRow:        { flexDirection: 'row', gap: 8 },
  iconBtn:       { width: 40, height: 40, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  listHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1 },
  listTitle:     { fontSize: 18, fontWeight: '800' },
  legendBar:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 8, borderBottomWidth: 1, gap: 6 },
  legendText:    { fontSize: 11, fontWeight: '600' },
  listItem:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1 },
  listItemTitle: { fontWeight: '700', fontSize: 15 },
  listItemSub:   { fontSize: 12, marginTop: 2 },
  badge:         { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  badgeText:     { color: '#000', fontWeight: '800', fontSize: 10 },
  deleteBtn:     { width: 34, height: 34, borderRadius: 8, alignItems: 'center', justifyContent: 'center' },
  center:        { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
