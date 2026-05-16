// 「ひとりで」(personal pages = 個人の稽古記録) を Native SQLite + Native FS で
// オフラインファースト動作させるための WebView ↔ Native ブリッジ dispatcher。
//
// PR2: Pages / Tags / Categories / TrainingDates の CRUD を実装。
// Attachments と Sync (PERSONAL_ATTACHMENTS_* / PERSONAL_SYNC_*) は引き続き
// NOT_IMPLEMENTED で返す (PR4, PR5 で実装予定)。
//
// プロトコル仕様の正は docs/webview-bridge-protocol.md。

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
  "PERSONAL_ATTACHMENTS_LIST",
  "PERSONAL_ATTACHMENTS_CREATE",
  "PERSONAL_ATTACHMENTS_DELETE",
  "PERSONAL_SYNC_TRIGGER",
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
  return rows;
}

async function handlePagesGet(payload: Record<string, unknown>) {
  const pageId = requireString(payload, "pageId");
  const db = await getDatabase();
  const page = await getPage(db, pageId);
  if (!page) {
    throw new BridgeHandlerError("NOT_FOUND", `Page not found: ${pageId}`);
  }
  const tags = await listTagsForPage(db, pageId);
  return { ...page, tags };
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

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9぀-ヿ一-鿿]+/g, "-")
      .replace(/^-+|-+$/g, "") || "category"
  );
}
