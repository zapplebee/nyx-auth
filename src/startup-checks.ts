// Startup environment validation.
//
// Called before serving any requests. Exits with a non-zero status and a
// clear message if required environment variables are missing or invalid.

const MIN_SECRET_LENGTH = 32;

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
  // clients.yml and users.yml (AES-256-GCM via PBKDF2). It must be at least
  // 32 characters long to provide adequate entropy.
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
  } else if (secret.length < MIN_SECRET_LENGTH) {
    errors.push(
      `NYX_SECRET is too short: got ${secret.length} character(s), need at least ${MIN_SECRET_LENGTH}.\n` +
      "  Generate a suitable key with: openssl rand -base64 32"
    );
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
