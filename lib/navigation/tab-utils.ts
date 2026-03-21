import type { IconProps } from "phosphor-react-native";
import { Chats, IdentificationCard, PencilSimple } from "phosphor-react-native";
import type { FC } from "react";

export type TabId = "personal" | "social" | "mypage";

type TabDefinition = {
  id: TabId;
  label: string;
  path: string;
  icon: FC<IconProps>;
};

export const TABS: TabDefinition[] = [
  {
    id: "personal",
    label: "ひとりで",
    path: "/personal/pages",
    icon: PencilSimple,
  },
  {
    id: "social",
    label: "みんなで",
    path: "/social/posts",
    icon: Chats,
  },
  {
    id: "mypage",
    label: "マイページ",
    path: "/mypage",
    icon: IdentificationCard,
  },
];

/**
 * URL からアクティブなタブを判定する。
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
