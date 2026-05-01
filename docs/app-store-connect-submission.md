# App Store Connect 提出メタデータ草案 (iOS App Version 1.0)

App Store Connect の「iOS App → 1.0 Prepare for Submission」画面で求められる項目の記入案。`/projects/aikinote/docs/aikinote-product-overview.md` の内容に基づき、Apple App Store Review Guideline 4.2 (Minimum Functionality) 対策を意識した文面を用意している。

> **方針メモ**: 完全な WebView ラッパーは Guideline 4.2 でリジェクトされやすいため、AikiNote ネイティブアプリは現時点で以下のネイティブ機能を統合済み:
> - ネイティブヘッダー / タブバー
> - プッシュ通知 (APNs 経由、Expo Push Service)
> - IAP (RevenueCat 経由で Apple StoreKit 統合)
> - ネイティブ OAuth (Apple Sign In / Google Sign In)
> - オフライン閲覧対応 (TanStack Query 永続化)
>
> Notes for Reviewer ではこの点を明示してリジェクトリスクを下げる。

---

## ローカライズの仕組み

App Store Connect の「Prepare for Submission」画面は **言語ごとにタブが分かれており、各タブで独立に編集する** 仕組み。同じ Description フィールドに「日本語の下に英語を追記」するのではなく、画面右上の **Japanese ▾ ドロップダウン → "Add Language" → English** で英語ロケールを追加し、それぞれ別個に書き込む。

### ローカライズ **対象** フィールド (言語ごとに別入力)

- App Name (Bundle 内の名称とは別の、ストア表示名)
- Subtitle
- **Promotional Text**
- **Description**
- **Keywords**
- **Support URL** / **Marketing URL** (任意で言語別に向け先を変える)
- Previews and Screenshots (言語別の UI スクリーンショットを推奨)
- "What's New" (バージョン更新時のリリースノート)

### ローカライズ **非対象** フィールド (1 セットのみ)

- App Information (Bundle ID / Category / Content Rights)
- Pricing and Availability
- App Privacy (Privacy Nutrition Labels)
- Age Rating
- **App Review Information** (Sign-In / Contact / Notes for Reviewer) ← Apple 内部用、英語推奨
- **TestFlight → Test Information** (Beta App Description, Feedback Email 等)
- App Store Version Release

AikiNote は Web 版が ja/en 対応済みなので、**日本語 + 英語の両ロケール** を用意するのが自然。配信地域を「Japan のみ」スタートにする場合でも、英語ロケールを足しておけば後で配信地域を全世界に拡大したときに改めて埋め直す手間が省ける。

下記では各ローカライズ対象フィールドの **日本語 (Japanese) / 英語 (English)** をそれぞれ提示する。

---

## Previews and Screenshots

iPhone 6.5" Display 用に以下のスクリーンショットを用意 (1242×2688 px、最低 3 枚、最大 10 枚):

1. ホーム / 「ひとりで」タブのページ一覧画面 (タグ・日付絞り込み・FAB を含む)
2. ページ作成画面 (タグ選択・タイトルテンプレート・本文)
3. ページ詳細画面 (添付画像 / 動画 含む)
4. 「みんなで」タブの投稿フィード (3 タブ切り替え)
5. 投稿作成画面 (ハッシュタグ入力)
6. カレンダー画面 (◯ マーク・月別の稽古参加状況)
7. 統計データ画面 (タグ別練習傾向グラフ)
8. マイページ / プロフィール画面
9. 設定画面 (文字サイズ・言語切り替え)
10. Premium プラン購入画面 (オプション)

iPad / Apple Watch スクリーンショットは AikiNote では不要 (`supportsTablet: true` だが iPad 専用 UI はないので、iPad 用は iPhone 用を流用 OK)。

> **生成方法**: iPhone 17 Pro Simulator でスクショを撮り、6.5" 用解像度 (1242×2688 px) にリサイズ。iOS 18 以降は 6.7" 用 (1290×2796 px) も追加すると審査がスムーズ。

