// SQLite テーブルの行型定義。
// 仕様: docs/webview-bridge-protocol.md と plan ファイルの SQLite スキーマ設計。
//
// 命名規則:
//   - 全テーブルに local_id (UUID) と server_id (Supabase 側 UUID、未同期時 null) を持つ
//   - LWW のため updated_at はミリ秒精度 ISO 8601 (例 "2026-05-15T10:30:45.123Z")
//   - 削除は必ず soft delete (deleted_at + sync_status="pending_delete")
//   - sync_status は同期エンジン (PR4) が更新する

export type SyncStatus =
  | "synced"
  | "pending_create"
  | "pending_update"
  | "pending_delete";

export type UploadStatus = "pending" | "uploading" | "uploaded" | "failed";

export type DownloadStatus =
  | "pending"
  | "downloading"
  | "downloaded"
  | "failed";

export interface TrainingPageRow {
  local_id: string;
  server_id: string | null;
  user_id: string;
  title: string;
  content: string;
  is_public: 0 | 1;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  sync_status: SyncStatus;
  last_synced_at: string | null;
  sync_error: string | null;
}

export interface UserTagRow {
  local_id: string;
  server_id: string | null;
  user_id: string;
  name: string;
  category: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  sync_status: SyncStatus;
}

export interface UserCategoryRow {
  local_id: string;
  server_id: string | null;
  user_id: string;
  name: string;
  slug: string;
  sort_order: number;
  is_default: 0 | 1;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  sync_status: SyncStatus;
}

export interface TrainingPageTagRow {
  local_id: string;
  server_id: string | null;
  page_local_id: string;
  tag_local_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  sync_status: SyncStatus;
}

export interface PageAttachmentRow {
  local_id: string;
  server_id: string | null;
  page_local_id: string;
  type: "image" | "video" | "youtube";
  local_uri: string | null;
  remote_url: string | null;
  thumbnail_url: string | null;
  original_filename: string | null;
  file_size_bytes: number | null;
  mime_type: string | null;
  sort_order: number;
  upload_status: UploadStatus;
  upload_retry_count: number;
  upload_error: string | null;
  // migration 002: リモート由来ファイル本体のローカルダウンロード管理
  download_status: DownloadStatus | null;
  download_retry_count: number;
  download_error: string | null;
  last_accessed_at: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  sync_status: SyncStatus;
}

export interface TrainingDateRow {
  local_id: string;
  server_id: string | null;
  user_id: string;
  training_date: string; // "YYYY-MM-DD"
  is_attended: 0 | 1;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  sync_status: SyncStatus;
}

export interface SyncMetaRow {
  key: string;
  value: string;
}
