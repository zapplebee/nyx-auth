import { UserManager } from "oidc-client-ts";

// nyx-auth serves OIDC discovery under /api/auth/
const authUrl = import.meta.env.VITE_AUTH_URL || "http://localhost:3000/api/auth";
const clientId = import.meta.env.VITE_CLIENT_ID || "ci-test";
const redirectUri =
  import.meta.env.VITE_REDIRECT_URI ||
  `${window.location.origin}/callback`;

const userManager = new UserManager({
  authority: authUrl,
  client_id: clientId,
  client_secret: "ci-test-client-secret",
  redirect_uri: redirectUri,
  response_type: "code",
  scope: "openid profile email",
});

const statusEl = document.getElementById("status")!;
const loginBtn = document.getElementById("loginBtn") as HTMLButtonElement;
const userInfoEl = document.getElementById("userInfo")!;
const profileJsonEl = document.getElementById("profileJson")!;

function showUser(profile: Record<string, unknown>) {
  statusEl.textContent = `Signed in as ${profile.email || profile.sub}`;
  loginBtn.textContent = "Logout";
  userInfoEl.style.display = "block";
  profileJsonEl.textContent = JSON.stringify(profile, null, 2);
  loginBtn.onclick = () => userManager.signoutRedirect();
}

// Handle redirect callback
if (window.location.pathname === "/callback") {
  statusEl.textContent = "Completing sign-in…";
  userManager
    .signinRedirectCallback()
    .then((user) => {
      showUser(user.profile as Record<string, unknown>);
      window.history.replaceState({}, document.title, "/");
    })
    .catch((err: Error) => {
      statusEl.textContent = `Login failed: ${err.message}`;
      statusEl.style.color = "#f87171";
    });
} else {
  // Check if already signed in
  userManager.getUser().then((user) => {
    if (user && !user.expired) {
      showUser(user.profile as Record<string, unknown>);
    } else {
      loginBtn.onclick = () => userManager.signinRedirect();
    }
  });
}
