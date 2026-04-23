# AikiNote Native App 開発ガイド

## プロダクト概要

AikiNote のネイティブアプリ版（iOS / Android）。
Web 版 AikiNote（`/projects/aikinote`）を WebView で表示するラッパーアプリとしてスタートし、段階的にネイティブ機能を拡充していく。

## 開発ロードマップ

### Phase 1: WebView ラッパー（MVP） ✅
- Web 版 AikiNote を `react-native-webview` で全画面表示
- 認証状態の引き継ぎ（Cookie 共有による自動セッション維持）
- スプラッシュスクリーン → WebView ロード完了までのスムーズな遷移
- ディープリンク対応（`scheme: aikinotenativeapp`）
- エラーハンドリング（オフライン検出・リトライ機能）
- Android 戻るボタン対応

### Phase 2: ネイティブ UI の段階的置き換え ✅
- ネイティブタブバー（ひとりで / みんなで / マイページ）を実装
- セクション別ネイティブヘッダーを実装
  - `/personal/*`, `/mypage`: DefaultHeader（ロゴ + プロフィール画像 + メニュー）
  - `/social/posts`: SocialFeedHeader（プロフィール画像 + 投稿一覧 + 検索）
  - その他: Web 版ヘッダーをそのまま表示
- Web 版ヘッダー/フッターの CSS インジェクション非表示
- WebView ↔ ネイティブ間の `postMessage` / `onMessage` 通信基盤
- NavigationDrawer の開閉をネイティブヘッダーから制御
- プロフィールカード表示（Web 版に委譲）
- クライアントサイド遷移（`pushState`/`replaceState`）の監視による動的 CSS 更新
- 検索履歴の永続化（AsyncStorage ↔ WebView localStorage ブリッジ）
- YouTube embed のインライン再生対応
- アプリアイコン・アプリ名を AikiNote に変更

### Phase 3: ネイティブ独自機能 ✅
- Google / Apple OAuth 対応（`expo-web-browser` + ネイティブ Supabase クライアント経由）✅
- プッシュ通知（Expo Push Service + FCM / APNs）✅
- IAP 課金（RevenueCat + App Store / Google Play）✅

### Phase 3.5: リリース前改善

本番リリース（Phase 4）前の UX 調整・不具合修正・ストア審査対策タスク。

#### T1. 初回チュートリアル表示時のネイティブヘッダー/タブバー非表示化
- 方式: Web → Native の `postMessage` 通知（`TUTORIAL_STATE { active: boolean }`）
- Web 版: `aikinote/frontend/src/components/features/tutorial/Tutorial.tsx` の mount/unmount 時に `window.__AIKINOTE_NATIVE_APP__` 判定下でメッセージ送信
- ネイティブ: `app/index.tsx` の `handleMessage` に `TUTORIAL_STATE` ケース追加、`isTutorialActive` state を導入し、`NativeHeader` / `SocialFeedNativeHeader` / `NativeTabBar` の描画を条件分岐
- ドキュメント: 「WebView ↔ ネイティブ通信」表に `TUTORIAL_STATE` を追記

#### T2. ランディング → /login 動線整備 & Web 版ログイン失敗時の /signup 自動遷移
- ネイティブ側の初期遷移: Web 版 `/`（`aikinote/frontend/src/app/[locale]/page.tsx`）にネイティブ判定を追加し、未認証時は `/login` へ `redirect()`（実装案 A）
- Web 版: `aikinote/frontend/src/lib/hooks/useAuth.ts` の `signInWithCredentials` で `Invalid login credentials` 相当のエラー時、トーストで新規登録を促しつつ `location.replace('/signup?email=...')` で遷移
- 注意: Web ブラウザ経由の UX にも影響するため、文言・挙動はユーザー確認を経てから反映

#### T3. 投稿一覧ヘッダーの表示崩れ修正・タイトル文字色黒色化・通知導線（BellIcon）追加
- 対象: `aikinote-native-app/components/header/social-feed-header.tsx`
- 修正 1: 「投稿一覧」テキストが Web 版より薄く見える問題
  - 原因: `ThemedText type="subtitle"` が `useThemeColor({}, "text")` 経由で色を解決しており、`constants/theme.ts` の text トークンが Web 版 `--black` と一致していない
  - 対応: 該当箇所を `<Text>` 直接使用に変更し Web 版と同等の黒色値を明示（または `theme.ts` の text トークンを見直し、他ヘッダーへの影響を確認）
