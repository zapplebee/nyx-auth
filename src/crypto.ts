// AES-256-GCM encryption for secrets stored in clients.yml.
// Key is derived from BETTER_AUTH_SECRET via PBKDF2 so that encrypted values
// are only decryptable on instances with the same secret.
//
// Wire format: enc:<base64(12-byte IV || ciphertext+authTag)>

const PREFIX = "enc:";
const SALT = new TextEncoder().encode("nyx-auth-clients-v1");

async function deriveKey(secret: string): Promise<CryptoKey> {
  const raw = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    "PBKDF2",
    false,
    ["deriveKey"]
  );
  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: SALT, iterations: 100_000, hash: "SHA-256" },
    raw,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptSecret(plaintext: string, secret: string): Promise<string> {
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plaintext)
  );
  const out = new Uint8Array(12 + ciphertext.byteLength);
  out.set(iv);
  out.set(new Uint8Array(ciphertext), 12);
  return PREFIX + Buffer.from(out).toString("base64");
}

export async function decryptSecret(value: string, secret: string): Promise<string> {
  if (!value.startsWith(PREFIX)) {
    throw new Error(`Client secret must start with "${PREFIX}" — run: bun run clients:set-secret <clientId>`);
  }
  const data = Buffer.from(value.slice(PREFIX.length), "base64");
  const iv = data.subarray(0, 12);
  const ciphertext = data.subarray(12);
  const key = await deriveKey(secret);
  const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return new TextDecoder().decode(plain);
}
