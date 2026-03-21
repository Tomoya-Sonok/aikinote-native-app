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
 *
 * Web 版で DefaultLayout（DefaultHeader）を使うページのみ "default" を返す。
 * SocialHeader / MinimalLayout を使うページは "web" を返す。
 */
export function getHeaderType(url: string): HeaderType {
  const normalized = normalizePathname(url);
  if (!normalized) return "web";

  // /social/posts 完全一致（trailing slash, query 許容）→ ネイティブ SocialFeedHeader
  if (/^\/social\/posts\/?(\?.*)?$/.test(normalized)) {
    return "social-feed";
  }

  // /mypage 完全一致 → DefaultHeader
  if (/^\/mypage\/?$/.test(normalized)) {
    return "default";
  }

  // /personal/pages 一覧 → DefaultHeader
  if (/^\/personal\/pages\/?$/.test(normalized)) {
    return "default";
  }

  // /personal/pages/[id] 詳細（/new や /[id]/edit は除外）→ DefaultHeader
  if (
    /^\/personal\/pages\/[^/]+\/?$/.test(normalized) &&
    !normalized.startsWith("/personal/pages/new")
  ) {
    return "default";
  }

  // その他（/personal/pages/new, /personal/pages/[id]/edit, /personal/calendar,
  //         /personal/stats, /social/*, /settings/*, 等）→ Web 版ヘッダー
  return "web";
}
