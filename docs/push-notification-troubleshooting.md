# プッシュ通知が届かない原因の網羅調査メモ

実機で「許可ダイアログが出て『許可』をタップしたのに通知が届かない」状態の原因候補を、可能性が高い順に網羅。各項目の **確認手順 / 切り分け方** をセットで書いてある。

調査は静的なコードレビューのみ。実機ログ・Supabase DB・EAS credentials は未確認なので、復帰したら下記の「最初にやること」から順に潰していくのが最短。

---

## ⚠️ 重要追記（ユーザーからの追加情報を踏まえた絞り込み）

> **「ローカル `adb install` でインストールした .apk では通知が届いていた。EAS Build + Google Play Console（内部テスト/クローズドテスト）でアプリを入れ始めたあたりから届かなくなった」**

この情報で原因の所在が劇的に絞れる:

### ✅ 白とほぼ確定できる範囲
- **クライアント側のトークン取得ロジック**: `registerForPushNotifications`, `getExpoPushTokenAsync` のロジック自体は動いていた実績がある
- **WebView ↔ ネイティブ通信 (`USER_INFO`, `__AIKINOTE_NATIVE_APP__`)**: hydration もユーザー認証連携も動いていた
- **`/api/push-tokens` プロキシ → Hono backend → DB 保存**: 過去動いていた経路
- **バックエンドの `sendPushToUser` ロジック**: 動いていた
- **`UserNotificationPreference` のデフォルト挙動 / 「自分→自分の通知スキップ」**: もし以前テストできていたなら問題なし
- **iOS デバイス側の通知設定 / 集中モード**: 同一端末で以前届いていたなら除外（ただし設定変更の可能性は残る）

### 🎯 黒に近い候補（=「EAS Build → Google Play 配信」で変わるところ）

#### **本命 1. Google Play App Signing による署名鍵差替えで `google-services.json` の SHA-1 認証が崩れている**

Google Play Console にアップした AAB は **Play App Signing で再署名される**。実機にインストールされる APK の署名キーは、ローカル `adb install` した時の signing key とは別物（Play が管理する App signing key）。

Firebase Cloud Messaging（FCM）自体は SHA-1 不要なケースが多いが、**Firebase コンソール側で SHA-1 を登録する設定にしている場合・特定機能を有効化している場合は不一致で叩き落される**ことがある。少なくとも FCM v1 の場合、`google-services.json` 内の `oauth_client[].android_info.package_name` と `certificate_hash` は signing key 由来。

確認:
1. **Google Play Console → リリース → 設定 → アプリの署名** で「アプリ署名鍵の証明書 SHA-1」をコピー
2. **Firebase Console → プロジェクトの設定 → 全般 → 自分のアプリ（Android）** に、上記 SHA-1 が登録されているか確認
3. 未登録なら追加 → **新しい `google-services.json` をダウンロード** → `aikinote-native-app/google-services.json` を差し替え → `eas build` し直し

これは「ローカル debug 鍵 → Play 署名鍵」に切り替わった瞬間に通知が壊れるパターンとして最も典型的。

#### **本命 2. Expo に FCM V1 サービスアカウントキー (JSON) が未登録 / 古い**

backend の送信経路は:
```
backend → Expo Push API (https://exp.host/--/api/v2/push/send)
       → FCM V1 API (Expo が代理で投げる)
       → デバイス
```

**Expo が FCM v1 にサーバー間 push するためには、Firebase の Service Account JSON を EAS credentials に登録しておく必要がある**。FCM Legacy Server Key は 2024 年 6 月で廃止済みなので、新しいプロジェクトは V1 しか使えない。

ローカル `adb install` の時期は、まだ FCM Legacy Server Key が生きていて Expo に旧クレデンシャルが残っていた → 今は廃止されて使えなくなり、V1 への移行ができていない、というシナリオが典型的。

