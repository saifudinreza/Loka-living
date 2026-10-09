import { and, asc, count, eq, gt, inArray, sql } from "drizzle-orm";
import { db, type Transaction } from "../../db/client";
import { orderItems, orders, orderStatusLogs, productVariants, products, users } from "../../db/schema";
import { randomToken } from "../../lib/crypto";
import { AppError } from "../../lib/errors";

// Reservasi stok: menahan stok untuk pembeli selama 30 menit supaya dua orang yang membeli stok terakhir
// bersamaan tidak sama-sama berhasil (oversell). Salah satu hal yang tidak boleh dilonggarkan (CLAUDE.md §4).

export const RESERVATION_MINUTES = 30;
/** Batas order `draft` aktif per user login (pengaman penimbunan stok). */
export const MAX_PENDING_ORDERS = 5;
const MAX_QTY = 99;

export interface InitItem {
  product_variant_id: string;
  qty: number;
}

/**
 * Memulai checkout: menahan stok dan membuat order `draft`.
 *
 * Alur (semua dalam SATU transaksi; error di mana pun membatalkan semuanya):
 *   1. Item dengan varian yang sama digabung (qty dijumlahkan) SEBELUM apa pun.
 *   2. User login: kunci baris user, lalu cek batas order draft aktif.
 *   3. Kunci baris varian dengan SELECT ... FOR UPDATE, URUT id. Request lain yang butuh varian yang sama MENUNGGU
 *      sampai transaksi ini selesai, lalu membaca stok terbaru. Tanpa kunci, dua request bisa sama-sama membaca
 *      "stok = 1" lalu sama-sama menguranginya (oversell).
 *   4. Validasi dengan nilai dari database; stok diubah secara atomik DI SQL (bukan dihitung di JavaScript).
 *   5. Harga dari database, tidak pernah dari request.
 *
 * Urutan kunci SELALU sama untuk semua request: user dulu, lalu varian urut id. Kalau A mengunci X lalu Y sementara B
 * mengunci Y lalu X, keduanya saling menunggu selamanya (deadlock); urutan yang sama membuatnya mustahil.
 */
