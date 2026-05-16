// 「ひとりで」(personal pages = 個人の稽古記録) を Native SQLite + Native FS で
// オフラインファースト動作させるための WebView ↔ Native ブリッジ dispatcher。
//
// 本ファイルは PR1 では skeleton。すべての PERSONAL_* タイプを受け取って
// `NOT_IMPLEMENTED` レスポンスを返すだけ。実際の SQLite アクセスは PR2、
// 同期エンジンは PR4、添付は PR5、初回 import は PR6 で実装する。
//
// プロトコル仕様の正は docs/webview-bridge-protocol.md。

type SendToWebView = (type: string, payload: Record<string, unknown>) => void;

interface PersonalBridgeMessage {
  type: string;
  requestId?: string;
  payload?: Record<string, unknown>;
}

/**
 * Web から受信したメッセージタイプが PERSONAL_* 系か判定するヘルパ。
 * app/index.tsx の handleMessage ですべての PERSONAL_* を本モジュールに委譲する。
 */
export function isPersonalBridgeMessage(type: unknown): type is string {
  return typeof type === "string" && type.startsWith("PERSONAL_");
}

/**
 * 現在 dispatcher が受け付ける PERSONAL_* メッセージタイプの一覧。
 * docs/webview-bridge-protocol.md の表と同期を保つこと。
 */
const SUPPORTED_TYPES = new Set<string>([
  // Pages
  "PERSONAL_PAGES_LIST",
  "PERSONAL_PAGES_GET",
  "PERSONAL_PAGES_CREATE",
  "PERSONAL_PAGES_UPDATE",
  "PERSONAL_PAGES_DELETE",
  "PERSONAL_PAGES_TOGGLE_VISIBILITY",
  // Tags
  "PERSONAL_TAGS_LIST",
  "PERSONAL_TAGS_CREATE",
  "PERSONAL_TAGS_DELETE",
  "PERSONAL_TAGS_UPDATE_ORDER",
  // Categories
  "PERSONAL_CATEGORIES_LIST",
  "PERSONAL_CATEGORIES_CREATE",
  "PERSONAL_CATEGORIES_UPDATE",
  "PERSONAL_CATEGORIES_DELETE",
  // Attachments
  "PERSONAL_ATTACHMENTS_LIST",
  "PERSONAL_ATTACHMENTS_CREATE",
  "PERSONAL_ATTACHMENTS_DELETE",
  // Training dates
  "PERSONAL_TRAINING_DATES_MONTH",
  "PERSONAL_TRAINING_DATES_UPSERT",
  "PERSONAL_TRAINING_DATES_REMOVE",
  // Sync 制御
  "PERSONAL_SYNC_TRIGGER",
]);

/**
 * PERSONAL_* メッセージを処理する。本 PR では skeleton として
 * すべて NOT_IMPLEMENTED で返却。後続 PR で各タイプの実装を埋めていく。
 *
 * 仕様: docs/webview-bridge-protocol.md
 */
export async function handlePersonalBridgeMessage(
  message: PersonalBridgeMessage,
  sendToWebView: SendToWebView,
): Promise<void> {
  const { type, requestId } = message;
  const resultType = `${type}_RESULT`;

  if (!requestId) {
    // requestId 無しの request/response 系メッセージは仕様違反。
    // 例外は back-channel 専用の PERSONAL_SYNC_STATUS (Native → Web 一方向) のみで、
    // それは本 dispatcher を通らない。
    console.warn(
      "[personal-bridge] requestId が無い PERSONAL_* メッセージを受信:",
      type,
    );
    return;
  }

  if (!SUPPORTED_TYPES.has(type)) {
    sendToWebView(resultType, {
      requestId,
      ok: false,
      error: {
        code: "UNKNOWN_TYPE",
        message: `Unknown personal bridge message type: ${type}`,
      },
    });
    return;
  }

  // Skeleton: 後続 PR で実装。Web 側はこのレスポンスを見て Native 環境でも
  // 一時的に従来の tRPC 経路にフォールバックできるよう、明示的に NOT_IMPLEMENTED
  // を返してエラー扱いとする (silent fallback は混乱を生むため避ける)。
  sendToWebView(resultType, {
    requestId,
    ok: false,
    error: {
      code: "NOT_IMPLEMENTED",
      message: `${type} is not yet implemented in this build.`,
    },
  });
}
