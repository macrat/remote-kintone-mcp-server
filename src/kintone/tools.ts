import {
  createToolCallback,
  tools,
} from "@kintone/mcp-server/dist/tools/index.js";
import type { KintoneRestAPIClient } from "@kintone/rest-api-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

const EXCLUDED_TOOLS = ["kintone-download-file"];

export function registerKintoneTools(
  server: McpServer,
  client: KintoneRestAPIClient,
): void {
  for (const tool of tools) {
    if (EXCLUDED_TOOLS.includes(tool.name)) {
      continue;
    }
    server.registerTool(
      tool.name,
      tool.config,
      createToolCallback(tool.callback, {
        client,
        attachmentsDir: undefined,
      }),
    );
  }
}
