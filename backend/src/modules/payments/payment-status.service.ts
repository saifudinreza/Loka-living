import { and, asc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, type Transaction } from "../../db/client";
import {
  cartItems,
  orderItems,
  orderStatusLogs,
  orders,
  paymentTransactions,
  processedWebhooks,
} from "../../db/schema";
import { ORDER_STATUSES, type OrderStatus } from "../../db/schema/enums";
import { AppError } from "../../lib/errors";
import { commit, release } from "../checkout/stock-reservation.service";

// Pemrosesan status Midtrans (issue 16).
// Ini satu-satunya tempat status order berubah jadi `paid`.
// Browser user tidak pernah dipercaya untuk mengubah status pembayaran.

export interface MidtransWebhookPayload {
  order_id: string;
  status_code: string;
  gross_amount: string;
  signature_key: string;
  transaction_status: string;
  transaction_id: string;
  fraud_status?: string | null;
  payment_type?: string | null;
  [key: string]: unknown;
}

export type StockAction = "commit" | "release" | "none";

export interface StatusResolution {
  targetStatus: OrderStatus | null;
  stockAction: StockAction;
}

type OrderRow = typeof orders.$inferSelect;

const isOrderStatus = (value: string): value is OrderStatus => (ORDER_STATUSES as readonly string[]).includes(value);

/**
 * Pemetaan status transaksi Midtrans ke status order kita:
 *
 * - settlement                    → paid (commit stock: stock_reserved -= qty)
 * - capture + accept              → paid (commit stock)
 * - capture + challenge / pending → tetap (tidak ada perubahan status/stok)
 * - deny                          → tetap awaiting_payment (Beda dari Laravel: user masih bisa coba kartu lain)
 * - expire                        → expired (release stock: reserved → available)
 * - cancel                        → cancelled (release stock)
 * - refund / partial_refund       → refunded
 *
 * Status yang tidak dikenal tidak mengubah apa pun, tetapi dicatat (`console.warn`) supaya status baru dari Midtrans
 * tidak lolos tanpa diketahui.
 */
export function resolveMidtransStatus(payload: {
  transaction_status: string;
  fraud_status?: string | null;
}): StatusResolution {
  const ts = payload.transaction_status;
  const fs = payload.fraud_status;

  if (ts === "settlement") {
    return { targetStatus: "paid", stockAction: "commit" };
  }

  if (ts === "capture") {
    if (fs === "accept") {
      return { targetStatus: "paid", stockAction: "commit" };
    }
    return { targetStatus: null, stockAction: "none" };
  }

  if (ts === "pending" || ts === "authorize") {
    return { targetStatus: null, stockAction: "none" };
  }

  if (ts === "deny") {
    // Tetap awaiting_payment supaya user bisa mencoba kartu/metode lain di Snap
    return { targetStatus: null, stockAction: "none" };
  }

  if (ts === "expire") {
    return { targetStatus: "expired", stockAction: "release" };
  }

  if (ts === "cancel") {
    return { targetStatus: "cancelled", stockAction: "release" };
  }

  if (ts === "refund" || ts === "partial_refund") {
    return { targetStatus: "refunded", stockAction: "none" };
  }

  console.warn(`[midtrans] transaction_status tidak dikenal: "${ts}". Diabaikan.`);
  return { targetStatus: null, stockAction: "none" };
}

/**
 * Transisi yang diizinkan:
 * - awaiting_payment → paid | expired | cancelled
 * - paid → refunded
 */
export function isTransitionAllowed(currentStatus: OrderStatus, targetStatus: OrderStatus): boolean {
  if (currentStatus === "awaiting_payment") {
    return targetStatus === "paid" || targetStatus === "expired" || targetStatus === "cancelled";
  }
  if (currentStatus === "paid") {
    return targetStatus === "refunded";
  }
  return false;
}

/**
 * Urutan "kemajuan" status transaksi. Midtrans tidak menjamin notifikasi tiba berurutan: `pending` bisa datang SESUDAH
 * `settlement`. Status baris pembayaran hanya boleh maju (atau sama), tidak mundur.
 * Status final (settlement) berada di atas status gagal (deny/expire/cancel), dan refund di atas keduanya.
 */
