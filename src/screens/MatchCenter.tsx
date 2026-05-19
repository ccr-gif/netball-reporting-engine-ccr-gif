// src/screens/MatchCenter.tsx
import React, { useEffect, useLayoutEffect, useRef, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, Pressable, ScrollView, Alert,
  Modal, Share, Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../context/ThemeContext';
import { initDb, get } from '../storage/db';
import {
  listPlayers, getLineup, saveLineup, getPeriodScores, getCumulativeScores, getMatch,
  incHome, incAway, setScores, addEvent, cryptoId, EventType,
  getLastEventForPositionQuarter, deleteEventById, decHomeSafe,
  copyLineupFromPreviousQuarter, getAllLineupsForQuarter,
} from '../storage/repository';
import LineupModal from './LineupModal';
import { getMatchConfig } from '../storage/matchConfig';
import { getStatLibrary } from '../storage/customStats';
import { incPlayerCustom, incTeamCustom } from '../storage/customStatTallies';
import { getLabelOverrides } from '../storage/statLabels';
import { BuiltinStat, Position, POSITIONS_ORDER as POSITIONS, STAT_LABEL } from '../types/stats';
import { FlashButton, Toast } from '../components/ui';
import { palette } from '../theme';

const posKey    = (mid: string) => `lastActivePos:${mid}`;
const periodKey = (mid: string) => `lastPeriod:${mid}`;

const TEAM = 'TEAM' as const;
const TEAM_SENTINEL = '__TEAM__' as const;
type ActivePos = Position | typeof TEAM;

const RED_BASE  = palette.redStat;
const TEAM_BLUE = palette.teamBlue;
const GAP = 8;

const BUILTIN_TO_EVENTS: Record<BuiltinStat, EventType[] | null> = {
  goal: ['shot_made'], miss: ['shot_miss'], assist: ['assist'], feed: ['feed'],
  rebound_off: ['rebound_off'], rebound_def: ['rebound_def'], cpr: ['centerpass_receive'],
  penalty: ['penalty'], bad_pass: ['bad_pass'], interception: ['interception'],
  to_won: ['turnover_won'], to_lost: ['turnover_lost'],
};

const TEAM_FLOW = [
  { label: 'CP to Score', type: 'cp_to_score' as const },
  { label: 'CP No Score', type: 'cp_no_score' as const },
  { label: 'TO to Score', type: 'to_to_score' as const },
];

function normalizeBuiltin(id: string): BuiltinStat {
  if (id === 'rebound_offence') return 'rebound_off';
  if (id === 'rebound_defence') return 'rebound_def';
  return id as BuiltinStat;
}

function diffLineup(prev: Record<string, string | null>, next: Record<string, string | null>) {
  const changed: Record<string, string | null> = {};
  for (const pos of Object.keys(next)) { if (prev[pos] !== next[pos]) changed[pos] = next[pos]; }
  return changed;
}

// ─── Quarter Timer ────────────────────────────────────────────────────────────
function QuarterTimer({ duration, onExpire }: { duration: number; onExpire: () => void }) {
  const [seconds, setSeconds] = useState(duration * 60);
  const [running, setRunning] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const expiredRef  = useRef(false);
  const { theme } = useTheme();

  useEffect(() => {
    setSeconds(duration * 60);
    setRunning(false);
    expiredRef.current = false;
    if (intervalRef.current) clearInterval(intervalRef.current);
  }, [duration]);

  useEffect(() => {
    if (!running) { if (intervalRef.current) clearInterval(intervalRef.current); return; }
    intervalRef.current = setInterval(() => {
      setSeconds(s => {
        if (s <= 1) {
          clearInterval(intervalRef.current!);
          setRunning(false);
          if (!expiredRef.current) { expiredRef.current = true; onExpire(); }
          return 0;
        }
        return s - 1;
      });
    }, 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running]);

  const mm = String(Math.floor(seconds / 60)).padStart(2, '0');
  const ss = String(seconds % 60).padStart(2, '0');
  const c = theme.colors;
  const isLow = seconds < 60 && seconds > 0;

  return (
    <View style={ts.wrap}>
      <Text style={[ts.time, { color: isLow ? c.danger : c.text }]}>{mm}:{ss}</Text>
      <Pressable style={[ts.btn, { backgroundColor: running ? c.danger : c.success }]} onPress={() => setRunning(r => !r)}>
        <Text style={ts.btnTxt}>{running ? '⏸' : '▶'}</Text>
      </Pressable>
      <Pressable style={[ts.btn, { backgroundColor: c.scoreBg, borderWidth: 1, borderColor: c.cardBorder }]}
        onPress={() => { setSeconds(duration * 60); setRunning(false); expiredRef.current = false; }}>
        <Text style={[ts.btnTxt, { color: c.text }]}>↺</Text>
      </Pressable>
    </View>
  );
}

const ts = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  time: { fontWeight: '900', fontSize: 18, fontVariant: ['tabular-nums'], minWidth: 56 },
  btn:  { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8 },
  btnTxt: { color: '#fff', fontWeight: '900', fontSize: 14 },
});

