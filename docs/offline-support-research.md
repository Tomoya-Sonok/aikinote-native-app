# オフライン対応 設計調査

Phase 3.5 の T5 調査タスクの成果物。本実装（Phase 5 以降を想定）に着手する前の方針整理を目的とする。

## 背景・ねらい

- ネイティブアプリは Web 版を WebView で表示するラッパー構成のため、現状はオフライン時に `NetworkError` 画面を表示するのみで、アプリ内での閲覧・操作は一切できない（`components/error/network-error.tsx`、`app/index.tsx:37`）。
- Apple App Store の審査ガイドライン（Guideline 4.2 / 4.2.3）は「ネットワーク接続がないと何も表示できないラッパーアプリ」に対してリジェクト事例が多い。最低限の UX 改善で審査通過の安定性を高めたい。
- 「ひとりで」機能（稽古記録）はユーザーが外出先の道場・移動中に参照したいユースケースがある。既取得の稽古ページがオフラインで読めるだけでも体感価値は大きい。

## 現状把握

### Web 版 Service Worker（`aikinote/frontend/public/sw.js`）

現状は **PWA インストール可能性を満たすためだけの no-op SW**。`install`/`activate`/`fetch` を登録しているが `respondWith` を呼ばず、Cache API は一切使っていない。

```js
self.addEventListener("fetch", () => {
  // no-op: PWA installability requires a fetch handler to exist
});
```

### 「ひとりで」機能のデータ依存

- エントリ: `frontend/src/lib/hooks/useTrainingPagesData.ts`
- データ取得は tRPC クライアント（`@/lib/api/client` の `getPages`）。
- 状態はコンポーネントの `useState` にメモリ保持のみ。リロードでクリアされる。
- 添付ファイル（画像等）は S3 + CloudFront で配信されている。

### ネイティブ側のオフライン検出

- `@react-native-community/netinfo` の `isConnected === false` を見て `NetworkError` を表示（`app/index.tsx:37-38, 373-378`）。
- WebView 自体のキャッシュ（`cacheEnabled`）がデフォルトで有効。一度読み込んだページは部分的にブラウザキャッシュに残るが、API レスポンスは通常キャッシュされない。

## 選択肢の評価

### 選択肢 A: Web 版 Service Worker を Cache API 対応に拡張

- **内容**: `sw.js` に stale-while-revalidate を導入。tRPC の GET リクエスト（`/api/trpc/pages.*`）と CloudFront 配信画像をキャッシュ。
- **メリット**:
  - Web 版・ネイティブアプリ双方で恩恵（Web PWA でもオフライン閲覧可能に）。
  - ネイティブ側のコード変更が不要。
  - 実装規模は小〜中（既存ファイル拡張 + 数本のキャッシュ戦略）。
- **デメリット / リスク**:
  - WebView 内での Service Worker は iOS / Android で挙動差がある。特に iOS の WKWebView は SW をサポートするが、バックグラウンド同期や長期キャッシュ永続化に制約あり。
  - tRPC の POST レスポンス（mutation）はキャッシュ対象外にする必要があり、URL パターンで厳密に分岐しないと誤キャッシュで不整合が起こりうる。
  - 認証 Cookie（HTTPOnly）は SW からは見えないが、fetch はブラウザコンテキストで行われるので送信自体は可能。

### 選択肢 B: TanStack Query の永続化プラグイン

- **内容**: `@tanstack/query-async-storage-persister` + `persistQueryClient` を導入し、Query キャッシュを localStorage または IndexedDB に永続化。現状 `useTrainingPagesData` は TanStack Query を使わず手書き `useState` なので、まず TanStack Query への移行が必要。
- **メリット**:
  - JS レイヤーで完結、SW のような環境差ハマりは少ない。
  - SWR 的な「stale データを即表示しつつ裏で再取得」体験が実現しやすい。
- **デメリット**:
  - 前提として `useTrainingPagesData` を含む主要フックの TanStack Query 化が必要（中規模リファクタ）。
  - 画像（S3）は別枠のキャッシュが必要で、本選択肢だけでは完結しない。

### 選択肢 C: ネイティブ側で WebView とは別にローカル DB を持つ

- **内容**: Expo SQLite / WatermelonDB / Op-SQLite 等を導入し、ネイティブ側で稽古ページのローカルコピーを保持。Web 版とはブリッジ（postMessage）で同期。
- **メリット**:
  - 最も堅牢なオフライン体験（新規作成・編集のオフラインキュー化まで見据えられる）。
- **デメリット**:
  - 実装コスト最大。スキーマ設計・差分同期・競合解決の仕組みを新規構築する必要がある。
  - Web 版とデータ構造を二重管理することになり、将来のスキーマ変更時の保守負担が大きい。
  - Phase 3.5 のスコープに収まらず、独立した Phase として切り出すべき規模。

### 選択肢 D: WebView のネイティブキャッシュを最大限活用（最小コスト）

- **内容**: `react-native-webview` の `cacheEnabled` / `cacheMode` と、HTTP レスポンスヘッダー側（`Cache-Control`, `ETag`）の調整のみで、オフライン時に過去のページが表示される範囲を広げる。
- **メリット**: 実装規模が極小。選択肢 A/B を入れる前の「最低限審査通過」案として機能する。
- **デメリット**: API レスポンス（tRPC）のキャッシュは HTTP 層頼みになるため、アプリ審査で求められる水準の「オフラインでも意味のある表示」には届かない可能性が高い。

## 推奨スコープ

以下の 2 段構えを提案する。

### Phase 5-a: ストア審査通過ライン（推奨優先度: 高）

- **対象**: 選択肢 A（Service Worker + Cache API）をベースに、「ひとりで」一覧と詳細ページの GET レスポンス、および表示済みの S3 画像をキャッシュ。
- **期待効果**: オフラインでも直近アクセスしたページが読める → Apple 4.2 系リジェクトリスクを大きく下げる。
- **概算規模**: `sw.js` 拡張で数百行、Web 版側のフック変更は最小、ネイティブ側は無変更。2〜3 日工数。

### Phase 5-b: オフライン編集対応（推奨優先度: 中、将来）

- **対象**: 選択肢 B（TanStack Query 永続化 + mutation キュー）または選択肢 C（ネイティブ DB）。
- **期待効果**: 電波の悪い道場・移動中に下書きを書いてオンライン復帰時に同期。
- **概算規模**: 1〜2 週間以上。スキーマ・競合解決の設計次第でさらに増える。
- **判断ポイント**: 審査通過だけが目的なら Phase 5-b は不要。ユーザーのアクティブな要望が出てきた段階で着手判断する。

## リスクと要確認事項

- iOS WKWebView の Service Worker 挙動は iOS バージョンによって差がある。実機での検証（iPhone 最新 + 1 世代前）が必須。
- 画像キャッシュは CloudFront 側の `Cache-Control` と SW 側の戦略を合わせる必要がある。現状のヘッダー設定を `aikinote` 側で確認する。
- TanStack Query への移行（選択肢 B 採用時）は他機能にも波及する。スコープ抑制のため、オフライン対応とは独立した「フック統一リファクタ」タスクとして切り出す。

## 次のアクション

1. 本ドキュメントのレビューを受け、Phase 5-a に進む合意を取る。
2. Phase 5-a 着手時は、まず `sw.js` の拡張案を PR ベースで出し、WebView 実機（iOS / Android）でのキャッシュ挙動を観察してから水平展開する。
3. Phase 5-b は審査通過後のユーザーフィードバックを踏まえて判断する。
