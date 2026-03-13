// Startup environment validation.
//
// Called before serving any requests. Exits with a non-zero status and a
// clear message if required environment variables are missing or invalid.

// RFC 4648 standard base64 alphabet with well-formed padding.
const BASE64_RE = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

/** Decode a base64 string and return a Buffer, or null if it is not valid base64. */
function tryDecodeBase64(s: string): Buffer | null {
  if (!BASE64_RE.test(s)) return null;
  return Buffer.from(s, "base64");
}

/**
 * Validate required environment variables and return an array of error messages.
 * An empty array means the environment is valid.
 *
 * Exported for testing. Use `assertEnvironment()` in production code.
 */
export function validateEnvironment(): string[] {
  const errors: string[] = [];

  // ── NYX_SECRET ─────────────────────────────────────────────────────────────
  //
  // NYX_SECRET is the master key used to decrypt all enc:... values in
  // clients.yml and users.yml (AES-256-GCM via PBKDF2). It must be a
  // base64-encoded value that decodes to exactly 32 bytes of key material.
  //
  // Generate one with:
  //   openssl rand -base64 32
  //   # or
  //   bun -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
  //
  // Set it as an environment variable — never commit it to source control.

  const secret = process.env.NYX_SECRET ?? "";
  if (!secret) {
    errors.push(
      "NYX_SECRET is not set.\n" +
      "  NYX_SECRET is the master encryption key for all secrets stored in clients.yml and users.yml.\n" +
      "  Generate one with: openssl rand -base64 32"
    );
  } else {
    const decoded = tryDecodeBase64(secret);
    if (decoded === null) {
      errors.push(
        "NYX_SECRET is not valid base64.\n" +
        "  NYX_SECRET must be a base64-encoded value representing exactly 32 bytes.\n" +
        "  Generate one with: openssl rand -base64 32"
      );
    } else if (decoded.length !== 32) {
      errors.push(
        `NYX_SECRET: expected 32 bytes after base64 decode, got ${decoded.length} byte(s).\n` +
        "  Generate a 32-byte key with: openssl rand -base64 32"
      );
    }
  }

  // ── NYX_URL ────────────────────────────────────────────────────────────────

  const url = process.env.NYX_URL ?? "";
  if (!url) {
    errors.push(
      "NYX_URL is not set.\n" +
      "  NYX_URL is the public URL of this service and is used as the OIDC issuer.\n" +
      "  Example: NYX_URL=https://auth.example.com"
    );
  } else {
    try {
      const parsed = new URL(url);
      const isProduction = process.env.NODE_ENV === "production";
      if (isProduction && parsed.protocol !== "https:") {
        errors.push(
          `NYX_URL must use HTTPS in production (got: ${url}).\n` +
          "  Set NODE_ENV=production only when running behind a real TLS terminator."
        );
      }
    } catch {
      errors.push(`NYX_URL is not a valid URL (got: ${url}).`);
    }
  }

  return errors;
}

/**
 * Validate the environment and exit with a clear error message if invalid.
 * Call this once at startup before loading config or serving requests.
 */
export function assertEnvironment(): void {
  const errors = validateEnvironment();
  if (errors.length === 0) return;

  console.error("[nyx-auth] Startup failed — invalid configuration:\n");
  for (const err of errors) {
    console.error("  ✗ " + err.replace(/\n/g, "\n    "));
  }
  console.error();
  process.exit(1);
}
