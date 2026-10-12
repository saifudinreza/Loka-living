import { and, asc, count, desc, eq, inArray, ne, sql } from "drizzle-orm";
import { db } from "../../db/client";
import { addresses, orderItems, orderStatusLogs, orders, paymentTransactions, productVariants, products } from "../../db/schema";
import { AppError } from "../../lib/errors";
import { ORDER_TOKEN_PATTERN } from "../../lib/order-token";

// Riwayat & detail pesanan (issue 18). Bagian kritisnya adalah KONTROL AKSES:
//   - pesanan tamu (user_id null)  → siapa pun yang punya order_token; data pribadi disamarkan
//   - pesanan akun (user_id terisi) → hanya pemiliknya, dan harus login; token saja tidak cukup
// Semua penolakan = 404 ORDER_NOT_FOUND dengan pesan yang sama, supaya orang tidak bisa membedakan
// "token salah" dari "pesanan milik orang lain".

export const LISTABLE_STATUSES = ["awaiting_payment", "paid", "expired", "cancelled", "refunded"] as const;
export type ListableStatus = (typeof LISTABLE_STATUSES)[number];

const orderNotFound = () => new AppError(404, "ORDER_NOT_FOUND", "Pesanan tidak ditemukan.");

/**
 * `budi@contoh.com` → `bu***@contoh.com` (2 huruf pertama bagian lokal + ***).
 * Bagian lokal yang pendek (≤ 2 huruf) hanya menampilkan 1 huruf, supaya tidak tampil utuh.
 */
export function maskEmail(email: string | null): string | null {
  if (!email) return null;
  const at = email.lastIndexOf("@");
  if (at < 1) return "***";
  const visible = at <= 2 ? 1 : 2;
  return `${email.slice(0, visible)}***${email.slice(at)}`;
}

/** `081234567890` → `0812****890` (4 digit awal + **** + 3 digit akhir). Terlalu pendek → seluruhnya disamarkan. */
export function maskPhone(phone: string | null): string | null {
  if (!phone) return null;
  if (phone.length < 8) return "****";
  return `${phone.slice(0, 4)}****${phone.slice(-3)}`;
}

const iso = (d: Date | null) => (d ? d.toISOString() : null);

// ---------- GET /orders ----------

export interface ListQuery {
  status?: ListableStatus;
  page?: number;
  limit?: number;
}

interface FirstItem {
  product_name: string;
  material: string | null;
  image_url: string | null;
}

export async function listOrders(userId: string, query: ListQuery) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 10;
  // `draft` (checkout yang ditinggal) bukan pesanan: tidak pernah muncul di daftar, juga lewat ?status=.
  const where = and(eq(orders.userId, userId), query.status ? eq(orders.status, query.status) : ne(orders.status, "draft"));

  const [{ total }] = (await db.select({ total: count() }).from(orders).where(where)) as [{ total: number }];

  const rows = await db
    .select({
      id: orders.id,
      orderToken: orders.orderToken,
      status: orders.status,
      createdAt: orders.createdAt,
      totalAmount: orders.totalAmount,
    })
    .from(orders)
    .where(where)
    // id sebagai pembeda urutan: dua order dengan created_at sama tidak boleh berpindah antar halaman
    .orderBy(desc(orders.createdAt), desc(orders.id))
    .limit(limit)
    .offset((page - 1) * limit);

  // Barang untuk SELURUH halaman diambil dalam satu query (bukan satu per order), lalu dikelompokkan di sini.
  // Urutan subtotal terbesar dulu, lalu nama: barang pertama per order = gambaran isi pesanan.
  const lines = rows.length
    ? await db
        .select({
          orderId: orderItems.orderId,
          qty: orderItems.qty,
          productName: products.name,
          material: productVariants.material,
          imageUrls: productVariants.imageUrls,
        })
        .from(orderItems)
        .innerJoin(productVariants, eq(productVariants.id, orderItems.productVariantId))
        .innerJoin(products, eq(products.id, productVariants.productId))
        .where(inArray(orderItems.orderId, rows.map((r) => r.id)))
        .orderBy(desc(orderItems.subtotal), asc(products.name), asc(orderItems.id))
    : [];

  const itemCount = new Map<string, number>();
  const firstItem = new Map<string, FirstItem>();
  for (const l of lines) {
    itemCount.set(l.orderId, (itemCount.get(l.orderId) ?? 0) + l.qty);
    if (!firstItem.has(l.orderId)) {
      firstItem.set(l.orderId, { product_name: l.productName, material: l.material, image_url: l.imageUrls[0] ?? null });
    }
  }

  return {
    data: rows.map((r) => ({
      order_token: r.orderToken,
      status: r.status,
      created_at: r.createdAt.toISOString(),
      total_amount: r.totalAmount,
      item_count: itemCount.get(r.id) ?? 0, // jumlah barang (Σ qty)
      first_item: firstItem.get(r.id) ?? null,
    })),
    meta: { page, limit, total },
  };
}

// ---------- GET /orders/:token ----------