> **ローカライズ**: スクショもロケール別に登録できる。ベストプラクティスは日本語ロケール用に Web 版の言語設定を「日本語」にした状態で撮ったスクショ、英語ロケール用に「English」にした状態で撮ったスクショをそれぞれ登録すること。手間を抑えたい場合、英語ロケールに日本語ロケール用のスクショを流用しても審査は通る (Apple は文言が画像内で英語化されていることまでは強制しない)。だが本提出のクオリティを上げるなら言語別に撮り直すのが理想。

---

## Promotional Text (170 字以内)

App Store の最上部に表示。アプリのアップデート無しでいつでも変更可能なので、新機能告知やキャンペーンに使う。

### 日本語 (Japanese ロケール)

```
「稽古の学びを、取りこぼさない。」合気道に特化したデジタル稽古日誌。タグやテンプレートで素早く記録、検索やカレンダーで振り返り、コミュニティで他の合気道家と学びを共有できます。
```

(98 字 / 170 字)

### 英語 (English ロケール)

```
A digital training journal designed for aikido practitioners. Record practice notes quickly with tags and templates, look back via search and calendar, and share insights with practitioners worldwide.
```

(202 chars... 少し超えるので短縮版 ↓)

```
A digital training journal for aikido. Record practice notes with tags and templates, look back via search and calendar, and share insights with practitioners worldwide.
```

(170 chars / 170)

---

## Description (4,000 字以内)

App Store のアプリ詳細ページに表示される本文。

### 日本語 (Japanese ロケール)

```
「稽古の学びを、取りこぼさない。」
AikiNote は、合気道に特化したデジタル稽古日誌です。

稽古後にスマホでサッと開いて、サッと記録。日々の稽古で学んだことをその場で残し、あとから手軽に振り返ることができます。さらに、道場の壁も国境も超えて、他の合気道家と学びや気づきを共有できるコミュニティ機能も備えています。

10代から80代まで、流派や経験年数を問わず、すべての合気道実践者に向けて作られています。

■ 稽古記録機能（「ひとりで」タブ）
・3 ステップでカンタン記録: ボタン 1 つでページ作成 → タグを選ぶだけ → 学びをメモして保存
・タイトルテンプレート: 日付付きの定型を 1 タップで挿入。「朝稽古」「合同稽古」などよく使う型を最大 5 件登録可能
・タグの自由設計: 取り・受け・技の 3 カテゴリに加え、自分専用のカテゴリを最大 5 つ追加可能
・添付ファイル: 写真・動画・YouTube リンクをページに添付
・複数条件の絞り込み: タグ・日付・フリーワードを組み合わせて、目当ての記録にスムーズにたどり着ける
・カレンダー: 月ごとの稽古参加状況を視覚的に確認、月間目標の達成度を表示
・統計データ: タグ別の練習傾向、月ごとの稽古日数とページ作成数をグラフ化

■ コミュニティ機能（「みんなで」タブ）
・投稿フィード: 全ユーザー / 稽古記録のみ / お気に入り の 3 タブで切り替え
・ハッシュタグ対応: 本文中のハッシュタグから関連投稿を検索
・返信・お気に入り: 投稿に対してスレッド形式で会話、気に入った投稿はお気に入りに保存
・投稿検索: キーワード・ハッシュタグ・道場名・段級位で絞り込み (Premium 限定)
・公開範囲設定: 公開／部分的に公開（道場限定）／非公開 の 3 段階

■ 非競争的な設計思想
他の SNS とは異なり、AikiNote では投稿のお気に入り数は投稿者本人にしか見えません。フォロー／フォロワーの仕組みもありません。数字の競争から離れて、稽古の学びと対話そのものに集中できる場を目指しています。

■ プッシュ通知（Premium プラン限定）
・お気に入り通知、返信通知、スレッド返信通知をプッシュで受け取り
・稽古記録リマインダー: 設定した曜日・時刻に「稽古記録は済みましたか？」と通知（最大 5 件）
・稽古継続リマインダー: 1 週間以上稽古記録がない場合に継続を促す通知

■ 使いやすさへのこだわり
・スマートフォンファースト: 利用者の約 9 割がスマホ利用を想定したデザイン
・3 段階の文字サイズ（小・中・大）: 高齢の方も見やすく
・落ち着いた配色と十分な余白: 長時間見ても疲れにくい
・日本語・英語の 2 言語対応

■ Premium プラン
無料プランでも十分に活用できますが、Premium プランにアップグレードすると以下が利用可能になります。
・コミュニティの投稿・返信が無制限（無料プランは 1 日 5 件まで）
・投稿検索機能の利用
・カレンダーの審査目標管理
・各種プッシュ通知（リマインダー含む）

月額プラン・年額プランをご用意しています。サブスクリプションは設定画面からいつでも管理・解約できます。
価格・期間の詳細はアプリ内の購入画面でご確認ください。
購入後、サブスクリプションは自動更新されます。自動更新は更新日の 24 時間以上前に Apple ID の設定からオフにできます。

■ プライバシーとセキュリティ
稽古記録や投稿はクラウド上に安全に保存されます。スマートフォンを紛失したり機種変更したりしても、ログインすればすべてのデータにアクセスできます。プロフィールの公開範囲は 3 段階で細かく制御でき、プライバシーを守りながら利用できます。

公式サイト: https://aikinote.com/ja
プライバシーポリシー: https://aikinote.com/ja/privacy
利用規約: https://aikinote.com/ja/terms
```

