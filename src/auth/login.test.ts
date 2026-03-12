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

  it("escapes <script>alert(\"xss\")</script> injection string", () => {
    const html = renderLoginPage({
      ...defaultParams,
      state: '<script>alert("xss")</script>',
    });

    expect(html).not.toContain("<script>");
    expect(html).not.toContain("</script>");
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
    expect(html).toContain("value=\"method&#39;quote\"");
    expect(html).toContain(
      'value="state&amp;&quot;&#39;&lt;&gt;all"',
    );
  });
});
