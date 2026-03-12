import crypto from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import { type Credentials, decrypt } from "../auth/jwe.js";
import { oauthApp } from "../auth/oauth.js";
import { createKintoneClient } from "../kintone/client.js";
import { registerKintoneTools } from "../kintone/tools.js";
import { createLogger } from "./logger.js";
import { createMcpServer } from "./mcp.js";

const logger = createLogger();

interface SessionEntry {
  transport: WebStandardStreamableHTTPServerTransport;
  lastAccessedAt: number;
}

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
const CLEANUP_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_SESSIONS = 1000;

export const sessions = new Map<string, SessionEntry>();

export function touchSession(sessionId: string): void {
  const entry = sessions.get(sessionId);
  if (entry) {
    entry.lastAccessedAt = Date.now();
  }
}

export function evictOldestSession(): void {
  let oldestId: string | undefined;
  let oldestTime = Number.POSITIVE_INFINITY;
  for (const [id, entry] of sessions) {
    if (entry.lastAccessedAt < oldestTime) {
      oldestTime = entry.lastAccessedAt;
      oldestId = id;
    }
  }
  if (oldestId) {
    const entry = sessions.get(oldestId);
    if (entry) {
      try {
        entry.transport.close();
      } catch {
        // transport already closed or failed — safe to ignore
      }
      sessions.delete(oldestId);
    }
  }
}

export function cleanupExpiredSessions(): void {
  const now = Date.now();
  for (const [id, entry] of sessions) {
    if (now - entry.lastAccessedAt > SESSION_TTL_MS) {
      try {
        entry.transport.close();
      } catch {
        // transport already closed or failed — safe to ignore
      }
      sessions.delete(id);
    }
  }
}

let cleanupTimer: ReturnType<typeof setInterval> | undefined;

export function startSessionCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(cleanupExpiredSessions, CLEANUP_INTERVAL_MS);
  cleanupTimer.unref();
}

export function stopSessionCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = undefined;
  }
}

export const app = new Hono();

// Mount OAuth routes
app.route("/", oauthApp);

app.get("/health", (c) => c.json({ status: "ok" }));

app.post("/mcp", async (c) => {
  const sessionId = c.req.header("mcp-session-id");
  let transport: WebStandardStreamableHTTPServerTransport;

  if (sessionId) {
    const existing = sessions.get(sessionId);
    if (existing) {
      transport = existing.transport;
      touchSession(sessionId);
    } else {
      return c.json({ error: "Session not found" }, 404);
    }
  } else {
    // New session: require Bearer token
    const authHeader = c.req.header("authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return c.json({ error: "Authorization required" }, 401);
    }

    const jweToken = authHeader.slice(7);
    let credentials: Credentials;
    try {
      credentials = await decrypt(jweToken);
    } catch (e) {
      const reason = e instanceof Error ? e.message : "unknown";
      logger.warn("token_decrypt_failed", { reason });
      return c.json({ error: "Invalid or expired token" }, 401);
    }

    logger.info("login_success", { baseUrl: credentials.baseUrl });

    const client = createKintoneClient(credentials);

    if (sessions.size >= MAX_SESSIONS) {
      evictOldestSession();
    }

    transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: (id) => {
        sessions.set(id, {
          transport,
          lastAccessedAt: Date.now(),
        });
        logger.debug("session_created", { sessionId: id });
      },
    });

    const server = createMcpServer();
    registerKintoneTools(server, client);
    await server.connect(transport);

    transport.onclose = () => {
      if (transport.sessionId) {
        logger.debug("session_deleted", {
          sessionId: transport.sessionId,
        });
        sessions.delete(transport.sessionId);
      }
    };
  }

  return transport.handleRequest(c.req.raw);
});

app.get("/mcp", async (c) => {
  const sessionId = c.req.header("mcp-session-id");
  if (!sessionId) {
    return c.json({ error: "No active session" }, 400);
  }

  const entry = sessions.get(sessionId);
  if (!entry) {
    return c.json({ error: "Session not found" }, 404);
  }

  touchSession(sessionId);
  return entry.transport.handleRequest(c.req.raw);
});

app.delete("/mcp", async (c) => {
  const sessionId = c.req.header("mcp-session-id");
  if (!sessionId) {
    return c.json({ error: "No active session" }, 400);
  }

  const entry = sessions.get(sessionId);
  if (!entry) {
    return c.json({ error: "Session not found" }, 404);
  }

  touchSession(sessionId);
  return entry.transport.handleRequest(c.req.raw);
});
