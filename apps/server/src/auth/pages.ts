/**
 * Tiny server-rendered pages for signed-out visitors. The SPA bundle itself is
 * only served to signed-in users, so these must be self-contained.
 */
function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

function layout(title: string, body: string, script: string) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: dark; --bg:#0b1220; --panel:#131d31; --border:#26344f; --text:#e6edf7; --muted:#8fa3c0; --accent:#7cc4ff; --danger:#ff8a8a; }
  * { box-sizing: border-box; }
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:radial-gradient(circle at 50% 0%, #1b2a47, var(--bg) 60%); color:var(--text); font:16px/1.5 system-ui, sans-serif; padding:16px; }
  main { width:100%; max-width:380px; background:var(--panel); border:1px solid var(--border); border-radius:14px; padding:28px; box-shadow:0 20px 60px rgb(0 0 0 / .4); }
  h1 { margin:0 0 4px; font-size:22px; letter-spacing:.02em; }
  p { margin:0 0 20px; color:var(--muted); font-size:14px; }
  label { display:block; font-size:13px; color:var(--muted); margin:14px 0 6px; }
  input { width:100%; padding:10px 12px; border-radius:8px; border:1px solid var(--border); background:#0d1628; color:var(--text); font-size:16px; }
  input:focus { outline:2px solid var(--accent); outline-offset:1px; }
  button { margin-top:22px; width:100%; padding:11px; border:0; border-radius:8px; background:var(--accent); color:#04121f; font-weight:600; font-size:16px; cursor:pointer; }
  button[disabled] { opacity:.6; cursor:wait; }
  .error { color:var(--danger); font-size:14px; min-height:1.5em; margin-top:12px; }
</style>
</head>
<body><main>${body}</main>
<script>${script}</script>
</body>
</html>`;
}

const submitScript = (endpoint: string) => `
const form = document.querySelector('form');
const error = document.querySelector('.error');
form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = form.querySelector('button');
  button.disabled = true;
  error.textContent = '';
  const body = Object.fromEntries(new FormData(form));
  if (body.confirm !== undefined && body.confirm !== body.password) {
    error.textContent = 'Passwords do not match';
    button.disabled = false;
    return;
  }
  delete body.confirm;
  try {
    const res = await fetch(${JSON.stringify(endpoint)}, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    if (res.ok) {
      const next = new URLSearchParams(location.search).get('next');
      location.href = next && next.startsWith('/') && !next.startsWith('//') ? next : '/';
      return;
    }
    const data = await res.json().catch(() => ({}));
    error.textContent = data.error || 'Something went wrong';
  } catch {
    error.textContent = 'Network error';
  }
  button.disabled = false;
});`;

export function loginPage() {
  return layout(
    'Sign in · Frosthaven',
    `<h1>Frosthaven</h1>
<p>Private campaign. Sign in to continue.</p>
<form>
  <label for="username">Username</label>
  <input id="username" name="username" autocomplete="username" required autofocus>
  <label for="password">Password</label>
  <input id="password" name="password" type="password" autocomplete="current-password" required>
  <button type="submit">Sign in</button>
  <div class="error" role="alert"></div>
</form>`,
    submitScript('/api/auth/login')
  );
}

export function invitePage(token: string, valid: boolean) {
  if (!valid) {
    return layout(
      'Invite · Frosthaven',
      `<h1>Invite not valid</h1><p>This invite link has expired or was already used. Ask the campaign admin for a new one.</p>`,
      ''
    );
  }
  return layout(
    'Join · Frosthaven',
    `<h1>Join the campaign</h1>
<p>Create your account.</p>
<form>
  <label for="displayName">Display name</label>
  <input id="displayName" name="displayName" required maxlength="40" autofocus>
  <label for="username">Username</label>
  <input id="username" name="username" autocomplete="username" required pattern="[a-zA-Z0-9_.-]{3,32}" title="3-32 letters, digits, _ . -">
  <label for="password">Password</label>
  <input id="password" name="password" type="password" autocomplete="new-password" required minlength="10">
  <label for="confirm">Confirm password</label>
  <input id="confirm" name="confirm" type="password" autocomplete="new-password" required minlength="10">
  <button type="submit">Create account</button>
  <div class="error" role="alert"></div>
</form>`,
    submitScript(`/api/invites/${encodeURIComponent(token)}/accept`)
  );
}
