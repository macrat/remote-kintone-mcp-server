import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  app,
  cleanupExpiredSessions,
  evictOldestSession,
  sessions,
  touchSession,
} from "./http.js";

function createMockTransport() {
  return { close: vi.fn() } as unknown as (typeof sessions extends Map<
    string,
    infer V
  >
    ? V
    : never)["transport"];
}

describe("session management", () => {
  afterEach(() => {
    sessions.clear();
  });

  describe("cleanupExpiredSessions", () => {
    it("removes sessions older than 30 minutes", () => {
      const old = Date.now() - 31 * 60 * 1000;
      const recent = Date.now();

      sessions.set("old-1", {
        transport: createMockTransport(),
        lastAccessedAt: old,
        tokenExpiresAt: Date.now() + 3600_000,
      });
      sessions.set("recent-1", {
        transport: createMockTransport(),
        lastAccessedAt: recent,
        tokenExpiresAt: Date.now() + 3600_000,
      });

      cleanupExpiredSessions();

      expect(sessions.has("old-1")).toBe(false);
      expect(sessions.has("recent-1")).toBe(true);
    });

    it("calls transport.close on expired sessions", () => {
      const transport = createMockTransport();
      sessions.set("expired", {
        transport,
        lastAccessedAt: Date.now() - 31 * 60 * 1000,
        tokenExpiresAt: Date.now() + 3600_000,
      });

      cleanupExpiredSessions();

      expect(transport.close).toHaveBeenCalled();
    });
  });

  describe("evictOldestSession", () => {
    it("removes the session with the earliest lastAccessedAt", () => {
      sessions.set("oldest", {
        transport: createMockTransport(),
        lastAccessedAt: 100,
        tokenExpiresAt: Date.now() + 3600_000,
      });
      sessions.set("middle", {
        transport: createMockTransport(),
        lastAccessedAt: 200,
        tokenExpiresAt: Date.now() + 3600_000,
      });
      sessions.set("newest", {
        transport: createMockTransport(),
        lastAccessedAt: 300,
        tokenExpiresAt: Date.now() + 3600_000,
      });

      evictOldestSession();

      expect(sessions.has("oldest")).toBe(false);
      expect(sessions.has("middle")).toBe(true);
      expect(sessions.has("newest")).toBe(true);
    });

    it("calls transport.close on the evicted session", () => {
      const transport = createMockTransport();
      sessions.set("only", {
        transport,
        lastAccessedAt: 100,
        tokenExpiresAt: Date.now() + 3600_000,
      });

      evictOldestSession();

      expect(transport.close).toHaveBeenCalled();
    });

    it("does nothing when sessions map is empty", () => {
      expect(() => evictOldestSession()).not.toThrow();
    });
  });

  describe("touchSession", () => {
    it("updates lastAccessedAt to current time", () => {
      const initialTime = 1000;
      sessions.set("touch-me", {
        transport: createMockTransport(),
        lastAccessedAt: initialTime,
        tokenExpiresAt: Date.now() + 3600_000,
      });

      const before = Date.now();
      touchSession("touch-me");
      const after = Date.now();

      const entry = sessions.get("touch-me");
      expect(entry).toBeDefined();
      expect(entry?.lastAccessedAt).toBeGreaterThanOrEqual(before);
      expect(entry?.lastAccessedAt).toBeLessThanOrEqual(after);
    });

    it("does nothing for non-existent session", () => {
      expect(() => touchSession("nonexistent")).not.toThrow();
    });
  });
});

describe("GET and DELETE /mcp error cases", () => {
  afterEach(() => {
    sessions.clear();
  });

  describe("GET /mcp", () => {
    it("without mcp-session-id header returns 400", async () => {
      const res = await app.request("/mcp", { method: "GET" });
      expect(res.status).toBe(400);
    });

    it("with non-existent session ID returns 404", async () => {
      const res = await app.request("/mcp", {
        method: "GET",
        headers: { "mcp-session-id": "nonexistent" },
      });
      expect(res.status).toBe(404);
    });
  });

  describe("DELETE /mcp", () => {
    it("without mcp-session-id header returns 400", async () => {
      const res = await app.request("/mcp", { method: "DELETE" });
      expect(res.status).toBe(400);
    });

    it("with non-existent session ID returns 404", async () => {
      const res = await app.request("/mcp", {
        method: "DELETE",
        headers: { "mcp-session-id": "nonexistent" },
      });
      expect(res.status).toBe(404);
    });
  });
});

