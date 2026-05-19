// src/hooks/useReportData.ts
// v6 - Fixed:
//  1. Q2/Q3/Q4 stats missing: fall back to direct event query when no lineup record exists
//  2. Custom player stats: query directly from events (not just stint-based)
//  3. Team custom stats: always populated from events keyed to __TEAM__
//  4. All quarters always included in output even with no lineup

import { useEffect, useState } from 'react';
import * as LabelStore from '../storage/statLabels';
import { all, get } from '../storage/db';
import {
  getMatch, getPlayersMap, getQuarterScorelines, getTeamFlowByQuarter,
  getPositionStintsForQuarter, getStatsForPositionStint,
  getCustomTeamStatsByQuarter,
} from '../storage/repository';
import { getMatchConfig } from '../storage/matchConfig';
import { getAllTallies } from '../storage/customStatTallies';
import { getStatLibrary } from '../storage/customStats';
import { BUILTIN_TO_REPORT_FIELD, STAT_LABEL, StatId, RowLike } from '../types/stats';
import { palette } from '../theme';
import { initDb } from '../storage/db';

export type ReportRow = {
  period_id: string;
  position: string;
  player_id: string;
  stint_index: number;
  attempts: number; goals: number; assists: number; feeds: number;
  rebound_off: number; rebound_def: number; cpr: number; penalties: number;
  to_won: number; to_lost: number; interceptions: number; bad_pass: number;
  [key: string]: any;
};

export type TeamFlow = { cp_to_score: number; cp_no_score: number; to_to_score: number; };

export type Col = {
  key: string;
  label: string;
  value: (r: RowLike, q: string, playerId: string) => number | string;
  classOf?: (r: RowLike | any, v: number) => string | undefined;
  isTeam?: boolean;
};

function normalizeBuiltin(id: string): string {
  if (id === 'rebound_offence') return 'rebound_off';
  if (id === 'rebound_defence') return 'rebound_def';
  return id;
}

// ─── buildColumns ─────────────────────────────────────────────────────────────
export function buildColumns(
  enabledStats: StatId[],
  cfg: any,
  teamFlowMap: Record<string, TeamFlow>,
  teamCustomStats: Record<string, Record<string, number>>,
  libLabels: Record<string, string>,
  labelOverrides: Record<string, string>,
  playerStyles: Record<string, 'blue' | 'red'>,
): Col[] {
  if (!cfg) return [];
  const cols: Col[] = [];
  const enabledSet = new Set(enabledStats.map(String));

  const lbl = (id: string, fallback: string) => labelOverrides[id] ?? fallback;

  // Shooting
  if (enabledSet.has('goal') || enabledSet.has('miss')) {
    cols.push(
      { key: 'attempts', label: 'Attempts', value: r => r.attempts || 0 },
      { key: 'goals',    label: 'Goals',    value: r => r.goals    || 0 },
      { key: 'goalPct',  label: 'Goal %',   value: r => r.attempts ? Math.round(100 * r.goals / r.attempts) : 0 },
    );
  }

  // Built-in player stats
  const order = ['bad_pass','penalty','assist','feed','cpr','interception','to_won','to_lost','rebound_off','rebound_def'];
  for (const id of order) {
    if (!enabledSet.has(id)) continue;
    const field = BUILTIN_TO_REPORT_FIELD[id as StatId];
    if (!field) continue;
    cols.push({
      key: id, label: lbl(id, STAT_LABEL[id as StatId] ?? id),
      value: r => (r as any)[field] ?? 0,
      classOf: (_r, v) => id === 'bad_pass' && v > 0 ? 'bad' : id === 'penalty' && v > 0 ? 'pen' : id === 'assist' && v > 0 ? 'step' : undefined,
    });
  }

  // Player custom stats
  for (const id of enabledStats.map(String).filter(s => s.startsWith('custom:') && libLabels[s])) {
    if (cols.some(c => c.key === id)) continue;
    cols.push({ key: id, label: lbl(id, libLabels[id]), value: r => Number((r as any)[id] || 0) });
  }

  // Team custom stats — scan actual data + cfg.team
  const teamCustomIds = new Set<string>();
  Object.values(teamCustomStats).forEach(qMap => Object.keys(qMap).forEach(k => { if (k.startsWith('custom:')) teamCustomIds.add(k); }));
  (cfg.team || []).forEach((id: string) => { if (id.startsWith('custom:') && libLabels[id]) teamCustomIds.add(id); });
  for (const id of teamCustomIds) {
    if (cols.some(c => c.key === id)) continue;
    cols.push({ key: id, label: lbl(id, libLabels[id] ?? id), isTeam: true, value: (_r, q) => teamCustomStats[q]?.[id] ?? 0 });
  }

  // Team flow
  const flow = cfg.teamFlowEnabled ?? {};
  if (enabledSet.has('cp_to_score') || flow.cp_to_score) cols.push({ key: 'cp_to_score', label: lbl('cp_to_score', 'CP to Score'), isTeam: true, value: (_r, q) => teamFlowMap[q]?.cp_to_score ?? 0 });
  if (enabledSet.has('cp_no_score') || flow.cp_no_score) cols.push({ key: 'cp_no_score', label: lbl('cp_no_score', 'CP No Score'), isTeam: true, value: (_r, q) => teamFlowMap[q]?.cp_no_score ?? 0 });
  if (enabledSet.has('to_to_score') || flow.to_to_score) cols.push({ key: 'to_to_score', label: lbl('to_to_score', 'TO to Score'), isTeam: true, value: (_r, q) => teamFlowMap[q]?.to_to_score ?? 0 });

  return cols;
}

