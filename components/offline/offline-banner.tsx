import { StyleSheet, Text, View } from "react-native";

/**
 * オフライン時に画面上部に常駐するバナー。
 * キャッシュ表示中であることをユーザーに知らせる。
 */
export function OfflineBanner() {
  return (
    <View style={styles.banner}>
      <Text style={styles.text}>
        オフラインです。キャッシュ済みの内容を表示しています。
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: "#fff4d6",
    borderBottomWidth: 1,
    borderBottomColor: "#e8d580",
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  text: {
    color: "#6b5400",
    fontSize: 13,
    textAlign: "center",
  },
});