- 修正 2: レイアウト崩れ — 3 要素 + Bell 追加でのレイアウト再設計
- 修正 3: BellIcon 追加
  - `phosphor-react-native` の `Bell` を import、タップで `webView.navigateInWebView("/social/notifications")`
  - 未読バッジ: Web 版 `useUnreadNotificationCount` の値を `USER_INFO` or 新設 `UNREAD_NOTIFICATION_COUNT` メッセージで同期
- ドキュメント: 「WebView ↔ ネイティブ通信」表・ヘッダー仕様表を更新

#### T4. RevenueCat PayWall 月額固定問題（Paywall スキップ方式）
- 方針: `RevenueCatUI.presentPaywall()` を使わず、`Purchases.purchasePackage(pkg)` で OS 標準の購入確認ダイアログのみ表示
- Web 版: `aikinote/frontend/src/app/[locale]/(authenticated)/settings/subscription/SubscriptionSetting.tsx` の `handleNativeUpgrade` で `INITIATE_IAP` の payload に `planType: "monthly" | "yearly"` を含める
- ネイティブ: `app/index.tsx` の `INITIATE_IAP` ハンドラで `planType` を受け取り、`offerings.current.availablePackages` から該当 Package を抽出 → `Purchases.purchasePackage(pkg)` を呼び出し → 結果を `IAP_RESULT` で返却
- ドキュメント: 「IAP 課金」節の「課金フロー」図を Paywall 無しに更新、`INITIATE_IAP` ペイロードに `planType` を追記

#### T5. オフライン対応の設計調査（実装は Phase 5 以降に分離）
- 本 Phase では実装を行わず、調査成果物のみ作成
- 調査項目:
  1. Web 版 SW（`aikinote/frontend/public/sw.js`、現状 no-op）の Cache API 化オプション
  2. 「ひとりで」機能が依存する tRPC エンドポイントとデータ量（`frontend/src/lib/hooks/useTrainingPagesData.ts` 起点）
  3. TanStack Query 永続化プラグインによる SWR 的オフライン閲覧の実現性
  4. ネイティブ側で独自ローカル DB を持つ案の概算コスト
  5. Apple ストア審査通過のための「最低限のオフライン動作」判断材料
- 成果物: [`docs/offline-support-research.md`](./offline-support-research.md) に推奨スコープと選択肢評価を記載済み

### Phase 5-a: オフライン対応（TanStack Query + localStorage 永続化） ✅

Apple App Store Guideline 4.2 系のラッパーアプリ審査リスクを下げるため、WebView 内 Web 版のキャッシュ戦略を刷新。選択肢 B（`@tanstack/react-query` + `@tanstack/query-sync-storage-persister`）を採用。

#### Web 版の変更
- `@tanstack/react-query` を 5.87.4 → 5.99.2 に更新、`react-query-persist-client` と `query-sync-storage-persister` を追加
- `lib/query/query-client.ts`: SSR は毎回新規、クライアントはシングルトンで共有
- `components/shared/providers/QueryProvider.tsx`: `PersistQueryClientProvider` で localStorage を永続ストアに。throttleTime 1000ms、maxAge 24h、success 状態のみ dehydrate
- 11 フックを順次 `useQuery` / `useInfiniteQuery` に移行（`useTrainingPagesData` / `usePageDetailData` / `useSocialFeed` / `useSocialSearch` / `useNotifications` / `useTrainingStats` / `useDailyLimits` / `useSubscription` / `useTrendingHashtags` / `useTrainingTags` / `useUnreadNotificationCount` + `useUnreadReplyPostIds`）
- 手書きの in-memory cache（`cachedQuery` + `invalidateQueryCacheByPrefixes` + TTL 表）を削除。`lib/api/client.ts` は 1,301 → 1,046 行にスリム化
- `components/shared/OfflineBanner/`: `navigator.onLine` 監視で caution yellow バナーを上部に表示

