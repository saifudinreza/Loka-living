import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { count, eq, inArray, like, notInArray, sql } from "drizzle-orm";
import { Elysia } from "elysia";
import { createApp } from "../src/app";
import { db } from "../src/db/client";
import { orderItems, orderStatusLogs, orders, productVariants, products, users } from "../src/db/schema";
import { randomToken } from "../src/lib/crypto";
import { jwtPlugin, signAccessToken } from "../src/modules/auth/tokens";
import { MAX_PENDING_ORDERS, init, release } from "../src/modules/checkout/stock-reservation.service";

const PREFIX = "ckt-";
const EMAIL_PREFIX = "ckt-";

type Json = Record<string, any>;
type TestUser = { id: string; token: string };

// ---------- bahan uji ----------
// Setiap test membuat varian BUATAN SENDIRI dengan stok yang ditentukan sendiri; stok seed tidak pernah disentuh
// (dibuktikan oleh test terakhir).

async function makeVariant(opts: { stock: number; price?: number; material?: string | null; status?: string; name?: string; images?: string[] }) {
  const slug = `${PREFIX}${crypto.randomUUID().slice(0, 10)}`;
  const [product] = await db
    .insert(products)
    .values({ name: opts.name ?? "Produk Uji", slug, category: "chairs", weightKg: "5", status: opts.status ?? "active" })
    .returning();
  const [variant] = await db
    .insert(productVariants)
    .values({
      productId: product!.id,
      material: opts.material === undefined ? "Jati" : opts.material,
      sku: `${PREFIX.toUpperCase()}${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      priceIdr: opts.price ?? 1_000_000,
      priceUsd: "62.5",
      stockAvailable: opts.stock,
      imageUrls: opts.images ?? [],
    })
    .returning();
  return variant!;
}

const stockOf = async (variantId: string) => {
  const [row] = await db
    .select({ available: productVariants.stockAvailable, reserved: productVariants.stockReserved })
    .from(productVariants)
    .where(eq(productVariants.id, variantId));
  return row!;
};

const orderCount = async () => (await db.select({ n: count() }).from(orders))[0]!.n;

const signer = new Elysia().use(jwtPlugin).get("/sign/:id", ({ jwt, params }) => signAccessToken(jwt, { id: params.id }));
async function makeUser(label: string): Promise<TestUser> {
  const [user] = await db
    .insert(users)
    .values({ email: `${EMAIL_PREFIX}${label}-${crypto.randomUUID().slice(0, 8)}@contoh.com`, name: label })
    .returning();
  const token = await (await signer.handle(new Request(`http://localhost/sign/${user!.id}`))).text();
  return { id: user!.id, token };
}

/** Order draft langsung lewat database (tanpa menyentuh stok), untuk menguji batas draft. */
async function seedOrder(userId: string, over: { status?: string; reservedMinutes?: number } = {}) {
  await db.insert(orders).values({
    orderToken: randomToken(48),
    userId,
    status: over.status ?? "draft",
    subtotalAmount: 0,
    totalAmount: 0,
    reservedUntil: sql`now() + make_interval(mins => ${over.reservedMinutes ?? 10})`,
  });
}

// HTTP: setiap pemakaian membuat aplikasi baru karena rate limit (10/menit per IP) berlaku per aplikasi.
function http() {
  const app = createApp({ enableJobs: false });
  return async (items: unknown, token?: string, extra: Json = {}) => {
    const res = await app.handle(
      new Request("http://localhost/api/checkout/init", {
        method: "POST",
        headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ items, ...extra }),
      }),
    );
    return { res, body: (await res.json().catch(() => null)) as Json | null };
  };
}

const codeOf = (reason: unknown) => (reason as { code?: string }).code;
const settle = async (calls: Promise<unknown>[]) => {
  const results = await Promise.allSettled(calls);
  return {
    ok: results.filter((r) => r.status === "fulfilled").length,
    failures: results.filter((r): r is PromiseRejectedResult => r.status === "rejected").map((r) => codeOf(r.reason)),
  };
};

let seedSnapshot: { id: string; available: number; reserved: number }[] = [];

beforeAll(async () => {
  seedSnapshot = (
    await db
      .select({ id: productVariants.id, available: productVariants.stockAvailable, reserved: productVariants.stockReserved })
      .from(productVariants)
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(sql`${products.slug} NOT LIKE ${PREFIX + "%"}`)
  ).sort((a, b) => a.id.localeCompare(b.id));
});

