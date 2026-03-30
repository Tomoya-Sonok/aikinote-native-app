import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import * as Linking from "expo-linking";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { config } from "@/constants/config";
import { useColorScheme } from "@/hooks/use-color-scheme";
import { toWebUrl } from "@/lib/deep-link";
import { RevenueCatProvider } from "@/lib/purchases/RevenueCatProvider";
import { getSearchHistory } from "@/lib/storage/webview-storage";

// アプリ起動時にスプラッシュスクリーンを維持
SplashScreen.preventAutoHideAsync();

type AppContextValue = {
  initialUrl: string;
  onWebViewReady: () => void;
  pendingDeepLink: string | null;
  clearPendingDeepLink: () => void;
  searchHistoryJson: string;
  updateSearchHistoryJson: (json: string) => void;
};

const AppContext = createContext<AppContextValue>({
  initialUrl: config.webBaseUrl,
  onWebViewReady: () => {},
  pendingDeepLink: null,
  clearPendingDeepLink: () => {},
  searchHistoryJson: "[]",
  updateSearchHistoryJson: () => {},
});

export function useAppContext() {
  return useContext(AppContext);
}

export const unstable_settings = {
  anchor: "index",
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [initialUrl, setInitialUrl] = useState(config.webBaseUrl);
  const [pendingDeepLink, setPendingDeepLink] = useState<string | null>(null);
  const [searchHistoryJson, setSearchHistoryJson] = useState("[]");
  const [isReady, setIsReady] = useState(false);
  const splashHidden = useRef(false);

  const hideSplash = useCallback(() => {
    if (!splashHidden.current) {
      splashHidden.current = true;
      SplashScreen.hideAsync();
    }
  }, []);

  // コールドスタート: 起動時のディープリンク取得 + AsyncStorage から検索履歴読み込み
  useEffect(() => {
    Promise.all([Linking.getInitialURL(), getSearchHistory()]).then(
      ([url, history]) => {
        // auth/callback は OAuth フロー用（openAuthSessionAsync が処理）→ 無視
        if (url && !url.includes("/auth/callback")) {
          setInitialUrl(toWebUrl(url));
        }
        setSearchHistoryJson(JSON.stringify(history));
        setIsReady(true);
      },
    );
  }, []);

  // ウォームスタート: アプリ実行中のディープリンクを受け取る
  useEffect(() => {
    const subscription = Linking.addEventListener("url", (event) => {
      // auth/callback は OAuth フロー用（openAuthSessionAsync が処理）→ 無視
      if (!event.url.includes("/auth/callback")) {
        setPendingDeepLink(toWebUrl(event.url));
      }
    });
    return () => subscription.remove();
  }, []);

  // タイムアウト: WebView ロードが完了しなくてもスプラッシュを非表示にする
  useEffect(() => {
    const timeout = setTimeout(hideSplash, config.splashTimeoutMs);
    return () => clearTimeout(timeout);
  }, [hideSplash]);

  const clearPendingDeepLink = useCallback(() => {
    setPendingDeepLink(null);
  }, []);

  const updateSearchHistoryJson = useCallback((json: string) => {
    setSearchHistoryJson(json);
  }, []);

  const contextValue = useMemo(
    () => ({
      initialUrl,
      onWebViewReady: hideSplash,
      pendingDeepLink,
      clearPendingDeepLink,
      searchHistoryJson,
      updateSearchHistoryJson,
    }),
    [
      initialUrl,
      hideSplash,
      pendingDeepLink,
      clearPendingDeepLink,
      searchHistoryJson,
      updateSearchHistoryJson,
    ],
  );

  // ディープリンクの初期 URL 取得が完了するまで待機
  if (!isReady) {
    return null;
  }

  return (
    <RevenueCatProvider>
      <AppContext.Provider value={contextValue}>
        <ThemeProvider
          value={colorScheme === "dark" ? DarkTheme : DefaultTheme}
        >
          <Stack screenOptions={{ headerShown: false }}>
            <Stack.Screen name="index" />
          </Stack>
          <StatusBar style="auto" />
        </ThemeProvider>
      </AppContext.Provider>
    </RevenueCatProvider>
  );
}
