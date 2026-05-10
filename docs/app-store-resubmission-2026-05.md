# App Store 再提出ノート (2026-05 リジェクト対応)

初回提出 (Submission ID `f300c052-7832-42ca-a9fa-f0fa64efeafb`、Review date 2026-05-05、Version 1.0 build 24) で受けた **3 件のガイドライン違反** への対応を完了し、新ビルドで再提出するためのドキュメント。

App Store Connect の **App Review Information → Notes** 欄、および TestFlight 外部審査の **Test Information → Review Notes** 欄に貼り付ける英文テンプレート + 補足を提供する。スクリーン録画は別途撮影し、Notes フィールドに添付する。

---

## リジェクトされた 3 件と対応サマリー

| # | Guideline | 内容 | 対応 |
|---|---|---|---|
| 1 | **5.1.2(i) Privacy** | App Privacy 申告で 5 項目が "Used to Track You" と申告されているのに ATT 未実装 | App Store Connect の App Privacy 申告から Tracking フラグを除外（ATT 実装は不要、実態として Tracking していない） |
| 2 | **1.2 Safety – User-Generated Content** | UGC アプリに必要な要件が一部不足 | EULA 同意 (既存) ✅ / 投稿通報導線 ✅ / NG ワードフィルタの拒否化 ✅ / ユーザーブロック機能 ✅ / 24h 対応の運用通知 ✅ |
| 3 | **2.3.2 Performance – Accurate Metadata** | IAP プロモーション画像が複数商品で重複 | App Store Connect の各 IAP プロダクトに固有のプロモーション画像をアップロード |

詳細実装は本リポジトリ + Web 版リポジトリ (`/Users/tomoyakonos/projects/aikinote`) にてマージ済み。関連 PR: #293, #294, #295, #296, #297, #298。

---

## App Review Information → Notes (英文テンプレ、本審査用)

App Store Connect の **App Review Information → Notes** に貼り付ける英文。本ビルドは初回リジェクトを受けての再提出版である旨を冒頭で明示する。