afterAll(async () => {
  const testVariants = await db
    .select({ id: productVariants.id })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(like(products.slug, `${PREFIX}%`));
  const ids = testVariants.map((v) => v.id);
  if (ids.length) {
    const orderIds = await db.selectDistinct({ id: orderItems.orderId }).from(orderItems).where(inArray(orderItems.productVariantId, ids));
    if (orderIds.length) await db.delete(orders).where(inArray(orders.id, orderIds.map((o) => o.id))); // items & log ikut terhapus
  }
  const testUsers = await db.select({ id: users.id }).from(users).where(like(users.email, `${EMAIL_PREFIX}%`));
  if (testUsers.length) await db.delete(orders).where(inArray(orders.userId, testUsers.map((u) => u.id))); // order draft hasil seedOrder
  await db.delete(products).where(like(products.slug, `${PREFIX}%`));
  await db.delete(users).where(like(users.email, `${EMAIL_PREFIX}%`));
});

// ---------- tes ----------

describe("init: alur dasar", () => {
  test("1 item → stok ditahan, order draft dan itemnya tercatat, ada 1 log status", async () => {
    const v = await makeVariant({ stock: 5, price: 2_450_000, material: "Rotan & Linen", name: "Kursi Uji", images: ["/images/a.jpg", "/images/b.jpg"] });
    const result = await init([{ product_variant_id: v.id, qty: 2 }], null);

    expect(await stockOf(v.id)).toEqual({ available: 3, reserved: 2 });
    expect(result).toMatchObject({
      subtotal_amount: 4_900_000,
      currency: "IDR",
      items: [
        {
          product_variant_id: v.id,
          product_name: "Kursi Uji",
          sku: v.sku,
          material: "Rotan & Linen",
          color_hex: null,
          qty: 2,
          unit_price: 2_450_000,
          subtotal: 4_900_000,
          image_url: "/images/a.jpg", // elemen pertama
        },
      ],
    });

    const [order] = await db.select().from(orders).where(eq(orders.orderToken, result.order_token));
    expect(order).toMatchObject({ status: "draft", subtotalAmount: 4_900_000, totalAmount: 4_900_000, shippingAmount: 0, userId: null });
    const items = await db.select().from(orderItems).where(eq(orderItems.orderId, order!.id));
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({ productVariantId: v.id, qty: 2, unitPrice: 2_450_000, subtotal: 4_900_000 });
    const logs = await db.select().from(orderStatusLogs).where(eq(orderStatusLogs.orderId, order!.id));
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ fromStatus: null, toStatus: "draft", actor: "system", note: "Checkout dimulai, stok direservasi" });
  });

  test("image_url null bila varian tanpa foto; urutan item di respons mengikuti urutan permintaan", async () => {
    const a = await makeVariant({ stock: 5 });
    const b = await makeVariant({ stock: 5 });
    // sengaja urutan id terbalik dari urutan permintaan: respons harus mengikuti PERMINTAAN, kunci mengikuti ID
    const [first, second] = [a.id, b.id].sort().reverse();
    const result = await init([{ product_variant_id: first!, qty: 1 }, { product_variant_id: second!, qty: 1 }], null);
    expect(result.items.map((i) => i.product_variant_id)).toEqual([first!, second!]);
    expect(result.items.every((i) => i.image_url === null)).toBe(true);
  });

  test("order_token: 64 karakter base64url, acak dan unik; reserved_until tepat 30 menit dari created_at (waktu database)", async () => {
    const v = await makeVariant({ stock: 50 });
    const tokens = new Set<string>();
    let last!: Awaited<ReturnType<typeof init>>;
    for (let i = 0; i < 20; i++) {
      last = await init([{ product_variant_id: v.id, qty: 1 }], null);
      tokens.add(last.order_token);
      expect(last.order_token).toMatch(/^[A-Za-z0-9_-]{64}$/);
    }
    expect(tokens.size).toBe(20);

    const [order] = await db.select().from(orders).where(eq(orders.orderToken, last.order_token));
    expect(order!.reservedUntil!.getTime() - order!.createdAt.getTime()).toBe(30 * 60 * 1000);
    expect(last.reserved_until).toBe(order!.reservedUntil!.toISOString());
  });

  test("randomToken: default 32 byte (43 karakter), 48 byte menghasilkan tepat 64 karakter", () => {
    expect(randomToken()).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken(48)).toMatch(/^[A-Za-z0-9_-]{64}$/);
    expect(randomToken(48)).not.toBe(randomToken(48));
  });
});