// ─── Player Stats Modal ───────────────────────────────────────────────────────
function PlayerStatsModal({
  visible, onClose, matchId, period, position, playerName, playerStatIds,
  lineup, labelOverrides, libLabels, playerStyles,
}: {
  visible: boolean; onClose: () => void;
  matchId: string; period: number; position: string;
  playerName: string; playerStatIds: string[];
  lineup: Record<string, string | null>;
  labelOverrides: Record<string, string>;
  libLabels: Record<string, string>;
  playerStyles: Record<string, 'blue' | 'red'>;
}) {
  const { theme } = useTheme();
  const [stats, setStats] = useState<Record<string, number>>({});

  useEffect(() => {
    if (!visible || !matchId || !position) return;
    (async () => {
      const periodId = `Q${period}`;
      const playerId = lineup[position];
      if (!playerId) return;

      const rows: any[] = await (await import('../storage/db')).all(
        `select type, count(*) as c from event where match_id=? and period_id=? and player_id=? group by type`,
        [matchId, periodId, playerId]
      );

      const map: Record<string, number> = {};
      for (const r of rows || []) map[r.type] = r.c;
      setStats(map);
    })();
  }, [visible, matchId, period, position]);

  const c = theme.colors;
  const BUILTIN_MAP: Record<string, string> = {
    shot_made: 'Goals', shot_miss: 'Misses', assist: 'Stepping', feed: 'Feeds',
    rebound_off: 'Reb Off', rebound_def: 'Reb Def', centerpass_receive: 'CP Receives',
    penalty: 'Penalties', bad_pass: 'Bad Pass', interception: 'Interceptions',
    turnover_won: 'TO Won', turnover_lost: 'TO Lost',
  };

  const entries = Object.entries(stats).filter(([, v]) => v > 0).map(([k, v]) => {
    const label = BUILTIN_MAP[k] ?? libLabels[k] ?? labelOverrides[k] ?? k;
    return { label, value: v };
  });

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={pss.overlay} onPress={onClose}>
        <View style={[pss.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
          <Text style={[pss.title, { color: c.text }]}>{playerName} — Q{period} Stats</Text>
          {entries.length === 0
            ? <Text style={{ color: c.muted, textAlign: 'center', marginVertical: 12 }}>No stats recorded yet</Text>
            : entries.map(({ label, value }) => (
                <View key={label} style={[pss.row, { borderBottomColor: c.cardBorder }]}>
                  <Text style={[pss.lbl, { color: c.textSecondary }]}>{label}</Text>
                  <Text style={[pss.val, { color: c.text }]}>{value}</Text>
                </View>
              ))}
          <Pressable style={[pss.closeBtn, { backgroundColor: c.primary }]} onPress={onClose}>
            <Text style={{ color: '#fff', fontWeight: '900' }}>Close</Text>
          </Pressable>
        </View>
      </Pressable>
    </Modal>
  );
}

const pss = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  card: { width: '90%', borderRadius: 14, padding: 16, borderWidth: 1 },
  title: { fontSize: 16, fontWeight: '800', marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1 },
  lbl: { fontWeight: '600' },
  val: { fontWeight: '900', fontSize: 16 },
  closeBtn: { marginTop: 14, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
});

