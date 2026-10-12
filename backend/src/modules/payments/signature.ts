import { env } from "../../config/env";
import { sha512Hex, timingSafeEqualHex } from "../../lib/crypto";

// Verifikasi webhook signature Midtrans (issue 16).
// Midtrans menghitung sha512(order_id + status_code + gross_amount + SERVER_KEY).
// Penyerang tidak tahu server key, jadi tidak bisa membuat signature yang cocok.

export interface MidtransSignaturePayload {
  order_id: string;
  status_code: string;
  gross_amount: string;
  signature_key: string;
}

/**
 * Memverifikasi keaslian webhook dari Midtrans.
 *
 * 1. Server key kosong → `console.error` dan return `false` langsung.
 * 2. `expected = sha512Hex(order_id + status_code + gross_amount + serverKey)` memakai string mentah.
 * 3. Bandingkan secara konstan (timing-safe) dengan `payload.signature_key`.
 */
export function verifyMidtransSignature(
  payload: MidtransSignaturePayload,
  serverKey: string = env.MIDTRANS_SERVER_KEY,
): boolean {
  if (!serverKey) {
    console.error("[midtrans] Webhook ditolak: MIDTRANS_SERVER_KEY kosong.");
    return false;
  }

  const { order_id, status_code, gross_amount, signature_key } = payload;
  if (!order_id || !status_code || !gross_amount || !signature_key) {
    return false;
  }

  const raw = `${order_id}${status_code}${gross_amount}${serverKey}`;
  const expected = sha512Hex(raw);

  return timingSafeEqualHex(expected, signature_key.toLowerCase());
}
