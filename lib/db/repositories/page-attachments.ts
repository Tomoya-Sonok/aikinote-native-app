// page_attachments テーブルの CRUD + Native File System 連携。
//
// 画像はオフラインで Native FS の documentDirectory/attachments/<uuid>.<ext>
// に保存し、SQLite には local_uri (file://) を持つ。ネット接続時に
// lib/sync/attachments.ts が S3 にアップロードして remote_url を埋める。
// 動画はオフライン対象外 (Web 側で accept から除外済み)。

import { randomUUID } from "expo-crypto";
import * as FileSystem from "expo-file-system/legacy";
import type { SQLiteDatabase } from "expo-sqlite";
import type { PageAttachmentRow } from "../schema";

const ATTACHMENTS_DIR = `${FileSystem.documentDirectory}attachments/`;

async function ensureAttachmentsDir(): Promise<void> {
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
 * remote_url がある (S3 にアップ済み) ならファイルは保持し、sync で S3 削除を担当する。
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

function pickExtension(mimeType: string, filename: string): string {
  // mimeType を優先、無ければファイル名末尾を使う
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") return "jpg";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/webp") return "webp";
  const dotIdx = filename.lastIndexOf(".");
  if (dotIdx >= 0) {
    const ext = filename.slice(dotIdx + 1).toLowerCase();
    if (/^[a-z0-9]{1,5}$/.test(ext)) return ext;
  }
  return "bin";
}