// ─── SubHistory Modal ─────────────────────────────────────────────────────────
function SubHistoryModal({ visible, onClose, matchId }: { visible: boolean; onClose: () => void; matchId: string }) {
  const { theme } = useTheme();
  const [subs, setSubs] = useState<{ q: string; changes: string[] }[]>([]);

  useEffect(() => {
    if (!visible || !matchId) return;
    (async () => {
      const result: { q: string; changes: string[] }[] = [];
      const playersList: any[] = await (await import('../storage/repository')).listPlayers();
      const nameById: Record<string, string> = {};
      playersList.forEach(p => { nameById[p.id] = `${p.first_name} ${p.last_name}`.trim(); });

      for (const q of ['Q1','Q2','Q3','Q4']) {
        const allLineups = await getAllLineupsForQuarter(matchId, q);
        const lines: string[] = [];
        for (const [pos, players] of Object.entries(allLineups)) {
          if ((players as string[]).length > 1) {
            const names = (players as string[]).map(id => nameById[id] || id);
            lines.push(`${pos}: ${names.join(' → ')}`);
          }
        }
        if (lines.length) result.push({ q, changes: lines });
      }
      setSubs(result);
    })();
  }, [visible, matchId]);

  const c = theme.colors;
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[ssh.overlay]}>
        <View style={[ssh.card, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
          <Text style={[ssh.title, { color: c.text }]}>Substitution History</Text>
          {subs.length === 0
            ? <Text style={{ color: c.muted, textAlign: 'center', marginVertical: 16 }}>No substitutions recorded</Text>
            : subs.map(({ q, changes }) => (
                <View key={q} style={{ marginBottom: 10 }}>
                  <Text style={[{ fontWeight: '800', color: c.primary, marginBottom: 4 }]}>{q}</Text>
                  {changes.map(ch => <Text key={ch} style={{ color: c.textSecondary, marginLeft: 8 }}>• {ch}</Text>)}
                </View>
              ))}
          <Pressable style={[ssh.closeBtn, { backgroundColor: c.primary }]} onPress={onClose}>
            <Text style={{ color: '#fff', fontWeight: '900' }}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const ssh = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  card: { borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, borderWidth: 1, maxHeight: '70%' },
  title: { fontSize: 18, fontWeight: '800', marginBottom: 12 },
  closeBtn: { marginTop: 14, paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
});

// ─── Main MatchCenter ─────────────────────────────────────────────────────────
export default function MatchCenter({ matchId }: { matchId: string | null }) {
  const { theme } = useTheme();
  const c = theme.colors;

  const [period, setPeriod]         = useState(1);
  const [activePos, setActivePos]   = useState<ActivePos>('GS');
  const [players, setPlayers]       = useState<any[]>([]);
  const [lineup, setLineup]         = useState<Record<string, string | null>>({});
  const [lineupOpen, setLineupOpen] = useState(false);
  const [qHome, setQHome]           = useState(0);
  const [qAway, setQAway]           = useState(0);
  const [totHome, setTotHome]       = useState(0);
  const [totAway, setTotAway]       = useState(0);
  const [homeTeamName, setHomeTeamName] = useState('Home');
  const [awayTeamName, setAwayTeamName] = useState('Away');
  const [playerStatIds, setPlayerStatIds] = useState<string[]>([]);
  const [teamStatIds, setTeamStatIds]     = useState<string[]>([]);
  const [teamFlowEnabled, setTeamFlowEnabled] = useState({ cp_to_score: true, cp_no_score: true, to_to_score: true });
  const [playerStyles, setPlayerStyles]   = useState<Record<string, 'blue' | 'red'>>({});
  const [labelOverrides, setLabelOverrides] = useState<Record<string, string>>({});
  const [quarterDuration, setQuarterDuration] = useState(15);
  const [timerKey, setTimerKey]     = useState(0);

  // Toast
  const [toastMsg, setToastMsg]     = useState('');
  const [toastVis, setToastVis]     = useState(false);
  const showToast = (msg: string)   => { setToastMsg(msg); setToastVis(false); setTimeout(() => setToastVis(true), 10); };

  // Last stat per position
  const [lastStatLabels, setLastStatLabels] = useState<Record<string, string>>({});

  // Modals
  const [statsPos, setStatsPos]     = useState<string | null>(null);
  const [subHistOpen, setSubHistOpen] = useState(false);

  const libLabelsRef = useRef<Record<string, string>>({});

  // Restore period from storage
  useEffect(() => {
    if (!matchId) return;
    AsyncStorage.getItem(periodKey(matchId)).then(saved => {
      const q = Number(saved);
      setPeriod(q >= 1 && q <= 4 ? q : 1);
    });
  }, [matchId]);

  useEffect(() => {
    (async () => { setLabelOverrides(await getLabelOverrides() ?? {}); })();
  }, []);

  // Load config
  useEffect(() => {
    if (!matchId) return;
    (async () => {
      await initDb();
      const lib = await getStatLibrary();
      libLabelsRef.current = {};
      lib.forEach(item => { libLabelsRef.current[item.id] = item.label; });

      const cfg = await getMatchConfig(String(matchId));
      setPlayerStatIds((cfg.player ?? []).map(normalizeBuiltin));

      const validIds = new Set([...lib.map(s => s.id), 'cp_to_score','cp_no_score','to_to_score']);
      setTeamStatIds((cfg.team ?? []).map(normalizeBuiltin).filter(id => validIds.has(id)));
      setTeamFlowEnabled(cfg.teamFlowEnabled ?? { cp_to_score: true, cp_no_score: true, to_to_score: true });
      setPlayerStyles(cfg.playerStyles ?? {});
      setQuarterDuration(cfg.quarterDuration ?? 15);
      setLabelOverrides(await getLabelOverrides());
    })();
  }, [matchId]);

  // Load players + lineup + scores per quarter
  useLayoutEffect(() => {
    if (!matchId) return;
    (async () => {
      await initDb();
      // Load team names
      try {
        const m: any = await getMatch(matchId);
        if (m?.home_team) setHomeTeamName(m.home_team);
        if (m?.away_team) setAwayTeamName(m.away_team);
      } catch {}
      const ps = await listPlayers();
      setPlayers(ps || []);

      let lu = await getLineup(matchId, `Q${period}`);
      if (period > 1 && Object.values(lu || {}).every(v => !v)) {
        await copyLineupFromPreviousQuarter(matchId, period);
        lu = await getLineup(matchId, `Q${period}`);
      }
      setLineup(lu ?? {});

      const sQ = await getPeriodScores(matchId, period);
      setQHome(sQ.home || 0); setQAway(sQ.away || 0);
      const tot = await getCumulativeScores(matchId);
      setTotHome(tot.home || 0); setTotAway(tot.away || 0);
    })();
  }, [matchId, period]);

  const refreshScores = async () => {
    const sQ = await getPeriodScores(matchId!, period);
    setQHome(sQ.home || 0); setQAway(sQ.away || 0);
    const tot = await getCumulativeScores(matchId!);
    setTotHome(tot.home || 0); setTotAway(tot.away || 0);
  };

  const isTeamStat = (id: string) => teamStatIds.includes(id) || ['cp_to_score','cp_no_score','to_to_score'].includes(id);
  const getColor   = (id: string) => {
    const style = playerStyles[id];
    if (style === 'red') return RED_BASE;
    if (isTeamStat(id)) return TEAM_BLUE;
    return c.primary;
  };

  const getLabel = (id: string, built: BuiltinStat | null, fallback: string) => {
    if (labelOverrides[id]) return labelOverrides[id];
    if (id.startsWith('custom:')) return libLabelsRef.current[id] || fallback;
    return STAT_LABEL[built as BuiltinStat] || fallback;
  };

  const playerName = (pos: string) => {
    const id = lineup[pos];
    const p  = players?.find?.((pp: any) => pp.id === id);
    return p ? `${p.first_name} ${p.last_name}` : null;
  };

  const ensureLineup = () => {
    if (!matchId) return false;
    if (activePos === TEAM) return true;
    if (!Object.values(lineup).some(Boolean)) { setLineupOpen(true); return false; }
    return true;
  };

  const recordEvent = async (type: EventType, pos: string) => {
    const playerId = lineup[pos];
    if (!playerId) return;
    await addEvent({ id: cryptoId(), match_id: matchId!, period_id: `Q${period}`, player_id: playerId, type, position_at_time: pos, ts: new Date().toISOString() });
  };

  const onQuick = async (type: EventType, label: string) => {
    if (!ensureLineup()) return;
    await recordEvent(type, activePos as string);
    if (type === 'shot_made') await incHome(matchId!, period, 1);
    await refreshScores();
    setLastStatLabels(prev => ({ ...prev, [activePos]: label }));
    showToast(`${label} recorded`);
  };

  const onUndo = async () => {
    const periodId = `Q${period}`;

    if (activePos !== TEAM) {
      const last = await getLastEventForPositionQuarter(matchId!, period, activePos as string);
      if (!last?.id) { Alert.alert('Nothing to undo', `No recent stat for ${activePos} in Q${period}.`); return; }
      if (last.type === 'shot_made') await decHomeSafe(matchId!, period);
      if (last.type?.startsWith('custom:')) {
        const playerId = lineup[activePos as string];
        if (playerId) await incPlayerCustom(matchId!, periodId, playerId, last.type, -1);
      }
      await deleteEventById(last.id);
      showToast('Last stat undone ↩');
    } else {
      const lastTeam: any = await get(
        `SELECT id, type FROM event WHERE match_id=? AND period_id=? AND player_id='__TEAM__' ORDER BY rowid DESC LIMIT 1`,
        [matchId, periodId]
      );
      if (!lastTeam?.id) { Alert.alert('Nothing to undo', `No recent team stat in Q${period}.`); return; }
      if (lastTeam.type?.startsWith('custom:')) await incTeamCustom(matchId!, periodId, lastTeam.type, -1);
      await deleteEventById(lastTeam.id);
      showToast('Last stat undone ↩');
    }
    await refreshScores();
  };

  const saveLineupWithIntent = (map: Record<string, string | null>) => {
    if (!matchId) return;
    setLineup(map);
    setLineupOpen(false);
    Alert.alert(`Set Lineup – Q${period}`, 'How do you want to apply this lineup?', [
      { text: '✅ Set Starting Team', onPress: async () => {
          await saveLineup(matchId, `Q${period}`, map, { replace: true });
      }},
      { text: '🔁 Make Substitution', onPress: async () => {
          const changed = diffLineup(lineup, map);
          if (!Object.keys(changed).length) return;
          const merged = { ...lineup, ...changed };
          setLineup(merged);
          await saveLineup(matchId, `Q${period}`, merged);
          showToast('Substitution saved');
      }},
      { text: 'Cancel', style: 'cancel' },
    ], { cancelable: true });
  };

  const changePeriod = (q: number) => {
    setPeriod(q);
    setTimerKey(k => k+1);
    if (matchId) AsyncStorage.setItem(periodKey(matchId), String(q));
  };

  const pButtons = (() => {
    if (activePos === TEAM) return [];
    const out: any[] = [];
    for (const id of playerStatIds) {
      if (id.startsWith('custom:')) {
        const label = libLabelsRef.current[id] ?? 'Custom';
        out.push({ key: `c-${id}`, label, color: getColor(id), onPress: async () => {
          if (!ensureLineup()) return;
          const playerId = lineup[activePos as string];
          if (!playerId) return;
          await addEvent({ id: cryptoId(), match_id: matchId!, period_id: `Q${period}`, player_id: playerId, type: id as any, position_at_time: activePos as string, ts: new Date().toISOString() });
          await incPlayerCustom(matchId!, `Q${period}`, playerId, id);
          setLastStatLabels(prev => ({ ...prev, [activePos]: label }));
          showToast(`${label} recorded`);
        }});
      } else {
        const built = normalizeBuiltin(id);
        const events = BUILTIN_TO_EVENTS[built] || [null];
        for (const ev of events) {
          const label = getLabel(id, built, built);
          out.push({ key: `b-${built}-${ev ?? ''}`, label, color: getColor(id), onPress: ev
            ? async () => await onQuick(ev, label)
            : async () => {
                if (!ensureLineup()) return;
                const playerId = lineup[activePos as string];
                if (!playerId) return;
                await addEvent({ id: cryptoId(), match_id: matchId!, period_id: `Q${period}`, player_id: playerId, type: built as any, position_at_time: activePos as string, ts: new Date().toISOString() });
                setLastStatLabels(prev => ({ ...prev, [activePos]: label }));
                showToast(`${label} recorded`);
              },
          });
        }
      }
    }
    return out.sort((a, b) => (a.color === RED_BASE) === (b.color === RED_BASE) ? 0 : a.color === RED_BASE ? 1 : -1);
  })();

  const tButtons = (() => {
    const items: any[] = [];
    for (const id of teamStatIds) {
      const label = libLabelsRef.current[id] ?? 'Custom';
      items.push({ key: `t-${id}`, label, color: getColor(id), onPress: async () => {
        await addEvent({ id: cryptoId(), match_id: matchId!, period_id: `Q${period}`, player_id: TEAM_SENTINEL, type: id as any, position_at_time: TEAM, ts: new Date().toISOString() });
        await incTeamCustom(matchId!, `Q${period}`, id);
        showToast(`${label} recorded`);
      }});
    }
    for (const f of TEAM_FLOW) {
      if (!teamFlowEnabled[f.type]) continue;
      const label = labelOverrides[f.type] ?? f.label;
      items.push({ key: `f-${f.type}`, label, color: getColor(f.type), onPress: async () => {
        await addEvent({ id: cryptoId(), match_id: matchId!, period_id: `Q${period}`, player_id: TEAM_SENTINEL, type: f.type, position_at_time: TEAM, ts: new Date().toISOString() });
        showToast(`${label} recorded`);
      }});
    }
    return items.sort((a, b) => (a.color === RED_BASE) === (b.color === RED_BASE) ? 0 : a.color === RED_BASE ? 1 : -1);
  })();

  if (!matchId) return (
    <View style={[mc.noMatch, { backgroundColor: c.bg }]}>
      <Text style={[mc.noMatchText, { color: c.muted }]}>Create a match in Setup first</Text>
    </View>
  );

  return (
    <ScrollView contentContainerStyle={[mc.scroll, { backgroundColor: c.bg }]} bounces={false}>
      <View style={mc.container}>
        {/* Quarter selector + timer */}
        <View style={mc.qRow}>
          {[1,2,3,4].map(q => (
            <Pressable key={q} style={[mc.qBtn, { borderColor: c.cardBorder, backgroundColor: c.card }, q === period && { backgroundColor: c.primary, borderColor: c.primary }]}
              onPress={() => changePeriod(q)}>
              <Text style={[mc.qText, { color: q === period ? '#fff' : c.text }]}>Q{q}</Text>
              {q === period && <View style={mc.liveDot} />}
            </Pressable>
          ))}
          <Pressable style={[mc.smallBtn, { backgroundColor: c.primary }]} onPress={async () => {
            // FIX: always refresh player list before opening lineup so new players appear
            try { const ps = await listPlayers(); if (ps?.length) setPlayers(ps); } catch {}
            setLineupOpen(true);
          }}>
            <Text style={mc.smallBtnText}>Set Lineup</Text>
          </Pressable>
        </View>

        <View style={[mc.timerRow, { backgroundColor: c.card, borderColor: c.cardBorder }]}>
          <QuarterTimer key={`q${period}-${timerKey}`} duration={quarterDuration}
            onExpire={() => Alert.alert(`Q${period} time!`, 'Quarter time is up.', [{ text: period < 4 ? `Go to Q${period+1}` : 'Full Time', onPress: () => period < 4 && changePeriod(period+1) }, { text: 'Stay', style: 'cancel' }])}
          />
          <Pressable onPress={() => setSubHistOpen(true)} style={[mc.subHistBtn, { borderColor: c.cardBorder }]}>
            <Text style={{ color: c.primary, fontWeight: '700', fontSize: 12 }}>📋 Subs</Text>
          </Pressable>
        </View>

        {/* Scoreboard */}
        <View style={[mc.scoreCard, { backgroundColor: c.scoreBg, borderColor: c.cardBorder }]}>
          {[
            { name: totHome > totAway ? '🏆 ' : '', score: totHome, qScore: qHome, adj: (d: number) => d > 0 ? incHome(matchId!, period, d) : setScores(matchId!, period, Math.max(0, qHome+d), qAway), label: homeTeamName },
            { name: '', score: totAway, qScore: qAway, adj: (d: number) => d > 0 ? incAway(matchId!, period, d) : setScores(matchId!, period, qHome, Math.max(0, qAway+d)), label: awayTeamName },
          ].map((side, i) => (
            <React.Fragment key={i}>
              {i === 1 && <Text style={[mc.vs, { color: c.muted }]}>–</Text>}
              <View style={mc.scoreSide}>
                <Text style={[mc.teamLabel, { color: c.muted }]}>{side.label}</Text>
                <View style={mc.scoreCtl}>
                  <Pressable style={[mc.scoreBtn, { backgroundColor: c.primary }]} onPress={async () => { await side.adj(-1); await refreshScores(); }}><Text style={mc.scoreBtnText}>−</Text></Pressable>
                  <Text style={[mc.score, { color: c.text }]}>{side.score}</Text>
                  <Pressable style={[mc.scoreBtn, { backgroundColor: c.primary }]} onPress={async () => { await side.adj(1); await refreshScores(); }}><Text style={mc.scoreBtnText}>＋</Text></Pressable>
                </View>
                <Text style={[mc.qScore, { color: c.muted }]}>Q{period}: {side.qScore}</Text>
              </View>
            </React.Fragment>
          ))}
        </View>

        {/* Player grid */}
        <View style={mc.grid}>
          {POSITIONS.map(p => {
            const name = playerName(p);
            const isActive = activePos === p;
            const isUnfilled = !name;
            const lastStat = lastStatLabels[p];
            return (
              <Pressable key={p}
                style={[mc.tile, { backgroundColor: c.card, borderColor: c.cardBorder },
                  isActive && { borderColor: c.primary, borderWidth: 2 },
                  isUnfilled && { borderColor: c.warning, borderWidth: 1.5 },
                ]}
                onPress={() => { setActivePos(p); if (matchId) AsyncStorage.setItem(posKey(matchId), p); }}
                onLongPress={() => { if (name) setStatsPos(p); }}
              >
                <Text style={[mc.tilePos, { color: c.text }]}>{p}</Text>
                {name
                  ? <Text style={[mc.tileName, { color: c.textSecondary }]} numberOfLines={1}>{name}</Text>
                  : <Text style={[mc.tileName, { color: c.warning }]}>—</Text>}
                {lastStat && isActive && <Text style={[mc.lastStat, { color: c.success }]}>✓ {lastStat}</Text>}
              </Pressable>
            );
          })}
          <Pressable key={TEAM}
            style={[mc.tile, mc.teamTile, activePos === TEAM && { borderColor: c.primary, borderWidth: 2 }]}
            onPress={() => { setActivePos(TEAM); if (matchId) AsyncStorage.setItem(posKey(matchId!), TEAM); }}>
            <Text style={[mc.tilePos, { color: '#fff' }]}>Team</Text>
          </Pressable>
        </View>

        {/* Undo */}
        <View style={{ alignItems: 'center', marginBottom: GAP }}>
          <FlashButton label="↩ Undo last" onPress={onUndo} baseColor={c.danger} style={[mc.quickBtn, { alignSelf: 'center' }]} textStyle={mc.quickBtnText} />
        </View>

        {/* Stat buttons */}
        {activePos !== TEAM && (
          pButtons.length === 0
            ? <Text style={[{ textAlign: 'center', color: c.muted, marginBottom: 8 }]}>No player stats selected</Text>
            : <View style={mc.quickWrap}>
                {pButtons.map(btn => (
                  <FlashButton key={btn.key} label={btn.label} onPress={btn.onPress} baseColor={btn.color} style={mc.quickBtn} textStyle={mc.quickBtnText} />
                ))}
              </View>
        )}

        {activePos === TEAM && tButtons.length > 0 && (
          <View style={mc.quickWrap}>
            {tButtons.map(btn => (
              <FlashButton key={btn.key} label={btn.label} onPress={btn.onPress} baseColor={btn.color ?? TEAM_BLUE} style={mc.quickBtn} textStyle={mc.quickBtnText} />
            ))}
          </View>
        )}

        <View style={{ height: 24 }} />

        <LineupModal
          visible={lineupOpen}
          onClose={() => setLineupOpen(false)}
          positions={[...POSITIONS]}
          players={players}
          value={lineup}
          onSave={saveLineupWithIntent}
          title={`Set Lineup – Q${period}`}
        />

        {statsPos && (
          <PlayerStatsModal
            visible={!!statsPos}
            onClose={() => setStatsPos(null)}
            matchId={matchId}
            period={period}
            position={statsPos}
            playerName={playerName(statsPos) ?? statsPos}
            playerStatIds={playerStatIds}
            lineup={lineup}
            labelOverrides={labelOverrides}
            libLabels={libLabelsRef.current}
            playerStyles={playerStyles}
          />
        )}

        <SubHistoryModal visible={subHistOpen} onClose={() => setSubHistOpen(false)} matchId={matchId} />
      </View>

      <Toast message={toastMsg} visible={toastVis} />
    </ScrollView>
  );
}

const mc = StyleSheet.create({
  noMatch: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  noMatchText: { fontSize: 16, fontWeight: '600' },
  scroll: { paddingBottom: 12 },
  container: { flexGrow: 1, padding: 12 },
  qRow: { flexDirection: 'row', alignItems: 'center', gap: GAP, marginBottom: 8 },
  qBtn: { borderWidth: 1, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, alignItems: 'center', position: 'relative' },
  qText: { fontWeight: '900', fontSize: 16 },
  liveDot: { position: 'absolute', top: 3, right: 3, width: 6, height: 6, borderRadius: 3, backgroundColor: '#ef4444' },
  smallBtn: { marginLeft: 'auto', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  smallBtnText: { color: '#fff', fontWeight: '900', fontSize: 14 },
  timerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 10, borderRadius: 12, borderWidth: 1, marginBottom: 8 },
  subHistBtn: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  scoreCard: { borderRadius: 14, borderWidth: 1, padding: 12, marginBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  scoreSide: { alignItems: 'center', minWidth: 120 },
  teamLabel: { fontSize: 11, fontWeight: '700', marginBottom: 2 },
  scoreCtl: { flexDirection: 'row', alignItems: 'center', gap: GAP },
  scoreBtn: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 12 },
  scoreBtnText: { color: '#fff', fontWeight: '900', fontSize: 18 },
  score: { fontSize: 30, fontWeight: '900', textAlign: 'center', minWidth: 42 },
  qScore: { fontSize: 11, marginTop: 2 },
  vs: { marginHorizontal: 16, fontSize: 18, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: GAP, marginBottom: GAP },
  tile: { width: '21%', aspectRatio: 1.1, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', padding: 4 },
  tilePos: { fontSize: 15, fontWeight: '900' },
  tileName: { fontSize: 10, textAlign: 'center', marginTop: 2 },
  lastStat: { fontSize: 9, fontWeight: '700', marginTop: 2, textAlign: 'center' },
  teamTile: { backgroundColor: TEAM_BLUE, borderColor: '#0a1a5c' },
  quickWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: GAP },
  quickBtn: { width: '31%', height: 46, borderRadius: 10, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  quickBtnText: { color: '#fff', fontWeight: '800', fontSize: 12, textAlign: 'center' },
});
