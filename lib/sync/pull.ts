// Supabase → SQLite の Pull 処理。
//
// Pull 順序 (依存関係):
//   1. user_categories
//   2. user_tags
//   3. training_pages
//   4. training_page_tags
//   5. training_dates
//   6. page_attachments (training_pages に依存)
//
// LWW: lib/sync/lww.ts の shouldOverwriteWithRemote を使う。
// 削除モデル: **Supabase 側は soft delete を持たず、物理削除のみ** (backend
// migrations に deleted_at カラムは存在しない)。push.ts 側で
// pending_delete を Supabase で DELETE して purgeRow している設計と整合。
// したがって本 Pull では deleted_at を SELECT せず、ローカル
// SQLite の deleted_at は常に NULL でセットする。
//
// 認証: USER_INFO 経由で supabase.auth.setSession 済みの前提。
// それ以外の場合は Supabase が 401 を返し、本関数は例外を投げる
// (Engine 側で catch して console.error)。

import { randomUUID } from "expo-crypto";
import type { SQLiteDatabase } from "expo-sqlite";
import { getDatabase } from "@/lib/db";
import { upsertAttachmentFromRemote } from "@/lib/db/repositories/page-attachments";
import type {
  TrainingDateRow,
  TrainingPageRow,
  UserCategoryRow,
  UserTagRow,
} from "@/lib/db/schema";
import { supabase } from "@/lib/supabase";
import { shouldOverwriteWithRemote } from "./lww";

export interface PullContext {
  userId: string;
  /** 増分 Pull の起点 (ISO 8601)。null なら全件 (full pull)。 */
  since?: string | null;
}

interface RemoteCategoryRow {
  id: string;
  user_id: string;
  name: string;
  slug: string;
  sort_order: number;
  is_default: boolean;
  created_at: string;
  updated_at: string;
}

