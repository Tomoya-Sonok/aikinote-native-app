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

function normalizePathname(url: string): string | null {
  try {
    const { pathname } = new URL(url);
    return pathname.replace(/^\/[a-z]{2}(?=\/)/, "");
  } catch {
    return null;
  }
}

/**
 * URL からアクティブなタブを判定する。
 */
export function getActiveTab(url: string): TabId | null {
  const normalized = normalizePathname(url);
  if (!normalized) return null;

  if (normalized.startsWith("/personal")) return "personal";
  if (normalized.startsWith("/social")) return "social";
  if (normalized.startsWith("/mypage")) return "mypage";
  return null;
}

export type HeaderType = "default" | "social-feed" | "web";

/**
 * URL からヘッダータイプを判定する。
 * - "default": ネイティブ DefaultHeader（ロゴ + メニュー）
 * - "social-feed": ネイティブ SocialFeedHeader（プロフィール + タイトル + 検索）
 * - "web": Web 版のヘッダーをそのまま表示
 */
export function getHeaderType(url: string): HeaderType {
  const normalized = normalizePathname(url);
  if (!normalized) return "web";

  if (normalized.startsWith("/personal") || normalized.startsWith("/mypage")) {
    return "default";
  }

  // /social/posts 完全一致（trailing slash, query 許容）
  if (/^\/social\/posts\/?(\?.*)?$/.test(normalized)) {
    return "social-feed";
  }

  return "web";
}
