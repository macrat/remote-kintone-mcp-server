import { serve } from "@hono/node-server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "./app.js";
import { encrypt, resetKeyCache } from "./auth/jwe.js";

describe("MCP Server", () => {
  let server: ReturnType<typeof serve>;
  let baseUrl: string;
  let jweToken: string;

  beforeAll(async () => {
    // Set up JWE key for testing
    process.env.JWE_SECRET_KEY = Buffer.from(
      new Uint8Array(32).fill(1),
    ).toString("base64");
    resetKeyCache();

    jweToken = await encrypt({
      baseUrl: "https://example.cybozu.com",
      username: "test-user",
      password: "test-password",
    });

    server = serve({ fetch: app.fetch, port: 0 });
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    baseUrl = `http://localhost:${port}`;
  });

  afterAll(() => {
    return new Promise<void>((resolve, reject) => {
      server.close((err) => (err ? reject(err) : resolve()));
    });
  });

  it("GET /health returns ok", async () => {
    const res = await fetch(`${baseUrl}/health`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok" });
  });

  it("POST /mcp without auth returns 401", async () => {
    const res = await fetch(`${baseUrl}/mcp`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        method: "initialize",
        params: {},
        id: 1,
      }),
    });
    expect(res.status).toBe(401);
  });

  it("initialize succeeds via Streamable HTTP with Bearer token", async () => {
    const transport = new StreamableHTTPClientTransport(
      new URL(`${baseUrl}/mcp`),
      {
        requestInit: {
          headers: {
            Authorization: `Bearer ${jweToken}`,
          },
        },
      },
    );
    const client = new Client({
      name: "test-client",
      version: "1.0.0",
    });

    await client.connect(transport);

    expect(client.getServerVersion()).toEqual(
      expect.objectContaining({
        name: "remote-kintone-mcp-server",
        version: "0.1.0",
      }),
    );

    await client.close();
  });
});
