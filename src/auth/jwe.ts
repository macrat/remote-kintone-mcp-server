import { CompactEncrypt, compactDecrypt } from "jose";

export interface Credentials {
  baseUrl: string;
  username: string;
  password: string;
  iat: number;
  exp: number;
}

let cachedKey: CryptoKey | null = null;

export async function getSecretKey(): Promise<CryptoKey> {
  if (cachedKey) return cachedKey;

  const envKey = process.env.JWE_SECRET_KEY;
  if (!envKey) {
    throw new Error("JWE_SECRET_KEY environment variable is not set");
  }

  const keyBytes = Buffer.from(envKey, "base64");
  if (keyBytes.length !== 32) {
    throw new Error("JWE_SECRET_KEY must be 32 bytes (256 bits)");
  }

  cachedKey = await crypto.subtle.importKey(
    "raw",
    keyBytes,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
  return cachedKey;
}

export function resetKeyCache(): void {
  cachedKey = null;
}

function validateBaseUrl(url: string): void {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("baseUrl is not a valid URL");
  }
  if (parsed.protocol !== "https:") {
    throw new Error("baseUrl must use HTTPS");
  }
}

function validateCredentials(data: unknown): Credentials {
  if (
    typeof data !== "object" ||
    data === null ||
    typeof (data as Record<string, unknown>).baseUrl !== "string" ||
    typeof (data as Record<string, unknown>).username !== "string" ||
    typeof (data as Record<string, unknown>).password !== "string" ||
    typeof (data as Record<string, unknown>).iat !== "number" ||
    typeof (data as Record<string, unknown>).exp !== "number"
  ) {
    throw new Error("Invalid token payload");
  }
  return data as Credentials;
}

const DEFAULT_SESSION_EXPIRY_HOURS = 24;

function getSessionExpirySeconds(): number {
  const envValue = process.env.SESSION_EXPIRY_HOURS;
  if (!envValue) return DEFAULT_SESSION_EXPIRY_HOURS * 60 * 60;
  const hours = Number(envValue);
  if (Number.isNaN(hours) || hours <= 0) {
    throw new Error("SESSION_EXPIRY_HOURS must be a positive number");
  }
  return hours * 60 * 60;
}

export async function encrypt(payload: {
  baseUrl: string;
  username: string;
  password: string;
}): Promise<string> {
  validateBaseUrl(payload.baseUrl);
  const secretKey = await getSecretKey();
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + getSessionExpirySeconds();

  const data: Credentials = {
    ...payload,
    iat,
    exp,
  };

  const jwe = await new CompactEncrypt(
    new TextEncoder().encode(JSON.stringify(data)),
  )
    .setProtectedHeader({ alg: "dir", enc: "A256GCM" })
    .encrypt(secretKey);

  return jwe;
}

export async function decrypt(jwe: string): Promise<Credentials> {
  const secretKey = await getSecretKey();
  const { plaintext } = await compactDecrypt(jwe, secretKey);
  const credentials = validateCredentials(
    JSON.parse(new TextDecoder().decode(plaintext)),
  );

  const now = Math.floor(Date.now() / 1000);
  if (credentials.exp <= now) {
    throw new Error("Token has expired");
  }

  return credentials;
}
