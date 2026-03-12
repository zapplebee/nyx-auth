import express from "express";
import session from "express-session";
import crypto from "node:crypto";

const app = express();
const PORT = process.env.PORT || 5174;
const AUTH_URL = process.env.AUTH_URL || "http://nyx-auth:3000";
const CLIENT_ID = process.env.CLIENT_ID || "ci-cookie-test";
const CLIENT_SECRET = process.env.CLIENT_SECRET || "ci-cookie-test-secret";
const BASE_URL = process.env.BASE_URL || `http://cookie-test-app:${PORT}`;
const REDIRECT_URI = `${BASE_URL}/callback`;

app.use(
  session({
    secret: process.env.SESSION_SECRET || "cookie-test-session-secret",
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: "lax" },
  })
);

function generateCodeVerifier() {
  return crypto.randomBytes(64).toString("base64url");
}

function generateCodeChallenge(verifier) {
  return crypto.createHash("sha256").update(verifier).digest("base64url");
}

app.get("/", (req, res) => {
  const user = req.session.user;
  if (user) {
    res.send(`<!DOCTYPE html>
<html><head><title>nyx-auth cookie test</title></head><body>
  <h1>nyx-auth cookie test app</h1>
  <p id="status">Signed in as ${escapeHtml(user.email)}</p>
  <pre id="claims">${escapeHtml(JSON.stringify(user, null, 2))}</pre>
  <a href="/protected"><button id="protectedBtn">Protected Page</button></a>
  <a href="/logout"><button id="logoutBtn">Logout</button></a>
</body></html>`);
  } else {
    res.send(`<!DOCTYPE html>
<html><head><title>nyx-auth cookie test</title></head><body>
  <h1>nyx-auth cookie test app</h1>
  <p id="status">Not signed in</p>
  <a href="/login"><button id="loginBtn">Login</button></a>
</body></html>`);
  }
});

app.get("/login", (req, res) => {
  const verifier = generateCodeVerifier();
  const challenge = generateCodeChallenge(verifier);
  const state = crypto.randomBytes(16).toString("hex");

  req.session.pkce = { verifier, state };

  const params = new URLSearchParams({
    response_type: "code",
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: "openid profile email",
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  });

  res.redirect(`${AUTH_URL}/api/auth/oauth2/authorize?${params}`);
});

app.get("/callback", async (req, res) => {
  const { code, state, error } = req.query;

  if (error) {
    return res.status(400).send(`Authorization error: ${escapeHtml(String(error))}`);
  }

  const pkce = req.session.pkce;
  if (!pkce || pkce.state !== state) {
    return res.status(400).send("Invalid or missing state parameter");
  }

  delete req.session.pkce;

  try {
    const response = await fetch(`${AUTH_URL}/api/auth/oauth2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        client_id: CLIENT_ID,
        client_secret: CLIENT_SECRET,
        code,
        redirect_uri: REDIRECT_URI,
        code_verifier: pkce.verifier,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      return res.status(400).send(`Token exchange failed: ${escapeHtml(err)}`);
    }

    const tokens = await response.json();

    // Decode the id_token payload — no sig verification needed since
    // we fetched this directly from nyx-auth over the internal network.
    const [, payloadB64] = tokens.id_token.split(".");
    const claims = JSON.parse(Buffer.from(payloadB64, "base64url").toString());

    req.session.user = {
      email: claims.email,
      name: claims.name,
      sub: claims.sub,
      roles: claims.roles ?? [],
    };

    res.redirect("/");
  } catch (err) {
    res.status(500).send(`Internal error: ${escapeHtml(err.message)}`);
  }
});

app.get("/protected", (req, res) => {
  if (!req.session.user) {
    return res.status(401).send(`<!DOCTYPE html>
<html><head><title>nyx-auth cookie test</title></head><body>
  <p id="status">Unauthorized</p>
  <a href="/login"><button id="loginBtn">Login</button></a>
</body></html>`);
  }
  res.send(`<!DOCTYPE html>
<html><head><title>nyx-auth cookie test — protected</title></head><body>
  <h1>Protected page</h1>
  <p id="status">Welcome, ${escapeHtml(req.session.user.email)}</p>
  <p id="roles">Roles: ${escapeHtml((req.session.user.roles ?? []).join(", ") || "none")}</p>
  <a href="/"><button>Home</button></a>
</body></html>`);
});

app.get("/logout", (req, res) => {
  req.session.destroy(() => res.redirect("/"));
});

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

app.listen(PORT, "0.0.0.0", () => {
  console.log(`cookie-test-app listening on port ${PORT}`);
});
