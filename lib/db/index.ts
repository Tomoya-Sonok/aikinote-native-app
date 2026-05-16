// SQLite データベース接続のシングルトン管理。
// アプリ起動時に getDatabase() を一度呼んで初期化、以降の repository は
// 同じインスタンスを使い回す。expo-sqlite は内部で接続プールを持つため
// シングルトンで問題ない。

import type { SQLiteDatabase } from "expo-sqlite";
import * as SQLite from "expo-sqlite";
import { runMigrations } from "./migrations";

const DB_NAME = "aikinote_personal.db";

let dbInstance: SQLiteDatabase | null = null;
let initPromise: Promise<SQLiteDatabase> | null = null;

/**
 * SQLite データベースを取得する。初回呼び出し時は openDatabaseAsync +
 * マイグレーションを実行し、その Promise を共有する (並行呼び出し対策)。
 */
export function getDatabase(): Promise<SQLiteDatabase> {
  if (dbInstance) return Promise.resolve(dbInstance);
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const db = await SQLite.openDatabaseAsync(DB_NAME);
    await runMigrations(db);
    dbInstance = db;
    return db;
  })().catch((error) => {
    initPromise = null;
    throw error;
  });

  return initPromise;
}

/**
 * テスト用: 接続をクローズしてシングルトンをリセットする。
 * 本番コードからは呼ばないこと。
 */
export async function _resetDatabaseForTest(): Promise<void> {
  if (dbInstance) {
    await dbInstance.closeAsync();
    dbInstance = null;
  }
  initPromise = null;
}

export { DB_NAME };
