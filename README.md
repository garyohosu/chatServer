# Chat App - メール認証付きチャットアプリ

## 📝 プロジェクト概要

メールアドレスとパスワードによる仮登録後、Resendでメール認証を行い、本登録が完了した後にリアルタイムチャットに参加できるWebアプリケーションです。

### 主な機能

- ✅ メールアドレス・パスワードによるユーザー登録
- ✅ Resend APIによるメール認証
- ✅ Lucia Authによるセッション管理
- ✅ メッセージ投稿・閲覧機能（3秒ごとにポーリング）
- ✅ Cloudflare D1による永続化
- ✅ セキュアなパスワードハッシュ化（SHA-256 + Salt）

## 🌐 URLs

- **開発環境**: https://3000-ilw8e35d9sf74wv8mzurp-cc2fbc16.sandbox.novita.ai
- **本番環境**: デプロイ後に追加
- **GitHub**: デプロイ後に追加

## 🏗️ 技術スタック

- **フレームワーク**: Hono v4
- **ランタイム**: Cloudflare Workers / Pages
- **データベース**: Cloudflare D1 (SQLite)
- **認証**: Lucia Auth v3
- **メール送信**: Resend API
- **フロントエンド**: TailwindCSS (CDN)
- **開発ツール**: Wrangler, Vite, PM2

## 📊 データベース構造

### users テーブル
- `id` (TEXT): ユーザーID
- `email` (TEXT): メールアドレス（ユニーク）
- `password_hash` (TEXT): パスワードハッシュ
- `verified` (INTEGER): メール認証済みフラグ（0/1）
- `created_at` (INTEGER): 作成日時（ミリ秒）

### email_verification_tokens テーブル
- `token` (TEXT): 認証トークン
- `user_id` (TEXT): ユーザーID
- `expires_at` (INTEGER): 有効期限（ミリ秒）

### sessions テーブル
- `id` (TEXT): セッションID
- `user_id` (TEXT): ユーザーID
- `expires_at` (INTEGER): 有効期限

### messages テーブル
- `id` (INTEGER): メッセージID（自動採番）
- `user_id` (TEXT): 投稿者ID
- `message` (TEXT): メッセージ内容
- `created_at` (INTEGER): 投稿日時（ミリ秒）

## 🚀 セットアップ手順

### 1. 依存関係のインストール

```bash
npm install
```

### 2. 環境変数の設定

`.dev.vars` ファイルを作成し、以下を設定：

```bash
# Resend API Key (https://resend.com/api-keys から取得)
RESEND_API_KEY=re_xxxxx

# Base URL for email verification links
BASE_URL=http://localhost:3000
```

### 3. データベースのマイグレーション

```bash
# ローカルデータベースにマイグレーションを適用
npm run db:migrate:local

# テストデータを投入（オプション）
npm run db:seed
```

### 4. 開発サーバーの起動

```bash
# ビルド
npm run build

# PM2で起動
pm2 start ecosystem.config.cjs

# ログ確認
pm2 logs webapp --nostream
```

### 5. アプリケーションへアクセス

開発環境: http://localhost:3000

## 📱 使い方

### ユーザー登録フロー

1. `/register` にアクセス
2. メールアドレスとパスワード（8文字以上）を入力
3. 「登録」ボタンをクリック
4. 登録したメールアドレスに認証メールが届く
5. メール内のリンクをクリック
6. 自動的にログインし、`/chat` にリダイレクト

### ログインフロー

1. `/login` にアクセス
2. メールアドレスとパスワードを入力
3. 「ログイン」ボタンをクリック
4. `/chat` にリダイレクト

### チャット機能

- メッセージ入力欄にテキストを入力し、「送信」ボタンをクリック
- メッセージは3秒ごとに自動更新
- 自分のメッセージは青色、他のユーザーのメッセージは灰色で表示

## 🔧 npm スクリプト

