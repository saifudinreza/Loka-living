import { describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { createApp } from "../src/app";
import { db } from "../src/db/client";
import { cartItems, orders, productVariants } from "../src/db/schema";
import { sha512Hex } from "../src/lib/crypto";
import { releaseExpiredReservations } from "../src/jobs/release-expired-reservations";
import type { CreateTransactionInput } from "../src/modules/payments/midtrans.service";
import { useCleanDatabase } from "./db-reset";

useCleanDatabase();

// Alur pembelian dari ujung ke ujung lewat HTTP, persis seperti yang dilakukan frontend:
// register/login → init → shipping-rate → confirm → webhook Midtrans → riwayat pesanan.
// Hanya Midtrans yang diganti (palsu); semua yang lain adalah aplikasi sungguhan dengan database test.

type Json = Record<string, any>;

const SERVER_KEY = "SB-Mid-server-flow-test-key";
const ADDRESS = { full_address: "Jl. Alur No. 1", city: "Jakarta Selatan", province: "DKI Jakarta", postal_code: "12345", recipient_name: "Budi Santoso", phone: "081234567890" };

const midtransCalls: CreateTransactionInput[] = [];
const app = createApp({
  enableJobs: false,
  deps: {
    midtrans: {
      serverKey: SERVER_KEY,
      createTransaction: async (input) => {
        midtransCalls.push(input);
        return { token: "snap-flow", redirect_url: "https://app.sandbox.midtrans.com/snap/v4/redirection/snap-flow" };
      },
    },
  },
});

async function api(method: string, path: string, opts: { token?: string; body?: unknown } = {}) {
  const res = await app.handle(
    new Request(`http://localhost/api${path}`, {
      method,
      headers: { "content-type": "application/json", ...(opts.token ? { authorization: `Bearer ${opts.token}` } : {}) },
      ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
    }),
  );
  const text = await res.text();
  return { res, body: (text ? JSON.parse(text) : null) as Json | null };
}

async function register(label: string) {
  const email = `flow-${label}-${crypto.randomUUID().slice(0, 8)}@contoh.com`;
  const { res, body } = await api("POST", "/auth/register", { body: { email, password: "password-rahasia", name: label } });
  expect(res.status).toBe(201);
  return { email, token: body!.access_token as string };
}

const seedVariant = async (sku = "KSR-RLN-01") => (await db.select().from(productVariants).where(eq(productVariants.sku, sku)))[0]!;
const stockOf = async (id: string) => {
  const [row] = await db.select({ available: productVariants.stockAvailable, reserved: productVariants.stockReserved }).from(productVariants).where(eq(productVariants.id, id));
  return row!;
};

function webhook(orderToken: string, grossAmount: number, status: string, transactionId = `trx-${crypto.randomUUID()}`) {
  const gross_amount = `${grossAmount}.00`;
  const status_code = "200";
  return {
    order_id: orderToken,
    status_code,
    gross_amount,
    signature_key: sha512Hex(`${orderToken}${status_code}${gross_amount}${SERVER_KEY}`),
    transaction_status: status,
    transaction_id: transactionId,
    fraud_status: null,
    payment_type: "qris",
  };
}

/** init → shipping-rate → confirm, seperti urutan layar checkout. */
async function checkout(opts: { token?: string; variantId: string; qty?: number; installation?: boolean; email?: string }) {
  const init = await api("POST", "/checkout/init", { token: opts.token, body: { items: [{ product_variant_id: opts.variantId, qty: opts.qty ?? 1 }] } });
  expect(init.res.status).toBe(200);
  const orderToken = init.body!.order_token as string;

  const rate = await api("POST", "/checkout/shipping-rate", { token: opts.token, body: { order_token: orderToken, address: ADDRESS } });
  expect(rate.res.status).toBe(200);
  const option = rate.body!.options[0] as Json;

  const confirm = await api("POST", "/checkout/confirm", {
    token: opts.token,
    body: {
      order_token: orderToken,
      ...(opts.email ? { contact: { email: opts.email, phone: "081234567890" } } : {}),
      shipping: { courier: option.courier, delivery_date: rate.body!.available_delivery_dates[1] },
      wants_installation: opts.installation === true,
      payment_method: "qris",
    },
  });
  return { orderToken, init, rate, option, confirm };
}

describe("auth: register → login → /me", () => {
  test("alur lengkap, dan login salah vs email tak terdaftar memberi respons identik", async () => {
    const { email, token } = await register("auth");
    const me = await api("GET", "/auth/me", { token });
    expect(me.res.status).toBe(200);
    expect(me.body!.user?.email ?? me.body!.email).toBe(email);

    const login = await api("POST", "/auth/login", { body: { email, password: "password-rahasia" } });
    expect(login.res.status).toBe(200);
    expect((await api("GET", "/auth/me", { token: login.body!.access_token })).res.status).toBe(200);

    const wrong = await api("POST", "/auth/login", { body: { email, password: "salah-total" } });
    const unknown = await api("POST", "/auth/login", { body: { email: "tidak-ada@contoh.com", password: "salah-total" } });
    expect(wrong.res.status).toBe(401);
    expect(wrong.body).toEqual(unknown.body!);
  });
});

describe("pembelian tamu dari ujung ke ujung", () => {
  test("init → shipping-rate → confirm → webhook settlement → pesanan lunas, stok terjual, data pribadi disamarkan", async () => {
    const variant = await seedVariant();
    const before = await stockOf(variant.id);
    midtransCalls.length = 0;

    const { orderToken, init, option, confirm } = await checkout({ variantId: variant.id, qty: 2, installation: true, email: "budi@contoh.com" });
    expect(init.body!.subtotal_amount).toBe(variant.priceIdr * 2);
    expect(confirm.res.status).toBe(200);
    const total = variant.priceIdr * 2 + option.price + 150_000;
    expect(confirm.body!.total_amount).toBe(total);
    expect(confirm.body!.payment.redirect_url).toContain("snap-flow");
    expect(await stockOf(variant.id)).toEqual({ available: before.available - 2, reserved: before.reserved + 2 });

    // yang dikirim ke Midtrans: total sama dengan Σ item
    expect(midtransCalls).toHaveLength(1);
    const sent = midtransCalls[0]!;
    expect(sent.grossAmount).toBe(total);
    expect(sent.items.reduce((s, i) => s + i.price * i.quantity, 0)).toBe(total);

    // sebelum bayar: bisa dilanjutkan
    const pending = await api("GET", `/orders/${orderToken}`);
    expect(pending.body!.data).toMatchObject({ status: "awaiting_payment", payment: { can_continue: true } });

    // Midtrans memberi tahu pembayaran berhasil
    const paid = await api("POST", "/payment/webhook", { body: webhook(orderToken, total, "settlement") });
    expect(paid.res.status).toBe(200);

    expect(await stockOf(variant.id)).toEqual({ available: before.available - 2, reserved: before.reserved }); // terjual
    const detail = (await api("GET", `/orders/${orderToken}`)).body!.data as Json;
    expect(detail.status).toBe("paid");
    expect(detail.payment).toEqual({ redirect_url: null, can_continue: false });
    expect(detail.amounts).toEqual({ subtotal: variant.priceIdr * 2, shipping: option.price, installation: 150_000, total });
    expect(detail.contact.email).toBe("bu***@contoh.com");
    expect(detail.shipping.phone).toBe("0812****890");
    expect(detail.timeline.map((l: Json) => `${l.from}>${l.to}`)).toEqual(["null>draft", "draft>awaiting_payment", "awaiting_payment>paid"]);
  });

  test("dua pembeli berebut stok terakhir: hanya satu yang lolos init, stok tidak pernah negatif", async () => {
    const variant = await seedVariant("KSR-RLN-01");
    await db.update(productVariants).set({ stockAvailable: 1, stockReserved: 0 }).where(eq(productVariants.id, variant.id));
    const attempt = () => api("POST", "/checkout/init", { body: { items: [{ product_variant_id: variant.id, qty: 1 }] } });

    const results = await Promise.all([attempt(), attempt()]);
    expect(results.map((r) => r.res.status).sort()).toEqual([200, 422]);
    expect(results.find((r) => r.res.status === 422)!.body!.code).toBe("STOCK_INSUFFICIENT");
    expect(await stockOf(variant.id)).toEqual({ available: 0, reserved: 1 });
  });
});

describe("pembelian user login dari ujung ke ujung", () => {
  test("pesanan masuk riwayat, barang yang dibeli keluar dari keranjang, detail menampilkan data lengkap", async () => {
    const user = await register("buyer");
    const variant = await seedVariant("KSR-RLN-01");
    await db.update(productVariants).set({ stockAvailable: 10, stockReserved: 0 }).where(eq(productVariants.id, variant.id));
    const other = await seedVariant("MJM-JTI-01").catch(() => undefined);
    const otherVariant = other ?? (await db.select().from(productVariants).where(sql`${productVariants.sku} <> ${variant.sku}`).limit(1))[0]!;

    // keranjang berisi barang yang dibeli dan satu barang lain
    expect((await api("PUT", `/cart/items/${variant.id}`, { token: user.token, body: { qty: 1 } })).res.status).toBe(200);
    expect((await api("PUT", `/cart/items/${otherVariant.id}`, { token: user.token, body: { qty: 1 } })).res.status).toBe(200);

    const { orderToken, confirm } = await checkout({ token: user.token, variantId: variant.id });
    expect(confirm.res.status).toBe(200);
    await api("POST", "/payment/webhook", { body: webhook(orderToken, confirm.body!.total_amount, "settlement") });

    const list = await api("GET", "/orders", { token: user.token });
    expect(list.body!.data.map((o: Json) => o.order_token)).toEqual([orderToken]);
    expect(list.body!.data[0]).toMatchObject({ status: "paid", total_amount: confirm.body!.total_amount, item_count: 1 });

    const cart = await db.select().from(cartItems);
    expect(cart.map((c) => c.productVariantId)).toEqual([otherVariant.id]); // yang dibeli hilang, yang lain tetap

    const detail = (await api("GET", `/orders/${orderToken}`, { token: user.token })).body!.data as Json;
    expect(detail.status).toBe("paid");
    expect(detail.contact.email).toBe(user.email); // lengkap, tidak disamarkan
    expect(detail.shipping.phone).toBe("081234567890");
  });
});

describe("checkout yang ditinggalkan", () => {
  test("init lalu tidak dilanjutkan: job melepas stok, pesanan tidak muncul di riwayat sebagai draft", async () => {
    const user = await register("abandon");
    const variant = await seedVariant("KSR-RLN-01");
    await db.update(productVariants).set({ stockAvailable: 10, stockReserved: 0 }).where(eq(productVariants.id, variant.id));

    const init = await api("POST", "/checkout/init", { token: user.token, body: { items: [{ product_variant_id: variant.id, qty: 3 }] } });
    expect(await stockOf(variant.id)).toEqual({ available: 7, reserved: 3 });
    expect((await api("GET", "/orders", { token: user.token })).body!.data).toEqual([]); // draft bukan pesanan

    await db.update(orders).set({ reservedUntil: sql`now() - interval '1 minute'` }).where(eq(orders.orderToken, init.body!.order_token));
    expect(await releaseExpiredReservations()).toBe(1);
    expect(await stockOf(variant.id)).toEqual({ available: 10, reserved: 0 });

    // confirm sesudah kedaluwarsa tidak mungkin
    const late = await api("POST", "/checkout/confirm", { token: user.token, body: { order_token: init.body!.order_token, shipping: { courier: "jne_trucking" }, payment_method: "qris" } });
    expect(late.res.status).toBe(404);
  });
});

describe("akses silang: user B tidak bisa menyentuh data user A", () => {
  test("keranjang, wishlist, alamat, pesanan, dan checkout milik A", async () => {
    const a = await register("pemilik");
    const b = await register("penyusup");
    const variant = await seedVariant("KSR-RLN-01");
    await db.update(productVariants).set({ stockAvailable: 10, stockReserved: 0 }).where(eq(productVariants.id, variant.id));
    const [productId] = [variant.productId];

    // data milik A
    await api("PUT", `/cart/items/${variant.id}`, { token: a.token, body: { qty: 2 } });
    const wl = await api("POST", "/wishlist", { token: a.token, body: { product_id: productId } });
    expect(wl.res.status).toBe(201);
    expect((await api("GET", "/wishlist", { token: a.token })).body!.data).toHaveLength(1);
    const address = await api("POST", "/addresses", { token: a.token, body: { label: "Rumah", recipient_name: "A", phone: "081234567890", full_address: "Jl. A No. 1", city: "Jakarta Selatan", province: "DKI Jakarta", postal_code: "12345" } });
    expect(address.res.status).toBe(201);
    const addressId = address.body!.data.id as string;
    const { orderToken, confirm } = await checkout({ token: a.token, variantId: variant.id });
    expect(confirm.res.status).toBe(200);

    // B hanya melihat datanya sendiri (kosong)
    expect((await api("GET", "/cart", { token: b.token })).body!.data.items).toEqual([]);
    expect((await api("GET", "/wishlist", { token: b.token })).body!.data).toEqual([]);
    expect((await api("GET", "/addresses", { token: b.token })).body!.data).toEqual([]);
    expect((await api("GET", "/orders", { token: b.token })).body!.data).toEqual([]);

    // B tidak bisa mengubah atau menghapus milik A (404), dan milik A tidak berubah
    expect((await api("PATCH", `/addresses/${addressId}`, { token: b.token, body: { label: "Diretas" } })).res.status).toBe(404);
    expect((await api("DELETE", `/addresses/${addressId}`, { token: b.token })).res.status).toBe(404);
    await api("DELETE", `/cart/items/${variant.id}`, { token: b.token });
    await api("DELETE", `/wishlist/${productId}`, { token: b.token });
    expect((await api("GET", "/cart", { token: a.token })).body!.data.items).toHaveLength(1);
    expect((await api("GET", "/wishlist", { token: a.token })).body!.data).toHaveLength(1);
    const mine = (await api("GET", "/addresses", { token: a.token })).body!.data as Json[];
    expect(mine).toHaveLength(1);
    expect(mine[0]!.label).toBe("Rumah");

    // pesanan A: B, dan siapa pun tanpa login, mendapat 404 yang sama dengan token salah
    const wrongToken = (await api("GET", `/orders/${"x".repeat(43)}`)).body;
    expect((await api("GET", `/orders/${orderToken}`, { token: b.token })).body).toEqual(wrongToken!);
    expect((await api("GET", `/orders/${orderToken}`)).body).toEqual(wrongToken!);
    expect((await api("GET", `/orders/${orderToken}`, { token: a.token })).res.status).toBe(200);

    // checkout milik A: B tidak bisa mengubah alamat, ongkir, atau membayarnya
    const aDraft = await api("POST", "/checkout/init", { token: a.token, body: { items: [{ product_variant_id: variant.id, qty: 1 }] } });
    const draftToken = aDraft.body!.order_token as string;
    expect((await api("POST", "/checkout/shipping-rate", { token: b.token, body: { order_token: draftToken, address: ADDRESS } })).res.status).toBe(404);
    expect((await api("POST", "/checkout/confirm", { token: b.token, body: { order_token: draftToken, contact: { email: "b@contoh.com" }, shipping: { courier: "jne_trucking" }, payment_method: "qris" } })).res.status).toBe(404);
    expect((await orderRowStatus(draftToken))).toBe("draft");
  });
});

const orderRowStatus = async (token: string) => (await db.select({ status: orders.status }).from(orders).where(eq(orders.orderToken, token)))[0]!.status;

describe("regresi: id produk seed", () => {
  test("wishlist menerima produk dari seed (id polos 000...001 harus lolos validasi) dan bisa dihapus lagi", async () => {
    const user = await register("wishlist");
    const seedProductId = "00000000-0000-0000-0000-000000000001";

    const added = await api("POST", "/wishlist", { token: user.token, body: { product_id: seedProductId } });
    expect(added.res.status).toBe(201);
    expect((await api("GET", "/wishlist", { token: user.token })).body!.data).toHaveLength(1);

    expect((await api("DELETE", `/wishlist/${seedProductId}`, { token: user.token })).res.status).toBe(204);
    expect((await api("GET", "/wishlist", { token: user.token })).body!.data).toEqual([]);
    // yang bukan bentuk UUID tetap ditolak
    expect((await api("POST", "/wishlist", { token: user.token, body: { product_id: "bukan-uuid" } })).res.status).toBe(422);
  });
});
