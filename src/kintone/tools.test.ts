import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { KintoneRestAPIClient } from "@kintone/rest-api-client";
import { describe, expect, it, vi } from "vitest";
import { registerKintoneTools } from "./tools.js";

describe("registerKintoneTools", () => {
  function createTestServer(): McpServer {
    return new McpServer({ name: "test", version: "0.0.0" });
  }

  function createMockClient(): KintoneRestAPIClient {
    return new KintoneRestAPIClient({
      baseUrl: "https://example.cybozu.com",
      auth: { username: "test", password: "test" },
    });
  }

  it("registers kintone tools on the McpServer", () => {
    const server = createTestServer();
    const client = createMockClient();
    const spy = vi.spyOn(server, "registerTool");

    registerKintoneTools(server, client);

    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(18);
  });

  it("excludes kintone-download-file tool", () => {
    const server = createTestServer();
    const client = createMockClient();
    const spy = vi.spyOn(server, "registerTool");

    registerKintoneTools(server, client);

    const registeredNames = spy.mock.calls.map((call) => call[0]);
    expect(registeredNames).not.toContain("kintone-download-file");
  });

  it("registers exactly 19 tools (v1.3.6 has 20 tools minus download-file)", () => {
    const server = createTestServer();
    const client = createMockClient();
    const spy = vi.spyOn(server, "registerTool");

    registerKintoneTools(server, client);

    expect(spy.mock.calls.length).toBe(19);
  });
});