describe("init: validasi dan atomik", () => {
  test("varian yang sama dua kali digabung: stok 1 dengan [X×1, X×1] → ditolak, stok tidak berubah, tanpa order", async () => {
    const v = await makeVariant({ stock: 1 });
    const before = await orderCount();
    const error = await init([{ product_variant_id: v.id, qty: 1 }, { product_variant_id: v.id, qty: 1 }], null).catch((e) => e);
    expect(error).toMatchObject({ status: 422, code: "STOCK_INSUFFICIENT" });
    expect(await stockOf(v.id)).toEqual({ available: 1, reserved: 0 });
    expect(await orderCount()).toBe(before);
  });

  test("varian yang sama dua kali dengan stok cukup → satu order_item dengan qty gabungan", async () => {
    const v = await makeVariant({ stock: 3 });
    const result = await init([{ product_variant_id: v.id, qty: 1 }, { product_variant_id: v.id, qty: 2 }], null);
    expect(result.items).toHaveLength(1);
    expect(result.items[0]).toMatchObject({ qty: 3, subtotal: 3_000_000 });
    expect(await stockOf(v.id)).toEqual({ available: 0, reserved: 3 });
  });

  test("qty gabungan satu varian di atas 99 → 422 VALIDATION_FAILED, tanpa efek", async () => {
    const v = await makeVariant({ stock: 500 });
    const error = await init([{ product_variant_id: v.id, qty: 99 }, { product_variant_id: v.id, qty: 99 }], null).catch((e) => e);
    expect(error).toMatchObject({ status: 422, code: "VALIDATION_FAILED" });
    expect(await stockOf(v.id)).toEqual({ available: 500, reserved: 0 });
  });

  test("varian tidak ada atau produk non-aktif → 422 VARIANT_NOT_FOUND dan tidak ada order", async () => {
    const before = await orderCount();
    const unknown = await init([{ product_variant_id: crypto.randomUUID(), qty: 1 }], null).catch((e) => e);
    expect(unknown).toMatchObject({ status: 422, code: "VARIANT_NOT_FOUND" });

    const inactive = await makeVariant({ stock: 5, status: "inactive" });
    const error = await init([{ product_variant_id: inactive.id, qty: 1 }], null).catch((e) => e);
    expect(error).toMatchObject({ status: 422, code: "VARIANT_NOT_FOUND" });
    expect(await stockOf(inactive.id)).toEqual({ available: 5, reserved: 0 });
    expect(await orderCount()).toBe(before);
  });

  test("satu varian kurang → seluruh permintaan ditolak: stok varian yang cukup TIDAK berubah, tanpa order (kedua urutan)", async () => {
    const enough = await makeVariant({ stock: 10 });
    const short = await makeVariant({ stock: 1 });
    const before = await orderCount();

    // qty ditetapkan per VARIAN (bukan per posisi), dan diuji dalam kedua urutan permintaan
    const wantEnough = { product_variant_id: enough.id, qty: 1 };
    const wantShort = { product_variant_id: short.id, qty: 5 };
    for (const items of [[wantEnough, wantShort], [wantShort, wantEnough]]) {
      const error = await init(items, null).catch((e) => e);
      expect(error).toMatchObject({ status: 422, code: "STOCK_INSUFFICIENT" });
      expect(await stockOf(enough.id)).toEqual({ available: 10, reserved: 0 });
      expect(await stockOf(short.id)).toEqual({ available: 1, reserved: 0 });
      expect(await orderCount()).toBe(before);
    }
  });

  test("pesan STOCK_INSUFFICIENT memuat nama produk dan bahan, bukan SKU", async () => {
    const v = await makeVariant({ stock: 1, name: "Kursi Santai Uji", material: "Rotan & Linen" });
    const error = await init([{ product_variant_id: v.id, qty: 2 }], null).catch((e) => e);
    expect(error.code).toBe("STOCK_INSUFFICIENT");
    expect(error.message).toBe("Stok Kursi Santai Uji (Rotan & Linen) tidak mencukupi. Tersedia: 1, diminta: 2");
    expect(error.message).not.toContain(v.sku!);

    const bare = await makeVariant({ stock: 0, name: "Meja Uji", material: null });
    const e2 = await init([{ product_variant_id: bare.id, qty: 1 }], null).catch((e) => e);
    expect(e2.message).toBe("Stok Meja Uji tidak mencukupi. Tersedia: 0, diminta: 1");
  });
});

