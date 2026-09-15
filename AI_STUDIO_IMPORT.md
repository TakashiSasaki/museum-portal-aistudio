# Google AI Studio import provenance

このリポジトリ `TakashiSasaki/museum-portal-aistudio` は、`TakashiSasaki/museum-portal` のスナップショットを Google AI Studio にインポートして作成したものです。

この文書は、インポート元を再現可能な形で固定し、インポートによって Git 履歴と working tree に何が起こったかを記録します。

## Import origin

- Source repository: `TakashiSasaki/museum-portal`
- Source ref: `refs/tags/aistudio-init`
- Source commit: `05603220b2dad79cae15c40ddcebcc69d9e62ba7`
- Target repository: `TakashiSasaki/museum-portal-aistudio`
- Target branch: `main`
- Import observed on: 2026-09-15

`aistudio-init` は annotated tag ではなく lightweight tag であり、上記 commit を直接指しています。今後 tag が移動した場合でも import baseline を特定できるよう、この文書では commit SHA も固定値として記録しています。

## What happened to Git history

Google AI Studio へのインポートでは、source repository の Git ancestry は target repository に継承されませんでした。

Target repository の最初の履歴は次のようになっています。

1. `240a1efc617e4ee2a9fe07df9bae7cafa8eb1fb5` — `Initial commit`
   - tree には README だけが存在していました。
2. `04129d4d1408f5290a0158a9ffe38da67ee6e8a4`
   - source snapshot の大部分と、AI Studio での実行・プレビューに必要な変更が追加されました。

したがって、target repository の `main` は source commit `05603220...` の子孫ではありません。両 repository 間には通常の Git merge-base が存在することを前提にしてはいけません。

概念的には次の関係です。

```text
TakashiSasaki/museum-portal
... -> 05603220b2dad79cae15c40ddcebcc69d9e62ba7  (tag: aistudio-init)
                  |
                  | content snapshot imported through Google AI Studio
                  v
TakashiSasaki/museum-portal-aistudio
240a1efc... -> 04129d4d...
```

将来この2リポジトリを同期する場合は、Git ancestry ではなく、この import baseline と working-tree 差分を基準に扱う必要があります。

## Observed working-tree delta after import

`museum-portal:aistudio-init` と、インポート後の `museum-portal-aistudio:main` を内容ベースで比較すると、大部分のファイルは Git blob SHA まで一致しています。

実質的な差分は次の8ファイルです。

| Path | Change in `museum-portal-aistudio` | Purpose / observation |
| --- | --- | --- |
| `.env.example` | Added | `FIREBASE_TOKEN` の環境変数テンプレート |
| `metadata.json` | Added | Google AI Studio 用アプリケーションメタデータ |
| `server.js` | Added | Node/Express ベースのローカル/AI Studio preview server |
| `package.json` | Modified | `server.js` 用 scripts と `express` dependency を追加し、Bun placeholder entry point を削除 |
| `bun.lock` | Modified | dependency 構成変更を反映 |
| `public/museum-street/index.html` | Modified | Firebase SDK が存在しない preview 環境で例外を避ける guard を追加 |
| `index.ts` | Removed | 元の `console.log("Hello via Bun!")` だけの placeholder entry point を削除 |
| `package-lock.json` | Removed | npm lockfile が target repository には残らなかった |

上記以外の公開サイト本体、ImagineDeck、Service Worker 群、Firebase 設定、テスト、GitHub Actions などは、import baseline と同一内容のファイルが大部分を占めます。

## Runtime adaptation added for AI Studio

### `server.js`

AI Studio 側では、静的な Firebase Hosting コンテンツを preview できるよう Express server が追加されています。

主な動作:

- `0.0.0.0:3000` で listen
- `public/` を静的配信
- `/sw.js` および `/sw-*` に `Cache-Control: no-cache, no-store, must-revalidate` を付与
- Firebase Hosting reserved URL `/__/firebase/8.10.1/*` を Google CDN にリダイレクト
- `/__/firebase/init.js` をローカルでエミュレートし、Firebase project `museum-6f112` を初期化
- 未解決 path は `public/404.html` を返す

これは Firebase Hosting 上の本番サイトそのものを大きく変更するものではなく、Firebase Hosting 固有の URL を利用する既存サイトを一般的な Node preview 環境でも動かすための adaptation layer です。

### `package.json`

Source 側では `index.ts` が Bun の placeholder entry point でしたが、target 側では Node application として次の scripts が追加されています。

```json
{
  "dev": "node server.js",
  "start": "node server.js",
  "build": "node --test test-static-integrity.cjs",
  "lint": "eslint server.js"
}
```