```bash
# 開発
npm run dev                 # Vite開発サーバー
npm run dev:sandbox         # Wranglerローカルサーバー（PM2推奨）
npm run build               # ビルド

# データベース
npm run db:migrate:local    # ローカルマイグレーション
npm run db:migrate:prod     # 本番マイグレーション
npm run db:seed             # テストデータ投入
npm run db:reset            # ローカルDBリセット
npm run db:console:local    # ローカルDBコンソール
npm run db:console:prod     # 本番DBコンソール

# デプロイ
npm run deploy              # Cloudflare Pagesにデプロイ

# ユーティリティ
npm run cf-typegen          # CloudflareBindings型生成
npm run clean-port          # ポート3000をクリーンアップ
```

## 📡 API エンドポイント

### 認証系

- `POST /api/register` - ユーザー登録
- `GET /verify?token=xxx` - メール認証
- `POST /api/login` - ログイン
- `POST /api/logout` - ログアウト
- `GET /api/user` - 現在のユーザー情報取得

### チャット系

- `POST /api/messages` - メッセージ投稿
- `GET /api/messages?after=<timestamp>` - メッセージ取得

### ページ

- `GET /` - ホームページ
- `GET /register` - 登録ページ
- `GET /login` - ログインページ
- `GET /chat` - チャットページ

## 🔐 セキュリティ対策

- パスワードは SHA-256 + ランダムソルトでハッシュ化
- セッション管理は Lucia Auth を使用
- メール認証トークンは60分で有効期限切れ
- HTTPS接続必須（Cloudflare Pages）
- CORS設定済み（APIエンドポイントのみ）

## 🚀 本番デプロイ手順

### 1. Cloudflare API Keyの設定

```bash
# Cloudflare API Keyをセットアップ
# （ツールが自動的にガイド）
```

### 2. 本番D1データベースの作成

```bash
npx wrangler d1 create webapp-production
```

作成されたdatabase_idを`wrangler.toml`に設定：

```toml
[[d1_databases]]
binding = "DB"
database_name = "webapp-production"
database_id = "your-database-id-here"
```

### 3. マイグレーションの適用

```bash
npm run db:migrate:prod
```

### 4. 環境変数の設定

```bash
# Resend API Key
npx wrangler pages secret put RESEND_API_KEY

# Base URL（本番URL）
npx wrangler pages secret put BASE_URL
```

### 5. デプロイ

```bash
npm run deploy
```

## 📂 プロジェクト構造

```
webapp/
├── src/
│   ├── index.tsx           # メインアプリケーション
│   └── lib/
│       ├── auth.ts         # Lucia Auth設定
│       ├── utils.ts        # パスワードハッシュ・トークン生成
│       └── resend.ts       # Resend API統合
├── migrations/
│   └── 0001_initial_schema.sql  # DBマイグレーション
├── public/                 # 静的ファイル
├── dist/                   # ビルド出力
├── .dev.vars               # 開発環境変数
├── wrangler.toml           # Cloudflare設定
├── ecosystem.config.cjs    # PM2設定
├── package.json            # 依存関係
└── README.md               # このファイル
```

## 🐛 トラブルシューティング

### ポート3000が使用中

```bash
npm run clean-port
```

### データベースがリセットされない

```bash
npm run db:reset
```

### メールが送信されない

1. `.dev.vars` に正しいRESEND_API_KEYが設定されているか確認
2. Resendのダッシュボードでドメイン認証を確認
3. 開発環境では `noreply@yourdomain.com` を認証済みドメインに変更

### セッションエラー

ブラウザのCookieをクリアしてから再度ログイン

## 📄 ライセンス

MIT

## 👤 作者

hantani - AI時代の創作研究者・技術系ライター

## 🔗 関連リンク

- [Hono Documentation](https://hono.dev/)
- [Cloudflare D1 Documentation](https://developers.cloudflare.com/d1/)
- [Lucia Auth Documentation](https://lucia-auth.com/)
- [Resend Documentation](https://resend.com/docs)

---

**最終更新**: 2025-11-20
**ステータス**: ✅ ローカル開発環境で動作確認済み
**次のステップ**: Cloudflare Pagesへのデプロイ
