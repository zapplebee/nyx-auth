// ES256 signing key management.
//
// For single-instance / CI: a new key pair is generated at startup.
// For multi-replica: set SIGNING_PRIVATE_JWK to the JSON-serialized private key JWK
// so all replicas share the same key and can verify each other's tokens.
//
// To generate a stable key pair:
//   bun -e "import {generateKeyPair,exportJWK} from 'jose'; const {privateKey}=await generateKeyPair('ES256'); console.log(JSON.stringify(await exportJWK(privateKey)))"

import { generateKeyPair, exportJWK, importJWK, type KeyLike } from "jose";

export interface SigningKeys {
  privateKey: KeyLike;
  publicKey: KeyLike;
  /** Public JWK with kid/use/alg set — returned from /api/auth/jwks.json */
  publicJwk: Record<string, unknown>;
  kid: string;
}

let _keys: SigningKeys | null = null;

export async function getKeys(): Promise<SigningKeys> {
  if (_keys) return _keys;

  const envJwk = process.env.SIGNING_PRIVATE_JWK;
  if (envJwk) {
    const jwk = JSON.parse(envJwk) as Record<string, unknown>;
    const kid = (jwk.kid as string | undefined) ?? "nyx-1";
    const privateKey = (await importJWK(jwk as Parameters<typeof importJWK>[0], "ES256")) as KeyLike;
    // Strip private key fields to derive public JWK
    const { d: _d, ...publicJwk } = jwk;
    publicJwk.kid = kid;
    publicJwk.use = "sig";
    publicJwk.alg = "ES256";
    const publicKey = (await importJWK(publicJwk as Parameters<typeof importJWK>[0], "ES256")) as KeyLike;
    _keys = { privateKey, publicKey, publicJwk, kid };
  } else {
    const { privateKey, publicKey } = await generateKeyPair("ES256");
    const publicJwk = await exportJWK(publicKey);
    const kid = "nyx-" + Date.now().toString(36);
    publicJwk.kid = kid;
    publicJwk.use = "sig";
    publicJwk.alg = "ES256";
    _keys = { privateKey, publicKey, publicJwk, kid };
    console.log("[nyx-auth] Generated ephemeral signing key — set SIGNING_PRIVATE_JWK for multi-replica stability");
  }

  return _keys;
}
