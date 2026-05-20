// 「ひとりで」(personal pages = 個人の稽古記録) を Native SQLite + Native FS で
// オフラインファースト動作させるための WebView ↔ Native ブリッジ dispatcher。
//
// PR2: Pages / Tags / Categories / TrainingDates の CRUD を実装。
// Attachments と Sync (PERSONAL_ATTACHMENTS_* / PERSONAL_SYNC_*) は引き続き
// NOT_IMPLEMENTED で返す (PR4, PR5 で実装予定)。
//
// プロトコル仕様の正は docs/webview-bridge-protocol.md。

import * as FileSystem from "expo-file-system/legacy";
import { getDatabase } from "@/lib/db";
import {
  countCategories,
  createCategory,
  listCategories,
  MAX_CATEGORIES_PER_USER,
  softDeleteCategory,
  updateCategory,
} from "@/lib/db/repositories/categories";
import {
  createImageAttachmentFromBase64,
  listAttachmentsForPage,
  softDeleteAttachment,
  touchAccessed,
} from "@/lib/db/repositories/page-attachments";
import {
  listTagsForPage,
  replacePageTags,
} from "@/lib/db/repositories/page-tags";
import {
  createPage,
  getPage,
  listPages,
  softDeletePage,
  togglePageVisibility,
  updatePage,
} from "@/lib/db/repositories/pages";
import {
  createTag,
  listTags,
  softDeleteTag,
  updateTagOrder,
} from "@/lib/db/repositories/tags";
import {
  listTrainingDatesInMonth,
  softDeleteTrainingDate,
  upsertTrainingDate,
} from "@/lib/db/repositories/training-dates";
import type { PageAttachmentRow } from "@/lib/db/schema";
import {
  getSyncUserId,
  runSync,
  type SyncScope,
  triggerDownloadSync,
  triggerPushSync,
} from "@/lib/sync/engine";

type SendToWebView = (type: string, payload: Record<string, unknown>) => void;

interface PersonalBridgeMessage {
  type: string;
  requestId?: string;
  payload?: Record<string, unknown>;
}

interface BridgeError {
  code:
    | "NOT_IMPLEMENTED"
    | "UNKNOWN_TYPE"
    | "VALIDATION_ERROR"
    | "NOT_FOUND"
    | "LIMIT_EXCEEDED"
    | "INTERNAL_ERROR";
  message: string;
}

export function isPersonalBridgeMessage(type: unknown): type is string {
  return typeof type === "string" && type.startsWith("PERSONAL_");
}

const NOT_IMPLEMENTED_TYPES = new Set<string>([
  // PR5 ですべての PERSONAL_ATTACHMENTS_* を実装したため空。
  // 将来別の未実装メッセージタイプが増えた時のためにセット構造は残す。
]);

// mutation 系のメッセージタイプ。成功後に push-only sync を非同期キックする
// (ユーザー操作直後にサーバーへ反映する目的、UI は待たない)。
const MUTATION_TYPES = new Set<string>([
  "PERSONAL_PAGES_CREATE",
  "PERSONAL_PAGES_UPDATE",
  "PERSONAL_PAGES_DELETE",
  "PERSONAL_PAGES_TOGGLE_VISIBILITY",
  "PERSONAL_TAGS_CREATE",
  "PERSONAL_TAGS_DELETE",
  "PERSONAL_TAGS_UPDATE_ORDER",
  "PERSONAL_CATEGORIES_CREATE",
  "PERSONAL_CATEGORIES_UPDATE",
  "PERSONAL_CATEGORIES_DELETE",
  "PERSONAL_TRAINING_DATES_UPSERT",
  "PERSONAL_TRAINING_DATES_REMOVE",
  "PERSONAL_ATTACHMENTS_CREATE",
  "PERSONAL_ATTACHMENTS_DELETE",
]);

/**
 * PERSONAL_* メッセージを処理する。
 * 仕様: docs/webview-bridge-protocol.md
 */
