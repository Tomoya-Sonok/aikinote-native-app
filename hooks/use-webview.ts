import { useCallback, useRef, useState } from "react";
import type WebView from "react-native-webview";

type WebViewState = {
  isLoading: boolean;
  hasError: boolean;
  hasEverLoaded: boolean;
  canGoBack: boolean;
  sourceUrl: string;
  displayUrl: string;
};

export function useWebView(initialUrl: string) {
  const ref = useRef<WebView>(null);
  const [state, setState] = useState<WebViewState>({
    isLoading: true,
    hasError: false,
    hasEverLoaded: false,
    canGoBack: false,
    sourceUrl: initialUrl,
    displayUrl: initialUrl,
  });

  const setLoaded = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isLoading: false,
      hasError: false,
      hasEverLoaded: true,
    }));
  }, []);

  const setError = useCallback(() => {
    setState((prev) => ({ ...prev, isLoading: false, hasError: true }));
  }, []);

  const setCanGoBack = useCallback((canGoBack: boolean) => {
    setState((prev) => ({ ...prev, canGoBack }));
  }, []);

  // WebView 内ナビゲーションの結果を追跡（source.uri は変更しない）
  const setDisplayUrl = useCallback((url: string) => {
    setState((prev) => ({ ...prev, displayUrl: url }));
  }, []);

  const reload = useCallback(() => {
    setState((prev) => ({ ...prev, isLoading: true, hasError: false }));
    ref.current?.reload();
  }, []);

  const goBack = useCallback(() => {
    if (state.canGoBack) {
      ref.current?.goBack();
      return true;
    }
    return false;
  }, [state.canGoBack]);

  // source.uri を変更して全ページリロード（ディープリンク等で使用）
  const navigateTo = useCallback((url: string) => {
    setState((prev) => ({
      ...prev,
      isLoading: true,
      hasError: false,
      sourceUrl: url,
      displayUrl: url,
    }));
  }, []);

  // WebView 内でパス遷移（source.uri は変更しない）
  // Web 版の NativeNavigationBridge（window.__aikinoteNavigate）があれば Next.js のクライアント遷移を使う。
  // ページ全体を読み込み直さないため、タブ切替で SSR・JS 起動・認証初期化・全データ取得をやり直さずに済む。
  // ブリッジが無い（旧 Web 版・読み込み途中）場合は location.assign → location.href にフォールバック
  // （iOS Simulator + 一部のページ遷移で href 直代入が無視されるケースを回避）
  const navigateInWebView = useCallback((path: string) => {
    ref.current?.injectJavaScript(`
      (function() {
        var path = ${JSON.stringify(path)};
        try {
          if (typeof window.__aikinoteNavigate === 'function' && window.__aikinoteNavigate(path)) return;
        } catch (e) {}
        try { window.location.assign(path); }
        catch (e) { window.location.href = path; }
      })();
      true;
    `);
  }, []);

  // WebView 内で任意の JS を実行
  const executeScript = useCallback((script: string) => {
    ref.current?.injectJavaScript(`${script}\ntrue;`);
  }, []);

  return {
    ref,
    ...state,
    setLoaded,
    setError,
    setCanGoBack,
    setDisplayUrl,
    reload,
    goBack,
    navigateTo,
    navigateInWebView,
    executeScript,
  };
}
