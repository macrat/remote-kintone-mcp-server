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
  const info = clients.register(body);
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

  if (
    !clientId ||
    !redirectUri ||
    !codeChallenge ||
    !codeChallengeMethod ||
    !state
  ) {
    return c.text("Missing required parameters", 400);
  }

  // Verify client is registered
  const client = clients.get(clientId);
  if (!client) {
    return c.text("Unknown client_id", 400);
  }

  // Validate redirect_uri against registered URIs
  if (!client.metadata.redirect_uris.includes(redirectUri)) {
    return c.text("Invalid redirect_uri", 400);
  }

  // Only S256 is supported
  if (codeChallengeMethod !== "S256") {
    return c.text("Unsupported code_challenge_method", 400);
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
  const baseUrl = form.base_url as string;
  const username = form.username as string;
  const password = form.password as string;
  const clientId = form.client_id as string;
  const redirectUri = form.redirect_uri as string;
  const codeChallenge = form.code_challenge as string;
  const state = form.state as string;

  if (
    !baseUrl ||
    !username ||
    !password ||
    !clientId ||
    !redirectUri ||
    !codeChallenge ||
    !state
  ) {
    return c.text("Missing required parameters", 400);
  }

  // Verify client is registered and redirect_uri is allowed
  const client = clients.get(clientId);
  if (!client) {
    return c.text("Unknown client_id", 400);
  }
  if (!client.metadata.redirect_uris.includes(redirectUri)) {
    return c.text("Invalid redirect_uri", 400);
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
  const grantType = form.grant_type as string;
  const code = form.code as string;
  const codeVerifier = form.code_verifier as string;
  const clientId = form.client_id as string;
  const clientSecret = form.client_secret as string;

  if (grantType !== "authorization_code") {
    return c.json({ error: "unsupported_grant_type" }, 400);
  }

  if (!code || !codeVerifier || !clientId || !clientSecret) {
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

  // PKCE verification (S256)
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest("SHA-256", data);
  const expectedChallenge = base64url.encode(new Uint8Array(digest));

  if (expectedChallenge !== entry.codeChallenge) {
    return c.json({ error: "invalid_grant" }, 400);
  }

  return c.json({
    access_token: entry.jwe,
    token_type: "Bearer",
  });
});
