import { and, asc, count, eq } from "drizzle-orm";
import { db } from "../../db/client";
import { cartItems, productVariants, products, users } from "../../db/schema";
import { AppError } from "../../lib/errors";

// Batas baris BERBEDA per keranjang (qty per baris sudah dibatasi 1–99 oleh database).
// Mencegah satu akun mengisi ribuan baris yang membuat GET /cart makin berat.
export const MAX_CART_LINES = 50;

/**
 * Keranjang milik satu user, dalam SATU query (join cart_items → varian → produk).
 *
 * - Harga selalu dari database saat ini; tidak disimpan di cart_items, jadi perubahan harga langsung terlihat.
 * - Barang tidak tersedia (produk non-aktif atau stok < qty) tetap tampil supaya user tahu, tapi
 *   TIDAK dihitung di subtotal_amount. Keranjang tidak menahan stok: stok baru ditahan di checkout/init.
 * - item_count = jumlah seluruh qty di keranjang (angka untuk badge), termasuk yang tidak tersedia.
 */
export async function getCart(userId: string) {
  const rows = await db
    .select({
      variantId: cartItems.productVariantId,
      qty: cartItems.qty,
      material: productVariants.material,
      colorHex: productVariants.colorHex,
      priceIdr: productVariants.priceIdr,
      stockAvailable: productVariants.stockAvailable,
      imageUrls: productVariants.imageUrls,
      productSlug: products.slug,
      productName: products.name,
      productStatus: products.status,
    })
    .from(cartItems)
    .innerJoin(productVariants, eq(productVariants.id, cartItems.productVariantId))
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(eq(cartItems.userId, userId))
    // barang yang lebih dulu ditambah di atas; variantId sebagai pemutus seri agar urutan stabil
    .orderBy(asc(cartItems.createdAt), asc(cartItems.productVariantId));

  const items = rows.map((r) => ({
    product_variant_id: r.variantId,
    qty: r.qty,
    product: { slug: r.productSlug, name: r.productName },
    material: r.material,
    color_hex: r.colorHex,
    unit_price: r.priceIdr,
    subtotal: r.priceIdr * r.qty,
    image_url: r.imageUrls[0] ?? null,
    stock_available: r.stockAvailable,
    is_available: r.productStatus === "active" && r.stockAvailable >= r.qty,
  }));

  return {
    items,
    subtotal_amount: items.filter((i) => i.is_available).reduce((sum, i) => sum + i.subtotal, 0),
    item_count: items.reduce((sum, i) => sum + i.qty, 0),
  };
}

/**
 * Set qty satu varian (bukan menambah): memanggilnya ulang dengan nilai sama hasilnya tetap sama (idempoten).
 * qty 0 menghapus baris, dan itu boleh untuk varian yang sudah tidak ada/non-aktif (supaya barang usang bisa dibuang).
 *
 * Melebihi stok sengaja DIIZINKAN (cuma ditandai is_available: false): keranjang tidak menahan stok,
 * stok bisa berubah kapan saja, dan pemeriksaan sebenarnya ada di checkout/init.
 */
export async function setCartQty(userId: string, variantId: string, qty: number) {
  if (qty === 0) {
    await db.delete(cartItems).where(and(eq(cartItems.userId, userId), eq(cartItems.productVariantId, variantId)));
    return getCart(userId);
  }

  const [variant] = await db
    .select({ id: productVariants.id })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(and(eq(productVariants.id, variantId), eq(products.status, "active")))
    .limit(1);
  if (!variant) throw new AppError(422, "VARIANT_NOT_FOUND", "Produk tidak ditemukan atau sudah tidak dijual.");

  await db.transaction(async (tx) => {
    // Kunci baris user: penulisan keranjang user yang sama diserialkan. Tanpa ini dua PUT bersamaan
    // sama-sama melihat "49 baris" lalu sama-sama menambah, dan batas 50 bisa terlewati.
    await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");

    const [existing] = await tx
      .select({ qty: cartItems.qty })
      .from(cartItems)
      .where(and(eq(cartItems.userId, userId), eq(cartItems.productVariantId, variantId)))
      .limit(1);

    // mengubah qty baris yang sudah ada selalu boleh; batas hanya berlaku untuk baris BARU
    if (!existing) {
      const [{ lines }] = (await tx
        .select({ lines: count() })
        .from(cartItems)
        .where(eq(cartItems.userId, userId))) as [{ lines: number }];
      if (lines >= MAX_CART_LINES) {
        throw new AppError(422, "CART_LIMIT_REACHED", `Keranjang maksimal ${MAX_CART_LINES} jenis barang.`);
      }
    }

    await tx
      .insert(cartItems)
      .values({ userId, productVariantId: variantId, qty })
      .onConflictDoUpdate({
        target: [cartItems.userId, cartItems.productVariantId],
        set: { qty, updatedAt: new Date() },
      });
  });

  return getCart(userId);
}

/** Idempoten: menghapus barang yang memang tidak ada di keranjang tetap sukses. */
export async function removeFromCart(userId: string, variantId: string) {
  await db.delete(cartItems).where(and(eq(cartItems.userId, userId), eq(cartItems.productVariantId, variantId)));
  return getCart(userId);
}
