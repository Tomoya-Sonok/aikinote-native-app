import { useEffect } from "react";
import { AppState } from "react-native";
import { rescheduleRetentionReminder } from "@/lib/retention-notification";

// アプリ利用（起動・フォアグラウンド復帰）のたびにリテンション通知を7日後へ予約し直す
export function useRetentionReminder(): void {
  useEffect(() => {
    void rescheduleRetentionReminder();

    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        void rescheduleRetentionReminder();
      }
    });
    return () => subscription.remove();
  }, []);
}
