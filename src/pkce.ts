/** base64url-encode an ArrayBuffer with no padding. */
export function b64url(buf: ArrayBuffer): string {
  return Buffer.from(buf).toString("base64url");
}

/**
 * Verify PKCE S256: SHA-256(verifier) must equal the stored challenge.
 * Both are base64url-encoded without padding.
 */
export async function verifyPKCE(verifier: string, challenge: string): Promise<boolean> {
  if (!verifier || !challenge) return false;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return b64url(digest) === challenge;
}
