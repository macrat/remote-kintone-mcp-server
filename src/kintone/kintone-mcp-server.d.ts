declare module "@kintone/mcp-server/dist/tools/index.js" {
  import type { KintoneRestAPIClient } from "@kintone/rest-api-client";
  import type { ZodRawShape } from "zod";

  interface KintoneTool {
    name: string;
    config: {
      title: string;
      description: string;
      inputSchema: ZodRawShape;
      outputSchema?: ZodRawShape;
    };
    // biome-ignore lint/suspicious/noExplicitAny: internal untyped module
    callback: (...args: any[]) => any;
  }

  export const tools: KintoneTool[];
  export function createToolCallback(
    callback: KintoneTool["callback"],
    options: {
      client: KintoneRestAPIClient;
      attachmentsDir: string | undefined;
    },
    // biome-ignore lint/suspicious/noExplicitAny: internal untyped module
  ): (...args: any[]) => any;
}