const PAYMENT_STATUS_RANK: Record<string, number> = {
  pending: 0,
  authorize: 1,
  capture: 2,
  deny: 3,
  cancel: 3,
  expire: 3,
  failure: 3,
  settlement: 4,
  refund: 5,
  partial_refund: 5,
  chargeback: 5,
  partial_chargeback: 5,
};

const rankOf = (status: string) => PAYMENT_STATUS_RANK[status] ?? 1;

export function canAdvancePaymentStatus(current: string, incoming: string): boolean {
  return rankOf(incoming) >= rankOf(current);
}

/** Midtrans mengirim "2516000.00"; hanya bilangan bulat (dengan desimal nol) yang dianggap sah. */
const GROSS_AMOUNT_FORMAT = /^\d+(\.0+)?$/;

/** Payload yang disimpan untuk audit: tanpa `signature_key` (turunan dari server key, tidak diperlukan sesudah verifikasi). */
function auditPayload(payload: MidtransWebhookPayload): Record<string, unknown> {
  const { signature_key: _omit, ...rest } = payload;
  return rest;
}

// ---------- langkah-langkah (semua dijalankan di dalam satu transaksi) ----------

/** Idempotency: true kalau event ini baru, false kalau sudah pernah diproses. */
async function markProcessed(tx: Transaction, eventId: string): Promise<boolean> {
  const inserted = await tx
    .insert(processedWebhooks)
    .values({ gateway: "midtrans", eventId })
    .onConflictDoNothing()
    .returning({ id: processedWebhooks.id });
  return inserted.length > 0;
}

async function lockOrder(tx: Transaction, orderToken: string): Promise<OrderRow> {
  const [order] = await tx.select().from(orders).where(eq(orders.orderToken, orderToken)).limit(1).for("update");
  if (!order) throw new AppError(404, "ORDER_NOT_FOUND", "Pesanan tidak ditemukan.");
  return order;
}

function assertAmountMatches(order: OrderRow, payload: MidtransWebhookPayload) {
  const ok = GROSS_AMOUNT_FORMAT.test(payload.gross_amount) && Number(payload.gross_amount) === order.totalAmount;
  if (!ok) {
    console.error(
      `[midtrans] KRITIS: AMOUNT_MISMATCH untuk order ${order.orderToken}. Payload gross_amount: "${payload.gross_amount}", total di DB: ${order.totalAmount}`,
    );
    throw new AppError(400, "AMOUNT_MISMATCH", "Jumlah pembayaran tidak sesuai dengan total pesanan.");
  }
}

/**
 * Setiap percobaan bayar punya baris sendiri:
 *   1. transaction_id sudah dikenal → perbarui (hanya kalau statusnya maju);
 *   2. belum dikenal, tapi ada baris pending dari `confirm` (gateway_transaction_id masih null) → isi baris itu;
 *   3. selain itu → baris baru (mis. kartu ditolak lalu coba kartu lain).
 */
async function upsertPaymentTransaction(tx: Transaction, order: OrderRow, payload: MidtransWebhookPayload) {
  const [existing] = await tx
    .select()
    .from(paymentTransactions)
    .where(eq(paymentTransactions.gatewayTransactionId, payload.transaction_id))
    .limit(1)
    .for("update");

  if (existing) {
    if (!canAdvancePaymentStatus(existing.status, payload.transaction_status)) {
      console.warn(
        `[midtrans] Notifikasi terlambat diabaikan untuk status pembayaran: ${existing.status} -> ${payload.transaction_status} (transaction ${payload.transaction_id}).`,
      );
      return;
    }
    await tx
      .update(paymentTransactions)
      .set({
        status: payload.transaction_status,
        gatewayPaymentMethod: payload.payment_type ?? existing.gatewayPaymentMethod,
        rawPayload: auditPayload(payload),
        updatedAt: sql`now()`,
      })
      .where(eq(paymentTransactions.id, existing.id));
    return;
  }

  const [pending] = await tx
    .select()
    .from(paymentTransactions)
    .where(
      and(
        eq(paymentTransactions.orderId, order.id),
        eq(paymentTransactions.gateway, "midtrans"),
        isNull(paymentTransactions.gatewayTransactionId),
      ),
    )
    .orderBy(asc(paymentTransactions.createdAt), asc(paymentTransactions.id))
    .limit(1)
    .for("update");

  if (pending) {
    await tx
      .update(paymentTransactions)
      .set({
        gatewayTransactionId: payload.transaction_id,
        gatewayPaymentMethod: payload.payment_type ?? pending.gatewayPaymentMethod,
        status: payload.transaction_status,
        rawPayload: auditPayload(payload),
        updatedAt: sql`now()`,
      })
      .where(eq(paymentTransactions.id, pending.id));
    return;
  }

  await tx.insert(paymentTransactions).values({
    orderId: order.id,
    gateway: "midtrans",
    gatewayTransactionId: payload.transaction_id,
    gatewayPaymentMethod: payload.payment_type ?? null,
    status: payload.transaction_status,
    amount: order.totalAmount,
    rawPayload: auditPayload(payload),
  });
}

