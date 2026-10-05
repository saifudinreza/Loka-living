import { createHash, timingSafeEqual } from "node:crypto";

/** 32 byte acak, di-encode base64url (43 karakter). */
export function randomToken(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/** Perbandingan waktu-konstan untuk dua string hex; false kalau panjang beda. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}
