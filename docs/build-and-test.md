# ビルド & 動作確認ガイド

## 前提

- `react-native-webview` 等のネイティブモジュールを使用しているため **Expo Go では動作しない**
- **Development Build** を作成してシミュレーター/実機にインストールする必要がある
- JS コードのみの変更は再ビルド不要（開発サーバー再起動で反映）
- ネイティブモジュールの追加/変更時は再ビルドが必要

## 再ビルドが必要なケース

| 変更内容                                          | 再ビルド                         |
| ------------------------------------------------- | -------------------------------- |
| `.tsx` / `.ts` ファイルの編集                     | 不要（開発サーバー再起動で反映） |
| `app.json` の変更（アプリ名、アイコン等）         | **必要**                         |
| ネイティブモジュールの追加/削除（`pnpm add ...`） | **必要**                         |
| `eas.json` の変更                                 | **必要**                         |

## iOS シミュレーターでの動作確認

### 1. ビルド

```bash
cd /path/to/aikinote-native-app
npx eas build --profile development:simulator --platform ios --local
```

- **プロジェクトルートで実行すること**（ビルド成果物 `build-XXXXX.tar.gz` がここに生成される）
- ビルド完了まで数分かかる
- 暗号化の質問（`iOS app only uses standard/exempt encryption?`）には **Yes** と回答

### 2. シミュレーターにインストール

**注意**: 以下のコマンドはすべて **プロジェクトルート**（`build-*.tar.gz` がある場所）で実行すること。

```bash
# ビルド成果物を展開（最新のビルドを使用）
rm -rf /tmp/aikinote-build && mkdir -p /tmp/aikinote-build
tar -xzf "$(ls -t build-*.tar.gz | head -1)" -C /tmp/aikinote-build

# シミュレーターを起動（デバイス名は環境に合わせて変更）
xcrun simctl boot "iPhone 17" 2>/dev/null; open -a Simulator

# アプリをインストール
xcrun simctl install booted /tmp/aikinote-build/AikiNote.app
```

> **Tips**: `xcrun simctl list devices available` で利用可能なデバイス一覧を確認できる

### 3. 開発サーバー起動 & アプリ起動

```bash
# シミュレーター/エミュレーターの場合（localhost:3000 に接続）
pnpm start

# 本番（aikinote.com）に接続する場合
pnpm start:prod
```

シミュレーター上の **AikiNote** アイコンをタップしてアプリを起動。

> **Note**: `pnpm start`（localhost 接続）は**シミュレーター/エミュレーター専用**。実機では `pnpm start:prod` を使うこと（詳細は下記「開発サーバーの使い分け」を参照）。

### ワンライナー（ビルド → インストール → 起動）

プロジェクトルートで実行:

```bash
npx eas build --profile development:simulator --platform ios --local \
  && rm -rf /tmp/aikinote-build && mkdir -p /tmp/aikinote-build \
  && tar -xzf "$(ls -t build-*.tar.gz | head -1)" -C /tmp/aikinote-build \
  && xcrun simctl boot "iPhone 17" 2>/dev/null; open -a Simulator \
  && xcrun simctl install booted /tmp/aikinote-build/AikiNote.app
```

## Android 実機での動作確認

### 1. ビルド（EAS クラウド）

```bash
npx eas build --profile development --platform android
```

- EAS のクラウドサーバーでビルド（数分〜十数分）
- 完了すると APK のダウンロード URL が表示される

### 2. APK をダウンロード

```bash
# 最新のビルド情報を確認
npx eas build:list --platform android --limit 1

# APK の URL を取得（Application Archive URL の値）
npx eas build:view <BUILD_ID>

# APK をダウンロード
curl -L -o aikinote-dev.apk "<APK_URL>"
```

### 3. 実機にインストール（adb）

```bash
# USB デバッグを有効にした Android 端末を Mac に USB 接続

# 接続確認
adb devices

# インストール
adb install aikinote-dev.apk

# 既にインストール済みの場合（上書き）
adb install -r aikinote-dev.apk
```

> **初回準備**: Android 端末で「設定 → デバイス情報 → ビルド番号を 7 回タップ」→「開発者向けオプション → USB デバッグ ON」→ Mac 接続時に「USB デバッグを許可」をタップ

### 4. 開発サーバー起動 & アプリ起動

```bash
# Mac と Android 端末が同じ Wi-Fi に接続されている状態で
pnpm start:prod   # 本番（aikinote.com）に接続 ← 実機はこちらを使用
```

Android 端末上の **AikiNote** アイコンをタップしてアプリを起動。

> **注意**: `pnpm start`（localhost 接続）は Android 実機では使えません（`10.0.2.2` はエミュレーター専用の特殊アドレスです）。実機でローカル開発サーバーに接続したい場合は下記「開発サーバーの使い分け」を参照してください。

## ローカルビルドの前提ツール（iOS）

iOS のローカルビルド（`--local`）には以下が必要：

```bash
# 未インストールの場合
brew install fastlane
brew install cocoapods
```

- **Xcode**: Mac に Xcode がインストールされていること
- **Fastlane**: iOS ビルドの自動化ツール
- **CocoaPods**: iOS のネイティブ依存管理

## 開発サーバーの使い分け

WebView の接続先は開発サーバーの起動コマンドで決まる。

| コマンド | 接続先 | 用途 |
|---|---|---|
| `pnpm start` | `localhost:3000`（iOS）/ `10.0.2.2:3000`（Android） | **シミュレーター / エミュレーター** でのローカル開発 |
| `pnpm start:prod` | `https://aikinote.com` | **実機テスト** や本番環境での動作確認 |
| `EXPO_PUBLIC_WEB_URL=http://<Mac IP>:3000 pnpm start` | Mac のローカル IP | **実機 + ローカル開発サーバー**（Web 版の未リリース変更を実機で確認したい時） |

### なぜ `pnpm start` は実機で動かないのか

- `localhost` / `10.0.2.2` はシミュレーター/エミュレーター内からホスト Mac を指す特殊アドレス
- 実機はネットワーク上の別デバイスなので、これらのアドレスでは Mac に到達できない
- 実機からローカルサーバーに接続するには Mac の実際の IP アドレス（`ipconfig getifaddr en0` で確認）を指定する必要がある

## トラブルシューティング

### アプリがシミュレーターに表示されない

```bash
# インストール済みアプリを確認
xcrun simctl listapps booted | grep aikinote
```

### 実機で画面が真っ白になる

- `pnpm start` ではなく **`pnpm start:prod`** を使っているか確認（上記「開発サーバーの使い分け」参照）
- ローカルサーバーに実機から接続したい場合は `EXPO_PUBLIC_WEB_URL=http://<Mac IP>:3000 pnpm start` を使用

### 開発サーバーに接続できない

- `pnpm start` が実行中か確認
- シミュレーター/実機と Mac が同じネットワークか確認
- ファイアウォールがポート 8081 をブロックしていないか確認

### ビルドが失敗する

```bash
# キャッシュをクリアして再ビルド
npx expo start --clear
npx eas build --profile development:simulator --platform ios --local --clear-cache
```
