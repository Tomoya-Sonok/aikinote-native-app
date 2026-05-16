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

import { pullAll } from "./pull";
import { pushAll } from "./push";

export type SyncScope = "full" | "incremental" | "push-only";

export interface SyncOptions {
  userId: string;
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
    .catch((error) => {
      console.error(`[sync.engine] ${scope} で予期せぬエラー:`, error);
    })
    .finally(() => {
      runningPromise = null;
    });

  return runningPromise;
}

async function doSync(scope: SyncScope, options: SyncOptions): Promise<void> {
  if (scope === "full" || scope === "incremental") {
    await pullAll({
      userId: options.userId,
      since: scope === "incremental" ? null : null, // PR6 で incremental 起点を実装
    });
  }
  // すべてのスコープで Push は実行する
  await pushAll({ userId: options.userId });
}

/**
 * 現在 sync 実行中か。テスト用 / UI 進捗表示用。
 */
export function isSyncRunning(): boolean {
  return runningPromise !== null;
}