export async function handlePersonalBridgeMessage(
  message: PersonalBridgeMessage,
  sendToWebView: SendToWebView,
): Promise<void> {
  const { type, requestId, payload } = message;
  const resultType = `${type}_RESULT`;

  if (!requestId) {
    console.warn(
      "[personal-bridge] requestId が無い PERSONAL_* メッセージを受信:",
      type,
    );
    return;
  }

  // 後続 PR で実装予定のハンドラはまだ NOT_IMPLEMENTED で返す
  if (NOT_IMPLEMENTED_TYPES.has(type)) {
    sendToWebView(resultType, {
      requestId,
      ok: false,
      error: {
        code: "NOT_IMPLEMENTED",
        message: `${type} is not yet implemented in this build.`,
      } satisfies BridgeError,
    });
    return;
  }

  try {
    const data = await dispatch(type, payload ?? {});
    sendToWebView(resultType, { requestId, ok: true, data });
    // mutation 成功時は push-only sync を非同期キック (UI は待たない)
    if (MUTATION_TYPES.has(type)) {
      triggerPushSync();
    }
  } catch (error) {
    if (error instanceof BridgeHandlerError) {
      sendToWebView(resultType, {
        requestId,
        ok: false,
        error: {
          code: error.code,
          message: error.message,
        } satisfies BridgeError,
      });
      return;
    }

    const message_ = error instanceof Error ? error.message : String(error);
    console.error(`[personal-bridge] ${type} で予期せぬエラー:`, error);
    sendToWebView(resultType, {
      requestId,
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: message_,
      } satisfies BridgeError,
    });
  }
}

class BridgeHandlerError extends Error {
  constructor(
    readonly code: BridgeError["code"],
    message: string,
  ) {
    super(message);
  }
}

async function dispatch(
  type: string,
  payload: Record<string, unknown>,
): Promise<unknown> {
  switch (type) {
    case "PERSONAL_PAGES_LIST":
      return handlePagesList(payload);
    case "PERSONAL_PAGES_GET":
      return handlePagesGet(payload);
    case "PERSONAL_PAGES_CREATE":
      return handlePagesCreate(payload);
    case "PERSONAL_PAGES_UPDATE":
      return handlePagesUpdate(payload);
    case "PERSONAL_PAGES_DELETE":
      return handlePagesDelete(payload);
    case "PERSONAL_PAGES_TOGGLE_VISIBILITY":
      return handlePagesToggleVisibility(payload);
    case "PERSONAL_TAGS_LIST":
      return handleTagsList(payload);
    case "PERSONAL_TAGS_CREATE":
      return handleTagsCreate(payload);
    case "PERSONAL_TAGS_DELETE":
      return handleTagsDelete(payload);
    case "PERSONAL_TAGS_UPDATE_ORDER":
      return handleTagsUpdateOrder(payload);
    case "PERSONAL_CATEGORIES_LIST":
      return handleCategoriesList(payload);
    case "PERSONAL_CATEGORIES_CREATE":
      return handleCategoriesCreate(payload);
    case "PERSONAL_CATEGORIES_UPDATE":
      return handleCategoriesUpdate(payload);
    case "PERSONAL_CATEGORIES_DELETE":
      return handleCategoriesDelete(payload);
    case "PERSONAL_TRAINING_DATES_MONTH":
      return handleTrainingDatesMonth(payload);
    case "PERSONAL_TRAINING_DATES_UPSERT":
      return handleTrainingDatesUpsert(payload);
    case "PERSONAL_TRAINING_DATES_REMOVE":
      return handleTrainingDatesRemove(payload);
    case "PERSONAL_ATTACHMENTS_LIST":
      return handleAttachmentsList(payload);
    case "PERSONAL_ATTACHMENTS_CREATE":
      return handleAttachmentsCreate(payload);
    case "PERSONAL_ATTACHMENTS_DELETE":
      return handleAttachmentsDelete(payload);
    case "PERSONAL_SYNC_TRIGGER":
      return handleSyncTrigger(payload);
    default:
      throw new BridgeHandlerError(
        "UNKNOWN_TYPE",
        `Unknown personal bridge message type: ${type}`,
      );
  }
}

