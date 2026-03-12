import {
  KintoneRestAPIClient,
  KintoneRestAPIError,
} from "@kintone/rest-api-client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

describe("wrapWithErrorHandling timer cleanup", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function createTestServer(): McpServer {
    return new McpServer({ name: "test", version: "0.0.0" });
  }

  function createMockClient(): KintoneRestAPIClient {
    return new KintoneRestAPIClient({
      baseUrl: "https://example.cybozu.com",
      auth: { username: "test", password: "test" },
    });
  }

  it("should not leave pending timers after a successful tool call", async () => {
    const server = createTestServer();
    const client = createMockClient();
    const registerSpy = vi.spyOn(server, "registerTool");

    registerKintoneTools(server, client);

    // Get the wrapped callback registered for the first tool
    const wrappedCallback = registerSpy.mock.calls[0][2] as (
      ...args: unknown[]
    ) => Promise<unknown>;

    // The wrapped callback calls the underlying tool callback internally.
    // We need to mock the underlying network call so it resolves successfully.
    // Since wrapWithErrorHandling wraps the callback from createToolCallback,
    // we call the wrapped callback directly — it will fail (no real kintone),
    // but we can test timer behavior by checking timer count.

    // Instead, let's re-register with a mock callback that resolves immediately.
    const server2 = createTestServer();
    const registerSpy2 = vi.spyOn(server2, "registerTool");

    // We can't easily inject a mock callback through registerKintoneTools,
    // so we'll call the wrapped function and check timers.
    // Let's use the first approach: register tools and grab a wrapped callback.
    registerKintoneTools(server2, client);

    // Get the first registered wrapped callback
    const wrapped = registerSpy2.mock.calls[0][2] as (
      ...args: unknown[]
    ) => Promise<unknown>;

    const timerCountBefore = vi.getTimerCount();

    // Call the wrapped callback — it will try to call kintone and fail,
    // but the timeout timer will be set regardless.
    // We expect the call to fail (no real kintone server), but the timer
    // should still be cleaned up after the promise settles.
    const callPromise = wrapped({ app: "1" }).catch(() => {
      // expected to fail — no real kintone
    });

    // Let microtasks settle (the callback should resolve/reject quickly)
    await vi.advanceTimersByTimeAsync(0);
    await callPromise;

    const timerCountAfter = vi.getTimerCount();

    // If the timer was properly cleaned up, no new pending timers should remain.
    // This test should FAIL because clearTimeout is never called.
    expect(timerCountAfter).toBe(timerCountBefore);
  });

  it("should have zero pending timers with 60s delay after the tool call completes", async () => {
    const server = createTestServer();
    const client = createMockClient();
    const registerSpy = vi.spyOn(server, "registerTool");

    registerKintoneTools(server, client);

    const wrapped = registerSpy.mock.calls[0][2] as (
      ...args: unknown[]
    ) => Promise<unknown>;

    const callPromise = wrapped({ app: "1" }).catch(() => {
      // expected to fail — no real kintone
    });

    await vi.advanceTimersByTimeAsync(0);
    await callPromise;

    // After the tool call completes, advancing time by 60s should NOT
    // trigger the timeout rejection. If the timer was cleaned up properly,
    // there would be nothing to fire. But since it isn't cleaned up,
    // the 60-second timer is still pending.
    //
    // We verify this by checking that the timer count is non-zero,
    // which demonstrates the leak. This test should FAIL (the timer remains).
    const pendingTimers = vi.getTimerCount();
    expect(pendingTimers).toBe(0);
  });
});
