import { MagnifyingGlass, User } from "phosphor-react-native";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemedText } from "@/components/themed-text";

type SocialFeedNativeHeaderProps = {
  profileImageUrl: string | null;
  onProfilePress: () => void;
  onSearchPress: () => void;
};

export function SocialFeedNativeHeader({
  profileImageUrl,
  onProfilePress,
  onSearchPress,
}: SocialFeedNativeHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.inner}>
        <Pressable onPress={onProfilePress} style={styles.profileButton}>
          {profileImageUrl ? (
            <Image
              source={{ uri: profileImageUrl }}
              style={styles.profileImage}
            />
          ) : (
            <View style={styles.profileFallback}>
              <User size={24} weight="light" color="#2c2c2c" />
            </View>
          )}
        </Pressable>
        <ThemedText type="subtitle" style={styles.title}>
          投稿一覧
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
  profileButton: {
    width: 40,
    height: 40,
    borderRadius: 9999,
    overflow: "hidden",
  },
  profileImage: {
    width: 40,
    height: 40,
    borderRadius: 9999,
  },
  profileFallback: {
    width: 40,
    height: 40,
    borderRadius: 9999,
    backgroundColor: "#f5f3ef",
    alignItems: "center",
    justifyContent: "center",
  },
  iconButton: {
    padding: 8,
  },
});
