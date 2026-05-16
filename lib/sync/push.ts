// SQLite → Supabase の Push 処理。
//
// sync_status != 'synced' の行を依存順 (categories → tags → pages → page_tags →
// training_dates) で Supabase にアップサート / 削除する。
//
// 設計メモ:
//   - server_id がまだ無い行 (pending_create) は local_id を Supabase の id として
//     送る (Supabase 側カラムは UUID なので構造的に等価)
//   - リトライは「次回 sync」に委ね、本関数内では指数バックオフをしない
//     (Engine が NetInfo 復帰 / 定期実行で再キックするため)
//   - 個別行の失敗は console.warn のみ、ループは継続して他の行を進める

import type { SQLiteDatabase } from "expo-sqlite";
import { getDatabase } from "@/lib/db";
import type {
  TrainingDateRow,
  TrainingPageRow,
  TrainingPageTagRow,
  UserCategoryRow,
  UserTagRow,
} from "@/lib/db/schema";
import { supabase } from "@/lib/supabase";
import { markRowSyncError, markRowSynced, purgeRow } from "./queue";

export interface PushContext {
  userId: string;
}

/**
 * 全テーブルを依存順で Push する。
 */
export async function pushAll(ctx: PushContext): Promise<void> {
  const db = await getDatabase();
  await pushCategories(db, ctx);
  await pushTags(db, ctx);
  await pushPages(db, ctx);
  await pushPageTags(db);
  await pushTrainingDates(db, ctx);
}

// ============================== Categories ==============================

