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

function isPrivateHost(hostname: string): boolean {
  if (
    hostname === "localhost" ||
    hostname === "0.0.0.0" ||
    hostname === "[::1]"
  ) {
    return true;
  }
  // IPv4 private ranges
  const ipv4 = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4) {
    const [, a, b] = ipv4.map(Number);
    if (a === 127) return true; // 127.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 0) return true; // 0.0.0.0/8
  }
  return false;
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
  if (isPrivateHost(parsed.hostname)) {
    throw new Error("baseUrl must not point to a private/internal address");
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

export async function encrypt(payload: {
  baseUrl: string;
  username: string;
  password: string;
}): Promise<string> {
  validateBaseUrl(payload.baseUrl);
  const secretKey = await getSecretKey();
  const iat = Math.floor(Date.now() / 1000);
  const exp = iat + 24 * 60 * 60;

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