describe("init: oversell (balapan)", () => {
  // Semua transaksi dimulai bersamaan (tanpa selisih waktu HTTP), jadi tanpa FOR UPDATE oversell PASTI terpicu.
  test("stok 1, 5 init serentak (service) → tepat 1 sukses, 4 STOCK_INSUFFICIENT, stok akhir 0 / reserved 1", async () => {
    // diulang 12 putaran: balapan bergantung pada waktu, jadi satu putaran saja bisa kebetulan lolos tanpa kunci
    for (let round = 1; round <= 12; round++) {
      const v = await makeVariant({ stock: 1 });
      const { ok, failures } = await settle(Array.from({ length: 5 }, () => init([{ product_variant_id: v.id, qty: 1 }], null)));

      expect(ok, `putaran ${round}`).toBe(1);
      expect(failures, `putaran ${round}`).toEqual(Array(4).fill("STOCK_INSUFFICIENT"));
      expect(await stockOf(v.id), `putaran ${round}`).toEqual({ available: 0, reserved: 1 });
      const orderIds = await db.selectDistinct({ id: orderItems.orderId }).from(orderItems).where(eq(orderItems.productVariantId, v.id));
      expect(orderIds, `putaran ${round}`).toHaveLength(1);
    }
  });

  test("stok 7, 20 init serentak berjumlah qty berbeda → total yang ditahan tidak pernah melebihi stok", async () => {
    const v = await makeVariant({ stock: 7 });
    const wanted = [3, 1, 2, 2, 1, 3, 1, 2, 1, 1, 2, 3, 1, 1, 2, 1, 2, 3, 1, 2];
    const results = await Promise.allSettled(wanted.map((qty) => init([{ product_variant_id: v.id, qty }], null)));

    const reservedTotal = results.reduce((sum, r, i) => sum + (r.status === "fulfilled" ? wanted[i]! : 0), 0);
    const stock = await stockOf(v.id);
    expect(stock.available).toBeGreaterThanOrEqual(0);
    expect(reservedTotal).toBeLessThanOrEqual(7);
    expect(stock).toEqual({ available: 7 - reservedTotal, reserved: reservedTotal });
    for (const r of results) if (r.status === "rejected") expect(codeOf(r.reason)).toBe("STOCK_INSUFFICIENT");
  });

  test("lewat HTTP: stok 1, 5 permintaan serentak → tepat 1 yang 200", async () => {
    const v = await makeVariant({ stock: 1 });
    const post = http();
    const results = await Promise.all(Array.from({ length: 5 }, () => post([{ product_variant_id: v.id, qty: 1 }])));
    expect(results.filter((r) => r.res.status === 200)).toHaveLength(1);
    expect(results.filter((r) => r.res.status === 422 && r.body!.code === "STOCK_INSUFFICIENT")).toHaveLength(4);
    expect(await stockOf(v.id)).toEqual({ available: 0, reserved: 1 });
  });

  test("tanpa deadlock: permintaan dengan urutan varian terbalik ([X,Y] dan [Y,X]) serentak, diulang", async () => {
    const x = await makeVariant({ stock: 1000 });
    const y = await makeVariant({ stock: 1000 });
    const xy = [{ product_variant_id: x.id, qty: 1 }, { product_variant_id: y.id, qty: 1 }];
    const yx = [...xy].reverse();

    for (let round = 0; round < 3; round++) {
      const { ok, failures } = await settle(Array.from({ length: 24 }, (_, i) => init(i % 2 ? yx : xy, null)));
      expect(failures, `putaran ${round}`).toEqual([]);
      expect(ok).toBe(24);
    }
    expect(await stockOf(x.id)).toEqual({ available: 1000 - 72, reserved: 72 });
    expect(await stockOf(y.id)).toEqual({ available: 1000 - 72, reserved: 72 });
  });
});

