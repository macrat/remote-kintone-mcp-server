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

function isPrivateIPv4(hostname: string): boolean {
  const ipv4 = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (ipv4) {
    const [, a, b] = ipv4.map(Number);
    if (a === 127) return true; // 127.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
    if (a === 169 && b === 254) return true; // 169.254.0.0/16 (link-local, cloud metadata)
    if (a === 0) return true; // 0.0.0.0/8
  }
  return false;
}

function isPrivateHost(hostname: string): boolean {
  if (hostname === "localhost" || hostname === "0.0.0.0") {
    return true;
  }

  // IPv4 private ranges
  if (isPrivateIPv4(hostname)) return true;

  // IPv6: strip brackets if present (URL parser wraps IPv6 in brackets)
  if (hostname.startsWith("[") && hostname.endsWith("]")) {
    const ipv6 = hostname.slice(1, -1).toLowerCase();

    // Unspecified address
    if (ipv6 === "::") return true;

    // Loopback (::1 in any expanded form — URL parser normalizes to ::1)
    if (ipv6 === "::1" || ipv6 === "0000:0000:0000:0000:0000:0000:0000:0001") {
      return true;
    }

    // Link-local (fe80::/10)
    if (ipv6.startsWith("fe80:") || ipv6.startsWith("fe80%")) return true;

    // ULA (fc00::/7 — fc and fd prefixes)
    if (ipv6.startsWith("fc") || ipv6.startsWith("fd")) return true;

    // IPv4-mapped IPv6 (::ffff:x.x.x.x or ::ffff:HHHH:HHHH)
    const v4mappedDotted = ipv6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (v4mappedDotted) {
      return isPrivateIPv4(v4mappedDotted[1]);
    }
    const v4mappedHex = ipv6.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (v4mappedHex) {
      const hi = Number.parseInt(v4mappedHex[1], 16);
      const lo = Number.parseInt(v4mappedHex[2], 16);
      const a = (hi >> 8) & 0xff;
      const b = hi & 0xff;
      const c = (lo >> 8) & 0xff;
      const d = lo & 0xff;
      return isPrivateIPv4(`${a}.${b}.${c}.${d}`);
    }
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
