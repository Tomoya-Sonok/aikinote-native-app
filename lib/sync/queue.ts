// sync_status による pending 行管理ヘルパ。
// Push 成功時 / 失敗時の状態遷移をすべて本ファイルに集約する。

import type { SQLiteDatabase } from "expo-sqlite";

export const SYNCABLE_TABLES = [
  "user_categories",
  "user_tags",
  "training_pages",
  "training_page_tags",
  "training_dates",
] as const;
export type SyncTable = (typeof SYNCABLE_TABLES)[number];

/**
 * Push 成功時: synced に遷移し、server_id を埋める。
 */
export async function markRowSynced(
  db: SQLiteDatabase,
  table: SyncTable,
  localId: string,
  serverId: string,
): Promise<void> {
  const now = new Date().toISOString();
  // training_pages は last_synced_at / sync_error カラムを持つので分岐
  if (table === "training_pages") {
    await db.runAsync(
      `UPDATE ${table} SET sync_status = 'synced', server_id = ?, last_synced_at = ?, sync_error = NULL WHERE local_id = ?;`,
      serverId,
      now,
      localId,
    );
    return;
  }
  await db.runAsync(
    `UPDATE ${table} SET sync_status = 'synced', server_id = ? WHERE local_id = ?;`,
    serverId,
    localId,
  );
}

/**
 * pending_delete の Push 成功後: 物理削除して領域回収。
 * pending_create も Push 直後に server_id が決まればこの関数で削除はせず markRowSynced を使う。
 */
export async function purgeRow(
  db: SQLiteDatabase,
  table: SyncTable,
  localId: string,
): Promise<void> {
  await db.runAsync(`DELETE FROM ${table} WHERE local_id = ?;`, localId);
}

/**
 * Push 失敗時: training_pages のみ sync_error カラムに保存。
 * 他テーブルは現状エラーカラム無しなので console.warn でログのみ。
 */
export async function markRowSyncError(
  db: SQLiteDatabase,
  table: SyncTable,
  localId: string,
  message: string,
): Promise<void> {
  if (table === "training_pages") {
    await db.runAsync(
      `UPDATE training_pages SET sync_error = ? WHERE local_id = ?;`,
      message,
      localId,
    );
    return;
  }
  console.warn(`[sync.queue] ${table}/${localId} push failed: ${message}`);
}

/**
 * 全テーブルの pending 件数を返す (進捗バナー用)。
 */
export async function countPending(db: SQLiteDatabase): Promise<number> {
  let total = 0;
  for (const table of SYNCABLE_TABLES) {
    const row = await db.getFirstAsync<{ c: number }>(
      `SELECT COUNT(*) AS c FROM ${table} WHERE sync_status != 'synced';`,
    );
    total += row?.c ?? 0;
  }
  return total;
}
