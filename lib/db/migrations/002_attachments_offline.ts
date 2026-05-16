// page_attachments テーブルにオフライン閲覧用のメタカラムを追加する。
//
// 背景:
//   Phase 5-b 拡張。リモート(Supabase/CloudFront)から添付ファイル本体を
//   端末ローカルにダウンロードしてキャッシュする機構を導入するため、
//   ダウンロード状態と LRU 用の最終アクセス日時カラムを追加する。
//
// 追加カラム:
//   - download_status         : NULL | 'pending' | 'downloading' | 'downloaded' | 'failed'
//                              (NULL はローカルキャプチャ由来 = upload_status='pending' で
//                              ダウンロード対象でない行を想定。リモート由来は 'pending' で
//                              upsert され、downloadPendingAttachments で 'downloaded' に
//                              遷移する)
//   - download_retry_count    : 失敗時のリトライ回数。一定回数超で失敗扱い
//   - download_error          : 直近のエラーメッセージ
//   - last_accessed_at        : ISO 8601。読み出し時に更新し LRU 削除の判定に使う
//
// SQLite は ALTER TABLE ADD COLUMN IF NOT EXISTS をサポートしないため、
// version 管理（PRAGMA user_version）に依存して冪等性を確保する。

export const MIGRATION_002_ATTACHMENTS_OFFLINE = `
ALTER TABLE page_attachments ADD COLUMN download_status TEXT;
ALTER TABLE page_attachments ADD COLUMN download_retry_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE page_attachments ADD COLUMN download_error TEXT;
ALTER TABLE page_attachments ADD COLUMN last_accessed_at TEXT;

CREATE INDEX IF NOT EXISTS idx_attach_download_status
  ON page_attachments(download_status)
  WHERE download_status IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_attach_last_accessed
  ON page_attachments(last_accessed_at);
`;
