import { useCallback, useRef, useState } from "react";
import type WebView from "react-native-webview";

type WebViewState = {
  isLoading: boolean;
  hasError: boolean;
  canGoBack: boolean;
  sourceUrl: string;
  displayUrl: string;
};

export function useWebView(initialUrl: string) {
  const ref = useRef<WebView>(null);
  const [state, setState] = useState<WebViewState>({
    isLoading: true,
    hasError: false,
    canGoBack: false,
    sourceUrl: initialUrl,
    displayUrl: initialUrl,
  });

  const setLoaded = useCallback(() => {
    setState((prev) => ({ ...prev, isLoading: false, hasError: false }));
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
  const navigateInWebView = useCallback((path: string) => {
    ref.current?.injectJavaScript(`
      window.location.href = '${path}';
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