describe("token expiry enforcement on existing sessions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    sessions.clear();
    vi.useRealTimers();
  });

  function createMockTransportWithHandleRequest() {
    return {
      close: vi.fn(),
      handleRequest: vi
        .fn()
        .mockResolvedValue(new Response("ok", { status: 200 })),
    } as unknown as (typeof sessions extends Map<string, infer V>
      ? V
      : never)["transport"];
  }

  describe("POST /mcp", () => {
    it("should reject requests to an existing session after token expiry", async () => {
      // Simulate a session that was created with a token expiring in 1 hour
      const tokenExpiresAt = Date.now() + 60 * 60 * 1000; // 1 hour from now
      const sessionId = "session-with-expiring-token";

      sessions.set(sessionId, {
        transport: createMockTransportWithHandleRequest(),
        lastAccessedAt: Date.now(),
        tokenExpiresAt,
      });

      // Advance time past the token's expiry (1 hour + 1 second)
      vi.advanceTimersByTime(60 * 60 * 1000 + 1000);

      // Keep the session alive by updating lastAccessedAt so session TTL doesn't kick in
      touchSession(sessionId);

      // This request uses the session ID (no Bearer token).
      // The token has expired, so this SHOULD be rejected (401 or 403).
      // Currently, the code only checks touchSession and continues.
      const res = await app.request("/mcp", {
        method: "POST",
        headers: {
          "mcp-session-id": sessionId,
          "content-type": "application/json",
        },
        body: JSON.stringify({ jsonrpc: "2.0", method: "ping", id: 1 }),
      });

      // The session's token has expired — the server should reject this request.
      // A 401 status indicates the token is no longer valid.
      expect(res.status).toBe(401);
    });
  });

  describe("GET /mcp", () => {
    it("should reject SSE connections to a session after token expiry", async () => {
      const sessionId = "session-sse-expired-token";

      sessions.set(sessionId, {
        transport: createMockTransportWithHandleRequest(),
        lastAccessedAt: Date.now(),
        tokenExpiresAt: Date.now() + 3600_000,
      });

      // Advance time past token expiry (1 hour + 1 second)
      vi.advanceTimersByTime(3600_000 + 1000);

      // Keep session alive via TTL perspective
      touchSession(sessionId);

      const res = await app.request("/mcp", {
        method: "GET",
        headers: { "mcp-session-id": sessionId },
      });

      // Should reject because the token has expired
      expect(res.status).toBe(401);
    });
  });

  describe("DELETE /mcp", () => {
    it("should reject session deletion after token expiry", async () => {
      const sessionId = "session-delete-expired-token";

      sessions.set(sessionId, {
        transport: createMockTransportWithHandleRequest(),
        lastAccessedAt: Date.now(),
        tokenExpiresAt: Date.now() + 3600_000,
      });

      // Advance time past token expiry (1 hour + 1 second)
      vi.advanceTimersByTime(3600_000 + 1000);

      // Keep session alive via TTL perspective
      touchSession(sessionId);

      const res = await app.request("/mcp", {
        method: "DELETE",
        headers: { "mcp-session-id": sessionId },
      });

      // Should reject because the token has expired
      expect(res.status).toBe(401);
    });
  });

  describe("cleanupExpiredSessions", () => {
    it("should also remove sessions whose token has expired even if recently accessed", () => {
      const sessionId = "session-token-expired-but-active";

      sessions.set(sessionId, {
        transport: createMockTransportWithHandleRequest(),
        lastAccessedAt: Date.now(),
        tokenExpiresAt: Date.now() + 3600_000,
      });

      // Advance time past token expiry but keep session "active"
      vi.advanceTimersByTime(3600_000 + 1000);
      touchSession(sessionId);

      cleanupExpiredSessions();

      // The session's token has expired, so cleanup should remove it
      // even though it was recently accessed (within 30min TTL).
      expect(sessions.has(sessionId)).toBe(false);
    });
  });
});
