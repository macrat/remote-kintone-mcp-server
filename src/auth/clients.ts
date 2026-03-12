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
  const client_id = crypto.randomUUID();
  const client_secret = crypto.randomUUID();

  const info: ClientInfo = { client_id, client_secret, metadata };
  store.set(client_id, info);
  return info;
}

export function validate(clientId: string, clientSecret: string): boolean {
  const client = store.get(clientId);
  if (!client) return false;
  return client.client_secret === clientSecret;
}

export function get(clientId: string): ClientInfo | undefined {
  return store.get(clientId);
}

export function clearStore(): void {
  store.clear();
}
