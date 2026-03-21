import * as WebBrowser from "expo-web-browser";
import React, { useCallback } from "react";
import { Platform, StyleSheet } from "react-native";
import { WebView, type WebViewNavigation } from "react-native-webview";
import type {
  WebViewErrorEvent,
  WebViewHttpErrorEvent,
} from "react-native-webview/lib/WebViewTypes";

import { config } from "@/constants/config";

const HIDE_WEB_CHROME_CSS = `
/* DefaultHeader: visibility: hidden で縮小（NavigationDrawer は子要素なので display: none 不可） */
[data-testid="default-header"] {
  visibility: hidden !important;
  height: 0 !important;
  min-height: 0 !important;
  padding: 0 !important;
  margin: 0 !important;
  border: none !important;
  overflow: visible !important;
}
/* NavigationDrawer の overlay と drawer パネルは visible に復活 */
[class*="overlay"], [class*="drawer"] {
  visibility: visible !important;
}
/* ネイティブヘッダー表示時に JS から付与されるクラス */
.native-header-hidden {
  display: none !important;
}
/* タブナビゲーション: 常に非表示 */
[data-testid="tab-navigation"], div[class*="tabContainer"] {
  display: none !important;
}
main { padding-bottom: 0 !important; }
`.trim();

// DOM 構築前に注入: ネイティブアプリフラグ設定 + CSS 非表示（早期実行）
const INJECTED_JS_BEFORE_CONTENT_LOADED = `
(function() {
  window.__AIKINOTE_NATIVE_APP__ = true;
  try {
    var style = document.createElement('style');
    style.id = 'native-app-overrides';
    style.textContent = ${JSON.stringify(HIDE_WEB_CHROME_CSS)};
    var target = document.head || document.documentElement;
    if (target) target.appendChild(style);
  } catch(e) {}
})();
true;
`;

// ページ読み込み後に注入: CSS 非表示の確実なフォールバック
const INJECTED_JS_AFTER_LOAD = `
(function() {
  window.__AIKINOTE_NATIVE_APP__ = true;
  if (!document.getElementById('native-app-overrides')) {
    var style = document.createElement('style');
    style.id = 'native-app-overrides';
    style.textContent = ${JSON.stringify(HIDE_WEB_CHROME_CSS)};
    (document.head || document.documentElement).appendChild(style);
  }
})();
true;
`;

type HeaderType = "default" | "social-feed" | "web";

type AikiWebViewProps = {
  url: string;
  webViewRef: React.RefObject<WebView | null>;
  headerType: HeaderType;
  onLoadEnd: () => void;
  onError: () => void;
  onNavigationStateChange: (canGoBack: boolean, url: string) => void;
};

export function AikiWebView({
  url,
  webViewRef,
  headerType,
  onLoadEnd,
  onError,
  onNavigationStateChange,
}: AikiWebViewProps) {
  const handleNavigationStateChange = useCallback(
    (navState: WebViewNavigation) => {
      onNavigationStateChange(navState.canGoBack, navState.url);
    },
    [onNavigationStateChange],
  );

  // ネイティブヘッダー表示時に対応する Web 版ヘッダーを非表示にする
  const prevHeaderTypeRef = React.useRef(headerType);
  React.useEffect(() => {
    if (headerType === prevHeaderTypeRef.current) return;
    prevHeaderTypeRef.current = headerType;

    if (headerType === "social-feed") {
      // SocialFeedHeader をネイティブで表示 → Web 版の SocialHeader を非表示に
      webViewRef.current?.injectJavaScript(`
        document.querySelectorAll('header').forEach(function(h) {
          if (!h.hasAttribute('data-testid') || h.getAttribute('data-testid') !== 'default-header') {
            h.classList.add('native-header-hidden');
          }
        });
        true;
      `);
    } else {
      // それ以外 → Web 版ヘッダーの非表示を解除
      webViewRef.current?.injectJavaScript(`
        document.querySelectorAll('.native-header-hidden').forEach(function(h) {
          h.classList.remove('native-header-hidden');
        });
        true;
      `);
    }
  }, [headerType, webViewRef]);

  const handleShouldStartLoad = useCallback(
    (event: { url: string }): boolean => {
      const { url: requestUrl } = event;

      // 同一ドメインへのリクエストは WebView 内で処理
      if (isInternalUrl(requestUrl)) {
        return true;
      }

      // 外部 URL は外部ブラウザで開く
      WebBrowser.openBrowserAsync(requestUrl);
      return false;
    },
    [],
  );

  const handleError = useCallback(
    (_event: WebViewErrorEvent) => {
      onError();
    },
    [onError],
  );

  const handleHttpError = useCallback(
    (event: WebViewHttpErrorEvent) => {
      const { statusCode } = event.nativeEvent;
      if (statusCode >= 500) {
        onError();
      }
    },
    [onError],
  );

  return (
    <WebView
      ref={webViewRef}
      source={{ uri: url }}
      style={styles.webview}
      // Cookie 設定
      sharedCookiesEnabled={true}
      thirdPartyCookiesEnabled={true}
      domStorageEnabled={true}
      // ナビゲーション
      javaScriptEnabled={true}
      allowsBackForwardNavigationGestures={Platform.OS === "ios"}
      startInLoadingState={false}
      // CSS インジェクション（二重注入で確実性を確保）
      injectedJavaScriptBeforeContentLoaded={INJECTED_JS_BEFORE_CONTENT_LOADED}
      injectedJavaScript={INJECTED_JS_AFTER_LOAD}
      // コールバック
      onLoadEnd={onLoadEnd}
      onError={handleError}
      onHttpError={handleHttpError}
      onNavigationStateChange={handleNavigationStateChange}
      onShouldStartLoadWithRequest={handleShouldStartLoad}
    />
  );
}

function isInternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname;

    // config.webDomain（EXPO_PUBLIC_WEB_URL で上書き可能）と一致するか
    if (
      hostname === config.webDomain ||
      hostname.endsWith(`.${config.webDomain}`)
    ) {
      return true;
    }

    // 開発環境: localhost / 10.0.2.2 も許可
    if (__DEV__) {
      return hostname === "localhost" || hostname === "10.0.2.2";
    }

    return false;
  } catch {
    // about:blank, data: URL 等は WebView 内で許可
    return true;
  }
}

const styles = StyleSheet.create({
  webview: {
    flex: 1,
  },
});