// ─── buildHtml ────────────────────────────────────────────────────────────────
export function buildHtml(opts: {
  cols: Col[]; quarters: string[]; rows: ReportRow[];
  grouped: Record<string, ReportRow[]>; nameMap: Record<string, string>;
  scorelines: Record<string, { home: number; away: number }>;
  teamFlowMap: Record<string, TeamFlow>;
  teamCustomStats: Record<string, Record<string, number>>;
  heading: { title: string; sub: string };
  homeName: string; awayName: string; finalHome: number; finalAway: number;
  enabledStats: StatId[]; playerStyles: Record<string, 'blue' | 'red'>;
  isLandscape: boolean; matchCfg: any;
}): string {
  const { cols, quarters, grouped, nameMap, scorelines, teamFlowMap,
          teamCustomStats, heading, homeName, awayName, finalHome, finalAway,
          playerStyles, isLandscape } = opts;

  const isPlayerRed = (k: string) => playerStyles[k] === 'red';
  const bf = isLandscape ? 12 : 14;
  const cp = isLandscape ? '6px 8px' : '8px 10px';

  const css = `
    html,body{margin:0;padding:0;background:#0b1020;color:#e2e8f0;font:${bf}px/1.5 -apple-system,Segoe UI,Roboto,sans-serif;}
    .wrap{padding:${isLandscape ? '10px' : '16px'};}
    .title,.sub,.final,.scores{${isLandscape ? 'display:none !important;' : ''}}
    .card{background:#10172a;border:1px solid #1e293b;border-radius:12px;padding:${isLandscape ? '6px' : '10px'};margin:${isLandscape ? '6px 0' : '10px 0'};}
    .q{font-weight:800;margin:0 0 6px;}
    ${isLandscape ? '.grid{overflow:auto;touch-action:pan-x pan-y;}' : '.hscroll{overflow-x:auto;}.table-viewport{overflow:auto;max-height:440px;}'}
    ${isLandscape ? '' : 'th{position:sticky;top:0;z-index:3;} th.freeze{z-index:4;}'}
    th.freeze,td.freeze{position:sticky;left:0;z-index:3;background:#10172a;box-shadow:1px 0 0 0 #1e293b;}
    thead th.freeze{z-index:4;} th.num,td.num{text-align:center;}
    td.bad,td.pen,td.step{color:#ef4444;font-weight:800;}
    .teamRow td{background:rgba(14,165,233,0.10);} .totalRow td{background:rgba(120,113,108,0.10);}
    .totalName,.teamName{font-weight:800;}
    table{width:100%;border-collapse:collapse;min-width:600px;}
    th,td{text-align:left;padding:${cp};border-bottom:1px solid #1e293b;white-space:nowrap;}
    th{color:#e2e8f0;background:#0f172a;} td{color:#e5edf6;} th.team-col{color:#7dd3fc;}
    .pill{display:inline-block;padding:2px 8px;border-radius:999px;background:#0ea5e9;color:#001018;font-weight:800;}
    .muted{color:#cbd5e1;}
  `;

  const qs = (q: string) => { const s = scorelines[q] || {home:0,away:0}; return `${s.home}–${s.away}`; };

  const thead = () => `<thead><tr>
    <th class="freeze" style="min-width:${isLandscape?110:90}px">Player</th><th>Pos</th>
    ${cols.map(c => `<th class="num${c.isTeam?' team-col':''}">${c.label}</th>`).join('')}
  </tr></thead>`;

  const qBlock = (q: string) => {
    const data = [...(grouped[q] ?? [])].sort((a, b) => {
      const o = ['GS','GA','WA','C','WD','GD','GK'];
      return o.indexOf(a.position) !== o.indexOf(b.position)
        ? o.indexOf(a.position) - o.indexOf(b.position)
        : a.stint_index - b.stint_index;
    });

    const hasFlow = !!teamFlowMap[q] && Object.values(teamFlowMap[q]).some(v => v > 0);
    const hasTeamCS = Object.values(teamCustomStats[q] || {}).some(v => v > 0);
    if (data.length === 0 && !hasFlow && !hasTeamCS) return '';

    const playerRows = data.map(r => {
      const nm = nameMap[r.player_id] || r.player_id;
      const tds = cols.map(c => {
        if (c.isTeam) return `<td class="num"></td>`;
        const v = Number(c.value(r, q, r.player_id) || 0);
        if (v <= 0) return `<td class="num"></td>`;
        const ex = [c.classOf?.(r, v), isPlayerRed(c.key) ? 'pen' : ''].filter(Boolean).join(' ');
        return `<td class="num${ex ? ' '+ex : ''}">${v}</td>`;
      }).join('');
      return `<tr><td class="freeze">${nm}</td><td><span class="pill">${r.position}</span></td>${tds}</tr>`;
    }).join('');

    const tot = data.reduce((a,r) => { a.attempts+=r.attempts||0; a.goals+=r.goals||0; return a; }, {attempts:0,goals:0});
    const totCells = cols.map(c => {
      if (c.isTeam) return `<td class="num"></td>`;
      const sum = c.key==='goalPct' ? (tot.attempts ? Math.round(100*tot.goals/tot.attempts) : 0)
        : data.reduce((acc,r) => acc+Number(c.value(r,q,r.player_id)||0), 0);
      if (sum<=0) return `<td class="num"></td>`;
      const ex = [c.classOf?.({[c.key]:sum},sum), isPlayerRed(c.key)?'pen':''].filter(Boolean).join(' ');
      return `<td class="num${ex?' '+ex:''}">${sum}</td>`;
    }).join('');

    const teamCells = cols.map(c => {
      if (!c.isTeam) return `<td class="num"></td>`;
      const v = Number(c.value({} as any, q, '') || 0);
      return v > 0 ? `<td class="num${isPlayerRed(c.key)?' pen':''}">${v}</td>` : `<td class="num"></td>`;
    }).join('');

    const s = scorelines[q] || {home:0,away:0};
    const table = `<table>${thead()}<tbody>
      ${playerRows}
      <tr class="totalRow"><td class="freeze totalName">Total</td><td></td>${totCells}</tr>
      <tr class="teamRow"><td class="freeze teamName">Team</td><td></td>${teamCells}</tr>
    </tbody></table>`;

    return isLandscape
      ? `<div class="card"><div class="q">${q} <span class="muted">(${s.home}–${s.away})</span></div><div class="grid">${table}</div></div>`
      : `<div class="card"><div class="q">${q} <span class="muted">(${s.home}–${s.away})</span></div><div class="hscroll"><div class="table-viewport">${table}</div></div></div>`;
  };

  const body = quarters.map(qBlock).filter(Boolean).join('');

  return `<!DOCTYPE html><html><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><style>${css}</style></head>
<body><div class="wrap">
  <div class="title" style="font-weight:800;font-size:${bf+6}px;margin:0 0 6px;">${heading.title}</div>
  <div class="sub" style="color:#cbd5e1;margin-bottom:10px;">${heading.sub}</div>
  <div class="final" style="background:linear-gradient(90deg,${palette.primary},#8b5cf6);padding:8px 12px;border-radius:10px;font-weight:800;display:inline-block;margin:6px 0 10px;">
    Final: ${homeName} ${finalHome}&nbsp;–&nbsp;${finalAway} ${awayName}
  </div>
  <div class="scores muted" style="margin-bottom:10px;">
    Q1 ${qs('Q1')}&nbsp;&nbsp;Q2 ${qs('Q2')}&nbsp;&nbsp;Q3 ${qs('Q3')}&nbsp;&nbsp;Q4 ${qs('Q4')}
  </div>
  ${body || '<p style="color:#64748b;padding:20px">No stats recorded yet.</p>'}
</div></body></html>`;
}

