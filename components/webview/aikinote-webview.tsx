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

  // タブナビゲーション: 常に非表示（TabNavigation 本体 + 各 Layout のラッパー div を含む）
  // !important: 現状の Web 版 CSS は !important なし・詳細度同等で厳密には不要だが、
  // 将来 Web 版に !important が加わっても確実に消せるよう防御的に維持。
  css.push('[data-testid="tab-navigation"], div[class*="tabContainer"], div[class*="tabNavigation"] { display: none !important; }');

  // FAB の下端位置: Web 版は TabNavigation 分 (約 82px) を確保しているが、
  // ネイティブアプリは TabNavigation を非表示にしているため下方の余白を詰める。
  // !important が無いと、このスタイル注入の後に読み込まれる variables.css の
  // :root { --fab-bottom: 100px } にカスケードで負けてしまうため必須。
  css.push(':root { --fab-bottom: 18px !important; --fab-bottom-large: 43px !important; }');

  if (type === 'default') {
    // DefaultHeader ページ: visibility hidden で縮小（NavigationDrawer + プロフィールカードは残す）
    // !important 必須: Web 版 header は position: sticky で領域確保しており、
    // visibility: hidden 単独では sticky 領域が残るため複合プロパティで強制的に潰す必要がある。
    css.push('header { visibility: hidden !important; height: 0 !important; min-height: 0 !important; padding: 0 !important; margin: 0 !important; border: none !important; overflow: visible !important; }');
    // !important 必須: 上の header に visibility: hidden を当てた結果、
    // 子要素（NavigationDrawer / ProfileCard 等）が visibility 継承で hidden になるため、
    // !important で打ち消さないと表示されなくなる。
    css.push('[class*="overlay"], [class*="drawer"], [role="dialog"] { visibility: visible !important; }');
  } else if (type === 'social-feed') {
    // SocialFeedHeader ページ: header を完全非表示（NavigationDrawer なし）
    // !important: 現状の Web 版 CSS は !important なしでも消せるが、
    // header 周辺の競合を避けるため防御的に維持。
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

// ページ読み込み後に注入: CSS 更新 + URL 変更監視 + localStorage 変更監視
const INJECTED_JS_AFTER_LOAD = `
(function() {
  window.__AIKINOTE_NATIVE_APP__ = true;
  ${GET_HEADER_TYPE_JS}
  ${BUILD_CSS_JS}

  // CSS を現在の URL に基づいて作成/更新
  function updateCSS() {
    var style = document.getElementById('native-app-overrides');
    if (!style) {
      style = document.createElement('style');
      style.id = 'native-app-overrides';
      (document.head || document.documentElement).appendChild(style);
    }
    style.textContent = buildNativeAppCSS();
  }
  updateCSS();

  // クライアントサイド遷移（pushState/replaceState/popstate）を監視して CSS を動的に更新
  if (!window.__urlChangeMonitorInstalled) {
    window.__urlChangeMonitorInstalled = true;
    var lastUrl = window.location.href;

    function onUrlChange() {
      if (window.location.href === lastUrl) return;
      lastUrl = window.location.href;
      updateCSS();
    }

    var origPushState = history.pushState.bind(history);
    var origReplaceState = history.replaceState.bind(history);
    history.pushState = function() {
      origPushState.apply(this, arguments);
      onUrlChange();
    };
    history.replaceState = function() {
      origReplaceState.apply(this, arguments);
      onUrlChange();
    };
    window.addEventListener('popstate', onUrlChange);
  }

  // ネイティブ IAP ブリッジ: WebView から Paywall / Customer Center / 状態取得を呼び出す
  if (!window.__iapBridgeInstalled) {
    window.__iapBridgeInstalled = true;

    // Native → WebView メッセージのコールバック
    window.__onNativeMessage = function(msg) {
      if (msg.type === 'IAP_RESULT' && window.__iapResolve) {
        window.__iapResolve(msg.payload);
        window.__iapResolve = null;
      }
      if (msg.type === 'SUBSCRIPTION_STATUS' && window.__statusResolve) {
        window.__statusResolve(msg.payload);
        window.__statusResolve = null;
      }
      if (msg.type === 'OAUTH_RESULT' && window.__oauthResolve) {
        window.__oauthResolve(msg.payload);
        window.__oauthResolve = null;
      }
    };

    // Premium 状態変更のコールバック
    window.__onSubscriptionStatusChange = function(isPremium) {
      window.__AIKINOTE_PREMIUM__ = isPremium;
      window.dispatchEvent(new CustomEvent('aikinote:premiumChanged', { detail: { isPremium: isPremium } }));
    };

    // 指定プランを直接購入して結果を返す（planType: "monthly" | "yearly"）
    window.showNativePaywall = function(options) {
      return new Promise(function(resolve) {
        if (!window.ReactNativeWebView) {
          resolve({ success: false, isPremium: false });
          return;
        }
        window.__iapResolve = resolve;
        var planType = options && options.planType ? options.planType : undefined;
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'INITIATE_IAP',
          payload: { planType: planType }
        }));
        // 60秒タイムアウト
        setTimeout(function() {
          if (window.__iapResolve) {
            window.__iapResolve({ success: false, isPremium: false });
            window.__iapResolve = null;
          }
        }, 60000);
      });
    };

    // Customer Center を表示
    window.showNativeCustomerCenter = function() {
      if (window.ReactNativeWebView) {
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'SHOW_CUSTOMER_CENTER' }));
      }
    };

    // サブスクリプション状態を問い合わせ
    window.getNativeSubscriptionStatus = function() {
      return new Promise(function(resolve) {
        if (!window.ReactNativeWebView) {
          resolve({ isPremium: false });
          return;
        }
        window.__statusResolve = resolve;
        window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'GET_SUBSCRIPTION_STATUS' }));
        setTimeout(function() {
          if (window.__statusResolve) {
            window.__statusResolve({ isPremium: false });
            window.__statusResolve = null;
          }
        }, 5000);
      });
    };
  }

  // OAuth ブリッジ（Google / Apple 共通）: 結果を Promise で返す
  window.startNativeOAuth = function(provider) {
    return new Promise(function(resolve) {
      if (!window.ReactNativeWebView) {
        resolve({ success: false, reason: 'no_bridge' });
        return;
      }
      window.__oauthResolve = resolve;
      window.ReactNativeWebView.postMessage(JSON.stringify({
        type: 'START_NATIVE_OAUTH',
        payload: { provider: provider }
      }));
      // 120秒タイムアウト（OAuth 操作は長めに許容）
      setTimeout(function() {
        if (window.__oauthResolve) {
          window.__oauthResolve({ success: false, reason: 'timeout' });
          window.__oauthResolve = null;
        }
      }, 120000);
    });
  };

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
})();
true;
`;

type AikinoteWebViewProps = {
  url: string;
  webViewRef: React.RefObject<WebView | null>;
  searchHistoryJson: string;
  onLoadEnd: () => void;
  onError: () => void;
  onMessage: (event: WebViewMessageEvent) => void;
  onNavigationStateChange: (canGoBack: boolean, url: string) => void;
};

export function AikinoteWebView({
  url,
  webViewRef,
  searchHistoryJson,
  onLoadEnd,
  onError,
  onMessage,
  onNavigationStateChange,
}: AikinoteWebViewProps) {
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
