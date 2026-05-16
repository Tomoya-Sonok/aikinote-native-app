// Supabase → SQLite の Pull 処理。本 PR (PR4) ではスケルトンのみ。
// 実体は PR6 (初回フルプル) で実装する。
//
// Pull 順序 (依存関係):
//   1. user_categories
//   2. user_tags
//   3. training_pages
//   4. training_page_tags
//   5. training_dates
//   6. page_attachments (PR5 で別途)
//
// LWW: lib/sync/lww.ts の shouldOverwriteWithRemote を使う。
// soft delete: remote.deleted_at !== null ならローカルにも反映 + 物理削除はしない
// (Push 側で削除済み行が再生成されないよう、ローカル sync_status='synced' で保持)。

export interface PullContext {
  userId: string;
  /** 増分 Pull の起点。null なら全件 (full pull)。 */
  since?: string | null;
}

export async function pullAll(_ctx: PullContext): Promise<void> {
  // PR6 で実装。本 PR では何もせず正常終了。
  // engine.ts の runSync('full' | 'incremental') から呼ばれた場合、
  // ローカル DB は変化せず、その後の pushAll() がそのまま走る。
}