確認:
```bash
cd /Users/tomoyakonos/projects/aikinote-native-app
npx eas credentials
# → Android → production → 「Push Notifications: FCM V1」セクションを確認
# → "FCM V1 service account key is not configured" と表示されたら黒
```

未登録だった場合の対処（5 分で終わる）:
1. Firebase Console → プロジェクトの設定 → サービスアカウント → 「新しい秘密鍵を生成」 → JSON をダウンロード
2. `npx eas credentials` で「Android → production → Push Notifications → FCM V1 → Upload service account key」を選択し、上記 JSON をアップロード
3. 既存 AAB のままでも次の Push から効くはず（クライアント再ビルド不要）。Expo Push Tool で先にテスト送信して確認。

#### **本命 3. Firebase コンソールに登録された `google-services.json` が EAS ビルド用にアップデートされていない**

ローカル debug 用の `google-services.json` のまま `eas build` していると、Play 配信ビルドでは別の signing key で動くため、FCM Token 取得が拒否される可能性。

確認:
```bash
# google-services.json の中身確認
cat /Users/tomoyakonos/projects/aikinote-native-app/google-services.json | grep -E "package_name|project_id|certificate_hash"
```
- `package_name` が `com.aikinote` であること
- `project_id` が Firebase コンソールのプロジェクト ID と一致すること
- `oauth_client[].android_info.certificate_hash` に Play App Signing 鍵の SHA-1 が含まれていること（含まれていなければ Firebase に SHA-1 を追加して新しい `google-services.json` を取得）

#### **候補 4. EAS Build の AAB に `google-services.json` が含まれていない**

`app.json` の `android.googleServicesFile: "./google-services.json"` は記述あり。`.easignore` でも除外していない（確認済み）。

ただし:
- `.gitignore` に `google-services.json` が含まれており、EAS が GitHub 経由でビルドしているなら入らない
- `eas build --local` でローカルからアップロードしていれば入る

確認:
```bash
# 直近の EAS Build ログを確認
npx eas build:list --platform android --limit 5
# → 最新ビルドの URL を開き、ログで "google-services.json" が見つかるか検索
```

または、ビルドされた AAB をダウンロードして展開し、`base.apk` 内の `assets` などに `google-services` 由来のリソースが含まれているか確認。

### 📋 復帰したらこの順で確認（5 分コース）

```
[ ] A. npx eas credentials で FCM V1 Service Account Key が登録されているか
        → 未登録 → これがほぼ確定。Firebase から service account JSON 取得 → アップロード
        → 登録済み → 次へ
[ ] B. Google Play Console → アプリの署名 → SHA-1 をコピー
       → Firebase Console → アプリ設定 → SHA-1 一覧に含まれているか
        → 含まれていなければ Firebase に追加 → 新しい google-services.json をダウンロード
        → google-services.json 差替 + eas build:prod で再ビルド + 再リリース
[ ] C. Expo Push Tool (https://expo.dev/notifications) で 0-1 で確認したトークンに直接送信
        → 届く → backend のトリガー側（section 4 の旧レポート参照）
        → 届かない・DeviceNotRegistered → A or B が原因
        → InvalidCredentials → A が原因確定
```

### 🎯 一番怪しい場所のまとめ

「`adb install` 時代に動いていて、EAS + Play Store 配信になってから止まった」 = **「Play App Signing で署名鍵が変わった」**または**「FCM Legacy → V1 移行が EAS credentials 側で完了していない」** のどちらか。

A → B → C の順で 5 分以内に切り分けられる。

詳細な原因網羅は以下に続けて残してあるが、上記 3 つを先に潰すのが最短。

---

## 0. まず最初にやること（5 分で原因 8 割切り分け）

順番に実行。途中で原因が確定したら以降は不要。

### 0-1. Supabase の `UserPushToken` テーブルに自分の行があるか

```sql
select id, user_id, expo_push_token, platform, created_at
from "UserPushToken"
where user_id = '<自分のuser_id>'
order by created_at desc;
```

