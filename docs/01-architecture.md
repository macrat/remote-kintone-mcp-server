# アーキテクチャ概要

## 全体構成

```mermaid
graph TB
    subgraph クライアント側
        User([ユーザー])
        Client[MCPクライアント<br>Claude Desktop / Claude Code]
        Browser[ブラウザ]
    end

    subgraph remote-kintone-mcp-server
        subgraph Hono HTTPサーバー
            MCP_EP[MCP エンドポイント<br>POST/GET/DELETE /mcp]
            Auth_EP[認証エンドポイント<br>/authorize, /token<br>/.well-known/oauth-authorization-server]
            Login[ログイン画面<br>HTML/CSS]
        end

        Transport[StreamableHTTPServerTransport<br>セッション管理]
        AuthLayer[認証レイヤー<br>JWEトークン復号<br>jose / dir+A256GCM]
        ToolLayer[ツール転送レイヤー<br>公式tools配列を登録<br>ユーザーごとのKintoneRestAPIClient]
    end

    subgraph 外部依存
        KintoneSDK["@kintone/mcp-server<br>(ライブラリimport)<br>tools配列 + createToolCallback"]
        RestClient["@kintone/rest-api-client<br>KintoneRestAPIClient"]
        KintoneAPI[kintone REST API<br>https://example.cybozu.com]
    end

    Client -- "Streamable HTTP<br>Authorization: Bearer &lt;JWE&gt;" --> MCP_EP
    Client -- "OAuthフロー開始" --> Auth_EP
    Auth_EP -- "リダイレクト" --> Browser
    User -- "ID/パスワード入力" --> Login
    Login -- "JWEトークン発行" --> Auth_EP
    Auth_EP -- "トークン返却" --> Client

    MCP_EP --> Transport
    Transport --> AuthLayer
    AuthLayer --> ToolLayer
    ToolLayer --> KintoneSDK
    ToolLayer --> RestClient
    RestClient -- "HTTPS" --> KintoneAPI
```

## リクエストフロー

```mermaid
sequenceDiagram
    actor User as ユーザー
    participant Client as MCPクライアント
    participant Server as remote-kintone-mcp-server
    participant Kintone as kintone REST API

    Note over Client, Server: 初回接続: OAuth風認証フロー
    Client->>Server: POST /mcp (initialize)
    Server-->>Client: 401 Unauthorized

    Client->>Server: GET /.well-known/oauth-authorization-server
    Server-->>Client: OAuth メタデータ

    Client->>Server: GET /authorize?response_type=code&...
    Server-->>Client: ログイン画面へリダイレクト

    User->>Server: ログインID/パスワードを入力
    Server->>Server: クレデンシャルをJWEで暗号化し認可コードとして保存
    Server-->>Client: コールバックURLにリダイレクト（認可コード付き）

    Client->>Server: POST /token (認可コード → トークン交換)
    Server-->>Client: JWEトークン（=アクセストークン）

    Note over Client, Server: 以降: 通常のMCPリクエスト
    loop ツール呼び出し
        Client->>Server: POST /mcp (tools/call)<br>Authorization: Bearer <JWEトークン>
        Server->>Server: JWEトークンを共通鍵で復号
        Server->>Kintone: kintone REST API呼び出し<br>（復号したID/パスワードで認証）
        Kintone-->>Server: APIレスポンス
        Server-->>Client: MCPレスポンス
    end
```

## コンポーネント構成

### 1. HTTPサーバー（Hono）

- Streamable HTTP方式のMCPエンドポイント (`POST/GET/DELETE /mcp`)
- OAuth風の認証エンドポイント（ログイン画面、トークン発行）
- ログイン画面の提供

### 2. MCP Streamable HTTP トランスポート

- `@modelcontextprotocol/sdk` の `StreamableHTTPServerTransport` を使用
- セッション管理（`Mcp-Session-Id` ヘッダー）
- JSON-RPC 2.0 over HTTP/SSE

### 3. 認証レイヤー

- OAuth 2.1フローに準拠した認証（MCP仕様に基づく）
- JWE（JSON Web Encryption）によるクレデンシャルの暗号化
- `jose` ライブラリで共通鍵暗号（dir + A256GCM）

### 4. ツール転送レイヤー

- 公式MCPサーバーの `tools` 配列を直接import
- ユーザーごとに `KintoneRestAPIClient` を生成
- `createToolCallback` でツールとクライアントを紐付け

## 技術スタック

| 要素 | 選定技術 | 理由 |
|------|---------|------|
| 言語 | TypeScript | MCP SDK との相性、型安全性 |
| HTTPフレームワーク | Hono | 軽量・高速、TypeScriptファースト |
| MCPプロトコル | `@modelcontextprotocol/sdk` | 公式SDK |
| kintone連携 | `@kintone/mcp-server` (ライブラリimport) | 公式ツール定義を直接再利用 |
| kintone APIクライアント | `@kintone/rest-api-client` | 公式SDKから依存として利用 |
| JWE暗号化 | `jose` | TypeScript製、ゼロ依存、JWEフルサポート |
| ランタイム | Node.js >= 22 | kintone公式MCPサーバーの要件に合わせる |

> **設計判断: Hono vs Express**
>
> MCP SDKのサンプルはすべてExpressだが、TypeScriptの型安全性を最大限活用するためHonoを採用した。
> `StreamableHTTPServerTransport.handleRequest()` はNode.jsの `IncomingMessage`/`ServerResponse` を
> 期待するが、`@hono/node-server` の `c.env.incoming`/`c.env.outgoing` 経由でアクセスできることを
> プロトタイプで検証済み（SSEストリーミング含む）。

## ディレクトリ構成（予定）

```
remote-kintone-mcp-server/
├── src/
│   ├── index.ts              # エントリーポイント
│   ├── server/
│   │   ├── mcp.ts            # MCPサーバー・トランスポート設定
│   │   └── http.ts           # Hono HTTPサーバー
│   ├── auth/
│   │   ├── oauth.ts          # OAuth風認証フロー
│   │   ├── jwe.ts            # JWEトークンの暗号化・復号
│   │   └── login.ts          # ログイン画面HTML
│   └── kintone/
│       ├── tools.ts          # 公式ツールの登録・転送
│       └── client.ts         # KintoneRestAPIClient生成
├── docs/                     # 設計ドキュメント
├── package.json
├── tsconfig.json
└── Dockerfile
```
