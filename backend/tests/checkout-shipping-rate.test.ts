import { afterAll, describe, expect, test } from "bun:test";
import { count, eq, inArray, like, sql } from "drizzle-orm";
import { Elysia } from "elysia";
import { createApp } from "../src/app";
import { db } from "../src/db/client";
import { addresses, orderItems, orders, productVariants, products, shippingQuotes, userAddresses, users } from "../src/db/schema";
import { jwtPlugin, signAccessToken } from "../src/modules/auth/tokens";
import { MAX_ADDRESSES } from "../src/modules/account/addresses.service";
import { availableDeliveryDates } from "../src/modules/checkout/checkout.service";
import { init } from "../src/modules/checkout/stock-reservation.service";

const PREFIX = "csr-";

type Json = Record<string, any>;
type TestUser = { id: string; token: string };

async function makeVariant(weightKg = "8") {
  const [product] = await db
    .insert(products)
    .values({ name: "Kursi Uji", slug: `${PREFIX}${crypto.randomUUID().slice(0, 10)}`, category: "chairs", weightKg, status: "active" })
    .returning();
  const [variant] = await db
    .insert(productVariants)
    .values({
      productId: product!.id,
      material: "Jati",
      sku: `CSR${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
      priceIdr: 1_000_000,
      priceUsd: "62.5",
      stockAvailable: 50,
      imageUrls: [],
    })
    .returning();
  return variant!;
}

const signer = new Elysia().use(jwtPlugin).get("/sign/:id", ({ jwt, params }) => signAccessToken(jwt, { id: params.id }));
async function makeUser(label: string): Promise<TestUser> {
  const [user] = await db
    .insert(users)
    .values({ email: `${PREFIX}${label}-${crypto.randomUUID().slice(0, 8)}@contoh.com`, name: label })
    .returning();
  const token = await (await signer.handle(new Request(`http://localhost/sign/${user!.id}`))).text();
  return { id: user!.id, token };
}

/** Order draft lewat service init (stok ikut ditahan). */
async function makeOrder(opts: { weightKg?: string; qty?: number; userId?: string | null } = {}) {
  const v = await makeVariant(opts.weightKg);
  const result = await init([{ product_variant_id: v.id, qty: opts.qty ?? 1 }], opts.userId ?? null);
  return { token: result.order_token, variantId: v.id };
}

function http() {
  const app = createApp({ enableJobs: false });
  return async (body: Json, token?: string) => {
    const res = await app.handle(
      new Request("http://localhost/api/checkout/shipping-rate", {
        method: "POST",
        headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify(body),
      }),
    );
    return { res, body: (await res.json().catch(() => null)) as Json | null };
  };
}

const jakarta = {
  full_address: "Jl. Merdeka No. 1",
  recipient_name: "Budi",
  phone: "081234567890",
  city: "Jakarta Selatan",
  province: "DKI Jakarta",
  postal_code: "12110",
};

const orderOf = async (token: string) => (await db.select().from(orders).where(eq(orders.orderToken, token)))[0]!;
const quotesOf = async (orderId: string) => db.select().from(shippingQuotes).where(eq(shippingQuotes.orderId, orderId));

async function makeSavedAddress(userId: string, over: Partial<typeof userAddresses.$inferInsert> = {}) {
  const [row] = await db
    .insert(userAddresses)
    .values({
      userId,
      label: "Rumah",
      recipientName: "Siti",
      phone: "081111111111",
      fullAddress: "Jl. Tersimpan No. 5",
      city: "Bandung",
      province: "Jawa Barat",
      ...over,
    })
    .returning();
  return row!;
}

afterAll(async () => {
  const testVariants = await db
    .select({ id: productVariants.id })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(like(products.slug, `${PREFIX}%`));
  const ids = testVariants.map((v) => v.id);
  if (ids.length) {
    const orderIds = (await db.selectDistinct({ id: orderItems.orderId }).from(orderItems).where(inArray(orderItems.productVariantId, ids))).map((o) => o.id);
    if (orderIds.length) {
      const addressIds = (await db.select({ id: orders.addressId }).from(orders).where(inArray(orders.id, orderIds)))
        .map((o) => o.id)
        .filter((id): id is string => id !== null);
      await db.delete(orders).where(inArray(orders.id, orderIds)); // item, quote, log ikut terhapus
      if (addressIds.length) await db.delete(addresses).where(inArray(addresses.id, addressIds));
    }
  }
  await db.delete(products).where(like(products.slug, `${PREFIX}%`));
  await db.delete(users).where(like(users.email, `${PREFIX}%`)); // buku alamat ikut terhapus
});

describe("shipping-rate: alamat baru", () => {
  test("1 kursi 8 kg ke Jakarta Selatan → JTR Reguler 66.000 dan alamat order tersimpan", async () => {
    const { token } = await makeOrder();
    const { res, body } = await http()({ order_token: token, address: jakarta });

    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(body!.options[0]).toEqual({ courier: "jne_trucking", service_name: "JTR Reguler", price: 66_000, eta_days: "2-3 hari" });
    expect(body!.options).toHaveLength(3);

    const order = await orderOf(token);
    const [address] = await db.select().from(addresses).where(eq(addresses.id, order.addressId!));
    expect(address).toMatchObject({ fullAddress: "Jl. Merdeka No. 1", city: "Jakarta Selatan", country: "ID" });
    const quotes = await quotesOf(order.id);
    expect(quotes).toHaveLength(3);
    expect(quotes.find((q) => q.courier === "jne_trucking")!.price).toBe(66_000);
  });

  test("sama dengan POST /api/shipping/estimate untuk barang dan alamat yang sama", async () => {
    const { token, variantId } = await makeOrder();
    const { body } = await http()({ order_token: token, address: jakarta });

    const app = createApp({ enableJobs: false });
    const est = await app.handle(
      new Request("http://localhost/api/shipping/estimate", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ items: [{ product_variant_id: variantId, qty: 1 }], city: "Jakarta Selatan", province: "DKI Jakarta" }),
      }),
    );
    expect(est.status).toBe(200);
    const estimate = (await est.json()) as Json;
    expect(estimate.options.map((o: Json) => o.price)).toEqual(body!.options.map((o: Json) => o.price));
  });

  test("berat dihitung dari qty × weight_kg (desimal)", async () => {
    const { token } = await makeOrder({ weightKg: "2.5", qty: 3 }); // 7.5 kg → 50.000 + ceil(7.5 × 2.000)
    const { body } = await http()({ order_token: token, address: jakarta });
    expect(body!.options[0].price).toBe(65_000);
  });

  test("dipanggil dua kali → quote tidak menumpuk, alamat lama diganti", async () => {
    const { token } = await makeOrder();
    const call = http();
    await call({ order_token: token, address: jakarta });
    const first = await orderOf(token);
    const { body } = await call({ order_token: token, address: { ...jakarta, city: "Bandung", province: "Jawa Barat" } });

    expect(body!.options[0].price).toBe(75_000 + 3_000 * 8); // zona 2
    const second = await orderOf(token);
    expect(second.addressId).not.toBe(first.addressId);
    expect(await quotesOf(second.id)).toHaveLength(3);
    expect((await db.select({ n: count() }).from(addresses).where(eq(addresses.id, first.addressId!)))[0]!.n).toBe(0);
  });

  test("dua pemanggilan bersamaan → tetap tepat 3 quote", async () => {
    const { token } = await makeOrder();
    const call = http();
    await Promise.all([call({ order_token: token, address: jakarta }), call({ order_token: token, address: jakarta })]);
    expect(await quotesOf((await orderOf(token)).id)).toHaveLength(3);
  });

  test("request lama frontend (hanya full_address, tanpa login) tetap berhasil", async () => {
    const { token } = await makeOrder();
    const { res, body } = await http()({ order_token: token, address: { full_address: "Jl. Apa Saja" } });
    expect(res.status).toBe(200);
    expect(body!.options[0].price).toBe(200_000 + 12_000 * 8); // kota/provinsi kosong → zona 5
  });

  test("available_delivery_dates: 7 tanggal berurutan mulai besok", async () => {
    const { token } = await makeOrder();
    const { body } = await http()({ order_token: token, address: jakarta });
    expect(body!.available_delivery_dates).toHaveLength(7);
    expect(body!.available_delivery_dates).toEqual(availableDeliveryDates());
  });
});

