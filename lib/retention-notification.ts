import { Notifications } from "./notifications";

// リテンション通知: 前回利用から7日経過したユーザーに 20:00 JST のローカル通知を1件だけ予約する。
// アプリの起動/フォアグラウンド復帰のたびに再予約されるため、利用が続くかぎり発火しない。

export const RETENTION_NOTIFICATION_ID = "retention-reminder";

const RETENTION_DELAY_DAYS = 7;
const TRIGGER_HOUR_JST = 20;
const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
// 通知時刻は端末タイムゾーンに関係なく日本時間 20:00 に固定する（JST=UTC+9、DST なし）
const JST_OFFSET_MS = 9 * HOUR_MS;

/** now + 7日 以降の最初の 20:00 JST を返す（エポック計算のみで端末TZに依存しない純関数） */
export function calcNextRetentionTriggerAt(nowMs: number): Date {
  const earliest = nowMs + RETENTION_DELAY_DAYS * DAY_MS;
  const jstShifted = earliest + JST_OFFSET_MS;
  const jstDayStart = Math.floor(jstShifted / DAY_MS) * DAY_MS;
  const candidate = jstDayStart + TRIGGER_HOUR_JST * HOUR_MS - JST_OFFSET_MS;
  return new Date(candidate >= earliest ? candidate : candidate + DAY_MS);
}

/**
 * リテンション通知のローカル予約を取り消す。
 * ログイン中はサーバー側 Cron が同じ通知を送るため、二重通知を避けるべくこちらを使う。
 */
export async function cancelRetentionReminder(): Promise<void> {
  if (!Notifications) return;

  try {
    await Notifications.cancelScheduledNotificationAsync(
      RETENTION_NOTIFICATION_ID,
    );
  } catch (error) {
    console.warn("[Retention] リマインダーのキャンセルに失敗:", error);
  }
}

/**
 * 既存のリテンション通知予約をキャンセルし、7日後以降の最初の 20:00 JST に1件だけ再予約する。
 * 通知未許可の場合、または expo-notifications が利用できない場合（iOS Simulator）は何もしない。
 */
export async function rescheduleRetentionReminder(): Promise<void> {
  if (!Notifications) return;

  try {
    const { status } = await Notifications.getPermissionsAsync();
    if (status !== "granted") return;

    await Notifications.cancelScheduledNotificationAsync(
      RETENTION_NOTIFICATION_ID,
    );

    const date = calcNextRetentionTriggerAt(Date.now());
    await Notifications.scheduleNotificationAsync({
      identifier: RETENTION_NOTIFICATION_ID,
      content: {
        title: "AikiNote",
        body: "他の合気道家の学びをチェックして、あなたも稽古記録・投稿してみませんか？",
        sound: "default",
        data: { url: "/social/posts" },
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date,
        // Android はローカル通知でも trigger 側でチャンネルを指定する（iOS では無視される）
        channelId: "default",
      },
    });
    console.log("[Retention] リマインダーを予約:", date.toISOString());
  } catch (error) {
    console.warn("[Retention] リマインダーの予約に失敗:", error);
  }
}