```
This is a re-submission addressing all three rejection items from the previous
review (Submission ID f300c052-7832-42ca-a9fa-f0fa64efeafb, reviewed on
2026-05-05). A screen recording demonstrating the new EULA, report, and
block flows is attached at the bottom of this Notes field.

================================================================
1. Guideline 1.2 (User-Generated Content) — addressed
================================================================

(a) EULA / Terms agreement gating
The sign-up screen now forces users to accept Terms of Service and Privacy
Policy before any sign-up button (Sign in with Apple / Sign in with Google /
Email + Password) becomes enabled. The Apple/Google buttons are visually
disabled until the agreement checkbox is ticked. Native onboarding routes
through this same web-based sign-up flow inside the WebView.

  Terms of Service: https://www.aikinote.com/en/terms
  Privacy Policy:   https://www.aikinote.com/en/privacy

The Terms of Service explicitly prohibit objectionable content and abusive
behavior (Article 4, items 12 and 14: prohibition of obscene, excessively
violent, or otherwise unpleasant content, and any conduct deemed inappropriate
by the operator).

(b) Objectionable content filter
A server-side NG-word filter blocks post and reply creation when prohibited
terms (English profanities and Japanese harassment terms) are detected.
The server returns HTTP 400 with code "NG_WORD" and the matched word is
echoed back in the error message so users understand what to remove.

(c) Reporting mechanism
Every post and every reply has a flag/report option in the kebab (...) menu,
accessible from:
  - the home feed (SocialPostCard)
  - the post detail screen
  - the user profile page
  - the reply list inside any post detail
Five reasons are available (spam / harassment / inappropriate / impersonation
/ other) plus an optional 500-character free-form detail. Reports persist in
the PostReport table and trigger an immediate email notification (see (e)).

(d) User blocking
Users can block any other user from three locations:
  - kebab menu on a post card
  - kebab menu on a reply
  - "..." menu on a user's profile page (under "Block this user")
Once blocked, posts and replies from the blocked user are server-side
filtered out of the feed (the get_social_feed SQL function joins UserBlock
bidirectionally), and the blocked user's profile page no longer shows their
posts (replaced with a "You have blocked this user" placeholder). The
filtering is bidirectional, so a user that blocks you also disappears from
your view automatically.
A blocked-users list is manageable from Settings → Blocked Users, where each
entry can be unblocked with a confirmation dialog.

(e) 24-hour response commitment
Operations team receives a real-time email notification (sent via Resend to
support@aikinote.com) on every report. The email contains the report ID,
reason, optional detail, reporter username, target username, the URL of the
reported content, and a content excerpt.

Upon receiving a notification, the operations team reviews the reported
content and, if it violates our guidelines, marks the post or reply as
deleted (`is_deleted = true`) and updates the report status to `resolved`
in the PostReport table via Supabase Studio. Targeted resolution time is
within 24 hours of report receipt.

The operational procedure is documented at /docs/incident-response.md
in our repository.

================================================================
2. Guideline 5.1.2(i) (Privacy) — addressed
================================================================

We have updated our App Privacy declarations in App Store Connect.

We do NOT track users across other companies' apps and websites, and we do
NOT share data with third parties for advertising. The previous declaration
that the listed data types were "Used for Tracking" was an error in our
App Store Connect setup. The data types in question (Purchase History,
User ID, Other User Content, Email Address, Product Interaction) are
collected solely for App Functionality, Analytics (aggregate only via
self-hosted Umami — no third-party SDK), and Product Personalization.

ATT (App Tracking Transparency) is not required because no tracking
(as defined by AppTrackingTransparency) takes place.

================================================================
3. Guideline 2.3.2 (Accurate Metadata) — addressed
================================================================

Each in-app purchase product (aikinote_premium_monthly /
aikinote_premium_yearly) now has a unique promotional image distinguishing
the subscription tiers. Duplicate images have been removed.

================================================================
Demo account for review
================================================================

  Email:    apple-reviewer@aikinote.com
  Password: (see Sign-In Information field above)

Sign in with Apple / Sign in with Google also work, but the email account
is provided so reviewers can sign in without their personal Apple ID.

To verify the new flows quickly:
  1. Open the app, sign in with the demo account.
  2. Tap the bell icon (or any post in the "Together" feed). On any post by
     another user, tap the kebab menu — you will see "Report" and
     "Block this user".
  3. Tap "Report" → choose any reason → submit. A success toast appears.
     (An email is dispatched to support@aikinote.com in the background.)
  4. Tap the kebab again on a post → "Block this user" → confirm. The
     post is removed from the feed, and so are all other posts by that
     user (server-side bidirectional filtering).
  5. Settings → Blocked users to see and manage blocks.
  6. Try writing a post containing a prohibited word (e.g. "fuck"). The
     server rejects it with a Japanese error toast indicating the matched
     word.
  7. Sign-up flow: log out and tap "Sign up". Note that the Apple / Google
     buttons remain disabled until the Terms agreement checkbox is ticked.

================================================================
Existing native integrations (unchanged from initial submission)
================================================================

This app is a hybrid (WebView + native modules), not a simple WebView wrapper:
  - Native bottom tab bar (Solo / Together / My Page) and per-screen headers
    in React Native (Expo SDK 54)
  - Native OAuth (Sign in with Apple, Sign in with Google) via PKCE flow
    with @supabase/supabase-js outside the WebView
  - Push notifications via APNs through Expo Push Service
  - In-app purchases via RevenueCat with Apple StoreKit
  - Offline support via TanStack Query persistence

Please reach out via this Notes field if any further information is needed.
Thank you for the careful review.
```

---

## TestFlight Beta App Review → Test Information (External 用)

TestFlight 外部審査用にも同じ Notes を貼るのが基本だが、字数を抑えるため簡略版を用意。