describe("availableDeliveryDates (zona Asia/Jakarta)", () => {
  test("06.00 WIB masih tanggal kemarin di UTC → H+1 tetap menurut tanggal Jakarta", () => {
    // 2026-10-01 23:00 UTC = 2026-10-02 06:00 WIB
    const dates = availableDeliveryDates(new Date("2026-10-01T23:00:00Z"));
    expect(dates[0]).toBe("2026-10-03");
    expect(dates[6]).toBe("2026-10-09");
  });

  test("lewat pergantian bulan", () => {
    const dates = availableDeliveryDates(new Date("2026-10-28T05:00:00Z"));
    expect(dates).toEqual(["2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"]);
  });
});

describe("shipping-rate: alamat tersimpan", () => {
  test("address_id → salinan di addresses; mengedit alamat tersimpan tidak mengubah alamat order", async () => {
    const user = await makeUser("copy");
    const saved = await makeSavedAddress(user.id);
    const { token } = await makeOrder({ userId: user.id });

    const { res, body } = await http()({ order_token: token, address_id: saved.id }, user.token);
    expect(res.status).toBe(200);
    expect(body!.options[0].price).toBe(75_000 + 3_000 * 8); // Bandung → zona 2

    const order = await orderOf(token);
    expect(order.addressId).not.toBe(saved.id);
    const [copy] = await db.select().from(addresses).where(eq(addresses.id, order.addressId!));
    expect(copy).toMatchObject({ fullAddress: "Jl. Tersimpan No. 5", recipientName: "Siti", city: "Bandung" });

    await db.update(userAddresses).set({ fullAddress: "Jl. Sudah Diedit" }).where(eq(userAddresses.id, saved.id));
    const [after] = await db.select().from(addresses).where(eq(addresses.id, order.addressId!));
    expect(after!.fullAddress).toBe("Jl. Tersimpan No. 5");
  });

  test("address_id milik user lain → 404 ADDRESS_NOT_FOUND", async () => {
    const owner = await makeUser("owner");
    const other = await makeUser("other");
    const saved = await makeSavedAddress(owner.id);
    const { token } = await makeOrder({ userId: other.id });

    const { res, body } = await http()({ order_token: token, address_id: saved.id }, other.token);
    expect(res.status).toBe(404);
    expect(body!.code).toBe("ADDRESS_NOT_FOUND");
    expect((await orderOf(token)).addressId).toBeNull();
  });

  test("address_id tanpa login → 401", async () => {
    const user = await makeUser("noauth");
    const saved = await makeSavedAddress(user.id);
    const { token } = await makeOrder();
    const { res, body } = await http()({ order_token: token, address_id: saved.id });
    expect(res.status).toBe(401);
    expect(body!.code).toBe("UNAUTHORIZED");
  });
});

