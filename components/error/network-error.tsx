import { Pressable, StyleSheet } from "react-native";
import { ThemedText } from "@/components/themed-text";
import { ThemedView } from "@/components/themed-view";

type NetworkErrorProps = {
  isOffline: boolean;
  onRetry: () => void;
};

export function NetworkError({ isOffline, onRetry }: NetworkErrorProps) {
  return (
    <ThemedView style={styles.container}>
      <ThemedText type="title" style={styles.icon}>
        {isOffline ? "📡" : "⚠️"}
      </ThemedText>
      <ThemedText type="subtitle" style={styles.title}>
        {isOffline
          ? "インターネットに接続されていません"
          : "ページの読み込みに失敗しました"}
      </ThemedText>
      <ThemedText style={styles.description}>
        {isOffline
          ? "ネットワーク接続を確認して、もう一度お試しください。"
          : "しばらく待ってから、もう一度お試しください。"}
      </ThemedText>
      <Pressable style={styles.retryButton} onPress={onRetry}>
        <ThemedText style={styles.retryText}>再読み込み</ThemedText>
      </Pressable>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
  },
  icon: {
    fontSize: 48,
    marginBottom: 16,
  },
  title: {
    textAlign: "center",
    marginBottom: 8,
  },
  description: {
    textAlign: "center",
    opacity: 0.7,
    marginBottom: 32,
  },
  retryButton: {
    backgroundColor: "#0a7ea4",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  retryText: {
    color: "#ffffff",
    fontWeight: "600",
    fontSize: 16,
  },
});
