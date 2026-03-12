import { afterEach, describe, expect, it, vi } from "vitest";
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
      });
      sessions.set("recent-1", {
        transport: createMockTransport(),
        lastAccessedAt: recent,
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
      });
      sessions.set("middle", {
        transport: createMockTransport(),
        lastAccessedAt: 200,
      });
      sessions.set("newest", {
        transport: createMockTransport(),
        lastAccessedAt: 300,
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