// ============================== Pages ==============================

async function handlePagesList(payload: Record<string, unknown>) {
  const userId = requireString(payload, "userId");
  const db = await getDatabase();
  const rows = await listPages(db, {
    userId,
    limit: optionalNumber(payload, "limit"),
    offset: optionalNumber(payload, "offset"),
    query: optionalString(payload, "query"),
    startDate: optionalString(payload, "startDate"),
    endDate: optionalString(payload, "endDate"),
    sortOrder: optionalSortOrder(payload, "sortOrder"),
  });

  // 各ページに tags + attachments を埋め込んでから返す (N+1 だが SQLite ローカルなので許容)
  return Promise.all(
    rows.map(async (row) => {
      const tags = await listTagsForPage(db, row.local_id);
      const rawAttachments = await listAttachmentsForPage(db, row.local_id);
      const attachments = await Promise.all(
        rawAttachments.map((a) => shapeAttachmentForWeb(db, a)),
      );
      return { ...row, tags, attachments };
    }),
  );
}

async function handlePagesGet(payload: Record<string, unknown>) {
  const pageId = requireString(payload, "pageId");
  const db = await getDatabase();
  const page = await getPage(db, pageId);
  if (!page) {
    throw new BridgeHandlerError("NOT_FOUND", `Page not found: ${pageId}`);
  }
  const tags = await listTagsForPage(db, pageId);
  const rawAttachments = await listAttachmentsForPage(db, pageId);
  const attachments = await Promise.all(
    rawAttachments.map((a) => shapeAttachmentForWeb(db, a)),
  );
  return { ...page, tags, attachments };
}

async function handlePagesCreate(payload: Record<string, unknown>) {
  const userId = requireString(payload, "userId");
  const title = requireString(payload, "title");
  const content = optionalString(payload, "content") ?? "";
  const isPublic = optionalBoolean(payload, "isPublic") ?? false;
  const createdAt = optionalString(payload, "createdAt");
  const tagLocalIds = optionalStringArray(payload, "tagLocalIds") ?? [];

  if (title.length === 0) {
    throw new BridgeHandlerError(
      "VALIDATION_ERROR",
      "title is required and cannot be empty.",
    );
  }
  if (title.length > 35) {
    throw new BridgeHandlerError(
      "VALIDATION_ERROR",
      "title must be 35 characters or less.",
    );
  }
  if (content.length > 3000) {
    throw new BridgeHandlerError(
      "VALIDATION_ERROR",
      "content must be 3000 characters or less.",
    );
  }

  const db = await getDatabase();
  const page = await createPage(db, {
    userId,
    title,
    content,
    isPublic,
    createdAt,
  });
  if (tagLocalIds.length > 0) {
    await replacePageTags(db, page.local_id, tagLocalIds);
  }
  return { localId: page.local_id, serverId: page.server_id };
}

async function handlePagesUpdate(payload: Record<string, unknown>) {
  const pageId = requireString(payload, "pageId");
  const title = optionalString(payload, "title");
  const content = optionalString(payload, "content");
  const isPublic = optionalBoolean(payload, "isPublic");
  const tagLocalIds = optionalStringArray(payload, "tagLocalIds");

  if (title !== undefined && (title.length === 0 || title.length > 35)) {
    throw new BridgeHandlerError(
      "VALIDATION_ERROR",
      "title must be between 1 and 35 characters.",
    );
  }
  if (content !== undefined && content.length > 3000) {
    throw new BridgeHandlerError(
      "VALIDATION_ERROR",
      "content must be 3000 characters or less.",
    );
  }

  const db = await getDatabase();
  const updated = await updatePage(db, {
    localId: pageId,
    title,
    content,
    isPublic,
  });
  if (!updated) {
    throw new BridgeHandlerError("NOT_FOUND", `Page not found: ${pageId}`);
  }
  if (tagLocalIds !== undefined) {
    await replacePageTags(db, pageId, tagLocalIds);
  }
  return { localId: pageId };
}

