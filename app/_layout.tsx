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

// アプリ起動時にスプラッシュスクリーンを維持
SplashScreen.preventAutoHideAsync();

type AppContextValue = {
  initialUrl: string;
  /** WebView ロード完了時に呼び出す（スプラッシュを非表示にする） */
  onWebViewReady: () => void;
  /** アプリ実行中に受け取ったディープリンクの URL（WebView で開く） */
  pendingDeepLink: string | null;
  /** ディープリンクを処理済みにする */
  clearPendingDeepLink: () => void;
};

const AppContext = createContext<AppContextValue>({
  initialUrl: config.webBaseUrl,
  onWebViewReady: () => {},
  pendingDeepLink: null,
  clearPendingDeepLink: () => {},
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
  const [isReady, setIsReady] = useState(false);
  const splashHidden = useRef(false);

  const hideSplash = useCallback(() => {
    if (!splashHidden.current) {
      splashHidden.current = true;
      SplashScreen.hideAsync();
    }
  }, []);

  // コールドスタート: 起動時のディープリンクを取得して初期 URL に設定
  useEffect(() => {
    Linking.getInitialURL().then((url) => {
      if (url) {
        setInitialUrl(toWebUrl(url));
      }
      setIsReady(true);
    });
  }, []);

  // ウォームスタート: アプリ実行中のディープリンクを受け取る
  useEffect(() => {
    const subscription = Linking.addEventListener("url", (event) => {
      setPendingDeepLink(toWebUrl(event.url));
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

  const contextValue = useMemo(
    () => ({
      initialUrl,
      onWebViewReady: hideSplash,
      pendingDeepLink,
      clearPendingDeepLink,
    }),
    [initialUrl, hideSplash, pendingDeepLink, clearPendingDeepLink],
  );

  // ディープリンクの初期 URL 取得が完了するまで待機
  if (!isReady) {
    return null;
  }

  return (
    <AppContext.Provider value={contextValue}>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </AppContext.Provider>
  );
}
