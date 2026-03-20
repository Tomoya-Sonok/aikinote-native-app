import { Platform } from "react-native";

const getDevBaseUrl = (): string => {
  // Android エミュレーターでは localhost ではなく 10.0.2.2 を使用
  if (Platform.OS === "android") {
    return "http://10.0.2.2:3000";
  }
  return "http://localhost:3000";
};

export const config = {
  webBaseUrl: __DEV__ ? getDevBaseUrl() : "https://aikinote.com",
  webDomain: __DEV__ ? "localhost" : "aikinote.com",
  splashTimeoutMs: 10_000,
} as const;