#### ネイティブアプリの変更
- `hooks/use-webview.ts` に `hasEverLoaded` フラグを追加
- `app/index.tsx` のオフライン判定を変更: 一度もロードできていない場合のみ `NetworkError` 全画面、ロード済みなら WebView 継続表示 + `components/offline/offline-banner.tsx`

#### 効果
- Web 版: 同一ページ再訪時にキャッシュから即描画、裏で background refetch
- WebView 版: オフラインでも最近閲覧したページ（「ひとりで」一覧・詳細、投稿、通知等）をそのまま閲覧可能
- Apple 4.2 系リジェクトリスク低減

### Phase 5-b: オフライン編集対応（未着手・将来）
- 対象: 選択肢 C（ネイティブ側 SQLite / WatermelonDB）または TanStack Query mutation キュー
- 判断ポイント: 審査通過後のユーザー要望次第

### Phase 4: 本番リリース
- EAS Build で production ビルド
- EAS Submit で App Store / Google Play へ提出

## 技術スタック

| レイヤー | 技術 |
|---|---|
| フレームワーク | Expo SDK 54（React Native 0.81） |
| ルーティング | Expo Router 6（ファイルベースルーティング） |
| WebView | react-native-webview 13 |
| アイコン | Phosphor Icons（phosphor-react-native、Web 版と統一） |
| 認証（OAuth） | @supabase/supabase-js（PKCE フロー専用） |
| プッシュ通知 | expo-notifications + expo-device（Expo Push Service 経由） |
| IAP 課金 | react-native-purchases + react-native-purchases-ui（RevenueCat） |
| ストレージ | @react-native-async-storage/async-storage |
| 言語 | TypeScript 5.9（strict mode） |
| Linter / Formatter | Biome（Web 版と同一ルール） |
| ビルド / デプロイ | EAS Build / EAS Submit |
| パッケージマネージャー | pnpm 8.15.4 |
| ランタイム管理 | mise（Node.js 22.22.0） |

## 開発コマンド

```bash
# 開発サーバー起動（Development Build 必須）
pnpm start               # ローカル開発サーバー（localhost:3000）に接続
pnpm start:prod           # 本番（aikinote.com）に接続

# コード品質
pnpm check                # Biome lint/format チェック
pnpm check:fix            # 自動修正
pnpm typecheck            # TypeScript 型チェック

# EAS ビルド
pnpm build:dev            # 開発ビルド（実機テスト用）
pnpm build:preview        # プレビュービルド（内部配布）
pnpm build:prod           # 本番ビルド
pnpm submit               # ストア提出
```

### Development Build の作成

Expo Go では動作しないため、Development Build が必要。詳細は [`docs/build-and-test.md`](./build-and-test.md) を参照。

> **Android 実機開発の注意**: Next.js 16 dev サーバーは LAN IP 経由で hydration が完了しない既知問題があるため、`adb reverse tcp:3000 tcp:3000` + `EXPO_PUBLIC_WEB_URL=http://localhost:3000 pnpm start` で接続すること。手順詳細は [build-and-test.md の「Android 実機での動作確認 § 4」](./build-and-test.md) を参照。

### 接続先の切り替え

`EXPO_PUBLIC_WEB_URL` 環境変数で WebView の接続先を制御可能。

| コマンド | 接続先 | 用途 |
|---|---|---|
| `pnpm start` | `localhost:3000` | Web 版ローカル開発サーバーと連携 |
| `pnpm start:prod` | `https://aikinote.com` | 本番環境で動作確認 |
| `EXPO_PUBLIC_WEB_URL=https://example.com pnpm start` | 任意の URL | カスタム接続先 |

## プロジェクト構成