/** `viewerId` = id user yang login, atau null untuk tamu. */
export async function getOrder(token: string, viewerId: string | null) {
  // Bentuk yang tidak mungkin sah ditolak tanpa menyentuh database.
  if (!ORDER_TOKEN_PATTERN.test(token)) throw orderNotFound();

  const [order] = await db
    .select({
      id: orders.id,
      userId: orders.userId,
      orderToken: orders.orderToken,
      status: orders.status,
      createdAt: orders.createdAt,
      reservedUntil: orders.reservedUntil,
      // dibandingkan di database: satu sumber waktu dengan job pelepas reservasi
      reservationActive: sql<boolean>`${orders.reservedUntil} is not null and ${orders.reservedUntil} > now()`,
      subtotalAmount: orders.subtotalAmount,
      shippingAmount: orders.shippingAmount,
      installationAmount: orders.installationAmount,
      totalAmount: orders.totalAmount,
      guestEmail: orders.guestEmail,
      guestPhone: orders.guestPhone,
      deliveryDate: orders.scheduledDeliveryDate,
      recipientName: addresses.recipientName,
      addressPhone: addresses.phone,
      fullAddress: addresses.fullAddress,
      city: addresses.city,
      province: addresses.province,
      postalCode: addresses.postalCode,
    })
    .from(orders)
    .leftJoin(addresses, eq(addresses.id, orders.addressId))
    .where(eq(orders.orderToken, token))
    .limit(1);

  // Kontrol akses. Pesanan akun: hanya pemilik yang login. Pesanan tamu: siapa pun dengan token.
  if (!order || order.status === "draft") throw orderNotFound();
  if (order.userId !== null && order.userId !== viewerId) throw orderNotFound();

  // Pemilik akun melihat data lengkap. Akses hanya lewat token (pesanan tamu) = data pribadi disamarkan.
  const isOwner = order.userId !== null;
  const email = isOwner ? order.guestEmail : maskEmail(order.guestEmail);
  const phoneRaw = order.addressPhone ?? order.guestPhone;
  const phone = isOwner ? phoneRaw : maskPhone(phoneRaw);

  const [items, payments, logs] = await Promise.all([
    db
      .select({
        productSlug: products.slug,
        productName: products.name,
        material: productVariants.material,
        colorHex: productVariants.colorHex,
        qty: orderItems.qty,
        unitPrice: orderItems.unitPrice,
        subtotal: orderItems.subtotal,
        imageUrls: productVariants.imageUrls,
      })
      .from(orderItems)
      .innerJoin(productVariants, eq(productVariants.id, orderItems.productVariantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(eq(orderItems.orderId, order.id))
      .orderBy(desc(orderItems.subtotal), asc(products.name)),
    db
      .select({
        requestedMethod: paymentTransactions.requestedMethod,
        paymentMethod: paymentTransactions.gatewayPaymentMethod,
        status: paymentTransactions.status,
        amount: paymentTransactions.amount,
        redirectUrl: paymentTransactions.snapRedirectUrl,
        createdAt: paymentTransactions.createdAt,
        updatedAt: paymentTransactions.updatedAt,
      })
      .from(paymentTransactions)
      .where(eq(paymentTransactions.orderId, order.id))
      .orderBy(asc(paymentTransactions.createdAt), asc(paymentTransactions.id)),
    db
      .select({
        from: orderStatusLogs.fromStatus,
        to: orderStatusLogs.toStatus,
        actor: orderStatusLogs.actor,
        note: orderStatusLogs.note,
        at: orderStatusLogs.createdAt,
      })
      .from(orderStatusLogs)
      .where(eq(orderStatusLogs.orderId, order.id))
      .orderBy(asc(orderStatusLogs.createdAt), asc(orderStatusLogs.id)),
  ]);

  // Boleh melanjutkan bayar hanya selama menunggu pembayaran dan jendela bayar (`reserved_until`, diperpanjang saat
  // confirm sampai selaras dengan expiry Midtrans) belum lewat.
  const canContinue = order.status === "awaiting_payment" && order.reservationActive;
  const latestWithUrl = [...payments].reverse().find((p) => p.redirectUrl);

  return {
    data: {
      order_token: order.orderToken,
      status: order.status,
      created_at: order.createdAt.toISOString(),
      reserved_until: iso(order.reservedUntil),
      amounts: {
        subtotal: order.subtotalAmount,
        shipping: order.shippingAmount,
        installation: order.installationAmount,
        total: order.totalAmount,
      },
      items: items.map((i) => ({
        product_slug: i.productSlug,
        product_name: i.productName,
        material: i.material,
        color_hex: i.colorHex,
        qty: i.qty,
        unit_price: i.unitPrice,
        subtotal: i.subtotal,
        image_url: i.imageUrls[0] ?? null,
      })),
      shipping: {
        recipient_name: order.recipientName,
        phone,
        full_address: order.fullAddress,
        city: order.city,
        province: order.province,
        postal_code: order.postalCode,
        delivery_date: order.deliveryDate,
      },
      contact: { email },
      // redirect_url hanya diberikan kalau memang masih bisa dilanjutkan
      payment: { redirect_url: canContinue ? (latestWithUrl?.redirectUrl ?? null) : null, can_continue: canContinue },
      payments: payments.map((p) => ({
        method: p.paymentMethod ?? p.requestedMethod,
        status: p.status,
        amount: p.amount,
        created_at: p.createdAt.toISOString(),
        updated_at: p.updatedAt.toISOString(),
      })),
      timeline: logs.map((l) => ({ from: l.from, to: l.to, actor: l.actor, note: l.note, at: l.at.toISOString() })),
    },
  };
}