- **行が無い** → 「3. クライアント側のトークン登録系」が壊れている。Expo Push Service には届かない。
- **行はあるが古い** → 一度ログアウトしてトークン削除されたあと再ログインしていない。後述「3-5」。
- **行があり expo_push_token が `ExponentPushToken[xxx]` 形式で 30 字以上** → 登録は成功している。「2. Expo→APNs/FCM 配信レイヤー」か「1. デバイス設定」を疑う。

### 0-2. Expo Push Tool で直接トークンに送信して届くか

`https://expo.dev/notifications` を開き、上で取得した `ExponentPushToken[xxx]` を貼り、適当な Title / Body で Send a Notification。

| 結果 | 意味 |
|---|---|
| 届く | クライアント・APNs/FCM 配信は OK。バックエンドの送信トリガー（=セクション 4）が原因。 |
| 届かない・`DeviceNotRegistered` | APNs/FCM クレデンシャル or デバイス側通知許可（セクション 1, 2）が原因。 |
| 届かない・`MessageRateExceeded` | 単発テストではほぼ起きない。連投時のみ。 |
| `InvalidCredentials` | EAS / Expo に APNs Key（iOS）または FCM Server Key（Android）が登録されていない。最有力候補。 |

### 0-3. iOS 設定 → AikiNote → 通知 を実機で開く

- 「通知の許可」が ON
- 「サウンド」「バナースタイル」「ロック画面」「通知センター」がそれぞれ ON
- 「通知のグループ化」「集中モードフィルタ」で抑制されていないか
- 「プレビューを表示」が「常に」または「ロックされていない時」

iOS は許可ダイアログで「許可」を押した後でも、これらのサブ項目が OFF だと**バナーが見えないだけで通知自体は届いている**ことがある（通知センターを下スワイプして確認）。

### 0-4. iOS の集中モード / おやすみモード

これで抑制されているケースが多い。コントロールセンターから一旦 OFF にして再テスト。

### 0-5. Cloudflare Workers のログを確認

```bash
cd /Users/tomoyakonos/projects/aikinote/backend
npx wrangler tail
```

その状態で別端末からお気に入り or 返信を実行 → `[Push]` 接頭辞のログを確認。

- `[Push] Expo Push API エラー: 4xx ...` → APNs/FCM クレデンシャル未登録 or トークン無効
- ログが何も出ない → `sendPushToUser` が呼ばれていない（=セクション 4）
- `トークン取得エラー` → `UserPushToken` テーブルが読めていない（RLS / Service Role Key）

---

## 1. デバイス設定・OS 側の抑制（最頻出）

### 1-1. iOS「通知の許可」の各サブ項目が OFF
セクション 0-3 と同じ。**「許可をタップした」だけでは音/バナー/バッジの個別 ON/OFF までは保証されない**。

### 1-2. iOS 集中モード（フォーカス / おやすみモード）
コントロールセンターから OFF にして再現確認。

### 1-3. Android「通知」「サイレント通知チャンネル」
Android: 設定 → アプリ → AikiNote → 通知 → `default` チャンネル。
- チャンネルの「動作」が「サイレント」になっていないか
- 「通知のサウンド」が無音になっていないか
- アプリ全体の通知が ON になっているか

### 1-4. Android 13+ の `POST_NOTIFICATIONS` 権限
Android 13 以降は通知表示のためにランタイム権限が別途必要。`expo-notifications` 55 系は許可リクエストでこれを含むはずだが、**通知チャンネルが作成される前に getExpoPushTokenAsync を呼ぶと、トークンは取れるが通知が表示されない**ことがある（公式ドキュメント記載）。

実装は `app/_layout.tsx:113` で `setupNotificationChannel()` を `useEffect` 内で呼んでいるが `await` していない。`app/index.tsx:579` の `registerForPushNotifications()` は USER_INFO 受信時。順序的には十分先だが、ごく稀にレースする可能性は残る。

切り分け: 設定 → AikiNote → 通知 → `default` チャンネルが存在しているか確認。無ければチャンネル作成が走っていない。