```
aikinote-native-app/
├── app/
│   ├── _layout.tsx                    # ルートレイアウト（スプラッシュ、ディープリンク、通知、AppContext）
│   ├── auth/
│   │   └── callback.tsx               # OAuth コールバック（Android 用 Expo Router 対応）
│   └── index.tsx                      # メイン画面（ヘッダー切替 + WebView + タブバー）
├── components/
│   ├── header/
│   │   ├── native-header.tsx          # DefaultHeader（ロゴ + プロフィール + メニュー）
│   │   └── social-feed-header.tsx     # SocialFeedHeader（プロフィール + タイトル + 検索）
│   ├── tab-bar/
│   │   └── native-tab-bar.tsx         # ネイティブタブバー（3タブ）
│   ├── webview/
│   │   └── aikinote-webview.tsx           # WebView ラッパー（CSS注入、postMessage、URL監視）
│   ├── error/
│   │   └── network-error.tsx          # エラー表示
│   ├── themed-text.tsx
│   └── themed-view.tsx
├── hooks/
│   ├── use-webview.ts                 # WebView 状態管理（sourceUrl / displayUrl 分離）
│   ├── use-color-scheme.ts
│   └── use-theme-color.ts
├── lib/
│   ├── navigation/
│   │   └── tab-utils.ts              # タブ定義、アクティブタブ・ヘッダータイプ判定
│   ├── purchases/
│   │   ├── RevenueCatProvider.tsx     # RevenueCat 初期化 & コンテキスト
│   │   └── config.ts                 # RevenueCat API キー & Entitlement ID
│   ├── storage/
│   │   └── webview-storage.ts        # AsyncStorage ユーティリティ（検索履歴）
│   ├── deep-link.ts                  # ディープリンク URL 変換
│   ├── push-notifications.ts         # プッシュ通知（トークン取得・チャンネル設定）
│   └── supabase.ts                   # OAuth フロー専用 Supabase クライアント
├── constants/
│   ├── config.ts                      # 環境設定（URL 切り替え等）
│   └── theme.ts                       # テーマ定数
├── assets/images/                     # AikiNote ロゴ等
├── docs/                              # ドキュメント
├── biome.json
├── eas.json
├── app.json
├── .easignore                             # EAS Build 用 ignore（google-services.json を含める）
├── .mise.toml
└── .husky/pre-commit
```

## アーキテクチャ

### ヘッダー管理

URL に応じてネイティブヘッダーと Web 版ヘッダーを切り替える。

| URL パターン | ヘッダー | 方式 |
|---|---|---|
| `/personal/pages`（一覧） | ネイティブ DefaultHeader | Web 版 header を CSS で非表示 |
| `/personal/pages/[id]`（詳細） | ネイティブ DefaultHeader | 同上 |
| `/mypage` | ネイティブ DefaultHeader | 同上 |
| `/social/posts`（フィード） | ネイティブ SocialFeedHeader | Web 版 header を CSS で非表示 |
| `/personal/pages/new`, `/[id]/edit` | Web 版 SocialHeader | ネイティブヘッダーなし |
| `/settings/*`, `/profile/edit` | Web 版 MinimalLayout | ネイティブヘッダーなし |
| `/social/posts/[id]` | Web 版 ChatLayout（なし） | ネイティブヘッダーなし |

判定ロジック: `lib/navigation/tab-utils.ts` の `getHeaderType()`

### タブバー表示ルール

ネイティブタブバー（`NativeTabBar`）は **Web 版 `TabNavigation` が表示されるページのみ** で表示する。`lib/navigation/tab-utils.ts` の `getActiveTab()` がタブ ID を返す場合のみ `<NativeTabBar>` が描画される（null の場合は非表示）。

| URL パターン | タブバー | 備考 |
|---|---|---|
| `/personal/pages` | 表示 | DefaultLayout（showTabNavigation=true） |
| `/personal/pages/[id]` | 表示 | 同上（詳細表示） |
| `/mypage` | 表示 | DefaultLayout |
| `/social/posts` | 表示 | SocialLayout（showTabNavigation=true） |
| `/social/posts/search` | 非表示 | SocialLayout（showTabNavigation=false）— 検索結果領域を広く確保 |
| `/personal/pages/new`, `/personal/pages/[id]/edit` | 非表示 | SocialHeader 単体使用 |
| `/personal/calendar`, `/personal/stats` | 非表示 | MinimalLayout |
| `/social/posts/[id]`, `/social/posts/[id]/edit`, `/social/posts/new` | 非表示 | ChatLayout ないし SocialHeader 単体 |
| `/social/notifications`, `/social/profile/[username]` | 非表示 | MinimalLayout or SocialLayout(showTabNavigation=false) |
| `/settings/*`, `/profile/edit`, `/logout` | 非表示 | MinimalLayout |
| `/login`, `/signup`, `/forgot-password` 等 | 非表示 | NotLoggedInLayout（footer=false） |
| `/` | 非表示 | ランディングページ |

