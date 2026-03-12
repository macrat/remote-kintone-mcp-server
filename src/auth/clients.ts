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
}

const store = new Map<string, ClientInfo>();

export function register(metadata: ClientMetadata): ClientInfo {
  if (
    !Array.isArray(metadata.redirect_uris) ||
    metadata.redirect_uris.length === 0
  ) {
    throw new Error("redirect_uris is required and must be a non-empty array");
  }
  for (const uri of metadata.redirect_uris) {
    try {
      new URL(uri);
    } catch {
      throw new Error(`Invalid redirect_uri: ${uri}`);
    }
  }

  const client_id = crypto.randomUUID();
  const client_secret = crypto.randomUUID();

  const info: ClientInfo = { client_id, client_secret, metadata };
  store.set(client_id, info);
  return info;
}

export function validate(clientId: string, clientSecret: string): boolean {
  const client = store.get(clientId);
  if (!client) return false;

  const expected = Buffer.from(client.client_secret);
  const actual = Buffer.from(clientSecret);
  if (expected.length !== actual.length) return false;
  return crypto.timingSafeEqual(expected, actual);
}

export function get(clientId: string): ClientInfo | undefined {
  return store.get(clientId);
}

export function clearStore(): void {
  store.clear();
}
