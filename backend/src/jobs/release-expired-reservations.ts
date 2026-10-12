import { and, asc, eq, sql } from "drizzle-orm";
import { db, type Transaction } from "../db/client";
import { orderItems, orders, orderStatusLogs, productVariants, refreshTokens } from "../db/schema";
import { release as releaseStock } from "../modules/checkout/stock-reservation.service";

const MAX_BATCH = 100;

/**
 * Melepas reservasi stok untuk order `draft` yang kedaluwarsa (`reserved_until <= now()`).
 *
 * Setiap order diproses dalam transaksi sendiri-sendiri supaya satu order yang gagal
 * tidak menggagulkan yang lain. Mengembalikan jumlah order yang dilepas.
 */
export async function releaseExpiredReservations(): Promise<number> {
  // Ambil ID order draft yang kedaluwarsa (maksimal 100)
  const expiredOrders = await db
    .select({ id: orders.id })
    .from(orders)
    .where(and(eq(orders.status, "draft"), sql`${orders.reservedUntil} <= now()`))
    .orderBy(asc(orders.reservedUntil))
    .limit(MAX_BATCH);

  let releasedCount = 0;

  for (const { id } of expiredOrders) {
    try {
      await db.transaction(async (tx) => {
        // Kunci order FOR UPDATE, cek ulang status & reserved_until
        const [locked] = await tx
          .select({
            status: orders.status,
            // dibandingkan di database: satu sumber waktu dengan init/confirm (bukan jam server aplikasi)
            expired: sql<boolean>`${orders.reservedUntil} is not null and ${orders.reservedUntil} <= now()`,
          })
          .from(orders)
          .where(eq(orders.id, id))
          .for("update");

        if (!locked || locked.status !== "draft" || !locked.expired) {
          return; // Sudah tidak draft atau tidak kedaluwarsa (user confirm tepat sebelum lock)
        }

        // Lepas stok (fungsi dari stock-reservation.service.ts)
        await releaseStock(tx, id);

        // Update order status ke expired, bersihkan reserved_until
        await tx
          .update(orders)
          .set({ status: "expired", reservedUntil: null })
          .where(eq(orders.id, id));

        // Catat log
        await tx.insert(orderStatusLogs).values({
          orderId: id,
          fromStatus: "draft",
          toStatus: "expired",
          actor: "system",
          note: "Reservasi kedaluwarsa, stok dikembalikan",
        });

        releasedCount++;
      });
    } catch (err) {
      console.error(`[release-expired-reservations] gagal melepas order ${id}:`, err);
      // Lanjut ke order berikutnya
    }
  }

  return releasedCount;
}

/**
 * Menghapus refresh token yang kedaluwarsa lebih dari 7 hari.
 * Dijalankan sekali sehari via cron.
 */
export async function cleanupExpiredRefreshTokens(): Promise<number> {
  const toDelete = await db
    .select({ id: refreshTokens.id })
    .from(refreshTokens)
    .where(sql`${refreshTokens.expiresAt} <= now() - interval '7 days'`);

  if (toDelete.length === 0) return 0;

  await db
    .delete(refreshTokens)
    .where(sql`${refreshTokens.expiresAt} <= now() - interval '7 days'`);

  return toDelete.length;
}