import { describe, expect, it } from "vitest";
import { renderLoginPage } from "./login.js";

const defaultParams = {
  clientId: "test-client-id",
  redirectUri: "https://example.com/callback",
  codeChallenge: "test-code-challenge",
  codeChallengeMethod: "S256",
  state: "test-state",
};

describe("escapeHtml", () => {
  it("escapes &, \", ', <, > characters", () => {
    const html = renderLoginPage({
      ...defaultParams,
      clientId: `&"'<>`,
    });

    expect(html).toContain("&amp;");
    expect(html).toContain("&quot;");
    expect(html).toContain("&#39;");
    expect(html).toContain("&lt;");
    expect(html).toContain("&gt;");
    expect(html).not.toContain('value="&"\'<>"');
  });

  it('escapes <script>alert("xss")</script> injection string', () => {
    const html = renderLoginPage({
      ...defaultParams,
      state: '<script>alert("xss")</script>',
    });

    // User input should be escaped in hidden field values
    expect(html).toContain(
      'value="&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;"',
    );
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;/script&gt;");
    expect(html).toContain("alert(&quot;xss&quot;)");
  });
});

describe("renderLoginPage", () => {
  it("returns an HTML string containing <!DOCTYPE html>", () => {
    const html = renderLoginPage(defaultParams);

    expect(html).toContain("<!DOCTYPE html>");
  });

  it("includes parameters in hidden inputs", () => {
    const html = renderLoginPage(defaultParams);

    expect(html).toContain(
      `<input type="hidden" name="client_id" value="${defaultParams.clientId}">`,
    );
    expect(html).toContain(
      `<input type="hidden" name="redirect_uri" value="${defaultParams.redirectUri}">`,
    );
    expect(html).toContain(
      `<input type="hidden" name="code_challenge" value="${defaultParams.codeChallenge}">`,
    );
    expect(html).toContain(
      `<input type="hidden" name="code_challenge_method" value="${defaultParams.codeChallengeMethod}">`,
    );
    expect(html).toContain(
      `<input type="hidden" name="state" value="${defaultParams.state}">`,
    );
  });

  it("escapes special characters in parameters", () => {
    const html = renderLoginPage({
      clientId: "id&<>",
      redirectUri: 'https://example.com/callback?a=1&b="2"',
      codeChallenge: "challenge<script>",
      codeChallengeMethod: "method'quote",
      state: "state&\"'<>all",
    });

    expect(html).toContain('value="id&amp;&lt;&gt;"');
    expect(html).toContain(
      'value="https://example.com/callback?a=1&amp;b=&quot;2&quot;"',
    );
    expect(html).toContain('value="challenge&lt;script&gt;"');
    expect(html).toContain('value="method&#39;quote"');
    expect(html).toContain('value="state&amp;&quot;&#39;&lt;&gt;all"');
  });

  it("displays .cybozu.com suffix after subdomain input", () => {
    const html = renderLoginPage(defaultParams);

    expect(html).toContain(".cybozu.com");
    expect(html).toContain("https://");
    expect(html).toContain('class="subdomain-input"');
  });

  it("subdomain input has maxlength=63 (DNS label limit)", () => {
    const html = renderLoginPage(defaultParams);

    expect(html).toMatch(/id="subdomain"[^>]*maxlength="63"/);
  });

  it("prefix and suffix font size matches input font size", () => {
    const html = renderLoginPage(defaultParams);

    // prefix and suffix should use 1rem to match input font-size
    expect(html).toMatch(
      /\.subdomain-input .prefix\s*\{[^}]*font-size:\s*1rem/,
    );
    expect(html).toMatch(
      /\.subdomain-input .suffix\s*\{[^}]*font-size:\s*1rem/,
    );
  });

  it("includes client-side JavaScript for subdomain auto-extraction on paste", () => {
    const html = renderLoginPage(defaultParams);

    expect(html).toContain("<script>");
    expect(html).toContain("paste");
    expect(html).toContain("cybozu.com");
  });

  it("sets aria-invalid on subdomain input when errorMessage is present", () => {
    const html = renderLoginPage({
      ...defaultParams,
      errorMessage: "無効なサブドメインです",
      values: { subdomain: "-invalid", username: "test" },
    });

    expect(html).toMatch(/id="subdomain"[^>]*aria-invalid="true"/);
  });

  it("does not set aria-invalid on subdomain input when no error", () => {
    const html = renderLoginPage(defaultParams);

    expect(html).not.toContain('aria-invalid="true"');
  });

  it("preserves subdomain and username values in the re-displayed form", () => {
    const html = renderLoginPage({
      ...defaultParams,
      values: { subdomain: "my-company", username: "taro" },
    });

    expect(html).toMatch(/id="subdomain"[^>]*value="my-company"/);
    expect(html).toMatch(/id="username"[^>]*value="taro"/);
  });

  it("subdomain-input does not overflow on narrow viewports (min-width: 0 on input)", () => {
    const html = renderLoginPage(defaultParams);

    expect(html).toMatch(/\.subdomain-input input\s*\{[^}]*min-width:\s*0/);
  });
});

describe("accessibility: subdomain_desc helper text", () => {
  const html = renderLoginPage(defaultParams);

  it("span#subdomain_desc does NOT have display:none style", () => {
    expect(html).not.toMatch(
      /id="subdomain_desc"[^>]*style="[^"]*display:\s*none[^"]*"/,
    );
  });

  it("defines a .sr-only CSS class with visually-hidden styles", () => {
    expect(html).toMatch(/\.sr-only\s*\{[^}]*position:\s*absolute/);
    expect(html).toMatch(/\.sr-only\s*\{[^}]*width:\s*1px/);
    expect(html).toMatch(/\.sr-only\s*\{[^}]*height:\s*1px/);
    expect(html).toMatch(/\.sr-only\s*\{[^}]*overflow:\s*hidden/);
    expect(html).toMatch(/\.sr-only\s*\{[^}]*clip:\s*rect\(0/);
  });

  it("span#subdomain_desc uses the sr-only class without inline display:none", () => {
    expect(html).toMatch(/id="subdomain_desc"[^>]*class="[^"]*sr-only[^"]*"/);
    expect(html).not.toMatch(
      /id="subdomain_desc"[^>]*style="[^"]*display:\s*none[^"]*"/,
    );
  });

  it("sr-only text describes subdomain example", () => {
    expect(html).toContain("例: example（https://example.cybozu.com の場合）");
  });
});