(およそ 1,300 字 / 4,000 字。サブスクリプション自動更新の文言は Apple の Auto-Renewable Subscription 必須記載要件を満たすために追加)

### 英語 (English ロケール)

```
"Don't lose what you learn in your practice."
AikiNote is a digital training journal designed exclusively for aikido practitioners.

Record what you learned right after each practice — and look back later with ease. Pull out your phone after keiko, capture the technique, the feel, and your sensei's words while they are still fresh. AikiNote also includes a community space where aikido practitioners across dojos and countries can share insights and grow together.

Built for everyone, from teenagers to those in their 80s, regardless of style or experience.

■ Personal Practice Journal ("Solo" tab)
- Three-step capture: tap the create button, pick your tags, write your notes, save
- Title templates: insert date-stamped templates with one tap. Save up to 5 personal templates ("Morning Keiko", "Joint Practice", and so on)
- Flexible tag system: built-in categories for Tori (attacker), Uke (receiver), and Waza (technique), plus up to 5 custom categories of your own
- Attach images, videos, or YouTube links to any page
- Filter your records by tag, date, or free-text search — or all three at once
- Calendar view: see your practice attendance month by month, with monthly goals and progress
- Statistics: visualize your training trends with tag-based charts and monthly attendance graphs

■ Community ("Together" tab)
- Three feed tabs: All / Practice records only / Favorites
- Hashtag-aware editor: tap a hashtag in any post to find related posts
- Threaded replies and favorites: discuss techniques and bookmark inspiring posts
- Post search: filter by keyword, hashtag, dojo, or rank (Premium only)
- Visibility settings: Public / Partial (only practitioners from chosen dojos) / Private

■ A non-competitive design
Unlike most social apps, AikiNote shows favorite counts only to the post's author — not to other users. There are no follower counts. We want you to focus on the practice and the conversation, not on metrics.

■ Push Notifications (Premium only)
- Favorite, reply, and thread reply notifications
- Practice reminders at your chosen weekday and time (up to 5)
- Continuity reminders if you have not logged practice in over a week

■ Designed for ease of use
- Mobile-first: optimized for the ~90% of users who train and log on their phone
- Three font size settings (Small / Medium / Large) for readability across ages
- Calm color palette and generous spacing — comfortable for long reading
- Available in Japanese and English

■ Premium Plan
The free plan is fully usable, with these limits:
- Up to 5 community posts and replies per day on the free plan (unlimited on Premium)
Premium also unlocks: post search, calendar exam goal tracking, and push notifications (including reminders).

Monthly and annual subscriptions are available. Manage or cancel anytime from the in-app subscription settings. Subscriptions auto-renew unless turned off at least 24 hours before the renewal date in your Apple ID settings. Pricing and renewal terms are shown on the in-app purchase screen.

■ Privacy and Security
Your records and posts are stored safely in the cloud. Lose your phone or change devices, and you can sign in to access everything you have saved. You can control who sees your profile and posts at three levels: Public, Partial (dojo-only), or Private.

Website: https://aikinote.com/en
Privacy Policy: https://aikinote.com/en/privacy
Terms of Service: https://aikinote.com/en/terms
```

