import { useNetInfo } from "@react-native-community/netinfo";
import * as WebBrowser from "expo-web-browser";
import { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler, Platform, StyleSheet, View } from "react-native";
import { PACKAGE_TYPE } from "react-native-purchases";
import RevenueCatUI from "react-native-purchases-ui";
import {
  SafeAreaView,
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import type { WebViewMessageEvent } from "react-native-webview/lib/WebViewTypes";
import { useAppContext } from "@/app/_layout";
import { NetworkError } from "@/components/error/network-error";
import { NativeHeader } from "@/components/header/native-header";
import { SocialFeedNativeHeader } from "@/components/header/social-feed-header";
import { OfflineBanner } from "@/components/offline/offline-banner";
import { NativeTabBar } from "@/components/tab-bar/native-tab-bar";
import { AikinoteWebView } from "@/components/webview/aikinote-webview";
import { useWebView } from "@/hooks/use-webview";
import { getActiveTab, getHeaderType } from "@/lib/navigation/tab-utils";
import { useRevenueCat } from "@/lib/purchases/RevenueCatProvider";
import { registerForPushNotifications } from "@/lib/push-notifications";
import { saveSearchHistory } from "@/lib/storage/webview-storage";
import { supabase } from "@/lib/supabase";

export default function HomeScreen() {
  const {
    initialUrl,
    onWebViewReady,
    pendingDeepLink,
    clearPendingDeepLink,
    searchHistoryJson,
    updateSearchHistoryJson,
    pendingAuthCode,
    setPendingAuthCode,
  } = useAppContext();
  const webView = useWebView(initialUrl);
  const netInfo = useNetInfo();
  const isOffline = netInfo.isConnected === false;
  const insets = useSafeAreaInsets();
  const activeTab = getActiveTab(webView.displayUrl);
  const headerType = getHeaderType(webView.displayUrl);
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);
  const [isTutorialActive, setIsTutorialActive] = useState(false);
  const { identify, isPremium, offerings, purchasePackage } = useRevenueCat();
  const identifiedRef = useRef(false);
  const pushTokenRegisteredRef = useRef(false);
  const pushTokenRef = useRef<string | null>(null);
  const authProcessingRef = useRef(false);
  // WebView stall 検出: onLoadEnd 後に Web 側 USER_INFO が届かない場合のリロード制御
  const stallTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const stalledUrlRef = useRef<string | null>(null);

  // Android: 戻るボタンで WebView 内の履歴を戻る
  useEffect(() => {
    if (Platform.OS !== "android") return;

    const handler = BackHandler.addEventListener("hardwareBackPress", () => {
      return webView.goBack();
    });
    return () => handler.remove();
  }, [webView.goBack]);

  // ウォームスタート時のディープリンクを処理
  useEffect(() => {
    if (pendingDeepLink) {
      webView.navigateTo(pendingDeepLink);
      clearPendingDeepLink();
    }
  }, [pendingDeepLink, webView.navigateTo, clearPendingDeepLink]);

  const clearStallTimer = useCallback(() => {
    if (stallTimerRef.current) {
      clearTimeout(stallTimerRef.current);
      stallTimerRef.current = null;
    }
  }, []);

  const handleLoadEnd = useCallback(() => {
    webView.setLoaded();
    onWebViewReady();
    // Web 側の React hydration が完了して useAuth が USER_INFO を postMessage するまで待機。
    // 25 秒経っても届かなければ Suspense 等で詰まっているとみなし、URL 単位で 1 度だけ自動リロードする。
    clearStallTimer();
    const targetUrl = webView.sourceUrl;
    stallTimerRef.current = setTimeout(() => {
      stallTimerRef.current = null;
      if (stalledUrlRef.current === targetUrl) return;
      stalledUrlRef.current = targetUrl;
      console.warn(
        "[Stall] WebView が応答しないためリロードします:",
        targetUrl,
      );
      webView.reload();
    }, 25000);
  }, [
    webView.setLoaded,
    webView.reload,
    webView.sourceUrl,
    onWebViewReady,
    clearStallTimer,
  ]);

  // sourceUrl が変わったら stall 履歴をリセット（前ページの retry 抑制を引きずらない）
  // biome-ignore lint/correctness/useExhaustiveDependencies: sourceUrl の変化で再実行することが目的のため、body 内で参照していなくても依存に残す
  useEffect(() => {
    stalledUrlRef.current = null;
    return () => {
      clearStallTimer();
    };
  }, [webView.sourceUrl, clearStallTimer]);

  const handleNavigationStateChange = useCallback(
    (canGoBack: boolean, url: string) => {
      webView.setCanGoBack(canGoBack);
      webView.setDisplayUrl(url);
    },
    [webView.setCanGoBack, webView.setDisplayUrl],
  );

  const handleTabPress = useCallback(
    (path: string) => {
      webView.navigateInWebView(path);
    },
    [webView.navigateInWebView],
  );

  const handleLogoPress = useCallback(() => {
    webView.navigateInWebView("/personal/pages");
  }, [webView.navigateInWebView]);

  // アバタータップ: Web 版の隠れたアバターボタンをクリックしてプロフィールカードを表示
  const handleAvatarPress = useCallback(() => {
    webView.executeScript(
      `document.querySelector('button[aria-label*="プロフィール"]')?.click();`,
    );
  }, [webView.executeScript]);

  // メニューボタン: NavigationDrawer の開閉をトグル
  const handleMenuPress = useCallback(() => {
    webView.executeScript(`
      var overlay = document.querySelector('[class*="overlay"]');
      if (overlay) {
        overlay.click();
      } else {
        document.querySelector('button[aria-label="メニューを開く"]')?.click();
      }
    `);
  }, [webView.executeScript]);

  // WebView → Native メッセージ結果を返す
  const sendToWebView = useCallback(
    (type: string, payload: Record<string, unknown>) => {
      webView.executeScript(`
        if (window.__onNativeMessage) {
          window.__onNativeMessage(${JSON.stringify({ type, payload })});
        }
      `);
    },
    [webView.executeScript],
  );

  // planType に応じたパッケージを直接購入（Paywall UI はスキップし OS 標準の購入ダイアログのみ表示）
  const purchaseByPlanType = useCallback(
    async (planType: "monthly" | "yearly"): Promise<boolean> => {
      const current = offerings?.current;
      if (!current) {
        console.error("[Purchase] offerings.current が取得できていない");
        return false;
      }
      const targetType =
        planType === "yearly" ? PACKAGE_TYPE.ANNUAL : PACKAGE_TYPE.MONTHLY;
      const pkg = current.availablePackages.find(
        (p) => p.packageType === targetType,
      );
      if (!pkg) {
        console.error(`[Purchase] ${planType} パッケージが見つからない`);
        return false;
      }
      return purchasePackage(pkg);
    },
    [offerings, purchasePackage],
  );

  // Paywall フォールバック（planType が渡されなかった場合に備えて残す）
  const showPaywall = useCallback(async (): Promise<boolean> => {
    try {
      const result = await RevenueCatUI.presentPaywall();
      return result === "PURCHASED" || result === "RESTORED";
    } catch (error) {
      console.error("[Paywall] 表示エラー:", error);
      return false;
    }
  }, []);

  // Customer Center を表示
  const showCustomerCenter = useCallback(async () => {
    try {
      await RevenueCatUI.presentCustomerCenter();
    } catch (error) {
      console.error("[CustomerCenter] 表示エラー:", error);
    }
  }, []);

  // OAuth: code → セッション交換 → WebView にセッション注入（共通処理）
  const processOAuthCode = useCallback(
    async (code: string) => {
      if (authProcessingRef.current) return;
      authProcessingRef.current = true;
      try {
        const { data: sessionData, error: sessionError } =
          await supabase.auth.exchangeCodeForSession(code);

        if (sessionError || !sessionData?.session) {
          console.error("[OAuth] セッション交換エラー:", sessionError);
          sendToWebView("OAUTH_RESULT", {
            success: false,
            reason: "exchange_failed",
            message: sessionError?.message,
          });
          return;
        }

        const { access_token, refresh_token } = sessionData.session;

        // WebView 側で native-session エンドポイントに POST、成功なら /personal/pages に遷移
        // 結果も __onNativeMessage("OAUTH_RESULT") 相当に resolve させる
        webView.executeScript(`
          fetch('/api/auth/native-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              access_token: '${access_token}',
              refresh_token: '${refresh_token}'
            }),
            credentials: 'include'
          }).then(function(r) { return r.json(); }).then(function(data) {
            if (data.success) {
              if (window.__oauthResolve) {
                window.__oauthResolve({ success: true });
                window.__oauthResolve = null;
              }
              location.replace('/personal/pages');
            } else {
              if (window.__oauthResolve) {
                window.__oauthResolve({ success: false, reason: 'session_api_failed' });
                window.__oauthResolve = null;
              }
            }
          }).catch(function(e) {
            console.error('Native session error:', e);
            if (window.__oauthResolve) {
              window.__oauthResolve({ success: false, reason: 'network_error' });
              window.__oauthResolve = null;
            }
          });
        `);
      } catch (error) {
        console.error("[OAuth] エラー:", error);
        sendToWebView("OAUTH_RESULT", {
          success: false,
          reason: "unknown",
          message: error instanceof Error ? error.message : undefined,
        });
      } finally {
        authProcessingRef.current = false;
      }
    },
    [webView.executeScript, sendToWebView],
  );

  // Android: callback.tsx 経由で受け取った code を処理
  useEffect(() => {
    if (pendingAuthCode) {
      processOAuthCode(pendingAuthCode);
      setPendingAuthCode(null);
    }
  }, [pendingAuthCode, processOAuthCode, setPendingAuthCode]);

  // OAuth フロー開始（Google / Apple 共通）
  const handleNativeOAuth = useCallback(
    async (provider: "google" | "apple") => {
      try {
        const { data, error } = await supabase.auth.signInWithOAuth({
          provider,
          options: {
            skipBrowserRedirect: true,
            redirectTo: "aikinotenativeapp://auth/callback",
          },
        });

        if (error || !data?.url) {
          console.error("[OAuth] URL 生成エラー:", error);
          sendToWebView("OAUTH_RESULT", {
            success: false,
            reason: "url_generation_failed",
            message: error?.message,
          });
          return;
        }

        console.log("[OAuth] authorize url:", data.url);

        const result = await WebBrowser.openAuthSessionAsync(
          data.url,
          "aikinotenativeapp://auth/callback",
        );

        console.log(
          "[OAuth] result:",
          result.type,
          (result as { url?: string }).url,
        );

        // iOS: openAuthSessionAsync が URL をキャプチャ → ここで処理
        // Android: Expo Router が先にキャプチャ → callback.tsx → pendingAuthCode 経由で処理
        if (result.type === "success" && result.url) {
          const url = new URL(result.url);
          const code = url.searchParams.get("code");

          if (code) {
            await processOAuthCode(code);
            return;
          }

          // Implicit flow フォールバック
          const hashParams = new URLSearchParams(url.hash.substring(1));
          const access_token = hashParams.get("access_token");
          const refresh_token = hashParams.get("refresh_token");

          if (access_token && refresh_token) {
            webView.executeScript(`
              fetch('/api/auth/native-session', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  access_token: '${access_token}',
                  refresh_token: '${refresh_token}'
                }),
                credentials: 'include'
              }).then(function(r) { return r.json(); }).then(function(data) {
                if (data.success) {
                  if (window.__oauthResolve) {
                    window.__oauthResolve({ success: true });
                    window.__oauthResolve = null;
                  }
                  location.replace('/personal/pages');
                } else {
                  if (window.__oauthResolve) {
                    window.__oauthResolve({ success: false, reason: 'session_api_failed' });
                    window.__oauthResolve = null;
                  }
                }
              }).catch(function(e) {
                console.error('Native session error:', e);
                if (window.__oauthResolve) {
                  window.__oauthResolve({ success: false, reason: 'network_error' });
                  window.__oauthResolve = null;
                }
              });
            `);
            return;
          }

          // success だが code も access_token も無い
          sendToWebView("OAUTH_RESULT", {
            success: false,
            reason: "no_code_or_token",
          });
          return;
        }

        // type !== "success" （cancel / dismiss / locked 等）
        // iOS: openAuthSessionAsync が success を返さなければ本当に失敗
        // Android: callback.tsx → pendingAuthCode 経由で後から成功する可能性があるため、ここでは送らない
        if (Platform.OS === "ios") {
          sendToWebView("OAUTH_RESULT", {
            success: false,
            reason: result.type,
          });
        }
      } catch (error) {
        console.error("[OAuth] エラー:", error);
        sendToWebView("OAUTH_RESULT", {
          success: false,
          reason: "exception",
          message: error instanceof Error ? error.message : undefined,
        });
      }
    },
    [webView.executeScript, processOAuthCode, sendToWebView],
  );

  // WebView からのメッセージ受信
  const handleMessage = useCallback(
    (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        if (
          data.type === "SEARCH_HISTORY_UPDATED" &&
          Array.isArray(data.payload)
        ) {
          const json = JSON.stringify(data.payload);
          updateSearchHistoryJson(json);
          saveSearchHistory(data.payload);
        } else if (data.type === "USER_INFO" && data.payload) {
          // hydration が成功して USER_INFO が届いた → stall タイマー解除
          clearStallTimer();
          const newUserId = data.payload.userId ?? null;
          setProfileImageUrl(data.payload.profileImageUrl ?? null);
          setUserId(newUserId);

          // ログアウト検知（userId が null に変化）→ プッシュトークン削除
          if (!newUserId && pushTokenRef.current) {
            webView.executeScript(`
              fetch('/api/push-tokens', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ expo_push_token: '${pushTokenRef.current}' }),
                credentials: 'include'
              }).catch(function(e) {});
            `);
            pushTokenRef.current = null;
            pushTokenRegisteredRef.current = false;
            identifiedRef.current = false;
          }
        } else if (
          data.type === "UNREAD_NOTIFICATION_COUNT" &&
          data.payload &&
          typeof data.payload.count === "number"
        ) {
          setUnreadNotificationCount(data.payload.count);
        } else if (
          data.type === "TUTORIAL_STATE" &&
          data.payload &&
          typeof data.payload.active === "boolean"
        ) {
          setIsTutorialActive(data.payload.active);
        } else if (data.type === "INITIATE_IAP") {
          // WebView から購入リクエスト: planType が指定されていれば該当パッケージを直接購入、
          // なければ Paywall にフォールバック
          const planType = data.payload?.planType;
          const purchasePromise =
            planType === "monthly" || planType === "yearly"
              ? purchaseByPlanType(planType)
              : showPaywall();
          purchasePromise.then((purchased) => {
            sendToWebView("IAP_RESULT", {
              success: purchased,
              isPremium: purchased,
            });
          });
        } else if (data.type === "SHOW_CUSTOMER_CENTER") {
          // サブスクリプション管理画面を表示
          showCustomerCenter();
        } else if (data.type === "GET_SUBSCRIPTION_STATUS") {
          // WebView からサブスクリプション状態を問い合わせ
          sendToWebView("SUBSCRIPTION_STATUS", { isPremium });
        } else if (
          data.type === "START_NATIVE_OAUTH" &&
          data.payload?.provider
        ) {
          // WebView から OAuth リクエスト（Google / Apple）
          handleNativeOAuth(data.payload.provider);
        }
      } catch {
        // パースエラーは無視
      }
    },
    [
      updateSearchHistoryJson,
      purchaseByPlanType,
      showPaywall,
      showCustomerCenter,
      sendToWebView,
      isPremium,
      handleNativeOAuth,
      webView.executeScript,
      clearStallTimer,
    ],
  );

  // userId 取得後に RevenueCat に identify + プッシュトークン登録
  useEffect(() => {
    if (userId && !identifiedRef.current) {
      identifiedRef.current = true;
      identify(userId);
    }
    // プッシュトークン登録（userId 取得後に1回だけ）
    if (userId && !pushTokenRegisteredRef.current) {
      pushTokenRegisteredRef.current = true;
      registerForPushNotifications().then((pushToken) => {
        if (pushToken) {
          pushTokenRef.current = pushToken;
          webView.executeScript(`
            fetch('/api/push-tokens', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                expo_push_token: '${pushToken}',
                platform: '${Platform.OS}'
              }),
              credentials: 'include'
            }).catch(function(e) { console.error('Push token registration error:', e); });
          `);
        }
      });
    }
  }, [userId, identify, webView.executeScript]);

  // WebView に Premium 状態を通知
  const webViewRef = webView.ref;
  useEffect(() => {
    if (!webViewRef.current) return;
    webView.executeScript(`
      window.__AIKINOTE_PREMIUM__ = ${isPremium};
      if (window.__onSubscriptionStatusChange) {
        window.__onSubscriptionStatusChange(${isPremium});
      }
    `);
  }, [isPremium, webView.executeScript, webViewRef]);

  // SocialFeedHeader: プロフィール画像タップ → /social/profile/[userId]
  const handleProfilePress = useCallback(() => {
    if (userId) {
      webView.navigateInWebView(`/social/profile/${userId}`);
    } else {
      webView.navigateInWebView("/mypage");
    }
  }, [webView.navigateInWebView, userId]);

  // SocialFeedHeader: 通知アイコンタップ
  const handleNotificationPress = useCallback(() => {
    webView.navigateInWebView("/social/notifications");
  }, [webView.navigateInWebView]);

  // SocialFeedHeader: 検索アイコンタップ
  const handleSearchPress = useCallback(() => {
    webView.navigateInWebView("/social/posts/search");
  }, [webView.navigateInWebView]);

  // 完全なエラー画面の条件:
  // - WebView の HTTP/JS エラー（hasError）
  // - オフライン かつ 一度もロードできていない（キャッシュ表示の希望なし）
  if (webView.hasError || (isOffline && !webView.hasEverLoaded)) {
    return (
      <SafeAreaView style={styles.container}>
        <NetworkError isOffline={isOffline} onRetry={webView.reload} />
      </SafeAreaView>
    );
  }

  const showHeader = !isTutorialActive;
  const showTabBar = !isTutorialActive;
  // オフラインだが一度ロード済み → WebView をキャッシュ表示しバナーを出す
  const showOfflineBanner = isOffline && webView.hasEverLoaded;

  return (
    <View style={styles.container}>
      {showHeader && headerType === "default" && (
        <NativeHeader
          profileImageUrl={profileImageUrl}
          onLogoPress={handleLogoPress}
          onAvatarPress={handleAvatarPress}
          onMenuPress={handleMenuPress}
        />
      )}
      {showHeader && headerType === "social-feed" && (
        <SocialFeedNativeHeader
          profileImageUrl={profileImageUrl}
          unreadNotificationCount={unreadNotificationCount}
          onProfilePress={handleProfilePress}
          onNotificationPress={handleNotificationPress}
          onSearchPress={handleSearchPress}
        />
      )}
      {showOfflineBanner && <OfflineBanner />}
      <View
        style={[
          styles.webviewArea,
          (isTutorialActive || headerType === "web") && {
            paddingTop: insets.top,
          },
        ]}
      >
        <AikinoteWebView
          url={webView.sourceUrl}
          webViewRef={webView.ref}
          searchHistoryJson={searchHistoryJson}
          onLoadEnd={handleLoadEnd}
          onError={webView.setError}
          onMessage={handleMessage}
          onNavigationStateChange={handleNavigationStateChange}
        />
      </View>
      {showTabBar && (
        <NativeTabBar activeTab={activeTab} onTabPress={handleTabPress} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webviewArea: {
    flex: 1,
    backgroundColor: "#efecec",
  },
});
