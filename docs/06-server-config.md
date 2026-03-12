# サーバー設定

## 環境変数

| 環境変数 | 必須 | デフォルト | 説明 |
|---------|------|----------|------|
| `PORT` | No | `3000` | HTTPサーバーのポート番号 |
| `HOST` | No | `0.0.0.0` | バインドするホスト |
| `JWE_SECRET_KEY` | Yes | — | JWE暗号化/復号用の共通鍵（Base64エンコードされた32バイト） |

## Docker での起動

```bash
docker run -p 3000:3000 \
  -e JWE_SECRET_KEY="事前に生成した鍵をここに指定" \
  ghcr.io/macrat/remote-kintone-mcp-server
```

> **注意**: 毎回ランダム生成（`$(openssl rand ...)`）するとコンテナ再起動で全トークンが無効化される。
> 鍵は事前に生成し固定すること。

## 共通鍵の生成

初回セットアップ時に一度だけ実行する。

```bash
# 256bit（32バイト）のランダムな共通鍵を生成し、環境変数に設定
export JWE_SECRET_KEY="$(openssl rand -base64 32)"
```

## MCPクライアントの設定例

### Claude Desktop

```json
{
  "mcpServers": {
    "kintone": {
      "url": "http://your-server-address:3000/mcp"
    }
  }
}
```

### Claude Code

```json
{
  "mcpServers": {
    "kintone": {
      "url": "http://your-server-address:3000/mcp"
    }
  }
}
```

Streamable HTTP方式のMCPサーバーなので、`command` ではなく `url` で指定する。
認証はMCP仕様のOAuth 2.1フローにより、初回アクセス時に自動でブラウザが開く。