async function handlePagesDelete(payload: Record<string, unknown>) {
  const pageId = requireString(payload, "pageId");
  const db = await getDatabase();
  const ok = await softDeletePage(db, pageId);
  if (!ok) {
    throw new BridgeHandlerError("NOT_FOUND", `Page not found: ${pageId}`);
  }
  return {};
}

async function handlePagesToggleVisibility(payload: Record<string, unknown>) {
  const pageId = requireString(payload, "pageId");
  const isPublic = requireBoolean(payload, "isPublic");
  const db = await getDatabase();
  const updated = await togglePageVisibility(db, pageId, isPublic);
  if (!updated) {
    throw new BridgeHandlerError("NOT_FOUND", `Page not found: ${pageId}`);
  }
  return { localId: pageId, isPublic };
}

// ============================== Tags ==============================

async function handleTagsList(payload: Record<string, unknown>) {
  const userId = requireString(payload, "userId");
  const db = await getDatabase();
  return listTags(db, userId);
}

async function handleTagsCreate(payload: Record<string, unknown>) {
  const userId = requireString(payload, "userId");
  const name = requireString(payload, "name");
  const category = requireString(payload, "category");
  const sortOrder = optionalNumber(payload, "sortOrder");

  if (name.length === 0) {
    throw new BridgeHandlerError(
      "VALIDATION_ERROR",
      "name is required and cannot be empty.",
    );
  }

  const db = await getDatabase();
  return createTag(db, { userId, name, category, sortOrder });
}

async function handleTagsDelete(payload: Record<string, unknown>) {
  const tagId = requireString(payload, "tagId");
  const db = await getDatabase();
  const ok = await softDeleteTag(db, tagId);
  if (!ok) {
    throw new BridgeHandlerError("NOT_FOUND", `Tag not found: ${tagId}`);
  }
  return {};
}

async function handleTagsUpdateOrder(payload: Record<string, unknown>) {
  const userId = requireString(payload, "userId");
  const category = requireString(payload, "category");
  const orderedTagIds = optionalStringArray(payload, "orderedTagIds") ?? [];
  const db = await getDatabase();
  await updateTagOrder(db, userId, category, orderedTagIds);
  return {};
}

// ============================== Categories ==============================

async function handleCategoriesList(payload: Record<string, unknown>) {
  const userId = requireString(payload, "userId");
  const db = await getDatabase();
  return listCategories(db, userId);
}

async function handleCategoriesCreate(payload: Record<string, unknown>) {
  const userId = requireString(payload, "userId");
  const name = requireString(payload, "name");
  const slug = optionalString(payload, "slug") ?? "";
  const sortOrder = optionalNumber(payload, "sortOrder");

  if (name.length === 0) {
    throw new BridgeHandlerError("VALIDATION_ERROR", "name is required.");
  }

  const db = await getDatabase();
  const count = await countCategories(db, userId);
  if (count >= MAX_CATEGORIES_PER_USER) {
    throw new BridgeHandlerError(
      "LIMIT_EXCEEDED",
      `Cannot create more than ${MAX_CATEGORIES_PER_USER} categories.`,
    );
  }

  return createCategory(db, {
    userId,
    name,
    slug: slug || slugify(name),
    sortOrder,
  });
}

async function handleCategoriesUpdate(payload: Record<string, unknown>) {
  const categoryId = requireString(payload, "categoryId");
  const name = optionalString(payload, "name");
  const sortOrder = optionalNumber(payload, "sortOrder");
  const db = await getDatabase();
  const updated = await updateCategory(db, categoryId, { name, sortOrder });
  if (!updated) {
    throw new BridgeHandlerError(
      "NOT_FOUND",
      `Category not found: ${categoryId}`,
    );
  }
  return updated;
}