(approx. 2,800 chars / 4,000)

---

## Keywords (100 字以内、カンマ区切り)

App Store 検索でヒットさせたいキーワード。アプリ名 (`AikiNote`) は自動的に含まれるので不要。重複・空白に注意。Apple のドキュメント上は「カンマ区切り、スペースは不要」とされている (スペースを入れるとそのスペースもキーワード文字数を消費するため詰めるのが慣例)。

### 日本語 (Japanese ロケール)

```
合気道,稽古,武道,日誌,ノート,記録,道場,メモ,練習,カレンダー,aikido,training,martialarts
```

(全 13 語、約 70 字 / 100 字)

### 英語 (English ロケール)

```
aikido,training,journal,dojo,budo,martialarts,japanese,technique,practice,community,keiko,calendar
```

(全 12 語、約 99 字 / 100 字)

---

## Support URL

サポート連絡先・問い合わせフォームへの誘導 URL。Web 版にあるヘルプ問い合わせフォームに直接飛ばすのが理想。各ロケールで言語別の URL を指定する。

### 日本語 (Japanese ロケール)

```
https://aikinote.com/ja
```

### 英語 (English ロケール)

```
https://aikinote.com/en
```

> **要確認**: 専用のサポートページ (例: `https://aikinote.com/ja/support` や `/contact`) があればそちらを使うほうが良い。なければトップページから「お問い合わせ」リンクで誘導。

---

## Marketing URL (任意)

公式サイト URL。Support URL と同じでよいが、各ロケール別に。

### 日本語 (Japanese ロケール)

```
https://aikinote.com/ja
```

### 英語 (English ロケール)

```
https://aikinote.com/en
```

---

## Version

```
1.0
```

(既に入力済み)

---

## Copyright (200 字以内)

```
2026 Tomoya Sonokui
```

(個人開発者の場合は本名 or 屋号。複数年並記する場合は `2024-2026 ...` でも可)

---

## Routing App Coverage File

不要 (ナビゲーション系アプリ専用)。空欄のまま。

---

## App Clip / iMessage App

不要。両方ともセクションを開かずスキップ。

---

## Build

ビルド処理 (`eas submit` 後 10〜30 分) が完了したら、buildNumber **16** を選択する。

---

## In-App Purchases and Subscriptions

「Select In-App Purchases or Subscriptions」をクリックし、既に Ready to Submit になっている下記 2 つを選択して Add:

- `aikinote_premium_monthly` (AikiNote Premium 月額)
- `aikinote_premium_yearly` (AikiNote Premium 年額)

> アプリ本体の App Review 提出時にサブスクリプション商品も一緒に審査される。

---

## Game Center

不要 (チェックなし)。

---

## App Review Information

### Sign-In Information

`Sign-in required` をチェック (既にチェック済み)。

Apple Reviewer 用のテストアカウントを 1 つ用意する。OAuth (Google/Apple) は Reviewer が使えないので、メール+パスワード式の専用アカウントが必須。

```
User name: apple-reviewer@aikinote.com   ← 要事前作成
Password: <強パスワード>                  ← 要事前設定
```

> **TODO**: 上記アカウントを実際に作って動作確認する。プロフィール初期設定（道場・段級位）も済ませておくと、Reviewer がコミュニティ機能まで一通り確認できる。

### Contact Information

```
First name: Tomoya
Last name:  Sonokui
Phone number: +81 90-XXXX-XXXX     ← 国際形式で
Email: wlcmty08kh@gmail.com
```

### Notes (4,000 字以内)

App Review (本審査) でのリジェクトを防ぐため、Guideline 4.2 への対応とアプリの構造を先回りで説明する。

> **言語選択**: Notes は Apple Reviewer 向けの内部情報で、Reviewer の所在地・第一言語は不定 (アジア圏のときは日本語が読める担当者にアサインされる傾向はあるが保証なし)。**英語を本文に、日本語を補足として併記する形が最も安全**。下記は英語 → 日本語の順で記載した想定。

