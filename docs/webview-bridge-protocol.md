# WebView ↔ Native ブリッジプロトコル仕様

aikinote-native-app は Expo WebView ラッパー型のアプリ。WebView 内で動く Web 側 JavaScript (`aikinote/frontend/...`) と Native (React Native) 側で双方向にメッセージをやり取りする仕組みを使っている。本ドキュメントはそのプロトコルを定義する。

## 1. メッセージング全体の仕組み

### Web → Native

```js
window.ReactNativeWebView.postMessage(JSON.stringify({
  type: "MESSAGE_TYPE",
  requestId: "req_xxx",      // 任意。リクエスト/レスポンス型のメッセージで必須
  payload: { /* ... */ }
}));
```

Native 側は `aikinote-native-app/app/index.tsx` の `handleMessage` で受け取り、`type` でディスパッチする。

### Native → Web

```js
// Native 側
sendToWebView("MESSAGE_TYPE_RESULT", {
  requestId: "req_xxx",
  ok: true,
  data: { /* ... */ }
});
// または
sendToWebView("MESSAGE_TYPE_RESULT", {
  requestId: "req_xxx",
  ok: false,
  error: { code: "ERR_CODE", message: "..." }
});
```

実装は `webView.executeScript` 経由で WebView 内に以下を流し込む:

```js
window.__onNativeMessage({ type, payload });
```

Web 側は `window.__onNativeMessage` ハンドラを仕込んで、`payload.requestId` から対応する Promise resolver を引いて resolve する (`__iapResolve`/`__oauthResolve` パターンを汎用化)。

## 2. 既存メッセージタイプ

主要な既存タイプ（参考、本 PR では変更しない）:

| Web → Native type | 用途 | レスポンス type |
|---|---|---|
| `SEARCH_HISTORY_UPDATED` | 検索履歴を AsyncStorage に同期 | なし |
| `USER_INFO` | hydration 完了通知 + userId / profileImageUrl | なし |
| `UNREAD_NOTIFICATION_COUNT` | 未読通知数を Native に通知 | なし |
| `TUTORIAL_STATE` / `TUTORIAL_COMPLETED` | チュートリアル状態 | なし |
| `INITIATE_IAP` | 購入リクエスト (planType 任意) | `IAP_RESULT` |
| `SHOW_CUSTOMER_CENTER` | サブスクリプション管理画面 | なし |
| `GET_SUBSCRIPTION_STATUS` | Premium 状態問い合わせ | `SUBSCRIPTION_STATUS` |
| `START_NATIVE_OAUTH` | OAuth フロー開始 (provider) | `OAUTH_RESULT` |

## 3. PERSONAL_* (「ひとりで」オフラインファースト対応)

「ひとりで」(個人の稽古記録) を Native SQLite + Native File System で完全オフラインで動かすために新設されたメッセージ群。すべて `PERSONAL_` プレフィックスで始まる。

### 共通形式

すべて **request/response 対** で、Web 側は `requestId` を付けて呼び、Native 側は同じ `requestId` を含む `*_RESULT` メッセージで返す。

```ts
// Web → Native
{
  type: "PERSONAL_PAGES_LIST",
  requestId: "req_<uuid>",
  payload: { userId: string, limit?: number, offset?: number, /* ... */ }
}

// Native → Web (成功)
{
  type: "PERSONAL_PAGES_LIST_RESULT",
  payload: {
    requestId: "req_<uuid>",
    ok: true,
    data: [ /* TrainingPage[] */ ]
  }
}

// Native → Web (失敗)
{
  type: "PERSONAL_PAGES_LIST_RESULT",
  payload: {
    requestId: "req_<uuid>",
    ok: false,
    error: { code: "VALIDATION_ERROR", message: "title is required" }
  }
}
```

### エラーコード

| code | 用途 |
|---|---|
| `NOT_IMPLEMENTED` | 当該ハンドラは未実装（PR1 の skeleton 状態） |
| `UNKNOWN_TYPE` | 知らない PERSONAL_* タイプ |
| `VALIDATION_ERROR` | payload バリデーション失敗 (Zod 等) |
| `NOT_FOUND` | 指定 ID のレコードが SQLite に存在しない |
| `LIMIT_EXCEEDED` | 添付 5 枚 / カテゴリ 10 個 等の上限超過 |
| `OFFLINE_ONLY_OPERATION` | オフラインで実行不可な操作（将来用） |
| `INTERNAL_ERROR` | 想定外の例外 |

### メッセージタイプ一覧

#### Pages (`training_pages` テーブル)

| type | payload | response.data | 備考 |
|---|---|---|---|
| `PERSONAL_PAGES_LIST` | `{ userId, limit?, offset?, query?, tags?, startDate?, endDate?, date?, sortOrder? }` | `TrainingPageSummary[]` | 一覧取得（既存 `getPages` 相当） |
| `PERSONAL_PAGES_GET` | `{ userId, pageId }` | `TrainingPageDetail` (添付・タグ込み) | 詳細取得 |
| `PERSONAL_PAGES_CREATE` | `CreatePagePayload` | `{ localId, serverId? }` | local 作成、server_id は sync 後に埋まる |
| `PERSONAL_PAGES_UPDATE` | `UpdatePagePayload` | `{ localId }` | 更新 |
| `PERSONAL_PAGES_DELETE` | `{ pageId, userId }` | `{}` | soft delete |
| `PERSONAL_PAGES_TOGGLE_VISIBILITY` | `{ pageId, userId, isPublic }` | `{}` | 公開設定切替（オフライン時もローカル更新、同期で反映） |

