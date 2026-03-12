export function renderLoginPage(params: {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  state: string;
  errorMessage?: string;
  values?: { subdomain?: string; username?: string };
}): string {
  const escapeHtml = (s: string) =>
    s
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const errorHtml = params.errorMessage
    ? `<div role="alert" style="background:#fef2f2;border:1px solid #ef4444;color:#b91c1c;padding:0.75rem;border-radius:4px;margin-bottom:1rem;font-size:0.875rem;">${escapeHtml(params.errorMessage)}</div>`
    : "";

  const hasError = !!params.errorMessage;
  const ariaInvalid = hasError ? ' aria-invalid="true"' : "";

  const subdomainValue = params.values?.subdomain
    ? ` value="${escapeHtml(params.values.subdomain)}"`
    : "";
  const usernameValue = params.values?.username
    ? ` value="${escapeHtml(params.values.username)}"`
    : "";

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
.subdomain-input { display: flex; align-items: center; margin-bottom: 1rem; gap: 0; }
.subdomain-input .prefix { font-size: 1rem; color: #555; white-space: nowrap; }
.subdomain-input input { margin-bottom: 0; border-radius: 4px; min-width: 0; }
.subdomain-input .suffix { font-size: 1rem; color: #555; white-space: nowrap; }
</style>
</head>
<body>
<div class="card">
<h1>kintone ログイン</h1>
${errorHtml}<form method="POST" action="/authorize" aria-label="kintone ログインフォーム">
<input type="hidden" name="client_id" value="${escapeHtml(params.clientId)}">
<input type="hidden" name="redirect_uri" value="${escapeHtml(params.redirectUri)}">
<input type="hidden" name="code_challenge" value="${escapeHtml(params.codeChallenge)}">
<input type="hidden" name="code_challenge_method" value="${escapeHtml(params.codeChallengeMethod)}">
<input type="hidden" name="state" value="${escapeHtml(params.state)}">
<label for="subdomain">サブドメイン</label>
<span id="subdomain_desc" class="sr-only">例: example（https://example.cybozu.com の場合）</span>
<div class="subdomain-input"><span class="prefix">https://</span><input type="text" id="subdomain" name="subdomain" placeholder="example" required autofocus autocomplete="off" maxlength="63" aria-describedby="subdomain_desc"${ariaInvalid}${subdomainValue}><span class="suffix">.cybozu.com</span></div>
<label for="username">ログインID</label>
<input type="text" id="username" name="username" required autocomplete="username"${usernameValue}>
<label for="password">パスワード</label>
<input type="password" id="password" name="password" required autocomplete="current-password">
<button type="submit" aria-label="kintone にログイン">ログイン</button>
</form>
</div>
<script>
(function(){
  var input = document.getElementById("subdomain");
  if (!input) return;
  input.addEventListener("paste", function(e) {
    var text = (e.clipboardData || window.clipboardData).getData("text");
    var m = text.match(/^(?:https?:\\/\\/)?([a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?)\\x2ecybozu\\x2ecom(?:[\\/:].*)?$/i);
    if (m) {
      e.preventDefault();
      input.value = m[1];
    }
  });
})();
</script>
</body>
</html>`;
}
