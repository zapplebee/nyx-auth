// Login and consent page HTML templates.

export function loginHtml(qs: string): string {
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>nyx-auth — sign in</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #0d0d0d; color: #e2e2e2; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #181818; border: 1px solid #2a2a2a; border-radius: 10px; padding: 2rem; width: 100%; max-width: 360px; }
    h1 { font-size: 1.1rem; font-weight: 600; margin-bottom: 1.5rem; color: #fff; letter-spacing: 0.02em; }
    label { display: block; font-size: 0.8125rem; color: #999; margin-bottom: 0.3rem; }
    input { display: block; width: 100%; padding: 0.6rem 0.75rem; background: #111; border: 1px solid #333; border-radius: 6px; color: #e2e2e2; font-size: 0.9375rem; margin-bottom: 1rem; transition: border-color 0.15s; }
    input:focus { outline: none; border-color: #4f8ef7; }
    button { width: 100%; padding: 0.7rem; background: #3b7cf4; border: none; border-radius: 6px; color: #fff; font-size: 0.9375rem; font-weight: 500; cursor: pointer; transition: background 0.15s; }
    button:hover { background: #2d6ce0; }
    button:disabled { background: #2a4a80; cursor: not-allowed; }
    .error { display: none; color: #f87171; font-size: 0.8125rem; margin-bottom: 1rem; padding: 0.5rem 0.75rem; background: #2a1212; border: 1px solid #5a2020; border-radius: 6px; }
    .hint { font-size: 0.8125rem; color: #666; margin-bottom: 1rem; }
  </style>
</head>
<body>
  <div class="card">
    <h1>nyx-auth</h1>
    <div class="error" id="err"></div>

    <form id="form-password">
      <label for="email">Email</label>
      <input type="email" id="email" name="email" autocomplete="email" required autofocus>
      <label for="password">Password</label>
      <input type="password" id="password" name="password" autocomplete="current-password" required>
      <button type="submit" id="btn-password">Sign in</button>
    </form>

    <form id="form-totp" style="display:none">
      <p class="hint">Enter the 6-digit code from your authenticator app.</p>
      <label for="totp">Authenticator code</label>
      <input type="text" id="totp" name="totp" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" required autofocus>
      <button type="submit" id="btn-totp">Verify</button>
    </form>
  </div>
  <script>
    const qs = ${JSON.stringify(qs)};
    let pendingToken = null;

    function showError(msg) {
      const err = document.getElementById('err');
      err.textContent = msg;
      err.style.display = 'block';
    }
    function hideError() {
      document.getElementById('err').style.display = 'none';
    }
    function setLoading(btn, loading, label) {
      btn.disabled = loading;
      btn.textContent = loading ? label + '\u2026' : label;
    }

    document.getElementById('form-password').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('btn-password');
      hideError();
      setLoading(btn, true, 'Sign in');
      try {
        const res = await fetch('/api/auth/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: document.getElementById('email').value,
            password: document.getElementById('password').value,
          }),
          credentials: 'include',
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok && data.requiresTotp) {
          pendingToken = data.pendingToken;
          document.getElementById('form-password').style.display = 'none';
          document.getElementById('form-totp').style.display = '';
          document.getElementById('totp').focus();
        } else if (res.ok) {
          window.location.href = '/api/auth/oauth2/authorize?' + qs;
        } else {
          showError(data.error || 'Invalid email or password.');
          setLoading(btn, false, 'Sign in');
        }
      } catch {
        showError('Network error. Please try again.');
        setLoading(btn, false, 'Sign in');
      }
    });

    document.getElementById('form-totp').addEventListener('submit', async (e) => {
      e.preventDefault();
      const btn = document.getElementById('btn-totp');
      hideError();
      setLoading(btn, true, 'Verify');
      try {
        const res = await fetch('/api/auth/totp', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pendingToken,
            code: document.getElementById('totp').value,
          }),
          credentials: 'include',
        });
        const data = await res.json().catch(() => ({}));
        if (res.ok) {
          window.location.href = '/api/auth/oauth2/authorize?' + qs;
        } else {
          showError(data.error || 'Invalid code.');
          document.getElementById('totp').value = '';
          setLoading(btn, false, 'Verify');
        }
      } catch {
        showError('Network error. Please try again.');
        setLoading(btn, false, 'Verify');
      }
    });
  </script>
</body>
</html>`;
}

export function consentHtml(clientId: string, scope: string, qs: string): string {
  const scopes = scope.split(" ").filter(Boolean);
  return /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>nyx-auth — authorize</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: system-ui, -apple-system, sans-serif; background: #0d0d0d; color: #e2e2e2; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .card { background: #181818; border: 1px solid #2a2a2a; border-radius: 10px; padding: 2rem; width: 100%; max-width: 400px; }
    h1 { font-size: 1.1rem; font-weight: 600; margin-bottom: 0.5rem; color: #fff; }
    .sub { font-size: 0.8125rem; color: #888; margin-bottom: 1.5rem; }
    .scopes { list-style: none; margin-bottom: 1.5rem; }
    .scopes li { font-size: 0.875rem; padding: 0.35rem 0; color: #ccc; }
    .scopes li::before { content: '\u2713 '; color: #4ade80; }
    .actions { display: flex; gap: 0.75rem; }
    a, button { flex: 1; padding: 0.7rem; border: none; border-radius: 6px; font-size: 0.9375rem; font-weight: 500; cursor: pointer; text-align: center; text-decoration: none; display: inline-block; transition: background 0.15s; }
    .approve { background: #3b7cf4; color: #fff; }
    .approve:hover { background: #2d6ce0; }
    .deny { background: #2a2a2a; color: #ccc; border: 1px solid #333; }
    .deny:hover { background: #333; }
  </style>
</head>
<body>
  <div class="card">
    <h1>Authorize access</h1>
    <p class="sub">Client: <strong>${clientId}</strong></p>
    <ul class="scopes">
      ${scopes.map((s) => `<li>${s}</li>`).join("\n      ")}
    </ul>
    <div class="actions">
      <a class="deny" href="/login?${qs}">Deny</a>
      <a class="approve" href="/consent/approve?${qs}">Approve</a>
    </div>
  </div>
</body>
</html>`;
}
