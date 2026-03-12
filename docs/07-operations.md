# 運用設計

## ヘルスチェック

`GET /health` エンドポイントを提供する。

```json
{ "status": "ok" }
```

Docker/Kubernetes のヘルスチェックに利用可能:

```dockerfile
HEALTHCHECK CMD curl -f http://localhost:3000/health || exit 1
```

## ログ

### 方針

- 構造化ログ（JSON形式）で出力する
- **パスワード・トークンは絶対にログに出力しない**
- ログレベル: `error`, `warn`, `info`, `debug`

### ログ出力対象

| イベント | レベル | 出力内容 |
|---------|--------|---------|
| サーバー起動 | info | ポート番号、バージョン |
| OAuthフロー開始 | info | client_id |
| ログイン成功 | info | kintone baseUrl（ユーザー名は出力しない） |
| トークン復号失敗 | warn | エラー種別（改ざん、期限切れ等） |
| kintone APIエラー | error | ステータスコード、ツール名 |
| kintone API呼び出し | debug | ツール名、所要時間 |
| セッション作成/削除 | debug | セッションID |

## エラーハンドリング

### kintone APIエラーのマッピング

| kintone APIレスポンス | MCPサーバーの動作 |
|---------------------|-----------------|
| 401 Unauthorized | MCPクライアントに `401` を返し、再認証を促す |
| 403 Forbidden | ツールのエラーレスポンスとして返す |
| 404 Not Found | ツールのエラーレスポンスとして返す |
| 429 Too Many Requests | ツールのエラーレスポンスとして返す（レート制限超過を通知） |
| 500/503 | ツールのエラーレスポンスとして返す（kintone側の障害を通知） |

### JWEトークン関連エラー

| エラー | 動作 |
|--------|-----|
| トークンなし | `401 Unauthorized` → OAuthフロー開始 |
| 復号失敗（鍵不一致・改ざん） | `401 Unauthorized` → 再認証を促す |
| 有効期限切れ（`exp` 超過） | `401 Unauthorized` → 再認証を促す |
| ペイロード形式不正 | `401 Unauthorized` → 再認証を促す |

## セッション管理

### MCPセッションのクリーンアップ

`StreamableHTTPServerTransport` のセッションは、クライアントが `DELETE /mcp` を
送らずに切断した場合にリークする。以下の戦略で対処する:

- 各セッションに最終アクセス時刻を記録
- 定期的（5分ごと）にスキャンし、一定時間（30分）アクセスがないセッションを自動削除
- セッション数の上限を設け（1000）、超過時は最も古いセッションを終了

### 認可コードのクリーンアップ

認可コードは `Map` にTTL付きで保存する。定期的に期限切れエントリを削除する。

## Graceful Shutdown

`SIGTERM` / `SIGINT` を捕捉し、以下の順序でシャットダウンする:

1. 新規リクエストの受付を停止
2. アクティブなSSE接続にクローズを通知
3. 既存リクエストの完了を待つ（最大30秒）
4. プロセスを終了

## Docker

### Dockerfile の方針

- マルチステージビルド（ビルド用 + 実行用）
- 実行イメージは `node:22-slim`
- 非rootユーザーで実行

### 環境変数の管理

`JWE_SECRET_KEY` は以下の方法で安全に渡す:

```yaml
# docker-compose.yml の例
services:
  kintone-mcp:
    image: ghcr.io/macrat/remote-kintone-mcp-server
    ports:
      - "3000:3000"
    env_file:
      - .env  # JWE_SECRET_KEY=... を記載
```

**注意**: `docker run` の `-e` オプションで毎回ランダム生成すると、
コンテナ再起動のたびに鍵が変わり全トークンが無効化される。
鍵は事前に生成し、`.env` ファイルやシークレット管理サービスで固定管理すること。
