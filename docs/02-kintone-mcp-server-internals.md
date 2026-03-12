# 公式 kintone MCP サーバーの内部構造

> **注意**: このドキュメントは `@kintone/mcp-server@1.3.6` の内部構造を調査したものです。
> 公式にサポートされた使い方ではないため、バージョンアップ時に互換性が壊れる可能性があります。
> バージョンは `package.json` で固定してください（`^` を外す）。

> **設計判断: ライブラリimport vs stdioプロキシ**
>
> 代替案として、公式MCPサーバーをstdioプロセスとしてユーザーごとに起動し、
> Streamable HTTPからstdioへのプロトコル変換プロキシとして動作させる方式も検討した。
> stdioプロキシ方式は内部APIに依存しない利点があるが、ユーザーごとにプロセスが必要で
> リソース消費が大きい。ライブラリimportの方が軽量でシンプルなため採用した。
> 内部API依存のリスクは以下で管理する:
> - `@kintone/mcp-server` のバージョンを固定（`^` なし）
> - Dependabotで定期的にアップデートを検知
> - ユニットテスト/E2Eテストで破壊的変更を検出
> - 起動時にimportの可否を検証し、失敗時に明確なエラーメッセージを出す

## パッケージ情報

- **パッケージ名**: `@kintone/mcp-server`
- **ライセンス**: Apache-2.0
- **エントリーポイント**: `dist/index.js`（CLIとしての起動スクリプト）
- **依存関係**:
  - `@kintone/rest-api-client` — kintone REST APIクライアント
  - `@modelcontextprotocol/sdk` — MCP公式SDK
  - `zod` — スキーマバリデーション
  - `file-type` — ファイル種別判定
  - `https-proxy-agent` — HTTPSプロキシ対応

## 内部モジュール構成

```
dist/
├── index.js           # CLI起動スクリプト（StdioServerTransport使用）
├── version.js         # バージョン定数
├── server/
│   ├── index.js       # createServer() — McpServerの生成
│   └── tool-filters.js # ツールの有効/無効判定
├── config/
│   ├── index.js       # 設定値の取得関数群
│   ├── parser.js      # 環境変数/CLIオプションの解析
│   ├── schema.js      # Zodスキーマ（設定のバリデーション）
│   └── command-line.js # CLIオプションの定義
├── client/
│   └── index.js       # getKintoneClient()（シングルトン）
├── tools/
│   ├── index.js       # tools配列の定義、createToolCallback
│   ├── factory.js     # createTool(), createToolCallback()
│   └── kintone/
│       ├── app/       # アプリ関連ツール群
│       ├── record/    # レコード関連ツール群
│       └── file/      # ファイル関連ツール群
└── schema/            # 共通Zodスキーマ
```

## 主要なexport・関数

### `createServer(options)` — `dist/server/index.js`

McpServer インスタンスを生成し、全ツールを登録して返す。

```typescript
// 簡略化したコード
export const createServer = (options) => {
  const server = new McpServer({ name: options.name, version: options.version });
  const client = getKintoneClient(options.config.clientConfig);
  const toolCondition = options.config.toolConditionConfig;
  const attachmentsDir = options.config.fileConfig.attachmentsDir;

  tools
    .filter((tool) => shouldEnableTool(tool.name, toolCondition))
    .forEach((tool) =>
      server.registerTool(
        tool.name,
        tool.config,
        createToolCallback(tool.callback, { client, attachmentsDir })
      )
    );

  return server;
};
```

**問題点**: `getKintoneClient()` がシングルトンのため、マルチユーザーでは使えない。

### `tools` 配列 — `dist/tools/index.js`

全ツール定義の配列。各要素は以下の形式:

```typescript
{
  name: string;           // ツール名 (例: "kintone-get-records")
  config: {               // McpServer.registerTool() に渡す設定
    title: string;
    description: string;
    inputSchema: Record<string, ZodSchema>;
    outputSchema?: Record<string, ZodSchema>;
  };
  callback: (args, options: { client: KintoneRestAPIClient, attachmentsDir?: string }) => Promise<ToolResult>;
}
```

### `createToolCallback(callback, options)` — `dist/tools/factory.js`

```typescript
// ツールのコールバックに options を部分適用するヘルパー
export const createToolCallback = (callback, options) => {
  return (args) => callback(args, options);
};
```

