import { useCallback, useEffect, useRef, useState } from "react";
import type WebView from "react-native-webview";
import {
  getWebViewEverLoaded,
  setWebViewEverLoaded,
} from "@/lib/storage/webview-storage";

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

  // アプリ再起動でも「過去にロード成功した実績」を AsyncStorage から復元する。
  // これによりオフライン起動でも WebView の HTTP キャッシュからの復元を試みる
  // (NetworkError 全画面を回避するため app/index.tsx で判定に使う)。
  useEffect(() => {
    let cancelled = false;
    getWebViewEverLoaded().then((restored) => {
      if (cancelled) return;
      if (restored) {
        setState((prev) =>
          prev.hasEverLoaded ? prev : { ...prev, hasEverLoaded: true },
        );
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const setLoaded = useCallback(() => {
    setState((prev) => ({
      ...prev,
      isLoading: false,
      hasError: false,
      hasEverLoaded: true,
    }));
    // ベストエフォートで永続化 (失敗は無視)
    void setWebViewEverLoaded(true);
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
  // location.assign を優先し、失敗時に location.href にフォールバック
  // （iOS Simulator + 一部のページ遷移で href 直代入が無視されるケースを回避）
  const navigateInWebView = useCallback((path: string) => {
    ref.current?.injectJavaScript(`
      (function() {
        try { window.location.assign(${JSON.stringify(path)}); }
        catch (e) { window.location.href = ${JSON.stringify(path)}; }
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
