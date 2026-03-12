export function renderLoginPage(params: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  state: string;
}): string {
  const escapeHtml = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>kintone ログイン</title>
<style>
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; background: #f5f5f5; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
.card { background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); padding: 2rem; width: 100%; max-width: 400px; }
h1 { font-size: 1.25rem; margin-bottom: 1.5rem; text-align: center; color: #333; }
label { display: block; font-size: 0.875rem; color: #555; margin-bottom: 0.25rem; }
input[type="text"], input[type="url"], input[type="password"] { width: 100%; padding: 0.5rem; border: 1px solid #ccc; border-radius: 4px; font-size: 1rem; margin-bottom: 1rem; }
button { width: 100%; padding: 0.75rem; background: #0071c5; color: #fff; border: none; border-radius: 4px; font-size: 1rem; cursor: pointer; }
button:hover { background: #005a9e; }
button:focus-visible { outline: 2px solid #0071c5; outline-offset: 2px; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0,0,0,0); white-space: nowrap; border: 0; }
</style>
</head>
<body>
<div class="card">
<h1>kintone ログイン</h1>
<form method="POST" action="/authorize" aria-label="kintone ログインフォーム">
<input type="hidden" name="client_id" value="${escapeHtml(params.clientId)}">
<input type="hidden" name="redirect_uri" value="${escapeHtml(params.redirectUri)}">
<input type="hidden" name="code_challenge" value="${escapeHtml(params.codeChallenge)}">
<input type="hidden" name="code_challenge_method" value="${escapeHtml(params.codeChallengeMethod)}">
<input type="hidden" name="state" value="${escapeHtml(params.state)}">
<label for="base_url">kintone ベースURL</label>
<span id="base_url_desc" class="sr-only">例: https://example.cybozu.com</span>
<input type="url" id="base_url" name="base_url" placeholder="https://example.cybozu.com" required autofocus autocomplete="url" aria-describedby="base_url_desc">
<label for="username">ログインID</label>
<input type="text" id="username" name="username" required autocomplete="username">
<label for="password">パスワード</label>
<input type="password" id="password" name="password" required autocomplete="current-password">
<button type="submit" aria-label="kintone にログイン">ログイン</button>
</form>
</div>
</body>
</html>`;
}
