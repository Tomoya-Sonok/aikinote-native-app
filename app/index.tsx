import { useNetInfo } from "@react-native-community/netinfo";
import { useCallback } from "react";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppContext } from "@/app/_layout";
import { NetworkError } from "@/components/error/network-error";
import { AikiWebView } from "@/components/webview/aiki-webview";
import { useWebView } from "@/hooks/use-webview";

export default function HomeScreen() {
  const { initialUrl, onWebViewReady } = useAppContext();
  const webView = useWebView(initialUrl);
  const netInfo = useNetInfo();
  const isOffline = netInfo.isConnected === false;

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

  if (webView.hasError || isOffline) {
    return (
      <SafeAreaView style={styles.container}>
        <NetworkError isOffline={isOffline} onRetry={webView.reload} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <AikiWebView
        url={webView.currentUrl}
        webViewRef={webView.ref}
        onLoadEnd={handleLoadEnd}
        onError={webView.setError}
        onNavigationStateChange={handleNavigationStateChange}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
