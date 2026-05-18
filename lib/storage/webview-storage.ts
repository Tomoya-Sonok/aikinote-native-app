import AsyncStorage from "@react-native-async-storage/async-storage";

const SEARCH_HISTORY_KEY = "aikinote_search_history";
const NATIVE_TUTORIAL_SEEN_KEY = "aikinote_native_tutorial_seen";
const WEBVIEW_EVER_LOADED_KEY = "aikinote_webview_ever_loaded";

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

export async function getNativeTutorialSeen(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(NATIVE_TUTORIAL_SEEN_KEY);
    return value === "true";
  } catch {
    return false;
  }
}

export async function setNativeTutorialSeen(value: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(
      NATIVE_TUTORIAL_SEEN_KEY,
      value ? "true" : "false",
    );
  } catch {
    // 保存失敗は無視（次回起動時に再表示される）
  }
}

/**
 * WebView が一度でもロード成功したことがあるかを永続化して返す。
 * オフライン起動時、ネット未接続でも HTTP キャッシュから WebView を
 * 表示できる可能性が高いケース (= 過去ロード成功実績あり) を判定する。
 */
export async function getWebViewEverLoaded(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(WEBVIEW_EVER_LOADED_KEY);
    return value === "true";
  } catch {
    return false;
  }
}

export async function setWebViewEverLoaded(value: boolean): Promise<void> {
  try {
    await AsyncStorage.setItem(
      WEBVIEW_EVER_LOADED_KEY,
      value ? "true" : "false",
    );
  } catch {
    // 保存失敗は無視 (次回 onLoadEnd で再書き込みされる)
  }
}
