import crypto from "node:crypto";

interface AuthorizationCodeEntry {
  jwe: string;
  codeChallenge: string;
  redirectUri: string;
  clientId: string;
  expiresAt: number;
}

const store = new Map<string, AuthorizationCodeEntry>();
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

const MAX_CODES = 10000;

export class StoreFullError extends Error {
  constructor() {
    super("Authorization code store is full");
    this.name = "StoreFullError";
  }
}

export function generate(data: {
  jwe: string;
  codeChallenge: string;
  redirectUri: string;
  clientId: string;
}): string {
  if (store.size >= MAX_CODES) {
    throw new StoreFullError();
  }

  const code = crypto.randomUUID();
  const expiresAt = Date.now() + 10 * 60 * 1000; // 10 minutes

  store.set(code, {
    ...data,
    expiresAt,
  });

  return code;
}

export function lookup(code: string): AuthorizationCodeEntry | undefined {
  const entry = store.get(code);
  if (!entry) return undefined;

  // Check expiry
  if (entry.expiresAt <= Date.now()) {
    store.delete(code);
    return undefined;
  }

  return entry;
}

export function consume(code: string): AuthorizationCodeEntry | undefined {
  const entry = store.get(code);
  if (!entry) return undefined;

  // Check expiry before consuming
  if (entry.expiresAt <= Date.now()) {
    store.delete(code);
    return undefined;
  }

  store.delete(code);
  return entry;
}

export function startCleanup(): void {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [code, entry] of store) {
      if (entry.expiresAt <= now) {
        store.delete(code);
      }
    }
  }, 60 * 1000); // every 1 minute
  cleanupTimer.unref();
}

export function stopCleanup(): void {
  if (cleanupTimer) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}

export function clearStore(): void {
  store.clear();
}
