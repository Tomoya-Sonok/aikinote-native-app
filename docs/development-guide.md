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
- **Google OAuth は未対応**（メール/パスワードログインのみ）

### Phase 2: ネイティブ UI の段階的置き換え
- ヘッダー（ナビゲーションバー）をネイティブ実装に置き換え
- フッター（TabNavigation）をネイティブ実装に置き換え
- WebView ↔ ネイティブ間の通信（`postMessage` / `onMessage`）
- Google OAuth 対応（`expo-web-browser` 経由）

### Phase 3: ネイティブ独自機能
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
| WebView | react-native-webview |
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

Expo Go では動作しないため、Development Build が必要。

```bash
# iOS シミュレーター向け（ローカルビルド）
npx eas build --profile development:simulator --platform ios --local

# Android（クラウドビルド）
npx eas build --profile development --platform android

# ビルド成果物のインストール
# iOS: .tar.gz を展開して .app をシミュレーターにドラッグ&ドロップ
# Android: adb install <file>.apk
```

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
├── app/                           # Expo Router ファイルベースルーティング
│   ├── _layout.tsx                # ルートレイアウト（スプラッシュ制御、ディープリンク）
│   └── index.tsx                  # メイン画面（WebView 表示、エラー切替）
├── components/
│   ├── webview/
│   │   └── aiki-webview.tsx       # WebView ラッパーコンポーネント
│   ├── error/
│   │   └── network-error.tsx      # エラー表示コンポーネント
│   ├── themed-text.tsx            # テーマ対応テキスト
│   └── themed-view.tsx            # テーマ対応ビュー
├── constants/
│   ├── theme.ts                   # テーマ定数（カラー、フォント）
│   └── config.ts                  # 環境設定（URL 切り替え等）
├── hooks/
│   ├── use-webview.ts             # WebView 状態管理フック
│   ├── use-color-scheme.ts        # カラースキームフック
│   └── use-theme-color.ts         # テーマカラーフック
├── lib/
│   └── deep-link.ts              # ディープリンク URL 変換
├── assets/                        # 画像リソース
├── docs/                          # ドキュメント（このファイル）
├── biome.json                     # Biome 設定
├── eas.json                       # EAS Build/Submit 設定
├── app.json                       # Expo 設定
├── .mise.toml                     # ランタイムバージョン固定
└── .husky/pre-commit              # pre-commit hook
```

## Web 版との関係

- Web 版: `/projects/aikinote`（pnpm monorepo: Next.js + Hono）
- 本アプリは Web 版を WebView で表示する構成からスタート
- 開発ツールチェイン（Biome ルール、pnpm バージョン、コミット規約）は Web 版と統一
- コミットメッセージは prefix 以外日本語（`chore: 設定変更の内容`）
- Phase 1 では Web 版側のコード変更は不要

## 認証

- Web 版の Supabase Auth（HTTPOnly Cookie ベース）をそのまま利用
- WebView の `sharedCookiesEnabled`（iOS）/ `thirdPartyCookiesEnabled`（Android）で Cookie を永続化
- アプリ再起動後もログイン状態が維持される
- **Phase 1 では Email/Password ログインのみ対応**（Google OAuth は Phase 2）

## app.json 重要設定

| 設定 | 値 | 備考 |
|---|---|---|
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