また `express` が dependency に追加されています。

### `metadata.json`

AI Studio 用メタデータとして、アプリケーション名・説明とともに次の capability が記録されています。

```json
"majorCapabilities": ["MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API"]
```

これは AI Studio 側の capability declaration です。この import 時点の museum portal 本体に Gemini API を呼び出す実装が追加されたことを意味するものではありません。

### `public/museum-street/index.html`

Firestore 初期化の前に次の guard が追加されています。

```js
if (typeof firebase === 'undefined' || !firebase.firestore) return;
```

これにより、Firebase Hosting reserved scripts が利用できない preview 条件でも、Firebase 未定義による JavaScript exception でページ全体が壊れることを避けています。

## Known post-import mismatches

インポート時には source repository の CI/CD および agent instructions もほぼそのままコピーされました。そのため、target repository の構成とは一致していない箇所があります。

### Branch name mismatch

Target repository の default branch は `main` ですが、コピーされた設定には source repository の production branch `museum-portal` が残っています。

例:

- `.github/workflows/site-ci.yml` は `pull_request.branches: [museum-portal]`
- `.github/workflows/deploy.yml` は `push.branches: [museum-portal]`
- `AGENTS.md` も production branch を `museum-portal` と説明している

このため、target repository の `main` への通常の push/PR では、これらの workflow は source repository と同じ条件では自動実行されません。

### npm lockfile mismatch

コピーされた GitHub Actions は `npm ci` を使用しますが、target repository では `package-lock.json` が削除されています。

そのため、workflow trigger の branch 条件だけを `main` に変更しても、`npm ci` をそのまま使う場合は lockfile を復元するか、package-manager policy を整理する必要があります。

## Attribution note

この文書の「差分」は、`museum-portal:aistudio-init` の固定 commit と import 後の target repository の内容を比較して観測した結果です。

すべての差分について「Google AI Studio が自動的に生成した」と断定するものではありません。AI Studio import/preview workflow の過程で target 側に存在するようになった変更として記録しています。

## Synchronization baseline

将来 `museum-portal` と `museum-portal-aistudio` の変更を比較・同期するときは、少なくとも次の3種類を区別してください。

1. **Imported common content** — `aistudio-init` から内容が継承されたファイル
2. **AI Studio adaptation** — `server.js`, `metadata.json`, preview/runtime dependency など target 固有の変更
3. **Post-import development** — import 完了後にどちらか一方の repository で新たに行われた変更

Import origin の canonical identifier は次の組です。

```text
TakashiSasaki/museum-portal
refs/tags/aistudio-init
05603220b2dad79cae15c40ddcebcc69d9e62ba7
```

## Post-import normalization

インポート後に残存していた repository/CI/tooling の不整合を解消するため、以下の正規化を実施しました。

1. **ブランチの正規化**:
   - 本リポジトリ（`TakashiSasaki/museum-portal-aistudio`）のカノニカルブランチを `main` に一本化。
   - CI 設定（`site-ci.yml`）の trigger を `main`（PR および push）へ更新。
2. **パッケージマネージャーの正規化 (Bun)**:
   - `bun.lock` を単一の lockfile として採用し、`package-lock.json` の欠落による CI 失敗を解消。
   - CI およびローカル検証において `bun install --frozen-lockfile` を採用し、再現性のある依存関係解決を確立。
   - `package.json` のスクリプトを整備（`test:static`, `test:imaginedeck`, `test:server`, `test:browser`, `test`, `lint`）。
3. **CI/CD の修復・テスト統合**:
   - `python3 -m http.server` によるブラウザテスト配信を廃止し、本番互換のプレビューサーバー `server.js` を CI で起動して検証。
   - `/healthz` エンドポイントによる HTTP readiness チェックを導入。
   - 軽量な ImagineDeck フルスクリーンガードテスト（`test-imaginedeck-fullscreen-guard.cjs`）を `site-ci.yml` に統合し、重複していた `verify-imaginedeck-fullscreen.yml` を整理。
4. **プレビューサーバー (`server.js`) の堅牢化**:
   - Firebase SDK バージョンリダイレクト（`/__/firebase/:version/:file`）の汎用化。
   - Service Worker の no-cache ヘッダー付与の維持と、プレビューサーバー用コントラクトテスト（`test-server.cjs`）の追加。
5. **デプロイ運用方針の安全化**:
   - 本番デプロイ権限の移行確認が完了するまで、`.github/workflows/deploy.yml` は手動実行（`workflow_dispatch`）のみに限定。
   - `FIREBASE_TOKEN` secret の存在確認（preflight）を追加し、トークンベース認証を維持。
