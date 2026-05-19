// src/storage/matchConfig.ts
import AsyncStorage from '@react-native-async-storage/async-storage';

export type TeamFlowFlags = {
  cp_to_score?: boolean;
  cp_no_score?: boolean;
  to_to_score?: boolean;
};

export type MatchTrackConfig = {
  version?: number;
  player: string[];
  team: string[];
  teamFlowEnabled?: TeamFlowFlags;
  playerStyles?: Record<string, 'blue' | 'red'>;
  quarterDuration?: number; // minutes
  notes?: string;           // pre-match game plan
};

const KEY = (matchId: string) => `matchConfig:${matchId}`;
const DEFAULT_CONFIG_KEY = 'defaultMatchConfig';

const uniq = (arr: any): string[] => {
  if (!Array.isArray(arr)) return [];
  const out: string[] = [];
  for (const v of arr) {
    const s = String(v);
    if (s && !out.includes(s)) out.push(s);
  }
  return out;
};

const bool = (v: any, def: boolean) => (v === true || v === false ? v : def);

/** Accepts any legacy/new shape and returns canonical MatchTrackConfig. */
export function normalizeMatchConfig(input: any): MatchTrackConfig {
  // FIX: use let variables, not const, so filter mutations work correctly
  let player = uniq(input?.player) ?? uniq(input?.playerIds) ?? uniq(input?.playerStats) ?? [];
  let team   = uniq(input?.team)   ?? uniq(input?.teamIds)   ?? uniq(input?.teamStats)   ?? [];

  const tfeIn =
    input?.teamFlowEnabled && typeof input.teamFlowEnabled === 'object'
      ? input.teamFlowEnabled : undefined;

  const teamFlowEnabled: TeamFlowFlags = {
    cp_to_score: bool(tfeIn?.cp_to_score ?? input?.cp_to_score, true),
    cp_no_score: bool(tfeIn?.cp_no_score ?? input?.cp_no_score, true),
    to_to_score: bool(tfeIn?.to_to_score ?? input?.to_to_score, true),
  };

  const playerStyles: Record<string, 'blue' | 'red'> =
    input?.playerStyles && typeof input.playerStyles === 'object'
      ? { ...input.playerStyles } : {};

  return {
    version: 2,
    player,
    team,
    teamFlowEnabled,
    playerStyles,
    quarterDuration: input?.quarterDuration ?? 15,
    notes: input?.notes ?? '',
  };
}

export function makeDefaultConfig(): MatchTrackConfig {
  return {
    version: 2,
    player: [],
    team: [],
    teamFlowEnabled: { cp_to_score: true, cp_no_score: true, to_to_score: true },
    playerStyles: {},
    quarterDuration: 15,
    notes: '',
  };
}

export async function getMatchConfig(matchId: string): Promise<MatchTrackConfig> {
  try {
    const raw = await AsyncStorage.getItem(KEY(matchId));
    if (!raw) return makeDefaultConfig();
    return normalizeMatchConfig(JSON.parse(raw));
  } catch {
    return makeDefaultConfig();
  }
}

export async function saveMatchConfig(matchId: string, cfg: any): Promise<void> {
  const canonical = normalizeMatchConfig(cfg);
  await AsyncStorage.setItem(KEY(matchId), JSON.stringify(canonical));
}

/** Save the current config as the global default for new matches */
export async function saveDefaultConfig(cfg: MatchTrackConfig): Promise<void> {
  await AsyncStorage.setItem(DEFAULT_CONFIG_KEY, JSON.stringify(normalizeMatchConfig(cfg)));
}

/** Load the saved default config, or fall back to blank default */
export async function getDefaultConfig(): Promise<MatchTrackConfig> {
  try {
    const raw = await AsyncStorage.getItem(DEFAULT_CONFIG_KEY);
    if (!raw) return makeDefaultConfig();
    return normalizeMatchConfig(JSON.parse(raw));
  } catch {
    return makeDefaultConfig();
  }
}
