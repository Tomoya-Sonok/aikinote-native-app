// 同期エンジン (PR4) 用のキーバリュー store。
// 想定キー: last_pull_at, initial_sync_done

import type { SQLiteDatabase } from "expo-sqlite";

export async function getMeta(
  db: SQLiteDatabase,
  key: string,
): Promise<string | null> {
  const row = await db.getFirstAsync<{ value: string | null }>(
    "SELECT value FROM sync_meta WHERE key = ?;",
    key,
  );
  return row?.value ?? null;
}

export async function setMeta(
  db: SQLiteDatabase,
  key: string,
  value: string | null,
): Promise<void> {
  await db.runAsync(
    `INSERT INTO sync_meta (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value;`,
    key,
    value,
  );
}
