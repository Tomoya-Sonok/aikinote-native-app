import type { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";

export type TabId = "personal" | "social" | "mypage";

type TabDefinition = {
  id: TabId;
  label: string;
  path: string;
  icon: ComponentProps<typeof Ionicons>["name"];
  activeIcon: ComponentProps<typeof Ionicons>["name"];
};

export const TABS: TabDefinition[] = [
  {
    id: "personal",
    label: "稽古",
    path: "/personal/pages",
    icon: "pencil-outline",
    activeIcon: "pencil",
  },
  {
    id: "social",
    label: "みんな",
    path: "/social/posts",
    icon: "chatbubbles-outline",
    activeIcon: "chatbubbles",
  },
  {
    id: "mypage",
    label: "マイページ",
    path: "/mypage",
    icon: "person-outline",
    activeIcon: "person",
  },
];

/**
 * URL からアクティブなタブを判定する。
 * タブに該当しないページ（/settings 等）では null を返す。
 */
export function getActiveTab(url: string): TabId | null {
  try {
    const { pathname } = new URL(url);
    // locale prefix を除去（/ja/personal/pages → /personal/pages）
    const normalized = pathname.replace(/^\/[a-z]{2}(?=\/)/, "");

    if (normalized.startsWith("/personal")) return "personal";
    if (normalized.startsWith("/social")) return "social";
    if (normalized.startsWith("/mypage")) return "mypage";
    return null;
  } catch {
    return null;
  }
}
