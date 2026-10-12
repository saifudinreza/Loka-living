import { Elysia } from "elysia";
import { AppError } from "./errors";

/**
 * Karakter NUL (\u0000) tidak boleh ada di teks PostgreSQL. Tanpa pemeriksaan ini, satu NUL di mana pun (nama, alamat,
 * slug, token di URL, query) membuat database menolak query, dan user melihat 500 + log error, padahal itu salah
 * input (seharusnya 4xx).
 */
export function containsNul(value: unknown, depth = 0): boolean {
  if (typeof value === "string") return value.includes("\u0000");
  if (value === null || typeof value !== "object" || depth > 20) return false;
  return Object.entries(value).some(([key, inner]) => key.includes("\u0000") || containsNul(inner, depth + 1));
}

/** Menolak (422) permintaan yang membawa NUL di body, query, atau parameter URL. Berlaku global. */
export const rejectNul = new Elysia({ name: "reject-nul" }).onTransform({ as: "global" }, ({ body, query, params }) => {
  if (containsNul(body) || containsNul(query) || containsNul(params)) {
    throw new AppError(422, "VALIDATION_FAILED", "Data yang dikirim tidak valid.");
  }
});