### 1-5. ネットワーク接続
APNs/FCM はデバイス側で常時接続が必要。機内モード・キャリア通信制限・社内 Wi-Fi のファイアウォール（5223/tcp APNs, 5228-5230/tcp FCM）で塞がれているケース。Wi-Fi を切ってモバイル回線で再テストすると切り分けられる。

---

## 2. APNs / FCM 配信レイヤー（最重要・通知が届かない原因の本命候補）

このセクションは EAS / Expo / Apple Developer Console の設定が絡むので、コードからは確認できない。**復帰したら必ず確認すべき**部分。

### 2-1. Expo に APNs Key (.p8) が登録されていない
TestFlight / 本番ビルド経由で APNs に届けるには、**Expo Push Service が APNs にサーバー間で投げるための APNs Key** を Expo / EAS のクレデンシャル管理に登録しておく必要がある。

確認:
```bash
cd /Users/tomoyakonos/projects/aikinote-native-app
npx eas credentials
# → iOS → production → Push Notifications を選択
# → "Push Key" として .p8 が登録されているか確認
```

未登録だと、Expo Push API は `ok` を返すが APNs に届かず、Push Receipts API で `DeviceNotRegistered` または `InvalidCredentials` が返る。**症状「許可は出たけど通知だけ届かない」とほぼ完全一致**。

対処: Apple Developer Account → Certificates, Identifiers & Profiles → Keys → 「+」 → APNs にチェック → Download → EAS にアップロード。

### 2-2. Apple Developer Console で Push Notifications capability が無効
`com.aikinote` の App ID で Push Notifications capability が手動有効化されていない場合、APNs 自体が token を発行しない（ただし通常は許可ダイアログさえ正常に出ない＝今回の症状とは合わない可能性大）。

確認: https://developer.apple.com/account/resources/identifiers/bundleId/edit/ → `com.aikinote` → Capabilities → Push Notifications にチェックがあるか。

`development-guide.md` の「iOS Capability の手動運用」節にあるように、`EXPO_NO_CAPABILITY_SYNC=1` で auto sync を無効化しているので、**手動有効化が必須**。

### 2-3. iOS の `aps-environment` が development のまま
公式ドキュメント: 「iOS APNs entitlement は _always_ development に設定され、Xcode がリリースビルド時に自動で production に書き換える」。

ローカル `expo run:ios` のビルドや TestFlight 版で稀に entitlement が development のまま APNs production サーバーに行こうとしてミスマッチを起こすことがある。

確認: ビルド済み .ipa を解凍 → `embedded.mobileprovision` を text 化 → `aps-environment` が `production` か。あるいは EAS Build のログで `aps-environment` が production になっていることを確認。

### 2-4. Android の FCM サーバーキーが Expo に登録されていない
FCM V1 API ではサービスアカウント JSON キーが必要。

確認:
```bash
npx eas credentials
# → Android → production → FCM V1 を選択
# → "FCM V1 service account key" が登録されているか
```

`google-services.json` はクライアント設定。Expo Push Service が FCM サーバーに投げるためのサーバー側クレデンシャルは別物。

### 2-5. `google-services.json` の package name 不一致
`app.json` の `android.package` は `com.aikinote`。`google-services.json` の `client.client_info.android_client_info.package_name` も `com.aikinote` で一致しているか確認。

```bash
cat /Users/tomoyakonos/projects/aikinote-native-app/google-services.json | grep -A 1 package_name
```

### 2-6. Firebase コンソールで FCM API が有効化されていない
Firebase コンソール → プロジェクト設定 → Cloud Messaging → 「Firebase Cloud Messaging API (V1)」が有効、かつ「Cloud Messaging API (Legacy)」は使用しない。

### 2-7. EAS Build profile で適切なクレデンシャルが選択されていない
ユーザーが今インストールしているのが `development` / `preview` / `production` のどのビルドか不明。`development` ビルドだと APNs sandbox 環境を使うので、production の APNs Key とミスマッチを起こす。

