// src/screens/Analytics.tsx
import React, { useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView, Pressable,
  ActivityIndicator, Dimensions, FlatList, Alert,
} from 'react-native';
import { useTheme } from '../context/ThemeContext';
import { useAnalytics, PosPerf, PlayerTrend, QuarterMomentum, PairCombination, CPTurnoverMatch } from '../hooks/useAnalytics';
import {
  buildInsightsHtml, buildHeatmapHtml, buildTrendsHtml,
  buildMomentumHtml, buildCombinationsHtml, buildCPTOHtml,
  sendAnalyticsEmail,
} from '../hooks/useAnalyticsEmail';
import EmailPrompt from '../components/EmailPrompt';

const POSITIONS = ['GS','GA','WA','C','WD','GD','GK'];
const TABS = ['🔍 Insights','📍 Pos×Player','📈 Trends','⚡ Momentum','🤝 Combinations','🔄 CP & TO'] as const;
type Tab = typeof TABS[number];

const W = Dimensions.get('window').width;

// ── Helpers ──────────────────────────────────────────────────────────────────
function lerp(t: number, a: string, b: string) {
  // t: 0-1, returns hex colour between a and b
  const ah = parseInt(a.slice(1), 16), bh = parseInt(b.slice(1), 16);
  const ar = (ah >> 16) & 0xff, ag = (ah >> 8) & 0xff, ab = ah & 0xff;
  const br = (bh >> 16) & 0xff, bg = (bh >> 8) & 0xff, bb = bh & 0xff;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl2 = Math.round(ab + (bb - ab) * t);
  return `#${r.toString(16).padStart(2,'0')}${g.toString(16).padStart(2,'0')}${bl2.toString(16).padStart(2,'0')}`;
}

function scoreColor(score: number, dark: boolean) {
  if (score === 0) return dark ? '#1e2d42' : '#f1f5f9';
  if (score >= 70) return lerp((score - 70) / 30, '#16a34a', '#15803d');
  if (score >= 50) return lerp((score - 50) / 20, '#ca8a04', '#16a34a');
  return lerp(score / 50, '#dc2626', '#ca8a04');
}

function MiniBar({ value, max, color, label }: { value: number; max: number; color: string; label?: string }) {
  const w = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 4;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', marginVertical: 2 }}>
      {label && <Text style={{ width: 36, fontSize: 11, color: '#64748b', fontWeight: '700' }}>{label}</Text>}
      <View style={{ flex: 1, height: 12, backgroundColor: 'rgba(100,116,139,0.18)', borderRadius: 6, overflow: 'hidden' }}>
        <View style={{ width: `${w}%`, height: 12, backgroundColor: color, borderRadius: 6 }} />
      </View>
      <Text style={{ width: 32, textAlign: 'right', fontSize: 11, color: '#64748b', fontWeight: '700' }}>{value}</Text>
    </View>
  );
}

function StatChip({ label, value, color }: { label: string; value: string | number; color: string }) {
  return (
    <View style={{ backgroundColor: `${color}22`, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, alignItems: 'center', minWidth: 64 }}>
      <Text style={{ fontSize: 18, fontWeight: '900', color }}>{value}</Text>
      <Text style={{ fontSize: 10, color: '#64748b', fontWeight: '700', marginTop: 1 }}>{label}</Text>
    </View>
  );
}

// ── Section header ────────────────────────────────────────────────────────────
function SectionHeader({ title, sub, c }: { title: string; sub?: string; c: any }) {
  return (
    <View style={{ marginBottom: 10, marginTop: 4 }}>
      <Text style={{ fontSize: 17, fontWeight: '900', color: c.text }}>{title}</Text>
      {sub && <Text style={{ fontSize: 12, color: c.muted, marginTop: 2 }}>{sub}</Text>}
    </View>
  );
}

// ── Insight card ──────────────────────────────────────────────────────────────
function InsightCard({ insight, c }: { insight: any; c: any }) {
  const bg = insight.type === 'positive' ? '#16a34a22' : insight.type === 'warning' ? '#ca8a0422' : `${c.primary}22`;
  const border = insight.type === 'positive' ? '#16a34a' : insight.type === 'warning' ? '#ca8a04' : c.primary;
  return (
    <View style={{ backgroundColor: bg, borderLeftWidth: 3, borderLeftColor: border, borderRadius: 10, padding: 12, marginBottom: 8 }}>
      <Text style={{ fontSize: 14, color: c.text, fontWeight: '600', lineHeight: 20 }}>
        <Text style={{ fontSize: 18 }}>{insight.emoji} </Text>{insight.text}
      </Text>
    </View>
  );
}

