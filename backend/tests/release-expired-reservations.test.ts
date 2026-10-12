import { beforeEach, describe, expect, spyOn, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { db } from "../src/db/client";
import { orderItems, orderStatusLogs, orders, productVariants, products, refreshTokens, users } from "../src/db/schema";
import { cleanupExpiredRefreshTokens, releaseExpiredReservations } from "../src/jobs/release-expired-reservations";
import { init } from "../src/modules/checkout/stock-reservation.service";
import { useCleanDatabase } from "./db-reset";

useCleanDatabase();

// ---------- bahan uji ----------

async function makeVariant(stock = 10) {
  const [product] = await db
    .insert(products)
    .values({ name: "Produk Job", slug: `job-${crypto.randomUUID().slice(0, 10)}`, category: "chairs", weightKg: "5", status: "active" })
    .returning();
  const [variant] = await db
    .insert(productVariants)
    .values({ productId: product!.id, material: "Jati", sku: `JOB${crypto.randomUUID().slice(0, 8).toUpperCase()}`, priceIdr: 1_000_000, priceUsd: "62.5", stockAvailable: stock, imageUrls: [] })
    .returning();
  return variant!;
}

const stockOf = async (variantId: string) => {
  const [row] = await db.select({ available: productVariants.stockAvailable, reserved: productVariants.stockReserved }).from(productVariants).where(eq(productVariants.id, variantId));
  return row!;
};
const orderRow = async (token: string) => (await db.select().from(orders).where(eq(orders.orderToken, token)))[0]!;
const logsOf = async (orderId: string) => db.select().from(orderStatusLogs).where(eq(orderStatusLogs.orderId, orderId));

/** Order lewat `init` sungguhan (stok benar-benar ditahan), lalu waktu reservasinya diatur. */
async function reservedOrder(opts: { variantId: string; qty?: number; minutes: number; status?: string }) {
  const created = await init([{ product_variant_id: opts.variantId, qty: opts.qty ?? 1 }], null);
  await db
    .update(orders)
    .set({ reservedUntil: sql`now() + make_interval(mins => ${opts.minutes})`, ...(opts.status ? { status: opts.status } : {}) })
    .where(eq(orders.orderToken, created.order_token));
  return created.order_token;
}

beforeEach(async () => {
  // job memproses SEMUA order draft kedaluwarsa, jadi tiap test mulai tanpa order lain supaya hitungannya tepat
  await db.delete(orders);
});

// ---------- releaseExpiredReservations ----------

describe("releaseExpiredReservations: yang dilepas", () => {
  test("draft kedaluwarsa → expired, reserved_until null, stok kembali (available naik, reserved turun), ada log", async () => {
    const v = await makeVariant(10);
    const token = await reservedOrder({ variantId: v.id, qty: 3, minutes: -5 });
    expect(await stockOf(v.id)).toEqual({ available: 7, reserved: 3 });

    expect(await releaseExpiredReservations()).toBe(1);

    const order = await orderRow(token);
    expect(order.status).toBe("expired");
    expect(order.reservedUntil).toBeNull();
    expect(await stockOf(v.id)).toEqual({ available: 10, reserved: 0 });

    const log = (await logsOf(order.id)).find((l) => l.toStatus === "expired")!;
    expect(log).toMatchObject({ fromStatus: "draft", toStatus: "expired", actor: "system", note: "Reservasi kedaluwarsa, stok dikembalikan" });
  });

  test("mengembalikan jumlah order yang dilepas; stok beberapa order untuk varian yang sama dijumlahkan benar", async () => {
    const v = await makeVariant(10);
    await reservedOrder({ variantId: v.id, qty: 2, minutes: -1 });
    await reservedOrder({ variantId: v.id, qty: 4, minutes: -10 });
    expect(await stockOf(v.id)).toEqual({ available: 4, reserved: 6 });

    expect(await releaseExpiredReservations()).toBe(2);
    expect(await stockOf(v.id)).toEqual({ available: 10, reserved: 0 });
  });
});

describe("releaseExpiredReservations: yang tidak boleh disentuh", () => {
  test("draft yang belum kedaluwarsa tidak tersentuh", async () => {
    const v = await makeVariant(10);
    const token = await reservedOrder({ variantId: v.id, qty: 2, minutes: 10 });
    expect(await releaseExpiredReservations()).toBe(0);

    const order = await orderRow(token);
    expect(order.status).toBe("draft");
    expect(order.reservedUntil).not.toBeNull();
    expect(await stockOf(v.id)).toEqual({ available: 8, reserved: 2 });
  });

  test("awaiting_payment dan paid tidak tersentuh walaupun reserved_until sudah lewat", async () => {
    const v = await makeVariant(10);
    const waiting = await reservedOrder({ variantId: v.id, qty: 1, minutes: -30, status: "awaiting_payment" });
    const paid = await reservedOrder({ variantId: v.id, qty: 1, minutes: -30, status: "paid" });
    expect(await releaseExpiredReservations()).toBe(0);

    expect((await orderRow(waiting)).status).toBe("awaiting_payment");
    expect((await orderRow(paid)).status).toBe("paid");
    expect(await stockOf(v.id)).toEqual({ available: 8, reserved: 2 });
  });

  test("expired, cancelled, dan refunded juga tidak diproses ulang", async () => {
    const v = await makeVariant(10);
    for (const status of ["expired", "cancelled", "refunded"]) await reservedOrder({ variantId: v.id, minutes: -30, status });
    expect(await releaseExpiredReservations()).toBe(0);
    expect(await stockOf(v.id)).toEqual({ available: 7, reserved: 3 });
  });
});

describe("releaseExpiredReservations: tepat sekali", () => {
  test("dijalankan dua kali berturut-turut → stok tidak dikembalikan dua kali", async () => {
    const v = await makeVariant(10);
    await reservedOrder({ variantId: v.id, qty: 2, minutes: -1 });

    expect(await releaseExpiredReservations()).toBe(1);
    expect(await releaseExpiredReservations()).toBe(0);
    expect(await stockOf(v.id)).toEqual({ available: 10, reserved: 0 });
  });

  test("dua job berjalan bersamaan → tiap order dilepas sekali, stok benar, satu log per order", async () => {
    const v = await makeVariant(20);
    const tokens = [];
    for (let i = 0; i < 6; i++) tokens.push(await reservedOrder({ variantId: v.id, qty: 2, minutes: -1 }));

    const [a, b] = await Promise.all([releaseExpiredReservations(), releaseExpiredReservations()]);
    expect(a + b).toBe(6);
    expect(await stockOf(v.id)).toEqual({ available: 20, reserved: 0 });
    for (const token of tokens) {
      const order = await orderRow(token);
      expect(order.status).toBe("expired");
      expect((await logsOf(order.id)).filter((l) => l.toStatus === "expired")).toHaveLength(1);
    }
  });

  test("user confirm tepat sebelum job mendapat kunci → order tidak dilepas (cek ulang setelah lock)", async () => {
    const v = await makeVariant(10);
    const token = await reservedOrder({ variantId: v.id, qty: 2, minutes: -1 });
    const [{ id }] = (await db.select({ id: orders.id }).from(orders).where(eq(orders.orderToken, token))) as [{ id: string }];

    let job!: Promise<number>;
    await db.transaction(async (tx) => {
      await tx.select().from(orders).where(eq(orders.id, id)).for("update"); // "user" memegang kunci
      job = releaseExpiredReservations(); // job melihat order kedaluwarsa, lalu menunggu kunci
      await Bun.sleep(300);
      // confirm selesai: status berubah dan jendela bayar diperpanjang
      await tx.update(orders).set({ status: "awaiting_payment", reservedUntil: sql`now() + interval '30 minutes'` }).where(eq(orders.id, id));
    });

    expect(await job).toBe(0);
    expect((await orderRow(token)).status).toBe("awaiting_payment");
    expect(await stockOf(v.id)).toEqual({ available: 8, reserved: 2 });
  });
});

describe("releaseExpiredReservations: batas dan ketahanan", () => {
  test("maksimal 100 order per putaran; sisanya diproses putaran berikutnya", async () => {
    const v = await makeVariant(0);
    await db.update(productVariants).set({ stockReserved: 101 }).where(eq(productVariants.id, v.id));
    // 101 order draft kedaluwarsa, tiap order 1 item (dibuat langsung supaya cepat)
    const rows = await db
      .insert(orders)
      .values(Array.from({ length: 101 }, () => ({ orderToken: crypto.randomUUID().replaceAll("-", "") + crypto.randomUUID().replaceAll("-", "").slice(0, 11), status: "draft", subtotalAmount: 1_000_000, totalAmount: 1_000_000, reservedUntil: sql`now() - interval '1 minute'` })))
      .returning({ id: orders.id });
    await db.insert(orderItems).values(rows.map((r) => ({ orderId: r.id, productVariantId: v.id, qty: 1, unitPrice: 1_000_000, subtotal: 1_000_000 })));

    expect(await releaseExpiredReservations()).toBe(100);
    expect(await releaseExpiredReservations()).toBe(1);
    expect(await releaseExpiredReservations()).toBe(0);
    expect(await stockOf(v.id)).toEqual({ available: 101, reserved: 0 });
  });

  test("satu order gagal diproses → dicatat dengan console.error, order lain tetap dilepas", async () => {
    const good = await makeVariant(10);
    const bad = await makeVariant(10);
    const goodToken = await reservedOrder({ variantId: good.id, qty: 1, minutes: -1 });
    const badToken = await reservedOrder({ variantId: bad.id, qty: 1, minutes: -2 });
    // data rusak: stok ditahan tidak cukup untuk dikembalikan → CHECK stock_reserved >= 0 menolak
    await db.update(productVariants).set({ stockReserved: 0 }).where(eq(productVariants.id, bad.id));

    const errors = spyOn(console, "error").mockImplementation(() => {});
    try {
      expect(await releaseExpiredReservations()).toBe(1);
      expect(errors).toHaveBeenCalled();
      expect(String(errors.mock.calls[0]![0])).toContain("release-expired-reservations");
    } finally {
      errors.mockRestore();
    }

    expect((await orderRow(goodToken)).status).toBe("expired");
    expect((await orderRow(badToken)).status).toBe("draft"); // transaksinya dibatalkan utuh
    expect(await stockOf(good.id)).toEqual({ available: 10, reserved: 0 });
  });

  test("tanpa order kedaluwarsa → 0 dan tidak ada efek", async () => {
    expect(await releaseExpiredReservations()).toBe(0);
  });
});

// ---------- cleanupExpiredRefreshTokens ----------

describe("cleanupExpiredRefreshTokens", () => {
  test("hanya menghapus token yang kedaluwarsa lebih dari 7 hari", async () => {
    const [user] = await db.insert(users).values({ email: `job-${crypto.randomUUID().slice(0, 8)}@contoh.com`, name: "Job" }).returning();
    const token = (offset: string) => ({
      userId: user!.id,
      tokenHash: crypto.randomUUID().replaceAll("-", "").repeat(2),
      familyId: crypto.randomUUID(),
      expiresAt: sql`now() + ${offset}::interval`,
    });
    await db.insert(refreshTokens).values([
      token("-8 days"), // dihapus
      token("-30 days"), // dihapus
      token("-6 days"), // masih disimpan (baru kedaluwarsa)
      token("+10 days"), // masih aktif
    ]);

    expect(await cleanupExpiredRefreshTokens()).toBe(2);
    expect(await db.select().from(refreshTokens)).toHaveLength(2);
    expect(await cleanupExpiredRefreshTokens()).toBe(0);
  });
});
