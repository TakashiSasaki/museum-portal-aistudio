# 愛媛大学ミュージアム ポータルサイト (museum-portal-aistudio)

愛媛大学ミュージアムのポータルサイトおよびイマジンデッキ（ImagineDeck）の Web アプリケーションリポジトリです。Google AI Studio へのインポートを経て管理・運用されています。

- **公開 URL (カノニカル)**: [https://portal.museum.ehime-u.ac.jp/](https://portal.museum.ehime-u.ac.jp/)
- **イマジンデッキ**: [https://portal.museum.ehime-u.ac.jp/imaginedeck/](https://portal.museum.ehime-u.ac.jp/imaginedeck/)
- **インポートの経緯・履歴**: [AI_STUDIO_IMPORT.md](./AI_STUDIO_IMPORT.md)

---

## 開発とプレビュー

本プロジェクトの標準パッケージマネージャーは **Bun** です。

```bash
# 依存関係のインストール
bun install --frozen-lockfile

# プレビューサーバーの起動 (ポート 3000)
bun run dev
# または
node server.js
```

ブラウザで `http://localhost:3000/` にアクセスして確認できます。

---

## テスト・検証

```bash
# 静的整合性テスト（必須ファイル存在確認・JS構文検査・HTML/CSSコントラクト）
bun run test:static

# ImagineDeck フルスクリーンガードテスト
bun run test:imaginedeck

# プレビューサーバー・エンドポイントコントラクト検証
bun run test:server

# 全ユニット／コントラクトテストの一括実行
bun run test

# Playwright によるブラウザスモークテスト（ポート 3000 でサーバーが起動している状態で実行）
bun run test:browser

# ESLint による構文・スタイル検査
bun run lint
```

---

## CI / CD

- **Site CI (`.github/workflows/site-ci.yml`)**:
  - `main` ブランチへの Pull Request および push で自動実行。
  - 静的整合性、ImagineDeck テスト、ESLint、および実プレビューサーバー（`server.js`）を用いた Playwright ブラウザスモークテストを検証します。
- **デプロイ運用方針 (`.github/workflows/deploy.yml`)**:
  - デプロイ先: Firebase プロジェクト `museum-6f112`
  - 旧リポジトリからの本番移行確認が完了するまでは、意図しない自動上書きを防ぐため **手動実行（`workflow_dispatch`）のみ** に制限しています。
  - デプロイ実行には GitHub Actions Secret `FIREBASE_TOKEN` が必要です。
  - デプロイ手順の詳細は [.agents/workflows/deploy.md](./.agents/workflows/deploy.md) を参照してください。
