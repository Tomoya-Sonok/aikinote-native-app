// training_dates テーブルの CRUD。出欠の有無を1日単位で UPSERT する。
// (user_id, training_date) で UNIQUE。

import { randomUUID } from "expo-crypto";
import type { SQLiteDatabase } from "expo-sqlite";
import type { TrainingDateRow } from "../schema";

/**
 * 指定月 (YYYY-MM) の出欠を返す。LIKE で前方一致。
 */
export async function listTrainingDatesInMonth(
  db: SQLiteDatabase,
  userId: string,
  yearMonth: string,
): Promise<TrainingDateRow[]> {
  return db.getAllAsync<TrainingDateRow>(
    `SELECT * FROM training_dates
     WHERE user_id = ?
       AND deleted_at IS NULL
       AND training_date LIKE ?
     ORDER BY training_date ASC;`,
    userId,
    `${yearMonth}-%`,
  );
}

export async function upsertTrainingDate(
  db: SQLiteDatabase,
  params: { userId: string; trainingDate: string; isAttended: boolean },
): Promise<TrainingDateRow> {
  const existing = await db.getFirstAsync<TrainingDateRow>(
    "SELECT * FROM training_dates WHERE user_id = ? AND training_date = ?;",
    params.userId,
    params.trainingDate,
  );

  const now = new Date().toISOString();

  if (existing) {
    // 既存があれば復活 or 値更新
    const newSyncStatus =
      existing.sync_status === "pending_create"
        ? "pending_create"
        : "pending_update";
    await db.runAsync(
      `UPDATE training_dates
       SET is_attended = ?, deleted_at = NULL, updated_at = ?, sync_status = ?
       WHERE local_id = ?;`,
      params.isAttended ? 1 : 0,
      now,
      newSyncStatus,
      existing.local_id,
    );
    const updated = await db.getFirstAsync<TrainingDateRow>(
      "SELECT * FROM training_dates WHERE local_id = ?;",
      existing.local_id,
    );
    if (!updated)
      throw new Error("[training-dates] upsert: row not found after update");
    return updated;
  }

  const localId = randomUUID();
  await db.runAsync(
    `INSERT INTO training_dates
       (local_id, server_id, user_id, training_date, is_attended,
        created_at, updated_at, deleted_at, sync_status)
     VALUES (?, NULL, ?, ?, ?, ?, ?, NULL, 'pending_create');`,
    localId,
    params.userId,
    params.trainingDate,
    params.isAttended ? 1 : 0,
    now,
    now,
  );

  const created = await db.getFirstAsync<TrainingDateRow>(
    "SELECT * FROM training_dates WHERE local_id = ?;",
    localId,
  );
  if (!created)
    throw new Error("[training-dates] upsert: row not found after insert");
  return created;
}

export async function softDeleteTrainingDate(
  db: SQLiteDatabase,
  userId: string,
  trainingDate: string,
): Promise<boolean> {
  const existing = await db.getFirstAsync<TrainingDateRow>(
    "SELECT * FROM training_dates WHERE user_id = ? AND training_date = ? AND deleted_at IS NULL;",
    userId,
    trainingDate,
  );
  if (!existing) return false;

  const now = new Date().toISOString();

  if (existing.sync_status === "pending_create") {
    await db.runAsync(
      "DELETE FROM training_dates WHERE local_id = ?;",
      existing.local_id,
    );
    return true;
  }

  await db.runAsync(
    `UPDATE training_dates
     SET deleted_at = ?, updated_at = ?, sync_status = 'pending_delete'
     WHERE local_id = ?;`,
    now,
    now,
    existing.local_id,
  );
  return true;
}
