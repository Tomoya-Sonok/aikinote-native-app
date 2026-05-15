# App Store 再提出ノート (Build 26 — クラッシュリジェクト対応)

## 背景

Build 25 (Version 1.0 build 25) は 2026-05-09 に再提出して 2026-05-11 に審査されたが、**別件のクラッシュ** でリジェクトされた。

| 項目 | 値 |
|---|---|
| Submission ID | `2da8a8db-0493-4290-bb79-043514e3324e` |
| Review date | 2026-05-11 |
| Guideline | **2.1(a) Performance** — app crash |
| 再現手順 | (1) ページ作成 or プロフィール画像編集 → (2) 写真を撮影 |
| Review Device | iPad Air 11" M3 (iPadOS 26.4.2) + iPhone 17 Pro Max (iOS 26.4.2) |

Build 24 で受けた 3 件のガイドライン (5.1.2 / 1.2 / 2.3.2) は Build 25 で対応済み・引き継ぎ。**Build 26 ではクラッシュのみを追加修正**する。

---

## 原因分析

aikinote-native-app は Expo WebView ラッパー。カメラ起動はすべて WebView 内の `<input type="file" accept="image/*..." capture>` 経由だが、iOS は WebView 経由でも内部的に `UIImagePickerController` / `PHPickerViewController` を起動する。

`app.json` の `ios.infoPlist` には `ITSAppUsesNonExemptEncryption` のみで、**カメラ／写真ライブラリ／マイクの usage description が一切宣言されていなかった**。iOS は必要な description が無いままカメラを要求すると **TCC が SIGABRT を発生させてアプリを即殺す**。これがクラッシュの根本原因。

副因として、プロフィール画像編集の `<input accept="image/*">` で HEIC が選択可能になっており、Canvas API ベースの圧縮処理 (`compressImage.ts` / `cropImage.ts`) では HEIC を decode できないため、二次的なクラッシュ経路を抱えていた。

---

## Build 26 で実施した修正

### 1. `app.json` の `ios.infoPlist` に 3 つの description を追加（主因）