async function pushCategories(
  db: SQLiteDatabase,
  _ctx: PushContext,
): Promise<void> {
  const rows = await db.getAllAsync<UserCategoryRow>(
    "SELECT * FROM user_categories WHERE sync_status != 'synced';",
  );

  for (const row of rows) {
    try {
      if (row.sync_status === "pending_delete") {
        if (row.server_id) {
          const { error } = await supabase
            .from("UserCategory")
            .delete()
            .eq("id", row.server_id);
          if (error) throw error;
        }
        await purgeRow(db, "user_categories", row.local_id);
        continue;
      }

      const supabasePayload = {
        id: row.server_id ?? row.local_id,
        user_id: row.user_id,
        name: row.name,
        slug: row.slug,
        sort_order: row.sort_order,
        is_default: row.is_default === 1,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
      const { data, error } = await supabase
        .from("UserCategory")
        .upsert(supabasePayload, { onConflict: "id" })
        .select("id")
        .single();
      if (error) throw error;
      await markRowSynced(db, "user_categories", row.local_id, data.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await markRowSyncError(db, "user_categories", row.local_id, message);
    }
  }
}

// ============================== Tags ==============================

async function pushTags(db: SQLiteDatabase, _ctx: PushContext): Promise<void> {
  const rows = await db.getAllAsync<UserTagRow>(
    "SELECT * FROM user_tags WHERE sync_status != 'synced';",
  );

  for (const row of rows) {
    try {
      if (row.sync_status === "pending_delete") {
        if (row.server_id) {
          const { error } = await supabase
            .from("UserTag")
            .delete()
            .eq("id", row.server_id);
          if (error) throw error;
        }
        await purgeRow(db, "user_tags", row.local_id);
        continue;
      }

      const supabasePayload = {
        id: row.server_id ?? row.local_id,
        user_id: row.user_id,
        name: row.name,
        category: row.category,
        sort_order: row.sort_order,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
      const { data, error } = await supabase
        .from("UserTag")
        .upsert(supabasePayload, { onConflict: "id" })
        .select("id")
        .single();
      if (error) throw error;
      await markRowSynced(db, "user_tags", row.local_id, data.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await markRowSyncError(db, "user_tags", row.local_id, message);
    }
  }
}

// ============================== Pages ==============================

async function pushPages(db: SQLiteDatabase, _ctx: PushContext): Promise<void> {
  const rows = await db.getAllAsync<TrainingPageRow>(
    "SELECT * FROM training_pages WHERE sync_status != 'synced';",
  );

  for (const row of rows) {
    try {
      if (row.sync_status === "pending_delete") {
        if (row.server_id) {
          const { error } = await supabase
            .from("TrainingPage")
            .delete()
            .eq("id", row.server_id);
          if (error) throw error;
        }
        await purgeRow(db, "training_pages", row.local_id);
        continue;
      }

      const supabasePayload = {
        id: row.server_id ?? row.local_id,
        user_id: row.user_id,
        title: row.title,
        content: row.content,
        is_public: row.is_public === 1,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
      const { data, error } = await supabase
        .from("TrainingPage")
        .upsert(supabasePayload, { onConflict: "id" })
        .select("id")
        .single();
      if (error) throw error;
      await markRowSynced(db, "training_pages", row.local_id, data.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await markRowSyncError(db, "training_pages", row.local_id, message);
    }
  }
}

// ============================== PageTags ==============================

async function pushPageTags(db: SQLiteDatabase): Promise<void> {
  // page_local_id と tag_local_id を server_id に解決して送る必要があるため
  // JOIN で training_pages / user_tags を引きつつ pending 行を取り出す
  const rows = await db.getAllAsync<
    TrainingPageTagRow & {
      page_server_id: string | null;
      tag_server_id: string | null;
    }
  >(
    `SELECT pt.*,
            p.server_id AS page_server_id,
            t.server_id AS tag_server_id
     FROM training_page_tags pt
     JOIN training_pages p ON p.local_id = pt.page_local_id
     JOIN user_tags t ON t.local_id = pt.tag_local_id
     WHERE pt.sync_status != 'synced';`,
  );

  for (const row of rows) {
    try {
      if (row.sync_status === "pending_delete") {
        if (row.server_id) {
          const { error } = await supabase
            .from("TrainingPageTag")
            .delete()
            .eq("id", row.server_id);
          if (error) throw error;
        }
        await purgeRow(db, "training_page_tags", row.local_id);
        continue;
      }

      // page / tag どちらかが未同期だと server_id 解決できない → 次回まで保留
      if (!row.page_server_id || !row.tag_server_id) {
        continue;
      }

      const supabasePayload = {
        id: row.server_id ?? row.local_id,
        training_page_id: row.page_server_id,
        user_tag_id: row.tag_server_id,
      };
      const { data, error } = await supabase
        .from("TrainingPageTag")
        .upsert(supabasePayload, { onConflict: "id" })
        .select("id")
        .single();
      if (error) throw error;
      await markRowSynced(db, "training_page_tags", row.local_id, data.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await markRowSyncError(db, "training_page_tags", row.local_id, message);
    }
  }
}

// ============================== TrainingDates ==============================

async function pushTrainingDates(
  db: SQLiteDatabase,
  _ctx: PushContext,
): Promise<void> {
  const rows = await db.getAllAsync<TrainingDateRow>(
    "SELECT * FROM training_dates WHERE sync_status != 'synced';",
  );

  for (const row of rows) {
    try {
      if (row.sync_status === "pending_delete") {
        if (row.server_id) {
          const { error } = await supabase
            .from("TrainingDate")
            .delete()
            .eq("id", row.server_id);
          if (error) throw error;
        }
        await purgeRow(db, "training_dates", row.local_id);
        continue;
      }

      const supabasePayload = {
        id: row.server_id ?? row.local_id,
        user_id: row.user_id,
        training_date: row.training_date,
        is_attended: row.is_attended === 1,
        created_at: row.created_at,
        updated_at: row.updated_at,
      };
      const { data, error } = await supabase
        .from("TrainingDate")
        .upsert(supabasePayload, { onConflict: "id" })
        .select("id")
        .single();
      if (error) throw error;
      await markRowSynced(db, "training_dates", row.local_id, data.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await markRowSyncError(db, "training_dates", row.local_id, message);
    }
  }
}
