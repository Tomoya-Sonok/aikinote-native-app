// page_attachments テーブルの CRUD + Native File System 連携。
//
// 画像・動画は Native FS の documentDirectory/attachments/<uuid>.<ext> に保存し、
// SQLite には local_uri (file://) を持つ。ただし WebView は https origin の
// Web 版を読み込んでおり、Web 側から file:// に直接アクセスできないため、
// Web 表示用 URL は lib/bridge/personal-handlers.ts の shapeAttachmentForWeb で
// 別途整形する (画像はその場で base64 → data URI 化、動画は CloudFront URL)。
//
// - ネイティブキャプチャ: ローカル保存 → lib/sync/attachments.ts が S3 にアップロード
// - リモート(Web版で添付済み): lib/sync/download.ts が CloudFront からダウンロード
//   して local_uri を埋める (画像のオフライン閲覧 + LRU 管理のため。
//   動画は現状ローカルキャッシュしても Web 表示には未使用、将来 localhost
//   サーバ実装で活用予定)

import { randomUUID } from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
import type { SQLiteDatabase } from "expo-sqlite";
import type { PageAttachmentRow } from "../schema";

export const ATTACHMENTS_DIR = `${FileSystem.documentDirectory}attachments/`;

export async function ensureAttachmentsDir(): Promise<void> {
  const info = await FileSystem.getInfoAsync(ATTACHMENTS_DIR);
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(ATTACHMENTS_DIR, {
      intermediates: true,
    });
  }
}

export interface CreateAttachmentFromBase64Input {
  pageLocalId: string;
  base64: string;
  mimeType: string;
  filename: string;
  sizeBytes: number;
  sortOrder?: number;
}

/**
 * base64 で受け取った画像を Native FS に書き出し、page_attachments に行を追加する。
 * 戻り値の local_uri を Web 側がそのまま <img src> にセットできる。
 */
export async function createImageAttachmentFromBase64(
  db: SQLiteDatabase,
  input: CreateAttachmentFromBase64Input,
): Promise<PageAttachmentRow> {
  await ensureAttachmentsDir();

  const localId = randomUUID();
  const ext = pickExtension(input.mimeType, input.filename);
  const localPath = `${ATTACHMENTS_DIR}${localId}.${ext}`;

  await FileSystem.writeAsStringAsync(localPath, input.base64, {
    encoding: FileSystem.EncodingType.Base64,
  });

  const now = new Date().toISOString();
  await db.runAsync(
    `INSERT INTO page_attachments
       (local_id, server_id, page_local_id, type, local_uri, remote_url,
        thumbnail_url, original_filename, file_size_bytes, mime_type,
        sort_order, upload_status, upload_retry_count, upload_error,
        created_at, updated_at, deleted_at, sync_status)
     VALUES (?, NULL, ?, 'image', ?, NULL,
             NULL, ?, ?, ?,
             ?, 'pending', 0, NULL,
             ?, ?, NULL, 'pending_create');`,
    localId,
    input.pageLocalId,
    localPath,
    input.filename,
    input.sizeBytes,
    input.mimeType,
    input.sortOrder ?? 0,
    now,
    now,
  );

  const row = await db.getFirstAsync<PageAttachmentRow>(
    "SELECT * FROM page_attachments WHERE local_id = ?;",
    localId,
  );
  if (!row)
    throw new Error("[page-attachments] create: row not found after insert");
  return row;
}

/**
 * 指定ページに紐付く添付ファイル一覧 (削除済みを除く)。
 */
export async function listAttachmentsForPage(
  db: SQLiteDatabase,
  pageLocalId: string,
): Promise<PageAttachmentRow[]> {
  return db.getAllAsync<PageAttachmentRow>(
    `SELECT * FROM page_attachments
     WHERE page_local_id = ? AND deleted_at IS NULL
     ORDER BY sort_order ASC, created_at ASC;`,
    pageLocalId,
  );
}

