// Config validation — called at startup and by the validate:config script.
//
// validateClients() and validateUsers() accept the already-loaded (decrypted)
// config maps and return an array of human-readable error strings. An empty
// array means the config is valid.
//
// All errors are collected before returning so the operator can fix everything
// in one pass rather than discovering problems one at a time.

import type { ClientConfig } from "./clients";
import type { UserConfig } from "./users";

const VALID_CLIENT_TYPES = new Set(["web", "native", "user-agent-based", "public"]);

// Simple email heuristic — must contain exactly one @ with a non-empty local
// part and a domain that has at least one dot.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Hostnames that are always safe for http:// redirect URIs (local development).
// Ref: https://github.com/zapplebee/nyx-auth/issues/12
// Note: 0.0.0.0 is treated as loopback per issue comment.
// URL.hostname returns "[::1]" (with brackets) for IPv6 addresses.
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "0.0.0.0"]);

/**
 * Validate a custom claim key name.
 *
 * URI-style claim keys (e.g. `https://example.com/email-verification`) must
 * use kebab-case for path components — camelCase like `emailVerification` is
 * rejected. Plain short identifiers (e.g. `oid`, `tid`) are accepted as-is.
 *
 * Returns an error message string if the key is invalid, or undefined if valid.
 *
 * Ref: https://github.com/zapplebee/nyx-auth/issues/21
 */
export function validateClaimKey(key: string): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(key);
  } catch {
    // Not a URI — plain identifiers are acceptable (e.g. "oid", "tid", "groups").
    return undefined;
  }

  const segments = parsed.pathname.split("/").filter(Boolean);
  for (const segment of segments) {
    if (/[a-z][A-Z]/.test(segment)) {
      const suggested = segment.replace(/([a-z])([A-Z])/g, "$1-$2").toLowerCase();
      return (
        `URI path component "${segment}" uses camelCase — ` +
        `use kebab-case instead (e.g. "${suggested}")`
      );
    }
  }
  return undefined;
}

export function validateClients(clients: Map<string, ClientConfig>): string[] {
  const errors: string[] = [];

  if (clients.size === 0) {
    errors.push("clients.yml: no clients defined — at least one client is required");
  }

  for (const [id, client] of clients) {
    const prefix = `client "${id}"`;

    if (!client.clientId || client.clientId.trim() === "") {
      errors.push(`${prefix}: clientId must not be empty`);
    }

    if (!client.name || client.name.trim() === "") {
      errors.push(`${prefix}: name must not be empty`);
    }

    if (client.type !== undefined && !VALID_CLIENT_TYPES.has(client.type)) {
      errors.push(
        `${prefix}: invalid type "${client.type}" — must be one of: ${[...VALID_CLIENT_TYPES].join(", ")}`
      );
    }

    // Non-public clients require a client secret for confidential flows.
    if (client.type !== "public" && !client.clientSecret) {
      errors.push(
        `${prefix}: clientSecret is required for non-public clients — run: bun run clients:set-secret ${id}`
      );
    }

    // Validate each redirect URL is a well-formed absolute URL.
    // In production, non-loopback http:// redirect URIs are rejected (RFC 6749 §10.6).
    for (const url of client.redirectURLs ?? []) {
      let parsed: URL;
      try {
        parsed = new URL(url);
      } catch {
        errors.push(`${prefix}: redirectURL "${url}" is not a valid URL`);
        continue;
      }

      if (
        process.env.NODE_ENV === "production" &&
        parsed.protocol === "http:" &&
        !LOOPBACK_HOSTS.has(parsed.hostname)
      ) {
        errors.push(
          `${prefix}: redirectURL "${url}" uses http:// — ` +
          `non-localhost http redirect URIs are not allowed in production (RFC 6749 §10.6)`
        );
      }
    }
  }

  return errors;
}

export function validateUsers(users: Map<string, UserConfig>): string[] {
  const errors: string[] = [];

  if (users.size === 0) {
    errors.push("users.yml: no users defined — at least one user is required");
  }

  const emailsSeen = new Set<string>();

  for (const [key, user] of users) {
    const prefix = `user "${key}"`;

    // Detect duplicate emails (can occur if the YAML has two entries with the
    // same email under different capitalisations, since keys are lowercased).
    const normalised = user.email.toLowerCase();
    if (emailsSeen.has(normalised)) {
      errors.push(`${prefix}: duplicate email address "${user.email}" — each user must have a unique email`);
    }
    emailsSeen.add(normalised);

    if (!user.email || !EMAIL_RE.test(user.email)) {
      errors.push(`${prefix}: "${user.email}" is not a valid email address`);
    }

    if (!user.name || user.name.trim() === "") {
      errors.push(`${prefix}: name must not be empty`);
    }

    if (!user.password) {
      errors.push(
        `${prefix}: password must not be empty — run: bun run users:set-password ${user.email}`
      );
    }

    // Validate custom claim key naming conventions (ref: issue #21).
    if (user.claims) {
      for (const claimKey of Object.keys(user.claims)) {
        const claimError = validateClaimKey(claimKey);
        if (claimError) {
          errors.push(`${prefix}: custom claim key "${claimKey}" — ${claimError}`);
        }
      }
    }
  }

  return errors;
}

/**
 * Validate both clients and users and print all errors. Returns the full
 * list of errors. An empty array means the config is valid.
 */
export function validateConfig(
  clients: Map<string, ClientConfig>,
  users: Map<string, UserConfig>
): string[] {
  return [...validateClients(clients), ...validateUsers(users)];
}
