// src/storage/customStats.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  ALL_BUILTIN_STATS,
  BuiltinStat,
  CustomStatDef,
  CustomStatId,
  StatId,
  StatScope,
  STAT_LABEL,
} from '../types/stats';

const LIB_KEY = 'stat_library::v1';

/** Load custom stats stored on-device */
export async function getCustomStats(): Promise<CustomStatDef[]> {
  try {
    const raw = await AsyncStorage.getItem(LIB_KEY);
    if (!raw) return [];
    const arr = JSON.parse(raw) as CustomStatDef[];
    return Array.isArray(arr) ? arr.filter(s => !s.archived) : [];
  } catch {
    return [];
  }
}

export async function addCustomStat(input: {
  label: string;
  scope: StatScope;
}): Promise<CustomStatDef> {
	
	console.log("🧪 addCustomStat CALLED with:", input)

  const id: CustomStatId = `custom:${cryptoRandomId()}`;

  const def: CustomStatDef = {
    id,
    label: input.label.trim(),
    scope: input.scope,
  };

console.log("🧪 addCustomStat DEF:", def);

  const all = await getCustomStats();
  
  console.log("🧪 addCustomStat BEFORE SAVE, count =", all.length);
  
  all.push(def);

  await AsyncStorage.setItem(LIB_KEY, JSON.stringify(all));
  
  console.log("✅ addCustomStat SAVED");
  
  return def;
}
``

export async function updateCustomStat(id: CustomStatId, patch: Partial<Pick<CustomStatDef, 'label'|'scope'>>) {
  const all = await getCustomStats();
  const idx = all.findIndex(s => s.id === id);
  if (idx === -1) return;
  const cur = all[idx];
  all[idx] = { ...cur, ...patch, label: (patch.label ?? cur.label).trim() };
  await AsyncStorage.setItem(LIB_KEY, JSON.stringify(all));
}

export async function removeCustomStat(id: CustomStatId): Promise<void> {
  const all = await getCustomStats();
  const next = all.filter(s => s.id !== id);
  await AsyncStorage.setItem(LIB_KEY, JSON.stringify(next));
}

/** Build the full library (built-ins + customs) with labels and scope. */
export async function getStatLibrary(): Promise<Array<{ id: StatId; label: string; scope: StatScope }>> {
  const customs = await getCustomStats();

  // ✅ NO built-ins injected here anymore.
  // StatLibraryManager now injects them correctly.

  return customs;
}

function cryptoRandomId(): string {
  // RN-friendly 16-char id
  const bytes = Array.from({ length: 8 }, () => Math.floor(Math.random() * 256));
  return bytes.map(b => b.toString(16).padStart(2, '0')).join('');
}
export async function cleanupBuiltinStats() {
  const builtins = [
    "goal", "miss",
    "assist", "feed", "rebound_off", "rebound_def",
    "cpr", "penalty", "bad_pass", "interception",
    "to_won", "to_lost",
    "cp_to_score", "cp_no_score", "to_to_score"
  ];

  try {
    for (const id of builtins) {
      await removeCustomStat(id);
    }
  } catch (e) {
    console.log("cleanup error", e);
  }

  console.log("✅ Built-in cleanup complete");
}