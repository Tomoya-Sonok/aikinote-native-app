import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import Purchases, {
  type CustomerInfo,
  LOG_LEVEL,
  type PurchasesOfferings,
  type PurchasesPackage,
} from "react-native-purchases";
import { ENTITLEMENT_ID, REVENUECAT_API_KEY } from "./config";

type RevenueCatContextValue = {
  isReady: boolean;
  isPremium: boolean;
  customerInfo: CustomerInfo | null;
  offerings: PurchasesOfferings | null;
  purchasePackage: (pkg: PurchasesPackage) => Promise<boolean>;
  restorePurchases: () => Promise<boolean>;
  identify: (userId: string) => Promise<void>;
  refresh: () => Promise<void>;
};

const RevenueCatContext = createContext<RevenueCatContextValue>({
  isReady: false,
  isPremium: false,
  customerInfo: null,
  offerings: null,
  purchasePackage: async () => false,
  restorePurchases: async () => false,
  identify: async () => {},
  refresh: async () => {},
});

export function useRevenueCat() {
  return useContext(RevenueCatContext);
}

function checkPremium(info: CustomerInfo | null): boolean {
  if (!info) return false;
  return typeof info.entitlements?.active?.[ENTITLEMENT_ID] !== "undefined";
}

export function RevenueCatProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isReady, setIsReady] = useState(false);
  const [customerInfo, setCustomerInfo] = useState<CustomerInfo | null>(null);
  const [offerings, setOfferings] = useState<PurchasesOfferings | null>(null);
  const initialized = useRef(false);

  // SDK 初期化
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const init = async () => {
      try {
        if (__DEV__) {
          Purchases.setLogLevel(LOG_LEVEL.DEBUG);
        }

        Purchases.configure({
          apiKey: REVENUECAT_API_KEY,
          // appUserID は identify() で後から設定
        });

        const [info, offr] = await Promise.all([
          Purchases.getCustomerInfo(),
          Purchases.getOfferings(),
        ]);

        setCustomerInfo(info);
        setOfferings(offr);
        setIsReady(true);
      } catch (error) {
        console.error("[RevenueCat] 初期化エラー:", error);
        setIsReady(true);
      }
    };

    init();
  }, []);

  // CustomerInfo の変更をリスナーで監視
  useEffect(() => {
    const listener = (info: CustomerInfo) => {
      setCustomerInfo(info);
    };

    Purchases.addCustomerInfoUpdateListener(listener);
    return () => {
      Purchases.removeCustomerInfoUpdateListener(listener);
    };
  }, []);

  // Supabase user_id で RevenueCat にログイン
  const identify = useCallback(async (userId: string) => {
    try {
      const { customerInfo: info } = await Purchases.logIn(userId);
      setCustomerInfo(info);
    } catch (error) {
      console.error("[RevenueCat] identify エラー:", error);
    }
  }, []);

  // パッケージを購入
  const purchasePackage = useCallback(
    async (pkg: PurchasesPackage): Promise<boolean> => {
      try {
        const { customerInfo: info } = await Purchases.purchasePackage(pkg);
        setCustomerInfo(info);
        return checkPremium(info);
      } catch (error: unknown) {
        const purchaseError = error as { userCancelled?: boolean };
        if (purchaseError.userCancelled) {
          return false;
        }
        console.error("[RevenueCat] 購入エラー:", error);
        return false;
      }
    },
    [],
  );

  // 購入を復元
  const restorePurchases = useCallback(async (): Promise<boolean> => {
    try {
      const info = await Purchases.restorePurchases();
      setCustomerInfo(info);
      return checkPremium(info);
    } catch (error) {
      console.error("[RevenueCat] 復元エラー:", error);
      return false;
    }
  }, []);

  // 最新情報を取得
  const refresh = useCallback(async () => {
    try {
      const [info, offr] = await Promise.all([
        Purchases.getCustomerInfo(),
        Purchases.getOfferings(),
      ]);
      setCustomerInfo(info);
      setOfferings(offr);
    } catch (error) {
      console.error("[RevenueCat] refresh エラー:", error);
    }
  }, []);

  const isPremium = useMemo(() => checkPremium(customerInfo), [customerInfo]);

  const value = useMemo(
    () => ({
      isReady,
      isPremium,
      customerInfo,
      offerings,
      purchasePackage,
      restorePurchases,
      identify,
      refresh,
    }),
    [
      isReady,
      isPremium,
      customerInfo,
      offerings,
      purchasePackage,
      restorePurchases,
      identify,
      refresh,
    ],
  );

  return (
    <RevenueCatContext.Provider value={value}>
      {children}
    </RevenueCatContext.Provider>
  );
}
