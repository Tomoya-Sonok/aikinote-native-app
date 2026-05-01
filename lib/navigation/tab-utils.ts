import type { IconProps } from "phosphor-react-native";
import { Chats, IdentificationCard, PencilSimple } from "phosphor-react-native";
import type { FC } from "react";

export type TabId = "personal" | "social" | "mypage";

// Web 版 next-intl で対応している locale。Web 側の default ('ja') と一致させる。
export type Locale = "ja" | "en";

const SUPPORTED_LOCALES: readonly Locale[] = ["ja", "en"] as const;
const DEFAULT_LOCALE: Locale = "ja";

type TabDefinition = {
  id: TabId;
  labels: Record<Locale, string>;
  // locale prefix を含まない pathname。実際の遷移時は buildLocalePath で /<locale> を付与する。
  pathSuffix: string;
  icon: FC<IconProps>;
};

export const TABS: TabDefinition[] = [
  {
    id: "personal",
    labels: { ja: "ひとりで", en: "Personal" },
    pathSuffix: "/personal/pages",
    icon: PencilSimple,
  },
  {
    id: "social",
    labels: { ja: "みんなで", en: "Social" },
    pathSuffix: "/social/posts",
    icon: Chats,
  },
  {
    id: "mypage",
    labels: { ja: "マイページ", en: "My Page" },
    pathSuffix: "/mypage",
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
 * URL の pathname から locale を抽出する。
 * 例: https://www.aikinote.com/en/personal/pages → "en"
 *     https://www.aikinote.com/ja/social/posts → "ja"
 *     https://www.aikinote.com/login (locale prefix なし) → "ja" (default)
 */
export function getLocale(url: string): Locale {
  try {
    const { pathname } = new URL(url);
    const match = pathname.match(/^\/([a-z]{2})(?=\/|$)/);
    if (match) {
      const candidate = match[1] as Locale;
      if (SUPPORTED_LOCALES.includes(candidate)) {
        return candidate;
      }
    }
  } catch {
    // URL パース失敗時は default
  }
  return DEFAULT_LOCALE;
}

/**
 * locale prefix を付けた pathname を生成する。
 * 例: buildLocalePath("en", "/personal/pages") → "/en/personal/pages"
 */
export function buildLocalePath(locale: Locale, pathSuffix: string): string {
  return `/${locale}${pathSuffix}`;
}

/**
 * URL からアクティブなタブを判定する。
 *
 * Web 版で `TabNavigation` を表示するページのみでタブバーを出す。
 * Web 版の表示条件（DefaultLayout / SocialLayout の showTabNavigation=true）に対応するページだけ
 * タブ ID を返し、それ以外（詳細・編集・設定・通知・プロフィール・作成フォーム・検索結果等）は null を返す。
 *
 * Web 版で TabNavigation を表示するページ:
 * - `/personal/pages`（一覧）
 * - `/personal/pages/[id]`（詳細表示、/new と /edit は除く）
 * - `/mypage`
 * - `/social/posts`（フィード）
 */
export function getActiveTab(url: string): TabId | null {
  const normalized = normalizePathname(url);
  if (!normalized) return null;

  // /personal/pages 一覧
  if (/^\/personal\/pages\/?(\?.*)?$/.test(normalized)) return "personal";
  // /personal/pages/[id] 詳細（/new, /edit は除外）
  if (
    /^\/personal\/pages\/[^/]+\/?(\?.*)?$/.test(normalized) &&
    !normalized.startsWith("/personal/pages/new")
  ) {
    return "personal";
  }

  // /mypage 完全一致
  if (/^\/mypage\/?(\?.*)?$/.test(normalized)) return "mypage";

  // /social/posts フィード
  if (/^\/social\/posts\/?(\?.*)?$/.test(normalized)) return "social";

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
