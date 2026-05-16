// SQLite マイグレーション管理。PRAGMA user_version を current のスキーマ
// バージョンとして扱い、配列に対する未適用分を順に exec する。
//
// マイグレーションを追加するとき:
//   1. lib/db/migrations/00X_<name>.ts に SQL を書く
//   2. 下記 MIGRATIONS 配列の末尾に追加する
//   3. ALTER TABLE で破壊的変更をするときは別途データ移行ロジックも追加

import type { SQLiteDatabase } from "expo-sqlite";
import { MIGRATION_001_INIT } from "./migrations/001_init";

const MIGRATIONS: ReadonlyArray<{ version: number; sql: string }> = [
  { version: 1, sql: MIGRATION_001_INIT },
];

/**
 * 未適用のマイグレーションを順に実行する。
 * 既に最新まで適用済みなら何もしない。
 */
export async function runMigrations(db: SQLiteDatabase): Promise<void> {
  const currentVersion = await getCurrentVersion(db);

  for (const migration of MIGRATIONS) {
    if (migration.version <= currentVersion) continue;

    try {
      await db.execAsync(migration.sql);
      await db.execAsync(`PRAGMA user_version = ${migration.version};`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`[db] Migration ${migration.version} failed: ${message}`);
    }
  }
}

async function getCurrentVersion(db: SQLiteDatabase): Promise<number> {
  const row = await db.getFirstAsync<{ user_version: number }>(
    "PRAGMA user_version;",
  );
  return row?.user_version ?? 0;
}
