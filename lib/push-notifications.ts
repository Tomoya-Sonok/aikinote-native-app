import * as Device from "expo-device";
import { Platform } from "react-native";

import { Notifications } from "./notifications";

// Android: デフォルト通知チャンネルを設定
export async function setupNotificationChannel(): Promise<void> {
  if (Platform.OS !== "android" || !Notifications) return;

  await Notifications.setNotificationChannelAsync("default", {
    name: "default",
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 250, 250, 250],
  });
}

/**
 * プッシュ通知の許可を取得し、Expo Push Token を返す。
 * 許可されなかった場合、シミュレーターの場合、または expo-notifications が
 * 利用できない場合は null を返す。
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (!Notifications) {
    console.log(
      "[Push] expo-notifications が利用できないためトークン取得をスキップします（iOS Simulator など）",
    );
    return null;
  }

  // 実機のみ（シミュレーターではプッシュ通知は動作しない）
  if (!Device.isDevice) {
    console.log("[Push] シミュレーターではプッシュ通知は利用できません");
    return null;
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    console.log("[Push] プッシュ通知の許可が得られませんでした");
    return null;
  }

  const projectId = "7a166659-243a-4fad-b661-beb68e29a1a6";
  const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
  return tokenData.data;
}
