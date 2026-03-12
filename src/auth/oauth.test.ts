import crypto from "node:crypto";
import { base64url } from "jose";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { clearStore as clearClients } from "./clients.js";
import { clearStore as clearCodes } from "./codes.js";
import { resetKeyCache } from "./jwe.js";
import { oauthApp } from "./oauth.js";

const TEST_SECRET_KEY = crypto.randomBytes(32).toString("base64");

async function generatePKCE() {
  const verifier = base64url.encode(crypto.randomBytes(32));
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(verifier),
  );
  const challenge = base64url.encode(new Uint8Array(digest));
  return { verifier, challenge };
}

describe("OAuth endpoints", () => {
  beforeEach(() => {
    resetKeyCache();
    clearClients();
    clearCodes();
    process.env.JWE_SECRET_KEY = TEST_SECRET_KEY;
  });

  afterEach(() => {
    resetKeyCache();
    clearClients();
    clearCodes();
  });

  describe("GET /.well-known/oauth-authorization-server", () => {
    it("returns server metadata", async () => {
      const res = await oauthApp.request(
        "/.well-known/oauth-authorization-server",
      );
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.response_types_supported).toEqual(["code"]);
      expect(body.grant_types_supported).toEqual(["authorization_code"]);
      expect(body.code_challenge_methods_supported).toEqual(["S256"]);
      expect(body.authorization_endpoint).toContain("/authorize");
      expect(body.token_endpoint).toContain("/token");
      expect(body.registration_endpoint).toContain("/register");
    });
  });

  describe("POST /register", () => {
    it("registers a new client", async () => {
      const res = await oauthApp.request("/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          redirect_uris: ["http://localhost:3000/callback"],
          client_name: "test-client",
        }),
      });
      expect(res.status).toBe(201);
      const body = await res.json();
      expect(body.client_id).toBeDefined();
      expect(body.client_secret).toBeDefined();
      expect(body.client_name).toBe("test-client");
    });
  });

  describe("Full OAuth flow", () => {
    it("completes client registration -> authorize -> token exchange", async () => {
      // 1. Register client
      const regRes = await oauthApp.request("/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          redirect_uris: ["http://localhost:3000/callback"],
        }),
      });
      const { client_id, client_secret } = await regRes.json();

      // 2. Generate PKCE
      const { verifier, challenge } = await generatePKCE();

      // 3. GET /authorize (shows login page)
      const authGetRes = await oauthApp.request(
        `/authorize?response_type=code&client_id=${client_id}&redirect_uri=${encodeURIComponent("http://localhost:3000/callback")}&code_challenge=${challenge}&code_challenge_method=S256&state=test-state`,
      );
      expect(authGetRes.status).toBe(200);
      const html = await authGetRes.text();
      expect(html).toContain("kintone ログイン");
      expect(html).toContain(client_id);

      // 4. POST /authorize (submit login form)
      const formData = new URLSearchParams({
        subdomain: "example",
        username: "test-user",
        password: "test-password",
        client_id,
        redirect_uri: "http://localhost:3000/callback",
        code_challenge: challenge,
        code_challenge_method: "S256",
        state: "test-state",
      });

      const authPostRes = await oauthApp.request("/authorize", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
        redirect: "manual",
      });
      expect(authPostRes.status).toBe(302);
      const location = authPostRes.headers.get("location");
      expect(location).toBeDefined();
      const redirectUrl = new URL(location ?? "");
      expect(redirectUrl.searchParams.get("state")).toBe("test-state");
      const code = redirectUrl.searchParams.get("code") ?? "";
      expect(code).toBeDefined();

      // 5. POST /token (exchange code for token)
      const tokenData = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        code_verifier: verifier,
        redirect_uri: "http://localhost:3000/callback",
        client_id,
        client_secret,
      });

      const tokenRes = await oauthApp.request("/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: tokenData.toString(),
      });
      expect(tokenRes.status).toBe(200);
      const tokenBody = await tokenRes.json();
      expect(tokenBody.access_token).toBeDefined();
      expect(tokenBody.token_type).toBe("Bearer");
    });
  });

  describe("PKCE verification", () => {
    it("rejects token exchange with wrong code_verifier", async () => {
      // Register client
      const regRes = await oauthApp.request("/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          redirect_uris: ["http://localhost:3000/callback"],
        }),
      });
      const { client_id, client_secret } = await regRes.json();

      const { challenge } = await generatePKCE();
      const { verifier: wrongVerifier } = await generatePKCE();

      // POST /authorize
      const formData = new URLSearchParams({
        subdomain: "example",
        username: "test-user",
        password: "test-password",
        client_id,
        redirect_uri: "http://localhost:3000/callback",
        code_challenge: challenge,
        code_challenge_method: "S256",
        state: "test-state",
      });

      const authPostRes = await oauthApp.request("/authorize", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
        redirect: "manual",
      });
      const location = authPostRes.headers.get("location") ?? "";
      const code = new URL(location).searchParams.get("code") ?? "";

      // POST /token with wrong verifier
      const tokenData = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        code_verifier: wrongVerifier,
        redirect_uri: "http://localhost:3000/callback",
        client_id,
        client_secret,
      });

      const tokenRes = await oauthApp.request("/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: tokenData.toString(),
      });
      expect(tokenRes.status).toBe(400);
      const body = await tokenRes.json();
      expect(body.error).toBe("invalid_grant");
    });

    it("rejects token exchange with mismatched redirect_uri", async () => {
      // Register client
      const regRes = await oauthApp.request("/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          redirect_uris: ["http://localhost:3000/callback"],
        }),
      });
      const { client_id, client_secret } = await regRes.json();

      const { verifier, challenge } = await generatePKCE();

      // POST /authorize
      const formData = new URLSearchParams({
        subdomain: "example",
        username: "test-user",
        password: "test-password",
        client_id,
        redirect_uri: "http://localhost:3000/callback",
        code_challenge: challenge,
        code_challenge_method: "S256",
        state: "test-state",
      });

      const authPostRes = await oauthApp.request("/authorize", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
        redirect: "manual",
      });
      const location = authPostRes.headers.get("location") ?? "";
      const code = new URL(location).searchParams.get("code") ?? "";

      // POST /token with different redirect_uri
      const tokenData = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        code_verifier: verifier,
        redirect_uri: "http://evil.example.com/steal",
        client_id,
        client_secret,
      });

      const tokenRes = await oauthApp.request("/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: tokenData.toString(),
      });
      expect(tokenRes.status).toBe(400);
      const body = await tokenRes.json();
      expect(body.error).toBe("invalid_grant");
    });

    it("rejects reuse of authorization code", async () => {
      // Register client
      const regRes = await oauthApp.request("/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          redirect_uris: ["http://localhost:3000/callback"],
        }),
      });
      const { client_id, client_secret } = await regRes.json();

      const { verifier, challenge } = await generatePKCE();

      // POST /authorize
      const formData = new URLSearchParams({
        subdomain: "example",
        username: "test-user",
        password: "test-password",
        client_id,
        redirect_uri: "http://localhost:3000/callback",
        code_challenge: challenge,
        code_challenge_method: "S256",
        state: "test-state",
      });

      const authPostRes = await oauthApp.request("/authorize", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
        redirect: "manual",
      });
      const location = authPostRes.headers.get("location") ?? "";
      const code = new URL(location).searchParams.get("code") ?? "";

      // First token exchange - should succeed
      const tokenData = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        code_verifier: verifier,
        redirect_uri: "http://localhost:3000/callback",
        client_id,
        client_secret,
      });

      const tokenRes1 = await oauthApp.request("/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: tokenData.toString(),
      });
      expect(tokenRes1.status).toBe(200);

      // Second token exchange - should fail (code already consumed)
      const tokenRes2 = await oauthApp.request("/token", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: tokenData.toString(),
      });
      expect(tokenRes2.status).toBe(400);
      const body = await tokenRes2.json();
      expect(body.error).toBe("invalid_grant");
    });
  });

  describe("response_type validation (issue #7)", () => {
    // Helper to register a client and build authorize URL params
    async function registerAndBuildParams() {
      const regRes = await oauthApp.request("/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          redirect_uris: ["http://localhost:3000/callback"],
        }),
      });
      const { client_id } = await regRes.json();
      const { challenge } = await generatePKCE();
      return { client_id, challenge };
    }

    it("should show login form when response_type=code", async () => {
      const { client_id, challenge } = await registerAndBuildParams();
      const res = await oauthApp.request(
        `/authorize?response_type=code&client_id=${client_id}&redirect_uri=${encodeURIComponent("http://localhost:3000/callback")}&code_challenge=${challenge}&code_challenge_method=S256&state=test-state`,
      );
      expect(res.status).toBe(200);
      const html = await res.text();
      expect(html).toContain("kintone ログイン");
    });

    it("should reject request when response_type is missing", async () => {
      const { client_id, challenge } = await registerAndBuildParams();
      const res = await oauthApp.request(
        `/authorize?client_id=${client_id}&redirect_uri=${encodeURIComponent("http://localhost:3000/callback")}&code_challenge=${challenge}&code_challenge_method=S256&state=test-state`,
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_request");
    });

    it("should reject request when response_type=token", async () => {
      const { client_id, challenge } = await registerAndBuildParams();
      const res = await oauthApp.request(
        `/authorize?response_type=token&client_id=${client_id}&redirect_uri=${encodeURIComponent("http://localhost:3000/callback")}&code_challenge=${challenge}&code_challenge_method=S256&state=test-state`,
      );
      expect(res.status).toBe(400);
      const body = await res.json();
      expect(body.error).toBe("invalid_request");
    });
  });

  describe("Authorization code premature consumption (issue #1)", () => {
    // Helper: register a client, generate PKCE, authorize, and return everything needed for token exchange
    async function setupAuthorizationCode() {
      const regRes = await oauthApp.request("/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          redirect_uris: ["http://localhost:3000/callback"],
        }),
      });
      const { client_id, client_secret } = await regRes.json();

      const { verifier, challenge } = await generatePKCE();

      const formData = new URLSearchParams({
        subdomain: "example",
        username: "test-user",
        password: "test-password",
        client_id,
        redirect_uri: "http://localhost:3000/callback",
        code_challenge: challenge,
        code_challenge_method: "S256",
        state: "test-state",
      });

      const authPostRes = await oauthApp.request("/authorize", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
        redirect: "manual",
      });
      const location = authPostRes.headers.get("location") ?? "";
      const code = new URL(location).searchParams.get("code") ?? "";

      return { client_id, client_secret, verifier, code };
    }

    // Helper: register a second client to get a different client_id/secret
    async function registerAnotherClient() {
      const regRes = await oauthApp.request("/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          redirect_uris: ["http://localhost:3000/callback"],
        }),
      });
      return await regRes.json();
    }

    it("code should survive a token request with wrong client_id", async () => {
      const { client_id, client_secret, verifier, code } =
        await setupAuthorizationCode();
      const otherClient = await registerAnotherClient();

      // Attempt token exchange with wrong client_id (but valid client credentials for the other client)
      const badTokenData = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        code_verifier: verifier,
        redirect_uri: "http://localhost:3000/callback",
        client_id: otherClient.client_id,
        client_secret: otherClient.client_secret,
      });

      const badRes = await oauthApp.request("/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: badTokenData.toString(),
      });
      expect(badRes.status).toBe(400);

      // Now the legitimate client should still be able to exchange the code
      const goodTokenData = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        code_verifier: verifier,
        redirect_uri: "http://localhost:3000/callback",
        client_id,
        client_secret,
      });

      const goodRes = await oauthApp.request("/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: goodTokenData.toString(),
      });
      // This should succeed, but currently fails because consume() already deleted the code
      expect(goodRes.status).toBe(200);
      const body = await goodRes.json();
      expect(body.access_token).toBeDefined();
      expect(body.token_type).toBe("Bearer");
    });

    it("code should survive a token request with wrong redirect_uri", async () => {
      const { client_id, client_secret, verifier, code } =
        await setupAuthorizationCode();

      // Attempt token exchange with wrong redirect_uri
      const badTokenData = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        code_verifier: verifier,
        redirect_uri: "http://localhost:3000/wrong-callback",
        client_id,
        client_secret,
      });

      const badRes = await oauthApp.request("/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: badTokenData.toString(),
      });
      expect(badRes.status).toBe(400);

      // Now the legitimate client should still be able to exchange the code
      const goodTokenData = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        code_verifier: verifier,
        redirect_uri: "http://localhost:3000/callback",
        client_id,
        client_secret,
      });

      const goodRes = await oauthApp.request("/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: goodTokenData.toString(),
      });
      // This should succeed, but currently fails because consume() already deleted the code
      expect(goodRes.status).toBe(200);
      const body = await goodRes.json();
      expect(body.access_token).toBeDefined();
      expect(body.token_type).toBe("Bearer");
    });

    it("code should survive a token request with wrong code_verifier", async () => {
      // Register client
      const regRes = await oauthApp.request("/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          redirect_uris: ["http://localhost:3000/callback"],
        }),
      });
      const { client_id, client_secret } = await regRes.json();

      // Generate PKCE
      const { verifier: correctVerifier, challenge } = await generatePKCE();
      const { verifier: wrongVerifier } = await generatePKCE();

      // Authorize
      const formData = new URLSearchParams({
        subdomain: "example",
        username: "test-user",
        password: "test-password",
        client_id,
        redirect_uri: "http://localhost:3000/callback",
        code_challenge: challenge,
        code_challenge_method: "S256",
        state: "test-state",
      });

      const authPostRes = await oauthApp.request("/authorize", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: formData.toString(),
        redirect: "manual",
      });
      const location = authPostRes.headers.get("location") ?? "";
      const code = new URL(location).searchParams.get("code") ?? "";

      // First attempt: wrong code_verifier — should fail
      const badTokenData = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        code_verifier: wrongVerifier,
        redirect_uri: "http://localhost:3000/callback",
        client_id,
        client_secret,
      });

      const badRes = await oauthApp.request("/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: badTokenData.toString(),
      });
      expect(badRes.status).toBe(400);

      // Second attempt: correct code_verifier — should succeed
      const goodTokenData = new URLSearchParams({
        grant_type: "authorization_code",
        code,
        code_verifier: correctVerifier,
        redirect_uri: "http://localhost:3000/callback",
        client_id,
        client_secret,
      });

      const goodRes = await oauthApp.request("/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: goodTokenData.toString(),
      });
      // This should succeed, but currently fails because consume() already deleted the code
      expect(goodRes.status).toBe(200);
      const body = await goodRes.json();
      expect(body.access_token).toBeDefined();
      expect(body.token_type).toBe("Bearer");
    });
  });

  describe("POST /authorize subdomain validation", () => {
    // Helper: register a client and generate PKCE challenge
    async function registerClientAndPKCE() {
      const regRes = await oauthApp.request("/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          redirect_uris: ["http://localhost:3000/callback"],
        }),
      });
      const { client_id, client_secret } = await regRes.json();
      const { verifier, challenge } = await generatePKCE();
      return { client_id, client_secret, verifier, challenge };
    }

    // Helper: POST /authorize with given subdomain
    async function postAuthorize(
      subdomain: string,
      clientId: string,
      challenge: string,
    ) {
      const formData = new URLSearchParams({
        subdomain,
        username: "test-user",
        password: "test-password",
        client_id: clientId,
        redirect_uri: "http://localhost:3000/callback",
        code_challenge: challenge,
        code_challenge_method: "S256",
        state: "test-state",
      });

      return oauthApp.request("/authorize", {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: formData.toString(),
        redirect: "manual",
      });
    }

    it("rejects subdomain starting with hyphen", async () => {
      const { client_id, challenge } = await registerClientAndPKCE();
      const res = await postAuthorize("-start", client_id, challenge);
      expect(res.status).toBe(400);
      const html = await res.text();
      expect(html).toContain("サブドメインは英数字とハイフンのみ");
      expect(html).toContain("form");
    });

    it("rejects subdomain ending with hyphen", async () => {
      const { client_id, challenge } = await registerClientAndPKCE();
      const res = await postAuthorize("end-", client_id, challenge);
      expect(res.status).toBe(400);
      const html = await res.text();
      expect(html).toContain("サブドメインは英数字とハイフンのみ");
    });

    it("rejects subdomain with spaces", async () => {
      const { client_id, challenge } = await registerClientAndPKCE();
      const res = await postAuthorize("has spaces", client_id, challenge);
      expect(res.status).toBe(400);
      const html = await res.text();
      expect(html).toContain("サブドメインは英数字とハイフンのみ");
    });

    it("rejects subdomain with dots", async () => {
      const { client_id, challenge } = await registerClientAndPKCE();
      const res = await postAuthorize("has.dots", client_id, challenge);
      expect(res.status).toBe(400);
      const html = await res.text();
      expect(html).toContain("サブドメインは英数字とハイフンのみ");
    });

    it("auto-extracts subdomain from https://example.cybozu.com URL", async () => {
      const { client_id, challenge } = await registerClientAndPKCE();
      const res = await postAuthorize(
        "https://example.cybozu.com",
        client_id,
        challenge,
      );
      expect(res.status).toBe(302);
    });

    it("auto-extracts subdomain from example.cybozu.com (no scheme)", async () => {
      const { client_id, challenge } = await registerClientAndPKCE();
      const res = await postAuthorize(
        "example.cybozu.com",
        client_id,
        challenge,
      );
      expect(res.status).toBe(302);
    });

    it("rejects URL from a different domain", async () => {
      const { client_id, challenge } = await registerClientAndPKCE();
      const res = await postAuthorize(
        "https://example.kintone.com",
        client_id,
        challenge,
      );
      expect(res.status).toBe(400);
      const html = await res.text();
      expect(html).toContain("サブドメインは英数字とハイフンのみ");
    });

    it("accepts single-character subdomain", async () => {
      const { client_id, challenge } = await registerClientAndPKCE();
      const res = await postAuthorize("a", client_id, challenge);
      expect(res.status).toBe(302);
    });

    it("accepts subdomain with hyphens in the middle", async () => {
      const { client_id, challenge } = await registerClientAndPKCE();
      const res = await postAuthorize("my-company", client_id, challenge);
      expect(res.status).toBe(302);
    });

    it("rejects subdomain exceeding 63 characters (DNS label limit)", async () => {
      const { client_id, challenge } = await registerClientAndPKCE();
      const longSubdomain = "a".repeat(64);
      const res = await postAuthorize(longSubdomain, client_id, challenge);
      expect(res.status).toBe(400);
      const html = await res.text();
      expect(html).toContain("サブドメイン");
    });

    it("auto-extracts subdomain from URL with uppercase domain (case-insensitive)", async () => {
      const { client_id, challenge } = await registerClientAndPKCE();
      const res = await postAuthorize(
        "https://example.CYBOZU.COM",
        client_id,
        challenge,
      );
      expect(res.status).toBe(302);
    });

    it("auto-extracts subdomain from URL with path", async () => {
      const { client_id, challenge } = await registerClientAndPKCE();
      const res = await postAuthorize(
        "https://example.cybozu.com/k/1",
        client_id,
        challenge,
      );
      expect(res.status).toBe(302);
    });

    it("auto-extracts subdomain from URL with port", async () => {
      const { client_id, challenge } = await registerClientAndPKCE();
      const res = await postAuthorize(
        "https://example.cybozu.com:443",
        client_id,
        challenge,
      );
      expect(res.status).toBe(302);
    });

    it("trims whitespace from subdomain input", async () => {
      const { client_id, challenge } = await registerClientAndPKCE();
      const res = await postAuthorize(" example ", client_id, challenge);
      expect(res.status).toBe(302);
    });

    it("rejects whitespace-only subdomain input", async () => {
      const { client_id, challenge } = await registerClientAndPKCE();
      const res = await postAuthorize("   ", client_id, challenge);
      expect(res.status).toBe(400);
    });

    it("shows specific error for non-cybozu.com domain URL", async () => {
      const { client_id, challenge } = await registerClientAndPKCE();
      const res = await postAuthorize(
        "https://example.kintone.com",
        client_id,
        challenge,
      );
      expect(res.status).toBe(400);
      const html = await res.text();
      expect(html).toContain("cybozu.com");
    });

    it("should preserve previously entered subdomain value in the re-displayed form", async () => {
      const { client_id, challenge } = await registerClientAndPKCE();
      const res = await postAuthorize("-invalid", client_id, challenge);
      expect(res.status).toBe(400);
      const html = await res.text();
      expect(html).toContain("-invalid");
      expect(html).toContain("test-user");
    });
  });
});
