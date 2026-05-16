// 画像添付ファイルの S3 アップロードキュー。
//
// フロー:
//   1. SQLite から upload_status='pending'/'failed' の行を取得
//   2. /api/upload-url を叩いて S3 署名付き URL を取得
//   3. Native FS から PUT で S3 にアップロード
//   4. /api/page-attachments に POST して DB に登録
//   5. 成功: upload_status='uploaded', remote_url 保存
//   6. 失敗: upload_status='failed', upload_retry_count++ (Engine が次回再試行)
//
// 認証: USER_INFO 経由で supabase.auth.setSession 済みなので、Native fetch に
// Authorization: Bearer <access_token> を付与すれば Web 側の API が認証通る。
// /api/upload-url と /api/page-attachments は cookie ベースの認証だが、
// 同時に Bearer トークンも受け付けるよう Web 側で対応している前提。
// (まだ未対応なら Web 側で受け付ける改修を別途行う)

import * as FileSystem from "expo-file-system/legacy";
import { getDatabase } from "@/lib/db";
import {
  listPendingUpload,
  markUploadFailed,
  markUploadSucceeded,
} from "@/lib/db/repositories/page-attachments";
import { supabase } from "@/lib/supabase";

const MAX_RETRY_PER_RUN = 3;

interface UploadUrlResponse {
  uploadUrl: string;
  fileKey: string;
}

interface UploadContext {
  appBaseUrl: string;
  accessToken: string;
}

/**
 * 待機中の画像をすべてアップロードする。1 件失敗しても次の行に進む。
 */
export async function pushPendingAttachments(): Promise<void> {
  const ctx = await resolveUploadContext();
  if (!ctx) {
    // Web URL 未取得 or 未認証なら no-op (次回 sync で再試行)
    return;
  }

  const db = await getDatabase();
  const pending = await listPendingUpload(db);

  for (const row of pending) {
    if (row.upload_retry_count >= MAX_RETRY_PER_RUN) continue;
    if (!row.local_uri) continue;

    try {
      const uploadUrl = await fetchUploadUrl(ctx, {
        filename: row.original_filename ?? `${row.local_id}.jpg`,
        contentType: row.mime_type ?? "image/jpeg",
        fileSize: row.file_size_bytes ?? 0,
      });
      const remoteUrl = await uploadAndRegister(ctx, row.local_uri, uploadUrl, {
        pageLocalId: row.page_local_id,
        sortOrder: row.sort_order,
        originalFilename: row.original_filename ?? "",
        fileSize: row.file_size_bytes ?? 0,
        mimeType: row.mime_type ?? "image/jpeg",
      });
      await markUploadSucceeded(db, row.local_id, remoteUrl);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await markUploadFailed(db, row.local_id, message);
    }
  }
}

async function resolveUploadContext(): Promise<UploadContext | null> {
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (!accessToken) return null;

  const appBaseUrl =
    process.env.EXPO_PUBLIC_WEB_URL ?? "https://www.aikinote.com";
  return { appBaseUrl: appBaseUrl.replace(/\/+$/, ""), accessToken };
}

async function fetchUploadUrl(
  ctx: UploadContext,
  params: { filename: string; contentType: string; fileSize: number },
): Promise<UploadUrlResponse> {
  const res = await fetch(`${ctx.appBaseUrl}/api/upload-url`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ctx.accessToken}`,
    },
    body: JSON.stringify({ ...params, uploadType: "page-attachment" }),
  });
  if (!res.ok) {
    throw new Error(`upload-url failed: HTTP ${res.status}`);
  }
  const json = (await res.json()) as UploadUrlResponse;
  return json;
}

async function uploadAndRegister(
  ctx: UploadContext,
  localUri: string,
  uploadUrl: UploadUrlResponse,
  meta: {
    pageLocalId: string;
    sortOrder: number;
    originalFilename: string;
    fileSize: number;
    mimeType: string;
  },
): Promise<string> {
  // FS から PUT。expo-file-system/legacy の uploadAsync を使う
  const result = await FileSystem.uploadAsync(uploadUrl.uploadUrl, localUri, {
    httpMethod: "PUT",
    headers: { "Content-Type": meta.mimeType },
    uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
  });
  if (result.status !== 200) {
    throw new Error(`S3 PUT failed: HTTP ${result.status}`);
  }

  // /api/page-attachments で DB 登録
  const cloudFrontDomain = process.env.EXPO_PUBLIC_CLOUDFRONT_DOMAIN ?? "";
  const remoteUrl = cloudFrontDomain
    ? `https://${cloudFrontDomain}/${uploadUrl.fileKey}`
    : uploadUrl.fileKey;

  const registerRes = await fetch(`${ctx.appBaseUrl}/api/page-attachments`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${ctx.accessToken}`,
    },
    body: JSON.stringify({
      page_id: meta.pageLocalId, // sync で page も同期済みの想定 (server_id == local_id)
      type: "image",
      url: remoteUrl,
      original_filename: meta.originalFilename,
      file_size_bytes: meta.fileSize,
      sort_order: meta.sortOrder,
      _fileKey: uploadUrl.fileKey,
    }),
  });
  if (!registerRes.ok) {
    throw new Error(
      `page-attachments register failed: HTTP ${registerRes.status}`,
    );
  }

  return remoteUrl;
}