### CSS インジェクション

`injectedJavaScriptBeforeContentLoaded` + `injectedJavaScript` で Web 版の UI 要素を制御：

- **タブナビゲーション**: 常に `display: none`（ネイティブタブバーで置換）
- **DefaultHeader**: `visibility: hidden; height: 0`（NavigationDrawer/プロフィールカードは `visible` で残す）
- **SocialFeedHeader**: `display: none`
- **クライアントサイド遷移監視**: `pushState`/`replaceState`/`popstate` をフックし、URL 変更時に CSS を動的更新

### WebView ↔ ネイティブ通信（postMessage / onMessage）

| メッセージタイプ | 方向 | 用途 |
|---|---|---|
| `SEARCH_HISTORY_UPDATED` | Web → Native | 検索履歴の AsyncStorage 同期 |
| `USER_INFO` | Web → Native | プロフィール画像 URL・ユーザー ID（Web 版 `useAuth` が認証状態変化時に能動的に送信） |
| `UNREAD_NOTIFICATION_COUNT` | Web → Native | 未読通知数（Web 版 `SocialFeedHeader` がポーリング結果を送信、ネイティブ SocialFeedHeader のベルアイコンバッジ表示に使用） |
| `TUTORIAL_STATE` | Web → Native | 初回チュートリアルの表示中フラグ（Web 版 `Tutorial.tsx` mount/unmount で送信、ネイティブヘッダー/タブバーの表示制御に使用） |
| `INITIATE_IAP` | Web → Native | 課金リクエスト。`payload.planType: "monthly" \| "yearly"` で直接購入、未指定の場合は Paywall UI にフォールバック |
| `SHOW_CUSTOMER_CENTER` | Web → Native | サブスクリプション管理画面を表示 |
| `GET_SUBSCRIPTION_STATUS` | Web → Native | サブスクリプション状態の問い合わせ |
| `START_NATIVE_OAUTH` | Web → Native | Google / Apple OAuth フロー開始 |
| `IAP_RESULT` | Native → Web | Paywall 結果（購入成功/失敗）を返却 |
| `SUBSCRIPTION_STATUS` | Native → Web | サブスクリプション状態を返却 |

### WebView URL 管理

`use-webview.ts` で 2 つの URL を分離管理：

- **`sourceUrl`**: WebView の `source.uri` に渡す URL。ディープリンク等の外部ナビゲーション時のみ変更
- **`displayUrl`**: `onNavigationStateChange` で更新。タブ判定・ヘッダー切替に使用。`sourceUrl` は変更しない（二重ナビゲーション防止）

## Web 版との関係

- Web 版: `/projects/aikinote`（pnpm monorepo: Next.js + Hono）
- 本アプリは Web 版を WebView で表示する構成からスタート
- 開発ツールチェイン（Biome ルール、pnpm バージョン、コミット規約）は Web 版と統一
- コミットメッセージは prefix 以外日本語（`chore: 設定変更の内容`）
- Phase 2 で Web 版に追加した変更: `data-testid` 属性（DefaultHeader, TabNavigation）

## 認証

### Email/Password
- Web 版の Supabase Auth（HTTPOnly Cookie ベース）をそのまま利用
- WebView の `sharedCookiesEnabled`（iOS）/ `thirdPartyCookiesEnabled`（Android）で Cookie を永続化
- アプリ再起動後もログイン状態が維持される

### Google / Apple OAuth
- Web 版の `useAuth` フックがネイティブアプリを検出（`__AIKINOTE_NATIVE_APP__` フラグ）→ `startNativeOAuth(provider)` ブリッジを呼出
- ネイティブ側の `@supabase/supabase-js` クライアント（`lib/supabase.ts`）が PKCE フローで OAuth URL を生成
- `expo-web-browser` の `openAuthSessionAsync` でシステムブラウザを起動
- 認証完了後、コールバックから `code` を取得 → `exchangeCodeForSession` でトークン取得
- WebView 内の `fetch` で `POST /api/auth/native-session` を呼出し、HTTPOnly Cookie をセット
- Cookie セット後に `/personal/pages` へ遷移し認証完了
- ディープリンク `aikinotenativeapp://auth/callback` は `_layout.tsx` でガードし、WebView への誤遷移を防止
- **Android 固有**: Expo Router がコールバック URL を先にルーティングするため、`app/auth/callback.tsx` で `code` を AppContext 経由で `index.tsx` に渡す方式を採用

