import { afterAll, describe, expect, test } from "bun:test";
import { and, eq, inArray, like, sql } from "drizzle-orm";
import { createApp } from "../src/app";
import { db } from "../src/db/client";
import {
  addresses,
  cartItems,
  orderItems,
  orderStatusLogs,
  orders,
  paymentTransactions,
  processedWebhooks,
  productVariants,
  products,
  users,
} from "../src/db/schema";
import { sha512Hex } from "../src/lib/crypto";
import { confirm, quoteShipping, type ConfirmDeps } from "../src/modules/checkout/checkout.service";
import { init } from "../src/modules/checkout/stock-reservation.service";
import { webhookRoutes } from "../src/modules/payments/webhook.routes";
import { verifyMidtransSignature } from "../src/modules/payments/signature";

const PREFIX = "wh-";
const TEST_SERVER_KEY = "SB-Mid-server-test-webhook-key-12345";

// ---------- bahan uji ----------

async function makeVariant(opts: { stock?: number; price?: number; name?: string } = {}) {
  const slug = `${PREFIX}${crypto.randomUUID().slice(0, 10)}`;
  const [product] = await db
    .insert(products)
    .values({ name: opts.name ?? "Kursi Webhook", slug, category: "chairs", weightKg: "5", status: "active" })
    .returning();
  const [variant] = await db
    .insert(productVariants)
    .values({
      productId: product!.id,
      material: "Kayu Jati",
      sku: `WH${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      priceIdr: opts.price ?? 1_000_000,
      priceUsd: "62.5",
      stockAvailable: opts.stock ?? 10,
      stockReserved: 0,
      imageUrls: [],
    })
    .returning();
  return variant!;
}

async function makeUser(label: string) {
  const [user] = await db
    .insert(users)
    .values({ email: `${PREFIX}${label}-${crypto.randomUUID().slice(0, 8)}@contoh.com`, name: label })
    .returning();
  return user!;
}

const ADDRESS = { full_address: "Jl. Webhook No. 1", city: "Jakarta Selatan", province: "DKI Jakarta", postal_code: "12345" };

const fakeMidtransDeps: ConfirmDeps = {
  createTransaction: async () => ({
    token: "snap-token-wh",
    redirect_url: "https://app.sandbox.midtrans.com/snap/v4/redirection/snap-token-wh",
  }),
};

/** Membuat pesanan yang sudah melewati confirm (status awaiting_payment, punya payment_transactions pending). */
async function makeConfirmedOrder(opts: { userId?: string | null; price?: number; qty?: number } = {}) {
  const variant = await makeVariant({ price: opts.price, stock: 10 });
  const created = await init([{ product_variant_id: variant.id, qty: opts.qty ?? 1 }], opts.userId ?? null);
  const { options } = await quoteShipping({ order_token: created.order_token, address: ADDRESS }, opts.userId ?? null);

  const confirmed = await confirm(
    {
      order_token: created.order_token,
      contact: { email: "tester@contoh.com", phone: "081234567890" },
      shipping: { courier: options[0]!.courier },
      payment_method: "qris",
    },
    opts.userId ?? null,
    fakeMidtransDeps,
  );

  return { token: created.order_token, totalAmount: confirmed.total_amount, variantId: variant.id, qty: opts.qty ?? 1 };
}

function buildPayload(opts: {
  order_id: string;
  gross_amount: number | string;
  status_code?: string;
  transaction_status?: string;
  transaction_id?: string;
  fraud_status?: string | null;
  payment_type?: string | null;
  serverKey?: string;
  badSignature?: boolean;
}) {
  const order_id = opts.order_id;
  const status_code = opts.status_code ?? "200";
  const gross_amount = typeof opts.gross_amount === "number" ? `${opts.gross_amount}.00` : opts.gross_amount;
  const key = opts.serverKey ?? TEST_SERVER_KEY;
  const raw = `${order_id}${status_code}${gross_amount}${key}`;
  const signature_key = opts.badSignature
    ? "bad00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000"
    : sha512Hex(raw);

  return {
    order_id,
    status_code,
    gross_amount,
    signature_key,
    transaction_status: opts.transaction_status ?? "settlement",
    transaction_id: opts.transaction_id ?? `tx-${crypto.randomUUID()}`,
    fraud_status: opts.fraud_status ?? null,
    payment_type: opts.payment_type ?? "qris",
  };
}

const appWithKey = (serverKey: string = TEST_SERVER_KEY) =>
  createApp({ enableJobs: false, midtransServerKey: serverKey });

const orderRow = async (token: string) => (await db.select().from(orders).where(eq(orders.orderToken, token)))[0]!;
const variantRow = async (id: string) => (await db.select().from(productVariants).where(eq(productVariants.id, id)))[0]!;
const paymentRows = async (orderId: string) =>
  db.select().from(paymentTransactions).where(eq(paymentTransactions.orderId, orderId));
const logRows = async (orderId: string) =>
  db.select().from(orderStatusLogs).where(eq(orderStatusLogs.orderId, orderId)).orderBy(orderStatusLogs.createdAt);

afterAll(async () => {
  const testVariants = await db
    .select({ id: productVariants.id })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(like(products.slug, `${PREFIX}%`));
  const ids = testVariants.map((v) => v.id);
  if (ids.length) {
    const orderIds = await db
      .selectDistinct({ id: orderItems.orderId })
      .from(orderItems)
      .where(inArray(orderItems.productVariantId, ids));
    if (orderIds.length) {
      await db.delete(orders).where(inArray(orders.id, orderIds.map((o) => o.id)));
    }
  }
  await db.execute(
    sql`delete from addresses a where not exists (select 1 from orders o where o.address_id = a.id) and a.full_address = ${ADDRESS.full_address}`,
  );
  await db.delete(products).where(like(products.slug, `${PREFIX}%`));
  await db.delete(users).where(like(users.email, `${PREFIX}%`));
  await db.execute(sql`delete from processed_webhooks where event_id like 'tx-%'`);
});

// ---------- pengujian ----------

describe("signature.ts: verifyMidtransSignature", () => {
  test("server key kosong → console.error dan selalu return false langsung", () => {
    const payload = buildPayload({ order_id: "order-123", gross_amount: 500000, serverKey: "any" });
    const result = verifyMidtransSignature(payload, "");
    expect(result).toBe(false);
  });

  test("signature valid → return true", () => {
    const payload = buildPayload({ order_id: "order-123", gross_amount: "500000.00", serverKey: TEST_SERVER_KEY });
    const result = verifyMidtransSignature(payload, TEST_SERVER_KEY);
    expect(result).toBe(true);
  });

  test("payload diubah (tampering) → return false", () => {
    const payload = buildPayload({ order_id: "order-123", gross_amount: "500000.00", serverKey: TEST_SERVER_KEY });
    expect(verifyMidtransSignature({ ...payload, gross_amount: "100000.00" }, TEST_SERVER_KEY)).toBe(false);
    expect(verifyMidtransSignature({ ...payload, order_id: "order-999" }, TEST_SERVER_KEY)).toBe(false);
    expect(verifyMidtransSignature({ ...payload, status_code: "201" }, TEST_SERVER_KEY)).toBe(false);
  });
});

describe("POST /api/payment/webhook: validasi & signature", () => {
  test("signature salah → 401 INVALID_SIGNATURE, DB tidak berubah", async () => {
    const { token, totalAmount } = await makeConfirmedOrder();
    const payload = buildPayload({ order_id: token, gross_amount: totalAmount, badSignature: true });

    const app = appWithKey();
    const res = await app.handle(
      new Request("http://localhost/api/payment/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.code).toBe("INVALID_SIGNATURE");

    const order = await orderRow(token);
    expect(order.status).toBe("awaiting_payment");
  });

  test("server key kosong → selalu 401", async () => {
    const { token, totalAmount } = await makeConfirmedOrder();
    const payload = buildPayload({ order_id: token, gross_amount: totalAmount });

    const app = appWithKey(""); // empty key
    const res = await app.handle(
      new Request("http://localhost/api/payment/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.code).toBe("INVALID_SIGNATURE");
  });

  test("field wajib kurang / bukan string → 400 BAD_REQUEST", async () => {
    const app = appWithKey();
    const res = await app.handle(
      new Request("http://localhost/api/payment/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ order_id: "123" }), // field lain kurang
      }),
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("BAD_REQUEST");
  });

  test("order_id tidak ditemukan → 404 ORDER_NOT_FOUND", async () => {
    const payload = buildPayload({ order_id: "order-palsu-tidak-ada-di-db-12345", gross_amount: 100000 });
    const app = appWithKey();
    const res = await app.handle(
      new Request("http://localhost/api/payment/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.code).toBe("ORDER_NOT_FOUND");
  });

  test("gross_amount beda dari total_amount → 400 AMOUNT_MISMATCH, order tidak berubah", async () => {
    const { token, totalAmount } = await makeConfirmedOrder();
    const payload = buildPayload({ order_id: token, gross_amount: totalAmount + 50000 }); // beda harga

    const app = appWithKey();
    const res = await app.handle(
      new Request("http://localhost/api/payment/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );

    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe("AMOUNT_MISMATCH");

    const order = await orderRow(token);
    expect(order.status).toBe("awaiting_payment");
  });
});

describe("POST /api/payment/webhook: alur pembayaran & stok", () => {
  test("settlement valid → order paid, stock_reserved turun sebesar qty, stock_available tidak berubah", async () => {
    const { token, totalAmount, variantId, qty } = await makeConfirmedOrder({ qty: 2 });
    const beforeVariant = await variantRow(variantId);
    expect(beforeVariant.stockReserved).toBe(2);

    const payload = buildPayload({ order_id: token, gross_amount: totalAmount, transaction_status: "settlement" });
    const app = appWithKey();
    const res = await app.handle(
      new Request("http://localhost/api/payment/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.message).toBe("OK");

    const order = await orderRow(token);
    expect(order.status).toBe("paid");

    const afterVariant = await variantRow(variantId);
    expect(afterVariant.stockReserved).toBe(beforeVariant.stockReserved - qty);
    expect(afterVariant.stockAvailable).toBe(beforeVariant.stockAvailable);

    // Cek payment_transactions di-update
    const payments = await paymentRows(order.id);
    expect(payments.length).toBe(1);
    expect(payments[0]!.status).toBe("settlement");
    expect(payments[0]!.gatewayTransactionId).toBe(payload.transaction_id);

    // Cek order_status_logs
    const logs = await logRows(order.id);
    const lastLog = logs[logs.length - 1]!;
    expect(lastLog.fromStatus).toBe("awaiting_payment");
    expect(lastLog.toStatus).toBe("paid");
    expect(lastLog.actor).toBe("midtrans");
    expect(lastLog.note).toBe("Webhook: settlement");
  });

  test("capture + accept → order paid, stok di-commit", async () => {
    const { token, totalAmount, variantId, qty } = await makeConfirmedOrder({ qty: 1 });
    const beforeVariant = await variantRow(variantId);

    const payload = buildPayload({
      order_id: token,
      gross_amount: totalAmount,
      transaction_status: "capture",
      fraud_status: "accept",
    });

    const app = appWithKey();
    const res = await app.handle(
      new Request("http://localhost/api/payment/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );

    expect(res.status).toBe(200);
    const order = await orderRow(token);
    expect(order.status).toBe("paid");

    const afterVariant = await variantRow(variantId);
    expect(afterVariant.stockReserved).toBe(beforeVariant.stockReserved - qty);
  });

  test("capture + challenge → status dan stok tetap", async () => {
    const { token, totalAmount, variantId } = await makeConfirmedOrder({ qty: 1 });
    const beforeVariant = await variantRow(variantId);

    const payload = buildPayload({
      order_id: token,
      gross_amount: totalAmount,
      transaction_status: "capture",
      fraud_status: "challenge",
    });

    const app = appWithKey();
    const res = await app.handle(
      new Request("http://localhost/api/payment/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );

    expect(res.status).toBe(200);
    const order = await orderRow(token);
    expect(order.status).toBe("awaiting_payment");

    const afterVariant = await variantRow(variantId);
    expect(afterVariant.stockReserved).toBe(beforeVariant.stockReserved);
  });

  test("idempotency: payload yang sama dikirim 2x → diproses sekali, yang kedua 'Already processed'", async () => {
    const { token, totalAmount, variantId, qty } = await makeConfirmedOrder({ qty: 1 });
    const beforeVariant = await variantRow(variantId);

    const payload = buildPayload({ order_id: token, gross_amount: totalAmount, transaction_status: "settlement" });
    const app = appWithKey();

    // kirim pertama
    const res1 = await app.handle(
      new Request("http://localhost/api/payment/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );
    expect(res1.status).toBe(200);
    expect((await res1.json()).message).toBe("OK");

    // kirim kedua
    const res2 = await app.handle(
      new Request("http://localhost/api/payment/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );
    expect(res2.status).toBe(200);
    expect((await res2.json()).message).toBe("Already processed");

    // stok hanya berkurang sekali
    const afterVariant = await variantRow(variantId);
    expect(afterVariant.stockReserved).toBe(beforeVariant.stockReserved - qty);

    // log status midtrans hanya 1
    const order = await orderRow(token);
    const logs = await logRows(order.id);
    const midtransLogs = logs.filter((l) => l.actor === "midtrans");
    expect(midtransLogs.length).toBe(1);
  });

  test("pending lalu settlement (transaction_id sama) → keduanya tercatat, order akhirnya paid", async () => {
    const { token, totalAmount } = await makeConfirmedOrder();
    const txId = `tx-seq-${crypto.randomUUID().slice(0, 8)}`;
    const app = appWithKey();

    // 1. Pending
    const payloadPending = buildPayload({
      order_id: token,
      gross_amount: totalAmount,
      transaction_status: "pending",
      transaction_id: txId,
    });
    const res1 = await app.handle(
      new Request("http://localhost/api/payment/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadPending),
      }),
    );
    expect(res1.status).toBe(200);
    const orderAfterPending = await orderRow(token);
    expect(orderAfterPending.status).toBe("awaiting_payment");

    // 2. Settlement
    const payloadSettlement = buildPayload({
      order_id: token,
      gross_amount: totalAmount,
      transaction_status: "settlement",
      transaction_id: txId,
    });
    const res2 = await app.handle(
      new Request("http://localhost/api/payment/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadSettlement),
      }),
    );
    expect(res2.status).toBe(200);
    const orderAfterSettlement = await orderRow(token);
    expect(orderAfterSettlement.status).toBe("paid");

    const payments = await paymentRows(orderAfterSettlement.id);
    expect(payments.length).toBe(1);
    expect(payments[0]!.gatewayTransactionId).toBe(txId);
    expect(payments[0]!.status).toBe("settlement");
  });

  test("deny lalu settlement dengan transaction_id berbeda → order paid, stok tidak pernah dilepas, ada 2 baris payment_transactions", async () => {
    const { token, totalAmount, variantId, qty } = await makeConfirmedOrder({ qty: 1 });
    const beforeVariant = await variantRow(variantId);
    const app = appWithKey();

    // 1. Kartu pertama ditolak (deny)
    const payloadDeny = buildPayload({
      order_id: token,
      gross_amount: totalAmount,
      transaction_status: "deny",
      transaction_id: `tx-card-1-${crypto.randomUUID().slice(0, 6)}`,
    });
    const resDeny = await app.handle(
      new Request("http://localhost/api/payment/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadDeny),
      }),
    );
    expect(resDeny.status).toBe(200);

    const orderAfterDeny = await orderRow(token);
    expect(orderAfterDeny.status).toBe("awaiting_payment");
    // Stok tidak boleh dilepas saat deny!
    const variantAfterDeny = await variantRow(variantId);
    expect(variantAfterDeny.stockReserved).toBe(beforeVariant.stockReserved);

    // 2. Kartu kedua berhasil (settlement)
    const payloadSettle = buildPayload({
      order_id: token,
      gross_amount: totalAmount,
      transaction_status: "settlement",
      transaction_id: `tx-card-2-${crypto.randomUUID().slice(0, 6)}`,
    });
    const resSettle = await app.handle(
      new Request("http://localhost/api/payment/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadSettle),
      }),
    );
    expect(resSettle.status).toBe(200);

    const orderFinal = await orderRow(token);
    expect(orderFinal.status).toBe("paid");

    // Stok berhasil di-commit
    const variantFinal = await variantRow(variantId);
    expect(variantFinal.stockReserved).toBe(beforeVariant.stockReserved - qty);

    // Harus ada 2 baris payment_transactions
    const payments = await paymentRows(orderFinal.id);
    expect(payments.length).toBe(2);
    const statuses = payments.map((p) => p.status).sort();
    expect(statuses).toEqual(["deny", "settlement"]);
  });

  test("settlement lalu expire → order tetap paid (transisi tidak boleh)", async () => {
    const { token, totalAmount } = await makeConfirmedOrder();
    const app = appWithKey();

    // 1. Settlement
    const payloadSettle = buildPayload({
      order_id: token,
      gross_amount: totalAmount,
      transaction_status: "settlement",
      transaction_id: `tx-1-${crypto.randomUUID().slice(0, 6)}`,
    });
    await app.handle(
      new Request("http://localhost/api/payment/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadSettle),
      }),
    );

    // 2. Expire datang belakangan
    const payloadExpire = buildPayload({
      order_id: token,
      gross_amount: totalAmount,
      transaction_status: "expire",
      transaction_id: `tx-2-${crypto.randomUUID().slice(0, 6)}`,
    });
    const resExpire = await app.handle(
      new Request("http://localhost/api/payment/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadExpire),
      }),
    );
    expect(resExpire.status).toBe(200);

    const order = await orderRow(token);
    expect(order.status).toBe("paid"); // tetap paid!
  });

  test("expire → order expired, reserved_until null, stok kembali ke available", async () => {
    const { token, totalAmount, variantId, qty } = await makeConfirmedOrder({ qty: 2 });
    const beforeVariant = await variantRow(variantId);
    expect(beforeVariant.stockReserved).toBe(2);

    const payload = buildPayload({ order_id: token, gross_amount: totalAmount, transaction_status: "expire" });
    const app = appWithKey();
    const res = await app.handle(
      new Request("http://localhost/api/payment/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );

    expect(res.status).toBe(200);
    const order = await orderRow(token);
    expect(order.status).toBe("expired");
    expect(order.reservedUntil).toBeNull();

    // Stok kembali ke available
    const afterVariant = await variantRow(variantId);
    expect(afterVariant.stockAvailable).toBe(beforeVariant.stockAvailable + qty);
    expect(afterVariant.stockReserved).toBe(beforeVariant.stockReserved - qty);
  });

  test("cancel → order cancelled, reserved_until null, stok kembali ke available", async () => {
    const { token, totalAmount, variantId, qty } = await makeConfirmedOrder({ qty: 1 });
    const beforeVariant = await variantRow(variantId);

    const payload = buildPayload({ order_id: token, gross_amount: totalAmount, transaction_status: "cancel" });
    const app = appWithKey();
    const res = await app.handle(
      new Request("http://localhost/api/payment/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );

    expect(res.status).toBe(200);
    const order = await orderRow(token);
    expect(order.status).toBe("cancelled");
    expect(order.reservedUntil).toBeNull();

    const afterVariant = await variantRow(variantId);
    expect(afterVariant.stockAvailable).toBe(beforeVariant.stockAvailable + qty);
    expect(afterVariant.stockReserved).toBe(beforeVariant.stockReserved - qty);
  });

  test("refund setelah paid → order refunded", async () => {
    const { token, totalAmount } = await makeConfirmedOrder();
    const app = appWithKey();

    // 1. Paid
    const payloadSettle = buildPayload({
      order_id: token,
      gross_amount: totalAmount,
      transaction_status: "settlement",
    });
    await app.handle(
      new Request("http://localhost/api/payment/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadSettle),
      }),
    );

    // 2. Refund
    const payloadRefund = buildPayload({
      order_id: token,
      gross_amount: totalAmount,
      transaction_status: "refund",
      transaction_id: `tx-ref-${crypto.randomUUID().slice(0, 6)}`,
    });
    const res = await app.handle(
      new Request("http://localhost/api/payment/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadRefund),
      }),
    );
    expect(res.status).toBe(200);

    const order = await orderRow(token);
    expect(order.status).toBe("refunded");
  });

  test("kasus khusus: order expired lalu datang settlement → tidak ubah order (perlu refund manual)", async () => {
    const { token, totalAmount, variantId } = await makeConfirmedOrder();
    const app = appWithKey();

    // 1. Expire
    const payloadExpire = buildPayload({
      order_id: token,
      gross_amount: totalAmount,
      transaction_status: "expire",
    });
    await app.handle(
      new Request("http://localhost/api/payment/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadExpire),
      }),
    );

    const orderExpired = await orderRow(token);
    expect(orderExpired.status).toBe("expired");
    const variantAfterExpire = await variantRow(variantId);

    // 2. Settlement datang setelah order expired
    const payloadSettle = buildPayload({
      order_id: token,
      gross_amount: totalAmount,
      transaction_status: "settlement",
      transaction_id: `tx-late-${crypto.randomUUID().slice(0, 6)}`,
    });
    const resSettle = await app.handle(
      new Request("http://localhost/api/payment/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadSettle),
      }),
    );
    expect(resSettle.status).toBe(200);

    const orderFinal = await orderRow(token);
    expect(orderFinal.status).toBe("expired"); // status tidak berubah jadi paid!

    const variantFinal = await variantRow(variantId);
    expect(variantFinal.stockAvailable).toBe(variantAfterExpire.stockAvailable); // stok tidak berubah lagi
  });

  test("order milik user login menjadi paid → varian yang dibeli hilang dari cart_items user, varian lain tetap ada", async () => {
    const user = await makeUser("pembeli-keranjang");
    const variantBought = await makeVariant({ price: 1_000_000, name: "Varian Dibeli" });
    const variantKept = await makeVariant({ price: 500_000, name: "Varian Ditinggal" });

    // Masukkan kedua varian ke cart_items user
    await db.insert(cartItems).values([
      { userId: user.id, productVariantId: variantBought.id, qty: 1 },
      { userId: user.id, productVariantId: variantKept.id, qty: 2 },
    ]);

    // Beli hanya variantBought
    const created = await init([{ product_variant_id: variantBought.id, qty: 1 }], user.id);
    const { options } = await quoteShipping({ order_token: created.order_token, address: ADDRESS }, user.id);
    const confirmed = await confirm(
      {
        order_token: created.order_token,
        contact: { email: user.email, phone: "081234567890" },
        shipping: { courier: options[0]!.courier },
        payment_method: "qris",
      },
      user.id,
      fakeMidtransDeps,
    );

    // Webhook settlement
    const payload = buildPayload({
      order_id: created.order_token,
      gross_amount: confirmed.total_amount,
      transaction_status: "settlement",
    });
    const app = appWithKey();
    const res = await app.handle(
      new Request("http://localhost/api/payment/webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      }),
    );
    expect(res.status).toBe(200);

    // Cek cart_items user
    const remainingCart = await db.select().from(cartItems).where(eq(cartItems.userId, user.id));
    expect(remainingCart.length).toBe(1);
    expect(remainingCart[0]!.productVariantId).toBe(variantKept.id);
    expect(remainingCart[0]!.qty).toBe(2);
  });
});