```
[English]

This app is a "digital training journal designed for aikido practitioners." It uses WebView technology in a hybrid architecture, but goes well beyond a "repackaged website" with multiple native integrations:

[Native Integrations]
1. Native UI: The bottom tab bar (Solo / Together / My Page) and the header on each screen are native components implemented in React Native (Expo SDK 54).
2. Native OAuth: Both Sign in with Apple and Sign in with Google run outside the WebView using a native Supabase client (PKCE flow).
3. Push Notifications: Native APNs integration via Expo Push Service. Premium users receive reply notifications and practice reminders.
4. In-App Purchases: Premium subscriptions (monthly / yearly) via RevenueCat with Apple StoreKit. The standard StoreKit purchase dialog is used.
5. Offline Support: Persistent cache via TanStack Query lets users browse previously loaded training pages while offline.

[Test Account]
Email: apple-reviewer@aikinote.com
Password: <see Sign-In Information>

New signup is also possible with any email address (password must be 8+ chars and contain at least 3 of: uppercase, lowercase, digits, symbols).

[How to verify the main flows]
1. After login, tap the FAB on the "Solo" tab to create a training page (pick tags, write notes, save).
2. On the "Together" tab, browse the feed and tap the FAB to create a new community post.
3. On "My Page", you can edit profile, change font size, and toggle Japanese / English language.
4. Premium features are accessible via My Page → Settings → Subscription. Sandbox accounts can verify the purchase flow.

[Languages]
Japanese and English are supported. Switch via My Page → Settings → Language.

[Privacy]
- Privacy Policy: https://aikinote.com/en/privacy
- Terms of Service: https://aikinote.com/en/terms

Please reach out via this Notes field or the contact email above if you need any additional information.

---

[日本語 / Japanese reference]

このアプリは「合気道に特化したデジタル稽古日誌」です。WebView を活用したハイブリッド構成ですが、「単なる Web ページの再パッケージ」を超える複数のネイティブ統合機能を備えています。

【ネイティブ統合機能】
1. ネイティブ UI: 画面下部のタブバー（ひとりで／みんなで／マイページ）と各画面のヘッダーは React Native (Expo SDK 54) で実装したネイティブコンポーネントです
2. ネイティブ OAuth: Apple Sign In および Google Sign In は WebView 外のネイティブ Supabase クライアント経由で動作します（PKCE フロー）
3. プッシュ通知: APNs を経由したネイティブ実装（Expo Push Service）
4. アプリ内課金: RevenueCat 経由で Apple StoreKit と統合した Premium サブスクリプション（月額・年額）
5. オフライン対応: TanStack Query の永続化により、ネットワーク切断時もキャッシュされた稽古記録を閲覧可能

【テストアカウント】上記 Sign-In Information 欄を参照
【日本語・英語対応】マイページ → 設定 → 言語 から切り替え可能
```

### Attachment

任意。画面遷移図や Premium 機能のスクリーンショットを添付すると Review がスムーズな場合あり。初回は無しで OK。

---

## App Store Version Release

3 つの選択肢:

| 選択肢 | 用途 | 推奨度 |
|---|---|---|
| Manually release this version | 審査承認後、自分で「Release」ボタンを押すまで非公開 | ⭐⭐⭐ 推奨 |
| Automatically release this version | 審査承認後、即座に自動公開 | |
| Automatically release this version after App Review, no earlier than `日時` | 指定日時以降に自動公開 (マーケティング日付固定の場合) | |

**推奨: Manually release this version**

理由:
- 初回リリースは慎重にすべき
- 承認直後に何か問題に気づいた場合、撤回できる時間的余裕が確保できる
- マーケティング / SNS 告知のタイミングを合わせやすい
- Apple Review はキューが詰まっていると深夜に承認通知が来ることがあり、すぐ公開されると意図しないタイミングで配信開始される

---

## TestFlight Beta App Review (External Testing) — 別タブ

上記の App Store Version 入力は **正式リリース時の本審査** 用メタデータ。**Beta App Review (外部テスト用)** は TestFlight タブで別途設定が必要。

### TestFlight → Test Information

> **言語選択**: TestFlight Test Information もローカライズ対象外で、Apple Beta App Reviewer 向けに 1 セットのみ。英語ベースで書くのが安全。下記は英語版・日本語版を併記。

#### Beta App Description (~200 字)

