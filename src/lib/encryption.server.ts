import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "crypto";

const ALGO = "aes-256-gcm";

function getKey(): Buffer {
  const master = process.env.CREDENTIAL_MASTER_KEY;
  if (!master) throw new Error("CREDENTIAL_MASTER_KEY missing");
  // Derive a deterministic 32-byte key from master via scrypt.
  return scryptSync(master, "imt-vault-v1", 32);
}

export function encryptSecret(plaintext: string): { ciphertext: string; iv: string; authTag: string; keyId: string } {
  const key = getKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ciphertext: enc.toString("base64"),
    iv: iv.toString("base64"),
    authTag: tag.toString("base64"),
    keyId: "v1",
  };
}

export function decryptSecret(input: { ciphertext: string; iv: string; authTag: string }): string {
  const key = getKey();
  const iv = Buffer.from(input.iv, "base64");
  const tag = Buffer.from(input.authTag, "base64");
  const ct = Buffer.from(input.ciphertext, "base64");
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(ct), decipher.final()]);
  return dec.toString("utf8");
}
