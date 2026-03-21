import AsyncStorage from "@react-native-async-storage/async-storage";

const SEARCH_HISTORY_KEY = "aikinote_search_history";

export async function getSearchHistory(): Promise<string[]> {
  try {
    const stored = await AsyncStorage.getItem(SEARCH_HISTORY_KEY);
    if (!stored) return [];
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function saveSearchHistory(history: string[]): Promise<void> {
  try {
    await AsyncStorage.setItem(SEARCH_HISTORY_KEY, JSON.stringify(history));
  } catch {
    // 保存失敗は無視
  }
}