export async function init(items: InitItem[], userId: string | null) {
  // 1. Gabungkan varian yang sama. Beda dari Laravel lama: di sana stok dicek per baris memakai nilai yang sudah dibaca,
  //    jadi varian yang muncul dua kali bisa lolos walau stoknya kurang.
  const wanted = new Map<string, number>(); // urutan penyisipan = urutan item di respons
  for (const item of items) wanted.set(item.product_variant_id, (wanted.get(item.product_variant_id) ?? 0) + item.qty);
  for (const qty of wanted.values()) {
    if (qty > MAX_QTY) throw new AppError(422, "VALIDATION_FAILED", 'Data tidak valid pada field "items".');
  }
  const lockOrder = [...wanted.keys()].sort();

  return db.transaction(async (tx) => {
    // 2. Batas order draft aktif per user login. Kunci baris user menyerialkan pengecekan ini, sehingga dua init
    //    bersamaan tidak sama-sama lolos di batas.
    if (userId) {
      await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
      const [{ pending }] = (await tx
        .select({ pending: count() })
        .from(orders)
        .where(and(eq(orders.userId, userId), eq(orders.status, "draft"), gt(orders.reservedUntil, sql`now()`)))) as [
        { pending: number },
      ];
      if (pending >= MAX_PENDING_ORDERS) {
        throw new AppError(
          422,
          "TOO_MANY_PENDING_ORDERS",
          "Anda masih punya beberapa pesanan yang belum diselesaikan. Selesaikan atau tunggu hingga kedaluwarsa.",
        );
      }
    }

    // 3. Kunci varian URUT id. `of: productVariants` mengunci baris varian saja (produk hanya dibaca).
    const rows = await tx
      .select({
        id: productVariants.id,
        sku: productVariants.sku,
        material: productVariants.material,
        colorHex: productVariants.colorHex,
        priceIdr: productVariants.priceIdr,
        stockAvailable: productVariants.stockAvailable,
        imageUrls: productVariants.imageUrls,
        productName: products.name,
        productStatus: products.status,
      })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(inArray(productVariants.id, lockOrder))
      .orderBy(asc(productVariants.id))
      .for("update", { of: productVariants });
    const byId = new Map(rows.map((r) => [r.id, r]));

    // 4–5. Validasi dengan nilai dari database, hitung harga dari database, ubah stok atomik di SQL.
    const lines = [];
    for (const [variantId, qty] of wanted) {
      const row = byId.get(variantId);
      if (!row || row.productStatus !== "active") {
        throw new AppError(422, "VARIANT_NOT_FOUND", "Produk tidak ditemukan atau sudah tidak dijual.");
      }
      if (row.stockAvailable < qty) {
        // nama produk dan bahan, bukan SKU: kode internal tidak perlu tampil ke pembeli
        const name = row.material ? `${row.productName} (${row.material})` : row.productName;
        throw new AppError(
          422,
          "STOCK_INSUFFICIENT",
          `Stok ${name} tidak mencukupi. Tersedia: ${row.stockAvailable}, diminta: ${qty}`,
        );
      }
      lines.push({ row, qty, unitPrice: row.priceIdr, subtotal: row.priceIdr * qty });
    }

    for (const { row, qty } of lines) {
      await tx
        .update(productVariants)
        .set({
          stockAvailable: sql`${productVariants.stockAvailable} - ${qty}`,
          stockReserved: sql`${productVariants.stockReserved} + ${qty}`,
        })
        .where(eq(productVariants.id, row.id));
    }

    const subtotalAmount = lines.reduce((sum, l) => sum + l.subtotal, 0);

    // order_token = 48 byte acak → base64url = tepat 64 karakter. Berfungsi seperti kata sandi pesanan tamu:
    // tidak boleh masuk log. reserved_until dari WAKTU DATABASE (satu sumber waktu dengan job pelepas reservasi).
    const [order] = await tx
      .insert(orders)
      .values({
        orderToken: randomToken(48),
        userId,
        status: "draft",
        subtotalAmount,
        totalAmount: subtotalAmount, // ongkir menyusul (issue 14)
        reservedUntil: sql`now() + make_interval(mins => ${RESERVATION_MINUTES})`,
      })
      .returning();

    await tx.insert(orderItems).values(
      lines.map((l) => ({
        orderId: order!.id,
        productVariantId: l.row.id,
        qty: l.qty,
        unitPrice: l.unitPrice,
        subtotal: l.subtotal,
      })),
    );

    await tx.insert(orderStatusLogs).values({
      orderId: order!.id,
      fromStatus: null,
      toStatus: "draft",
      actor: "system",
      note: "Checkout dimulai, stok direservasi",
    });

    return {
      order_token: order!.orderToken,
      reserved_until: order!.reservedUntil!.toISOString(),
      items: lines.map((l) => ({
        product_variant_id: l.row.id,
        product_name: l.row.productName,
        sku: l.row.sku,
        material: l.row.material,
        color_hex: l.row.colorHex,
        qty: l.qty,
        unit_price: l.unitPrice,
        subtotal: l.subtotal,
        image_url: l.row.imageUrls[0] ?? null,
      })),
      subtotal_amount: subtotalAmount,
      currency: "IDR",
    };
  });
}

/**
 * Mengembalikan stok yang ditahan sebuah order: per varian `stock_available + qty` dan `stock_reserved - qty`,
 * atomik di SQL, varian dikunci URUT id (alasan yang sama dengan init).
 *
 * Dipakai webhook (issue 16: expire/cancel) dan job kedaluwarsa (issue 17). Fungsi ini sengaja HANYA mengurus stok:
 *   - TIDAK mengubah status order; pemanggil yang memutuskan (expired/cancelled) dan mencatat log.
 *   - TIDAK idempoten. Yang mencegah stok dilepas dua kali adalah pemanggil: kunci order (FOR UPDATE), cek ulang
 *     statusnya masih draft/awaiting_payment, baru panggil release. Kalau tetap terpanggil dua kali, CHECK
 *     `stock_reserved >= 0` di database menolaknya (transaksi batal), jadi stok tidak bisa diam-diam rusak.
 */
export async function release(tx: Transaction, orderId: string): Promise<void> {
  const items = await tx
    .select({ variantId: orderItems.productVariantId, qty: orderItems.qty })
    .from(orderItems)
    .where(eq(orderItems.orderId, orderId));
  if (items.length === 0) return;

  // satu varian bisa muncul lebih dari sekali di order lama: jumlahkan
  const perVariant = new Map<string, number>();
  for (const { variantId, qty } of items) perVariant.set(variantId, (perVariant.get(variantId) ?? 0) + qty);
  const ids = [...perVariant.keys()].sort();

  await tx
    .select({ id: productVariants.id })
    .from(productVariants)
    .where(inArray(productVariants.id, ids))
    .orderBy(asc(productVariants.id))
    .for("update");

  for (const id of ids) {
    const qty = perVariant.get(id)!;
    await tx
      .update(productVariants)
      .set({
        stockAvailable: sql`${productVariants.stockAvailable} + ${qty}`,
        stockReserved: sql`${productVariants.stockReserved} - ${qty}`,
      })
      .where(eq(productVariants.id, id));
  }
}