// ─── buildCsv ─────────────────────────────────────────────────────────────────
export function buildCsv(opts: {
  cols: Col[]; quarters: string[]; grouped: Record<string, ReportRow[]>;
  nameMap: Record<string, string>; heading: { title: string; sub: string };
  homeName: string; awayName: string; finalHome: number; finalAway: number;
  scorelines: Record<string, { home: number; away: number }>;
  teamFlowMap: Record<string, TeamFlow>;
  teamCustomStats: Record<string, Record<string, number>>;
  matchCfg: any;
}): string {
  const { cols, quarters, grouped, nameMap, heading, homeName, awayName, finalHome, finalAway, scorelines } = opts;
  const lines: string[] = [
    ['Match', heading.title, heading.sub].join(','),
    ['Final', `${homeName} ${finalHome}-${finalAway} ${awayName}`].join(','),
    ['Score by quarter', ...['Q1','Q2','Q3','Q4'].map(q => { const s=scorelines[q]; return `${q} ${s?`${s.home}-${s.away}`:'0-0'}`; })].join(','),
    ['Quarter','Player','Position', ...cols.map(c => c.label)].join(','),
  ];
  for (const q of quarters) {
    const data = [...(grouped[q]??[])].sort((a,b) => {
      const o=['GS','GA','WA','C','WD','GD','GK'];
      return o.indexOf(a.position)!==o.indexOf(b.position)?o.indexOf(a.position)-o.indexOf(b.position):a.stint_index-b.stint_index;
    });
    for (const r of data) {
      lines.push([q, nameMap[r.player_id]||r.player_id, r.position,
        ...cols.map(c => { if (c.isTeam) return ''; const v=Number(c.value(r,q,r.player_id)||0); return v>0?String(v):''; })].join(','));
    }
    const tot = data.reduce((a,r)=>{a.attempts+=r.attempts||0;a.goals+=r.goals||0;return a;},{attempts:0,goals:0});
    lines.push([q,'Total','', ...cols.map(c => { if(c.isTeam)return ''; if(c.key==='goalPct')return tot.attempts?Math.round(100*tot.goals/tot.attempts):''; const s=data.reduce((acc,r)=>acc+Number(c.value(r,q,r.player_id)||0),0); return s>0?String(s):''; })].join(','));
    lines.push([q,'Team','', ...cols.map(c => { if(!c.isTeam)return ''; const v=Number(c.value({}as any,q,'')||0); return v>0?String(v):''; })].join(','));
  }
  return lines.join('\n');
}

