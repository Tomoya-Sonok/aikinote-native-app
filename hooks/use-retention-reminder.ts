import { useEffect } from "react";
import { AppState } from "react-native";
import {
  cancelRetentionReminder,
  rescheduleRetentionReminder,
} from "@/lib/retention-notification";

// 未ログイン時のみ、アプリ利用（起動・フォアグラウンド復帰）のたびに
// リテンション通知を7日後へ予約し直す。
// ログイン済みユーザーにはサーバー側 Cron が同じ通知を送るため（プッシュトークン登録済み）、
// 二重通知を避けるべくローカル予約はキャンセルする。
export function useRetentionReminder(userId: string | null): void {
  useEffect(() => {
    if (userId) {
      void cancelRetentionReminder();
      return;
    }

    void rescheduleRetentionReminder();

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void rescheduleRetentionReminder();
      }
    });
    return () => subscription.remove();
  }, [userId]);
}
