import { Ionicons } from "@expo/vector-icons";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

type NativeHeaderProps = {
  onLogoPress: () => void;
  onMenuPress: () => void;
};

export function NativeHeader({ onLogoPress, onMenuPress }: NativeHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.inner}>
        <Pressable onPress={onLogoPress} style={styles.logoButton}>
          <Image
            source={require("@/assets/images/aikinote-logo.png")}
            style={styles.logo}
            resizeMode="contain"
          />
        </Pressable>
        <Pressable onPress={onMenuPress} style={styles.menuButton}>
          <Ionicons name="menu-outline" size={28} color="#2c2c2c" />
        </Pressable>
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
  menuButton: {
    padding: 8,
  },
});
