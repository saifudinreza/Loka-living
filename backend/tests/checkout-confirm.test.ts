import { afterAll, describe, expect, test } from "bun:test";
import { eq, inArray, like, sql } from "drizzle-orm";
import { Elysia } from "elysia";
import { createApp } from "../src/app";
import { db } from "../src/db/client";
import { orderItems, orderStatusLogs, orders, paymentTransactions, productVariants, products, shippingQuotes, users } from "../src/db/schema";
import { AppError } from "../src/lib/errors";
import { jwtPlugin, signAccessToken } from "../src/modules/auth/tokens";
import { PAYMENT_WINDOW_MINUTES } from "../src/modules/checkout/checkout.constants";
import { INSTALLATION_FEE_IDR, buildSnapItems, computeTotals, confirm, quoteShipping, resolveContact, type ConfirmDeps, type ConfirmInput } from "../src/modules/checkout/checkout.service";
import { init } from "../src/modules/checkout/stock-reservation.service";
import { createTransaction, truncateName, type CreateTransactionInput } from "../src/modules/payments/midtrans.service";

const PREFIX = "cfm-";

type Json = Record<string, any>;

// ---------- bahan uji ----------

async function makeVariant(opts: { stock?: number; price?: number; name?: string; material?: string | null } = {}) {
  const slug = `${PREFIX}${crypto.randomUUID().slice(0, 10)}`;
  const [product] = await db
    .insert(products)
    .values({ name: opts.name ?? "Produk Uji", slug, category: "chairs", weightKg: "5", status: "active" })
    .returning();
  const [variant] = await db
    .insert(productVariants)
    .values({
      productId: product!.id,
      material: opts.material === undefined ? "Jati" : opts.material,
      sku: `CFM${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      priceIdr: opts.price ?? 1_000_000,
      priceUsd: "62.5",
      stockAvailable: opts.stock ?? 10,
      imageUrls: [],
    })
    .returning();
  return variant!;
}

const signer = new Elysia().use(jwtPlugin).get("/sign/:id", ({ jwt, params }) => signAccessToken(jwt, { id: params.id }));
async function makeUser(label: string) {
  const [user] = await db
    .insert(users)
    .values({ email: `${PREFIX}${label}-${crypto.randomUUID().slice(0, 8)}@contoh.com`, name: label })
    .returning();
  const token = await (await signer.handle(new Request(`http://localhost/sign/${user!.id}`))).text();
  return { id: user!.id, email: user!.email, token };
}

const ADDRESS = { full_address: "Jl. Uji No. 1", city: "Jakarta Selatan", province: "DKI Jakarta", postal_code: "12345" };

/** Order siap dikonfirmasi: init + alamat + quote (lewat service sungguhan, bukan data buatan). */
async function makeOrder(opts: { userId?: string | null; price?: number; qty?: number; address?: boolean; material?: string | null; name?: string } = {}) {
  const variant = await makeVariant({ price: opts.price, material: opts.material, name: opts.name });
  const created = await init([{ product_variant_id: variant.id, qty: opts.qty ?? 1 }], opts.userId ?? null);
  let courier = "";
  let shippingPrice = 0;
  if (opts.address !== false) {
    const { options } = await quoteShipping({ order_token: created.order_token, address: ADDRESS }, opts.userId ?? null);
    courier = options[0]!.courier;
    shippingPrice = options[0]!.price;
  }
  return { token: created.order_token, variant, courier, shippingPrice, subtotal: created.subtotal_amount };
}

const input = (token: string, courier: string, over: Partial<ConfirmInput> = {}): ConfirmInput => ({
  order_token: token,
  contact: { email: "budi@contoh.com", phone: "081234567890" },
  shipping: { courier },
  payment_method: "qris",
  ...over,
});

/** Pengganti Midtrans: mencatat setiap panggilan, tidak menyentuh jaringan. */
function fakeMidtrans(opts: { delayMs?: number; fail?: AppError } = {}) {
  const calls: CreateTransactionInput[] = [];
  const deps: ConfirmDeps = {
    createTransaction: async (i) => {
      calls.push(i);
      if (opts.delayMs) await Bun.sleep(opts.delayMs);
      if (opts.fail) throw opts.fail;
      return { token: "snap-token-uji", redirect_url: "https://app.sandbox.midtrans.com/snap/v4/redirection/snap-token-uji" };
    },
  };
  return { deps, calls };
}

const orderRow = async (token: string) => (await db.select().from(orders).where(eq(orders.orderToken, token)))[0]!;
const paymentRows = async (orderId: string) => db.select().from(paymentTransactions).where(eq(paymentTransactions.orderId, orderId));
const logRows = async (orderId: string) => db.select().from(orderStatusLogs).where(eq(orderStatusLogs.orderId, orderId));
const codeOf = async (p: Promise<unknown>) => {
  try {
    await p;
    return "OK";
  } catch (e) {
    return e instanceof AppError ? e.code : `UNEXPECTED:${String(e)}`;
  }
};

afterAll(async () => {
  const testVariants = await db
    .select({ id: productVariants.id })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(like(products.slug, `${PREFIX}%`));
  const ids = testVariants.map((v) => v.id);
  if (ids.length) {
    const orderIds = await db.selectDistinct({ id: orderItems.orderId }).from(orderItems).where(inArray(orderItems.productVariantId, ids));
    if (orderIds.length) {
      await db.delete(orders).where(inArray(orders.id, orderIds.map((o) => o.id))); // item, log, quote, pembayaran ikut terhapus
    }
  }
  // salinan alamat order tidak ikut cascade; hapus yang sudah tidak dipakai order mana pun
  await db.execute(sql`delete from addresses a where not exists (select 1 from orders o where o.address_id = a.id) and a.full_address = ${ADDRESS.full_address}`);
  await db.delete(products).where(like(products.slug, `${PREFIX}%`));
  await db.delete(users).where(like(users.email, `${PREFIX}%`));
});

// ---------- klien Midtrans (tanpa jaringan) ----------

describe("midtrans.service.createTransaction", () => {
  const base: CreateTransactionInput = {
    orderToken: "tok-1",
    grossAmount: 2_516_000,
    items: [
      { id: "v1", price: 2_450_000, quantity: 1, name: "Kursi" },
      { id: "SHIPPING", price: 66_000, quantity: 1, name: "Ongkos Kirim" },
    ],
    customer: { email: "a@b.com", phone: "0812" },
    method: "qris",
  };

  test("server key kosong → 503 PAYMENT_CONFIG_MISSING dan TIDAK ada request keluar", async () => {
    let called = false;
    const spy = (async () => {
      called = true;
      return new Response("{}");
    }) as unknown as typeof fetch;
    expect(await codeOf(createTransaction(base, { serverKey: "", isProduction: false, fetch: spy }))).toBe("PAYMENT_CONFIG_MISSING");
    expect(called).toBe(false);
  });

  test("request: URL sandbox, Basic auth dari key+':', body sesuai kontrak", async () => {
    let url = "";
    let init: RequestInit = {};
    const f = (async (u: string, i: RequestInit) => {
      url = u;
      init = i;
      return new Response(JSON.stringify({ token: "T", redirect_url: "https://x/y" }), { status: 201 });
    }) as unknown as typeof fetch;
    const out = await createTransaction(base, { serverKey: "SB-key", isProduction: false, fetch: f });

    expect(out).toEqual({ token: "T", redirect_url: "https://x/y" });
    expect(url).toBe("https://app.sandbox.midtrans.com/snap/v1/transactions");
    expect((init.headers as Json).Authorization).toBe(`Basic ${Buffer.from("SB-key:").toString("base64")}`);
    const body = JSON.parse(init.body as string);
    expect(body.transaction_details).toEqual({ order_id: "tok-1", gross_amount: 2_516_000 });
    expect(body.enabled_payments).toEqual(["other_qris"]);
    expect(body.expiry).toEqual({ unit: "minutes", duration: 30 });
    expect(body.customer_details).toEqual({ email: "a@b.com", phone: "0812" });
  });

  test("production memakai host production", async () => {
    let url = "";
    const f = (async (u: string) => {
      url = u;
      return new Response(JSON.stringify({ token: "T", redirect_url: "https://x/y" }));
    }) as unknown as typeof fetch;
    await createTransaction(base, { serverKey: "k", isProduction: true, fetch: f });
    expect(url).toBe("https://app.midtrans.com/snap/v1/transactions");
  });

  test("nama item dipotong 50 karakter", async () => {
    expect(truncateName("x".repeat(80))).toHaveLength(50);
    let body: Json = {};
    const f = (async (_u: string, i: RequestInit) => {
      body = JSON.parse(i.body as string);
      return new Response(JSON.stringify({ token: "T", redirect_url: "https://x/y" }));
    }) as unknown as typeof fetch;
    await createTransaction({ ...base, items: [{ id: "v", price: 2_516_000, quantity: 1, name: "n".repeat(70) }] }, { serverKey: "k", isProduction: false, fetch: f });
    expect(body.item_details[0].name).toHaveLength(50);
  });

  test("Midtrans menolak (401) → 502 dengan pesan tetap, teks Midtrans tidak bocor", async () => {
    const f = (async () => new Response(JSON.stringify({ error_messages: ["Access denied due to unauthorized transaction"] }), { status: 401 })) as unknown as typeof fetch;
    const err = await createTransaction(base, { serverKey: "salah", isProduction: false, fetch: f }).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect(err.status).toBe(502);
    expect(err.code).toBe("MIDTRANS_UNAVAILABLE");
    expect(err.message).not.toContain("unauthorized");
  });

  test("timeout / jaringan putus → 502", async () => {
    const f = (async () => {
      throw new DOMException("timeout", "TimeoutError");
    }) as unknown as typeof fetch;
    expect(await codeOf(createTransaction(base, { serverKey: "k", isProduction: false, fetch: f }))).toBe("MIDTRANS_UNAVAILABLE");
  });

  test("respons sukses tanpa token → 502", async () => {
    const f = (async () => new Response("{}", { status: 201 })) as unknown as typeof fetch;
    expect(await codeOf(createTransaction(base, { serverKey: "k", isProduction: false, fetch: f }))).toBe("MIDTRANS_UNAVAILABLE");
  });

  test("Σ item ≠ gross_amount → error sebelum request dikirim", async () => {
    let called = false;
    const f = (async () => {
      called = true;
      return new Response("{}");
    }) as unknown as typeof fetch;
    await expect(createTransaction({ ...base, grossAmount: 1 }, { serverKey: "k", isProduction: false, fetch: f })).rejects.toThrow();
    expect(called).toBe(false);
  });
});

// ---------- alur confirm ----------

describe("confirm: alur sukses", () => {
  test("tamu: order jadi awaiting_payment, total dihitung dari database, pembayaran dan log tercatat", async () => {
    const o = await makeOrder({ price: 2_450_000 });
    const { deps, calls } = fakeMidtrans();
    const out = await confirm(input(o.token, o.courier, { shipping: { courier: o.courier, delivery_date: undefined } }), null, deps);

    const total = 2_450_000 + o.shippingPrice;
    expect(out).toEqual({
      order_token: o.token,
      total_amount: total,
      payment: { gateway: "midtrans", snap_token: "snap-token-uji", redirect_url: expect.stringContaining("snap-token-uji") },
    });

    const row = await orderRow(o.token);
    expect(row).toMatchObject({
      status: "awaiting_payment",
      guestEmail: "budi@contoh.com",
      guestPhone: "081234567890",
      shippingAmount: o.shippingPrice,
      installationAmount: 0,
      totalAmount: total,
      paymentGateway: "midtrans",
      wantsInstallation: false,
    });

    const pays = await paymentRows(row.id);
    expect(pays).toHaveLength(1);
    expect(pays[0]).toMatchObject({ gateway: "midtrans", status: "pending", amount: total, requestedMethod: "qris", snapToken: "snap-token-uji", gatewayTransactionId: null });

    const logs = await logRows(row.id);
    expect(logs.map((l) => `${l.fromStatus}>${l.toStatus}:${l.actor}`)).toContain("draft>awaiting_payment:system");

    // item yang dikirim ke Midtrans: barang + ongkir, dan jumlahnya = total
    expect(calls).toHaveLength(1);
    expect(calls[0]!.orderToken).toBe(o.token);
    expect(calls[0]!.grossAmount).toBe(total);
    expect(calls[0]!.items.map((i) => i.id)).toEqual([o.variant.id, "SHIPPING"]);
    expect(calls[0]!.items.reduce((s, i) => s + i.price * i.quantity, 0)).toBe(total);
  });

  test("wants_installation: +150.000, item INSTALLATION dikirim, jumlah item = gross_amount", async () => {
    const o = await makeOrder({ price: 1_000_000, qty: 2 });
    const { deps, calls } = fakeMidtrans();
    const out = await confirm(input(o.token, o.courier, { wants_installation: true }), null, deps);

    const total = 2_000_000 + o.shippingPrice + INSTALLATION_FEE_IDR;
    expect(out.total_amount).toBe(total);
    expect(INSTALLATION_FEE_IDR).toBe(150_000);
    const row = await orderRow(o.token);
    expect(row).toMatchObject({ installationAmount: 150_000, wantsInstallation: true, totalAmount: total });
    const sent = calls[0]!;
    expect(sent.items.find((i) => i.id === "INSTALLATION")).toMatchObject({ price: 150_000, quantity: 1 });
    expect(sent.items.reduce((s, i) => s + i.price * i.quantity, 0)).toBe(sent.grossAmount);
  });

  test("tanggal kirim valid disimpan; tanggal di luar rentang → 422", async () => {
    const o = await makeOrder();
    const { options, available_delivery_dates } = await quoteShipping({ order_token: o.token, address: ADDRESS }, null);
    const { deps } = fakeMidtrans();
    expect(await codeOf(confirm(input(o.token, o.courier, { shipping: { courier: o.courier, delivery_date: "2020-01-01" } }), null, deps))).toBe("VALIDATION_FAILED");
    expect((await orderRow(o.token)).status).toBe("draft");

    await confirm(input(o.token, options[0]!.courier, { shipping: { courier: options[0]!.courier, delivery_date: available_delivery_dates[2] } }), null, deps);
    expect((await orderRow(o.token)).scheduledDeliveryDate).toBe(available_delivery_dates[2]!);
  });

  test("user login tanpa contact: memakai email akun, order tetap milik user", async () => {
    const u = await makeUser("pemilik");
    const o = await makeOrder({ userId: u.id });
    const { deps, calls } = fakeMidtrans();
    await confirm({ order_token: o.token, shipping: { courier: o.courier }, payment_method: "va_bca" }, u.id, deps);

    expect(calls[0]!.customer.email).toBe(u.email);
    expect(calls[0]!.method).toBe("va_bca");
    expect(await orderRow(o.token)).toMatchObject({ status: "awaiting_payment", userId: u.id, guestEmail: u.email });
  });

  test("nama item: produk + material, dan produk tanpa material memakai nama produk saja", async () => {
    const a = await makeOrder({ name: "Kursi", material: "Jati" });
    const b = await makeOrder({ name: "Meja", material: null });
    const fa = fakeMidtrans();
    const fb = fakeMidtrans();
    await confirm(input(a.token, a.courier), null, fa.deps);
    await confirm(input(b.token, b.courier), null, fb.deps);
    expect(fa.calls[0]!.items[0]!.name).toBe("Kursi - Jati");
    expect(fb.calls[0]!.items[0]!.name).toBe("Meja");
  });
});

describe("confirm: Midtrans gagal → order tetap draft dan bisa dicoba lagi", () => {
  test("502 → tidak ada status/log/pembayaran baru; setelah pulih, token yang sama → sukses", async () => {
    const o = await makeOrder();
    const before = await orderRow(o.token);
    const logsBefore = (await logRows(before.id)).length;

    const bad = fakeMidtrans({ fail: new AppError(502, "MIDTRANS_UNAVAILABLE", "x") });
    expect(await codeOf(confirm(input(o.token, o.courier), null, bad.deps))).toBe("MIDTRANS_UNAVAILABLE");

    const after = await orderRow(o.token);
    expect(after.status).toBe("draft");
    expect(after.totalAmount).toBe(before.totalAmount);
    expect(await paymentRows(after.id)).toHaveLength(0);
    expect(await logRows(after.id)).toHaveLength(logsBefore);

    const good = fakeMidtrans();
    await confirm(input(o.token, o.courier), null, good.deps);
    expect((await orderRow(o.token)).status).toBe("awaiting_payment");
  });

  test("server key kosong (klien asli) → 503, order tetap draft", async () => {
    const o = await makeOrder();
    const deps: ConfirmDeps = {
      createTransaction: (i) =>
        createTransaction(i, {
          serverKey: "",
          isProduction: false,
          fetch: (async () => {
            throw new Error("tidak boleh ada request");
          }) as unknown as typeof fetch,
        }),
    };
    expect(await codeOf(confirm(input(o.token, o.courier), null, deps))).toBe("PAYMENT_CONFIG_MISSING");
    const row = await orderRow(o.token);
    expect(row.status).toBe("draft");
    expect(await paymentRows(row.id)).toHaveLength(0);
  });
});

describe("confirm: konfirmasi ganda", () => {
  test("dua confirm paralel untuk order yang sama → tepat satu sukses, satu ORDER_NOT_FOUND, Midtrans dipanggil sekali", async () => {
    const o = await makeOrder();
    const { deps, calls } = fakeMidtrans({ delayMs: 150 });
    const results = await Promise.all([
      codeOf(confirm(input(o.token, o.courier), null, deps)),
      codeOf(confirm(input(o.token, o.courier), null, deps)),
    ]);
    expect(results.sort()).toEqual(["OK", "ORDER_NOT_FOUND"]);
    expect(calls).toHaveLength(1);
    expect(await paymentRows((await orderRow(o.token)).id)).toHaveLength(1);
  });

  test("confirm kedua setelah sukses → ORDER_NOT_FOUND", async () => {
    const o = await makeOrder();
    const { deps } = fakeMidtrans();
    await confirm(input(o.token, o.courier), null, deps);
    expect(await codeOf(confirm(input(o.token, o.courier), null, deps))).toBe("ORDER_NOT_FOUND");
  });
});

describe("confirm: validasi", () => {
  test("token tidak dikenal → ORDER_NOT_FOUND", async () => {
    const { deps } = fakeMidtrans();
    expect(await codeOf(confirm(input("tidak-ada", "jne_trucking"), null, deps))).toBe("ORDER_NOT_FOUND");
  });

  test("order milik user lain → ORDER_NOT_FOUND (bukan 403); tamu dan user lain sama-sama ditolak", async () => {
    const owner = await makeUser("owner");
    const other = await makeUser("other");
    const o = await makeOrder({ userId: owner.id });
    const { deps, calls } = fakeMidtrans();
    expect(await codeOf(confirm(input(o.token, o.courier), other.id, deps))).toBe("ORDER_NOT_FOUND");
    expect(await codeOf(confirm(input(o.token, o.courier), null, deps))).toBe("ORDER_NOT_FOUND");
    expect(calls).toHaveLength(0);
    expect((await orderRow(o.token)).status).toBe("draft");
  });

  test("reservasi lewat → RESERVATION_EXPIRED", async () => {
    const o = await makeOrder();
    await db.update(orders).set({ reservedUntil: sql`now() - interval '1 minute'` }).where(eq(orders.orderToken, o.token));
    const { deps, calls } = fakeMidtrans();
    expect(await codeOf(confirm(input(o.token, o.courier), null, deps))).toBe("RESERVATION_EXPIRED");
    expect(calls).toHaveLength(0);
  });

  test("belum ada alamat → ADDRESS_REQUIRED", async () => {
    const o = await makeOrder({ address: false });
    const { deps } = fakeMidtrans();
    expect(await codeOf(confirm(input(o.token, "jne_trucking"), null, deps))).toBe("ADDRESS_REQUIRED");
  });

  test("kurir tidak ada di quote → SHIPPING_QUOTE_INVALID", async () => {
    const o = await makeOrder();
    const { deps } = fakeMidtrans();
    expect(await codeOf(confirm(input(o.token, "kurir-palsu"), null, deps))).toBe("SHIPPING_QUOTE_INVALID");
    expect((await orderRow(o.token)).status).toBe("draft");
  });

  test("quote kedaluwarsa → SHIPPING_QUOTE_INVALID; hitung ongkir ulang memulihkan", async () => {
    const o = await makeOrder();
    const row = await orderRow(o.token);
    await db.update(shippingQuotes).set({ expiresAt: sql`now() - interval '1 minute'` }).where(eq(shippingQuotes.orderId, row.id));
    const { deps } = fakeMidtrans();
    expect(await codeOf(confirm(input(o.token, o.courier), null, deps))).toBe("SHIPPING_QUOTE_INVALID");

    await quoteShipping({ order_token: o.token, address: ADDRESS }, null);
    expect(await codeOf(confirm(input(o.token, o.courier), null, deps))).toBe("OK");
  });

  test("tamu tanpa email → VALIDATION_FAILED sebelum menyentuh order", async () => {
    const o = await makeOrder();
    const { deps, calls } = fakeMidtrans();
    expect(await codeOf(confirm({ order_token: o.token, shipping: { courier: o.courier }, payment_method: "qris" }, null, deps))).toBe("VALIDATION_FAILED");
    expect(calls).toHaveLength(0);
  });
});

describe("confirm: harga dari server, bukan dari client", () => {
  test("field total/ongkir palsu di input diabaikan; total = subtotal order + quote tersimpan", async () => {
    const o = await makeOrder({ price: 3_000_000 });
    const { deps } = fakeMidtrans();
    const forged = { ...input(o.token, o.courier), total_amount: 1, shipping_amount: 0, subtotal_amount: 1 } as unknown as ConfirmInput;
    const out = await confirm(forged, null, deps);
    expect(out.total_amount).toBe(3_000_000 + o.shippingPrice);
    const row = await orderRow(o.token);
    expect(row.shippingAmount).toBe(o.shippingPrice);
    expect(row.totalAmount).toBe(3_000_000 + o.shippingPrice);
  });

  test("harga produk diubah setelah init: total tetap memakai harga snapshot order", async () => {
    const o = await makeOrder({ price: 1_000_000 });
    await db.update(productVariants).set({ priceIdr: 1 }).where(eq(productVariants.id, o.variant.id));
    const { deps } = fakeMidtrans();
    const out = await confirm(input(o.token, o.courier), null, deps);
    expect(out.total_amount).toBe(1_000_000 + o.shippingPrice);
  });
});

// ---------- lapisan HTTP ----------

describe("POST /api/checkout/confirm (HTTP)", () => {
  function http() {
    const app = createApp({ enableJobs: false });
    return async (body: unknown, token?: string) => {
      const res = await app.handle(
        new Request("http://localhost/api/checkout/confirm", {
          method: "POST",
          headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
          body: JSON.stringify(body),
        }),
      );
      return { res, body: (await res.json().catch(() => null)) as Json | null };
    };
  }

  test("payment_method di luar daftar → 422 VALIDATION_FAILED", async () => {
    const o = await makeOrder();
    const { res, body } = await http()({ order_token: o.token, contact: { email: "a@b.com" }, shipping: { courier: o.courier }, payment_method: "bitcoin" });
    expect(res.status).toBe(422);
    expect(body!.code).toBe("VALIDATION_FAILED");
  });

  test("format tanggal salah → 422", async () => {
    const o = await makeOrder();
    const { res } = await http()({ order_token: o.token, contact: { email: "a@b.com" }, shipping: { courier: o.courier, delivery_date: "besok" }, payment_method: "qris" });
    expect(res.status).toBe(422);
  });

  test("token tidak dikenal → 404 ORDER_NOT_FOUND", async () => {
    const { res, body } = await http()({ order_token: "tidak-ada", contact: { email: "a@b.com" }, shipping: { courier: "x" }, payment_method: "qris" });
    expect(res.status).toBe(404);
    expect(body).toEqual({ error: "Pesanan tidak ditemukan.", code: "ORDER_NOT_FOUND" });
  });

  test("Bearer token tidak valid → 401, bukan dianggap tamu", async () => {
    const { res } = await http()({ order_token: "x", shipping: { courier: "x" }, payment_method: "qris" }, "token-rusak");
    expect(res.status).toBe(401);
  });
});

// ---------- perbaikan dari review PR #66 ----------

describe("fungsi murni confirm", () => {
  test("computeTotals: subtotal + ongkir + instalasi opsional", () => {
    expect(computeTotals(2_450_000, 66_000, false)).toEqual({ shipping: 66_000, installation: 0, total: 2_516_000 });
    expect(computeTotals(2_450_000, 66_000, true)).toEqual({ shipping: 66_000, installation: 150_000, total: 2_666_000 });
    expect(computeTotals(0, 0, false).total).toBe(0);
  });

  test("buildSnapItems: SHIPPING/INSTALLATION hanya kalau > 0, jumlah item = total", () => {
    const lines = [
      { variantId: "v1", qty: 2, unitPrice: 1_000_000, productName: "Kursi", material: "Jati" },
      { variantId: "v2", qty: 1, unitPrice: 500_000, productName: "Meja", material: null },
    ];
    const full = buildSnapItems(lines, 66_000, 150_000);
    expect(full.map((i) => i.id)).toEqual(["v1", "v2", "SHIPPING", "INSTALLATION"]);
    expect(full.map((i) => i.name).slice(0, 2)).toEqual(["Kursi - Jati", "Meja"]);
    expect(full.reduce((s, i) => s + i.price * i.quantity, 0)).toBe(computeTotals(2_500_000, 66_000, true).total);

    expect(buildSnapItems(lines, 0, 0).map((i) => i.id)).toEqual(["v1", "v2"]);
  });

  test("resolveContact: tamu wajib email (dinormalkan), user login boleh kosong", () => {
    expect(resolveContact({ email: " Budi@Contoh.COM ", phone: " 0812 " }, null)).toEqual({ email: "budi@contoh.com", phone: "0812" });
    expect(() => resolveContact(undefined, null)).toThrow();
    expect(() => resolveContact({ email: "  " }, null)).toThrow();
    expect(resolveContact(undefined, "akun@contoh.com")).toEqual({ email: "akun@contoh.com", phone: null });
    expect(resolveContact({ email: "lain@contoh.com" }, "akun@contoh.com").email).toBe("lain@contoh.com");
  });
});

describe("confirm: jendela bayar", () => {
  test("reserved_until diperpanjang menjadi 30 menit dari confirm (sama dengan expiry Midtrans)", async () => {
    const o = await makeOrder();
    // simulasi pembeli lama mengisi form: reservasi dari init tinggal 2 menit
    await db.update(orders).set({ reservedUntil: sql`now() + interval '2 minutes'` }).where(eq(orders.orderToken, o.token));
    const { deps, calls } = fakeMidtrans();
    await confirm(input(o.token, o.courier), null, deps);

    const [row] = await db
      .select({ seconds: sql<number>`extract(epoch from (${orders.reservedUntil} - now()))::int` })
      .from(orders)
      .where(eq(orders.orderToken, o.token));
    expect(row!.seconds).toBeGreaterThan(29 * 60);
    expect(row!.seconds).toBeLessThanOrEqual(30 * 60);
    expect(PAYMENT_WINDOW_MINUTES).toBe(30);
    expect(calls).toHaveLength(1);
  });
});

describe("confirm: pemilihan quote", () => {
  test("beberapa layanan untuk kurir yang sama → yang termurah, deterministik", async () => {
    const o = await makeOrder({ price: 1_000_000 });
    const row = await orderRow(o.token);
    await db.insert(shippingQuotes).values([
      { orderId: row.id, courier: o.courier, serviceName: "Mahal", price: o.shippingPrice + 500_000, etaDays: "1", expiresAt: sql`now() + interval '10 minutes'` },
      { orderId: row.id, courier: o.courier, serviceName: "Murah", price: Math.max(o.shippingPrice - 1, 0), etaDays: "5", expiresAt: sql`now() + interval '10 minutes'` },
    ]);
    const { deps } = fakeMidtrans();
    const out = await confirm(input(o.token, o.courier), null, deps);
    expect(out.total_amount).toBe(1_000_000 + Math.max(o.shippingPrice - 1, 0));
  });
});

describe("midtrans.service: batas order_id", () => {
  test("order_id lebih dari 50 karakter gagal jelas sebelum request dikirim", async () => {
    let called = false;
    const f = (async () => {
      called = true;
      return new Response("{}");
    }) as unknown as typeof fetch;
    await expect(
      createTransaction(
        { orderToken: "x".repeat(64), grossAmount: 1000, items: [{ id: "a", price: 1000, quantity: 1, name: "n" }], customer: { email: "a@b.com", phone: null }, method: "qris" },
        { serverKey: "k", isProduction: false, fetch: f },
      ),
    ).rejects.toThrow(/order_id/);
    expect(called).toBe(false);
  });
});

describe("POST /api/checkout/confirm (HTTP, Midtrans palsu lewat createApp deps)", () => {
  const post = (app: ReturnType<typeof createApp>, body: unknown) =>
    app.handle(
      new Request("http://localhost/api/checkout/confirm", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      }),
    );

  test("sukses: 200 + bentuk response kontrak + Cache-Control no-store", async () => {
    const o = await makeOrder({ price: 2_450_000 });
    const { deps, calls } = fakeMidtrans();
    const app = createApp({ enableJobs: false, deps: { midtrans: { createTransaction: deps.createTransaction } } });
    const res = await post(app, { order_token: o.token, contact: { email: "budi@contoh.com", phone: "081234567890" }, shipping: { courier: o.courier }, payment_method: "qris" });

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(await res.json()).toEqual({
      order_token: o.token,
      total_amount: 2_450_000 + o.shippingPrice,
      payment: { gateway: "midtrans", snap_token: "snap-token-uji", redirect_url: expect.stringContaining("snap-token-uji") },
    });
    expect(calls).toHaveLength(1);
  });

  test("Midtrans gagal: 502 dengan pesan tetap, order tetap draft", async () => {
    const o = await makeOrder();
    const { deps } = fakeMidtrans({ fail: new AppError(502, "MIDTRANS_UNAVAILABLE", "Layanan pembayaran sedang bermasalah. Coba lagi beberapa saat.") });
    const app = createApp({ enableJobs: false, deps: { midtrans: { createTransaction: deps.createTransaction } } });
    const res = await post(app, { order_token: o.token, contact: { email: "budi@contoh.com" }, shipping: { courier: o.courier }, payment_method: "qris" });

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Layanan pembayaran sedang bermasalah. Coba lagi beberapa saat.", code: "MIDTRANS_UNAVAILABLE" });
    expect((await orderRow(o.token)).status).toBe("draft");
  });

  test("total/ongkir palsu di body diabaikan (tidak ditolak, tidak dipakai)", async () => {
    const o = await makeOrder({ price: 3_000_000 });
    const { deps } = fakeMidtrans();
    const app = createApp({ enableJobs: false, deps: { midtrans: { createTransaction: deps.createTransaction } } });
    const res = await post(app, { order_token: o.token, contact: { email: "budi@contoh.com" }, shipping: { courier: o.courier, shipping_amount: 0 }, payment_method: "qris", total_amount: 1 });
    expect(res.status).toBe(200);
    expect((await res.json() as Json).total_amount).toBe(3_000_000 + o.shippingPrice);
  });
});
