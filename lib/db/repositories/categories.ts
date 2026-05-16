// user_categories テーブルの CRUD。デフォルトカテゴリ (取り/受け/技) + ユーザー追加。
// 上限は plan どおり 10 個 (デフォルト 3 + 追加 7)、上限超過は呼び出し側で
// LIMIT_EXCEEDED として弾く。

import { randomUUID } from "expo-crypto";
import type { SQLiteDatabase } from "expo-sqlite";
import type { UserCategoryRow } from "../schema";

export const MAX_CATEGORIES_PER_USER = 10;

export async function listCategories(
  db: SQLiteDatabase,
  userId: string,
): Promise<UserCategoryRow[]> {
  return db.getAllAsync<UserCategoryRow>(
    `SELECT * FROM user_categories
     WHERE user_id = ? AND deleted_at IS NULL
     ORDER BY sort_order ASC, created_at ASC;`,
    userId,
  );
}

export async function countCategories(
  db: SQLiteDatabase,
  userId: string,
): Promise<number> {
  const row = await db.getFirstAsync<{ c: number }>(
    "SELECT COUNT(*) AS c FROM user_categories WHERE user_id = ? AND deleted_at IS NULL;",
    userId,
  );
  return row?.c ?? 0;
}

export interface CreateCategoryInput {
  userId: string;
  name: string;
  slug: string;
  sortOrder?: number;
}

export async function createCategory(
  db: SQLiteDatabase,
  input: CreateCategoryInput,
): Promise<UserCategoryRow> {
  const localId = randomUUID();
  const now = new Date().toISOString();
  const sortOrder = input.sortOrder ?? 0;

  await db.runAsync(
    `INSERT INTO user_categories
       (local_id, server_id, user_id, name, slug, sort_order, is_default,
        created_at, updated_at, deleted_at, sync_status)
     VALUES (?, NULL, ?, ?, ?, ?, 0, ?, ?, NULL, 'pending_create');`,
    localId,
    input.userId,
    input.name,
    input.slug,
    sortOrder,
    now,
    now,
  );

  const created = await db.getFirstAsync<UserCategoryRow>(
    "SELECT * FROM user_categories WHERE local_id = ?;",
    localId,
  );
  if (!created)
    throw new Error("[categories] createCategory: row not found after insert");
  return created;
}

export async function updateCategory(
  db: SQLiteDatabase,
  localId: string,
  updates: { name?: string; sortOrder?: number },
): Promise<UserCategoryRow | null> {
  const existing = await db.getFirstAsync<UserCategoryRow>(
    "SELECT * FROM user_categories WHERE local_id = ? AND deleted_at IS NULL;",
    localId,
  );
  if (!existing) return null;

  const now = new Date().toISOString();
  const name = updates.name ?? existing.name;
  const sortOrder = updates.sortOrder ?? existing.sort_order;

  const newSyncStatus =
    existing.sync_status === "pending_create"
      ? "pending_create"
      : "pending_update";

  await db.runAsync(
    `UPDATE user_categories
     SET name = ?, sort_order = ?, updated_at = ?, sync_status = ?
     WHERE local_id = ?;`,
    name,
    sortOrder,
    now,
    newSyncStatus,
    localId,
  );

  return db.getFirstAsync<UserCategoryRow>(
    "SELECT * FROM user_categories WHERE local_id = ?;",
    localId,
  );
}

export async function softDeleteCategory(
  db: SQLiteDatabase,
  localId: string,
): Promise<boolean> {
  const existing = await db.getFirstAsync<UserCategoryRow>(
    "SELECT * FROM user_categories WHERE local_id = ?;",
    localId,
  );
  if (!existing || existing.deleted_at !== null) return false;
  if (existing.is_default === 1) return false; // デフォルトカテゴリは削除不可

  const now = new Date().toISOString();

  if (existing.sync_status === "pending_create") {
    await db.runAsync(
      "DELETE FROM user_categories WHERE local_id = ?;",
      localId,
    );
    return true;
  }

  await db.runAsync(
    `UPDATE user_categories
     SET deleted_at = ?, updated_at = ?, sync_status = 'pending_delete'
     WHERE local_id = ?;`,
    now,
    now,
    localId,
  );
  return true;
}