// ─── fetchQuarterRows ─────────────────────────────────────────────────────────
// FIX BUG 5: Query events directly grouped by player+position for a quarter.
// This works even when no lineup record exists (e.g. coach navigated away
// from MatchCenter without the lineup copy running, or stats tapped without lineup).
async function fetchQuarterRowsDirect(matchId: string, q: string): Promise<ReportRow[]> {
  const rows: any[] = await all(
    `SELECT player_id, position_at_time AS position,
       SUM(CASE WHEN type IN ('shot_made','shot_miss') THEN 1 ELSE 0 END) AS attempts,
       SUM(CASE WHEN type='shot_made'         THEN 1 ELSE 0 END) AS goals,
       SUM(CASE WHEN type='assist'            THEN 1 ELSE 0 END) AS assists,
       SUM(CASE WHEN type='feed'              THEN 1 ELSE 0 END) AS feeds,
       SUM(CASE WHEN type='rebound_off'       THEN 1 ELSE 0 END) AS rebound_off,
       SUM(CASE WHEN type='rebound_def'       THEN 1 ELSE 0 END) AS rebound_def,
       SUM(CASE WHEN type='centerpass_receive'THEN 1 ELSE 0 END) AS cpr,
       SUM(CASE WHEN type='penalty'           THEN 1 ELSE 0 END) AS penalties,
       SUM(CASE WHEN type='turnover_won'      THEN 1 ELSE 0 END) AS to_won,
       SUM(CASE WHEN type='turnover_lost'     THEN 1 ELSE 0 END) AS to_lost,
       SUM(CASE WHEN type='interception'      THEN 1 ELSE 0 END) AS interceptions,
       SUM(CASE WHEN type='bad_pass'          THEN 1 ELSE 0 END) AS bad_passes
     FROM event
     WHERE match_id=? AND period_id=?
       AND player_id != '__TEAM__'
       AND position_at_time IS NOT NULL
       AND position_at_time != ''
       AND type NOT LIKE 'custom:%'
     GROUP BY player_id, position_at_time`,
    [matchId, q]
  );

  // Also get custom player stats for this quarter
  const customRows: any[] = await all(
    `SELECT player_id, position_at_time AS position, type AS stat_id, COUNT(*) AS c
     FROM event
     WHERE match_id=? AND period_id=?
       AND player_id != '__TEAM__'
       AND type LIKE 'custom:%'
     GROUP BY player_id, position_at_time, type`,
    [matchId, q]
  );

  // Merge custom stats into the row map
  const customMap: Record<string, Record<string, number>> = {};
  for (const r of customRows || []) {
    const k = `${r.player_id}::${r.position}`;
    if (!customMap[k]) customMap[k] = {};
    customMap[k][r.stat_id] = r.c;
  }

  return (rows || [])
    .filter(r => r.player_id && r.position)
    .map((r, i): ReportRow => ({
      period_id:     q,
      position:      r.position,
      player_id:     r.player_id,
      stint_index:   i,
      attempts:      r.attempts      || 0,
      goals:         r.goals         || 0,
      assists:       r.assists        || 0,
      feeds:         r.feeds          || 0,
      rebound_off:   r.rebound_off    || 0,
      rebound_def:   r.rebound_def    || 0,
      cpr:           r.cpr            || 0,
      penalties:     r.penalties      || 0,
      to_won:        r.to_won         || 0,
      to_lost:       r.to_lost        || 0,
      interceptions: r.interceptions  || 0,
      bad_pass:      r.bad_passes     || 0,
      ...(customMap[`${r.player_id}::${r.position}`] || {}),
    }));
}

