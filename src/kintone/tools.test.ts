import {
  KintoneRestAPIClient,
  KintoneRestAPIError,
} from "@kintone/rest-api-client";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  formatKintoneError,
  registerKintoneTools,
  wrapWithErrorHandling,
} from "./tools.js";

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
    registerKintoneTools(server, client);

    // Re-register with a mock callback that resolves immediately.
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

  it("should abort the original callback via AbortSignal when timeout occurs", async () => {
    // This test verifies that wrapWithErrorHandling passes an AbortSignal
    // to the callback and aborts it on timeout. Currently, wrapWithErrorHandling
    // does NOT pass an AbortSignal, so this test is expected to FAIL.
    let receivedSignal: AbortSignal | undefined;

    const slowCallback = async (
      _args: unknown,
      options?: { signal?: AbortSignal },
    ) => {
      receivedSignal = options?.signal;
      // Simulate a long-running operation that respects AbortSignal
      return new Promise((_resolve, reject) => {
        if (receivedSignal) {
          receivedSignal.addEventListener("abort", () => {
            reject(new Error("aborted"));
          });
        }
        // Never resolves on its own — relies on timeout
      });
    };

    const wrapped = wrapWithErrorHandling("test-tool", slowCallback);

    const resultPromise = wrapped({ app: "1" });

    // Advance past the 60s timeout
    await vi.advanceTimersByTimeAsync(60_000);

    const result = await resultPromise;

    // The call should have timed out
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain("timed out");

    // The callback should have received an AbortSignal that is now aborted.
    // This assertion will FAIL because the current implementation does not
    // pass an AbortSignal to the callback.
    expect(receivedSignal).toBeDefined();
    expect(receivedSignal?.aborted).toBe(true);
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
