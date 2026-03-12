import crypto from "node:crypto";
import { Hono } from "hono";
import { base64url } from "jose";
import * as clients from "./clients.js";
import * as codes from "./codes.js";
import { encrypt } from "./jwe.js";
import { renderLoginPage } from "./login.js";

export const oauthApp = new Hono();

// OAuth Server Metadata
oauthApp.get("/.well-known/oauth-authorization-server", (c) => {
  const origin = new URL(c.req.url).origin;
  return c.json({
    issuer: origin,
    authorization_endpoint: `${origin}/authorize`,
    token_endpoint: `${origin}/token`,
    registration_endpoint: `${origin}/register`,
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code"],
    token_endpoint_auth_methods_supported: ["client_secret_post"],
    code_challenge_methods_supported: ["S256"],
  });
});

// Dynamic Client Registration
oauthApp.post("/register", async (c) => {
  const body = await c.req.json();
  let info: clients.ClientInfo;
  try {
    info = clients.register(body);
  } catch (e) {
    return c.json(
      {
        error: "invalid_client_metadata",
        error_description: String(e instanceof Error ? e.message : e),
      },
      400,
    );
  }
  return c.json(
    {
      client_id: info.client_id,
      client_secret: info.client_secret,
      ...info.metadata,
    },
    201,
  );
});

// Authorization Endpoint (GET - show login form)
oauthApp.get("/authorize", (c) => {
  const clientId = c.req.query("client_id");
  const redirectUri = c.req.query("redirect_uri");
  const codeChallenge = c.req.query("code_challenge");
  const codeChallengeMethod = c.req.query("code_challenge_method");
  const state = c.req.query("state");

  const missing = [
    ["client_id", clientId],
    ["redirect_uri", redirectUri],
    ["code_challenge", codeChallenge],
    ["code_challenge_method", codeChallengeMethod],
    ["state", state],
  ]
    .filter(([, v]) => !v)
    .map(([k]) => k);

  if (missing.length > 0) {
    return c.json(
      {
        error: "invalid_request",
        error_description: `Missing required parameters: ${missing.join(", ")}`,
      },
      400,
    );
  }

  // Verify client is registered
  const client = clients.get(clientId);
  if (!client) {
    return c.json(
      {
        error: "invalid_request",
        error_description: "Unknown client_id",
      },
      400,
    );
  }

  // Validate redirect_uri against registered URIs
  if (!client.metadata.redirect_uris.includes(redirectUri)) {
    return c.json(
      {
        error: "invalid_request",
        error_description: "Invalid redirect_uri",
      },
      400,
    );
  }

  // Only S256 is supported
  if (codeChallengeMethod !== "S256") {
    return c.json(
      {
        error: "invalid_request",
        error_description: "Unsupported code_challenge_method",
      },
      400,
    );
  }

  const html = renderLoginPage({
    clientId,
    redirectUri,
    codeChallenge,
    codeChallengeMethod,
    state,
  });
  return c.html(html);
});

// Authorization Endpoint (POST - process login form)
oauthApp.post("/authorize", async (c) => {
  const form = await c.req.parseBody();
  const baseUrl = form.base_url;
  const username = form.username;
  const password = form.password;
  const clientId = form.client_id;
  const redirectUri = form.redirect_uri;
  const codeChallenge = form.code_challenge;
  const state = form.state;

  if (
    typeof baseUrl !== "string" ||
    typeof username !== "string" ||
    typeof password !== "string" ||
    typeof clientId !== "string" ||
    typeof redirectUri !== "string" ||
    typeof codeChallenge !== "string" ||
    typeof state !== "string" ||
    !baseUrl ||
    !username ||
    !password ||
    !clientId ||
    !redirectUri ||
    !codeChallenge ||
    !state
  ) {
    return c.json(
      {
        error: "invalid_request",
        error_description: "Missing required parameters",
      },
      400,
    );
  }

  // Verify client is registered and redirect_uri is allowed
  const client = clients.get(clientId);
  if (!client) {
    return c.json(
      {
        error: "invalid_request",
        error_description: "Unknown client_id",
      },
      400,
    );
  }
  if (!client.metadata.redirect_uris.includes(redirectUri)) {
    return c.json(
      {
        error: "invalid_request",
        error_description: "Invalid redirect_uri",
      },
      400,
    );
  }

  const jwe = await encrypt({ baseUrl, username, password });

  const code = codes.generate({
    jwe,
    codeChallenge,
    redirectUri,
    clientId,
  });

  const url = new URL(redirectUri);
  url.searchParams.set("code", code);
  url.searchParams.set("state", state);

  return c.redirect(url.toString(), 302);
});

// Token Endpoint
oauthApp.post("/token", async (c) => {
  const form = await c.req.parseBody();
  const grantType = form.grant_type;
  const code = form.code;
  const codeVerifier = form.code_verifier;
  const clientId = form.client_id;
  const clientSecret = form.client_secret;
  const redirectUri = form.redirect_uri;

  if (grantType !== "authorization_code") {
    return c.json({ error: "unsupported_grant_type" }, 400);
  }

  if (
    typeof code !== "string" ||
    typeof codeVerifier !== "string" ||
    typeof clientId !== "string" ||
    typeof clientSecret !== "string" ||
    typeof redirectUri !== "string" ||
    !code ||
    !codeVerifier ||
    !clientId ||
    !clientSecret ||
    !redirectUri
  ) {
    return c.json({ error: "invalid_request" }, 400);
  }

  // Validate client
  if (!clients.validate(clientId, clientSecret)) {
    return c.json({ error: "invalid_client" }, 401);
  }

  // Consume authorization code
  const entry = codes.consume(code);
  if (!entry) {
    return c.json({ error: "invalid_grant" }, 400);
  }

  // Verify client_id matches
  if (entry.clientId !== clientId) {
    return c.json({ error: "invalid_grant" }, 400);
  }

  // Verify redirect_uri matches the one used during authorization
  if (entry.redirectUri !== redirectUri) {
    return c.json({ error: "invalid_grant" }, 400);
  }

  // PKCE verification (S256) with timing-safe comparison
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(codeVerifier),
  );
  const expectedChallenge = base64url.encode(new Uint8Array(digest));

  const expectedBuf = Buffer.from(expectedChallenge);
  const actualBuf = Buffer.from(entry.codeChallenge);
  if (
    expectedBuf.length !== actualBuf.length ||
    !crypto.timingSafeEqual(expectedBuf, actualBuf)
  ) {
    return c.json({ error: "invalid_grant" }, 400);
  }

  return c.json({
    access_token: entry.jwe,
    token_type: "Bearer",
  });
});
