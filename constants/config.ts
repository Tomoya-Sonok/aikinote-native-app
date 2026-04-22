import { Platform } from "react-native";

const getDevBaseUrl = (): string => {
  // Android エミュレーターでは localhost ではなく 10.0.2.2 を使用
  if (Platform.OS === "android") {
    return "http://10.0.2.2:3000";
  }
  return "http://localhost:3000";
};

const getBaseUrl = (): string => {
  // EXPO_PUBLIC_WEB_URL が指定されていればそれを優先（開発時の接続先切り替え用）
  const envUrl = process.env.EXPO_PUBLIC_WEB_URL;
  if (envUrl) return envUrl;

  return __DEV__ ? getDevBaseUrl() : "https://www.aikinote.com";
};

const getDomain = (url: string): string => {
  try {
    return new URL(url).hostname;
  } catch {
    return "www.aikinote.com";
  }
};

const webBaseUrl = getBaseUrl();

export const config = {
  webBaseUrl,
  webDomain: getDomain(webBaseUrl),
  splashTimeoutMs: 10_000,
} as const;
