// Generates the golden encryption vector that the Go test asserts on.
// Run with: node gen_vector.mjs
//
// This mirrors server/src/common/crypto.service.ts byte-for-byte:
//   AES-256-GCM, 12-byte IV, 16-byte tag, no AAD,
//   format = base64(iv).base64(tag).base64(ciphertext)
import { createCipheriv } from "node:crypto";

const KEY_HEX = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
const IV_HEX = "0123456789abcdef01234567";
const PLAINTEXT = "hello-finance_next";

const key = Buffer.from(KEY_HEX, "hex");
const iv = Buffer.from(IV_HEX, "hex");

const cipher = createCipheriv("aes-256-gcm", key, iv);
const enc = Buffer.concat([cipher.update(PLAINTEXT, "utf8"), cipher.final()]);
const tag = cipher.getAuthTag();

const out = `${iv.toString("base64")}.${tag.toString("base64")}.${enc.toString("base64")}`;
console.log(out);
