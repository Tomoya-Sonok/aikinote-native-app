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
import { Notifications } from "@/lib/notifications";
import { RevenueCatProvider } from "@/lib/purchases/RevenueCatProvider";
import { setupNotificationChannel } from "@/lib/push-notifications";
import { getSearchHistory } from "@/lib/storage/webview-storage";

// アプリ起動時にスプラッシュスクリーンを維持
SplashScreen.preventAutoHideAsync().catch(() => {
  // Android 実機で "Unable to activate keep awake" が発生する場合があるが無視して続行
});

// フォアグラウンドでも通知バナーを表示
Notifications?.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

type AppContextValue = {
  initialUrl: string;
  onWebViewReady: () => void;
  pendingDeepLink: string | null;
  clearPendingDeepLink: () => void;
  searchHistoryJson: string;
  updateSearchHistoryJson: (json: string) => void;
  pendingAuthCode: string | null;
  setPendingAuthCode: (code: string | null) => void;
};

// ネイティブアプリはランディングページではなく /login を起点にする。
// 認証済みユーザーは Web 版 /login 側で /personal/pages にサーバーリダイレクトされるので、
// 未認証ユーザーのみが実際にログイン画面を見る。
const NATIVE_INITIAL_URL = `${config.webBaseUrl}/login`;

// Web 版に転送すべきでないディープリンクを判定する。
// - /auth/callback: OAuth フロー（openAuthSessionAsync が処理）
// - expo-development-client / expo-go: dev client が内部的に扱う Metro 接続用 URL
function shouldHandleDeepLink(url: string): boolean {
  if (url.includes("/auth/callback")) return false;
  if (url.includes("expo-development-client")) return false;
  if (url.includes("expo-go")) return false;
  return true;
}

const AppContext = createContext<AppContextValue>({
  initialUrl: NATIVE_INITIAL_URL,
  onWebViewReady: () => {},
  pendingDeepLink: null,
  clearPendingDeepLink: () => {},
  searchHistoryJson: "[]",
  updateSearchHistoryJson: () => {},
  pendingAuthCode: null,
  setPendingAuthCode: () => {},
});

export function useAppContext() {
  return useContext(AppContext);
}

export const unstable_settings = {
  anchor: "index",
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [initialUrl, setInitialUrl] = useState(NATIVE_INITIAL_URL);
  const [pendingDeepLink, setPendingDeepLink] = useState<string | null>(null);
  const [pendingAuthCode, setPendingAuthCode] = useState<string | null>(null);
  const [searchHistoryJson, setSearchHistoryJson] = useState("[]");
  const [isReady, setIsReady] = useState(false);
  const splashHidden = useRef(false);

  const hideSplash = useCallback(() => {
    if (!splashHidden.current) {
      splashHidden.current = true;
      SplashScreen.hideAsync();
    }
  }, []);

  // Android 通知チャンネル設定
  useEffect(() => {
    setupNotificationChannel();
  }, []);

  // 通知タップ → 該当投稿に遷移
  useEffect(() => {
    if (!Notifications) return;

    // コールドスタート: アプリ起動のきっかけとなった通知を処理
    Notifications.getLastNotificationResponseAsync().then((response) => {
      const postId = response?.notification.request.content.data?.postId as
        | string
        | undefined;
      if (postId) {
        setPendingDeepLink(`${config.webBaseUrl}/social/posts/${postId}`);
      }
    });

    // ウォームスタート: アプリ実行中の通知タップを処理
    const subscription = Notifications.addNotificationResponseReceivedListener(
      (response) => {
        const postId = response.notification.request.content.data?.postId as
          | string
          | undefined;
        if (postId) {
          setPendingDeepLink(`${config.webBaseUrl}/social/posts/${postId}`);
        }
      },
    );
    return () => subscription.remove();
  }, []);

  // コールドスタート: 起動時のディープリンク取得 + AsyncStorage から検索履歴読み込み
  useEffect(() => {
    Promise.all([Linking.getInitialURL(), getSearchHistory()]).then(
      ([url, history]) => {
        if (url && shouldHandleDeepLink(url)) {
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
      if (shouldHandleDeepLink(event.url)) {
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
      pendingAuthCode,
      setPendingAuthCode,
    }),
    [
      initialUrl,
      hideSplash,
      pendingDeepLink,
      clearPendingDeepLink,
      searchHistoryJson,
      updateSearchHistoryJson,
      pendingAuthCode,
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
          {/*
            AikiNote のヘッダー背景は常に白系（#fdfcfa / #ffffff）。Android edge-to-edge 環境下では
            style="auto" が時間/Wi-Fi/バッテリー等のステータスバーアイコンを白のまま描画して
            背景と同化する事象があるため、"dark" を明示してアイコンを必ず黒色で表示する。
          */}
          <StatusBar style="dark" />
        </ThemeProvider>
      </AppContext.Provider>
    </RevenueCatProvider>
  );
}
