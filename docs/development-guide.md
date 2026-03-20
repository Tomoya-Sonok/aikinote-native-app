# AikiNote Native App 開発ガイド

## プロダクト概要

AikiNote のネイティブアプリ版（iOS / Android）。
Web 版 AikiNote（`/projects/aikinote`）を WebView で表示するラッパーアプリとしてスタートし、段階的にネイティブ機能を拡充していく。

## 開発ロードマップ

### Phase 1: WebView ラッパー（MVP）
- Web 版 AikiNote を `react-native-webview` で全画面表示
- 認証状態の引き継ぎ（Cookie / トークン連携）
- スプラッシュスクリーン → WebView ロード完了までのスムーズな遷移
- ディープリンク対応（`scheme: aikinotenativeapp`）

### Phase 2: ネイティブ UI の段階的置き換え
- ヘッダー（ナビゲーションバー）をネイティブ実装に置き換え
- フッター（TabNavigation）をネイティブ実装に置き換え
- WebView ↔ ネイティブ間の通信（`postMessage` / `onMessage`）

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
| 言語 | TypeScript 5.9（strict mode） |
| Linter / Formatter | Biome（Web 版と同一ルール） |
| ビルド / デプロイ | EAS Build / EAS Submit |
| パッケージマネージャー | pnpm 8.15.4 |
| ランタイム管理 | mise（Node.js 22.22.0） |

## 開発コマンド

```bash
# 開発サーバー起動
pnpm start               # Expo DevTools
pnpm ios                  # iOS シミュレーター
pnpm android              # Android エミュレーター

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

## プロジェクト構成

```
aikinote-native-app/
├── app/                   # Expo Router ファイルベースルーティング
│   ├── _layout.tsx        # ルートレイアウト
│   ├── modal.tsx          # モーダル画面
│   └── (tabs)/            # タブレイアウト
├── components/            # 再利用可能な UI コンポーネント
│   └── ui/                # 基本 UI パーツ
├── constants/             # テーマ定数（カラー、フォント）
├── hooks/                 # カスタムフック
├── assets/                # 画像リソース
├── docs/                  # ドキュメント（このファイル）
├── scripts/               # ユーティリティスクリプト
├── biome.json             # Biome 設定
├── eas.json               # EAS Build/Submit 設定
├── app.json               # Expo 設定
├── .mise.toml             # ランタイムバージョン固定
└── .husky/pre-commit      # pre-commit hook
```

## Web 版との関係

- Web 版: `/projects/aikinote`（pnpm monorepo: Next.js + Hono）
- 本アプリは Web 版を WebView で表示する構成からスタート
- 開発ツールチェイン（Biome ルール、pnpm バージョン、コミット規約）は Web 版と統一
- コミットメッセージは prefix 以外日本語（`chore: 設定変更の内容`）

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
| `development` | 開発ビルド（DevClient） | internal |
| `preview` | テスト配布 | internal |
| `production` | ストア提出用 | store（自動バージョン番号インクリメント） |
