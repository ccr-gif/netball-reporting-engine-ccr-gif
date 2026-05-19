// src/screens/Reports.tsx
import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, Share, Alert,
  ActivityIndicator, useWindowDimensions,
} from 'react-native';
import { WebView } from 'react-native-webview';
import * as MailComposer from 'expo-mail-composer';
import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';
import { useReportData, buildHtml, buildCsv } from '../hooks/useReportData';
import { addToOutbox } from '../storage/reportOutbox';

const LAST_MATCH_KEY = 'last_match_id';

export default function Reports() {
  const { theme } = useTheme();
  const c = theme.colors;
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const [matchId, setMatchId]         = useState<string | null>(null);
  const [sending, setSending]         = useState(false);
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>('portrait');

  useEffect(() => { setOrientation(isLandscape ? 'landscape' : 'portrait'); }, [isLandscape]);
  useEffect(() => { AsyncStorage.getItem(LAST_MATCH_KEY).then(id => { if (id) setMatchId(id); }); }, []);

  const report = useReportData(matchId);
  const { cols, quarters, grouped, nameMap, scorelines, teamFlowMap, teamCustomStats,
          heading, homeName, awayName, finalHome, finalAway, matchCfg, loading,
          enabledStats, playerStyles } = report;

  const html = React.useMemo(() => {
    if (!matchId || loading || !matchCfg) return '';
    return buildHtml({ cols, quarters, rows: report.rows, grouped, nameMap, scorelines,
      teamFlowMap, teamCustomStats, heading, homeName, awayName, finalHome, finalAway,
      enabledStats, playerStyles, isLandscape: orientation === 'landscape', matchCfg });
  }, [matchId, loading, matchCfg, orientation, quarters.join(','), finalHome, finalAway]);

  const csv = React.useMemo(() => {
    if (!matchId || loading || !matchCfg) return '';
    return buildCsv({ cols, quarters, grouped, nameMap, heading, homeName, awayName,
      finalHome, finalAway, scorelines, teamFlowMap, teamCustomStats, matchCfg });
  }, [matchId, loading, matchCfg, quarters.join(',')]);

  const sendEmail = async () => {
    if (!matchId || sending) return;
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
        await addToOutbox({ matchId, heading: heading.title, sub: heading.sub || '',
          addresses: [], csvUri, htmlUri });
        Alert.alert('Saved to outbox',
          'No mail app available. Report queued and will send when mail is available.');
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

  if (!matchId) return (
    <View style={[s.empty, { backgroundColor: c.bg }]}>
      <Text style={{ color: c.muted, fontSize: 15 }}>No match yet. Create one in Setup first.</Text>
    </View>
  );

  return (
    <View style={[s.container, { backgroundColor: c.bg }]}>
      <View style={[s.topBar, { borderBottomColor: c.cardBorder }]}>
        <Text style={[s.title, { color: c.text }]} numberOfLines={1}>{heading.title || 'Live Report'}</Text>
        <View style={s.btnRow}>
          <Pressable style={[s.iconBtn, { backgroundColor: c.scoreBg, borderColor: c.cardBorder }]} onPress={shareReport}>
            <Text style={{ fontSize: 16 }}>📤</Text>
          </Pressable>
          <Pressable style={[s.iconBtn, { backgroundColor: c.primary, opacity: sending ? 0.6 : 1 }]}
            onPress={sendEmail} disabled={sending || loading}>
            {sending ? <ActivityIndicator color="#fff" size="small" /> : <Text style={{ fontSize: 16 }}>✉️</Text>}
          </Pressable>
        </View>
      </View>

      {loading
        ? <View style={s.center}><ActivityIndicator color={c.primary} size="large" /></View>
        : html
          ? <WebView source={{ html }} style={{ flex: 1 }} scrollEnabled startInLoadingState originWhitelist={['*']} />
          : <View style={s.center}><Text style={{ color: c.muted }}>No stats recorded yet.</Text></View>}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  topBar:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1 },
  title:     { fontSize: 17, fontWeight: '800', flex: 1, marginRight: 8 },
  btnRow:    { flexDirection: 'row', gap: 8 },
  iconBtn:   { width: 40, height: 40, borderRadius: 10, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  empty:     { flex: 1, alignItems: 'center', justifyContent: 'center' },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center' },
});
