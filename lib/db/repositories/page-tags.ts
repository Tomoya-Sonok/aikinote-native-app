// training_page_tags 中間テーブルの CRUD。ページ ↔ タグの紐付け管理。
//
// 使い方:
//   - createPage 直後 / updatePage 時に replacePageTags() を呼んで紐付けを再構築

import { randomUUID } from "expo-crypto";
import type { SQLiteDatabase } from "expo-sqlite";
import type { UserTagRow } from "../schema";

interface TrainingPageTagRow {
  local_id: string;
  server_id: string | null;
  page_local_id: string;
  tag_local_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  sync_status:
    | "synced"
    | "pending_create"
    | "pending_update"
    | "pending_delete";
}

/**
 * ページに紐付くタグ詳細を返す。JOIN で user_tags の詳細を引く。
 */
export async function listTagsForPage(
  db: SQLiteDatabase,
  pageLocalId: string,
): Promise<UserTagRow[]> {
  return db.getAllAsync<UserTagRow>(
    `SELECT t.*
     FROM user_tags t
     INNER JOIN training_page_tags pt ON pt.tag_local_id = t.local_id
     WHERE pt.page_local_id = ?
       AND pt.deleted_at IS NULL
       AND t.deleted_at IS NULL
     ORDER BY t.category ASC, t.sort_order ASC;`,
    pageLocalId,
  );
}

/**
 * ページのタグ紐付けを一括差し替え。
 * 既存の link を soft delete (sync 用) し、新しいセットを INSERT する。
 * 既に pending_create のリンクは物理削除する (server に届いていないため)。
 */
export async function replacePageTags(
  db: SQLiteDatabase,
  pageLocalId: string,
  tagLocalIds: string[],
): Promise<void> {
  const now = new Date().toISOString();
  const desired = new Set(tagLocalIds);

  await db.withTransactionAsync(async () => {
    const existing = await db.getAllAsync<TrainingPageTagRow>(
      `SELECT * FROM training_page_tags
       WHERE page_local_id = ? AND deleted_at IS NULL;`,
      pageLocalId,
    );

    const existingTagIds = new Set(existing.map((r) => r.tag_local_id));

    // 削除すべきもの
    for (const row of existing) {
      if (desired.has(row.tag_local_id)) continue;

      if (row.sync_status === "pending_create") {
        await db.runAsync(
          "DELETE FROM training_page_tags WHERE local_id = ?;",
          row.local_id,
        );
      } else {
        await db.runAsync(
          `UPDATE training_page_tags
           SET deleted_at = ?, updated_at = ?, sync_status = 'pending_delete'
           WHERE local_id = ?;`,
          now,
          now,
          row.local_id,
        );
      }
    }

    // 追加すべきもの
    for (const tagLocalId of tagLocalIds) {
      if (existingTagIds.has(tagLocalId)) continue;

      const localId = randomUUID();
      await db.runAsync(
        `INSERT INTO training_page_tags
           (local_id, server_id, page_local_id, tag_local_id,
            created_at, updated_at, deleted_at, sync_status)
         VALUES (?, NULL, ?, ?, ?, ?, NULL, 'pending_create');`,
        localId,
        pageLocalId,
        tagLocalId,
        now,
        now,
      );
    }
  });
}
