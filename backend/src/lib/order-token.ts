import { randomToken } from "./crypto";

// order_token berfungsi seperti kata sandi pesanan tamu, dan dipakai langsung sebagai `order_id` Midtrans.
// Semua aturan tentang bentuknya ada di sini supaya pembuat (init), validator request (route checkout), dan
// pembaca (GET /orders/:token) tidak bisa berbeda pendapat.

/** 32 byte acak = 256 bit, 43 karakter base64url. Cukup pendek untuk batas `order_id` Midtrans. */
export const ORDER_TOKEN_BYTES = 32;

/** Midtrans menolak `order_id` lebih dari 50 karakter. */
export const MIDTRANS_ORDER_ID_MAX = 50;

/** Batas input dari client. Sengaja lebih longgar dari panjang token sekarang: toleran terhadap token lama (64 karakter). */
export const ORDER_TOKEN_MAX_LENGTH = 64;

/** Bentuk token yang mungkin sah. Selain ini langsung dianggap tidak ada, tanpa menyentuh database. */
export const ORDER_TOKEN_PATTERN = /^[A-Za-z0-9_-]{32,64}$/;

export const generateOrderToken = (): string => randomToken(ORDER_TOKEN_BYTES);
