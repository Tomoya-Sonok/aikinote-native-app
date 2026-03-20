import { Ionicons } from "@expo/vector-icons";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ThemedText } from "@/components/themed-text";
import { TABS, type TabId } from "@/lib/navigation/tab-utils";

type NativeTabBarProps = {
  activeTab: TabId | null;
  onTabPress: (path: string) => void;
};

const ACTIVE_COLOR = "#2c2c2c";
const INACTIVE_COLOR = "#8b8178";

export function NativeTabBar({ activeTab, onTabPress }: NativeTabBarProps) {
  const insets = useSafeAreaInsets();

  if (activeTab === null) return null;

  return (
    <View style={[styles.container, { paddingBottom: insets.bottom }]}>
      {TABS.map((tab) => {
        const isActive = tab.id === activeTab;
        return (
          <Pressable
            key={tab.id}
            style={styles.tab}
            onPress={() => onTabPress(tab.path)}
          >
            <View style={[styles.tabInner, isActive && styles.tabInnerActive]}>
              <Ionicons
                name={isActive ? tab.activeIcon : tab.icon}
                size={24}
                color={isActive ? ACTIVE_COLOR : INACTIVE_COLOR}
              />
              <ThemedText
                style={[
                  styles.label,
                  { color: isActive ? ACTIVE_COLOR : INACTIVE_COLOR },
                  isActive && styles.labelActive,
                ]}
              >
                {tab.label}
              </ThemedText>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    borderTopWidth: 0.5,
    borderTopColor: "#e8e4df",
    backgroundColor: "#ffffff",
  },
  tab: {
    flex: 1,
    alignItems: "center",
  },
  tabInner: {
    alignItems: "center",
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabInnerActive: {
    borderBottomColor: ACTIVE_COLOR,
  },
  label: {
    fontSize: 11,
    marginTop: 2,
  },
  labelActive: {
    fontWeight: "600",
  },
});
