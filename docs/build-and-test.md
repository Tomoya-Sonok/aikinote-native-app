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

Android 実機から Mac のローカル開発サーバーに接続する場合、**`adb reverse` でポート転送する方式を推奨**（Mac の LAN IP 直接指定は Next.js dev サーバーの hydration が完了しない既知問題があるため非推奨）。

```bash
# 1) Web 側の Next.js dev サーバー用ポートを Android の localhost に転送
adb reverse tcp:3000 tcp:3000

# 2) Web 側を起動（別ターミナル）
cd /path/to/aikinote && pnpm dev

# 3) ネイティブ側を localhost 指定で起動
cd /path/to/aikinote-native-app
EXPO_PUBLIC_WEB_URL=http://localhost:3000 pnpm start
```

Android 端末上の **AikiNote** アイコンをタップしてアプリを起動 → WebView が `http://localhost:3000` をロードし、Mac の dev サーバーに接続される。

> **Tips**: Metro バンドラー用のポート 8081 は Expo CLI が `pnpm start` 実行時に自動で reverse するので手動操作は不要。

本番環境で動作確認する場合は:

```bash
pnpm start:prod   # https://aikinote.com に接続
```

> **注意**: 素の `pnpm start`（`10.0.2.2` を使用）は Android **エミュレーター** 専用。実機では `adb reverse` + `EXPO_PUBLIC_WEB_URL=http://localhost:3000` を使うこと。

### なぜ LAN IP 直接指定（`EXPO_PUBLIC_WEB_URL=http://<Mac IP>:3000`）ではダメなのか

Next.js 16 の dev サーバーは Origin が異なるクライアントからの HMR WebSocket 接続を拒否する（`ws://<hostname>:3000/_next/...` が `net::ERR_INVALID_HTTP_RESPONSE` で失敗）。WebSocket が失敗すると dev runtime 初期化も詰まり、**React hydration が完了せずボタンが一切反応しなくなる**。`adb reverse` 方式ならクライアント側の Origin が `localhost:3000` になるのでこの問題を回避できる。

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
| `pnpm start` | `localhost:3000`（iOS）/ `10.0.2.2:3000`（Android） | **iOS Simulator / Android Emulator** でのローカル開発 |
| `pnpm start:prod` | `https://aikinote.com` | **本番環境** で動作確認したいとき（実機・シミュレーター共通） |
| `adb reverse tcp:3000 tcp:3000` + `EXPO_PUBLIC_WEB_URL=http://localhost:3000 pnpm start` | Android 実機 → Mac の `localhost:3000` | **Android 実機 + ローカル開発サーバー**（Web 版の未リリース変更を実機で確認したいとき）|
| `EXPO_PUBLIC_WEB_URL=http://<Mac IP>:3000 pnpm start` | Mac の LAN IP | ⚠️ Next.js dev サーバーの hydration 問題で現在非推奨。上記 `adb reverse` 方式を使うこと |

### なぜ素の `pnpm start` は実機で動かないのか

- `localhost` / `10.0.2.2` はシミュレーター / エミュレーター内からホスト Mac を指す特殊アドレス
- 実機はネットワーク上の別デバイスなので、これらのアドレスでは Mac に到達できない
- Android 実機では `adb reverse tcp:3000 tcp:3000` で Android の `localhost:3000` を Mac の `localhost:3000` にトンネルしてから `EXPO_PUBLIC_WEB_URL=http://localhost:3000` を指定する

## トラブルシューティング

### アプリがシミュレーターに表示されない

```bash
# インストール済みアプリを確認
xcrun simctl listapps booted | grep aikinote
```

### 実機で画面が真っ白になる

- `pnpm start` ではなく **`pnpm start:prod`** を使っているか確認（上記「開発サーバーの使い分け」参照）
- Android 実機でローカル開発サーバーに繋ぐときは `adb reverse tcp:3000 tcp:3000` + `EXPO_PUBLIC_WEB_URL=http://localhost:3000 pnpm start` を使うこと（LAN IP 直接指定は hydration 問題で非推奨）

### Android 実機でページは表示されるがボタンが一切反応しない

Next.js 16 の dev サーバーに **LAN IP 経由** でアクセスすると、HMR WebSocket の handshake が拒否されて React hydration が完了しない。DOM 上にボタンは存在するが `__reactFiber` が attach されず、タップ・programmatic click いずれも無反応になる。

対処: LAN IP 指定をやめて `adb reverse` 方式に切り替える（上記「Android 実機での動作確認 § 4」参照）。本番環境 (`pnpm start:prod`) では発生しない。

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