async function handleCategoriesDelete(payload: Record<string, unknown>) {
  const categoryId = requireString(payload, "categoryId");
  const db = await getDatabase();
  const ok = await softDeleteCategory(db, categoryId);
  if (!ok) {
    throw new BridgeHandlerError(
      "NOT_FOUND",
      `Category not found or cannot be deleted: ${categoryId}`,
    );
  }
  return {};
}

// ============================== TrainingDates ==============================

async function handleTrainingDatesMonth(payload: Record<string, unknown>) {
  const userId = requireString(payload, "userId");
  const yearMonth = requireString(payload, "yearMonth");
  if (!/^\d{4}-\d{2}$/.test(yearMonth)) {
    throw new BridgeHandlerError(
      "VALIDATION_ERROR",
      "yearMonth must be in YYYY-MM format.",
    );
  }
  const db = await getDatabase();
  return listTrainingDatesInMonth(db, userId, yearMonth);
}

async function handleTrainingDatesUpsert(payload: Record<string, unknown>) {
  const userId = requireString(payload, "userId");
  const trainingDate = requireString(payload, "trainingDate");
  const isAttended = optionalBoolean(payload, "isAttended") ?? true;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trainingDate)) {
    throw new BridgeHandlerError(
      "VALIDATION_ERROR",
      "trainingDate must be in YYYY-MM-DD format.",
    );
  }
  const db = await getDatabase();
  return upsertTrainingDate(db, { userId, trainingDate, isAttended });
}

async function handleTrainingDatesRemove(payload: Record<string, unknown>) {
  const userId = requireString(payload, "userId");
  const trainingDate = requireString(payload, "trainingDate");
  const db = await getDatabase();
  const ok = await softDeleteTrainingDate(db, userId, trainingDate);
  if (!ok) {
    throw new BridgeHandlerError(
      "NOT_FOUND",
      `TrainingDate not found: ${trainingDate}`,
    );
  }
  return {};
}

// ============================== Attachments ==============================

const ATTACHMENT_IMAGE_MAX_BYTES = 5 * 1024 * 1024; // 5 MB (Web 版と統一)
const ATTACHMENT_VIDEO_MAX_BYTES = 300 * 1024 * 1024; // 300 MB (Web 版と統一)
const ATTACHMENT_MAX_COUNT_PER_PAGE = 5;
const ALLOWED_IMAGE_MIMES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);
const ALLOWED_VIDEO_MIMES = new Set([
  "video/mp4",
  "video/quicktime",
  "video/webm",
]);

/**
 * Web 版が `<img src>` / `<video src>` にそのまま渡せる URL に解決する。
 *
 * 重要: WebView は `https://www.aikinote.com` を HTTP origin で読み込んでおり、
 * Web 版から `file://` リソースへの横断アクセスはブラウザセキュリティで
 * 弾かれる (allowFileAccess 等の WebView prop は file:// origin 側でのみ効く)。
 * そのため、ローカルキャッシュを直接 `file://` で返すと表示できない。
 *
 * 解決方針:
 *   - 画像 (type='image') でローカルファイルがあれば base64 を読み出し、
 *     `data:<mime>;base64,...` の data URI として Web に返す
 *     (data URI は同一 origin 扱いで Web 側がそのまま読み込める)
 *   - 動画 (type='video') / YouTube / 画像でローカル無し or 読み込み失敗
 *     → remote_url (CloudFront / YouTube) を返す
 *
 * 動画の完全オフライン対応は別 PR (localhost HTTP サーバ案) で対応予定。
 * 本関数は data URI 化で I/O コストがあるため、呼び出し側は Promise.all
 * で並列化する。
 */
