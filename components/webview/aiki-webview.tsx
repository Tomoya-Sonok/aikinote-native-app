import * as WebBrowser from "expo-web-browser";
import { useCallback } from "react";
import { Platform, StyleSheet } from "react-native";
import { WebView, type WebViewNavigation } from "react-native-webview";
import type {
  WebViewErrorEvent,
  WebViewHttpErrorEvent,
  WebViewMessageEvent,
} from "react-native-webview/lib/WebViewTypes";

import { config } from "@/constants/config";

// URL からヘッダータイプを判定する JS ヘルパー（tab-utils.ts の getHeaderType と同じロジック）
const GET_HEADER_TYPE_JS = `
function getHeaderType() {
  var path = window.location.pathname.replace(/^\\/[a-z]{2}\\//, '/');
  if (/^\\/social\\/posts\\/?($|\\?)/.test(path)) return 'social-feed';
  if (/^\\/mypage\\/?$/.test(path)) return 'default';
  if (/^\\/personal\\/pages\\/?$/.test(path)) return 'default';
  if (/^\\/personal\\/pages\\/[^/]+\\/?$/.test(path) && !/^\\/personal\\/pages\\/new/.test(path)) return 'default';
  return 'web';
}
`;

// CSS 生成ロジック（ヘッダータイプに応じて異なる CSS を適用）
const BUILD_CSS_JS = `
function buildNativeAppCSS() {
  var type = getHeaderType();
  var css = [];

  // タブナビゲーション: 常に非表示
  css.push('[data-testid="tab-navigation"], div[class*="tabContainer"] { display: none !important; }');
  css.push('main { padding-bottom: 0 !important; }');

  if (type === 'default') {
    // DefaultHeader ページ: visibility hidden で縮小（NavigationDrawer + プロフィールカードは残す）
    css.push('header { visibility: hidden !important; height: 0 !important; min-height: 0 !important; padding: 0 !important; margin: 0 !important; border: none !important; overflow: visible !important; }');
    css.push('[class*="overlay"], [class*="drawer"], [role="dialog"] { visibility: visible !important; }');
  } else if (type === 'social-feed') {
    // SocialFeedHeader ページ: header を完全非表示（NavigationDrawer なし）
    css.push('header { display: none !important; }');
  }
  // type === 'web': ヘッダーは非表示にしない

  return css.join('\\n');
}
`;

// DOM 構築前に注入: フラグ設定 + CSS 非表示 + localStorage 復元
function buildBeforeContentLoadedJS(searchHistoryJson: string): string {
  return `
(function() {
  window.__AIKINOTE_NATIVE_APP__ = true;
  try {
    // localStorage に検索履歴を復元（AsyncStorage から読み込んだデータ）
    localStorage.setItem('aikinote_search_history', ${JSON.stringify(searchHistoryJson)});
  } catch(e) {}
  try {
    ${GET_HEADER_TYPE_JS}
    ${BUILD_CSS_JS}
    var style = document.createElement('style');
    style.id = 'native-app-overrides';
    style.textContent = buildNativeAppCSS();
    var target = document.head || document.documentElement;
    if (target) target.appendChild(style);
  } catch(e) {}
})();
true;
`;
}

// ページ読み込み後に注入: CSS を現在の URL に基づいて常に更新 + localStorage 変更監視
const INJECTED_JS_AFTER_LOAD = `
(function() {
  window.__AIKINOTE_NATIVE_APP__ = true;
  ${GET_HEADER_TYPE_JS}
  ${BUILD_CSS_JS}

  // CSS を現在の URL に基づいて作成/更新（injectedJavaScriptBeforeContentLoaded が
  // 再実行されないケースや古い URL で CSS が生成されたケースに対応）
  var style = document.getElementById('native-app-overrides');
  if (!style) {
    style = document.createElement('style');
    style.id = 'native-app-overrides';
    (document.head || document.documentElement).appendChild(style);
  }
  style.textContent = buildNativeAppCSS();

  // localStorage.setItem をラップして検索履歴の変更をネイティブに通知
  if (!window.__localStorageWrapped) {
    window.__localStorageWrapped = true;
    var origSetItem = localStorage.setItem.bind(localStorage);
    localStorage.setItem = function(key, value) {
      origSetItem(key, value);
      if (key === 'aikinote_search_history' && window.ReactNativeWebView) {
        try {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'SEARCH_HISTORY_UPDATED',
            payload: JSON.parse(value)
          }));
        } catch(e) {}
      }
    };
  }

  // ユーザー情報を DOM から抽出してネイティブに送信
  if (window.ReactNativeWebView && !window.__userInfoSent) {
    window.__userInfoSent = true;
    try {
      var avatarImg = document.querySelector('button[aria-label*="プロフィール"] img');
      var avatarUrl = avatarImg ? avatarImg.getAttribute('src') : null;
      var profileLink = document.querySelector('a[href*="/mypage"] [class*="profileCardName"], [class*="profileCardName"]');
      var username = profileLink ? profileLink.textContent : '';
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'USER_INFO',
        payload: { profileImageUrl: avatarUrl, username: username }
      }));
    } catch(e) {}
  }
})();
true;
`;

type AikiWebViewProps = {
  url: string;
  webViewRef: React.RefObject<WebView | null>;
  searchHistoryJson: string;
  onLoadEnd: () => void;
  onError: () => void;
  onMessage: (event: WebViewMessageEvent) => void;
  onNavigationStateChange: (canGoBack: boolean, url: string) => void;
};

export function AikiWebView({
  url,
  webViewRef,
  searchHistoryJson,
  onLoadEnd,
  onError,
  onMessage,
  onNavigationStateChange,
}: AikiWebViewProps) {
  const handleNavigationStateChange = useCallback(
    (navState: WebViewNavigation) => {
      onNavigationStateChange(navState.canGoBack, navState.url);
    },
    [onNavigationStateChange],
  );

  const handleShouldStartLoad = useCallback(
    (event: { url: string; isTopFrame?: boolean }): boolean => {
      // iframe（YouTube embed 等）のリクエストは WebView 内で許可
      if (event.isTopFrame === false) {
        return true;
      }

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
      allowsInlineMediaPlayback={true}
      mediaPlaybackRequiresUserAction={false}
      startInLoadingState={false}
      // JS インジェクション（CSS 非表示 + localStorage 復元 + 変更監視）
      injectedJavaScriptBeforeContentLoaded={buildBeforeContentLoadedJS(
        searchHistoryJson,
      )}
      injectedJavaScript={INJECTED_JS_AFTER_LOAD}
      // コールバック
      onLoadEnd={onLoadEnd}
      onMessage={onMessage}
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
