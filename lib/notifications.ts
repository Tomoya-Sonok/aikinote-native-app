// iOS Simulator では expo-notifications の native module 'ExpoPushTokenManager' が
// 登録されず、`import * as Notifications from "expo-notifications"` が module 評価時に
// 失敗してアプリ全体が起動できない（既知の Simulator 制限。実機では問題なし）。
// 影響を Simulator だけに留めるため、require を try/catch で包んだ薄いラッパーを通す。

type NotificationsModule = typeof import("expo-notifications");

let loadedModule: NotificationsModule | null = null;
try {
  loadedModule = require("expo-notifications") as NotificationsModule;
} catch (error) {
  console.warn(
    "[notifications] expo-notifications を読み込めませんでした（iOS Simulator では既知）。プッシュ通知関連の処理はスキップされます。",
    error,
  );
}

export const Notifications = loadedModule;
