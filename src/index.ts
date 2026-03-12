import { serve } from "@hono/node-server";
import {
  app,
  sessions,
  startSessionCleanup,
  stopSessionCleanup,
} from "./server/http.js";

const port = Number(process.env.PORT) || 3000;

const server = serve({ fetch: app.fetch, port }, (info) => {
  console.log(`Server running at http://localhost:${info.port}`);
});

startSessionCleanup();

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  console.log(`Received ${signal}, shutting down gracefully...`);

  stopSessionCleanup();

  // Close all active transports (notifies SSE clients)
  for (const [id, entry] of sessions) {
    entry.transport.close();
    sessions.delete(id);
  }

  // Close the HTTP server, waiting up to 30s for in-flight requests
  await new Promise<void>((resolve) => {
    const forceTimeout = setTimeout(() => {
      console.log("Forced shutdown after 30s timeout");
      resolve();
    }, 30_000);
    forceTimeout.unref();

    server.close(() => {
      clearTimeout(forceTimeout);
      resolve();
    });
  });

  process.exit(0);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
