import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ?? "";

/**
 * OAuth フロー専用の Supabase クライアント。
 * PKCE の code_verifier を AsyncStorage に保存し、
 * exchangeCodeForSession で使用する。
 * セッション管理は WebView の Cookie に委譲するため、
 * autoRefreshToken / persistSession は無効。
 */
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    flowType: "pkce",
    autoRefreshToken: false,
    persistSession: false,
    detectSessionInUrl: false,
  },
});
