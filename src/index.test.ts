import { serve } from "@hono/node-server";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { app } from "./app.js";

describe("MCP Server", () => {
  let server: ReturnType<typeof serve>;
  let baseUrl: string;

  beforeAll(() => {
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

  it("initialize succeeds via Streamable HTTP", async () => {
    const transport = new StreamableHTTPClientTransport(
      new URL(`${baseUrl}/mcp`),
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
