// src/types/stats.ts

export const POSITIONS_ORDER = ['GS','GA','WA','C','WD','GD','GK'] as const;
export type Position = typeof POSITIONS_ORDER[number];

/** Built-in player stat keys supported end-to-end. */
export type BuiltinStat =
  | 'goal'
  | 'miss'
  | 'assist'         // displayed as “Stepping”
  | 'feed'
  | 'rebound_off'    // separate stat
  | 'rebound_def'    // separate stat
  | 'cpr'
  | 'penalty'
  | 'bad_pass'
  | 'interception'
  | 'to_won'
  | 'to_lost';

/** Built-in Team Flow ids (for team-only buttons, not editable) */
export const TEAM_FLOW_IDS = ['cp_to_score','cp_no_score','to_to_score'] as const;
export type TeamFlowId = typeof TEAM_FLOW_IDS[number];

/** Custom stats get id like "custom:abcd…" */
export type CustomStatId = `custom:${string}`;
export type StatId = BuiltinStat | CustomStatId;
export type StatScope = 'player' | 'team';

/** Color style for player stat buttons */
export type PlayerButtonColor = 'blue' | 'red';

export type CustomStatDef = {
  id: CustomStatId;
  label: string;
  scope: StatScope;     // 'player' or 'team'
  archived?: boolean;
};

/** ALL built-ins (remove old 'rebound') */
export const ALL_BUILTIN_STATS: BuiltinStat[] = [
  'goal','miss','assist','feed',
  'rebound_off','rebound_def',   // ← split stats
  'cpr','penalty','bad_pass','interception','to_won','to_lost',
];

/** Default player stat selection */
export const DEFAULT_PLAYER_STATS: BuiltinStat[] = ['goal','miss'];

/** Default label map (update to split rebounds) */
export const STAT_LABEL: Record<BuiltinStat, string> = {
  goal: 'Goal',
  miss: 'Miss',
  assist: 'Stepping',
  feed: 'Feeds',
  rebound_off: 'Reb Offence',   // ← updated
  rebound_def: 'Reb Defence',   // ← updated
  cpr: 'CP Receives',
  penalty: 'Penalties',
  bad_pass: 'Bad Pass',
  interception: 'Interceptions',
  to_won: 'TO Won',
  to_lost: 'TO Lost',
};

/** Team Flow labels (fixed, not editable) */
export const TEAM_FLOW_LABELS: Record<TeamFlowId, string> = {
  cp_to_score: 'CP to Score',
  cp_no_score: 'CP No Score',
  to_to_score: 'TO to Score',
};

/** Row shape used inside Reports logic */
export type RowLike = {
  attempts: number; goals: number;
  assists: number; feeds: number;
  rebound_off: number; rebound_def: number;  // ← updated row fields
  cpr: number; penalties: number; interceptions: number; to_won: number; to_lost: number; bad_pass: number;
};

/**
 * Mapping built-in player stats -> your Report row fields.
 */
export const BUILTIN_TO_REPORT_FIELD: Partial<Record<BuiltinStat, keyof RowLike>> = {
  assist:       'assists',
  feed:         'feeds',
  rebound_off:  'rebound_off',   // ← updated
  rebound_def:  'rebound_def',   // ← updated
  cpr:          'cpr',
  penalty:      'penalties',
  bad_pass:     'bad_pass',
  interception: 'interceptions',
  to_won:       'to_won',
  to_lost:      'to_lost',
};
