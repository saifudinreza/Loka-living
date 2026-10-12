import { afterAll, describe, expect, test } from "bun:test";
import { eq, inArray, like, sql } from "drizzle-orm";
import { Elysia } from "elysia";
import { createApp } from "../src/app";
import { db } from "../src/db/client";
import { addresses, orderItems, orderStatusLogs, orders, paymentTransactions, productVariants, products, users } from "../src/db/schema";
import { randomToken } from "../src/lib/crypto";
import { jwtPlugin, signAccessToken } from "../src/modules/auth/tokens";
import { confirm, quoteShipping } from "../src/modules/checkout/checkout.service";
import { init } from "../src/modules/checkout/stock-reservation.service";
import { maskEmail, maskPhone } from "../src/modules/orders/orders.service";

const PREFIX = "ord-";
const FULL_ADDRESS = "Jl. Pesanan Uji No. 7";

type Json = Record<string, any>;

// ---------- bahan uji ----------

const signer = new Elysia().use(jwtPlugin).get("/sign/:id", ({ jwt, params }) => signAccessToken(jwt, { id: params.id }));
async function makeUser(label: string) {
  const [user] = await db
    .insert(users)
    .values({ email: `${PREFIX}${label}-${crypto.randomUUID().slice(0, 8)}@contoh.com`, name: label })
    .returning();
  const token = await (await signer.handle(new Request(`http://localhost/sign/${user!.id}`))).text();
  return { id: user!.id, email: user!.email, token };
}

