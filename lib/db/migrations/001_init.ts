// SQLite 初期スキーマ。本ファイルは plan で定義した「ひとりで」用テーブル群を
// 一発で作成する。全テーブルに sync 用カラム (local_id / server_id /
// sync_status / updated_at / deleted_at) を統一導入。
//
// マイグレーション管理: migrations.ts の runMigrations が PRAGMA user_version
// と本配列のインデックスを照らし合わせて未適用分を順に exec する。

export const MIGRATION_001_INIT = `
PRAGMA journal_mode = WAL;
PRAGMA synchronous = NORMAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS training_pages (
  local_id TEXT PRIMARY KEY NOT NULL,
  server_id TEXT UNIQUE,
  user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  is_public INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'pending_create',
  last_synced_at TEXT,
  sync_error TEXT
);
CREATE INDEX IF NOT EXISTS idx_pages_user_updated
  ON training_pages(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_pages_sync
  ON training_pages(sync_status)
  WHERE sync_status != 'synced';

CREATE TABLE IF NOT EXISTS user_tags (
  local_id TEXT PRIMARY KEY NOT NULL,
  server_id TEXT UNIQUE,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'pending_create'
);
CREATE INDEX IF NOT EXISTS idx_tags_user_category
  ON user_tags(user_id, category, sort_order);

CREATE TABLE IF NOT EXISTS user_categories (
  local_id TEXT PRIMARY KEY NOT NULL,
  server_id TEXT UNIQUE,
  user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_default INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'synced'
);
CREATE INDEX IF NOT EXISTS idx_categories_user
  ON user_categories(user_id, sort_order);

CREATE TABLE IF NOT EXISTS training_page_tags (
  local_id TEXT PRIMARY KEY NOT NULL,
  server_id TEXT UNIQUE,
  page_local_id TEXT NOT NULL REFERENCES training_pages(local_id) ON DELETE CASCADE,
  tag_local_id TEXT NOT NULL REFERENCES user_tags(local_id) ON DELETE CASCADE,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'pending_create',
  UNIQUE(page_local_id, tag_local_id)
);
CREATE INDEX IF NOT EXISTS idx_page_tags_page
  ON training_page_tags(page_local_id);

CREATE TABLE IF NOT EXISTS page_attachments (
  local_id TEXT PRIMARY KEY NOT NULL,
  server_id TEXT UNIQUE,
  page_local_id TEXT NOT NULL REFERENCES training_pages(local_id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  local_uri TEXT,
  remote_url TEXT,
  thumbnail_url TEXT,
  original_filename TEXT,
  file_size_bytes INTEGER,
  mime_type TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  upload_status TEXT NOT NULL DEFAULT 'pending',
  upload_retry_count INTEGER NOT NULL DEFAULT 0,
  upload_error TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'pending_create'
);
CREATE INDEX IF NOT EXISTS idx_attach_page
  ON page_attachments(page_local_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_attach_upload
  ON page_attachments(upload_status)
  WHERE upload_status != 'uploaded';

CREATE TABLE IF NOT EXISTS training_dates (
  local_id TEXT PRIMARY KEY NOT NULL,
  server_id TEXT UNIQUE,
  user_id TEXT NOT NULL,
  training_date TEXT NOT NULL,
  is_attended INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  sync_status TEXT NOT NULL DEFAULT 'pending_create',
  UNIQUE(user_id, training_date)
);
CREATE INDEX IF NOT EXISTS idx_dates_user
  ON training_dates(user_id, training_date);

CREATE TABLE IF NOT EXISTS sync_meta (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT
);
`;
