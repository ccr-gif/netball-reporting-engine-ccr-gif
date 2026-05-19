import AsyncStorage from "@react-native-async-storage/async-storage";

const KEY = "stat_label_overrides";

/**
 * Load built‑in stat label overrides
 * (goal → Goal Shot, cp_to_score → Win CP + Score, etc.)
 */
export async function getLabelOverrides(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : {};

    return parsed;
  } catch (e) {
    console.log("❌ getLabelOverrides failed", e);
    return {};
  }
}

/**
 * Save built‑in stat label overrides
 */
export async function setLabelOverrides(next: Record<string, string>) {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch (e) {
    console.log("❌ setLabelOverrides failed", e);
  }
}
