import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "@react-navigation/native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import { config } from "@/constants/config";
import { useColorScheme } from "@/hooks/use-color-scheme";

type AppContextValue = {
  initialUrl: string;
  onWebViewReady: () => void;
};

const AppContext = createContext<AppContextValue>({
  initialUrl: config.webBaseUrl,
  onWebViewReady: () => {},
});

export function useAppContext() {
  return useContext(AppContext);
}

export const unstable_settings = {
  anchor: "index",
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  const [initialUrl] = useState(config.webBaseUrl);

  const onWebViewReady = useCallback(() => {
    // Step 4 でスプラッシュスクリーン制御を追加
  }, []);

  const contextValue = useMemo(
    () => ({ initialUrl, onWebViewReady }),
    [initialUrl, onWebViewReady],
  );

  return (
    <AppContext.Provider value={contextValue}>
      <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
        <Stack screenOptions={{ headerShown: false }}>
          <Stack.Screen name="index" />
        </Stack>
        <StatusBar style="auto" />
      </ThemeProvider>
    </AppContext.Provider>
  );
}