// ── Heatmap cell ──────────────────────────────────────────────────────────────
function HeatCell({ perf, dark, onPress }: { perf: PosPerf | null; dark: boolean; onPress: () => void }) {
  if (!perf) return <View style={[hs.cell, { backgroundColor: dark ? '#0f172a' : '#f8fafc' }]} />;
  const bg = scoreColor(perf.score, dark);
  const textCol = perf.score > 55 ? '#fff' : perf.score > 30 ? '#000' : '#fff';
  return (
    <Pressable style={[hs.cell, { backgroundColor: bg }]} onPress={onPress}>
      <Text style={{ fontSize: 13, fontWeight: '900', color: textCol }}>{perf.score}</Text>
      {perf.attempts > 0 && <Text style={{ fontSize: 9, color: textCol, opacity: 0.85 }}>{perf.goalPct}%</Text>}
      {perf.quarters > 0 && <Text style={{ fontSize: 9, color: textCol, opacity: 0.7 }}>×{perf.quarters}</Text>}
    </Pressable>
  );
}
const hs = StyleSheet.create({ cell: { flex: 1, margin: 2, borderRadius: 8, alignItems: 'center', justifyContent: 'center', minHeight: 52, padding: 2 } });

// ── Sparkline (pure RN, no deps) ──────────────────────────────────────────────
function Sparkline({ data, color, width = 120, height = 36 }: { data: number[]; color: string; width?: number; height?: number }) {
  if (data.length < 2) return <View style={{ width, height }} />;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => ({
    x: (i / (data.length - 1)) * width,
    y: height - ((v - min) / range) * height,
  }));
  // Render as sequence of thin bars (works without SVG)
  return (
    <View style={{ width, height, flexDirection: 'row', alignItems: 'flex-end', gap: 2 }}>
      {data.map((v, i) => {
        const h = max > 0 ? Math.max(3, Math.round(((v - min) / range) * height)) : 3;
        return <View key={i} style={{ flex: 1, height: h, backgroundColor: color, borderRadius: 2, opacity: 0.85 }} />;
      })}
    </View>
  );
}

