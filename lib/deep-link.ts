import * as Linking from "expo-linking";
import { config } from "@/constants/config";

/**
 * ディープリンク URL を Web 版の URL に変換する
 * 例: aikinotenativeapp://personal/pages/123 → https://aikinote.com/personal/pages/123
 */
export function toWebUrl(deepLinkUrl: string): string {
  const { path, queryParams } = Linking.parse(deepLinkUrl);

  const pathname = path ? `/${path}` : "";
  const query = queryParams ? toQueryString(queryParams) : "";

  return `${config.webBaseUrl}${pathname}${query}`;
}

function toQueryString(
  params: Record<string, string | string[] | undefined>,
): string {
  const entries = Object.entries(params).filter(
    (entry): entry is [string, string] => typeof entry[1] === "string",
  );
  if (entries.length === 0) return "";
  return `?${new URLSearchParams(entries).toString()}`;
}
