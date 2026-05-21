// リモート添付ファイルのローカルダウンロードキュー (Pull → CloudFront/S3 → FS)。
//
// 役割:
//   1. pullAttachments が SQLite にメタ情報を upsert する
//      (download_status='pending')
//   2. 本モジュールが pending 行を順次 expo-file-system.downloadAsync で
//      ${documentDirectory}attachments/<localId>.<ext> に保存
//   3. 成功で download_status='downloaded' + local_uri を更新
//   4. 失敗で download_status='failed' + download_retry_count++
//      (次回 sync で再試行、MAX_DOWNLOAD_RETRY を超えたらスキップ)
//   5. 最後に合計キャッシュサイズが MAX_TOTAL_CACHE_BYTES を超えていれば
//      LRU で古いキャッシュを evict
//
// CloudFront URL は public 配信なので認証ヘッダ不要。
// 容量見積もり: 1 GB 上限。動画 300MB を 3〜4 本まで保持可能。
// 並列度 1 (順次)。同時実行ロックは isRunning フラグで担保。
//
// 利用状況:
//   - 画像: shapeAttachmentForWeb で local_uri を base64 → data URI 化して
//     Web 版に渡している (オフライン閲覧可)。
//   - 動画: 現状ローカルキャッシュしても Web 表示には未使用 (WebView は
//     https origin で file:// を読めないため)。将来の localhost HTTP サーバ
//     実装で活用予定。動画の容量負担が問題になれば、暫定的に動画ダウンロード
//     をスキップする最適化を別 PR で検討。

import * as FileSystem from "expo-file-system/legacy";
import type { SQLiteDatabase } from "expo-sqlite";
import { getDatabase } from "@/lib/db";
import {
  ATTACHMENTS_DIR,
  ensureAttachmentsDir,
  evictAttachment,
  getTotalDownloadedSize,
  listAttachmentsNeedingDownload,
  listLruEvictionCandidates,
  markDownloadFailed,
  markDownloadStarted,
  markDownloadSucceeded,
  pickExtension,
} from "@/lib/db/repositories/page-attachments";

const MAX_TOTAL_CACHE_BYTES = 1024 * 1024 * 1024; // 1 GB
const MAX_DOWNLOAD_RETRY = 5;

let isRunning = false;

/**
 * 待機中のリモート添付をすべて順次ダウンロードする。
 * 既に実行中なら no-op (Engine から多重キックされても安全)。
 */
export async function downloadPendingAttachments(): Promise<void> {
  if (isRunning) return;
  isRunning = true;
  try {
    const db = await getDatabase();
    const targets = await listAttachmentsNeedingDownload(db);
    if (targets.length === 0) return;

    await ensureAttachmentsDir();

    for (const att of targets) {
      if (!att.remote_url) continue;
      if (att.download_retry_count >= MAX_DOWNLOAD_RETRY) continue;

      await markDownloadStarted(db, att.local_id);
      try {
        const ext = pickExtension(att.mime_type, att.original_filename);
        const localPath = `${ATTACHMENTS_DIR}${att.local_id}.${ext}`;
        const { uri } = await FileSystem.downloadAsync(
          att.remote_url,
          localPath,
        );
        const info = await FileSystem.getInfoAsync(uri);
        const size =
          info.exists && "size" in info && typeof info.size === "number"
            ? info.size
            : att.file_size_bytes;
        await markDownloadSucceeded(db, att.local_id, uri, size);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await markDownloadFailed(db, att.local_id, message);
      }
    }

    await runLruEvictionIfNeeded(db);
  } finally {
    isRunning = false;
  }
}

/**
 * 合計キャッシュサイズが上限を超えていたら、LRU で古いものから削除する。
 * DB 行は残し local_uri と download_status だけ NULL/pending に戻すので、
 * 再アクセスで自動的に再ダウンロードされる。
 */
async function runLruEvictionIfNeeded(db: SQLiteDatabase): Promise<void> {
  const total = await getTotalDownloadedSize(db);
  if (total <= MAX_TOTAL_CACHE_BYTES) return;

  const overshoot = total - MAX_TOTAL_CACHE_BYTES;
  const candidates = await listLruEvictionCandidates(db, overshoot);
  for (const c of candidates) {
    await evictAttachment(db, c.local_id);
  }
}