確認: TestFlight 経由でインストールしたなら `production`、`eas build --profile preview` を internal distribute して入れたなら `preview`。今回が「実機にインストール」とあるので、TestFlight or `eas build --profile preview` が濃厚。

---

## 3. クライアント側のトークン取得・登録系

### 3-1. `expo-notifications` バージョンと Expo SDK の不整合
インストール状況:
- `expo`: 54.0.33
- `expo-notifications`: 55.0.14

`expo-notifications` v55 が Expo SDK 54 で動作するか公式から明示は見つからなかったが、Expo は通常 `npx expo install expo-notifications` で SDK 互換版を入れる仕組み。

確認:
```bash
cd /Users/tomoyakonos/projects/aikinote-native-app
npx expo-doctor
# Expected SDK version vs installed のミスマッチが出るかチェック
npx expo install --check
```

ミスマッチがあれば `npx expo install expo-notifications` で SDK 54 互換版に揃える。

### 3-2. `getExpoPushTokenAsync` が例外を投げている（症状と最一致の可能性）
`lib/push-notifications.ts:50` で:
```ts
const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
```
`projectId` が一致しない / Expo にプロジェクトが存在しない / オフライン時は例外を投げる。`registerForPushNotifications()` 全体が try/catch で囲まれていないので、**例外時は呼び出し側 `app/index.tsx:579` で `.then` の値が来ず終わる**（`pushTokenRegisteredRef.current = true` だけ立った状態でリトライ無し）。

確認:
- USB デバッグで Safari Web Inspector（iOS）または Chrome DevTools（Android）→ console を見て `[Push]` ログ＋例外の有無
- ハードコード値 `7a166659-243a-4fad-b661-beb68e29a1a6` が `app.json` の `extra.eas.projectId` と一致 → 一致している（OK）
- Expo の対象プロジェクト owner が `tomoya-sonok` で正しいか https://expo.dev/accounts/tomoya-sonok/projects で確認

対処（堅牢化）: `lib/push-notifications.ts` 全体を try/catch で包んで失敗時にログを残す。`pushTokenRegisteredRef` を「成功した時だけ true」にすると、次回 USER_INFO で再試行できる。

### 3-3. Cookie 認証が効かず `/api/push-tokens` プロキシが 401
`frontend/src/app/api/push-tokens/route.ts` → `proxyToBackend` → `createBackendAuthToken()` は `getServerSupabase().auth.getUser()` で Cookie からセッション復元。
WebView 起動直後は Cookie が同期前の可能性。ただし `USER_INFO` payload が来た時点ではすでに認証済み（USER_INFO は `useAuth` の user 取得後に投げられる）。

確認: USB デバッグで WebView の console / Network → `/api/push-tokens` POST のステータス。
- 200 なら登録 OK
- 401 → Cookie が無い / Service Worker キャッシュ / SameSite 問題
- 500 → JWT_SECRET 不一致 / Hono backend エラー

### 3-4. `pushTokenRegisteredRef.current` が登録失敗時も true になる
`app/index.tsx:577-595`:
```tsx
if (userId && !pushTokenRegisteredRef.current) {
  pushTokenRegisteredRef.current = true;  // ← 呼ぶ「前」に true
  registerForPushNotifications().then((pushToken) => {
    if (pushToken) {
      pushTokenRef.current = pushToken;
      webView.executeScript(`fetch('/api/push-tokens', ...).catch(...)`);
    }
  });
}
```

問題:
1. `registerForPushNotifications` が `null` を返したとき（≒ 許可拒否 / 例外）でもフラグは true になる → 同セッション中はリトライされない
2. WebView 内 `fetch` の結果が成功か失敗かを native 側に送り返していない → 401/500 で握り潰されてもリトライされない

これが今回の症状とは直接関係しないが、一度失敗したら次回起動するまで治らない構造なので、現象が散発する。