/**
 * Soft delete + ローカルファイル削除。
 * pending_create は物理削除、それ以外は soft delete (pending_delete) で同期側に委ねる。
 * downloaded 済みのキャッシュファイルは即時開放する (再アクセスで再ダウンロード)。
 */
export async function softDeleteAttachment(
  db: SQLiteDatabase,
  localId: string,
): Promise<boolean> {
  const existing = await db.getFirstAsync<PageAttachmentRow>(
    "SELECT * FROM page_attachments WHERE local_id = ?;",
    localId,
  );
  if (!existing || existing.deleted_at !== null) return false;

  const now = new Date().toISOString();

  // pending_create のものは server に届いていないので物理削除 + FS 削除
  if (existing.sync_status === "pending_create") {
    if (existing.local_uri) {
      await deleteLocalFile(existing.local_uri);
    }
    await db.runAsync(
      "DELETE FROM page_attachments WHERE local_id = ?;",
      localId,
    );
    return true;
  }

  // リモート由来でキャッシュ済みのファイルは soft delete と同時に物理削除して容量開放
  // (S3 側の削除は同期で別途処理されるか、リモート側で既に消えている場合がある)
  if (existing.download_status === "downloaded" && existing.local_uri) {
    await deleteLocalFile(existing.local_uri);
  }

  await db.runAsync(
    `UPDATE page_attachments
     SET deleted_at = ?, updated_at = ?, sync_status = 'pending_delete'
     WHERE local_id = ?;`,
    now,
    now,
    localId,
  );
  return true;
}

/**
 * S3 アップロード待ちの行 (upload_status='pending' or 'failed') を返す。
 */
export async function listPendingUpload(
  db: SQLiteDatabase,
): Promise<PageAttachmentRow[]> {
  return db.getAllAsync<PageAttachmentRow>(
    `SELECT * FROM page_attachments
     WHERE upload_status IN ('pending', 'failed')
       AND deleted_at IS NULL
       AND local_uri IS NOT NULL
     ORDER BY created_at ASC;`,
  );
}

