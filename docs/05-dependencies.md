# 依存パッケージ一覧

## 本番依存 (dependencies)

| パッケージ | 用途 | 備考 |
|-----------|------|------|
| `@kintone/mcp-server` | 公式kintone MCPサーバーのツール定義をimport | バージョン固定推奨（`^`なし） |
| `@modelcontextprotocol/sdk` | MCP Streamable HTTPサーバーの実装 | `StreamableHTTPServerTransport` 等 |
| `hono` | HTTPサーバーフレームワーク | ルーティング、ミドルウェア |
| `@hono/node-server` | HonoをNode.jsで動かすアダプター | `serve()` 関数 |
| `jose` | JWE暗号化/復号 | 共通鍵暗号（dir + A256GCM） |

> **注**: `@kintone/rest-api-client` は `@kintone/mcp-server` の依存関係として
> 間接的にインストールされる。明示的にインストールする必要はないが、
> バージョンを固定したい場合は明示的に追加する。

## 開発依存 (devDependencies)

| パッケージ | 用途 |
|-----------|------|
| `typescript` | TypeScriptコンパイラ |
| `@types/node` | Node.js型定義 |
| `tsx` | TypeScript実行（開発用） |
| `vitest` | テストフレームワーク（任意） |

## インストールコマンド

```bash
# 本番依存
npm install @kintone/mcp-server@1.3.6 @modelcontextprotocol/sdk hono @hono/node-server jose

# 開発依存
npm install -D typescript @types/node tsx
```

> `@kintone/mcp-server` は `^` なしでバージョンを固定する。
> 内部APIに依存しているため、意図しないバージョンアップで壊れるリスクを防ぐ。

## Node.js バージョン要件

- **Node.js >= 22** — `@kintone/mcp-server` の `engines` フィールドに合わせる

## package.json の type 設定

`@kintone/mcp-server` は `"type": "module"` (ESM)で配布されている。
本プロジェクトも `"type": "module"` に設定する必要がある。

```json
{
  "type": "module"
}
```

現在の `package.json` は `"type": "commonjs"` になっているため、変更が必要。
