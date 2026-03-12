import crypto from "node:crypto";

export interface ClientMetadata {
  redirect_uris: string[];
  client_name?: string;
  [key: string]: unknown;
}

export interface ClientInfo {
  client_id: string;
  client_secret: string;
  metadata: ClientMetadata;
  createdAt: number;
}

const MAX_CLIENTS = 1000;
const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

const store = new Map<string, ClientInfo>();

function isExpired(client: ClientInfo): boolean {
  return Date.now() - client.createdAt >= TTL_MS;
}

function purgeExpired(): void {
  for (const [id, client] of store) {
    if (isExpired(client)) {
      store.delete(id);
    }
  }
}

function evictOldest(): void {
  const oldestKey = store.keys().next().value;
  if (oldestKey !== undefined) {
    store.delete(oldestKey);
  }
}

export function register(metadata: ClientMetadata): ClientInfo {
  if (
    !Array.isArray(metadata.redirect_uris) ||
    metadata.redirect_uris.length === 0
  ) {
    throw new Error("redirect_uris is required and must be a non-empty array");
  }
  for (const uri of metadata.redirect_uris) {
    let parsed: URL;
    try {
      parsed = new URL(uri);
    } catch {
      throw new Error(`Invalid redirect_uri: ${uri}`);
    }
    if (parsed.hash) {
      throw new Error("redirect_uri must not contain a fragment");
    }
    const isLocalhost =
      parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
    const enforceHttps = process.env.ALLOW_HTTP_REDIRECT !== "true";
    if (enforceHttps && !isLocalhost && parsed.protocol !== "https:") {
      throw new Error(
        "redirect_uri must use HTTPS (HTTP is only allowed for localhost). Set ALLOW_HTTP_REDIRECT=true to disable this check.",
      );
    }
  }

  if (store.size >= MAX_CLIENTS) {
    purgeExpired();
  }

  if (store.size >= MAX_CLIENTS) {
    evictOldest();
  }

  const client_id = crypto.randomUUID();
  const client_secret = crypto.randomUUID();

  const info: ClientInfo = {
    client_id,
    client_secret,
    metadata,
    createdAt: Date.now(),
  };
  store.set(client_id, info);
  return info;
}

export function validate(clientId: string, clientSecret: string): boolean {
  const client = store.get(clientId);
  if (!client) return false;

  if (isExpired(client)) {
    store.delete(clientId);
    return false;
  }

  const expected = Buffer.from(client.client_secret);
  const actual = Buffer.from(clientSecret);
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

export function get(clientId: string): ClientInfo | undefined {
  const client = store.get(clientId);
  if (!client) return undefined;

  if (isExpired(client)) {
    store.delete(clientId);
    return undefined;
  }

  return client;
}

export function clearStore(): void {
  store.clear();
}