async function makeVariant(opts: { name?: string; material?: string | null; price?: number; images?: string[] } = {}) {
  const [product] = await db
    .insert(products)
    .values({ name: opts.name ?? "Produk Uji", slug: `${PREFIX}${crypto.randomUUID().slice(0, 10)}`, category: "chairs", weightKg: "5", status: "active" })
    .returning();
  const [variant] = await db
    .insert(productVariants)
    .values({
      productId: product!.id,
      material: opts.material === undefined ? "Jati" : opts.material,
      colorHex: "#C99A66",
      sku: `ORD${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      priceIdr: opts.price ?? 1_000_000,
      priceUsd: "62.5",
      stockAvailable: 5,
      imageUrls: opts.images ?? [],
    })
    .returning();
  return { product: product!, variant: variant! };
}

interface SeedOpts {
  userId?: string | null;
  status?: string;
  email?: string | null;
  phone?: string | null;
  reservedMinutes?: number; // negatif = sudah lewat
  createdAt?: string; // SQL timestamp literal
  items?: { name?: string; material?: string | null; price: number; qty: number; images?: string[] }[];
  shipping?: number;
}

/** Order langsung lewat database, lengkap dengan alamat, item, pembayaran, dan log. */
async function seedOrder(o: SeedOpts = {}) {
  const items = o.items ?? [{ price: 1_000_000, qty: 1 }];
  const subtotal = items.reduce((s, i) => s + i.price * i.qty, 0);
  const shipping = o.shipping ?? 66_000;
  const [address] = await db
    .insert(addresses)
    .values({ recipientName: "Budi Santoso", phone: o.phone === undefined ? "081234567890" : o.phone, fullAddress: FULL_ADDRESS, city: "Jakarta Selatan", province: "DKI Jakarta", postalCode: "12345" })
    .returning();
  const token = randomToken(48);
  const [order] = await db
    .insert(orders)
    .values({
      orderToken: token,
      userId: o.userId ?? null,
      status: o.status ?? "awaiting_payment",
      addressId: address!.id,
      guestEmail: o.email === undefined ? "budi@contoh.com" : o.email,
      guestPhone: "081234567890",
      subtotalAmount: subtotal,
      shippingAmount: shipping,
      totalAmount: subtotal + shipping,
      paymentGateway: "midtrans",
      scheduledDeliveryDate: "2026-10-03",
      reservedUntil: sql`now() + make_interval(mins => ${o.reservedMinutes ?? 20})`,
      ...(o.createdAt ? { createdAt: sql`${o.createdAt}::timestamptz` } : {}),
    })
    .returning();
  for (const i of items) {
    const { variant } = await makeVariant({ name: i.name, material: i.material, price: i.price, images: i.images });
    await db.insert(orderItems).values({ orderId: order!.id, productVariantId: variant.id, qty: i.qty, unitPrice: i.price, subtotal: i.price * i.qty });
  }
  return { id: order!.id, token, total: subtotal + shipping };
}

async function addPayment(orderId: string, over: Partial<typeof paymentTransactions.$inferInsert> = {}) {
  await db.insert(paymentTransactions).values({
    orderId,
    gateway: "midtrans",
    status: "pending",
    amount: 1,
    requestedMethod: "qris",
    snapToken: "SNAP-TOKEN-RAHASIA",
    snapRedirectUrl: "https://app.sandbox.midtrans.com/snap/v4/redirection/abc",
    gatewayTransactionId: `TRX-${crypto.randomUUID()}`,
    rawPayload: { secret: "RAW-PAYLOAD-RAHASIA" },
    ...over,
  });
}

function http() {
  const app = createApp({ enableJobs: false });
  return async (path: string, token?: string) => {
    const res = await app.handle(new Request(`http://localhost/api${path}`, { headers: token ? { authorization: `Bearer ${token}` } : {} }));
    return { res, body: (await res.json().catch(() => null)) as Json | null };
  };
}

afterAll(async () => {
  const testVariants = await db
    .select({ id: productVariants.id })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(like(products.slug, `${PREFIX}%`));
  const ids = testVariants.map((v) => v.id);
  if (ids.length) {
    const orderIds = await db.selectDistinct({ id: orderItems.orderId }).from(orderItems).where(inArray(orderItems.productVariantId, ids));
    if (orderIds.length) await db.delete(orders).where(inArray(orders.id, orderIds.map((o) => o.id)));
  }
  await db.execute(sql`delete from addresses a where not exists (select 1 from orders o where o.address_id = a.id) and a.full_address = ${FULL_ADDRESS}`);
  await db.delete(products).where(like(products.slug, `${PREFIX}%`));
  await db.delete(users).where(like(users.email, `${PREFIX}%`));
});

// ---------- penyamaran ----------

describe("penyamaran data pribadi", () => {
  test("email: 2 huruf pertama + *** + domain", () => {
    expect(maskEmail("budi@contoh.com")).toBe("bu***@contoh.com");
    expect(maskEmail("a@contoh.com")).toBe("a***@contoh.com");
    expect(maskEmail("ab@contoh.com")).toBe("a***@contoh.com"); // bagian lokal pendek tidak tampil utuh
    expect(maskEmail("abc@contoh.com")).toBe("ab***@contoh.com");
    expect(maskEmail(null)).toBeNull();
  });
  test("telepon: 4 awal + **** + 3 akhir; terlalu pendek disamarkan seluruhnya", () => {
    expect(maskPhone("081234567890")).toBe("0812****890");
    expect(maskPhone("0812345")).toBe("****");
    expect(maskPhone(null)).toBeNull();
  });
});

// ---------- GET /api/orders ----------

describe("GET /api/orders", () => {
  test("tanpa token → 401", async () => {
    const { res, body } = await http()("/orders");
    expect(res.status).toBe(401);
    expect(body!.code).toBe("UNAUTHORIZED");
  });

  test("token tidak valid → 401", async () => {
    expect((await http()("/orders", "token-rusak")).res.status).toBe(401);
  });

  test("hanya pesanan milik user itu, tanpa draft, tanpa pesanan tamu atau user lain", async () => {
    const a = await makeUser("a");
    const b = await makeUser("b");
    const mine = await seedOrder({ userId: a.id, status: "paid" });
    await seedOrder({ userId: a.id, status: "draft" });
    await seedOrder({ userId: b.id, status: "paid" });
    await seedOrder({ userId: null, status: "paid" });

    const { res, body } = await http()("/orders", a.token);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(body!.data.map((o: Json) => o.order_token)).toEqual([mine.token]);
    expect(body!.meta).toEqual({ page: 1, limit: 10, total: 1 });
  });

  test("?status=draft ditolak (bukan status yang bisa difilter) dan tidak membocorkan draft", async () => {
    const a = await makeUser("draft");
    await seedOrder({ userId: a.id, status: "draft" });
    expect((await http()("/orders?status=draft", a.token)).res.status).toBe(422);
  });

  test("filter status + paging: urut terbaru dulu, meta.total sesuai", async () => {
    const u = await makeUser("paging");
    const tokens: string[] = [];
    for (let i = 0; i < 7; i++) {
      const o = await seedOrder({ userId: u.id, status: "paid", createdAt: `2026-09-0${i + 1} 10:00:00+00` });
      tokens.push(o.token); // i = 0 paling lama
    }
    await seedOrder({ userId: u.id, status: "expired" });
    const get = http();

    const p2 = (await get("/orders?status=paid&page=2&limit=3", u.token)).body!;
    expect(p2.meta).toEqual({ page: 2, limit: 3, total: 7 });
    // urutan turun: [6,5,4] [3,2,1] [0]
    expect(p2.data.map((o: Json) => o.order_token)).toEqual([tokens[3], tokens[2], tokens[1]]);

    const p3 = (await get("/orders?status=paid&page=3&limit=3", u.token)).body!;
    expect(p3.data.map((o: Json) => o.order_token)).toEqual([tokens[0]]);

    const expired = (await get("/orders?status=expired", u.token)).body!;
    expect(expired.meta.total).toBe(1);
    expect((await get("/orders", u.token)).body!.meta.total).toBe(8);
  });

  test("item_count = Σ qty dan first_item = barang dengan subtotal terbesar", async () => {
    const u = await makeUser("items");
    await seedOrder({
      userId: u.id,
      status: "paid",
      items: [
        { name: "Bantal", material: "Linen", price: 100_000, qty: 2 },
        { name: "Kursi Mahal", material: "Rotan & Linen", price: 2_450_000, qty: 1, images: ["/images/a.jpg", "/images/b.jpg"] },
      ],
    });
    const { body } = await http()("/orders", u.token);
    expect(body!.data[0]).toMatchObject({
      status: "paid",
      item_count: 3,
      first_item: { product_name: "Kursi Mahal", material: "Rotan & Linen", image_url: "/images/a.jpg" },
    });
    expect(typeof body!.data[0].created_at).toBe("string");
    expect(body!.data[0].total_amount).toBe(2_650_000 + 66_000);
  });

  test("limit di luar 1–50, page < 1, status asing → 422", async () => {
    const u = await makeUser("valid");
    const get = http();
    for (const q of ["limit=0", "limit=51", "page=0", "limit=2.5", "status=foo"]) {
      expect((await get(`/orders?${q}`, u.token)).res.status).toBe(422);
    }
  });
});

// ---------- GET /api/orders/:token ----------

describe("GET /api/orders/:token — kontrol akses", () => {
  test("pesanan tamu dibuka tanpa login lewat token → 200 dengan email dan telepon disamarkan", async () => {
    const o = await seedOrder({ userId: null });
    const { res, body } = await http()(`/orders/${o.token}`);
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(body!.data.contact.email).toBe("bu***@contoh.com");
    expect(body!.data.shipping.phone).toBe("0812****890");
  });

  test("pesanan tamu dibuka user yang login: tetap disamarkan (akses lewat token, bukan kepemilikan)", async () => {
    const u = await makeUser("pengunjung");
    const o = await seedOrder({ userId: null });
    const { body } = await http()(`/orders/${o.token}`, u.token);
    expect(body!.data.contact.email).toBe("bu***@contoh.com");
    expect(body!.data.shipping.phone).toBe("0812****890");
  });

  test("pesanan akun: tanpa login → 404; user lain → 404; pemilik → 200 dengan data lengkap", async () => {
    const owner = await makeUser("owner");
    const other = await makeUser("other");
    const o = await seedOrder({ userId: owner.id, email: owner.email });
    const get = http();

    expect((await get(`/orders/${o.token}`)).res.status).toBe(404);
    expect((await get(`/orders/${o.token}`, other.token)).res.status).toBe(404);

    const { res, body } = await get(`/orders/${o.token}`, owner.token);
    expect(res.status).toBe(200);
    expect(body!.data.contact.email).toBe(owner.email);
    expect(body!.data.shipping).toMatchObject({ recipient_name: "Budi Santoso", phone: "081234567890", full_address: FULL_ADDRESS, city: "Jakarta Selatan", province: "DKI Jakarta", postal_code: "12345", delivery_date: "2026-10-03" });
  });

  test("token acak 64 karakter dan token 10 karakter → 404 dengan body identik", async () => {
    const get = http();
    const a = await get(`/orders/${randomToken(48)}`);
    const b = await get("/orders/pendek1234");
    const c = await get(`/orders/${"x".repeat(150)}`);
    expect(a.res.status).toBe(404);
    expect(b.res.status).toBe(404);
    expect(c.res.status).toBe(404);
    expect(a.body).toEqual({ error: "Pesanan tidak ditemukan.", code: "ORDER_NOT_FOUND" });
    expect(b.body).toEqual(a.body!);
    expect(c.body).toEqual(a.body!);
  });

  test("penolakan pesanan milik orang lain tidak bisa dibedakan dari token salah", async () => {
    const owner = await makeUser("rahasia");
    const other = await makeUser("penyusup");
    const o = await seedOrder({ userId: owner.id });
    const get = http();
    const forbidden = await get(`/orders/${o.token}`, other.token);
    const unknown = await get(`/orders/${randomToken(48)}`, other.token);
    expect(forbidden.res.status).toBe(404);
    expect(forbidden.body).toEqual(unknown.body!);
  });

  test("draft bukan pesanan → 404, juga untuk pemiliknya", async () => {
    const u = await makeUser("draftowner");
    const guestDraft = await seedOrder({ userId: null, status: "draft" });
    const myDraft = await seedOrder({ userId: u.id, status: "draft" });
    const get = http();
    expect((await get(`/orders/${guestDraft.token}`)).res.status).toBe(404);
    expect((await get(`/orders/${myDraft.token}`, u.token)).res.status).toBe(404);
  });

  test("Bearer token tidak valid → 401, bukan dianggap tamu", async () => {
    const o = await seedOrder({ userId: null });
    expect((await http()(`/orders/${o.token}`, "token-rusak")).res.status).toBe(401);
  });
});

describe("GET /api/orders/:token — isi response", () => {
  test("tidak pernah berisi id internal, user_id, raw_payload, snap_token, gateway_transaction_id", async () => {
    const owner = await makeUser("bersih");
    const o = await seedOrder({ userId: owner.id });
    await addPayment(o.id, { amount: o.total });
    await db.insert(orderStatusLogs).values({ orderId: o.id, fromStatus: "draft", toStatus: "awaiting_payment", actor: "system" });
    const get = http();

    for (const token of [owner.token, undefined]) {
      const guest = await seedOrder({ userId: null });
      await addPayment(guest.id, { amount: guest.total });
      const { body } = await get(`/orders/${token ? o.token : guest.token}`, token);
      const text = JSON.stringify(body);
      for (const forbidden of ["raw_payload", "RAW-PAYLOAD-RAHASIA", "snap_token", "SNAP-TOKEN-RAHASIA", "gateway_transaction_id", "TRX-", "user_id", "address_id", "order_id"]) {
        expect(text).not.toContain(forbidden);
      }
      // tidak ada key `id` di mana pun, dan tidak ada UUID (id internal) di nilai mana pun
      expect(text).not.toMatch(/"id"\s*:/);
      expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/);
    }
  });

  test("rincian jumlah, item, pembayaran, dan timeline (urut lama → baru)", async () => {
    const u = await makeUser("detail");
    const o = await seedOrder({
      userId: u.id,
      status: "paid",
      items: [{ name: "Kursi Santai Rukun", material: "Rotan & Linen", price: 2_450_000, qty: 1, images: ["/images/a.jpg"] }],
      shipping: 66_000,
    });
    await addPayment(o.id, { status: "deny", amount: o.total, createdAt: sql`now() - interval '2 minutes'` as any });
    await addPayment(o.id, { status: "settlement", amount: o.total, gatewayPaymentMethod: "qris" });
    await db.insert(orderStatusLogs).values([
      { orderId: o.id, fromStatus: "awaiting_payment", toStatus: "paid", actor: "midtrans", note: "Webhook: settlement", createdAt: sql`now()` as any },
      { orderId: o.id, fromStatus: "draft", toStatus: "awaiting_payment", actor: "system", createdAt: sql`now() - interval '5 minutes'` as any },
    ]);

    const { body } = await http()(`/orders/${o.token}`, u.token);
    const d = body!.data;
    expect(d).toMatchObject({ order_token: o.token, status: "paid", amounts: { subtotal: 2_450_000, shipping: 66_000, installation: 0, total: 2_516_000 } });
    expect(d.items).toEqual([
      { product_slug: expect.stringContaining(PREFIX), product_name: "Kursi Santai Rukun", material: "Rotan & Linen", color_hex: "#C99A66", qty: 1, unit_price: 2_450_000, subtotal: 2_450_000, image_url: "/images/a.jpg" },
    ]);
    expect(d.payments.map((p: Json) => p.status)).toEqual(["deny", "settlement"]);
    expect(d.payments[1]).toMatchObject({ method: "qris", amount: 2_516_000 });
    expect(d.timeline.map((l: Json) => `${l.from}>${l.to}`)).toEqual(["draft>awaiting_payment", "awaiting_payment>paid"]);
    expect(d.timeline[1]).toMatchObject({ actor: "midtrans", note: "Webhook: settlement" });
    expect(new Date(d.created_at).toISOString()).toBe(d.created_at);
  });

  test("can_continue: awaiting_payment + reservasi aktif → true dan redirect_url terbaru terisi", async () => {
    const o = await seedOrder({ userId: null, status: "awaiting_payment", reservedMinutes: 20 });
    await addPayment(o.id, { snapRedirectUrl: "https://lama", createdAt: sql`now() - interval '1 minute'` as any });
    await addPayment(o.id, { snapRedirectUrl: "https://baru" });
    const { body } = await http()(`/orders/${o.token}`);
    expect(body!.data.payment).toEqual({ redirect_url: "https://baru", can_continue: true });
  });

  test("can_continue false dan redirect_url null: reservasi lewat, atau status bukan awaiting_payment", async () => {
    const get = http();
    const lewat = await seedOrder({ userId: null, status: "awaiting_payment", reservedMinutes: -1 });
    await addPayment(lewat.id);
    const lunas = await seedOrder({ userId: null, status: "paid", reservedMinutes: 20 });
    await addPayment(lunas.id);
    for (const o of [lewat, lunas]) {
      const { body } = await get(`/orders/${o.token}`);
      expect(body!.data.payment).toEqual({ redirect_url: null, can_continue: false });
    }
  });

  test("pesanan tanpa pembayaran/log/telepon tidak membuat error", async () => {
    const o = await seedOrder({ userId: null, phone: null, email: null });
    const { res, body } = await http()(`/orders/${o.token}`);
    expect(res.status).toBe(200);
    expect(body!.data.payments).toEqual([]);
    expect(body!.data.timeline).toEqual([]);
    expect(body!.data.contact.email).toBeNull();
  });
});

