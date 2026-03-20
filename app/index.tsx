import { useNetInfo } from "@react-native-community/netinfo";
import { useCallback, useEffect } from "react";
import { BackHandler, Platform, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppContext } from "@/app/_layout";
import { NetworkError } from "@/components/error/network-error";
import { NativeHeader } from "@/components/header/native-header";
import { NativeTabBar } from "@/components/tab-bar/native-tab-bar";
import { AikiWebView } from "@/components/webview/aiki-webview";
import { config } from "@/constants/config";
import { useWebView } from "@/hooks/use-webview";
import { getActiveTab } from "@/lib/navigation/tab-utils";

export default function HomeScreen() {
  const { initialUrl, onWebViewReady, pendingDeepLink, clearPendingDeepLink } =
    useAppContext();
  const webView = useWebView(initialUrl);
  const netInfo = useNetInfo();
  const isOffline = netInfo.isConnected === false;
  const activeTab = getActiveTab(webView.currentUrl);

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
      webView.setCurrentUrl(url);
    },
    [webView.setCanGoBack, webView.setCurrentUrl],
  );

  const handleTabPress = useCallback(
    (path: string) => {
      webView.navigateTo(`${config.webBaseUrl}${path}`);
    },
    [webView.navigateTo],
  );

  const handleLogoPress = useCallback(() => {
    webView.navigateTo(`${config.webBaseUrl}/personal/pages`);
  }, [webView.navigateTo]);

  const handleMenuPress = useCallback(() => {
    webView.navigateTo(`${config.webBaseUrl}/settings`);
  }, [webView.navigateTo]);

  if (webView.hasError || isOffline) {
    return (
      <SafeAreaView style={styles.container}>
        <NetworkError isOffline={isOffline} onRetry={webView.reload} />
      </SafeAreaView>
    );
  }

  return (
    <View style={styles.container}>
      <NativeHeader
        onLogoPress={handleLogoPress}
        onMenuPress={handleMenuPress}
      />
      <View style={styles.webviewArea}>
        <AikiWebView
          url={webView.currentUrl}
          webViewRef={webView.ref}
          onLoadEnd={handleLoadEnd}
          onError={webView.setError}
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