describe("init: harga dan akun", () => {
  test("harga SELALU dari database: field price/unit_price/subtotal di body diabaikan", async () => {
    const v = await makeVariant({ stock: 5, price: 2_450_000 });
    const post = http();
    const { res, body } = await post([{ product_variant_id: v.id, qty: 2, price: 1, unit_price: 1, subtotal: 1 }], undefined, {
      price: 1,
      subtotal_amount: 1,
      total_amount: 1,
    });
    expect(res.status).toBe(200);
    expect(body!.items[0]).toMatchObject({ unit_price: 2_450_000, subtotal: 4_900_000 });
    expect(body!.subtotal_amount).toBe(4_900_000);
    const [order] = await db.select().from(orders).where(eq(orders.orderToken, body!.order_token));
    expect(order).toMatchObject({ subtotalAmount: 4_900_000, totalAmount: 4_900_000 });
  });

  test("tanpa token → user_id null; dengan Bearer valid → user_id terisi; token tidak valid → 401 dan tanpa efek", async () => {
    const v = await makeVariant({ stock: 10 });
    const user = await makeUser("akun");
    const post = http();

    const guest = await post([{ product_variant_id: v.id, qty: 1 }]);
    expect(guest.res.status).toBe(200);
    const [guestOrder] = await db.select().from(orders).where(eq(orders.orderToken, guest.body!.order_token));
    expect(guestOrder!.userId).toBeNull();

    const member = await post([{ product_variant_id: v.id, qty: 1 }], user.token);
    expect(member.res.status).toBe(200);
    const [memberOrder] = await db.select().from(orders).where(eq(orders.orderToken, member.body!.order_token));
    expect(memberOrder!.userId).toBe(user.id);

    const bad = await post([{ product_variant_id: v.id, qty: 1 }], "bukan.jwt.valid");
    expect(bad.res.status).toBe(401);
    expect(bad.body!.code).toBe("UNAUTHORIZED");
    expect(await stockOf(v.id)).toEqual({ available: 8, reserved: 2 }); // hanya 2 yang berhasil
  });

  test("respons tidak boleh di-cache (memuat order_token)", async () => {
    const v = await makeVariant({ stock: 5 });
    const { res } = await http()([{ product_variant_id: v.id, qty: 1 }]);
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  test("validasi body → 422 VALIDATION_FAILED: items kosong/>20, qty 0/100/pecahan/teks, uuid salah, items hilang", async () => {
    const v = await makeVariant({ stock: 5 });
    const ok = { product_variant_id: v.id, qty: 1 };
    const post = http();
    const cases: [string, unknown][] = [
      ["items kosong", []],
      ["items 21", Array.from({ length: 21 }, () => ok)],
      ["qty 0", [{ ...ok, qty: 0 }]],
      ["qty 100", [{ ...ok, qty: 100 }]],
      ["qty pecahan", [{ ...ok, qty: 1.5 }]],
      ["qty teks", [{ ...ok, qty: "dua" }]],
      ["uuid salah", [{ ...ok, product_variant_id: "bukan-uuid" }]],
    ];
    for (const [name, items] of cases) {
      const { res, body } = await post(items);
      expect(res.status, name).toBe(422);
      expect(body!.code, name).toBe("VALIDATION_FAILED");
    }
    expect(await stockOf(v.id)).toEqual({ available: 5, reserved: 0 });
  });
});

describe("init: pengaman penimbunan stok", () => {
  test(`user login dengan ${MAX_PENDING_ORDERS} draft aktif → init berikutnya TOO_MANY_PENDING_ORDERS, stok tidak berubah`, async () => {
    const v = await makeVariant({ stock: 20 });
    const user = await makeUser("penuh");
    for (let i = 0; i < MAX_PENDING_ORDERS; i++) await seedOrder(user.id);

    const error = await init([{ product_variant_id: v.id, qty: 1 }], user.id).catch((e) => e);
    expect(error).toMatchObject({ status: 422, code: "TOO_MANY_PENDING_ORDERS" });
    expect(await stockOf(v.id)).toEqual({ available: 20, reserved: 0 });

    // tamu tidak terkena batas per user (hanya rate limit per IP)
    expect((await init([{ product_variant_id: v.id, qty: 1 }], null)).items).toHaveLength(1);
  });

  test("hanya draft AKTIF yang dihitung: draft kedaluwarsa, paid, awaiting_payment, dan milik user lain tidak", async () => {
    const v = await makeVariant({ stock: 20 });
    const user = await makeUser("hitung");
    const other = await makeUser("lain");
    for (let i = 0; i < MAX_PENDING_ORDERS; i++) await seedOrder(user.id, { reservedMinutes: -5 }); // sudah kedaluwarsa
    for (const status of ["paid", "awaiting_payment", "cancelled", "expired"]) await seedOrder(user.id, { status });
    for (let i = 0; i < 10; i++) await seedOrder(other.id);

    expect((await init([{ product_variant_id: v.id, qty: 1 }], user.id)).items).toHaveLength(1);
  });

  test("init serentak saat tersisa 1 slot → tepat satu yang lolos (kunci per user)", async () => {
    const v = await makeVariant({ stock: 50 });
    const user = await makeUser("slot");
    for (let i = 0; i < MAX_PENDING_ORDERS - 1; i++) await seedOrder(user.id);

    const { ok, failures } = await settle(Array.from({ length: 6 }, () => init([{ product_variant_id: v.id, qty: 1 }], user.id)));
    expect(ok).toBe(1);
    expect(failures).toEqual(Array(5).fill("TOO_MANY_PENDING_ORDERS"));
    expect(await stockOf(v.id)).toEqual({ available: 49, reserved: 1 });
  });

  test("rate limit: permintaan ke-11 dalam satu menit dari IP yang sama → 429", async () => {
    const post = http();
    const unknown = [{ product_variant_id: crypto.randomUUID(), qty: 1 }];
    for (let i = 0; i < 10; i++) expect((await post(unknown)).res.status, `permintaan ${i + 1}`).toBe(422);
    const limited = await post(unknown);
    expect(limited.res.status).toBe(429);
    expect(limited.body!.code).toBe("TOO_MANY_REQUESTS");
  });
});

describe("release(tx, orderId)", () => {
  test("mengembalikan stok tiap item (available naik, reserved turun) dan TIDAK mengubah status order", async () => {
    const a = await makeVariant({ stock: 10 });
    const b = await makeVariant({ stock: 10 });
    const result = await init([{ product_variant_id: a.id, qty: 3 }, { product_variant_id: b.id, qty: 2 }], null);
    expect(await stockOf(a.id)).toEqual({ available: 7, reserved: 3 });

    const [order] = await db.select().from(orders).where(eq(orders.orderToken, result.order_token));
    await db.transaction((tx) => release(tx, order!.id));

    expect(await stockOf(a.id)).toEqual({ available: 10, reserved: 0 });
    expect(await stockOf(b.id)).toEqual({ available: 10, reserved: 0 });
    const [after] = await db.select().from(orders).where(eq(orders.id, order!.id));
    expect(after!.status).toBe("draft"); // pemanggil yang memutuskan status
  });

  test("tidak idempoten, tapi tidak bisa diam-diam merusak stok: pelepasan kedua ditolak database dan dibatalkan", async () => {
    const v = await makeVariant({ stock: 4 });
    const result = await init([{ product_variant_id: v.id, qty: 2 }], null);
    const [order] = await db.select().from(orders).where(eq(orders.orderToken, result.order_token));

    await db.transaction((tx) => release(tx, order!.id));
    await expect(db.transaction((tx) => release(tx, order!.id))).rejects.toThrow(); // stock_reserved < 0 melanggar CHECK
    expect(await stockOf(v.id)).toEqual({ available: 4, reserved: 0 });
  });

  test("order tanpa item → tidak melakukan apa-apa", async () => {
    const user = await makeUser("kosong");
    await seedOrder(user.id);
    const [order] = await db.select().from(orders).where(eq(orders.userId, user.id));
    await expect(db.transaction((tx) => release(tx, order!.id))).resolves.toBeUndefined();
  });
});

describe("dokumentasi Swagger", () => {
  test("POST /api/checkout/init tercantum dengan tag Checkout dan login opsional", async () => {
    const res = await createApp({ enableJobs: false }).handle(new Request("http://localhost/swagger/json"));
    const spec = (await res.json()) as { paths: Json };
    const op = spec.paths["/api/checkout/init"]?.post;
    expect(op).toBeDefined();
    expect(op.tags).toEqual(["Checkout"]);
    expect(op.security).toEqual([{}, { bearerAuth: [] }]);
  });
});

describe("stok seed tidak tersentuh", () => {
  // Dijalankan terakhir: semua test di atas memakai varian buatan sendiri.
  test("stok semua varian seed sama persis seperti sebelum test dimulai", async () => {
    const now = (
      await db
        .select({ id: productVariants.id, available: productVariants.stockAvailable, reserved: productVariants.stockReserved })
        .from(productVariants)
        .innerJoin(products, eq(products.id, productVariants.productId))
        .where(sql`${products.slug} NOT LIKE ${PREFIX + "%"}`)
    ).sort((a, b) => a.id.localeCompare(b.id));

    expect(seedSnapshot.length).toBeGreaterThan(0);
    expect(now).toEqual(seedSnapshot);
  });
});