async function resolveDisplayUrl(
  row: PageAttachmentRow,
): Promise<string | null> {
  if (row.type === "image" && row.local_uri) {
    try {
      const base64 = await FileSystem.readAsStringAsync(row.local_uri, {
        encoding: FileSystem.EncodingType.Base64,
      });
      const mime = row.mime_type ?? "image/jpeg";
      return `data:${mime};base64,${base64}`;
    } catch (error) {
      console.warn(
        "[shapeAttachmentForWeb] base64 read failed, fallback to remote_url:",
        error,
      );
    }
  }
  return row.remote_url;
}

/**
 * Attachment 行を Web 版が期待する形に整形しつつ、表示用 URL を差し替える。
 * 同時に last_accessed_at を更新 (LRU 用)。
 */
async function shapeAttachmentForWeb(
  db: Awaited<ReturnType<typeof getDatabase>>,
  row: PageAttachmentRow,
) {
  await touchAccessed(db, row.local_id);
  return {
    ...row,
    url: await resolveDisplayUrl(row),
  };
}

async function handleAttachmentsList(payload: Record<string, unknown>) {
  const pageLocalId = requireString(payload, "pageLocalId");
  const db = await getDatabase();
  const rows = await listAttachmentsForPage(db, pageLocalId);

  // 未ダウンロード行があれば、表示要求のタイミングでバックグラウンドダウンロードを後押し
  const needsDownload = rows.some(
    (r) =>
      r.remote_url !== null &&
      r.local_uri === null &&
      (r.download_status === "pending" ||
        r.download_status === "failed" ||
        r.download_status === null),
  );
  if (needsDownload) {
    triggerDownloadSync();
  }

  return Promise.all(rows.map((r) => shapeAttachmentForWeb(db, r)));
}

async function handleAttachmentsCreate(payload: Record<string, unknown>) {
  const pageLocalId = requireString(payload, "pageLocalId");
  const base64 = requireString(payload, "base64");
  const mimeType = requireString(payload, "mimeType").toLowerCase();
  const filename = requireString(payload, "filename");
  const sizeBytes = optionalNumber(payload, "sizeBytes") ?? 0;
  const sortOrder = optionalNumber(payload, "sortOrder");

  const isImage = ALLOWED_IMAGE_MIMES.has(mimeType);
  const isVideo = ALLOWED_VIDEO_MIMES.has(mimeType);
  if (!isImage && !isVideo) {
    throw new BridgeHandlerError(
      "VALIDATION_ERROR",
      `mimeType must be one of ${[
        ...ALLOWED_IMAGE_MIMES,
        ...ALLOWED_VIDEO_MIMES,
      ].join(", ")}`,
    );
  }
  const sizeLimit = isImage
    ? ATTACHMENT_IMAGE_MAX_BYTES
    : ATTACHMENT_VIDEO_MAX_BYTES;
  if (sizeBytes > sizeLimit) {
    throw new BridgeHandlerError(
      "LIMIT_EXCEEDED",
      `${isImage ? "image" : "video"} size exceeds ${sizeLimit} bytes.`,
    );
  }

  const db = await getDatabase();
  const existing = await listAttachmentsForPage(db, pageLocalId);
  if (existing.length >= ATTACHMENT_MAX_COUNT_PER_PAGE) {
    throw new BridgeHandlerError(
      "LIMIT_EXCEEDED",
      `attachments per page must be ${ATTACHMENT_MAX_COUNT_PER_PAGE} or less.`,
    );
  }

  const row = await createImageAttachmentFromBase64(db, {
    pageLocalId,
    base64,
    mimeType,
    filename,
    sizeBytes,
    sortOrder,
  });
  if (isVideo) {
    // ローカル DB 上の type を 'video' に直す (createImageAttachmentFromBase64 は
    // 既存 API で type='image' 固定の INSERT を行うため)
    await db.runAsync(
      "UPDATE page_attachments SET type = 'video' WHERE local_id = ?;",
      row.local_id,
    );
  }
  return { localId: row.local_id, localUri: row.local_uri };
}

