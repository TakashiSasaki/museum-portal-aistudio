# Agent Instructions

- 本リポジトリ（`TakashiSasaki/museum-portal-aistudio`）における標準パッケージマネージャーは **Bun**（`bun`, `bun x`）です。`bun.lock` を単一の lockfile として管理します。
- ローカル開発 / プレビューサーバーには `server.js`（ポート 3000）を使用してください（`bun run dev` または `node server.js`）。
- テスト・検証コマンド:
  - 静的整合性テスト: `bun run test:static`
  - ImagineDeck フルスクリーンガードテスト: `bun run test:imaginedeck`
  - プレビューサーバー検証: `bun run test:server`
  - ブラウザスモークテスト: `bun run test:browser`
  - リント: `bun run lint`
- 本リポジトリの主要開発・カノニカルブランチは **`main`** です。（旧リポジトリ `TakashiSasaki/museum-portal` では `museum-portal` ブランチが利用されていましたが、本リポジトリでは `main` に一本化されています）
- 本プロジェクトは Firebase Hosting にデプロイされます。
- デプロイ先の Firebase プロジェクト名は `museum-6f112` です。
- カノニカルドメインは `https://portal.museum.ehime-u.ac.jp/` です。
- **デプロイ運用方針**:
  - 本番デプロイ権限の移行確認が完了するまでの間、GitHub Actions による Firebase Hosting デプロイは **手動実行（`workflow_dispatch`）のみ** に設定されています（自動 push デプロイは無効化）。
  - デプロイには `FIREBASE_TOKEN` シークレットが必要です。
  - Firebase のデプロイ認証は、当面の間はサービスアカウントキーへの移行は行わず、トークンベースの認証（`FIREBASE_TOKEN`）を継続して使用します。
  - ローカルからの手動デプロイには `bun x firebase deploy` を使用してください。

## Design Principles

本プロジェクト（特にミュージアム・ポータル）の開発・修正にあたっては、以下のデザイン方針を厳守してください。

1.  **Viewport-First (スクロールレス)**:
    - ユーザーが縦方向のスクロールをすることなく、全コンテンツ（ヘッダー、全カード、フッター）を一度に視認できるレイアウトを維持します。
    - `body` には **`p-0 m-0 h-screen overflow-hidden`**（またはモバイルブラウザバーを考慮した `h-[100dvh]`）を設定し、コンテンツがビューポートの全域を有効活用できるようにしてください。
    - レイアウトの設計では、モダンなCSS Viewport単位である `svh`（small viewport height）、`lvh`（large viewport height）、および `dvh`（dynamic viewport height）を活用し、特にスマートフォン等におけるブラウザのツールバーやセーフエリアを考慮した **`dvh` および `env(safe-area-inset-*)` を前提に設計**する必要があります。
    - コンテンツは `flex-1` や `grid-template-rows: repeat(n, 1fr)` を使用してビューポート内に均等に収めてください。
    - **Frontend Verification Requirement**: フロントエンドのレイアウトを変更する際は、必ず横幅の狭いモバイル端末（例：iPhone 12 mini、375x812）での表示確認（Playwright等のスクリプト）を実施し、右端がはみ出さないこと、および下側が切れない（スクロールが発生しない）ことを検証してください。

2.  **真円のアイコン背景 (Circular Icons)**:
    - 各カード内のアイコン背景（`.plasma-sphere`）は、画面サイズの変化やカードの歪みに関わらず、常に**真円**を維持しなければなりません。
    - CSS の `aspect-ratio: 1/1` と `flex-shrink: 0` を使用し、HTML のインラインでの固定サイズ指定（`w-20` など）は避けてください。

3.  **ランドスケープ最適化 (Landscape Mobile)**:
    - モバイルの横向き（Landscape）は高さが極端に低いため、スローガン（`header p`）を非表示にし、タイトルサイズやマージンを最小化して、グリッドの表示領域を最大化してください。

4.  **プレミアムな質感**:
    - `backdrop-blur` (ガラス質感)、`bg-gradient-to-br` (グラデーション)、`drop-shadow` (発光エフェクト) を積極的に活用し、モダンでプレミアムな宇宙・サイエンスの雰囲気を演出してください。

5.  **Service Worker & PWA 更新戦略 (Network First)**:
    - コンテンツの鮮度を優先するため、静的ファイルは `Network First` 戦略を採用します。
    - オンライン時は常にネットワークから最新を取得し、キャッシュを更新します。
    - また、`sw.js` 自体には `Cache-Control: no-cache` を設定し、アプリの更新が即座にユーザーへ届くように維持してください。