### 3-5. ログアウト→再ログインで前のトークンが残る
`app/index.tsx:498-510` でログアウト検知時にトークン削除を投げているが:
- WebView 内 `fetch` の DELETE は `.catch(function(e) {})` で握りつぶし
- DELETE 成功確認なしで `pushTokenRegisteredRef.current = false` にしている
- ネットワーク不調でログアウト時に DELETE が失敗すると、Supabase に古いトークンが残る → そのトークンが他端末に紐付いていないか確認

### 3-6. シミュレーターで実行している
`Device.isDevice` が false ならスキップ。今回ユーザーは「実機」と言っているので関係なし。ただし、iOS Simulator 経由で起動したアプリを実機で動かしているわけではないか念のため確認。

### 3-7. `__AIKINOTE_NATIVE_APP__` フラグが立っていない
WebView の `injectedJavaScriptBeforeContentLoaded` で `window.__AIKINOTE_NATIVE_APP__ = true` を立てているが、Web 版が hydration 失敗するとそのまま無視される。

`useAuth.tsx:221` の USER_INFO 送信は `__AIKINOTE_NATIVE_APP__ && ReactNativeWebView` 両方が必要。**hydration 失敗 = USER_INFO が送信されない = ネイティブ側が `userId` を取得できない = `registerForPushNotifications` が呼ばれない**。

確認: ネイティブヘッダー（DefaultHeader / SocialFeedNativeHeader）が表示されているか。表示されていれば USER_INFO は届いている。表示されていない（Web 版ヘッダーが出ている）なら hydration 失敗の可能性。

### 3-8. iOS 16.3 以下のデバイスで起動している
`development-guide.md` 「iOS 最低 OS バージョンを 16.4 に設定している理由」節：iOS 16.3 以下では Next.js 16 ランタイムが SyntaxError でロード失敗 → React hydration が走らず → USER_INFO 送信されず → トークン登録されない。

確認: 設定 → 一般 → 情報 → iOS バージョン。

---

## 4. バックエンドの送信トリガー

### 4-1. テスト動作が「自分で自分に通知」になっている
`backend/src/lib/push-notification.ts:95`:
```ts
if (recipientUserId === payload.actorUserId) return;
```

**自分で自分の投稿にお気に入り / 自分の投稿に自分で返信しても通知は飛ばない仕様**。テスト時は「別アカウント」から自分の投稿にアクションしないと通知は来ない。

確認: 別端末・別アカウントで自分の投稿にお気に入り or 返信。

### 4-2. `UserNotificationPreference` で全 OFF にしている
通知設定 UI で `notify_favorite` 等を全部 OFF にすると `push-notification.ts:107-114` でスキップ。

確認:
```sql
select * from "UserNotificationPreference" where user_id = '<自分の user_id>';
```
レコード無し or 全 true なら問題なし。

### 4-3. プッシュ送信は本体処理を止めない（fire-and-forget）
`push-notification.ts` 全体 try/catch だが `await` はしている。**呼び出し側で `await` していないと例外が握り潰される**。

```ts
// social-favorites/index.ts:88
await sendPushToUser(supabase, post.user_id, {...});  // await 有り
```

`await` はしているので、本体処理ブロック後にプッシュ送信が走る。問題なし。

### 4-4. Cloudflare Workers の Subrequest 制限
Workers 無料枠は 50 subrequest/request 制限。`exp.host` への外部 fetch が含まれる。お気に入り 1 回で `Notification` insert + ユーザー fetch + token fetch + Expo POST + posts 再取得。通常の流れなら制限に当たらないはず。

確認: Workers ログで「too many subrequests」が出ていないか。

### 4-5. `[Push] Expo Push API エラー` がログに出ていないか
`push-notification.ts:42` で response.ok でなければ console.error。Workers ログで確認すれば即わかる。

---

## 5. 環境・ビルド設定