async function handleAttachmentsDelete(payload: Record<string, unknown>) {
  const attachmentId = requireString(payload, "attachmentId");
  const db = await getDatabase();
  const ok = await softDeleteAttachment(db, attachmentId);
  if (!ok) {
    throw new BridgeHandlerError(
      "NOT_FOUND",
      `Attachment not found: ${attachmentId}`,
    );
  }
  return {};
}

// ============================== Sync ==============================

async function handleSyncTrigger(payload: Record<string, unknown>) {
  const scope = optionalSyncScope(payload, "scope") ?? "push-only";
  const userId = getSyncUserId();
  if (!userId) {
    throw new BridgeHandlerError(
      "VALIDATION_ERROR",
      "sync user id is not registered yet (waiting for USER_INFO message).",
    );
  }
  // 同期は非同期キック。レスポンスは即返す
  void runSync(scope, { userId });
  return { triggered: true, scope };
}

// ============================== Helpers ==============================

function requireString(payload: Record<string, unknown>, key: string): string {
  const value = payload[key];
  if (typeof value !== "string") {
    throw new BridgeHandlerError(
      "VALIDATION_ERROR",
      `${key} must be a string.`,
    );
  }
  return value;
}

function optionalString(
  payload: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = payload[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "string") {
    throw new BridgeHandlerError(
      "VALIDATION_ERROR",
      `${key} must be a string when provided.`,
    );
  }
  return value;
}

function requireBoolean(
  payload: Record<string, unknown>,
  key: string,
): boolean {
  const value = payload[key];
  if (typeof value !== "boolean") {
    throw new BridgeHandlerError(
      "VALIDATION_ERROR",
      `${key} must be a boolean.`,
    );
  }
  return value;
}

function optionalBoolean(
  payload: Record<string, unknown>,
  key: string,
): boolean | undefined {
  const value = payload[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "boolean") {
    throw new BridgeHandlerError(
      "VALIDATION_ERROR",
      `${key} must be a boolean when provided.`,
    );
  }
  return value;
}

function optionalNumber(
  payload: Record<string, unknown>,
  key: string,
): number | undefined {
  const value = payload[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new BridgeHandlerError(
      "VALIDATION_ERROR",
      `${key} must be a number when provided.`,
    );
  }
  return value;
}

function optionalStringArray(
  payload: Record<string, unknown>,
  key: string,
): string[] | undefined {
  const value = payload[key];
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.some((v) => typeof v !== "string")) {
    throw new BridgeHandlerError(
      "VALIDATION_ERROR",
      `${key} must be an array of strings.`,
    );
  }
  return value as string[];
}

function optionalSortOrder(
  payload: Record<string, unknown>,
  key: string,
): "newest" | "oldest" | undefined {
  const value = payload[key];
  if (value === undefined || value === null) return undefined;
  if (value !== "newest" && value !== "oldest") {
    throw new BridgeHandlerError(
      "VALIDATION_ERROR",
      `${key} must be "newest" or "oldest" when provided.`,
    );
  }
  return value;
}

function optionalSyncScope(
  payload: Record<string, unknown>,
  key: string,
): SyncScope | undefined {
  const value = payload[key];
  if (value === undefined || value === null) return undefined;
  if (value !== "full" && value !== "incremental" && value !== "push-only") {
    throw new BridgeHandlerError(
      "VALIDATION_ERROR",
      `${key} must be "full" | "incremental" | "push-only" when provided.`,
    );
  }
  return value;
}

/**
 * カテゴリ名から slug を生成する。
 *
 * 第一段の正規表現は「半角英小文字 / 半角数字 / ひらがな・カタカナ
 * (U+3040〜U+30FF) / 一般的な CJK 統合漢字 (U+4E00〜U+9FFF)」**以外**の
 * 連続を 1 個のハイフンに置換する。範囲指定は生文字ではなく \uXXXX で
 * 書くことでエディタのフォントや改行コードに依存せず安全に保てる。
 */
function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9\u3040-\u30FF\u4E00-\u9FFF]+/g, "-")
      .replace(/^-+|-+$/g, "") || "category"
  );
}