## プッシュ通知

- **Expo Push Service** 経由で FCM（Android）/ APNs（iOS）に配信
- ログイン後に `expo-notifications` で許可リクエスト → Expo Push Token を取得
- WebView 内の `fetch` で `POST /api/push-tokens`（Next.js プロキシ → Hono Backend）にトークンを登録
- ソーシャルアクション（いいね/返信）時に Backend が `sendPushToUser()` で Expo Push API に送信
- 通知タップで該当投稿画面（`/social/posts/[id]`）に遷移（`_layout.tsx` のリスナー）
- ログアウト時は `USER_INFO (userId: null)` を検知してトークンを削除
- 自分自身へのプッシュは `sendPushToUser` 内でスキップ
- 詳細: `backend/docs/push-notification-system.md`

## IAP 課金（RevenueCat）

### 概要

- **Web 版**: Stripe Checkout（リダイレクト決済）
- **ネイティブアプリ**: RevenueCat IAP（App Store / Google Play）
- Web 版の `PremiumUpgradeModal` からは `/settings/subscription` に遷移し、同画面の CTA ボタンからのみ Paywall を表示
- 購入イベントは RevenueCat Webhook → Backend（`POST /api/webhooks/revenuecat`）→ DB 更新の流れで処理

### RevenueCat 設定

| 項目 | 値 |
|---|---|
| Entitlement ID | `AikiNote Premium` |
| Offering ID | `default` |
| iOS Product IDs | `aikinote_premium_monthly` / `aikinote_premium_yearly` |
| Android Product IDs | `aikinote_premium_monthly` / `aikinote_premium_yearly` |

### 課金フロー

```
ユーザーが /settings/subscription で月額/年額を選択し CTA ボタンを押下
  ↓
WebView → postMessage: INITIATE_IAP { planType: "monthly" | "yearly" }
  ↓
ネイティブ: offerings.current.availablePackages から packageType (MONTHLY / ANNUAL)
           に一致する PurchasesPackage を抽出
  ↓
ネイティブ: Purchases.purchasePackage(pkg)
  ↓
App Store / Google Play の購入ダイアログ
  ↓
RevenueCat が購入を検知
  ↓
RevenueCat Webhook → Backend: POST /api/webhooks/revenuecat
  ↓
DB: UserSubscription 更新（trigger で User.subscription_tier も同期）
  ↓
Native → WebView: IAP_RESULT { success: true, isPremium: true }
```

planType が未指定の場合は従来通り `RevenueCatUI.presentPaywall()` にフォールバックする。

### Premium ユーザーのサブスクリプション管理

- **Web 版**: `/settings/subscription` → Stripe Customer Portal
- **ネイティブ**: `/settings/subscription` → `RevenueCatUI.presentCustomerCenter()`

### 環境変数（EAS）

Production ビルドで必要な環境変数は **EAS Environment Variables** で管理:

| 変数 | 用途 |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | Supabase プロジェクト URL |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | Supabase Anon Key |

設定コマンド: `npx eas env:create --name <NAME> --value <VALUE> --environment production --visibility plaintext`

### Firebase 設定（google-services.json）

- `google-services.json` は `.gitignore` で除外（セキュリティ対策）
- `.easignore` で EAS Build には含まれるように設定
- EAS Secrets にもバックアップとして登録済み

## app.json 重要設定

| 設定 | 値 | 備考 |
|---|---|---|
| name | `AikiNote` | アプリ表示名 |
| bundleIdentifier (iOS) | `com.aikinote` | App Store 登録用 |
| package (Android) | `com.aikinote` | Google Play 登録用 |
| scheme | `aikinotenativeapp` | ディープリンク用 |
| newArchEnabled | `true` | React Native New Architecture 有効 |
| reactCompiler | `true` | React Compiler 実験的機能 |
| typedRoutes | `true` | 型安全ルーティング |

## EAS 設定（eas.json）

