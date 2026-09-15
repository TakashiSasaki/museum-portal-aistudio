---
name: ESLint with Bun
description: Instructions for running and troubleshooting ESLint using the Bun runtime.
---

# ESLint with Bun

このスキルは、プロジェクト内の JavaScript ファイルに対して ESLint を実行するための手順を定義します。

## 起動の基本原則 (The "Bun-First" Principle)

ESLint を実行する際は、常に以下の優先順位でコマンドを試みてください：

1.  **Bun (最優先)**: `bun x eslint <target>`
2.  **npx (フォールバック 1)**: `npx eslint <target>`
3.  **npm (フォールバック 2)**: `npm exec eslint <target>`

## 一般的なコマンド

### 1. プロジェクト全体のリンティング
```bash
bun x eslint .
```

### 2. 特定のファイルのチェックと自動修正
```bash
bun x eslint <file_path> --fix
```

### 3. 設定ファイルの初期化 (新規プロジェクト時)
```bash
bun x eslint --init
```

## トラブルシューティング

- **コマンドが見つからない場合**: `bun install eslint --save-dev` を実行して、ローカルにインストールされているか確認してください。
- **設定エラー (Flat Config)**: ESLint v9 以降は `eslint.config.js` を使用します。古い `.eslintrc` 形式との互換性に注意してください。
- **実行権限エラー**: Windows 環境では実行ポリシーを確認してください。
