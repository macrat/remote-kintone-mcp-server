import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clearStore, consume, generate } from "./codes.js";

const sampleData = {
  jwe: "encrypted-token",
  codeChallenge: "challenge123",
  redirectUri: "http://localhost:3000/callback",
  clientId: "client-123",
};

describe("Authorization code store", () => {
  beforeEach(() => {
    clearStore();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    clearStore();
  });

  it("generates a code and consumes it successfully", () => {
    const code = generate(sampleData);
    expect(typeof code).toBe("string");

    const entry = consume(code);
    expect(entry).toBeDefined();
    expect(entry!.jwe).toBe(sampleData.jwe);
    expect(entry!.codeChallenge).toBe(sampleData.codeChallenge);
    expect(entry!.redirectUri).toBe(sampleData.redirectUri);
    expect(entry!.clientId).toBe(sampleData.clientId);
  });

  it("prevents reuse of a consumed code", () => {
    const code = generate(sampleData);

    const first = consume(code);
    expect(first).toBeDefined();

    const second = consume(code);
    expect(second).toBeUndefined();
  });

  it("returns undefined for expired codes", () => {
    const pastTime = Date.now() - 11 * 60 * 1000;
    vi.spyOn(Date, "now").mockReturnValue(pastTime);

    const code = generate(sampleData);

    vi.restoreAllMocks();

    const entry = consume(code);
    expect(entry).toBeUndefined();
  });

  it("returns undefined for non-existent codes", () => {
    const entry = consume("non-existent-code");
    expect(entry).toBeUndefined();
  });
});