// ── Quarter diff bar ──────────────────────────────────────────────────────────
function DiffBar({ value, maxAbs, c }: { value: number; maxAbs: number; c: any }) {
  const pct = maxAbs > 0 ? Math.abs(value) / maxAbs : 0;
  const barW = Math.max(4, Math.round(pct * 60));
  const color = value >= 0 ? c.success : c.danger;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
      {value < 0
        ? <><View style={{ width: barW, height: 14, backgroundColor: color, borderRadius: 3 }} /><Text style={{ fontSize: 12, fontWeight: '800', color }}>{value}</Text></>
        : <><Text style={{ fontSize: 12, fontWeight: '800', color }}>+{value}</Text><View style={{ width: barW, height: 14, backgroundColor: color, borderRadius: 3 }} /></>}
    </View>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function Analytics() {
  const { theme } = useTheme();
  const c = theme.colors;
  const [activeTab, setActiveTab]         = useState<Tab>(TABS[0]);
  const [scopeAll, setScopeAll]           = useState(true);
  const [singleMatchId, setSingleMatchId] = useState<string | null>(null);
  const [matchPickerOpen, setMatchPickerOpen] = useState(false);
  const [detailPopup, setDetailPopup]     = useState<PosPerf | null>(null);
  const [trendPlayer, setTrendPlayer]     = useState<string | null>(null);
  const [trendStat, setTrendStat]         = useState<'goalPct' | 'penalties' | 'feeds' | 'interceptions'>('goalPct');
  const [emailOpen, setEmailOpen]         = useState(false);
  const [sending, setSending]             = useState(false);

  const filterId = scopeAll ? 'all' : (singleMatchId ?? 'all');
  const { loading, players, matches, posPerf, playerTrends, momentum, pairs, cpTurnover, insights } = useAnalytics(filterId);

  const playerById = useMemo(() => Object.fromEntries(players.map(p => [p.id, p])), [players]);

  const scopeLabel = scopeAll
    ? `Full season · ${matches.length} match${matches.length !== 1 ? 'es' : ''}`
    : (() => { const m = matches.find(mx => mx.id === singleMatchId); return m ? `${m.home_team} vs ${m.away_team} · ${m.match_date}` : 'Single match'; })();

  const handleEmail = async (addresses: string[]) => {
    setSending(true);
    try {
      const tabHtmlMap: Record<typeof TABS[number], () => string> = {
        '🔍 Insights':      () => buildInsightsHtml({ insights, posPerf, momentum, cpTurnover, matches, scope: scopeLabel }),
        '📍 Pos×Player':    () => buildHeatmapHtml({ posPerf, players, scope: scopeLabel }),
        '📈 Trends':        () => buildTrendsHtml({ playerTrends, players, scope: scopeLabel }),
        '⚡ Momentum':      () => buildMomentumHtml({ momentum, scope: scopeLabel }),
        '🤝 Combinations':  () => buildCombinationsHtml({ pairs, players, scope: scopeLabel }),
        '🔄 CP & TO':       () => buildCPTOHtml({ cpTurnover, scope: scopeLabel }),
      };

      const tabNames: Record<typeof TABS[number], string> = {
        '🔍 Insights':     'Insights',
        '📍 Pos×Player':   'Position_Player',
        '📈 Trends':       'Player_Trends',
        '⚡ Momentum':     'Quarter_Momentum',
        '🤝 Combinations': 'Combinations',
        '🔄 CP & TO':      'CP_Turnover',
      };

      const html = tabHtmlMap[activeTab]();
      const tabName = tabNames[activeTab];
      const safeScope = scopeLabel.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 40);
      await sendAnalyticsEmail({
        html,
        subject: `Analytics — ${tabNames[activeTab]} · ${scopeLabel}`,
        filename: `analytics_${tabName}_${safeScope}`,
        addresses,
      });
    } catch (e: any) {
      Alert.alert('Send failed', e?.message ?? 'Could not send report.');
    } finally {
      setSending(false);
      setEmailOpen(false);
    }
  };

  // ── Scope selector ──────────────────────────────────────────────────────────
  const ScopeBar = () => (
    <View style={[as.scopeBar, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
      <Pressable style={[as.scopeBtn, scopeAll && { backgroundColor: c.primary }]} onPress={() => setScopeAll(true)}>
        <Text style={[as.scopeBtnText, { color: scopeAll ? '#fff' : c.text }]}>Full Season</Text>
      </Pressable>
      <Pressable style={[as.scopeBtn, !scopeAll && { backgroundColor: c.primary }]}
        onPress={() => { setScopeAll(false); setMatchPickerOpen(true); }}>
        <Text style={[as.scopeBtnText, { color: !scopeAll ? '#fff' : c.text }]}>
          {!scopeAll && singleMatchId ? (matches.find(m => m.id === singleMatchId)?.home_team?.slice(0,8) ?? 'Match') : 'Single Match'}
        </Text>
      </Pressable>
    </View>
  );

  // ── Match picker ────────────────────────────────────────────────────────────
  if (matchPickerOpen) return (
    <View style={[{ flex: 1, backgroundColor: c.bg }]}>
      <View style={[as.pickerHeader, { borderBottomColor: c.cardBorder }]}>
        <Text style={[as.pickerTitle, { color: c.text }]}>Select Match</Text>
        <Pressable onPress={() => { setMatchPickerOpen(false); if (!singleMatchId) setScopeAll(true); }}>
          <Text style={{ color: c.primary, fontWeight: '700' }}>Cancel</Text>
        </Pressable>
      </View>
      <FlatList
        data={matches}
        keyExtractor={m => m.id}
        ListEmptyComponent={<Text style={{ color: c.muted, textAlign: 'center', margin: 20 }}>No matches recorded yet</Text>}
        renderItem={({ item: m }) => (
          <Pressable style={[as.pickerItem, { borderBottomColor: c.cardBorder }, m.id === singleMatchId && { backgroundColor: c.tabActive }]}
            onPress={() => { setSingleMatchId(m.id); setScopeAll(false); setMatchPickerOpen(false); }}>
            <Text style={[{ fontWeight: '700', color: c.text }]}>{m.home_team} vs {m.away_team}</Text>
            <Text style={{ color: c.muted, fontSize: 12 }}>{m.match_date}{m.competition ? ` · ${m.competition}` : ''}</Text>
          </Pressable>
        )}
      />
    </View>
  );

  // ── Loading ─────────────────────────────────────────────────────────────────
  if (loading) return (
    <View style={[{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', gap: 12 }]}>
      <ActivityIndicator color={c.primary} size="large" />
      <Text style={{ color: c.muted, fontWeight: '600' }}>Crunching the numbers…</Text>
    </View>
  );

  // ── No data ─────────────────────────────────────────────────────────────────
  const hasData = matches.length > 0 && (posPerf.length > 0 || momentum.length > 0);
  if (!hasData) return (
    <View style={[{ flex: 1, backgroundColor: c.bg, alignItems: 'center', justifyContent: 'center', padding: 32 }]}>
      <Text style={{ fontSize: 40 }}>📊</Text>
      <Text style={{ fontSize: 18, fontWeight: '800', color: c.text, marginTop: 12, textAlign: 'center' }}>No data yet</Text>
      <Text style={{ color: c.muted, textAlign: 'center', marginTop: 8, lineHeight: 22 }}>
        Record some matches in Match Center and the analytics will appear here automatically.
      </Text>
    </View>
  );

  // ── TAB: Insights ───────────────────────────────────────────────────────────
  const renderInsights = () => (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <ScopeBar />
      <SectionHeader title="Coach Summary" sub={scopeAll ? `Based on ${matches.length} matches` : 'Single match analysis'} c={c} />
      {insights.length === 0
        ? <Text style={{ color: c.muted }}>Not enough data yet. Record a few more matches.</Text>
        : insights.map((ins, i) => <InsightCard key={i} insight={ins} c={c} />)}

      <SectionHeader title="Quick Stats" sub="Season totals" c={c} />
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
        {(() => {
          const totalGoals = posPerf.filter(r => ['GS','GA'].includes(r.position)).reduce((a, r) => a + r.goals, 0);
          const totalAttempts = posPerf.filter(r => ['GS','GA'].includes(r.position)).reduce((a, r) => a + r.attempts, 0);
          const totalPens = cpTurnover.reduce((a, m) => a + m.totalPenalties, 0);
          const avgCP = cpTurnover.length > 0 ? Math.round(cpTurnover.reduce((a, m) => a + m.cpConversionPct, 0) / cpTurnover.length) : 0;
          const wins = momentum.filter(m => m.finalDiff > 0).length;
          return <>
            <StatChip label="Matches" value={matches.length} color={c.primary} />
            <StatChip label="Wins" value={wins} color={c.success} />
            <StatChip label="Total Goals" value={totalGoals} color="#f59e0b" />
            <StatChip label="Shooting %" value={totalAttempts > 0 ? `${Math.round(100*totalGoals/totalAttempts)}%` : '—'} color="#8b5cf6" />
            <StatChip label="CP Conv%" value={avgCP > 0 ? `${avgCP}%` : '—'} color={c.primary} />
            <StatChip label="Penalties" value={totalPens} color={c.danger} />
          </>;
        })()}
      </View>
    </ScrollView>
  );

  // ── TAB: Position × Player heatmap ─────────────────────────────────────────
  const renderHeatmap = () => {
    const perfMap: Record<string, PosPerf> = {};
    posPerf.forEach(r => { perfMap[`${r.playerId}::${r.position}`] = r; });

    // Filter to players who have played at least one Q
    const activePlayers = players.filter(p => posPerf.some(r => r.playerId === p.id));

    return (
      <ScrollView contentContainerStyle={{ padding: 12, paddingBottom: 40 }}>
        <ScopeBar />
        <SectionHeader title="Player × Position" sub="Score: 0–100 based on goals%, feeds & discipline. Tap a cell for details." c={c} />

        {/* Legend */}
        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10, flexWrap: 'wrap' }}>
          {[['#dc2626','Weak (< 50)'],['#ca8a04','Average (50–70)'],['#16a34a','Strong (70+)']].map(([col, lbl]) => (
            <View key={lbl} style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <View style={{ width: 12, height: 12, borderRadius: 3, backgroundColor: col }} />
              <Text style={{ fontSize: 11, color: c.muted }}>{lbl}</Text>
            </View>
          ))}
        </View>

        {/* Header row */}
        <View style={{ flexDirection: 'row' }}>
          <View style={{ width: 64 }} />
          {POSITIONS.map(pos => (
            <View key={pos} style={{ flex: 1, alignItems: 'center', marginBottom: 4 }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: c.muted }}>{pos}</Text>
            </View>
          ))}
        </View>

        {activePlayers.map(player => (
          <View key={player.id} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
            <View style={{ width: 64 }}>
              <Text style={{ fontSize: 11, fontWeight: '700', color: c.text }} numberOfLines={1}>
                {player.first_name.charAt(0)}. {player.last_name}
              </Text>
            </View>
            {POSITIONS.map(pos => {
              const perf = perfMap[`${player.id}::${pos}`] ?? null;
              return (
                <HeatCell
                  key={pos} perf={perf} dark={theme.dark}
                  onPress={() => { if (perf) setDetailPopup(perf); }}
                />
              );
            })}
          </View>
        ))}

        {/* Detail popup */}
        {detailPopup && (() => {
          const p = detailPopup;
          const player = playerById[p.playerId];
          return (
            <Pressable style={as.overlay} onPress={() => setDetailPopup(null)}>
              <View style={[as.popup, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
                <Text style={[as.popupTitle, { color: c.text }]}>{player?.name ?? p.playerId} @ {p.position}</Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginVertical: 10 }}>
                  <StatChip label="Quarters" value={p.quarters} color={c.primary} />
                  {p.attempts > 0 && <StatChip label="Goal%" value={`${p.goalPct}%`} color="#f59e0b" />}
                  {p.attempts > 0 && <StatChip label="Goals" value={p.goals} color={c.success} />}
                  {p.feeds > 0    && <StatChip label="Feeds" value={p.feeds} color="#8b5cf6" />}
                  {p.assists > 0  && <StatChip label="Assists" value={p.assists} color="#06b6d4" />}
                  {p.interceptions > 0 && <StatChip label="Intercepts" value={p.interceptions} color={c.success} />}
                  {p.penalties > 0 && <StatChip label="Penalties" value={p.penalties} color={c.danger} />}
                  {p.turnoversLost > 0 && <StatChip label="TO Lost" value={p.turnoversLost} color={c.danger} />}
                </View>
                <View style={[as.scoreBadge, { backgroundColor: scoreColor(p.score, theme.dark) }]}>
                  <Text style={{ color: '#fff', fontWeight: '900', fontSize: 15 }}>Performance Score: {p.score}/100</Text>
                </View>
                <Pressable style={[as.closeBtn, { backgroundColor: c.primary }]} onPress={() => setDetailPopup(null)}>
                  <Text style={{ color: '#fff', fontWeight: '900' }}>Close</Text>
                </Pressable>
              </View>
            </Pressable>
          );
        })()}

        {activePlayers.length === 0 && <Text style={{ color: c.muted, textAlign: 'center', marginTop: 20 }}>No player position data recorded yet.</Text>}
      </ScrollView>
    );
  };

  // ── TAB: Player Trends ──────────────────────────────────────────────────────
  const renderTrends = () => {
    const activeTrend = playerTrends.find(t => t.playerId === trendPlayer) ?? playerTrends[0];
    const STAT_OPTS: { key: typeof trendStat; label: string; color: string }[] = [
      { key: 'goalPct', label: 'Goal %', color: '#f59e0b' },
      { key: 'penalties', label: 'Penalties', color: '#ef4444' },
      { key: 'feeds', label: 'Feeds', color: '#8b5cf6' },
      { key: 'interceptions', label: 'Intercepts', color: '#22c55e' },
    ];
    const activeStat = STAT_OPTS.find(s => s.key === trendStat) ?? STAT_OPTS[0];

    return (
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <ScopeBar />
        <SectionHeader title="Player Trends" sub="How each player is performing across the season" c={c} />

        {/* Player selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            {players.filter(p => playerTrends.some(t => t.playerId === p.id)).map(p => {
              const active = (trendPlayer ?? playerTrends[0]?.playerId) === p.id;
              return (
                <Pressable key={p.id} style={[as.pill, { borderColor: c.primary, backgroundColor: active ? c.primary : c.card }]}
                  onPress={() => setTrendPlayer(p.id)}>
                  <Text style={{ color: active ? '#fff' : c.text, fontWeight: '700', fontSize: 12 }}>
                    {p.first_name} {p.last_name.charAt(0)}.
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        {/* Stat selector */}
        <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
          {STAT_OPTS.map(opt => (
            <Pressable key={opt.key} style={[as.statPill, { borderColor: opt.color, backgroundColor: trendStat === opt.key ? opt.color : 'transparent' }]}
              onPress={() => setTrendStat(opt.key)}>
              <Text style={{ color: trendStat === opt.key ? '#fff' : opt.color, fontWeight: '800', fontSize: 11 }}>{opt.label}</Text>
            </Pressable>
          ))}
        </View>

        {activeTrend ? (
          <View>
            {/* Sparkline */}
            <View style={[as.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
              <Text style={{ color: c.text, fontWeight: '700', marginBottom: 10 }}>
                {playerById[activeTrend.playerId]?.name ?? '—'} — {activeStat.label} per match
              </Text>
              <Sparkline
                data={activeTrend.matches.map(m => m[trendStat] as number)}
                color={activeStat.color}
                width={W - 64}
                height={50}
              />
              {/* Labels below */}
              <View style={{ flexDirection: 'row', marginTop: 4 }}>
                {activeTrend.matches.map((m, i) => (
                  <Text key={i} style={{ flex: 1, textAlign: 'center', fontSize: 9, color: c.muted }} numberOfLines={1}>
                    {m.matchDate?.slice(0, 5) || `M${i+1}`}
                  </Text>
                ))}
              </View>
            </View>

            {/* Match-by-match table */}
            <Text style={[as.tableHeader, { color: c.muted }]}>Match-by-match breakdown</Text>
            {activeTrend.matches.map((m, i) => (
              <View key={m.matchId} style={[as.tRow, { borderBottomColor: c.cardBorder, backgroundColor: i % 2 === 0 ? c.card : 'transparent' }]}>
                <Text style={{ flex: 2, color: c.text, fontWeight: '600', fontSize: 12 }} numberOfLines={1}>{m.matchLabel}</Text>
                <Text style={{ width: 48, textAlign: 'center', color: '#f59e0b', fontWeight: '800', fontSize: 12 }}>{m.attempts > 0 ? `${m.goalPct}%` : '—'}</Text>
                <Text style={{ width: 36, textAlign: 'center', color: '#ef4444', fontWeight: '700', fontSize: 12 }}>{m.penalties}</Text>
                <Text style={{ width: 36, textAlign: 'center', color: '#8b5cf6', fontWeight: '700', fontSize: 12 }}>{m.feeds}</Text>
                <Text style={{ width: 36, textAlign: 'center', color: '#22c55e', fontWeight: '700', fontSize: 12 }}>{m.interceptions}</Text>
              </View>
            ))}
            {activeTrend.matches.length === 0 && <Text style={{ color: c.muted }}>No data for this player.</Text>}
          </View>
        ) : (
          <Text style={{ color: c.muted }}>No trend data yet.</Text>
        )}
      </ScrollView>
    );
  };

  // ── TAB: Quarter Momentum ───────────────────────────────────────────────────
  const renderMomentum = () => {
    const avgDiffs = [1,2,3,4].map(q => {
      const key = `q${q}Diff` as keyof QuarterMomentum;
      if (momentum.length === 0) return 0;
      return momentum.reduce((a, m) => a + (m[key] as number), 0) / momentum.length;
    });
    const maxAbs = Math.max(1, ...momentum.flatMap(m => [Math.abs(m.q1Diff),Math.abs(m.q2Diff),Math.abs(m.q3Diff),Math.abs(m.q4Diff)]));

    return (
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <ScopeBar />
        <SectionHeader title="Quarter Momentum" sub="Score difference (home – away) per quarter" c={c} />

        {/* Season average by quarter */}
        {!scopeAll || momentum.length >= 2 ? (
          <View style={[as.card, { backgroundColor: c.card, borderColor: c.cardBorder, marginBottom: 14 }]}>
            <Text style={{ color: c.text, fontWeight: '800', marginBottom: 8 }}>Season Average per Quarter</Text>
            {[1,2,3,4].map(q => {
              const avg = avgDiffs[q-1];
              const color = avg >= 0 ? c.success : c.danger;
              const barW = Math.max(4, Math.round(Math.abs(avg) / Math.max(1, Math.max(...avgDiffs.map(Math.abs))) * 80));
              return (
                <View key={q} style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 }}>
                  <Text style={{ width: 28, fontWeight: '800', color: c.text }}>Q{q}</Text>
                  <View style={{ flex: 1, height: 22, flexDirection: 'row', alignItems: 'center' }}>
                    <View style={{ width: barW, height: 18, backgroundColor: color, borderRadius: 4, opacity: 0.85 }} />
                  </View>
                  <Text style={{ width: 44, textAlign: 'right', fontWeight: '900', color, fontSize: 14 }}>
                    {avg >= 0 ? `+${avg.toFixed(1)}` : avg.toFixed(1)}
                  </Text>
                </View>
              );
            })}
          </View>
        ) : null}

        {/* Per-match breakdown */}
        <Text style={[as.tableHeader, { color: c.muted }]}>Per-match breakdown</Text>
        {[...momentum].reverse().map((m, i) => (
          <View key={m.matchId} style={[as.card, { backgroundColor: c.card, borderColor: c.cardBorder, marginBottom: 8 }]}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <Text style={{ flex: 1, fontWeight: '700', color: c.text, fontSize: 13 }} numberOfLines={1}>{m.matchLabel}</Text>
              <View style={[as.resultBadge, { backgroundColor: m.finalDiff > 0 ? '#16a34a22' : m.finalDiff < 0 ? '#dc262622' : '#64748b22' }]}>
                <Text style={{ fontWeight: '900', color: m.finalDiff > 0 ? '#16a34a' : m.finalDiff < 0 ? '#dc2626' : '#64748b', fontSize: 12 }}>
                  {m.finalDiff > 0 ? `W +${m.finalDiff}` : m.finalDiff < 0 ? `L ${m.finalDiff}` : 'D 0'}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {[m.q1Diff, m.q2Diff, m.q3Diff, m.q4Diff].map((d, qi) => (
                <View key={qi} style={{ flex: 1, alignItems: 'center' }}>
                  <Text style={{ fontSize: 10, color: c.muted, fontWeight: '700' }}>Q{qi+1}</Text>
                  <Text style={{ fontSize: 16, fontWeight: '900', color: d > 0 ? c.success : d < 0 ? c.danger : c.muted }}>
                    {d > 0 ? `+${d}` : d}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        ))}
        {momentum.length === 0 && <Text style={{ color: c.muted }}>No match data yet.</Text>}
      </ScrollView>
    );
  };

  // ── TAB: On-Court Combinations ──────────────────────────────────────────────
  const renderCombinations = () => (
    <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
      <ScopeBar />
      <SectionHeader title="Best On-Court Pairs" sub="Ranked by average score difference per quarter together. Requires ≥2 quarters." c={c} />
      {pairs.length === 0 && <Text style={{ color: c.muted }}>Not enough data yet — record more matches.</Text>}
      {pairs.map((pair, i) => {
        const [pa, pb] = pair.playerIds.map(id => playerById[id]?.name || id);
        const isPos = pair.scoreDiff >= 0;
        return (
          <View key={pair.playerIds.join(':')} style={[as.card, { backgroundColor: c.card, borderColor: c.cardBorder, marginBottom: 8 }]}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={[as.rankBadge, { backgroundColor: i < 3 ? c.primary : c.scoreBg }]}>
                <Text style={{ color: i < 3 ? '#fff' : c.text, fontWeight: '900' }}>#{i+1}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: c.text, fontWeight: '700', fontSize: 14 }}>{pa}</Text>
                <Text style={{ color: c.muted, fontSize: 11, marginTop: 1 }}>+ {pb}</Text>
              </View>
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={{ fontSize: 18, fontWeight: '900', color: isPos ? c.success : c.danger }}>
                  {isPos ? `+${pair.scoreDiff}` : pair.scoreDiff}
                </Text>
                <Text style={{ fontSize: 10, color: c.muted }}>avg diff</Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
              <StatChip label="Qtrs Together" value={pair.quartersTogther} color={c.primary} />
              <StatChip label="Goals Scored" value={pair.homeGoals} color="#f59e0b" />
            </View>
          </View>
        );
      })}
    </ScrollView>
  );

  // ── TAB: CP & Turnover ──────────────────────────────────────────────────────
  const renderCPTO = () => {
    const avgCP  = cpTurnover.length ? Math.round(cpTurnover.reduce((a, m) => a + m.cpConversionPct, 0) / cpTurnover.length) : 0;
    const avgTO  = cpTurnover.filter(m => m.toWon > 0).length
      ? Math.round(cpTurnover.filter(m => m.toWon > 0).reduce((a, m) => a + m.toConversionPct, 0) / cpTurnover.filter(m => m.toWon > 0).length) : 0;

    const penTotals: Record<string, number> = {};
    cpTurnover.forEach(m => Object.entries(m.penaltyByPosition).forEach(([pos, c2]) => { penTotals[pos] = (penTotals[pos] || 0) + c2; }));
    const penEntries = Object.entries(penTotals).sort((a, b) => b[1] - a[1]);
    const maxPen = penEntries[0]?.[1] || 1;

    return (
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }}>
        <ScopeBar />
        <SectionHeader title="Centre Pass & Turnover" sub="CP conversion, turnover scoring and penalty hotspots" c={c} />

        {/* Summary chips */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
          <StatChip label="CP Conversion" value={avgCP > 0 ? `${avgCP}%` : '—'} color={avgCP >= 65 ? c.success : avgCP >= 50 ? '#f59e0b' : c.danger} />
          <StatChip label="TO to Score" value={avgTO > 0 ? `${avgTO}%` : '—'} color={c.primary} />
          <StatChip label="Matches" value={cpTurnover.length} color={c.primary} />
        </View>

        {/* Penalty heatmap by position */}
        {penEntries.length > 0 && (
          <View style={[as.card, { backgroundColor: c.card, borderColor: c.cardBorder, marginBottom: 14 }]}>
            <Text style={{ color: c.text, fontWeight: '800', marginBottom: 10 }}>Penalty Hotspots by Position</Text>
            {penEntries.map(([pos, count]) => (
              <MiniBar key={pos} value={count} max={maxPen} color={c.danger} label={pos} />
            ))}
          </View>
        )}

        {/* Per-match CP/TO stats */}
        <Text style={[as.tableHeader, { color: c.muted }]}>Per match</Text>
        {/* Column headers */}
        <View style={[as.tRow, { borderBottomColor: c.cardBorder }]}>
          <Text style={[as.tHdr, { flex: 2, color: c.muted }]}>Match</Text>
          <Text style={[as.tHdr, { color: c.muted }]}>CP%</Text>
          <Text style={[as.tHdr, { color: c.muted }]}>TO%</Text>
          <Text style={[as.tHdr, { color: c.muted }]}>Pens</Text>
        </View>
        {[...cpTurnover].reverse().map((m, i) => (
          <View key={m.matchId} style={[as.tRow, { borderBottomColor: c.cardBorder, backgroundColor: i % 2 === 0 ? c.card : 'transparent' }]}>
            <Text style={{ flex: 2, color: c.text, fontWeight: '600', fontSize: 12 }} numberOfLines={1}>{m.matchLabel}</Text>
            <Text style={{ width: 44, textAlign: 'center', fontWeight: '800', color: m.cpConversionPct >= 65 ? c.success : m.cpConversionPct >= 50 ? '#f59e0b' : c.danger, fontSize: 13 }}>
              {m.cpToScore + m.cpNoScore > 0 ? `${m.cpConversionPct}%` : '—'}
            </Text>
            <Text style={{ width: 44, textAlign: 'center', fontWeight: '800', color: m.toConversionPct >= 50 ? c.success : '#f59e0b', fontSize: 13 }}>
              {m.toWon > 0 ? `${m.toConversionPct}%` : '—'}
            </Text>
            <Text style={{ width: 36, textAlign: 'center', fontWeight: '800', color: m.totalPenalties > 6 ? c.danger : c.text, fontSize: 13 }}>
              {m.totalPenalties}
            </Text>
          </View>
        ))}
        {cpTurnover.length === 0 && <Text style={{ color: c.muted, marginTop: 8 }}>No CP/TO data recorded yet. Enable these stats in Match Setup.</Text>}
      </ScrollView>
    );
  };

  // ── Render ──────────────────────────────────────────────────────────────────
  const renderTab = () => {
    switch (activeTab) {
      case TABS[0]: return renderInsights();
      case TABS[1]: return renderHeatmap();
      case TABS[2]: return renderTrends();
      case TABS[3]: return renderMomentum();
      case TABS[4]: return renderCombinations();
      case TABS[5]: return renderCPTO();
    }
  };

  return (
    <View style={[{ flex: 1 }, { backgroundColor: c.bg }]}>
      {/* Tab bar + email button */}
      <View style={[as.tabRow, { borderBottomColor: c.cardBorder, backgroundColor: c.card }]}>
        <ScrollView
          horizontal showsHorizontalScrollIndicator={false}
          style={{ flex: 1 }}
          contentContainerStyle={as.tabContent}
        >
          {TABS.map(tab => (
            <Pressable key={tab} style={[as.tabBtn, tab === activeTab && { borderBottomColor: c.primary, borderBottomWidth: 3 }]}
              onPress={() => setActiveTab(tab)}>
              <Text style={[as.tabText, { color: tab === activeTab ? c.primary : c.muted }]}>{tab}</Text>
            </Pressable>
          ))}
        </ScrollView>
        {/* ✉️ Email button — always visible, emails the active tab */}
        <Pressable
          style={[as.emailBtn, { backgroundColor: c.primary }]}
          onPress={() => setEmailOpen(true)}
          disabled={sending}
        >
          {sending
            ? <ActivityIndicator color="#fff" size="small" />
            : <Text style={{ fontSize: 16 }}>✉️</Text>}
        </Pressable>
      </View>

      <View style={{ flex: 1 }}>
        {renderTab()}
      </View>

      <EmailPrompt
        visible={emailOpen}
        onClose={() => setEmailOpen(false)}
        onSend={handleEmail}
        sending={sending}
      />
    </View>
  );
}

const as = StyleSheet.create({
  scopeBar:    { flexDirection: 'row', borderWidth: 1, borderRadius: 10, overflow: 'hidden', marginBottom: 14 },
  scopeBtn:    { flex: 1, paddingVertical: 8, alignItems: 'center' },
  scopeBtnText:{ fontWeight: '800', fontSize: 13 },
  tabRow:      { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 1 },
  tabContent:  { paddingHorizontal: 8 },
  tabBtn:      { paddingHorizontal: 10, paddingVertical: 10 },
  tabText:     { fontSize: 12, fontWeight: '700', whiteSpace: 'nowrap' } as any,
  emailBtn:    { width: 44, height: 44, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginRight: 8, marginLeft: 4 },
  card:        { borderRadius: 12, borderWidth: 1, padding: 12 },
  overlay:     { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center', zIndex: 99, padding: 20 },
  popup:       { width: '95%', borderRadius: 14, padding: 16, borderWidth: 1 },
  popupTitle:  { fontSize: 16, fontWeight: '900', marginBottom: 4 },
  scoreBadge:  { borderRadius: 8, padding: 10, alignItems: 'center', marginBottom: 10 },
  closeBtn:    { paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  pickerHeader:{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 16, borderBottomWidth: 1 },
  pickerTitle: { fontSize: 18, fontWeight: '800' },
  pickerItem:  { padding: 16, borderBottomWidth: 1 },
  pill:        { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 20, borderWidth: 1.5 },
  statPill:    { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 16, borderWidth: 1.5 },
  tableHeader: { fontWeight: '800', fontSize: 11, letterSpacing: 0.5, marginBottom: 6, marginTop: 4 },
  tRow:        { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 8, borderBottomWidth: 1, borderRadius: 6 },
  tHdr:        { width: 44, textAlign: 'center', fontWeight: '800', fontSize: 11 },
  resultBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8 },
  rankBadge:   { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
});