```
This build addresses all three rejection items from the previous review
(Submission ID f300c052-7832-42ca-a9fa-f0fa64efeafb).

Highlights:
- New report flow: every post/reply has a kebab menu with "Report"
  (5 reasons + 500-char detail).
- New block flow: every post/reply/profile has "Block this user".
  Blocked users disappear bidirectionally from feed and profile views.
- NG-word filter now rejects prohibited content with HTTP 400.
- Operations team receives an email on every report (24h response SLA),
  documented at /docs/incident-response.md.
- App Privacy declarations corrected (no tracking; ATT not required).
- IAP promotional images are now unique per product.

Demo account:
  Email: apple-reviewer@aikinote.com
  Password: (see Sign-In Information field)

Native integrations are unchanged: native tabs/headers, Apple/Google OAuth,
APNs push, RevenueCat IAP, offline support.
```

---

## デモアカウントの準備チェック

再提出前に下記が満たされていることを確認:

- [ ] `apple-reviewer@aikinote.com` のアカウントが本番 Supabase 上に存在する
- [ ] パスワードが App Store Connect の Sign-In Information 欄に最新値で記載されている
- [ ] プロフィール（道場・段級位）が初期設定済みで、コミュニティ画面まで Reviewer がそのまま到達できる
- [ ] **既に通報したことのある投稿が無い状態** を作っておく（重複通報 409 を避ける）— 必要なら Supabase Studio で `PostReport` の該当行を削除
- [ ] **既にブロックしたユーザーが居ない状態** を作っておく — 必要なら `UserBlock` の該当行を削除
- [ ] 「みんなで」フィードに **複数ユーザーの投稿** が表示される状態（フィードが空だと通報・ブロックの動作確認ができない）

---

## スクリーン録画の構成（参考、ユーザー側で撮影）

60〜90 秒。英語字幕推奨。撮影後 `.mp4` を Notes 欄の "Attachment" として添付するか、Vimeo/YouTube 等にアップロードして URL を Notes に記載。

| 時間 | 内容 |
|---|---|
| 0:00–0:10 | Sign-up 画面で agreement チェック OFF → Apple/Google ボタンが disabled、ON → enabled |
| 0:10–0:25 | 「みんなで」フィードで他人の投稿の kebab → 「通報」 → 5 理由から選択 → submit → 成功 toast |
| 0:25–0:40 | 同フィードで他人の投稿 kebab → 「このユーザーをブロック」 → 確認 → 投稿がフィードから消える |
| 0:40–0:55 | 設定 → 「ブロック中のユーザー」 → リスト表示 → 「解除」ボタン → 元通り |
| 0:55–1:05 | 投稿フォームで NG ワード入力 → 投稿失敗エラートースト（マッチ語が表示される） |
| 1:05–1:15 | Terms / Privacy ページが App 内 (WebView) で表示できることを示す |

---

## ビルド & 提出コマンド

iOS production ビルドは EAS で remote build。完了後 `eas-cli submit` で App Store Connect に上げる。

```bash
cd /Users/tomoyakonos/projects/aikinote-native-app

# 1. ビルド (10〜15 分、buildNumber は autoIncrement で自動上昇)
EXPO_NO_CAPABILITY_SYNC=1 npx eas-cli build --profile production --platform ios

# 2. 提出 (App Store Connect の TestFlight に AAB/IPA をアップロード)
npx eas-cli submit --platform ios --profile production --latest --non-interactive
```

submit 後 ASC 側で TestFlight ビルドの処理 (Processing) が走り、10〜30 分で External Testing に流せる状態になる。

## 提出時のチェックリスト

- [ ] 本ドキュメントの英文 Notes を App Review Information → Notes に貼り付け
- [ ] スクリーン録画を Notes 欄の Attachment に添付（または URL を本文に追記）
- [ ] App Store Connect の App Privacy 申告から Tracking フラグを除外（Phase 0-1 で完了済み）
- [ ] IAP プロモーション画像を商品ごとに差し替え（Phase 0-2 で完了済み）
- [ ] Sign-In Information の Email/Password が `apple-reviewer@aikinote.com` の最新値
- [ ] デモアカウントで以下が動作することを実機で事前確認:
  - サインアップ画面の同意チェック ON/OFF
  - 投稿通報 → support@aikinote.com 着信
  - ユーザーブロック → フィードから即時消失
  - NG ワード入力 → 400 エラー
- [ ] 「Submit for Review」(本審査) または「Submit Build for Beta App Review」(External 配信) を実行
