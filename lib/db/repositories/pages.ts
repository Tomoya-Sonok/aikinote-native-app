// training_pages テーブルの CRUD。soft delete + sync_status 管理を担当。
//
// 設計メモ:
//   - local_id は expo-crypto.randomUUID() で生成
//   - updated_at は ISO 8601 ms 精度 (Date#toISOString)
//   - 削除は deleted_at をセット + sync_status='pending_delete'
//   - list は WHERE deleted_at IS NULL を必須にする

import { randomUUID } from "expo-crypto";
import type { SQLiteDatabase } from "expo-sqlite";
import type { SyncStatus, TrainingPageRow } from "../schema";

export interface ListPagesParams {
  userId: string;
  limit?: number;
  offset?: number;
  query?: string;
  startDate?: string;
  endDate?: string;
  sortOrder?: "newest" | "oldest";
}

export async function listPages(
  db: SQLiteDatabase,
  params: ListPagesParams,
): Promise<TrainingPageRow[]> {
  const conditions: string[] = ["user_id = ?", "deleted_at IS NULL"];
  const args: (string | number)[] = [params.userId];

  if (params.query) {
    conditions.push("(title LIKE ? OR content LIKE ?)");
    const pattern = `%${params.query}%`;
    args.push(pattern, pattern);
  }
  if (params.startDate) {
    conditions.push("created_at >= ?");
    args.push(params.startDate);
  }
  if (params.endDate) {
    conditions.push("created_at <= ?");
    args.push(params.endDate);
  }

  const direction = params.sortOrder === "oldest" ? "ASC" : "DESC";
  const limit = params.limit ?? 50;
  const offset = params.offset ?? 0;
  args.push(limit, offset);

  const sql = `SELECT * FROM training_pages
    WHERE ${conditions.join(" AND ")}
    ORDER BY created_at ${direction}
    LIMIT ? OFFSET ?;`;

  return db.getAllAsync<TrainingPageRow>(sql, ...args);
}

export async function getPage(
  db: SQLiteDatabase,
  localId: string,
): Promise<TrainingPageRow | null> {
  const row = await db.getFirstAsync<TrainingPageRow>(
    "SELECT * FROM training_pages WHERE local_id = ? AND deleted_at IS NULL;",
    localId,
  );
  return row ?? null;
}

export async function getPageByServerId(
  db: SQLiteDatabase,
  serverId: string,
): Promise<TrainingPageRow | null> {
  const row = await db.getFirstAsync<TrainingPageRow>(
    "SELECT * FROM training_pages WHERE server_id = ?;",
    serverId,
  );
  return row ?? null;
}

export interface CreatePageInput {
  userId: string;
  title: string;
  content: string;
  isPublic?: boolean;
  createdAt?: string; // 指定なければ now
}

export async function createPage(
  db: SQLiteDatabase,
  input: CreatePageInput,
): Promise<TrainingPageRow> {
  const localId = randomUUID();
  const now = new Date().toISOString();
  const createdAt = input.createdAt ?? now;

  await db.runAsync(
    `INSERT INTO training_pages
       (local_id, server_id, user_id, title, content, is_public,
        created_at, updated_at, deleted_at, sync_status, last_synced_at, sync_error)
     VALUES (?, NULL, ?, ?, ?, ?, ?, ?, NULL, 'pending_create', NULL, NULL);`,
    localId,
    input.userId,
    input.title,
    input.content,
    input.isPublic ? 1 : 0,
    createdAt,
    now,
  );

  const created = await getPage(db, localId);
  if (!created)
    throw new Error("[pages] createPage: row not found after insert");
  return created;
}

export interface UpdatePageInput {
  localId: string;
  title?: string;
  content?: string;
  isPublic?: boolean;
}

export async function updatePage(
  db: SQLiteDatabase,
  input: UpdatePageInput,
): Promise<TrainingPageRow | null> {
  const existing = await getPage(db, input.localId);
  if (!existing) return null;

  const now = new Date().toISOString();
  const title = input.title ?? existing.title;
  const content = input.content ?? existing.content;
  const isPublic =
    input.isPublic === undefined ? existing.is_public : input.isPublic ? 1 : 0;

  // 既に pending_create のものはそのまま (server に届く前なので create で送る)
  const newSyncStatus: SyncStatus =
    existing.sync_status === "pending_create"
      ? "pending_create"
      : "pending_update";

  await db.runAsync(
    `UPDATE training_pages
     SET title = ?, content = ?, is_public = ?, updated_at = ?, sync_status = ?
     WHERE local_id = ?;`,
    title,
    content,
    isPublic,
    now,
    newSyncStatus,
    input.localId,
  );

  return getPage(db, input.localId);
}

/**
 * Soft delete。物理削除は同期 push 成功後に行う。
 */
export async function softDeletePage(
  db: SQLiteDatabase,
  localId: string,
): Promise<boolean> {
  const existing = await getPage(db, localId);
  if (!existing) return false;

  const now = new Date().toISOString();

  // pending_create のものは server に届いていないので物理削除
  if (existing.sync_status === "pending_create") {
    await db.runAsync(
      "DELETE FROM training_pages WHERE local_id = ?;",
      localId,
    );
    return true;
  }

  await db.runAsync(
    `UPDATE training_pages
     SET deleted_at = ?, updated_at = ?, sync_status = 'pending_delete'
     WHERE local_id = ?;`,
    now,
    now,
    localId,
  );
  return true;
}

export async function togglePageVisibility(
  db: SQLiteDatabase,
  localId: string,
  isPublic: boolean,
): Promise<TrainingPageRow | null> {
  return updatePage(db, { localId, isPublic });
}
