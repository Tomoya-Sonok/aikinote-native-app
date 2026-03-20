import { useCallback } from "react";
import { StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAppContext } from "@/app/_layout";
import { AikiWebView } from "@/components/webview/aiki-webview";
import { useWebView } from "@/hooks/use-webview";

export default function HomeScreen() {
  const { initialUrl, onWebViewReady } = useAppContext();
  const webView = useWebView(initialUrl);

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
