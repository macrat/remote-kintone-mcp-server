import {
  KintoneRestAPIClient,
  KintoneRestAPIError,
} from "@kintone/rest-api-client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { describe, expect, it, vi } from "vitest";
import { formatKintoneError, registerKintoneTools } from "./tools.js";

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

describe("formatKintoneError", () => {
  function makeError(
    status: number,
    message = "test error",
  ): KintoneRestAPIError {
    return new KintoneRestAPIError({
      data: { id: "test-id", code: "TEST", message },
      status,
      statusText: "Error",
      headers: {},
    });
  }

  it("returns re-authentication message for 401", () => {
    const result = formatKintoneError(makeError(401));
    expect(result).toContain("re-authenticate");
  });

  it("returns permission denied message for 403", () => {
    const result = formatKintoneError(makeError(403, "No access"));
    expect(result).toContain("Permission denied");
  });

  it("returns not found message for 404", () => {
    const result = formatKintoneError(makeError(404, "App not found"));
    expect(result).toContain("Not found");
  });

  it("returns rate limit message for 429", () => {
    const result = formatKintoneError(makeError(429));
    expect(result).toContain("Rate limit");
  });

  it("returns server error message for 500", () => {
    const result = formatKintoneError(makeError(500, "Internal error"));
    expect(result).toContain("server error");
    expect(result).toContain("500");
  });

  it("returns raw message for other status codes", () => {
    const error = makeError(400, "Bad request");
    const result = formatKintoneError(error);
    expect(result).toContain("Bad request");
  });
});