// ─── useReportData hook ───────────────────────────────────────────────────────
export function useReportData(matchId: string | null | undefined) {
  const [rows, setRows]                       = useState<ReportRow[]>([]);
  const [nameMap, setNameMap]                 = useState<Record<string, string>>({});
  const [scorelines, setScorelines]           = useState<Record<string, { home: number; away: number }>>({});
  const [teamFlowMap, setTeamFlowMap]         = useState<Record<string, TeamFlow>>({});
  const [teamCustomStats, setTeamCustomStats] = useState<Record<string, Record<string, number>>>({});
  const [heading, setHeading]                 = useState({ title: '', sub: '' });
  const [homeName, setHomeName]               = useState('Home');
  const [awayName, setAwayName]               = useState('Away');
  const [matchDate, setMatchDate]             = useState('');
  const [matchCfg, setMatchCfg]               = useState<any>(null);
  const [enabledStats, setEnabledStats]       = useState<StatId[]>([]);
  const [playerStyles, setPlayerStyles]       = useState<Record<string, 'blue' | 'red'>>({});
  const [labelOverrides, setLabelOverrides]   = useState<Record<string, string>>({});
  const [libLabels, setLibLabels]             = useState<Record<string, string>>({});
  const [loading, setLoading]                 = useState(false);

  useEffect(() => {
    if (!matchId) {
      setRows([]); setScorelines({}); setTeamFlowMap({}); setMatchCfg(null);
      setHeading({ title:'', sub:'' }); setEnabledStats([]); setLibLabels({});
      return;
    }
    let alive = true;
    setLoading(true);

    (async () => {
      try {
        await initDb();
        const [m, playersMapRaw, ovs, cfg, lib, tallies] = await Promise.all([
          getMatch(matchId),
          getPlayersMap(),
          LabelStore.getLabelOverrides(),
          getMatchConfig(String(matchId)),
          getStatLibrary(),
          getAllTallies(String(matchId)),
        ]);
        if (!alive) return;

        const nm: Record<string, string> = {};
        Object.values(playersMapRaw).forEach((p: any) => { nm[p.id] = p.name; });
        setNameMap(nm);
        setLabelOverrides(ovs ?? {});

        const parts: string[] = [];
        if (m?.match_date)  parts.push(m.match_date);
        if (m?.competition) parts.push(m.competition);
        if (m?.venue)       parts.push(m.venue);
        setHeading({ title: m ? `${m.home_team??'Home'} vs ${m.away_team??'Away'}` : `Match`, sub: parts.join(' - ') });
        setHomeName(m?.home_team || 'Home');
        setAwayName(m?.away_team || 'Away');
        setMatchDate(m?.match_date || '');
        setMatchCfg(cfg);
        setPlayerStyles(cfg.playerStyles ?? {});

        const labels: Record<string, string> = {};
        (lib as any[]).forEach(item => { labels[item.id] = item.label; });
        setLibLabels(labels);

        // ── Load rows for ALL four quarters ─────────────────────────────────
        // Strategy: try stint-based first (preserves sub history), fall back to
        // direct event query if stints return nothing (Q2-Q4 without lineup records)
        const rowsOut: ReportRow[] = [];
        const tcsMap: Record<string, Record<string, number>> = {};

        for (const q of ['Q1','Q2','Q3','Q4']) {
          const tcs = await getCustomTeamStatsByQuarter(matchId, q);
          tcsMap[q] = tcs;

          // Try stint-based approach first
          let qRows: ReportRow[] = [];
          try {
            const stints = await getPositionStintsForQuarter(matchId, q);
            if (stints.length > 0) {
              for (const stint of stints) {
                const stats: any = await getStatsForPositionStint(matchId, stint);
                const customStats: Record<string, number> = {};

                // Get custom stats directly from events for this player+position+quarter
                const custRows: any[] = await all(
                  `SELECT type AS stat_id, COUNT(*) AS c FROM event
                   WHERE match_id=? AND period_id=? AND player_id=?
                     AND position_at_time=? AND type LIKE 'custom:%'
                   GROUP BY type`,
                  [matchId, q, stint.player_id, stint.position]
                );
                for (const r of custRows || []) { if (r?.stat_id) customStats[r.stat_id] = r.c; }

                // Tally fallback for edge cases
                if (tallies?.player) {
                  Object.entries(tallies.player).forEach(([key, statMap]: [string, any]) => {
                    if (key.startsWith(q) && key.includes(stint.player_id)) {
                      Object.entries(statMap as Record<string, number>).forEach(([sid, count]) => {
                        if (!customStats[sid]) customStats[sid] = count as number;
                      });
                    }
                  });
                }

                qRows.push({
                  period_id: q, position: stint.position,
                  player_id: stint.player_id, stint_index: stint.index ?? 0,
                  attempts:      stats?.attempts      || 0,
                  goals:         stats?.goals         || 0,
                  assists:       stats?.assists       || 0,
                  feeds:         stats?.feeds         || 0,
                  rebound_off:   stats?.rebound_off   || 0,
                  rebound_def:   stats?.rebound_def   || 0,
                  cpr:           stats?.cpr           || 0,
                  penalties:     stats?.penalties     || 0,
                  to_won:        stats?.to_won        || 0,
                  to_lost:       stats?.to_lost       || 0,
                  interceptions: stats?.interceptions || 0,
                  bad_pass:      stats?.bad_passes || stats?.bad_pass || 0,
                  ...customStats,
                });
              }
            }
          } catch (e) {
            console.warn(`Stint query failed for ${q}, falling back to direct`, e);
          }

          // FIX BUG 5: If stints returned nothing, query events directly
          // This covers Q2/Q3/Q4 where lineup copy may not have run
          if (qRows.length === 0) {
            qRows = await fetchQuarterRowsDirect(matchId, q);
          }

          rowsOut.push(...qRows);
        }

        if (!alive) return;
        setRows(rowsOut);
        setTeamCustomStats(tcsMap);

        const sl = await getQuarterScorelines(matchId);
        const sMap: Record<string, { home: number; away: number }> = {};
        sl.forEach((r: any) => { sMap[r.period_id] = { home: r.home||0, away: r.away||0 }; });
        if (alive) setScorelines(sMap);

        const tflow = await getTeamFlowByQuarter(matchId);
        if (alive) setTeamFlowMap(tflow || {});

        const enabled = new Set<StatId>();
        (cfg.player||[]).forEach((s: string) => enabled.add(normalizeBuiltin(s) as StatId));
        (cfg.team  ||[]).forEach((s: string) => enabled.add(normalizeBuiltin(s) as StatId));
        const fl = cfg.teamFlowEnabled || {};
        if (fl.cp_to_score) enabled.add('cp_to_score');
        if (fl.cp_no_score) enabled.add('cp_no_score');
        if (fl.to_to_score) enabled.add('to_to_score');
        if (enabled.size === 0) { enabled.add('goal'); enabled.add('miss'); }
        if (alive) setEnabledStats(Array.from(enabled));

      } catch (err) {
        console.error('useReportData error', err);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [matchId]);

  const grouped = rows.reduce<Record<string, ReportRow[]>>((m, r) => {
    (m[r.period_id] ||= []).push(r); return m;
  }, {});

  // Include all quarters that have ANY data (stints, flow, or team custom)
  const quarters = Array.from(new Set([
    ...Object.keys(grouped),
    ...Object.keys(teamFlowMap).filter(q => Object.values(teamFlowMap[q]).some(v => v > 0)),
    ...Object.keys(teamCustomStats).filter(q => Object.values(teamCustomStats[q]).some(v => v > 0)),
  ])).filter(Boolean).sort();

  const finalHome = ['Q1','Q2','Q3','Q4'].reduce((a,q) => a+(scorelines[q]?.home??0), 0);
  const finalAway = ['Q1','Q2','Q3','Q4'].reduce((a,q) => a+(scorelines[q]?.away??0), 0);

  const cols = buildColumns(enabledStats, matchCfg, teamFlowMap, teamCustomStats, libLabels, labelOverrides, playerStyles);

  return {
    rows, nameMap, scorelines, teamFlowMap, teamCustomStats,
    heading, homeName, awayName, matchDate, matchCfg,
    enabledStats, playerStyles, labelOverrides, libLabels,
    loading, grouped, quarters, finalHome, finalAway, cols,
  };
}
