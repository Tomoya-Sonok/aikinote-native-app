import { MagnifyingGlass, UserCircle } from "phosphor-react-native";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemedText } from "@/components/themed-text";

type SocialFeedNativeHeaderProps = {
  onProfilePress: () => void;
  onSearchPress: () => void;
};

export function SocialFeedNativeHeader({
  onProfilePress,
  onSearchPress,
}: SocialFeedNativeHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.inner}>
        <Pressable onPress={onProfilePress} style={styles.iconButton}>
          <UserCircle size={32} weight="light" color="#2c2c2c" />
        </Pressable>
        <ThemedText type="subtitle" style={styles.title}>
          みんなで
        </ThemedText>
        <Pressable onPress={onSearchPress} style={styles.iconButton}>
          <MagnifyingGlass size={24} weight="light" color="#2c2c2c" />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#ffffff",
    borderBottomWidth: 0.5,
    borderBottomColor: "#e8e4df",
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    height: 52,
  },
  title: {
    fontSize: 18,
    fontWeight: "600",
  },
  iconButton: {
    padding: 8,
  },
});