interface RemoteTagRow {
  id: string;
  user_id: string;
  name: string;
  category: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

interface RemotePageRow {
  id: string;
  user_id: string;
  title: string;
  content: string;
  is_public: boolean;
  created_at: string;
  updated_at: string;
}

interface RemotePageTagRow {
  id: string;
  training_page_id: string;
  user_tag_id: string;
  created_at: string;
  updated_at: string;
}

interface RemoteTrainingDateRow {
  id: string;
  user_id: string;
  training_date: string;
  is_attended: boolean;
  created_at: string;
  updated_at: string;
}

interface RemotePageAttachmentRow {
  id: string;
  page_id: string;
  user_id: string;
  type: "image" | "video" | "youtube";
  url: string;
  thumbnail_url: string | null;
  original_filename: string | null;
  file_size_bytes: number | null;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export async function pullAll(ctx: PullContext): Promise<void> {
  const db = await getDatabase();
  await pullCategories(db, ctx);
  await pullTags(db, ctx);
  await pullPages(db, ctx);
  await pullPageTags(db, ctx);
  await pullTrainingDates(db, ctx);
  await pullAttachments(db, ctx);
}

// ============================== Categories ==============================

async function pullCategories(
  db: SQLiteDatabase,
  ctx: PullContext,
): Promise<void> {
  let query = supabase
    .from("UserCategory")
    .select(
      "id, user_id, name, slug, sort_order, is_default, created_at, updated_at",
    )
    .eq("user_id", ctx.userId);
  if (ctx.since) query = query.gte("updated_at", ctx.since);
  const { data, error } = await query.returns<RemoteCategoryRow[]>();
  if (error) throw new Error(`pullCategories: ${error.message}`);

  for (const remote of data ?? []) {
    const local = await db.getFirstAsync<UserCategoryRow>(
      "SELECT * FROM user_categories WHERE server_id = ?;",
      remote.id,
    );
    if (!local) {
      const localId = randomUUID();
      await db.runAsync(
        `INSERT OR IGNORE INTO user_categories
           (local_id, server_id, user_id, name, slug, sort_order, is_default,
            created_at, updated_at, sync_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'synced');`,
        localId,
        remote.id,
        remote.user_id,
        remote.name,
        remote.slug,
        remote.sort_order,
        remote.is_default ? 1 : 0,
        remote.created_at,
        remote.updated_at,
      );
      continue;
    }
    if (local.sync_status !== "synced") continue; // pending_* はローカル優先
    if (!shouldOverwriteWithRemote(local, remote)) continue;

    await db.runAsync(
      `UPDATE user_categories
       SET name = ?, slug = ?, sort_order = ?, is_default = ?,
           updated_at = ?, sync_status = 'synced'
       WHERE local_id = ?;`,
      remote.name,
      remote.slug,
      remote.sort_order,
      remote.is_default ? 1 : 0,
      remote.updated_at,
      local.local_id,
    );
  }
}

// ============================== Tags ==============================

async function pullTags(db: SQLiteDatabase, ctx: PullContext): Promise<void> {
  let query = supabase
    .from("UserTag")
    .select("id, user_id, name, category, sort_order, created_at, updated_at")
    .eq("user_id", ctx.userId);
  if (ctx.since) query = query.gte("updated_at", ctx.since);
  const { data, error } = await query.returns<RemoteTagRow[]>();
  if (error) throw new Error(`pullTags: ${error.message}`);

  for (const remote of data ?? []) {
    const local = await db.getFirstAsync<UserTagRow>(
      "SELECT * FROM user_tags WHERE server_id = ?;",
      remote.id,
    );
    if (!local) {
      const localId = randomUUID();
      await db.runAsync(
        `INSERT OR IGNORE INTO user_tags
           (local_id, server_id, user_id, name, category, sort_order,
            created_at, updated_at, sync_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'synced');`,
        localId,
        remote.id,
        remote.user_id,
        remote.name,
        remote.category,
        remote.sort_order,
        remote.created_at,
        remote.updated_at,
      );
      continue;
    }
    if (local.sync_status !== "synced") continue;
    if (!shouldOverwriteWithRemote(local, remote)) continue;

    await db.runAsync(
      `UPDATE user_tags
       SET name = ?, category = ?, sort_order = ?, updated_at = ?,
           sync_status = 'synced'
       WHERE local_id = ?;`,
      remote.name,
      remote.category,
      remote.sort_order,
      remote.updated_at,
      local.local_id,
    );
  }
}

// ============================== Pages ==============================

async function pullPages(db: SQLiteDatabase, ctx: PullContext): Promise<void> {
  let query = supabase
    .from("TrainingPage")
    .select("id, user_id, title, content, is_public, created_at, updated_at")
    .eq("user_id", ctx.userId);
  if (ctx.since) query = query.gte("updated_at", ctx.since);
  const { data, error } = await query.returns<RemotePageRow[]>();
  if (error) throw new Error(`pullPages: ${error.message}`);

  for (const remote of data ?? []) {
    const local = await db.getFirstAsync<TrainingPageRow>(
      "SELECT * FROM training_pages WHERE server_id = ?;",
      remote.id,
    );
    if (!local) {
      const localId = randomUUID();
      await db.runAsync(
        `INSERT OR IGNORE INTO training_pages
           (local_id, server_id, user_id, title, content, is_public,
            created_at, updated_at, sync_status, last_synced_at, sync_error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'synced', ?, NULL);`,
        localId,
        remote.id,
        remote.user_id,
        remote.title,
        remote.content,
        remote.is_public ? 1 : 0,
        remote.created_at,
        remote.updated_at,
        new Date().toISOString(),
      );
      continue;
    }
    if (local.sync_status !== "synced") continue;
    if (!shouldOverwriteWithRemote(local, remote)) continue;

    await db.runAsync(
      `UPDATE training_pages
       SET title = ?, content = ?, is_public = ?, updated_at = ?,
           sync_status = 'synced', last_synced_at = ?
       WHERE local_id = ?;`,
      remote.title,
      remote.content,
      remote.is_public ? 1 : 0,
      remote.updated_at,
      new Date().toISOString(),
      local.local_id,
    );
  }
}

// ============================== PageTags ==============================

async function pullPageTags(
  db: SQLiteDatabase,
  ctx: PullContext,
): Promise<void> {
  // TrainingPageTag テーブルには user_id カラムが無い (中間テーブル) ため、
  // RLS でユーザー絞り込みが効くかが本番 DB 設定に依存して不安定。
  // ローカルで pull 済みの training_pages.server_id 一覧を取り出し、
  // training_page_id IN (...) で確実に該当ユーザーの行だけ取得する。
  const userPages = await db.getAllAsync<{ server_id: string }>(
    `SELECT server_id FROM training_pages
     WHERE user_id = ? AND server_id IS NOT NULL;`,
    ctx.userId,
  );
  if (userPages.length === 0) return;
  const serverIds = userPages.map((p) => p.server_id);

  let query = supabase
    .from("TrainingPageTag")
    .select("id, training_page_id, user_tag_id, created_at, updated_at")
    .in("training_page_id", serverIds);
  if (ctx.since) query = query.gte("updated_at", ctx.since);
  const { data, error } = await query.returns<RemotePageTagRow[]>();
  if (error) throw new Error(`pullPageTags: ${error.message}`);

  for (const remote of data ?? []) {
    const existing = await db.getFirstAsync<{ local_id: string }>(
      "SELECT local_id FROM training_page_tags WHERE server_id = ?;",
      remote.id,
    );
    if (existing) continue; // 中間テーブルは更新不要 (削除/作成のみ)

    // ローカルで page と tag の local_id を解決
    const page = await db.getFirstAsync<{ local_id: string }>(
      "SELECT local_id FROM training_pages WHERE server_id = ?;",
      remote.training_page_id,
    );
    const tag = await db.getFirstAsync<{ local_id: string }>(
      "SELECT local_id FROM user_tags WHERE server_id = ?;",
      remote.user_tag_id,
    );
    if (!page || !tag) continue;

    const localId = randomUUID();
    await db.runAsync(
      `INSERT OR IGNORE INTO training_page_tags
         (local_id, server_id, page_local_id, tag_local_id,
          created_at, updated_at, sync_status)
       VALUES (?, ?, ?, ?, ?, ?, 'synced');`,
      localId,
      remote.id,
      page.local_id,
      tag.local_id,
      remote.created_at,
      remote.updated_at,
    );
  }
}

// ============================== TrainingDates ==============================

async function pullTrainingDates(
  db: SQLiteDatabase,
  ctx: PullContext,
): Promise<void> {
  let query = supabase
    .from("TrainingDate")
    .select("id, user_id, training_date, is_attended, created_at, updated_at")
    .eq("user_id", ctx.userId);
  if (ctx.since) query = query.gte("updated_at", ctx.since);
  const { data, error } = await query.returns<RemoteTrainingDateRow[]>();
  if (error) throw new Error(`pullTrainingDates: ${error.message}`);

  for (const remote of data ?? []) {
    const local = await db.getFirstAsync<TrainingDateRow>(
      "SELECT * FROM training_dates WHERE server_id = ?;",
      remote.id,
    );
    if (!local) {
      const localId = randomUUID();
      await db.runAsync(
        `INSERT OR IGNORE INTO training_dates
           (local_id, server_id, user_id, training_date, is_attended,
            created_at, updated_at, sync_status)
         VALUES (?, ?, ?, ?, ?, ?, ?, 'synced');`,
        localId,
        remote.id,
        remote.user_id,
        remote.training_date,
        remote.is_attended ? 1 : 0,
        remote.created_at,
        remote.updated_at,
      );
      continue;
    }
    if (local.sync_status !== "synced") continue;
    if (!shouldOverwriteWithRemote(local, remote)) continue;

    await db.runAsync(
      `UPDATE training_dates
       SET is_attended = ?, updated_at = ?, sync_status = 'synced'
       WHERE local_id = ?;`,
      remote.is_attended ? 1 : 0,
      remote.updated_at,
      local.local_id,
    );
  }
}

// ============================== Page Attachments ==============================

/**
 * Supabase の PageAttachment を取得して SQLite に upsert する。
 * remote_url のみ保存し、ファイル本体のダウンロードは
 * lib/sync/download.ts (downloadPendingAttachments) が後段で実行する。
 *
 * - training_pages の pull より後で実行される (page_local_id 解決のため)
 * - YouTube タイプは url がそのまま埋まり、download_status は NULL のまま
 */
async function pullAttachments(
  db: SQLiteDatabase,
  ctx: PullContext,
): Promise<void> {
  let query = supabase
    .from("PageAttachment")
    .select(
      "id, page_id, user_id, type, url, thumbnail_url, original_filename, file_size_bytes, sort_order, created_at, updated_at",
    )
    .eq("user_id", ctx.userId);
  if (ctx.since) query = query.gte("updated_at", ctx.since);
  const { data, error } = await query.returns<RemotePageAttachmentRow[]>();
  if (error) throw new Error(`pullAttachments: ${error.message}`);

  for (const remote of data ?? []) {
    // 親ページの local_id を server_id 経由で解決
    const page = await db.getFirstAsync<{ local_id: string }>(
      "SELECT local_id FROM training_pages WHERE server_id = ?;",
      remote.page_id,
    );
    if (!page) continue; // 親ページが未 pull の場合はスキップ (次回 pull で拾う)

    // 既存ローカルがあれば LWW で更新可否判定
    const existing = await db.getFirstAsync<{
      local_id: string;
      updated_at: string;
      sync_status: string;
    }>(
      "SELECT local_id, updated_at, sync_status FROM page_attachments WHERE server_id = ?;",
      remote.id,
    );
    if (existing && existing.sync_status !== "synced") continue; // ローカル変更優先
    if (
      existing &&
      !shouldOverwriteWithRemote(
        { updated_at: existing.updated_at },
        { updated_at: remote.updated_at },
      )
    ) {
      continue;
    }

    await upsertAttachmentFromRemote(db, {
      serverId: remote.id,
      pageLocalId: page.local_id,
      type: remote.type,
      remoteUrl: remote.url,
      thumbnailUrl: remote.thumbnail_url,
      originalFilename: remote.original_filename,
      fileSizeBytes: remote.file_size_bytes,
      mimeType: inferMimeType(
        remote.type,
        remote.original_filename,
        remote.url,
      ),
      sortOrder: remote.sort_order,
      createdAt: remote.created_at,
      updatedAt: remote.updated_at,
    });
  }
}

function inferMimeType(
  type: "image" | "video" | "youtube",
  filename: string | null,
  url: string,
): string | null {
  if (type === "youtube") return null;
  const source = filename ?? url;
  const dot = source.lastIndexOf(".");
  if (dot < 0) return null;
  const ext = source
    .slice(dot + 1)
    .toLowerCase()
    .split("?")[0];
  if (ext === "jpg" || ext === "jpeg") return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "mp4") return "video/mp4";
  if (ext === "mov") return "video/quicktime";
  if (ext === "webm") return "video/webm";
  return null;
}
