import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { KintoneRestAPIClient } from "@kintone/rest-api-client";
// @ts-expect-error -- internal module with no type definitions
import { tools, createToolCallback } from "@kintone/mcp-server/dist/tools/index.js";

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
