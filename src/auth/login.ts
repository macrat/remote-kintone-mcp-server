export function renderLoginPage(params: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  state: string;
}): string {
  const escape = (s: string) =>
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
</style>
</head>
<body>
<div class="card">
<h1>kintone ログイン</h1>
<form method="POST" action="/authorize">
<input type="hidden" name="client_id" value="${escape(params.clientId)}">
<input type="hidden" name="redirect_uri" value="${escape(params.redirectUri)}">
<input type="hidden" name="code_challenge" value="${escape(params.codeChallenge)}">
<input type="hidden" name="code_challenge_method" value="${escape(params.codeChallengeMethod)}">
<input type="hidden" name="state" value="${escape(params.state)}">
<label for="base_url">kintone ベースURL</label>
<input type="url" id="base_url" name="base_url" placeholder="https://example.cybozu.com" required>
<label for="username">ログインID</label>
<input type="text" id="username" name="username" required>
<label for="password">パスワード</label>
<input type="password" id="password" name="password" required>
<button type="submit">ログイン</button>
</form>
</div>
</body>
</html>`;
}
