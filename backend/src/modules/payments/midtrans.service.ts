import { env } from "../../config/env";
import { AppError } from "../../lib/errors";

// Klien Midtrans Snap (issue 15). Dipanggil langsung lewat fetch, tanpa SDK.
// Aturan keras: pesan error dari Midtrans HANYA masuk log, tidak pernah ke client.

export type PaymentMethod = "qris" | "va_bca" | "credit_card";

// Nilai `enabled_payments` Midtrans per metode. QRIS: cek di sandbox bahwa "other_qris" benar-benar memunculkan QRIS;
// kalau tidak, coba "qris" dan catat mana yang benar.
export const ENABLED_PAYMENTS: Record<PaymentMethod, string[]> = {
  qris: ["other_qris"],
  va_bca: ["bca_va"],
  credit_card: ["credit_card"],
};

// Batas Midtrans: nama item maksimal 50 karakter.
const MAX_ITEM_NAME = 50;
const TIMEOUT_MS = 15_000;
const EXPIRY_MINUTES = 30;

export interface SnapItem {
  id: string;
  price: number;
  quantity: number;
  name: string;
}

export interface CreateTransactionInput {
  orderToken: string;
  grossAmount: number;
  items: SnapItem[];
  customer: { email: string; phone: string | null };
  method: PaymentMethod;
}

export interface SnapResult {
  token: string;
  redirect_url: string;
}

/** Konfigurasi bisa disuntikkan supaya test tidak perlu menyentuh env asli atau jaringan. */
export interface MidtransConfig {
  serverKey: string;
  isProduction: boolean;
  fetch: typeof fetch;
}

const defaultConfig = (): MidtransConfig => ({
  serverKey: env.MIDTRANS_SERVER_KEY,
  isProduction: env.MIDTRANS_IS_PRODUCTION,
  fetch,
});

const unavailable = () =>
  new AppError(502, "MIDTRANS_UNAVAILABLE", "Layanan pembayaran sedang bermasalah. Coba lagi beberapa saat.");

export function truncateName(name: string): string {
  return name.length > MAX_ITEM_NAME ? name.slice(0, MAX_ITEM_NAME) : name;
}

/**
 * Midtrans menolak transaksi kalau Σ(price × quantity) item ≠ gross_amount.
 * Dicek di sini supaya kesalahan hitung kita jadi error jelas di log, bukan penolakan samar dari Midtrans.
 */
function assertItemsMatchTotal(items: SnapItem[], grossAmount: number) {
  const sum = items.reduce((acc, i) => acc + i.price * i.quantity, 0);
  if (sum !== grossAmount) {
    throw new Error(`Midtrans: jumlah item (${sum}) tidak sama dengan gross_amount (${grossAmount})`);
  }
}

export async function createTransaction(
  input: CreateTransactionInput,
  config: MidtransConfig = defaultConfig(),
): Promise<SnapResult> {
  // Key kosong dicek SEBELUM request apa pun dikirim.
  if (!config.serverKey) {
    console.error("[midtrans] MIDTRANS_SERVER_KEY kosong");
    throw new AppError(503, "PAYMENT_CONFIG_MISSING", "Metode pembayaran sedang tidak tersedia.");
  }

  assertItemsMatchTotal(input.items, input.grossAmount);

  const base = config.isProduction ? "https://app.midtrans.com" : "https://app.sandbox.midtrans.com";
  const body = {
    transaction_details: { order_id: input.orderToken, gross_amount: input.grossAmount },
    item_details: input.items.map((i) => ({ ...i, name: truncateName(i.name) })),
    customer_details: { email: input.customer.email, ...(input.customer.phone ? { phone: input.customer.phone } : {}) },
    enabled_payments: ENABLED_PAYMENTS[input.method],
    // Supaya Midtrans mengirim webhook `expire` kalau user tidak membayar (diproses issue 16).
    expiry: { unit: "minutes", duration: EXPIRY_MINUTES },
  };

  let res: Response;
  try {
    res = await config.fetch(`${base}/snap/v1/transactions`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`${config.serverKey}:`).toString("base64")}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    console.error("[midtrans] request gagal (timeout/jaringan):", e);
    throw unavailable();
  }

  if (!res.ok) {
    console.error(`[midtrans] status ${res.status}:`, await res.text().catch(() => "(body tidak terbaca)"));
    throw unavailable();
  }

  const json = (await res.json().catch(() => null)) as Partial<SnapResult> | null;
  if (!json?.token || !json.redirect_url) {
    console.error("[midtrans] respons sukses tapi tanpa token/redirect_url:", json);
    throw unavailable();
  }
  return { token: json.token, redirect_url: json.redirect_url };
}
