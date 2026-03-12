# MCP Streamable HTTP トランスポート

> MCP仕様バージョン 2025-03-26 に基づく。

## 概要

Streamable HTTP は、MCP サーバーをHTTP経由で提供するトランスポート方式。
単一のエンドポイント（例: `/mcp`）で POST / GET / DELETE を処理する。

## プロトコルの詳細

### エンドポイント構成

| メソッド | 用途 | レスポンス |
|---------|------|-----------|
| `POST /mcp` | クライアント → サーバーのJSON-RPCメッセージ送信 | `application/json` or `text/event-stream` |
| `GET /mcp` | サーバー → クライアントのSSEストリーム開始 | `text/event-stream` |
| `DELETE /mcp` | セッション終了 | `200 OK` |

### POST リクエスト

- ボディ: JSON-RPCリクエスト/通知/レスポンス（単体またはバッチ配列）
- `Accept` ヘッダーに `application/json` と `text/event-stream` の両方を含める必要がある
- 通知/レスポンスのみの場合: サーバーは `202 Accepted` を返す（ボディなし）
- リクエストを含む場合: `application/json` で即座に返すか、`text/event-stream` でSSEストリームを開始

### セッション管理

1. **セッション開始**: `initialize` リクエスト時にサーバーが `Mcp-Session-Id` ヘッダーでセッションIDを返す
2. **セッション継続**: クライアントは全リクエストに `Mcp-Session-Id` ヘッダーを含める
3. **セッション終了（サーバー側）**: `404 Not Found` を返す → クライアントは新しいセッションを開始
4. **セッション終了（クライアント側）**: `DELETE` リクエストを送信

### 必須ヘッダー

| ヘッダー | 方向 | 説明 |
|---------|------|------|
| `Mcp-Session-Id` | 双方向 | セッション識別子（初回initialize後） |
| `MCP-Protocol-Version` | クライアント→サーバー | プロトコルバージョン（例: `2025-03-26`） |
| `Accept` | クライアント→サーバー | `application/json, text/event-stream` |
| `Authorization` | クライアント→サーバー | `Bearer <token>`（認証時） |

## 認証（OAuth 2.1）

MCP仕様では、HTTP トランスポートの認証に OAuth 2.1 を採用している。

### 認証フロー

```
1. クライアントがMCPサーバーにアクセス
2. サーバーが 401 Unauthorized を返す
3. クライアントが /.well-known/oauth-authorization-server を取得
4. （オプション）動的クライアント登録 POST /register
5. PKCEのcode_verifier/code_challengeを生成
6. ユーザーをブラウザで認可エンドポイントにリダイレクト
7. ユーザーがログイン・認可
8. 認可サーバーがコールバックURLにリダイレクト（認可コード付き）
9. クライアントがトークンエンドポイントで認可コードをトークンに交換
10. 以降、全リクエストに Authorization: Bearer <token> を付与
```

### 本プロジェクトでの実装

MCP仕様の OAuth 2.1 フローに従いつつ、トークンの中身をJWE暗号化されたkintoneクレデンシャルとする。

- **認可エンドポイント** (`/authorize`): ログイン画面を表示
- **トークンエンドポイント** (`/token`): 認可コードをJWEトークンに交換
- **メタデータエンドポイント** (`/.well-known/oauth-authorization-server`): OAuth Server Metadata
- トークンは `Authorization: Bearer <JWEトークン>` として毎リクエストに含まれる
- サーバーはJWEトークンを共通鍵で復号し、kintoneクレデンシャルを取得

## TypeScript SDK での実装

### WebStandardStreamableHTTPServerTransport

プロトタイプ時は Node.js の `IncomingMessage`/`ServerResponse` を使う `StreamableHTTPServerTransport` を
検討していたが、MCP SDK が提供する `WebStandardStreamableHTTPServerTransport` を採用した。
Web標準の `Request` / `Response` ベースで動作し、Honoとの統合がよりシンプルになる。

```typescript
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

const transport = new WebStandardStreamableHTTPServerTransport({
  sessionIdGenerator: () => crypto.randomUUID(),
  onsessioninitialized: (id) => {
    // セッション管理に登録
  },
});
```

**主要メソッド:**

| メソッド | 説明 |
|---------|------|
| `handleRequest(request: Request)` | Web標準 Request を処理し Response を返す |
| `close()` | トランスポートを閉じる |
| `sessionId` | 生成されたセッションID |

### Honoとの統合

`WebStandardStreamableHTTPServerTransport.handleRequest()` は Web標準の `Request` を受け取り
`Response` を返す。Hono の `c.req.raw` で Web標準 `Request` にアクセスできるため、
`c.env.incoming`/`c.env.outgoing` を使うBindingsパターンは不要。

```typescript
import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";

const app = new Hono();

app.post("/mcp", async (c) => {
  // ... transport の取得/生成 ...

  // c.req.raw で Web標準 Request を渡し、Response を返す
  return transport.handleRequest(c.req.raw);
});

app.get("/mcp", async (c) => {
  // SSEストリームも同様に動作する
  return transport.handleRequest(c.req.raw);
});

serve({ fetch: app.fetch, port: 3000 });
```

**ポイント:**
- `c.req.raw` で Web標準 `Request` を取得し、そのまま `handleRequest()` に渡す
- `handleRequest()` が `Response` を返すため、Honoのレスポンスとして直接使用可能（バイパス不要）
- Bindings の型宣言も不要で、コードがシンプル
- CORSやログなど、MCPエンドポイント以外のルートではHonoのミドルウェアを通常通り利用可能
