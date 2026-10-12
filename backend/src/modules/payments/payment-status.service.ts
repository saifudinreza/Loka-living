import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { db } from "../../db/client";
import {
  cartItems,
  orderItems,
  orderStatusLogs,
  orders,
  paymentTransactions,
  processedWebhooks,
} from "../../db/schema";
import type { OrderStatus } from "../../db/schema/enums";
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
 * Memproses payload notifikasi webhook Midtrans dalam satu transaksi database.
 */
export async function applyMidtransWebhook(payload: MidtransWebhookPayload): Promise<{ message: string }> {
  const eventId = `${payload.transaction_id}:${payload.transaction_status}`;

  return db.transaction(async (tx) => {
    // 1. Idempotency: eventId = transaction_id + ":" + transaction_status
    const inserted = await tx
      .insert(processedWebhooks)
      .values({
        gateway: "midtrans",
        eventId,
      })
      .onConflictDoNothing()
      .returning({ id: processedWebhooks.id });

    if (inserted.length === 0) {
      return { message: "Already processed" };
    }

    // 2. Cari order by order_token = order_id, FOR UPDATE
    const [order] = await tx
      .select()
      .from(orders)
      .where(eq(orders.orderToken, payload.order_id))
      .limit(1)
      .for("update");

    if (!order) {
      throw new AppError(404, "ORDER_NOT_FOUND", "Pesanan tidak ditemukan.");
    }

    // 3. Validasi gross_amount: Math.round(Number(gross_amount)) !== order.total_amount
    const grossAmount = Math.round(Number(payload.gross_amount));
    if (isNaN(grossAmount) || grossAmount !== order.totalAmount) {
      console.error(
        `[midtrans] KRITIS: AMOUNT_MISMATCH untuk order ${order.orderToken}. Payload gross_amount: "${payload.gross_amount}" (${grossAmount}), total di DB: ${order.totalAmount}`,
      );
      throw new AppError(400, "AMOUNT_MISMATCH", "Jumlah pembayaran tidak sesuai dengan total pesanan.");
    }

    // 4. Upsert payment_transactions berdasarkan gateway_transaction_id = transaction_id:
    const [existingTx] = await tx
      .select()
      .from(paymentTransactions)
      .where(eq(paymentTransactions.gatewayTransactionId, payload.transaction_id))
      .limit(1)
      .for("update");

    if (existingTx) {
      await tx
        .update(paymentTransactions)
        .set({
          status: payload.transaction_status,
          gatewayPaymentMethod: payload.payment_type ?? existingTx.gatewayPaymentMethod,
          rawPayload: payload,
          updatedAt: sql`now()`,
        })
        .where(eq(paymentTransactions.id, existingTx.id));
    } else {
      // Baris pending yang dibuat saat confirm (gateway_transaction_id masih null)
      const [pendingRow] = await tx
        .select()
        .from(paymentTransactions)
        .where(
          and(
            eq(paymentTransactions.orderId, order.id),
            eq(paymentTransactions.gateway, "midtrans"),
            isNull(paymentTransactions.gatewayTransactionId),
          ),
        )
        .limit(1)
        .for("update");

      if (pendingRow) {
        await tx
          .update(paymentTransactions)
          .set({
            gatewayTransactionId: payload.transaction_id,
            gatewayPaymentMethod: payload.payment_type ?? pendingRow.gatewayPaymentMethod,
            status: payload.transaction_status,
            rawPayload: payload,
            updatedAt: sql`now()`,
          })
          .where(eq(paymentTransactions.id, pendingRow.id));
      } else {
        // Percobaan pembayaran berikutnya (misalnya kartu ditolak lalu coba kartu lain)
        await tx.insert(paymentTransactions).values({
          orderId: order.id,
          gateway: "midtrans",
          gatewayTransactionId: payload.transaction_id,
          gatewayPaymentMethod: payload.payment_type ?? null,
          status: payload.transaction_status,
          amount: order.totalAmount,
          rawPayload: payload,
        });
      }
    }

    // 5. Tentukan status baru dari tabel:
    const { targetStatus, stockAction } = resolveMidtransStatus(payload);

    if (targetStatus && targetStatus !== order.status) {
      // Kasus khusus: order sudah expired/cancelled tapi datang settlement
      if ((order.status === "expired" || order.status === "cancelled") && targetStatus === "paid") {
        console.error(
          `[midtrans] KRITIS: uang masuk tapi stok sudah dilepas, perlu refund manual. Order: ${order.orderToken}, status sekarang: ${order.status}`,
        );
      } else if (!isTransitionAllowed(order.status as OrderStatus, targetStatus)) {
        console.warn(
          `[midtrans] Transisi status tidak diizinkan: ${order.status} -> ${targetStatus} (order: ${order.orderToken}). Webhook diabaikan.`,
        );
      } else {
        // Transisi boleh
        const updateData: {
          status: OrderStatus;
          updatedAt: ReturnType<typeof sql>;
          reservedUntil?: null;
        } = {
          status: targetStatus,
          updatedAt: sql`now()`,
        };
        if (targetStatus === "expired" || targetStatus === "cancelled") {
          updateData.reservedUntil = null;
        }

        await tx.update(orders).set(updateData).where(eq(orders.id, order.id));

        // Stok: commit atau release lewat stock-reservation.service.ts
        if (stockAction === "commit") {
          await commit(tx, order.id);
        } else if (stockAction === "release") {
          await release(tx, order.id);
        }

        // Insert order_status_logs (actor: midtrans)
        await tx.insert(orderStatusLogs).values({
          orderId: order.id,
          fromStatus: order.status,
          toStatus: targetStatus,
          actor: "midtrans",
          note: `Webhook: ${payload.transaction_status}`,
        });

        // Kalau status baru paid dan order punya user_id: bersihkan barang yang dibeli dari keranjang user
        if (targetStatus === "paid" && order.userId) {
          const items = await tx
            .select({ variantId: orderItems.productVariantId })
            .from(orderItems)
            .where(eq(orderItems.orderId, order.id));
          const variantIds = items.map((i) => i.variantId);
          if (variantIds.length > 0) {
            await tx
              .delete(cartItems)
              .where(
                and(
                  eq(cartItems.userId, order.userId),
                  inArray(cartItems.productVariantId, variantIds),
                ),
              );
          }
        }
      }
    }

    return { message: "OK" };
  });
}
