import { Redirect } from "expo-router";
import * as WebBrowser from "expo-web-browser";

/**
 * Android で openAuthSessionAsync のコールバック URL を
 * Expo Router が先にルーティングしてしまう問題への対処。
 *
 * maybeCompleteAuthSession() を呼ぶことで、
 * openAuthSessionAsync の Promise を正しく resolve させる。
 * その後メイン画面にリダイレクトする。
 */
WebBrowser.maybeCompleteAuthSession();

export default function AuthCallbackRoute() {
  return <Redirect href="/" />;
}
