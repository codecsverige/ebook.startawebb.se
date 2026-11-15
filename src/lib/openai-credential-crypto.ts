import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from "node:crypto";

/** AES-256-GCM; keys are derived from the existing Firebase service-account
 * private key, not from code or a public Firebase web API key.
 * If the service-account key rotates, the owner must re-save the API key.
 */
export type EncryptedOpenAiKey = {
  version: 1;
  nonce: string;
  ciphertext: string;
  authTag: string;
};

function secretKey(firebasePrivateKey: string): Buffer {
  if (!firebasePrivateKey.trim()) throw new Error("firebase_credential_missing");
  return Buffer.from(hkdfSync(
    "sha256",
    Buffer.from(firebasePrivateKey.replace(/\\n/g, "\n"), "utf8"),
    Buffer.from("ebook-studio-credential-seal-v1", "utf8"),
    Buffer.from("openai-direct-api-key", "utf8"),
    32,
  ));
}

export function sealOpenAiKey(value: string, firebasePrivateKey: string): EncryptedOpenAiKey {
  const nonce = randomBytes(12);
  const key = secretKey(firebasePrivateKey);
  try {
    const cipher = createCipheriv("aes-256-gcm", key, nonce);
    const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
    return {
      version: 1,
      nonce: nonce.toString("base64"),
      ciphertext: ciphertext.toString("base64"),
      authTag: cipher.getAuthTag().toString("base64"),
    };
  } finally {
    key.fill(0);
  }
}

export function unsealOpenAiKey(record: EncryptedOpenAiKey, firebasePrivateKey: string): string {
  if (record.version !== 1) throw new Error("unsupported_secret_version");
  const nonce = Buffer.from(record.nonce, "base64");
  const tag = Buffer.from(record.authTag, "base64");
  if (nonce.length !== 12 || tag.length !== 16) throw new Error("invalid_secret_format");
  const key = secretKey(firebasePrivateKey);
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, nonce);
    decipher.setAuthTag(tag);
    return Buffer.concat([
      decipher.update(Buffer.from(record.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } finally {
    key.fill(0);
  }
}
