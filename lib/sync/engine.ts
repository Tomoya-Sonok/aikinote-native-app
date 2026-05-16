// 同期エンジンのエントリポイント。
//
// 設計メモ:
//   - 内部で Promise singleton を保持し、同時に複数 sync が走らないよう mutex 化
//   - スコープ: full / incremental / push-only
//   - 失敗時は console.error のみ (個別の行エラーは push 側で処理済み)、
//     Engine 自体は例外を投げない (NetInfo / 定期実行から呼ばれるため)
//
// 呼び出しタイミング (app/index.tsx 側で配線):
//   - アプリ起動直後の userId 取得後: runSync('full')
//   - NetInfo: isConnected が false → true に遷移: runSync('incremental')
//   - 5 分おきの定期実行: runSync('push-only')
//   - mutation 直後 (PERSONAL_PAGES_CREATE 等の成功時): runSync('push-only')

import { getDatabase } from "@/lib/db";
import { getMeta, setMeta } from "@/lib/db/repositories/sync-meta";
import { pullAll } from "./pull";
import { pushAll } from "./push";
import { countPending } from "./queue";

export type SyncScope = "full" | "incremental" | "push-only";

export interface SyncOptions {
  userId: string;
}

export type SyncState = "idle" | "running" | "completed" | "failed";

export interface SyncStatus {
  state: SyncState;
  scope?: SyncScope;
  pending?: number;
  error?: string;
}

type SyncStatusReporter = (status: SyncStatus) => void;
let reporter: SyncStatusReporter | null = null;

/**
 * sync 進捗を Web 側へ送り出す reporter を登録 (Native → Web の back-channel)。
 * app/index.tsx で sendToWebView を渡して使う。
 */
export function setSyncStatusReporter(r: SyncStatusReporter | null): void {
  reporter = r;
}

function reportStatus(status: SyncStatus): void {
  reporter?.(status);
}

let runningPromise: Promise<void> | null = null;

// 現在ログイン中のユーザー ID。
// USER_INFO メッセージで Native 側が更新し、mutation 後の自動 sync や
// 定期実行 / NetInfo 復帰時の sync が参照する。
let currentUserId: string | null = null;

export function setSyncUserId(userId: string | null): void {
  currentUserId = userId;
}

export function getSyncUserId(): string | null {
  return currentUserId;
}

/**
 * 現在のユーザーが分かっていれば push-only sync を非同期キックする。
 * userId 未取得時は no-op (USER_INFO 受信前など)。
 */
export function triggerPushSync(): void {
  if (!currentUserId) return;
  void runSync("push-only", { userId: currentUserId });
}

/**
 * 同期を実行する。既に同期実行中の場合は新たに開始せず、その Promise を返す。
 */
export function runSync(scope: SyncScope, options: SyncOptions): Promise<void> {
  if (runningPromise) {
    return runningPromise;
  }

  runningPromise = doSync(scope, options)
    .then(async () => {
      const db = await getDatabase();
      const pending = await countPending(db);
      reportStatus({ state: "completed", scope, pending });
    })
    .catch((error) => {
      console.error(`[sync.engine] ${scope} で予期せぬエラー:`, error);
      reportStatus({
        state: "failed",
        scope,
        error: error instanceof Error ? error.message : String(error),
      });
    })
    .finally(() => {
      runningPromise = null;
    });

  reportStatus({ state: "running", scope });
  return runningPromise;
}

async function doSync(scope: SyncScope, options: SyncOptions): Promise<void> {
  const db = await getDatabase();

  if (scope === "full" || scope === "incremental") {
    const since =
      scope === "incremental" ? await getMeta(db, "last_pull_at") : null;
    await pullAll({ userId: options.userId, since });
    await setMeta(db, "last_pull_at", new Date().toISOString());
  }
  // すべてのスコープで Push は実行する
  await pushAll({ userId: options.userId });

  if (scope === "full") {
    await setMeta(db, "initial_sync_done", "true");
  }
}

/**
 * 現在 sync 実行中か。テスト用 / UI 進捗表示用。
 */
export function isSyncRunning(): boolean {
  return runningPromise !== null;
}
