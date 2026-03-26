import { useNetInfo } from "@react-native-community/netinfo";
import { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler, Platform, StyleSheet, View } from "react-native";
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
import { NativeTabBar } from "@/components/tab-bar/native-tab-bar";
import { AikinoteWebView } from "@/components/webview/aikinote-webview";
import { useWebView } from "@/hooks/use-webview";
import { getActiveTab, getHeaderType } from "@/lib/navigation/tab-utils";
import { useRevenueCat } from "@/lib/purchases/RevenueCatProvider";
import { saveSearchHistory } from "@/lib/storage/webview-storage";

export default function HomeScreen() {
  const {
    initialUrl,
    onWebViewReady,
    pendingDeepLink,
    clearPendingDeepLink,
    searchHistoryJson,
    updateSearchHistoryJson,
  } = useAppContext();
  const webView = useWebView(initialUrl);
  const netInfo = useNetInfo();
  const isOffline = netInfo.isConnected === false;
  const insets = useSafeAreaInsets();
  const activeTab = getActiveTab(webView.displayUrl);
  const headerType = getHeaderType(webView.displayUrl);
  const [profileImageUrl, setProfileImageUrl] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const { identify, isPremium } = useRevenueCat();
  const identifiedRef = useRef(false);

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

  const handleLoadEnd = useCallback(() => {
    webView.setLoaded();
    onWebViewReady();
  }, [webView.setLoaded, onWebViewReady]);

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

  // Paywall を表示
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
          setProfileImageUrl(data.payload.profileImageUrl ?? null);
          setUserId(data.payload.userId ?? null);
        } else if (data.type === "INITIATE_IAP") {
          // WebView 内で Premium 機能がリクエストされた → Paywall を表示
          showPaywall().then((purchased) => {
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
        }
      } catch {
        // パースエラーは無視
      }
    },
    [
      updateSearchHistoryJson,
      showPaywall,
      showCustomerCenter,
      sendToWebView,
      isPremium,
    ],
  );

  // userId 取得後に RevenueCat に identify
  useEffect(() => {
    if (userId && !identifiedRef.current) {
      identifiedRef.current = true;
      identify(userId);
    }
  }, [userId, identify]);

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

  // SocialFeedHeader: 検索アイコンタップ
  const handleSearchPress = useCallback(() => {
    webView.navigateInWebView("/social/posts/search");
  }, [webView.navigateInWebView]);

  if (webView.hasError || isOffline) {
    return (
      <SafeAreaView style={styles.container}>
        <NetworkError isOffline={isOffline} onRetry={webView.reload} />
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      {headerType === "default" && (
        <NativeHeader
          profileImageUrl={profileImageUrl}
          onLogoPress={handleLogoPress}
          onAvatarPress={handleAvatarPress}
          onMenuPress={handleMenuPress}
        />
      )}
      {headerType === "social-feed" && (
        <SocialFeedNativeHeader
          profileImageUrl={profileImageUrl}
          onProfilePress={handleProfilePress}
          onSearchPress={handleSearchPress}
        />
      )}
      <View
        style={[
          styles.webviewArea,
          headerType === "web" && { paddingTop: insets.top },
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
      <NativeTabBar activeTab={activeTab} onTabPress={handleTabPress} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  webviewArea: {
    flex: 1,
  },
});