describe("shipping-rate: save_address", () => {
  test("save_address: true saat login → alamat masuk buku alamat dengan label Alamat", async () => {
    const user = await makeUser("save");
    const { token } = await makeOrder({ userId: user.id });
    const { res } = await http()({ order_token: token, address: jakarta, save_address: true }, user.token);
    expect(res.status).toBe(200);

    const book = await db.select().from(userAddresses).where(eq(userAddresses.userId, user.id));
    expect(book).toHaveLength(1);
    expect(book[0]).toMatchObject({ label: "Alamat", fullAddress: "Jl. Merdeka No. 1", isDefault: true });
  });

  test("save_address: true tanpa login → 401", async () => {
    const { token } = await makeOrder();
    const { res, body } = await http()({ order_token: token, address: jakarta, save_address: true });
    expect(res.status).toBe(401);
    expect(body!.code).toBe("UNAUTHORIZED");
  });

  test("buku alamat penuh → checkout tetap lanjut, alamat tidak disimpan", async () => {
    const user = await makeUser("full");
    await db.insert(userAddresses).values(
      Array.from({ length: MAX_ADDRESSES }, (_, i) => ({
        userId: user.id,
        label: `A${i}`,
        recipientName: "X",
        phone: "081111111111",
        fullAddress: `Jl. Penuh ${i}`,
        isDefault: i === 0,
      })),
    );
    const { token } = await makeOrder({ userId: user.id });
    const { res } = await http()({ order_token: token, address: jakarta, save_address: true }, user.token);
    expect(res.status).toBe(200);
    expect((await db.select({ n: count() }).from(userAddresses).where(eq(userAddresses.userId, user.id)))[0]!.n).toBe(MAX_ADDRESSES);
    expect((await orderOf(token)).addressId).not.toBeNull();
  });

  test("alamat yang tidak lolos aturan buku alamat + save_address → 422 dan tidak ada perubahan", async () => {
    const user = await makeUser("badsave");
    const { token } = await makeOrder({ userId: user.id });
    const { res } = await http()({ order_token: token, address: { full_address: "Jl. Tanpa Telepon" }, save_address: true }, user.token);
    expect(res.status).toBe(422);
    expect((await orderOf(token)).addressId).toBeNull();
  });
});

