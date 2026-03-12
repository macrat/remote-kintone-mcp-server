import crypto from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { decrypt, encrypt, resetKeyCache } from "./jwe.js";

const TEST_SECRET_KEY = crypto.randomBytes(32).toString("base64");

describe("JWE encrypt/decrypt", () => {
  beforeEach(() => {
    resetKeyCache();
    process.env.JWE_SECRET_KEY = TEST_SECRET_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
    resetKeyCache();
    delete process.env.SESSION_EXPIRY_HOURS;
  });

  it("round-trips credentials through encrypt and decrypt", async () => {
    const payload = {
      baseUrl: "https://example.cybozu.com",
      username: "test-user",
      password: "test-password",
    };

    const jwe = await encrypt(payload);
    expect(typeof jwe).toBe("string");
    expect(jwe.split(".")).toHaveLength(5);

    const result = await decrypt(jwe);
    expect(result.baseUrl).toBe(payload.baseUrl);
    expect(result.username).toBe(payload.username);
    expect(result.password).toBe(payload.password);
    expect(typeof result.iat).toBe("number");
    expect(typeof result.exp).toBe("number");
    expect(result.exp).toBe(result.iat + 24 * 60 * 60);
  });

  it("rejects expired tokens", async () => {
    const payload = {
      baseUrl: "https://example.cybozu.com",
      username: "test-user",
      password: "test-password",
    };

    // Mock Date.now to produce a token that's already expired
    const pastTime = Date.now() - 48 * 60 * 60 * 1000;
    vi.spyOn(Date, "now").mockReturnValue(pastTime);

    const jwe = await encrypt(payload);

    vi.restoreAllMocks();

    await expect(decrypt(jwe)).rejects.toThrow("Token has expired");
  });

  it("rejects tampered tokens", async () => {
    const payload = {
      baseUrl: "https://example.cybozu.com",
      username: "test-user",
      password: "test-password",
    };

    const jwe = await encrypt(payload);
    const parts = jwe.split(".");
    // Tamper with the ciphertext (part 3)
    const tampered = parts[3].split("");
    tampered[0] = tampered[0] === "A" ? "B" : "A";
    parts[3] = tampered.join("");
    const tamperedJwe = parts.join(".");

    await expect(decrypt(tamperedJwe)).rejects.toThrow();
  });

  it("rejects non-HTTPS baseUrl", async () => {
    const payload = {
      baseUrl: "http://example.cybozu.com",
      username: "test-user",
      password: "test-password",
    };

    await expect(encrypt(payload)).rejects.toThrow("baseUrl must use HTTPS");
  });

  it("rejects invalid baseUrl", async () => {
    const payload = {
      baseUrl: "not-a-url",
      username: "test-user",
      password: "test-password",
    };

    await expect(encrypt(payload)).rejects.toThrow(
      "baseUrl is not a valid URL",
    );
  });

  it("rejects invalid key length", async () => {
    process.env.JWE_SECRET_KEY = crypto.randomBytes(16).toString("base64");
    resetKeyCache();

    const payload = {
      baseUrl: "https://example.cybozu.com",
      username: "test-user",
      password: "test-password",
    };

    await expect(encrypt(payload)).rejects.toThrow(
      "JWE_SECRET_KEY must be 32 bytes (256 bits)",
    );
  });

  it("uses SESSION_EXPIRY_HOURS when set", async () => {
    process.env.SESSION_EXPIRY_HOURS = "48";

    const payload = {
      baseUrl: "https://example.cybozu.com",
      username: "test-user",
      password: "test-password",
    };

    const jwe = await encrypt(payload);
    const result = await decrypt(jwe);
    expect(result.exp).toBe(result.iat + 48 * 60 * 60);
  });

  it("throws on invalid SESSION_EXPIRY_HOURS (zero)", async () => {
    process.env.SESSION_EXPIRY_HOURS = "0";

    const payload = {
      baseUrl: "https://example.cybozu.com",
      username: "test-user",
      password: "test-password",
    };

    await expect(encrypt(payload)).rejects.toThrow(
      "SESSION_EXPIRY_HOURS must be a positive number",
    );
  });

  it("throws on invalid SESSION_EXPIRY_HOURS (negative)", async () => {
    process.env.SESSION_EXPIRY_HOURS = "-1";

    const payload = {
      baseUrl: "https://example.cybozu.com",
      username: "test-user",
      password: "test-password",
    };

    await expect(encrypt(payload)).rejects.toThrow(
      "SESSION_EXPIRY_HOURS must be a positive number",
    );
  });

  it("throws on invalid SESSION_EXPIRY_HOURS (non-numeric)", async () => {
    process.env.SESSION_EXPIRY_HOURS = "abc";

    const payload = {
      baseUrl: "https://example.cybozu.com",
      username: "test-user",
      password: "test-password",
    };

    await expect(encrypt(payload)).rejects.toThrow(
      "SESSION_EXPIRY_HOURS must be a positive number",
    );
  });

  it("throws when JWE_SECRET_KEY is not set", async () => {
    delete process.env.JWE_SECRET_KEY;
    resetKeyCache();

    const payload = {
      baseUrl: "https://example.cybozu.com",
      username: "test-user",
      password: "test-password",
    };

    await expect(encrypt(payload)).rejects.toThrow(
      "JWE_SECRET_KEY environment variable is not set",
    );
  });
});