export async function markUploadSucceeded(
  db: SQLiteDatabase,
  localId: string,
  remoteUrl: string,
): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE page_attachments
     SET upload_status = 'uploaded', remote_url = ?, upload_error = NULL,
         updated_at = ?
     WHERE local_id = ?;`,
    remoteUrl,
    now,
    localId,
  );
}

export async function markUploadFailed(
  db: SQLiteDatabase,
  localId: string,
  message: string,
): Promise<void> {
  await db.runAsync(
    `UPDATE page_attachments
     SET upload_status = 'failed',
         upload_retry_count = upload_retry_count + 1,
         upload_error = ?
     WHERE local_id = ?;`,
    message,
    localId,
  );
}

async function deleteLocalFile(uri: string): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists) {
      await FileSystem.deleteAsync(uri, { idempotent: true });
    }
  } catch (error) {
    console.warn("[page-attachments] FS delete failed:", error);
  }
}

export function pickExtension(
  mimeType: string | null,
  filename?: string | null,
): string {
  // mimeType を優先、無ければファイル名末尾、それも無ければ bin
  if (mimeType) {
    if (mimeType === "image/jpeg" || mimeType === "image/jpg") return "jpg";
    if (mimeType === "image/png") return "png";
    if (mimeType === "image/webp") return "webp";
    if (mimeType === "video/mp4") return "mp4";
    if (mimeType === "video/quicktime") return "mov";
    if (mimeType === "video/webm") return "webm";
  }
  if (filename) {
    const dotIdx = filename.lastIndexOf(".");
    if (dotIdx >= 0) {
      const ext = filename.slice(dotIdx + 1).toLowerCase();
      if (/^[a-z0-9]{1,5}$/.test(ext)) return ext;
    }
  }
  return "bin";
}

// ============================================================
// migration 002: リモート由来添付ファイルのダウンロード管理 / LRU
// ============================================================

export interface RemoteAttachmentUpsertInput {
  serverId: string;
  pageLocalId: string;
  type: "image" | "video" | "youtube";
  remoteUrl: string;
  thumbnailUrl: string | null;
  originalFilename: string | null;
  fileSizeBytes: number | null;
  mimeType: string | null;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Pull で取得したリモート添付を SQLite に upsert する。
 * - 新規行は upload_status='uploaded' / sync_status='synced' で挿入
 * - YouTube タイプはダウンロード対象外 (download_status は NULL のまま)
 * - 画像/動画は download_status='pending' をセット (既に 'downloaded' なら維持)
 * 戻り値: upsert された行の local_id
 */
export async function upsertAttachmentFromRemote(
  db: SQLiteDatabase,
  input: RemoteAttachmentUpsertInput,
): Promise<string> {
  const existing = await db.getFirstAsync<PageAttachmentRow>(
    "SELECT * FROM page_attachments WHERE server_id = ?;",
    input.serverId,
  );

  if (existing) {
    // 既存行: メタ情報を更新 (local_uri / download_status はキャッシュ状態に応じて保護)
    const shouldKeepDownloaded =
      existing.download_status === "downloaded" && existing.local_uri !== null;
    const newDownloadStatus =
      input.type === "youtube"
        ? null
        : shouldKeepDownloaded
          ? existing.download_status
          : "pending";
    await db.runAsync(
      `UPDATE page_attachments
       SET page_local_id = ?, type = ?, remote_url = ?, thumbnail_url = ?,
           original_filename = ?, file_size_bytes = ?, mime_type = ?,
           sort_order = ?, upload_status = 'uploaded', upload_error = NULL,
           download_status = ?, updated_at = ?, sync_status = 'synced'
       WHERE local_id = ?;`,
      input.pageLocalId,
      input.type,
      input.remoteUrl,
      input.thumbnailUrl,
      input.originalFilename,
      input.fileSizeBytes,
      input.mimeType,
      input.sortOrder,
      newDownloadStatus,
      input.updatedAt,
      existing.local_id,
    );
    return existing.local_id;
  }

  const localId = randomUUID();
  const downloadStatus = input.type === "youtube" ? null : "pending";
  await db.runAsync(
    `INSERT INTO page_attachments
       (local_id, server_id, page_local_id, type, local_uri, remote_url,
        thumbnail_url, original_filename, file_size_bytes, mime_type,
        sort_order, upload_status, upload_retry_count, upload_error,
        download_status, download_retry_count, download_error, last_accessed_at,
        created_at, updated_at, deleted_at, sync_status)
     VALUES (?, ?, ?, ?, NULL, ?,
             ?, ?, ?, ?,
             ?, 'uploaded', 0, NULL,
             ?, 0, NULL, NULL,
             ?, ?, NULL, 'synced');`,
    localId,
    input.serverId,
    input.pageLocalId,
    input.type,
    input.remoteUrl,
    input.thumbnailUrl,
    input.originalFilename,
    input.fileSizeBytes,
    input.mimeType,
    input.sortOrder,
    downloadStatus,
    input.createdAt,
    input.updatedAt,
  );
  return localId;
}

/**
 * ダウンロードを試みるべき添付一覧。
 * - リモート URL があり、まだローカルキャッシュが無い (or 失敗) もの
 * - YouTube タイプは含まない (download_status NULL でフィルタ)
 */
export async function listAttachmentsNeedingDownload(
  db: SQLiteDatabase,
): Promise<PageAttachmentRow[]> {
  return db.getAllAsync<PageAttachmentRow>(
    `SELECT * FROM page_attachments
     WHERE deleted_at IS NULL
       AND remote_url IS NOT NULL
       AND type IN ('image', 'video')
       AND (download_status IN ('pending', 'failed')
            OR (download_status IS NULL AND local_uri IS NULL))
     ORDER BY created_at DESC;`,
  );
}

export async function markDownloadStarted(
  db: SQLiteDatabase,
  localId: string,
): Promise<void> {
  await db.runAsync(
    `UPDATE page_attachments
     SET download_status = 'downloading', download_error = NULL
     WHERE local_id = ?;`,
    localId,
  );
}

export async function markDownloadSucceeded(
  db: SQLiteDatabase,
  localId: string,
  localUri: string,
  fileSizeBytes: number | null,
): Promise<void> {
  const now = new Date().toISOString();
  await db.runAsync(
    `UPDATE page_attachments
     SET local_uri = ?, file_size_bytes = COALESCE(?, file_size_bytes),
         download_status = 'downloaded', download_error = NULL,
         download_retry_count = 0, last_accessed_at = ?
     WHERE local_id = ?;`,
    localUri,
    fileSizeBytes,
    now,
    localId,
  );
}

export async function markDownloadFailed(
  db: SQLiteDatabase,
  localId: string,
  message: string,
): Promise<void> {
  await db.runAsync(
    `UPDATE page_attachments
     SET download_status = 'failed',
         download_retry_count = download_retry_count + 1,
         download_error = ?
     WHERE local_id = ?;`,
    message,
    localId,
  );
}

/**
 * 読み出し時に last_accessed_at を更新する (LRU 用)。
 * 高頻度に呼ばれるので失敗時は無視。
 */
export async function touchAccessed(
  db: SQLiteDatabase,
  localId: string,
): Promise<void> {
  try {
    await db.runAsync(
      "UPDATE page_attachments SET last_accessed_at = ? WHERE local_id = ?;",
      new Date().toISOString(),
      localId,
    );
  } catch (error) {
    console.warn("[page-attachments] touchAccessed failed:", error);
  }
}

/**
 * ダウンロード済みファイルの合計サイズ (バイト)。LRU 判定に使う。
 */
export async function getTotalDownloadedSize(
  db: SQLiteDatabase,
): Promise<number> {
  const row = await db.getFirstAsync<{ total: number | null }>(
    `SELECT COALESCE(SUM(file_size_bytes), 0) AS total
     FROM page_attachments
     WHERE download_status = 'downloaded' AND local_uri IS NOT NULL;`,
  );
  return row?.total ?? 0;
}

/**
 * LRU で削除すべき候補を last_accessed_at 昇順で取得。
 * neededBytes 分のサイズが集まるまで返す。
 */
export async function listLruEvictionCandidates(
  db: SQLiteDatabase,
  neededBytes: number,
): Promise<PageAttachmentRow[]> {
  const all = await db.getAllAsync<PageAttachmentRow>(
    `SELECT * FROM page_attachments
     WHERE download_status = 'downloaded' AND local_uri IS NOT NULL
       AND deleted_at IS NULL
     ORDER BY COALESCE(last_accessed_at, created_at) ASC;`,
  );
  const result: PageAttachmentRow[] = [];
  let accumulated = 0;
  for (const row of all) {
    if (accumulated >= neededBytes) break;
    result.push(row);
    accumulated += row.file_size_bytes ?? 0;
  }
  return result;
}

/**
 * 1 件をローカルキャッシュから削除する (DB 上は残し、再アクセスで再ダウンロード)。
 */
export async function evictAttachment(
  db: SQLiteDatabase,
  localId: string,
): Promise<void> {
  const existing = await db.getFirstAsync<PageAttachmentRow>(
    "SELECT local_uri FROM page_attachments WHERE local_id = ?;",
    localId,
  );
  if (existing?.local_uri) {
    await deleteLocalFile(existing.local_uri);
  }
  await db.runAsync(
    `UPDATE page_attachments
     SET local_uri = NULL, download_status = 'pending'
     WHERE local_id = ?;`,
    localId,
  );
}
