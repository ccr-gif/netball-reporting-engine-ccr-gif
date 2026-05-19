// src/hooks/useAnalytics.ts
// Central analytics engine — aggregates SQLite event data across all matches

import { useEffect, useState } from 'react';
import { all, get } from '../storage/db';
import { listAllMatchesBasic, listPlayers, getPositionStintsForQuarter } from '../storage/repository';
import { initDb } from '../storage/db';

export type MatchBasic = {
  id: string; home_team: string; away_team: string;
  match_date: string; competition?: string | null;
};

export type PlayerBasic = { id: string; first_name: string; last_name: string; name: string };

// ── 1. Player × Position heatmap ────────────────────────────────────────────
export type PosPerf = {
  playerId: string; position: string;
  quarters: number;     // how many quarters played this position
  attempts: number; goals: number;
  goalPct: number;      // 0-100
  penalties: number; feeds: number; assists: number;
  interceptions: number; turnoversLost: number;
  score: number;        // composite 0-100 "performance score"
};

// ── 2. Player season trend ───────────────────────────────────────────────────
export type PlayerMatchStat = {
  matchId: string; matchLabel: string; matchDate: string;
  goals: number; attempts: number; goalPct: number;
  penalties: number; feeds: number; assists: number;
  interceptions: number; turnoversLost: number;
  quartersPlayed: number;
};

export type PlayerTrend = {
  playerId: string;
  matches: PlayerMatchStat[];
};

// ── 3. Quarter momentum ──────────────────────────────────────────────────────
export type QuarterMomentum = {
  matchId: string; matchLabel: string;
  q1Diff: number; q2Diff: number; q3Diff: number; q4Diff: number;
  finalDiff: number;
};

// ── 4. On-court combinations ─────────────────────────────────────────────────
export type PairCombination = {
  playerIds: [string, string];
  quartersTogther: number;
  homeGoals: number; homeAttempts: number;
  goalPct: number;
  scoreDiff: number; // avg score diff per quarter when they share court
};

// ── 5. CP & Turnover ─────────────────────────────────────────────────────────
export type CPTurnoverMatch = {
  matchId: string; matchLabel: string; matchDate: string;
  cpToScore: number; cpNoScore: number; cpConversionPct: number;
  toWon: number; toScored: number; toConversionPct: number;
  totalPenalties: number;
  penaltyByPosition: Record<string, number>;
};

// ── Coach summary insight ────────────────────────────────────────────────────
export type CoachInsight = { emoji: string; text: string; type: 'positive' | 'warning' | 'info' };

