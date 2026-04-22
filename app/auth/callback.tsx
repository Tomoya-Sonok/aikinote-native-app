import { router, useLocalSearchParams } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useEffect } from "react";
import { useAppContext } from "@/app/_layout";

/**
 * Android で openAuthSessionAsync のコールバック URL を
 * Expo Router が先にルーティングする問題への対処。
 *
 * URL パラメータから code を抽出して AppContext に格納し、
 * router.back() で index 画面に戻る（再マウントなし）。
 * index 画面が pendingAuthCode を検知してセッション交換を実行する。
 */
WebBrowser.maybeCompleteAuthSession();

export default function AuthCallbackRoute() {
  const params = useLocalSearchParams<{ code?: string; error?: string }>();
  const { setPendingAuthCode } = useAppContext();

  useEffect(() => {
    console.log("[OAuth] callback route reached, params:", params);
    if (params.code) {
      setPendingAuthCode(params.code);
    }
    router.back();
  }, [params, setPendingAuthCode]);

  return null;
}
