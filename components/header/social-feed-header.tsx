import { Bell, MagnifyingGlass, User } from "phosphor-react-native";
import { Image, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Locale } from "@/lib/navigation/tab-utils";

type SocialFeedNativeHeaderProps = {
  profileImageUrl: string | null;
  unreadNotificationCount: number;
  locale: Locale;
  onProfilePress: () => void;
  onNotificationPress: () => void;
  onSearchPress: () => void;
};

const LABELS: Record<
  Locale,
  { title: string; notifications: string; search: string; profile: string }
> = {
  ja: {
    title: "投稿一覧",
    notifications: "通知一覧",
    search: "投稿を検索",
    profile: "プロフィールを開く",
  },
  en: {
    title: "Posts",
    notifications: "Notifications",
    search: "Search posts",
    profile: "Open profile",
  },
};

export function SocialFeedNativeHeader({
  profileImageUrl,
  unreadNotificationCount,
  locale,
  onProfilePress,
  onNotificationPress,
  onSearchPress,
}: SocialFeedNativeHeaderProps) {
  const insets = useSafeAreaInsets();
  const labels = LABELS[locale];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.inner}>
        <View style={styles.absoluteTitleWrap}>
          <Text style={styles.title} numberOfLines={1}>
            {labels.title}
          </Text>
        </View>
        <Pressable
          onPress={onProfilePress}
          style={styles.profileButton}
          accessibilityLabel={labels.profile}
        >
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
        <View style={styles.rightActions}>
          <Pressable
            onPress={onNotificationPress}
            style={styles.iconButton}
            accessibilityLabel={labels.notifications}
          >
            <Bell size={24} weight="regular" color="#2c2c2c" />
            {unreadNotificationCount > 0 && <View style={styles.badge} />}
          </Pressable>
          <Pressable
            onPress={onSearchPress}
            style={styles.iconButton}
            accessibilityLabel={labels.search}
          >
            <MagnifyingGlass size={24} weight="regular" color="#2c2c2c" />
          </Pressable>
        </View>
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
    position: "relative",
  },
  absoluteTitleWrap: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "center",
    justifyContent: "center",
    pointerEvents: "none",
  },
  title: {
    fontSize: 16,
    fontWeight: "600",
    color: "#2c2c2c",
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
  rightActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  iconButton: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
  badge: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#f12b2b",
  },
});
