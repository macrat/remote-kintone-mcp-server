import {
  createToolCallback,
  tools,
} from "@kintone/mcp-server/dist/tools/index.js";
import { KintoneRestAPIError } from "@kintone/rest-api-client";
import type { KintoneRestAPIClient } from "@kintone/rest-api-client";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createLogger } from "../server/logger.js";

const logger = createLogger();

const EXCLUDED_TOOLS = ["kintone-download-file"];

export function formatKintoneError(error: KintoneRestAPIError): string {
  if (error.status === 401) {
    return "Authentication failed. Please re-authenticate with kintone.";
  }
  if (error.status === 403) {
    return `Permission denied: ${error.message}`;
  }
  if (error.status === 404) {
    return `Not found: ${error.message}`;
  }
  if (error.status === 429) {
    return "Rate limit exceeded. Please try again later.";
  }
  if (error.status >= 500) {
    return `kintone server error (${error.status}): ${error.message}`;
  }
  return error.message;
}

// biome-ignore lint/suspicious/noExplicitAny: wrapping untyped callback from internal module
function wrapWithErrorHandling(toolName: string, callback: any): any {
  // biome-ignore lint/suspicious/noExplicitAny: callback args from internal module
  return async (...args: any[]) => {
    const start = Date.now();
    try {
      const result = await callback(...args);
      logger.debug("kintone_api_call", {
        tool: toolName,
        durationMs: Date.now() - start,
      });
      return result;
    } catch (error) {
      const durationMs = Date.now() - start;

      if (error instanceof KintoneRestAPIError) {
        logger.error("kintone_api_error", {
          tool: toolName,
          status: error.status,
          code: error.code,
          durationMs,
        });
        return {
          content: [{ type: "text", text: formatKintoneError(error) }],
          isError: true,
        };
      }

      logger.error("kintone_api_error", {
        tool: toolName,
        message: error instanceof Error ? error.message : "unknown",
        durationMs,
      });
      return {
        content: [
          {
            type: "text",
            text: error instanceof Error ? error.message : "Unknown error",
          },
        ],
        isError: true,
      };
    }
  };
}

export function registerKintoneTools(
  server: McpServer,
  client: KintoneRestAPIClient,
): void {
  for (const tool of tools) {
    if (EXCLUDED_TOOLS.includes(tool.name)) {
      continue;
    }
    const callback = createToolCallback(tool.callback, {
      client,
      attachmentsDir: undefined,
    });
    server.registerTool(
      tool.name,
      tool.config,
      wrapWithErrorHandling(tool.name, callback),
    );
  }
}
