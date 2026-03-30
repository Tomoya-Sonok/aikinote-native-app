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

### Phase 3: ネイティブ独自機能 ✅（OAuth）/ ⏳（その他）
- Google / Apple OAuth 対応（`expo-web-browser` + ネイティブ Supabase クライアント経由）✅
- プッシュ通知（Web 版で下準備済み → `expo-notifications` で接続）
- その他ネイティブならではの機能追加

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

Expo Go では動作しないため、Development Build が必要。詳細は `docs/build-and-test.md` を参照。

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
│   ├── _layout.tsx                    # ルートレイアウト（スプラッシュ、ディープリンク、AppContext）
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
│   └── supabase.ts                   # OAuth フロー専用 Supabase クライアント
├── constants/
│   ├── config.ts                      # 環境設定（URL 切り替え等）
│   └── theme.ts                       # テーマ定数
├── assets/images/                     # AikiNote ロゴ等
├── docs/                              # ドキュメント
├── biome.json
├── eas.json
├── app.json
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
| `USER_INFO` | Web → Native | プロフィール画像 URL・ユーザー ID の取得 |
| `INITIATE_IAP` | Web → Native | Premium 機能リクエスト → Paywall 表示 |
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

## app.json 重要設定

| 設定 | 値 | 備考 |
|---|---|---|
| name | `AikiNote` | アプリ表示名 |
| bundleIdentifier (iOS) | `com.aikinote.app` | App Store 登録用 |
| package (Android) | `com.aikinote.app` | Google Play 登録用 |
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

### RevenueCat API キーの差し替え

`lib/purchases/config.ts` に RevenueCat のテスト用 API キーがハードコードされている。本番リリース前に以下の対応が必要：

1. RevenueCat ダッシュボードから本番用 API キーを取得
2. `lib/purchases/config.ts` の `API_KEYS` を本番キーに差し替え、または EAS の環境変数（`EXPO_PUBLIC_REVENUECAT_API_KEY`）で管理するように変更
3. iOS / Android それぞれ別キーが必要な場合は `API_KEYS.apple` / `API_KEYS.google` を個別に設定