リポジトリ PR: [aikinote-native-app#3](https://github.com/Tomoya-Sonok/aikinote-native-app/pull/3) (commit `aa5c0b8`)

```json
"infoPlist": {
  "ITSAppUsesNonExemptEncryption": false,
  "NSCameraUsageDescription": "プロフィール画像や稽古記録の写真・動画を撮影するために使用します。",
  "NSPhotoLibraryUsageDescription": "プロフィール画像や稽古記録に添付する写真・動画を選択するために使用します。",
  "NSMicrophoneUsageDescription": "稽古記録に添付する動画を撮影する際に音声を録音するために使用します。"
}
```

`NSPhotoLibraryAddUsageDescription`（フォトライブラリへの保存）は本アプリに保存機能がないため追加していない。

### 2. プロフィール画像 input の `accept` を明示形式に絞る（副因の予防）

Web 版リポジトリ PR: [aikinote#302](https://github.com/Tomoya-Sonok/aikinote/pull/302)

`accept="image/*"` → `accept="image/jpeg,image/jpg,image/png,image/webp"` に変更。HEIC が選択肢に現れなくなり、Canvas クラッシュを防止。

---

## App Review Information → Notes 英文（Build 26 用、本審査）

App Store Connect の **App Review Information → Notes** に貼り付ける。Build 25 の Notes を踏襲しつつ、冒頭にクラッシュ対応を追加。

```
This build (1.0 build 26) addresses the crash issue identified during the
previous review (Submission ID 2da8a8db-0493-4290-bb79-043514e3324e,
reviewed 2026-05-11, Guideline 2.1(a) Performance).

================================================================
Crash fix (Guideline 2.1(a)) — addressed in Build 26
================================================================

The previous build (1.0 build 25) crashed when reviewers tapped "Take Photo"
during page creation or profile-image editing.

Root cause: AikiNote is a WebView-based hybrid app where camera invocation
flows through an in-page <input type="file" capture> element. iOS still
instantiates UIImagePickerController/PHPickerViewController under the hood,
and our Info.plist (generated from app.json) was missing the required
privacy usage description keys. iOS therefore terminated the app via SIGABRT
the moment camera access was requested.

Fix applied in Build 26:

  1. app.json (ios.infoPlist) now declares all three required keys:
       - NSCameraUsageDescription
       - NSPhotoLibraryUsageDescription
       - NSMicrophoneUsageDescription
     (Microphone is required because the page-creation form also accepts
      video uploads, which would invoke the system audio recorder.)

  2. The profile-image picker on the web side now accepts only
     image/jpeg, image/jpg, image/png, image/webp (HEIC excluded), to
     prevent a secondary crash path through Canvas decode failure.

Both changes are merged to main and included in this build. Crash logs from
the previous submission have been reviewed; the stack pointed to the TCC
framework as expected.

================================================================
Previous rejection items (Guideline 1.2 / 5.1.2(i) / 2.3.2) — unchanged
================================================================

All three items from the earlier rejection (Submission ID
f300c052-7832-42ca-a9fa-f0fa64efeafb, reviewed 2026-05-05) remain addressed
exactly as described in the previous resubmission notes. Summary:

  1.2 (User-Generated Content):
      EULA gating, NG-word filter (HTTP 400 + matched word echoed),
      report mechanism on every post/reply (5 reasons + 500-char detail),
      user blocking (server-side bidirectional filter via UserBlock table),
      24-hour ops response via email notification to support@aikinote.com.

  5.1.2(i) (Privacy):
      App Privacy declarations in App Store Connect have been corrected.
      We do not track users across other apps/sites, and ATT is not
      required because no tracking takes place.

  2.3.2 (Accurate Metadata):
      Each IAP product (monthly / yearly) has a unique promotional image.

================================================================
Demo account
================================================================

  Email:    apple-reviewer@aikinote.com
  Password: (see Sign-In Information field above)

To verify the crash is gone:
  1. Sign in with the demo account.
  2. Open "Edit profile" from My Page → tap the profile-image area →
     "Take Photo". On Build 25 this crashed instantly; on Build 26 the
     iOS camera permission prompt appears (in Japanese) instead.
  3. Create a new page (Solo → New) → attach photo → "Take Photo".
     Same expected behavior: permission prompt, no crash.
  4. The remaining UGC / privacy / metadata flows are unchanged from the
     previous re-submission notes (kebab menu Report, Block this user,
     Settings → Blocked Users, NG-word rejection).

Please reach out via this Notes field if any additional information is
needed. Thank you again for the careful review.
```

---

## TestFlight Beta App Review (External) 用の簡略版

```
Build 1.0 (26) addresses the crash issue identified in review of build 25
(Submission 2da8a8db..., Guideline 2.1(a)).

Root cause: missing privacy usage description keys in Info.plist caused
iOS to SIGABRT the moment camera access was requested through the in-app
WebView. Build 26 adds NSCameraUsageDescription, NSPhotoLibraryUsageDescription
and NSMicrophoneUsageDescription, and tightens the profile-image picker's
accept attribute to exclude HEIC.

All UGC / privacy / metadata fixes from the prior re-submission are
unchanged. Demo account: apple-reviewer@aikinote.com (password in
Sign-In Information).
```

---

## ビルド & 提出コマンド

```bash
cd /Users/tomoyakonos/projects/aikinote-native-app

# Build 26 (autoIncrement で 25 → 26)
EXPO_NO_CAPABILITY_SYNC=1 npx eas-cli build --profile production --platform ios --non-interactive

# Submit (eas.json の production プロファイルに ascAppId 設定済みなので非対話で OK)
npx eas-cli submit --platform ios --profile production --latest --non-interactive
```

---

## 提出時のチェックリスト

- [ ] EAS Build #26 が完了して `.ipa` が生成されている
- [ ] `eas submit` で App Store Connect への Processing が完了している（10〜30 分）
- [ ] App Store Connect の Build 一覧で `1.0 (26)` が選択可能になっている
- [ ] Submit する Version を `1.0` の Build 26 に差し替え（差分作業）
- [ ] **App Review Information → Notes** に本ドキュメントの英文 Notes をコピペ
- [ ] Sign-In Information の Email/Password が `apple-reviewer@aikinote.com` の最新値
- [ ] スクリーン録画は今回は **任意**（Build 25 の録画があれば流用可能、なくても Notes だけで十分通る見込み）
- [ ] Demo アカウントの状態クリーンアップは原則不要（クラッシュ修正の確認だけなので、通報・ブロック履歴があっても影響しない）
- [ ] 「Submit for Review」を実行

---

## 関連リポジトリ・コミット

- `aikinote-native-app`: PR #3 (commit `aa5c0b8`) — `app.json` の Info.plist 追加
- `aikinote` (Web): PR #302 — `ProfileEdit.tsx` の accept 属性絞り込み
- Build 25 提出ノート: [`app-store-resubmission-2026-05.md`](./app-store-resubmission-2026-05.md)
