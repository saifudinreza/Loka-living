import { and, asc, count, desc, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { productVariants, products, users, wishlistItems } from "../../db/schema";
import { AppError } from "../../lib/errors";

// Batas per user. Dihitung dari baris di database (termasuk produk yang sekarang non-aktif dan disembunyikan dari GET):
// batas ini melindungi tabel, bukan tampilan.
export const MAX_WISHLIST_ITEMS = 100;

/**
 * Wishlist milik satu user, terbaru dulu, dalam SATU query relasional (wishlist → produk → varian).
 *
 * - Yang disimpan adalah PRODUK, bukan varian (user biasanya belum memilih bahan/warna).
 * - Produk non-aktif disembunyikan, tapi barisnya tetap di database: aktif lagi → muncul lagi.
 * - price_from_idr = harga varian termurah; image_url = foto pertama varian pertama (urut created_at, id agar
 *   stabil); in_stock = ada varian dengan stok > 0. Produk tanpa varian: harga null, tidak ada stok.
 */
export async function getWishlist(userId: string) {
  const rows = await db.query.wishlistItems.findMany({
    where: eq(wishlistItems.userId, userId),
    // productId sebagai pemutus seri agar urutan stabil
    orderBy: [desc(wishlistItems.createdAt), asc(wishlistItems.productId)],
    with: {
      product: {
        with: { variants: { orderBy: [asc(productVariants.createdAt), asc(productVariants.id)] } },
      },
    },
  });

  return rows
    .filter((row) => row.product.status === "active")
    .map((row) => {
      const { product } = row;
      return {
        product: {
          id: product.id,
          slug: product.slug,
          name: product.name,
          price_from_idr: product.variants.length ? Math.min(...product.variants.map((v) => v.priceIdr)) : null,
          image_url: product.variants[0]?.imageUrls[0] ?? null,
          in_stock: product.variants.some((v) => v.stockAvailable > 0),
        },
        added_at: row.createdAt.toISOString(),
      };
    });
}

/**
 * Menyimpan produk ke wishlist. Idempoten: sudah ada → tetap sukses (created: false).
 *
 * Batas 100 dicek di dalam transaksi dengan kunci baris user (FOR UPDATE), sehingga dua POST bersamaan dari user yang
 * sama tidak bisa sama-sama lolos saat tersisa satu slot. Mengulang POST produk yang sudah ada tidak terkena batas.
 */
export async function addToWishlist(userId: string, productId: string): Promise<{ created: boolean }> {
  const [product] = await db
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.id, productId), eq(products.status, "active")))
    .limit(1);
  if (!product) throw new AppError(422, "PRODUCT_NOT_FOUND", "Produk tidak ditemukan.");

  return db.transaction(async (tx) => {
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");

    const [existing] = await tx
      .select({ productId: wishlistItems.productId })
      .from(wishlistItems)
      .where(and(eq(wishlistItems.userId, userId), eq(wishlistItems.productId, productId)))
      .limit(1);
    if (existing) return { created: false };

    const [{ lines }] = (await tx
      .select({ lines: count() })
      .from(wishlistItems)
      .where(eq(wishlistItems.userId, userId))) as [{ lines: number }];
    if (lines >= MAX_WISHLIST_ITEMS) {
      throw new AppError(422, "WISHLIST_FULL", `Wishlist maksimal ${MAX_WISHLIST_ITEMS} produk.`);
    }

    await tx.insert(wishlistItems).values({ userId, productId }).onConflictDoNothing();
    return { created: true };
  });
}

/** Idempoten: menghapus produk yang memang tidak ada di wishlist tetap sukses. */
export async function removeFromWishlist(userId: string, productId: string): Promise<void> {
  await db.delete(wishlistItems).where(and(eq(wishlistItems.userId, userId), eq(wishlistItems.productId, productId)));
}
