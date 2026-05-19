// src/storage/customStatTallies.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CustomStatId, StatId } from '../types/stats';

type PlayerKey = string; // `${periodId}|${playerId}`

type PlayerTallies = { [playerKey: PlayerKey]: { [statId in CustomStatId]?: number } };
type TeamTallies   = { [periodId: string]     : { [statId in CustomStatId]?: number } };

type StoreShape = { player: PlayerTallies; team: TeamTallies; };

const KEY = (matchId: string) => `custom_tally::${matchId}`;

async function load(matchId: string): Promise<StoreShape> {
  try {
    const raw = await AsyncStorage.getItem(KEY(matchId));
    if (!raw) return { player: {}, team: {} };
    const obj = JSON.parse(raw);
    return obj && typeof obj === 'object' ? obj : { player: {}, team: {} };
  } catch {
    return { player: {}, team: {} };
  }
}
async function save(matchId: string, data: StoreShape) {
  await AsyncStorage.setItem(KEY(matchId), JSON.stringify(data));
}

export async function incPlayerCustom(
  matchId: string, 
  periodId: string, 
  playerId: string, 
  statId: StatId,
  delta: number = 1
  ) {
  if (!statId.startsWith('custom:')) return;
  
  const data = await load(matchId);
  const key = `${periodId}|${playerId}`;
  const row = data.player[key] || {};
  
  const current = row[statId as CustomStatId] || 0;
  const next = current + delta;
  
  row[statId as CustomStatId] = next < 0 ? 0 : next;
  
  data.player[key] = row;
  await save(matchId, data);
}

export async function incTeamCustom(
  matchId: string,
  periodId: string,
  statId: StatId,
  delta: number = 1         // ⭐ NEW — can be negative for undo
) {
  if (!statId.startsWith('custom:')) return;

  const data = await load(matchId);
  const row = data.team[periodId] || {};

  const current = row[statId as CustomStatId] || 0;
  const next = current + delta;

  // Prevent negative numbers
  row[statId as CustomStatId] = next < 0 ? 0 : next;

  data.team[periodId] = row;
  await save(matchId, data);
}

export async function getAllTallies(matchId: string) {
  return await load(matchId);
}