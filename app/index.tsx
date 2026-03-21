import { useNetInfo } from "@react-native-community/netinfo";
import { useCallback, useEffect, useState } from "react";
import { BackHandler, Platform, StyleSheet, View } from "react-native";
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
import { AikiWebView } from "@/components/webview/aiki-webview";
import { useWebView } from "@/hooks/use-webview";
import { getActiveTab, getHeaderType } from "@/lib/navigation/tab-utils";
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
        }
      } catch {
        // パースエラーは無視
      }
    },
    [updateSearchHistoryJson],
  );

  // SocialFeedHeader: プロフィール画像タップ
  const handleProfilePress = useCallback(() => {
    webView.navigateInWebView("/mypage");
  }, [webView.navigateInWebView]);

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
        <AikiWebView
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