| プロファイル | 用途 | 配布方法 |
|---|---|---|
| `development` | 開発ビルド（DevClient、実機向け） | internal |
| `development:simulator` | 開発ビルド（iOS シミュレーター向け） | internal |
| `preview` | テスト配布 | internal |
| `production` | ストア提出用 | store（自動バージョン番号インクリメント） |

## ローカルビルドの前提ツール

iOS のローカルビルド（`--local`）には以下が必要：

- **Xcode**（`xcodebuild` コマンド）
- **Fastlane**（`brew install fastlane`）
- **CocoaPods**（`brew install cocoapods`）

## 本番リリース時の注意事項

### RevenueCat API キー

`lib/purchases/config.ts` に iOS / Android それぞれの Public API キーが設定済み。
RevenueCat の Public API Key はクライアント向けで公開前提のため、ハードコードで問題ない。

### App Store Connect

- Paid Apps Agreement: **Active**（銀行口座・税務情報登録済み）
- サブスクリプション商品: **Ready to Submit**（アプリ本体の App Review 提出時に一緒に審査される）

### Google Play Console

- 内部テストトラック: AAB アップロード済み
- 定期購入商品: 作成済み（Published）
- Service Account: `revenuecat-integration@aikinote.iam.gserviceaccount.com`

#### 初回 submit 時のメタデータ準備チェックリスト

新規アプリは `eas submit` でリリースを completed 状態で作成しようとするため、Play Store が要求する以下のメタデータをすべて埋めておかないと `"The app is missing the required metadata"` エラーで失敗する。Play Console UI で順に完成させてから submit すること（draft status 回避策は不採用）。

**ポリシー系（Play Console メニュー「ポリシーとプログラム > アプリのコンテンツ」）:**
- アプリのアクセス権（特別なアクセス権の有無）
- 広告の有無
- コンテンツのレーティング（質問票）
- 対象年齢と対象ユーザー
- ニュースアプリ該当可否
- COVID-19 接触者追跡アプリ該当可否
- データ セーフティ（収集データの申告）
- 政府アプリ該当可否
- 金融機能の有無
- ヘルスケアアプリ該当可否

**ストア掲載情報（Play Console メニュー「拡大 > ストアの掲載情報」）:**
- アプリ名、簡単な説明（80 字）、詳しい説明（4000 字）
- アプリアイコン、フィーチャーグラフィック（1024 × 500 px）
- スクリーンショット（最低 2 枚）
- カテゴリ・タグ
- 連絡先情報（メール、ウェブサイト、電話番号）
- プライバシーポリシー URL（`https://aikinote.com/ja/privacy` を指定）

**内部テストトラック（Play Console メニュー「リリース > テスト > 内部テスト」）:**
- テスター（個別メール or Google グループ）
- リリースノート

すべて埋まるとセクションごとに「完了」バッジが付く。完全に揃った状態で `npx eas submit --platform android --profile production --latest` を実行すればエラーなく internal トラックに公開される。次回以降のバージョンアップ時はリリースノートのみ更新すれば再利用可能。

### iOS Capability の手動運用

EAS CLI の auto capability sync は **無効化済み**（`package.json` の `build:*` スクリプトで `EXPO_NO_CAPABILITY_SYNC=1` を指定）。

**無効化している理由**:
- `com.aikinote` bundle には App Store Connect のアプリレコードが存在しており、EAS の auto sync が capability を patch しようとすると Apple API が `"The bundle cannot be deleted"` と拒否してビルド失敗するため
- APPLE_ID_AUTH / Push Notifications / IAP 等の capabilities は既に Apple Developer Console で手動登録・運用中で、自動同期の必要がない

**新しい iOS capability を追加したいときの手順**:
1. [Apple Developer Console](https://developer.apple.com/account/resources/identifiers/bundleId/edit/H4HAYMSHR8) の App ID `com.aikinote` で capability を手動有効化
2. `app.json` の `ios` セクションに対応する宣言を追加（例: `usesAppleSignIn`, `entitlements` 等）
3. `pnpm build:prod` を実行（capability sync は無効だが、手動で Apple 側と app.json が揃っていればビルド通る）

auto sync を一時的に有効化して確認したい場合は `EXPO_NO_CAPABILITY_SYNC=0 eas build --profile production --platform ios` のように個別実行する。
