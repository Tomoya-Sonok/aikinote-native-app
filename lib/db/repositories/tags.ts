// user_tags テーブルの CRUD。カテゴリ別 sort_order を保持。

import { randomUUID } from "expo-crypto";
import type { SQLiteDatabase } from "expo-sqlite";
import type { SyncStatus, UserTagRow } from "../schema";

export async function listTags(
  db: SQLiteDatabase,
  userId: string,
): Promise<UserTagRow[]> {
  return db.getAllAsync<UserTagRow>(
    `SELECT * FROM user_tags
     WHERE user_id = ? AND deleted_at IS NULL
     ORDER BY category ASC, sort_order ASC, created_at ASC;`,
    userId,
  );
}

export interface CreateTagInput {
  userId: string;
  name: string;
  category: string;
  sortOrder?: number;
}

export async function createTag(
  db: SQLiteDatabase,
  input: CreateTagInput,
): Promise<UserTagRow> {
  const localId = randomUUID();
  const now = new Date().toISOString();
  const sortOrder = input.sortOrder ?? 0;

  await db.runAsync(
    `INSERT INTO user_tags
       (local_id, server_id, user_id, name, category, sort_order,
        created_at, updated_at, deleted_at, sync_status)
     VALUES (?, NULL, ?, ?, ?, ?, ?, ?, NULL, 'pending_create');`,
    localId,
    input.userId,
    input.name,
    input.category,
    sortOrder,
    now,
    now,
  );

  const created = await db.getFirstAsync<UserTagRow>(
    "SELECT * FROM user_tags WHERE local_id = ?;",
    localId,
  );
  if (!created) throw new Error("[tags] createTag: row not found after insert");
  return created;
}

export async function softDeleteTag(
  db: SQLiteDatabase,
  localId: string,
): Promise<boolean> {
  const existing = await db.getFirstAsync<UserTagRow>(
    "SELECT * FROM user_tags WHERE local_id = ?;",
    localId,
  );
  if (!existing || existing.deleted_at !== null) return false;

  const now = new Date().toISOString();

  if (existing.sync_status === "pending_create") {
    await db.runAsync("DELETE FROM user_tags WHERE local_id = ?;", localId);
    return true;
  }

  await db.runAsync(
    `UPDATE user_tags
     SET deleted_at = ?, updated_at = ?, sync_status = 'pending_delete'
     WHERE local_id = ?;`,
    now,
    now,
    localId,
  );
  return true;
}

/**
 * カテゴリ内のタグ並び順を一括更新。
 * orderedLocalIds の並びがそのまま sort_order の昇順となる。
 */
export async function updateTagOrder(
  db: SQLiteDatabase,
  userId: string,
  category: string,
  orderedLocalIds: string[],
): Promise<void> {
  const now = new Date().toISOString();

  await db.withTransactionAsync(async () => {
    for (let i = 0; i < orderedLocalIds.length; i++) {
      const tagId = orderedLocalIds[i];
      const existing = await db.getFirstAsync<UserTagRow>(
        "SELECT sync_status FROM user_tags WHERE local_id = ? AND user_id = ? AND category = ?;",
        tagId,
        userId,
        category,
      );
      if (!existing) continue;

      const newSyncStatus: SyncStatus =
        existing.sync_status === "pending_create"
          ? "pending_create"
          : "pending_update";

      await db.runAsync(
        `UPDATE user_tags
         SET sort_order = ?, updated_at = ?, sync_status = ?
         WHERE local_id = ?;`,
        i,
        now,
        newSyncStatus,
        tagId,
      );
    }
  });
}
