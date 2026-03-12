import { serve } from "@hono/node-server";
import {
  app,
  sessions,
  startSessionCleanup,
  stopSessionCleanup,
} from "./server/http.js";
import { createLogger } from "./server/logger.js";

const logger = createLogger();
const port = Number(process.env.PORT) || 3000;

const server = serve({ fetch: app.fetch, port }, (info) => {
  logger.info("server_start", { port: info.port });
});

startSessionCleanup();

let shuttingDown = false;

async function shutdown(signal: string): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;

  logger.info("shutdown_start", { signal });

  stopSessionCleanup();

  // Close all active transports (notifies SSE clients)
  for (const [id, entry] of sessions) {
    entry.transport.close();
    sessions.delete(id);
  }

  // Close the HTTP server, waiting up to 30s for in-flight requests
  await new Promise<void>((resolve) => {
    const forceTimeout = setTimeout(() => {
      logger.warn("shutdown_forced", { reason: "30s timeout" });
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
