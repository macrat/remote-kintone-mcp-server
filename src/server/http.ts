import crypto from "node:crypto";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { Hono } from "hono";
import { createMcpServer } from "./mcp.js";

// TODO: セッション TTL / 上限を実装してメモリリークを防ぐ
const transports = new Map<
	string,
	WebStandardStreamableHTTPServerTransport
>();

export const app = new Hono();

app.get("/health", (c) => c.json({ status: "ok" }));

app.post("/mcp", async (c) => {
	const sessionId = c.req.header("mcp-session-id");
	let transport: WebStandardStreamableHTTPServerTransport;

	if (sessionId) {
		const existing = transports.get(sessionId);
		if (existing) {
			transport = existing;
		} else {
			return c.json({ error: "Session not found" }, 404);
		}
	} else {
		transport = new WebStandardStreamableHTTPServerTransport({
			sessionIdGenerator: () => crypto.randomUUID(),
			onsessioninitialized: (id) => {
				transports.set(id, transport);
			},
		});

		const server = createMcpServer();
		await server.connect(transport);

		transport.onclose = () => {
			if (transport.sessionId) {
				transports.delete(transport.sessionId);
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

	const transport = transports.get(sessionId);
	if (!transport) {
		return c.json({ error: "Session not found" }, 404);
	}

	return transport.handleRequest(c.req.raw);
});

app.delete("/mcp", async (c) => {
	const sessionId = c.req.header("mcp-session-id");
	if (!sessionId) {
		return c.json({ error: "No active session" }, 400);
	}

	const transport = transports.get(sessionId);
	if (!transport) {
		return c.json({ error: "Session not found" }, 404);
	}

	return transport.handleRequest(c.req.raw);
});
