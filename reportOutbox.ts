// src/screens/HistoryReports.tsx
import React, { useCallback, useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, Share, Alert,
  ScrollView, ActivityIndicator, useWindowDimensions,
  FlatList,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as MailComposer from 'expo-mail-composer';
import * as FileSystem from 'expo-file-system';
import { useTheme } from '../context/ThemeContext';
import { useReportData, buildHtml, buildCsv } from '../hooks/useReportData';
import { getAllMatches } from '../storage/repository';
import { addToOutbox } from '../storage/reportOutbox';
import EmailPrompt from '../components/EmailPrompt';

type MatchSummary = {
  id: string;
  home_team: string;
  away_team: string;
  match_date: string;
  competition?: string | null;
  isComplete?: boolean;
};

export default function HistoryReports() {
  const { theme } = useTheme();
  const c = theme.colors;
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const [matches, setMatches]       = useState<MatchSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [listOpen, setListOpen]     = useState(false);
  const [emailOpen, setEmailOpen]   = useState(false);
  const [sending, setSending]       = useState(false);
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');

  useEffect(() => { setOrientation(isLandscape ? 'landscape' : 'portrait'); }, [isLandscape]);

  const loadMatches = useCallback(async () => {
    try {
      const all: any[] = await getAllMatches();
      // Determine "complete" = has Q4 data (score or events)
      const enriched = await Promise.all(all.map(async (m): Promise<MatchSummary> => {
        try {
          const { getPeriodScores } = await import('../storage/repository');
          const q4 = await getPeriodScores(m.id, 4);
          const isComplete = (q4?.home ?? 0) > 0 || (q4?.away ?? 0) > 0;
          return { ...m, isComplete };
        } catch { return { ...m, isComplete: false }; }
      }));
      setMatches(enriched.sort((a, b) => b.match_date?.localeCompare(a.match_date ?? '') ?? 0));
    } catch (e: any) {
      Alert.alert('Load failed', e?.message);
    }
  }, []);

  useEffect(() => { loadMatches(); }, [loadMatches]);

  const report = useReportData(selectedId);
  const {
    cols, quarters, grouped, nameMap, scorelines, teamFlowMap, teamCustomStats,
    heading, homeName, awayName, finalHome, finalAway, matchCfg, loading,
    enabledStats, playerStyles,
  } = report;

  const html = React.useMemo(() => {
    if (!selectedId || loading || !matchCfg) return '';
    return buildHtml({
      cols, quarters, rows: report.rows, grouped, nameMap, scorelines, teamFlowMap,
      teamCustomStats, heading, homeName, awayName, finalHome, finalAway,
      enabledStats, playerStyles, isLandscape: orientation === 'landscape', matchCfg,
    });
  }, [selectedId, loading, matchCfg, orientation, quarters.join(','), finalHome, finalAway]);

  const csv = React.useMemo(() => {
    if (!selectedId || loading || !matchCfg) return '';
    return buildCsv({
      cols, quarters, grouped, nameMap, heading, homeName, awayName,
      finalHome, finalAway, scorelines, teamFlowMap, teamCustomStats, matchCfg,
    });
  }, [selectedId, loading, matchCfg, quarters.join(',')]);

  const emailFiles = async (addresses: string[]) => {
    if (!selectedId || !csv || !html) return;
    setSending(true);
    try {
      const safeTitle = heading.title.replace(/[^a-zA-Z0-9 _-]/g, '_') || 'match';
      const csvUri  = `${FileSystem.cacheDirectory}${safeTitle}.csv`;
      const htmlUri = `${FileSystem.cacheDirectory}${safeTitle}.html`;
      await FileSystem.writeAsStringAsync(csvUri, csv, { encoding: 'utf8' });
      await FileSystem.writeAsStringAsync(htmlUri, html, { encoding: 'utf8' });

      const isAvail = await MailComposer.isAvailableAsync();
      if (isAvail) {
        await MailComposer.composeAsync({
          recipients: addresses,
          subject: `Match Report – ${heading.title}`,
          body: `Please find the match report attached.\n\n${heading.sub}`,
          attachments: [csvUri, htmlUri],
        });
      } else {
        await addToOutbox({ matchId: selectedId, heading: heading.title, sub: heading.sub, addresses, csvUri, htmlUri });
        Alert.alert('Queued', 'Mail not available. Report queued for later.');
      }
    } catch (e: any) {
      Alert.alert('Send failed', e?.message ?? 'Could not send report.');
    } finally {
      setSending(false);
      setEmailOpen(false);
    }
  };

  const shareReport = async () => {
    if (!html) return;
    try {
      await Share.share({
        title: `Match Report – ${heading.title}`,
        message: `Match Report: ${heading.title}\n${heading.sub}\n\nFinal: ${homeName} ${finalHome} – ${finalAway} ${awayName}`,
      });
    } catch {}
  };

  const selectedMatch = matches.find(m => m.id === selectedId);

  return (
    <View style={[s.container, { backgroundColor: c.bg }]}>
      {/* Header */}
      <View style={[s.topBar, { borderBottomColor: c.cardBorder }]}>
        <Pressable
          style={[s.matchPicker, { backgroundColor: c.card, borderColor: c.cardBorder }]}
          onPress={() => setListOpen(true)}
        >
          {selectedMatch ? (
            <View style={{ flex: 1 }}>
              <Text style={[s.pickerTitle, { color: c.text }]} numberOfLines={1}>
                {selectedMatch.home_team} vs {selectedMatch.away_team}
              </Text>
              <Text style={[s.pickerSub, { color: c.muted }]}>
                {selectedMatch.match_date}
                {selectedMatch.competition ? ` • ${selectedMatch.competition}` : ''}
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
            <Pressable style={[s.iconBtn, { backgroundColor: c.primary }]} onPress={() => setEmailOpen(true)} disabled={sending}>
              {sending
                ? <ActivityIndicator color="#fff" size="small" />
                : <Text style={{ fontSize: 16 }}>✉️</Text>}
            </Pressable>
          </View>
        )}
      </View>

      {/* Match list modal */}
      {listOpen && (
        <View style={[s.listOverlay, { backgroundColor: c.bg }]}>
          <View style={[s.listHeader, { borderBottomColor: c.cardBorder }]}>
            <Text style={[s.listTitle, { color: c.text }]}>Select Match</Text>
            <Pressable onPress={() => setListOpen(false)}>
              <Text style={{ color: c.primary, fontWeight: '700', fontSize: 16 }}>Done</Text>
            </Pressable>
          </View>
          <FlatList
            data={matches}
            keyExtractor={m => m.id}
            ListEmptyComponent={<Text style={{ color: c.muted, textAlign: 'center', marginTop: 20 }}>No matches yet</Text>}
            renderItem={({ item: m }) => (
              <Pressable
                style={[s.listItem, { borderBottomColor: c.cardBorder }, m.id === selectedId && { backgroundColor: c.tabActive }]}
                onPress={() => { setSelectedId(m.id); setListOpen(false); }}
              >
                <View style={{ flex: 1 }}>
                  <Text style={[s.listItemTitle, { color: c.text }]}>
                    {m.home_team} vs {m.away_team}
                  </Text>
                  <Text style={[s.listItemSub, { color: c.muted }]}>
                    {m.match_date}{m.competition ? ` • ${m.competition}` : ''}
                  </Text>
                </View>
                <View style={[s.statusBadge, { backgroundColor: m.isComplete ? c.success : c.warning }]}>
                  <Text style={s.statusText}>{m.isComplete ? 'Complete' : 'In Progress'}</Text>
                </View>
              </Pressable>
            )}
          />
        </View>
      )}

      {/* Report content */}
      {!selectedId
        ? <View style={s.center}><Text style={{ color: c.muted }}>Select a match above to view its report.</Text></View>
        : loading
          ? <View style={s.center}><ActivityIndicator color={c.primary} /></View>
          : html
            ? <WebView
                source={{ html }}
                style={{ flex: 1, backgroundColor: 'transparent' }}
                scrollEnabled
                startInLoadingState
                originWhitelist={['*']}
              />
            : <View style={s.center}><Text style={{ color: c.muted }}>No data recorded for this match yet.</Text></View>}

      <EmailPrompt
        visible={emailOpen}
        onClose={() => setEmailOpen(false)}
        onSend={emailFiles}
        sending={sending}
      />
    </View>
  );
}

const s = StyleSheet.create({
  container:    { flex: 1 },
  topBar:       { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1 },
  matchPicker:  { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderRadius: 10, borderWidth: 1 },
  pickerTitle:  { fontWeight: '700', fontSize: 14 },
  pickerSub:    { fontSize: 11, marginTop: 1 },
  btnRow:       { flexDirection: 'row', gap: 8 },
  iconBtn:      { width: 40, height: 40, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  listOverlay:  { ...StyleSheet.absoluteFillObject, zIndex: 100 },
  listHeader:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomWidth: 1 },
  listTitle:    { fontSize: 18, fontWeight: '800' },
  listItem:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1 },
  listItemTitle:{ fontWeight: '700', fontSize: 15 },
  listItemSub:  { fontSize: 12, marginTop: 2 },
  statusBadge:  { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  statusText:   { color: '#000', fontWeight: '800', fontSize: 10 },
  center:       { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