#### Tags (`user_tags` テーブル)

| type | payload | response.data |
|---|---|---|
| `PERSONAL_TAGS_LIST` | `{ userId }` | `UserTag[]` |
| `PERSONAL_TAGS_CREATE` | `{ userId, name, category, sortOrder? }` | `UserTag` |
| `PERSONAL_TAGS_DELETE` | `{ tagId }` | `{}` |
| `PERSONAL_TAGS_UPDATE_ORDER` | `{ userId, category, orderedTagIds: string[] }` | `{}` |

#### Categories (`user_categories` テーブル)

| type | payload | response.data |
|---|---|---|
| `PERSONAL_CATEGORIES_LIST` | `{ userId }` | `UserCategory[]` |
| `PERSONAL_CATEGORIES_CREATE` | `{ userId, name, slug?, sortOrder? }` | `UserCategory` |
| `PERSONAL_CATEGORIES_UPDATE` | `{ categoryId, name?, sortOrder? }` | `{}` |
| `PERSONAL_CATEGORIES_DELETE` | `{ categoryId }` | `{}` |

#### Attachments (`page_attachments` テーブル + Native FS)

| type | payload | response.data |
|---|---|---|
| `PERSONAL_ATTACHMENTS_LIST` | `{ pageLocalId }` | `PageAttachment[]` |
| `PERSONAL_ATTACHMENTS_CREATE` | `{ pageLocalId, base64, mimeType, filename, sizeBytes, sortOrder }` | `{ localId, localUri }` |
| `PERSONAL_ATTACHMENTS_DELETE` | `{ attachmentId }` | `{}` |

**画像 payload**: 5MB 以内の画像のみ。`base64` は `data:image/...;base64,...` の **データ部のみ** を渡す。Native は `expo-file-system` で `documentDirectory/attachments/<uuid>.<ext>` に書き出し、`localUri` (`file://...`) を返す。動画はオフライン対象外（Web 側が `accept` 動的変更で排除する）。

#### TrainingDates (`training_dates` テーブル)

| type | payload | response.data |
|---|---|---|
| `PERSONAL_TRAINING_DATES_MONTH` | `{ userId, yearMonth: "YYYY-MM" }` | `TrainingDate[]` |
| `PERSONAL_TRAINING_DATES_UPSERT` | `{ userId, trainingDate: "YYYY-MM-DD", isAttended }` | `{}` |
| `PERSONAL_TRAINING_DATES_REMOVE` | `{ userId, trainingDate: "YYYY-MM-DD" }` | `{}` |

> ⚠️ カレンダー画面はオフライン専用ガードを Web 側に置く方針だが、SQLite に保存してある稽古日は表示できる方が UX が良いため、データアクセスは SQLite 経由でも提供する。ガード画面表示は Web 側の判断。

#### 同期制御

| type | payload | response.data | 備考 |
|---|---|---|---|
| `PERSONAL_SYNC_TRIGGER` | `{ scope: "full" \| "incremental" \| "push-only" }` | `{ triggered: true }` | 同期を明示キック |
| `PERSONAL_SYNC_STATUS` | (Native → Web のみ、back-channel) | `{ state: "idle" \| "running" \| "completed" \| "failed", progress?: number, pending?: number, error?: string }` | 進捗表示用、requestId 不要 |

## 4. 実装段階

| PR | 内容 |
|---|---|
| **PR1 (現)** | プロトコル仕様書 + dispatcher skeleton（全タイプ `NOT_IMPLEMENTED` を返す） |
| **PR2** | SQLite スキーマ + Pages/Tags/Categories/TrainingDates の CRUD 実装 |
| **PR3** | Web 側アダプタ層 (`personal-adapter.ts`) + 統計/カレンダーのオフラインガード |
| **PR4** | Pull/Push 同期エンジン (LWW) + NetInfo 連携 |
| **PR5** | `PERSONAL_ATTACHMENTS_*` 実装 + S3 アップロードキュー |
| **PR6** | 初回フルプル + 進捗 UI + LRU GC |

## 5. テスト戦略

- Native: Jest + `expo-sqlite` のメモリモードで repository 関数の単体テスト
- Web: vitest で `isNative` 分岐、`native-bridge.ts` のモックレスポンス
- 結合: Simulator/Emulator で実機相当の動作確認

## 6. 既存資産との関係

- `app/index.tsx:236-245` の `sendToWebView` を流用（type + payload で WebView 内の `window.__onNativeMessage` を呼ぶ）
- `app/index.tsx:479` の `handleMessage` から `PERSONAL_*` を `lib/bridge/personal-handlers.ts` に委譲
- Web 側 `frontend/src/lib/api/native-bridge.ts` (PR3 で新設) が `window.__iapResolve` / `__oauthResolve` パターンを汎用化した requestId 付き Promise resolver を提供