/** Uang masuk untuk order yang stoknya sudah dilepas: tidak mengubah order, tetapi jejaknya wajib ada di database. */
async function recordRefundNeeded(tx: Transaction, order: OrderRow, payload: MidtransWebhookPayload) {
  const note = `KRITIS: ${payload.transaction_status} diterima saat order sudah ${order.status}. Uang masuk, stok sudah dilepas: perlu refund manual (transaction ${payload.transaction_id}).`;
  console.error(`[midtrans] ${note} Order: ${order.orderToken}`);
  await tx.insert(orderStatusLogs).values({
    orderId: order.id,
    fromStatus: order.status,
    toStatus: order.status,
    actor: "midtrans",
    note,
  });
}

/** Ubah status order sesuai notifikasi (kalau transisinya sah), beserta stok, log, dan keranjang. */
async function applyTransition(tx: Transaction, order: OrderRow, payload: MidtransWebhookPayload) {
  const { targetStatus, stockAction } = resolveMidtransStatus(payload);
  if (!targetStatus || targetStatus === order.status) return;

  if ((order.status === "expired" || order.status === "cancelled") && targetStatus === "paid") {
    await recordRefundNeeded(tx, order, payload);
    return;
  }

  if (!isOrderStatus(order.status) || !isTransitionAllowed(order.status, targetStatus)) {
    console.warn(
      `[midtrans] Transisi status tidak diizinkan: ${order.status} -> ${targetStatus} (order: ${order.orderToken}). Webhook diabaikan.`,
    );
    return;
  }

  await tx
    .update(orders)
    .set({
      status: targetStatus,
      updatedAt: sql`now()`,
      ...(targetStatus === "expired" || targetStatus === "cancelled" ? { reservedUntil: null } : {}),
    })
    .where(eq(orders.id, order.id));

  // Stok: commit atau release lewat stock-reservation.service.ts
  if (stockAction === "commit") await commit(tx, order.id);
  else if (stockAction === "release") await release(tx, order.id);

  await tx.insert(orderStatusLogs).values({
    orderId: order.id,
    fromStatus: order.status,
    toStatus: targetStatus,
    actor: "midtrans",
    note: `Webhook: ${payload.transaction_status}`,
  });

  if (targetStatus === "paid" && order.userId) await clearPurchasedFromCart(tx, order.id, order.userId);
}

/** Barang yang sudah dibeli tidak tertinggal di keranjang akun. Keranjang tamu dikosongkan frontend sendiri. */
async function clearPurchasedFromCart(tx: Transaction, orderId: string, userId: string) {
  const items = await tx
    .select({ variantId: orderItems.productVariantId })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));
  const variantIds = items.map((i) => i.variantId);
  if (variantIds.length === 0) return;
  await tx.delete(cartItems).where(and(eq(cartItems.userId, userId), inArray(cartItems.productVariantId, variantIds)));
}

/**
 * Memproses payload notifikasi webhook Midtrans dalam satu transaksi database.
 * Kegagalan di langkah mana pun membatalkan semuanya (termasuk penanda idempotency), sehingga Midtrans yang mengulang
 * notifikasi akan diproses utuh.
 */
export async function applyMidtransWebhook(payload: MidtransWebhookPayload): Promise<{ message: string }> {
  const eventId = `${payload.transaction_id}:${payload.transaction_status}`;

  return db.transaction(async (tx) => {
    if (!(await markProcessed(tx, eventId))) return { message: "Already processed" };

    const order = await lockOrder(tx, payload.order_id);
    assertAmountMatches(order, payload);
    await upsertPaymentTransaction(tx, order, payload);
    await applyTransition(tx, order, payload);

    return { message: "OK" };
  });
}