// ── Main hook ─────────────────────────────────────────────────────────────────
export function useAnalytics(filterMatchId: string | 'all') {
  const [loading, setLoading]           = useState(true);
  const [players, setPlayers]           = useState<PlayerBasic[]>([]);
  const [matches, setMatches]           = useState<MatchBasic[]>([]);
  const [posPerf, setPosPerf]           = useState<PosPerf[]>([]);
  const [playerTrends, setPlayerTrends] = useState<PlayerTrend[]>([]);
  const [momentum, setMomentum]         = useState<QuarterMomentum[]>([]);
  const [pairs, setPairs]               = useState<PairCombination[]>([]);
  const [cpTurnover, setCpTurnover]     = useState<CPTurnoverMatch[]>([]);
  const [insights, setInsights]         = useState<CoachInsight[]>([]);

  useEffect(() => {
    let alive = true;
    setLoading(true);

    (async () => {
      try {
        await initDb();
        const [allMatches, allPlayers] = await Promise.all([
          listAllMatchesBasic(),
          listPlayers(),
        ]);
        if (!alive) return;

        const playerList: PlayerBasic[] = (allPlayers as any[]).map(p => ({
          id: p.id,
          first_name: p.first_name,
          last_name: p.last_name,
          name: `${p.first_name} ${p.last_name}`.trim(),
        }));
        const matchList: MatchBasic[] = allMatches as any[];
        const playerById = Object.fromEntries(playerList.map(p => [p.id, p]));

        const scopedMatches = filterMatchId === 'all'
          ? matchList
          : matchList.filter(m => m.id === filterMatchId);

        if (!alive) return;
        setPlayers(playerList);
        setMatches(matchList);

        // ── 1. Player × Position ────────────────────────────────────────────
        const posPerfMap: Record<string, PosPerf> = {};

        for (const match of scopedMatches) {
          for (const q of ['Q1','Q2','Q3','Q4']) {
            const stints = await getPositionStintsForQuarter(match.id, q);
            for (const stint of stints) {
              if (!stint.player_id || !stint.position) continue;
              const key = `${stint.player_id}::${stint.position}`;
              if (!posPerfMap[key]) {
                posPerfMap[key] = {
                  playerId: stint.player_id, position: stint.position,
                  quarters: 0, attempts: 0, goals: 0, goalPct: 0,
                  penalties: 0, feeds: 0, assists: 0,
                  interceptions: 0, turnoversLost: 0, score: 0,
                };
              }
              const row = posPerfMap[key];
              row.quarters += 1;

              const stats: any = await get(
                `SELECT
                  SUM(CASE WHEN type IN ('shot_made','shot_miss') THEN 1 ELSE 0 END) AS attempts,
                  SUM(CASE WHEN type='shot_made' THEN 1 ELSE 0 END) AS goals,
                  SUM(CASE WHEN type='penalty' THEN 1 ELSE 0 END) AS penalties,
                  SUM(CASE WHEN type='feed' THEN 1 ELSE 0 END) AS feeds,
                  SUM(CASE WHEN type='assist' THEN 1 ELSE 0 END) AS assists,
                  SUM(CASE WHEN type='interception' THEN 1 ELSE 0 END) AS interceptions,
                  SUM(CASE WHEN type='turnover_lost' THEN 1 ELSE 0 END) AS to_lost
                FROM event
                WHERE match_id=? AND period_id=? AND player_id=? AND position_at_time=?
                  AND ts >= ? AND (? IS NULL OR ts < ?)`,
                [match.id, q, stint.player_id, stint.position,
                 stint.start_ts, stint.end_ts, stint.end_ts]
              );
              if (stats) {
                row.attempts       += stats.attempts       || 0;
                row.goals          += stats.goals          || 0;
                row.penalties      += stats.penalties      || 0;
                row.feeds          += stats.feeds          || 0;
                row.assists        += stats.assists        || 0;
                row.interceptions  += stats.interceptions  || 0;
                row.turnoversLost  += stats.to_lost        || 0;
              }
            }
          }
        }

        // Compute goalPct and composite score
        const posPerfList = Object.values(posPerfMap).map(r => {
          const gp = r.attempts > 0 ? Math.round(100 * r.goals / r.attempts) : 0;
          // Score: weighted formula (shooting positions weight goals, defensive positions weight interceptions)
          const isShooter = ['GS','GA'].includes(r.position);
          const isDef     = ['GD','GK'].includes(r.position);
          let score = 50;
          if (isShooter) score = gp * 0.6 + Math.min(r.feeds / Math.max(r.quarters,1), 5) * 4 - Math.min(r.penalties / Math.max(r.quarters,1), 5) * 5;
          else if (isDef) score = Math.min(r.interceptions / Math.max(r.quarters,1), 6) * 8 - Math.min(r.penalties / Math.max(r.quarters,1), 5) * 5 + 30;
          else score = Math.min(r.feeds / Math.max(r.quarters,1), 8) * 5 + Math.min(r.assists / Math.max(r.quarters,1), 5) * 4 - Math.min(r.penalties / Math.max(r.quarters,1), 5) * 5 + 20;
          return { ...r, goalPct: gp, score: Math.max(0, Math.min(100, Math.round(score))) };
        });
        if (alive) setPosPerf(posPerfList);

        // ── 2. Player season trends ─────────────────────────────────────────
        const trendsMap: Record<string, PlayerTrend> = {};
        for (const match of scopedMatches) {
          const matchLabel = `${match.home_team} v ${match.away_team}`;
          for (const q of ['Q1','Q2','Q3','Q4']) {
            const stints = await getPositionStintsForQuarter(match.id, q);
            for (const stint of stints) {
              if (!stint.player_id) continue;
              if (!trendsMap[stint.player_id]) trendsMap[stint.player_id] = { playerId: stint.player_id, matches: [] };
              const trend = trendsMap[stint.player_id];
              let ms = trend.matches.find(m => m.matchId === match.id);
              if (!ms) {
                ms = { matchId: match.id, matchLabel, matchDate: match.match_date, goals: 0, attempts: 0, goalPct: 0, penalties: 0, feeds: 0, assists: 0, interceptions: 0, turnoversLost: 0, quartersPlayed: 0 };
                trend.matches.push(ms);
              }
              ms.quartersPlayed += 1;
              const stats: any = await get(
                `SELECT
                  SUM(CASE WHEN type IN ('shot_made','shot_miss') THEN 1 ELSE 0 END) AS attempts,
                  SUM(CASE WHEN type='shot_made' THEN 1 ELSE 0 END) AS goals,
                  SUM(CASE WHEN type='penalty' THEN 1 ELSE 0 END) AS penalties,
                  SUM(CASE WHEN type='feed' THEN 1 ELSE 0 END) AS feeds,
                  SUM(CASE WHEN type='assist' THEN 1 ELSE 0 END) AS assists,
                  SUM(CASE WHEN type='interception' THEN 1 ELSE 0 END) AS interceptions,
                  SUM(CASE WHEN type='turnover_lost' THEN 1 ELSE 0 END) AS to_lost
                FROM event WHERE match_id=? AND period_id=? AND player_id=?
                  AND ts >= ? AND (? IS NULL OR ts < ?)`,
                [match.id, q, stint.player_id, stint.start_ts, stint.end_ts, stint.end_ts]
              );
              if (stats) {
                ms.attempts      += stats.attempts || 0;
                ms.goals         += stats.goals    || 0;
                ms.penalties     += stats.penalties || 0;
                ms.feeds         += stats.feeds    || 0;
                ms.assists       += stats.assists  || 0;
                ms.interceptions += stats.interceptions || 0;
                ms.turnoversLost += stats.to_lost  || 0;
              }
            }
          }
          // Compute goalPct per match
          Object.values(trendsMap).forEach(t => {
            t.matches.forEach(m => {
              m.goalPct = m.attempts > 0 ? Math.round(100 * m.goals / m.attempts) : 0;
            });
          });
        }
        if (alive) setPlayerTrends(Object.values(trendsMap));

        // ── 3. Quarter momentum ─────────────────────────────────────────────
        const momentumList: QuarterMomentum[] = [];
        for (const match of scopedMatches) {
          const qScores: Record<string, { home: number; away: number }> = {};
          for (let q = 1; q <= 4; q++) {
            const row: any = await get(
              `SELECT home_score, away_score FROM period WHERE match_id=? AND number=?`,
              [match.id, q]
            );
            qScores[`Q${q}`] = { home: row?.home_score || 0, away: row?.away_score || 0 };
          }
          const diff = (q: string) => (qScores[q]?.home || 0) - (qScores[q]?.away || 0);
          const finalH = ['Q1','Q2','Q3','Q4'].reduce((a, q) => a + (qScores[q]?.home || 0), 0);
          const finalA = ['Q1','Q2','Q3','Q4'].reduce((a, q) => a + (qScores[q]?.away || 0), 0);
          momentumList.push({
            matchId: match.id,
            matchLabel: `${match.home_team} v ${match.away_team}`,
            q1Diff: diff('Q1'), q2Diff: diff('Q2'), q3Diff: diff('Q3'), q4Diff: diff('Q4'),
            finalDiff: finalH - finalA,
          });
        }
        if (alive) setMomentum(momentumList);

        // ── 4. On-court pair combinations ───────────────────────────────────
        const pairMap: Record<string, PairCombination> = {};
        for (const match of scopedMatches) {
          for (const q of ['Q1','Q2','Q3','Q4']) {
            const stints = await getPositionStintsForQuarter(match.id, q);
            const playerIdsThisQ = [...new Set(stints.map(s => s.player_id).filter(Boolean))];
            // Quarter score diff
            const row: any = await get(
              `SELECT home_score, away_score FROM period WHERE match_id=? AND number=?`,
              [match.id, parseInt(q[1])]
            );
            const qHome = row?.home_score || 0;
            const qAway = row?.away_score || 0;
            const qDiff = qHome - qAway;

            // All pairs
            for (let i = 0; i < playerIdsThisQ.length; i++) {
              for (let j = i + 1; j < playerIdsThisQ.length; j++) {
                const a = playerIdsThisQ[i], b = playerIdsThisQ[j];
                const key = [a, b].sort().join('::');
                if (!pairMap[key]) {
                  pairMap[key] = {
                    playerIds: [a, b].sort() as [string, string],
                    quartersTogther: 0, homeGoals: 0, homeAttempts: 0,
                    goalPct: 0, scoreDiff: 0,
                  };
                }
                pairMap[key].quartersTogther += 1;
                pairMap[key].homeGoals += qHome;
                pairMap[key].homeAttempts += qHome + qAway;
                pairMap[key].scoreDiff += qDiff;
              }
            }
          }
        }
        const pairList = Object.values(pairMap)
          .filter(p => p.quartersTogther >= 2)
          .map(p => ({
            ...p,
            goalPct: p.homeAttempts > 0 ? Math.round(100 * p.homeGoals / p.homeAttempts) : 0,
            scoreDiff: p.quartersTogther > 0 ? Math.round(p.scoreDiff / p.quartersTogther * 10) / 10 : 0,
          }))
          .sort((a, b) => b.scoreDiff - a.scoreDiff)
          .slice(0, 20);
        if (alive) setPairs(pairList);

        // ── 5. CP & Turnover ─────────────────────────────────────────────────
        const cpList: CPTurnoverMatch[] = [];
        for (const match of scopedMatches) {
          const row: any = await get(
            `SELECT
              SUM(CASE WHEN type='cp_to_score' THEN 1 ELSE 0 END) AS cpScore,
              SUM(CASE WHEN type='cp_no_score' THEN 1 ELSE 0 END) AS cpNo,
              SUM(CASE WHEN type='to_to_score' THEN 1 ELSE 0 END) AS toScore,
              SUM(CASE WHEN type='turnover_won' THEN 1 ELSE 0 END) AS toWon,
              SUM(CASE WHEN type='penalty' THEN 1 ELSE 0 END) AS penalties
            FROM event WHERE match_id=?`,
            [match.id]
          );
          const penByPos: any[] = await all(
            `SELECT position_at_time AS pos, COUNT(*) AS c
             FROM event WHERE match_id=? AND type='penalty' AND position_at_time IS NOT NULL
             GROUP BY position_at_time`,
            [match.id]
          );
          const penMap: Record<string, number> = {};
          (penByPos || []).forEach(r => { if (r.pos) penMap[r.pos] = r.c; });

          const cpScore = row?.cpScore || 0;
          const cpNo    = row?.cpNo    || 0;
          const toWon   = row?.toWon   || 0;
          const toScore = row?.toScore || 0;
          cpList.push({
            matchId: match.id,
            matchLabel: `${match.home_team} v ${match.away_team}`,
            matchDate: match.match_date,
            cpToScore: cpScore, cpNoScore: cpNo,
            cpConversionPct: (cpScore + cpNo) > 0 ? Math.round(100 * cpScore / (cpScore + cpNo)) : 0,
            toWon, toScored: toScore,
            toConversionPct: toWon > 0 ? Math.round(100 * toScore / toWon) : 0,
            totalPenalties: row?.penalties || 0,
            penaltyByPosition: penMap,
          });
        }
        if (alive) setCpTurnover(cpList);

        // ── Coach insights ────────────────────────────────────────────────────
        const insightList: CoachInsight[] = [];

        // Best position combo for each position
        const POSITIONS = ['GS','GA','WA','C','WD','GD','GK'];
        for (const pos of POSITIONS) {
          const posRows = posPerfList.filter(r => r.position === pos && r.quarters >= 2);
          if (posRows.length < 2) continue;
          const best = [...posRows].sort((a, b) => b.score - a.score)[0];
          const worst = [...posRows].sort((a, b) => a.score - b.score)[0];
          const bestPlayer = playerById[best.playerId];
          if (!bestPlayer || best.playerId === worst.playerId) continue;
          if (['GS','GA'].includes(pos) && best.attempts > 0) {
            insightList.push({ emoji: '🎯', type: 'positive', text: `${bestPlayer.name} is your best ${pos} with ${best.goalPct}% shooting over ${best.quarters} quarters` });
          } else if (['GD','GK'].includes(pos) && best.interceptions > 0) {
            insightList.push({ emoji: '🛡️', type: 'positive', text: `${bestPlayer.name} leads at ${pos} with ${best.interceptions} intercepts over ${best.quarters} quarters` });
          }
        }

        // Worst Q pattern
        if (momentumList.length >= 3) {
          const avgDiffs = [1,2,3,4].map(q => {
            const key = `q${q}Diff` as keyof QuarterMomentum;
            const vals = momentumList.map(m => m[key] as number);
            return vals.reduce((a, b) => a + b, 0) / vals.length;
          });
          const worstQ = avgDiffs.indexOf(Math.min(...avgDiffs)) + 1;
          const bestQ  = avgDiffs.indexOf(Math.max(...avgDiffs)) + 1;
          if (avgDiffs[worstQ - 1] < -1) {
            insightList.push({ emoji: '⚠️', type: 'warning', text: `Q${worstQ} is your weakest quarter — averaging ${Math.abs(avgDiffs[worstQ-1]).toFixed(1)} goals behind across ${momentumList.length} matches` });
          }
          if (avgDiffs[bestQ - 1] > 1) {
            insightList.push({ emoji: '⚡', type: 'positive', text: `Q${bestQ} is your strongest quarter — you outscore opponents by an average of ${avgDiffs[bestQ-1].toFixed(1)} goals` });
          }
        }

        // CP conversion
        if (cpList.length > 0) {
          const avgCP = cpList.reduce((a, m) => a + m.cpConversionPct, 0) / cpList.length;
          if (avgCP >= 65) insightList.push({ emoji: '✅', type: 'positive', text: `Strong centre pass conversion at ${Math.round(avgCP)}% — well above average` });
          else if (avgCP < 50 && cpList.some(m => m.cpToScore + m.cpNoScore > 2)) insightList.push({ emoji: '⚠️', type: 'warning', text: `Centre pass conversion at ${Math.round(avgCP)}% — work on CP set plays` });
        }

        // High penalty position
        const penTotals: Record<string, number> = {};
        cpList.forEach(m => { Object.entries(m.penaltyByPosition).forEach(([pos, c]) => { penTotals[pos] = (penTotals[pos] || 0) + c; }); });
        const penEntries = Object.entries(penTotals).sort((a, b) => b[1] - a[1]);
        if (penEntries.length > 0 && penEntries[0][1] >= 3) {
          insightList.push({ emoji: '🚨', type: 'warning', text: `${penEntries[0][0]} has the most penalties (${penEntries[0][1]} total) — focus on discipline in this position` });
        }

        // Best on-court pair
        if (pairList.length > 0) {
          const best = pairList[0];
          const [pa, pb] = best.playerIds.map(id => playerById[id]?.name || id);
          if (best.scoreDiff > 0) {
            insightList.push({ emoji: '🤝', type: 'positive', text: `${pa} & ${pb} are your best pair — +${best.scoreDiff} avg score diff over ${best.quartersTogther} quarters together` });
          }
        }

        if (alive) setInsights(insightList.slice(0, 5));

      } catch (err) {
        console.error('useAnalytics error', err);
      } finally {
        if (alive) setLoading(false);
      }
    })();

    return () => { alive = false; };
  }, [filterMatchId]);

  return { loading, players, matches, posPerf, playerTrends, momentum, pairs, cpTurnover, insights };
}
