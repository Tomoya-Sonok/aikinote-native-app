import { Platform } from "react-native";

// RevenueCat API キー
// iOS / Android で別キーが必要になる場合はここで分岐
const API_KEYS = {
  apple: "test_tjJaYBcErDKfzlNibAjmERpeBqk",
  google: "test_tjJaYBcErDKfzlNibAjmERpeBqk",
} as const;

export const REVENUECAT_API_KEY =
  Platform.OS === "ios" ? API_KEYS.apple : API_KEYS.google;

// Entitlement ID（RevenueCat ダッシュボードで設定した ID）
export const ENTITLEMENT_ID = "AikiNote Premium";

// Offering ID
export const OFFERING_ID = "default";