describe("GET /api/orders/:token — batas laju", () => {
  test("lebih dari 60 permintaan per menit dari satu IP → 429", async () => {
    const get = http(); // satu aplikasi = satu pembatas
    const statuses: number[] = [];
    for (let i = 0; i < 61; i++) statuses.push((await get(`/orders/${randomToken(32)}`)).res.status);
    expect(statuses.slice(0, 60).every((s) => s === 404)).toBe(true);
    expect(statuses[60]).toBe(429);
  });

  test("daftar pesanan tidak ikut dibatasi oleh pembatas detail", async () => {
    const u = await makeUser("limit");
    const get = http();
    for (let i = 0; i < 61; i++) await get(`/orders/${randomToken(32)}`);
    expect((await get("/orders", u.token)).res.status).toBe(200);
  });
});

describe("alur nyata: init → shipping-rate → confirm → detail pesanan", () => {
  test("setelah confirm, can_continue true dan redirect_url terisi walau reservasi init hampir habis", async () => {
    const { variant } = await makeVariant({ price: 1_000_000 });
    const created = await init([{ product_variant_id: variant.id, qty: 1 }], null);
    const { options } = await quoteShipping({ order_token: created.order_token, address: { full_address: FULL_ADDRESS, city: "Jakarta Selatan", province: "DKI Jakarta" } }, null);
    // pembeli lama mengisi form: reservasi dari init tinggal 1 menit
    await db.update(orders).set({ reservedUntil: sql`now() + interval '1 minute'` }).where(eq(orders.orderToken, created.order_token));

    await confirm(
      { order_token: created.order_token, contact: { email: "budi@contoh.com" }, shipping: { courier: options[0]!.courier }, payment_method: "qris" },
      null,
      { createTransaction: async () => ({ token: "T", redirect_url: "https://app.sandbox.midtrans.com/snap/v4/redirection/T" }) },
    );

    const { body } = await http()(`/orders/${created.order_token}`);
    expect(body!.data.status).toBe("awaiting_payment");
    expect(body!.data.payment).toEqual({ redirect_url: "https://app.sandbox.midtrans.com/snap/v4/redirection/T", can_continue: true });
    // jendela bayar ± 30 menit dari confirm, bukan 1 menit sisa dari init
    const minutesLeft = (new Date(body!.data.reserved_until).getTime() - Date.now()) / 60_000;
    expect(minutesLeft).toBeGreaterThan(29);
    expect(minutesLeft).toBeLessThanOrEqual(30);
  });
});
