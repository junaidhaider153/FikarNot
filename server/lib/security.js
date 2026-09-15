import crypto from "node:crypto";
import { db } from "../db/schema.js";

const uid = (prefix = "u") => `${prefix}${crypto.randomBytes(8).toString("hex")}`;
const token = () => crypto.randomBytes(32).toString("base64url");
const sha256 = (value) => crypto.createHash("sha256").update(value).digest("hex");
const scrypt = (password, salt) => crypto.scryptSync(password, salt, 64);

const hashPassword = (password) => {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = scrypt(password, salt);
  return `scrypt$${salt}$${derived.toString("hex")}`;
};

const verifyPassword = (password, encoded) => {
  const [algorithm, salt, hex] = String(encoded || "").split("$");
  if (algorithm !== "scrypt" || !salt || !hex) return false;
  const expected = Buffer.from(hex, "hex");
  const actual = scrypt(password, salt);
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
};


const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
const base32Encode = (buffer) => {
  let bits = 0;
  let value = 0;
  let output = "";
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
};
const base32Decode = (input) => {
  const cleaned = String(input || "").toUpperCase().replace(/=+$/g, "");
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of cleaned) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index < 0) throw new Error("Invalid Base32 secret");
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
};
const totpCode = (secret, timestamp = Date.now()) => {
  const key = base32Decode(secret);
  const counter = Math.floor(timestamp / 1000 / 30);
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac("sha1", key).update(msg).digest();
  const offset = digest[digest.length - 1] & 15;
  const binary = ((digest[offset] & 127) << 24) | (digest[offset + 1] << 16) | (digest[offset + 2] << 8) | digest[offset + 3];
  return String(binary % 1_000_000).padStart(6, "0");
};
const verifyTotp = (secret, code) => {
  const normalized = String(code || "").replace(/\s+/g, "");
  if (!/^\d{6}$/.test(normalized)) return false;
  const now = Date.now();
  for (const drift of [-30_000, 0, 30_000]) if (crypto.timingSafeEqual(Buffer.from(totpCode(secret, now + drift)), Buffer.from(normalized))) return true;
  return false;
};
const createTwoFactorChallenge = (userId) => {
  const raw = token();
  const now = Date.now();
  db.prepare("DELETE FROM two_factor_challenges WHERE expires_at<=?").run(now);
  db.prepare("DELETE FROM two_factor_challenges WHERE user_id=?").run(userId);
  db.prepare("INSERT INTO two_factor_challenges(token_hash,user_id,created_at,expires_at,attempts) VALUES (?,?,?,?,0)").run(sha256(raw), userId, now, now + 5 * 60_000);
  return raw;
};
const getTwoFactorChallenge = (raw) => raw ? db.prepare("SELECT * FROM two_factor_challenges WHERE token_hash=? AND expires_at>? AND attempts<5").get(sha256(raw), Date.now()) : null;
const consumeTwoFactorChallenge = (raw) => { const row = getTwoFactorChallenge(raw); if (!row) return null; db.prepare("DELETE FROM two_factor_challenges WHERE token_hash=?").run(sha256(raw)); return row; };
const otpauthUri = (secret, email) => `otpauth://totp/FikarNot:${encodeURIComponent(email)}?secret=${secret}&issuer=FikarNot&algorithm=SHA1&digits=6&period=30`;

export {
  uid, token, sha256, scrypt, hashPassword, verifyPassword, BASE32_ALPHABET, base32Encode,
  base32Decode, totpCode, verifyTotp, createTwoFactorChallenge, getTwoFactorChallenge,
  consumeTwoFactorChallenge, otpauthUri,
};