describe("shipping-rate: validasi dan kepemilikan order", () => {
  test("address dan address_id sama-sama ada → 422", async () => {
    const user = await makeUser("both");
    const saved = await makeSavedAddress(user.id);
    const { token } = await makeOrder({ userId: user.id });
    const { res, body } = await http()({ order_token: token, address: jakarta, address_id: saved.id }, user.token);
    expect(res.status).toBe(422);
    expect(body!.code).toBe("VALIDATION_FAILED");
  });

  test("keduanya kosong → 422", async () => {
    const { token } = await makeOrder();
    const { res, body } = await http()({ order_token: token });
    expect(res.status).toBe(422);
    expect(body!.code).toBe("VALIDATION_FAILED");
  });

  test("address tanpa full_address → 422", async () => {
    const { token } = await makeOrder();
    const { res } = await http()({ order_token: token, address: { city: "Bandung" } });
    expect(res.status).toBe(422);
  });

  test("field alamat melebihi panjang kolom → 422", async () => {
    const { token } = await makeOrder();
    const { res } = await http()({ order_token: token, address: { ...jakarta, city: "x".repeat(81) } });
    expect(res.status).toBe(422);
  });

  test("order_token tidak dikenal → 404 ORDER_NOT_FOUND", async () => {
    const { res, body } = await http()({ order_token: "tidak-ada", address: jakarta });
    expect(res.status).toBe(404);
    expect(body!.code).toBe("ORDER_NOT_FOUND");
  });

  test("order bukan draft → 404", async () => {
    const { token } = await makeOrder();
    await db.update(orders).set({ status: "awaiting_payment" }).where(eq(orders.orderToken, token));
    const { res, body } = await http()({ order_token: token, address: jakarta });
    expect(res.status).toBe(404);
    expect(body!.code).toBe("ORDER_NOT_FOUND");
  });

  test("order milik user lain → 404 (juga untuk tamu)", async () => {
    const owner = await makeUser("ord-owner");
    const other = await makeUser("ord-other");
    const { token } = await makeOrder({ userId: owner.id });

    expect((await http()({ order_token: token, address: jakarta }, other.token)).res.status).toBe(404);
    expect((await http()({ order_token: token, address: jakarta })).res.status).toBe(404);
    expect((await http()({ order_token: token, address: jakarta }, owner.token)).res.status).toBe(200);
  });

  test("order tamu bisa dipakai pemilik token walau sedang login", async () => {
    const user = await makeUser("guest-order");
    const { token } = await makeOrder();
    expect((await http()({ order_token: token, address: jakarta }, user.token)).res.status).toBe(200);
  });

  test("reservasi lewat → 410 RESERVATION_EXPIRED, tidak ada yang tersimpan", async () => {
    const { token } = await makeOrder();
    await db.update(orders).set({ reservedUntil: sql`now() - interval '1 minute'` }).where(eq(orders.orderToken, token));
    const { res, body } = await http()({ order_token: token, address: jakarta });
    expect(res.status).toBe(410);
    expect(body!.code).toBe("RESERVATION_EXPIRED");
    const order = await orderOf(token);
    expect(order.addressId).toBeNull();
    expect(await quotesOf(order.id)).toHaveLength(0);
  });
});