```
[English]
AikiNote is a digital training journal designed for aikido practitioners. Please verify training page creation (tags / templates / attachments), community posts, calendar and statistics, and the Premium subscription flow.

[日本語]
AikiNote は合気道に特化したデジタル稽古日誌です。稽古ページ作成（タグ・テンプレート・添付ファイル）、コミュニティ投稿、カレンダー・統計、Premium サブスクリプションの動作確認をお願いします。
```

#### Feedback Email
```
wlcmty08kh@gmail.com
```

#### Marketing URL
```
https://aikinote.com/en
```

#### Privacy Policy URL
```
https://aikinote.com/en/privacy
```

#### Sign-in Information

```
User name: apple-reviewer@aikinote.com (App Review の Sign-In と同じテストアカウントで OK)
Password: <同上>
```

#### Notes for Reviewer (Test Information の Review Notes 欄)

```
This app is not a simple WebView wrapper. It includes native integrations: tab bar, headers, Apple/Google OAuth, push notifications via APNs, in-app purchases via RevenueCat (Apple StoreKit), and offline support via TanStack Query persistence. New signup is possible with any tester's email; OAuth (Google / Apple) also works.

(日本語) 本アプリは WebView ラッパーではなくネイティブ統合機能（タブバー・ヘッダー・OAuth・IAP・プッシュ通知・オフライン対応）を持つハイブリッドアプリです。テスター自身のメールアドレスで新規登録も可能です（OAuth は Google / Apple SSO ともに動作します）。
```

### TestFlight → External Testers Group

1. グループ作成: `Friends` 等の名前
2. テスター追加: 知人の Apple ID メールアドレスを個別追加
3. ビルド #16 を Group に Associate
4. **Submit Build for Beta App Review** ボタン押下 → Apple 審査キュー (~1〜2 営業日)

---

## 入力順序の推奨

App Store Connect の左メニューを上から順に埋めていくと取りこぼしが少ない:

1. **App Information** (Bundle ID / Privacy Policy URL / Category / Content Rights)
2. **App Privacy** (Privacy Nutrition Labels — 別途 docs/development-guide.md 参照)
3. **Pricing and Availability** (無料 / Japan のみ等)
4. **Age Rating** (質問票回答)
5. **iOS App → 1.0 Prepare for Submission** (本ドキュメントで網羅)
6. **TestFlight → Test Information** (External 提出用)
7. **TestFlight → External Testers Group** 作成 + ビルド Associate + Submit for Beta App Review

---

## 提出時のチェックリスト

### 共通 (ローカライズ非対象)
- [ ] App Information: Privacy Policy URL / Category / Content Rights / Bundle ID
- [ ] Pricing and Availability
- [ ] App Privacy (4 種類のデータ申告)
- [ ] Age Rating 質問票
- [ ] Copyright 入力
- [ ] In-App Purchases 2 件 (monthly / yearly) を Add
- [ ] App Review Information の Sign-In に Apple Reviewer 用テストアカウントを記入
- [ ] App Review Information の Contact / Notes 入力 (英語ベース推奨)
- [ ] App Store Version Release を `Manually release this version` に設定
- [ ] Build に buildNumber 16 を選択 (ASC 処理完了後)

### 日本語ロケール (Japanese)
- [ ] Promotional Text (日本語) 入力
- [ ] Description (日本語) 入力 (Auto-Renewable Subscription 文言含む)
- [ ] Keywords (日本語) 入力
- [ ] Support URL / Marketing URL (`/ja`) 入力
- [ ] スクリーンショット 6.5" を 3 枚以上アップロード (日本語 UI)

### 英語ロケール (English) ← Add Language で追加
- [ ] Promotional Text (English) 入力
- [ ] Description (English) 入力
- [ ] Keywords (English) 入力
- [ ] Support URL / Marketing URL (`/en`) 入力
- [ ] スクリーンショット 6.5" を 3 枚以上アップロード (英語 UI、または日本語版を流用)

### TestFlight (External Testing)
- [ ] TestFlight → Test Information すべて入力 (英語+日本語)
- [ ] TestFlight → External Group 作成 + テスター追加 + ビルド Associate
- [ ] Submit for Beta App Review (External 用)

### 将来
- [ ] (将来) Add for Review (App Store 本審査用、別タイミング)