## 提供されるツール一覧（v1.3.6時点）

| ツール名 | カテゴリ | 説明 |
|---------|---------|------|
| `kintone-get-app` | アプリ | アプリ情報の取得 |
| `kintone-get-apps` | アプリ | アプリ一覧の取得 |
| `kintone-get-form-fields` | アプリ | フォームフィールド定義の取得 |
| `kintone-get-form-layout` | アプリ | フォームレイアウトの取得 |
| `kintone-update-form-fields` | アプリ | フォームフィールドの更新 |
| `kintone-update-form-layout` | アプリ | フォームレイアウトの更新 |
| `kintone-delete-form-fields` | アプリ | フォームフィールドの削除 |
| `kintone-get-process-management` | アプリ | プロセス管理設定の取得 |
| `kintone-get-app-deploy-status` | アプリ | アプリのデプロイ状態確認 |
| `kintone-get-general-settings` | アプリ | アプリ一般設定の取得 |
| `kintone-add-form-fields` | アプリ | フォームフィールドの追加 |
| `kintone-add-app` | アプリ | アプリの新規作成 |
| `kintone-deploy-app` | アプリ | アプリのデプロイ |
| `kintone-update-general-settings` | アプリ | アプリ一般設定の更新 |
| `kintone-add-records` | レコード | レコードの追加 |
| `kintone-delete-records` | レコード | レコードの削除 |
| `kintone-get-records` | レコード | レコードの取得（フィルター対応） |
| `kintone-update-records` | レコード | レコードの更新 |
| `kintone-update-statuses` | レコード | プロセスステータスの更新 |
| `kintone-download-file` | ファイル | 添付ファイルのダウンロード |

> **注**: README によると、添付ファイルのダウンロード (`kintone-download-file`) は
> remote-kintone-mcp-server では非対応とする予定。ツール登録時にフィルタで除外する。

## KintoneRestAPIClient の生成

公式サーバー内の `getKintoneClient()` はシングルトンなので使えない。
代わりに `@kintone/rest-api-client` の `KintoneRestAPIClient` を直接生成する。

```typescript
import { KintoneRestAPIClient } from "@kintone/rest-api-client";

// ユーザーごとに新しいクライアントを生成
const client = new KintoneRestAPIClient({
  baseUrl: "https://example.cybozu.com",
  auth: {
    username: "login-id",
    password: "password",
  },
});
```

`@kintone/rest-api-client` は `@kintone/mcp-server` の依存関係に含まれるため、
別途インストールする必要はない。ただし、バージョンを固定したい場合は明示的にインストールする。

## 本プロジェクトでの利用方法

```typescript
import { tools, createToolCallback } from "@kintone/mcp-server/dist/tools/index.js";
import { KintoneRestAPIClient } from "@kintone/rest-api-client";

// ユーザーのクレデンシャルからクライアントを生成
function createKintoneClient(credentials: {
  baseUrl: string;
  username: string;
  password: string;
}): KintoneRestAPIClient {
  return new KintoneRestAPIClient({
    baseUrl: credentials.baseUrl,
    auth: {
      username: credentials.username,
      password: credentials.password,
    },
  });
}

// MCPサーバーにツールを登録
function registerKintoneTools(
  server: McpServer,
  client: KintoneRestAPIClient,
) {
  const EXCLUDED_TOOLS = ["kintone-download-file"]; // 非対応ツール

  tools
    .filter((tool) => !EXCLUDED_TOOLS.includes(tool.name))
    .forEach((tool) =>
      server.registerTool(
        tool.name,
        tool.config,
        createToolCallback(tool.callback, { client, attachmentsDir: undefined })
      )
    );
}
```

## バージョンアップ時の確認ポイント

公式サーバーをバージョンアップする際は、以下の点を確認してください:

1. **`dist/tools/index.js`** — `tools` 配列と `createToolCallback` がexportされているか
2. **`dist/tools/factory.js`** — `createToolCallback` のシグネチャが変わっていないか
3. **ツールのcallbackの第2引数** — `{ client, attachmentsDir }` の形式が維持されているか
4. **`package.json`に`exports`フィールド** — 追加された場合、サブパスimportがブロックされる可能性がある
5. **新しいツール** — 追加されたツールが自動的に含まれるか確認
