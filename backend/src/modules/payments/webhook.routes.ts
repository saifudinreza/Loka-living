import { Elysia } from "elysia";
import { AppError } from "../../lib/errors";
import { applyMidtransWebhook, type MidtransWebhookPayload } from "./payment-status.service";
import { paymentsDocs } from "./payments.docs";
import { verifyMidtransSignature } from "./signature";

// Endpoint notifikasi pembayaran Midtrans (issue 16).
// Route ini publik tanpa limiter atau pembatasan CORS karena dipanggil oleh server Midtrans.

export interface WebhookRoutesDeps {
  serverKey?: string;
}

export function parseWebhookPayload(body: unknown): MidtransWebhookPayload {
  if (!body || typeof body !== "object") {
    throw new AppError(400, "BAD_REQUEST", "Body request tidak valid.");
  }
  const b = body as Record<string, unknown>;
  const required = [
    "order_id",
    "status_code",
    "gross_amount",
    "signature_key",
    "transaction_status",
    "transaction_id",
  ] as const;

  for (const field of required) {
    if (typeof b[field] !== "string" || b[field].trim() === "") {
      throw new AppError(400, "BAD_REQUEST", `Field "${field}" wajib diisi dan berupa string.`);
    }
  }

  return {
    ...b,
    order_id: b.order_id as string,
    status_code: b.status_code as string,
    gross_amount: b.gross_amount as string,
    signature_key: b.signature_key as string,
    transaction_status: b.transaction_status as string,
    transaction_id: b.transaction_id as string,
    fraud_status: typeof b.fraud_status === "string" ? b.fraud_status : null,
    payment_type: typeof b.payment_type === "string" ? b.payment_type : null,
  };
}

export function webhookRoutes(deps: WebhookRoutesDeps = {}) {
  return new Elysia({ prefix: "/payment" }).post(
    "/webhook",
    async ({ body }) => {
      // 1. Validasi minimal field string
      const payload = parseWebhookPayload(body);

      // 2. Verifikasi signature
      const isValid = verifyMidtransSignature(payload, deps.serverKey);
      if (!isValid) {
        throw new AppError(401, "INVALID_SIGNATURE", "Signature tidak valid.");
      }

      // 3. Proses dalam satu transaksi DB
      return applyMidtransWebhook(payload);
    },
    {
      detail: paymentsDocs.webhook,
    },
  );
}
