import { List, User } from "phosphor-react-native";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { Locale } from "@/lib/navigation/tab-utils";

type NativeHeaderProps = {
  profileImageUrl: string | null;
  locale: Locale;
  onLogoPress: () => void;
  onAvatarPress: () => void;
  onMenuPress: () => void;
};

const LABELS: Record<Locale, { logo: string; profile: string; menu: string }> =
  {
    ja: {
      logo: "ホームに戻る",
      profile: "プロフィールを開く",
      menu: "メニューを開く",
    },
    en: {
      logo: "Go to home",
      profile: "Open profile",
      menu: "Open menu",
    },
  };

export function NativeHeader({
  profileImageUrl,
  locale,
  onLogoPress,
  onAvatarPress,
  onMenuPress,
}: NativeHeaderProps) {
  const insets = useSafeAreaInsets();
  const labels = LABELS[locale];

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.inner}>
        <Pressable
          onPress={onLogoPress}
          style={styles.logoButton}
          accessibilityLabel={labels.logo}
        >
          <Image
            source={require("@/assets/images/aikinote-logo.png")}
            style={styles.logo}
            resizeMode="contain"
          />
        </Pressable>
        <View style={styles.rightSection}>
          <Pressable
            onPress={onAvatarPress}
            style={styles.avatarButton}
            accessibilityLabel={labels.profile}
          >
            {profileImageUrl ? (
              <Image
                source={{ uri: profileImageUrl }}
                style={styles.avatarImage}
              />
            ) : (
              <View style={styles.avatarFallback}>
                <User size={24} weight="light" color="#2c2c2c" />
              </View>
            )}
          </Pressable>
          <Pressable
            onPress={onMenuPress}
            style={styles.menuButton}
            accessibilityLabel={labels.menu}
          >
            <List size={24} weight="light" color="#2c2c2c" />
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: "#fdfcfa",
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
  logoButton: {
    padding: 4,
  },
  logo: {
    width: 44,
    height: 44,
  },
  rightSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  avatarButton: {
    width: 40,
    height: 40,
    borderRadius: 9999,
    overflow: "hidden",
  },
  avatarImage: {
    width: 40,
    height: 40,
    borderRadius: 9999,
  },
  avatarFallback: {
    width: 40,
    height: 40,
    borderRadius: 9999,
    backgroundColor: "#f5f3ef",
    alignItems: "center",
    justifyContent: "center",
  },
  menuButton: {
    padding: 8,
  },
});