### 5-1. 接続している Web 版環境のミスマッチ
`constants/config.ts:16`:
```ts
return __DEV__ ? getDevBaseUrl() : "https://www.aikinote.com";
```

**実機にインストールしたビルドが `__DEV__: true` だと `localhost:3000` を見に行く** → Web 版に接続できない → 認証もできない。`pnpm build:dev` で作ったビルドはこれに該当。

確認: 実機の WebView が表示している URL を画面下のスワイプ等で確認できないが、起動時にスプラッシュから動かない or ローカルホストエラーが出るならこれ。

`pnpm build:preview` / `pnpm build:prod` で作ったビルドは `__DEV__: false` なので `https://www.aikinote.com` を見にいく。

### 5-2. `EXPO_PUBLIC_WEB_URL` が間違っている
production ビルドで `EXPO_PUBLIC_WEB_URL` を渡してしまっていると、その URL を見にいく。EAS env の設定を確認。

```bash
npx eas env:list --environment production
```

### 5-3. プロジェクト ID とアカウントの紐付け
`registerForPushNotifications` の projectId `7a166659-243a-4fad-b661-beb68e29a1a6` が、Expo アカウント `tomoya-sonok` の正しいプロジェクトに紐付いているか。

```bash
npx eas project:info
```

---

## 6. テスト手順（復帰後にこの順で）

```
[ ] 0-1. Supabase で UserPushToken に行があるか
       → 無ければ section 3 へ
       → あれば次へ
[ ] 0-2. Expo Push Tool で直接送信テスト
       → 届かない → section 2 (APNs/FCM credentials)
       → 届く → section 4 (バックエンドのトリガー側)
[ ] 0-3. iOS 設定 → AikiNote → 通知 でサブ項目を確認
[ ] 0-4. 集中モードを OFF にして再テスト
[ ] 0-5. wrangler tail で backend ログ確認しながら別アカウントから自分の投稿にお気に入り
       → [Push] エラーログ有り → 4-5 / 2 系
       → ログ無し → 4-1 (自分→自分でテストしている)
[ ] 1-4. Android なら通知チャンネル `default` の存在確認
[ ] 2-1. eas credentials で APNs Key 登録確認
[ ] 2-4. eas credentials で FCM V1 Service Account 登録確認
[ ] 3-1. expo-doctor で SDK ミスマッチ確認
[ ] 3-2. USB デバッグで [Push] ログと例外を確認
```

---

## 7. もっとも疑わしいシナリオ Top 3

実装コードを見る限り、論理ミスは見当たらないので、**外部設定（APNs/FCM クレデンシャル）が最も疑わしい**:

1. **Expo に APNs Key (.p8) が未登録 / FCM V1 サービスアカウント未登録**（症状ど真ん中: 許可は出るが通知が届かない、Expo Push Tool でも届かない）
2. **iOS 設定でサブ通知項目が OFF / 集中モード**（最頻出のしょうもない原因）
3. **ユーザーが「自分→自分」でテストしている**（仕様で skip される）

これらが全部白なら、セクション 3 の「クライアント側で例外が握り潰されている」を疑い、USB デバッグで実機ログを取る。

---

## 8. 改善提案（原因確定後の予防策）

短期的に痛みが少ない順に:

1. **`registerForPushNotifications` 全体を try/catch で包み、失敗時にログを残す + フラグを成功時のみ true にする**（`pushTokenRegisteredRef`）。今は失敗が静かに飲み込まれている。
2. **WebView 内 fetch の結果を native 側に postMessage で返し、登録の成否をログ可視化する**。今は `.catch(function(e) {})` で握りつぶし。
3. **EAS credentials の登録状況を `docs/development-guide.md` の「本番リリース時の注意事項」に明記**（APNs Key / FCM V1 の事前確認チェックリスト化）。
4. **`/api/push-tokens` POST の失敗時に Supabase に行が残らないシナリオを retry できるよう、起動時に毎回トークン照合する**（=登録済みトークンと現在のトークンを比較し、ずれていれば再登録）。
