import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { eq, like } from "drizzle-orm";
import { createApp } from "../src/app";
import { db } from "../src/db/client";
import { cartItems, productVariants, products, users } from "../src/db/schema";

const app = createApp({ enableJobs: false });
const SLUG_PREFIX = "carttest-";
const EMAIL_PREFIX = "carttest-";

type Json = Record<string, any>;

async function api(method: string, path: string, token?: string, body?: unknown) {
  const res = await app.handle(
    new Request(`http://localhost/api${path}`, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  );
  return { res, body: (await res.json().catch(() => null)) as Json | null };
}

async function register(label: string) {
  const { body } = await api("POST", "/auth/register", undefined, {
    email: `${EMAIL_PREFIX}${label}-${crypto.randomUUID().slice(0, 8)}@contoh.com`,
    password: "password-rahasia",
    name: label,
  });
  return { token: body!.access_token as string, id: body!.user.id as string };
}

const put = (token: string, variantId: string, qty: unknown) => api("PUT", `/cart/items/${variantId}`, token, { qty });

let alice: { token: string; id: string };
let bob: { token: string; id: string };
// produk uji: 2 varian + (51 varian di produk lain untuk uji batas)
let chair: { id: string; productId: string }; // harga 1.000.000, stok 10
let table: { id: string }; // harga 2.500.000, stok 3
let many: string[] = [];

async function createProduct(name: string, status = "active") {
  const [row] = await db
    .insert(products)
    .values({ name, slug: `${SLUG_PREFIX}${crypto.randomUUID().slice(0, 8)}`, category: "chairs", weightKg: "5", status })
    .returning();
  return row!;
}

beforeAll(async () => {
  alice = await register("alice");
  bob = await register("bob");

  const p1 = await createProduct("Kursi Uji");
  const [v1] = await db
    .insert(productVariants)
    .values({ productId: p1.id, material: "Jati", priceIdr: 1_000_000, priceUsd: "62.5", stockAvailable: 10, imageUrls: ["/images/uji.jpg"] })
    .returning();
  chair = { id: v1!.id, productId: p1.id };

  const [v2] = await db
    .insert(productVariants)
    .values({ productId: p1.id, material: "Mahoni", priceIdr: 2_500_000, priceUsd: "156.25", stockAvailable: 3 })
    .returning();
  table = { id: v2!.id };

  const p2 = await createProduct("Banyak Varian");
  const rows = await db
    .insert(productVariants)
    .values(Array.from({ length: 52 }, (_, i) => ({ productId: p2.id, material: `v${i}`, priceIdr: 1000, priceUsd: "1", stockAvailable: 5 })))
    .returning({ id: productVariants.id });
  many = rows.map((r) => r.id);
});

afterAll(async () => {
  // varian dan baris keranjang ikut terhapus (ON DELETE CASCADE)
  await db.delete(products).where(like(products.slug, `${SLUG_PREFIX}%`));
  await db.delete(users).where(like(users.email, `${EMAIL_PREFIX}%`));
});

describe("autentikasi", () => {
  test("semua endpoint keranjang tanpa token → 401", async () => {
    for (const [method, path, body] of [
      ["GET", "/cart", undefined],
      ["PUT", `/cart/items/${chair.id}`, { qty: 1 }],
      ["DELETE", `/cart/items/${chair.id}`, undefined],
    ] as const) {
      const { res, body: json } = await api(method, path, undefined, body);
      expect(res.status, `${method} ${path}`).toBe(401);
      expect(json!.code).toBe("UNAUTHORIZED");
    }
  });

  test("token sampah → 401", async () => {
    expect((await api("GET", "/cart", "bukan.jwt.valid")).res.status).toBe(401);
  });

  test("POST /cart/merge tidak ada (404)", async () => {
    const { res } = await api("POST", "/cart/merge", alice.token, { items: [] });
    expect(res.status).toBe(404);
  });
});

describe("GET /api/cart", () => {
  test("keranjang kosong, dan response tidak boleh di-cache bersama", async () => {
    const { res, body } = await api("GET", "/cart", alice.token);
    expect(res.status).toBe(200);
    expect(body).toEqual({ data: { items: [], subtotal_amount: 0, item_count: 0 } });
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("PUT /api/cart/items/:variantId", () => {
  test("qty 2 lalu qty 5 → satu baris dengan qty 5; diulang tetap 5 (idempoten)", async () => {
    await put(alice.token, chair.id, 2);
    const second = await put(alice.token, chair.id, 5);
    expect(second.res.status).toBe(200);
    expect(second.body!.data.items).toHaveLength(1);
    expect(second.body!.data.items[0].qty).toBe(5);

    const again = await put(alice.token, chair.id, 5);
    expect(again.body!.data.items).toHaveLength(1);
    expect(again.body!.data.items[0].qty).toBe(5);
    expect(again.res.headers.get("cache-control")).toBe("private, no-store");
  });

  test("bentuk item: harga dari database, subtotal, foto, subtotal_amount dan item_count", async () => {
    await api("DELETE", `/cart/items/${chair.id}`, alice.token);
    await put(alice.token, chair.id, 2);
    const { body } = await put(alice.token, table.id, 1);
    const cart = body!.data;

    expect(cart.items[0]).toMatchObject({
      product_variant_id: chair.id,
      qty: 2,
      product: { slug: expect.stringContaining(SLUG_PREFIX), name: "Kursi Uji" },
      material: "Jati",
      unit_price: 1_000_000,
      subtotal: 2_000_000,
      image_url: "/images/uji.jpg",
      stock_available: 10,
      is_available: true,
    });
    expect(cart.items[1].image_url).toBeNull();
    // urutan: yang lebih dulu ditambah di atas
    expect(cart.items.map((i: Json) => i.product_variant_id)).toEqual([chair.id, table.id]);
    expect(cart.subtotal_amount).toBe(2_000_000 + 2_500_000);
    expect(cart.item_count).toBe(3);
    // keranjang tidak menyimpan harga/stok internal lain
    expect(JSON.stringify(body)).not.toContain("stock_reserved");
  });

  test("qty 0 menghapus baris (juga untuk varian yang tidak ada)", async () => {
    const { body } = await put(alice.token, table.id, 0);
    expect(body!.data.items.map((i: Json) => i.product_variant_id)).toEqual([chair.id]);

    const ghost = await put(alice.token, crypto.randomUUID(), 0);
    expect(ghost.res.status).toBe(200);
  });

  test("varian tidak ada / produk non-aktif → 422 VARIANT_NOT_FOUND", async () => {
    const unknown = await put(alice.token, crypto.randomUUID(), 1);
    expect(unknown.res.status).toBe(422);
    expect(unknown.body!.code).toBe("VARIANT_NOT_FOUND");

    const inactive = await createProduct("Nonaktif", "inactive");
    const [v] = await db
      .insert(productVariants)
      .values({ productId: inactive.id, priceIdr: 1000, priceUsd: "1", stockAvailable: 1 })
      .returning();
    const res = await put(alice.token, v!.id, 1);
    expect(res.res.status).toBe(422);
    expect(res.body!.code).toBe("VARIANT_NOT_FOUND");
  });

  test("validasi: qty -1 / 100 / pecahan / teks bukan angka, variantId bukan UUID → 422 VALIDATION_FAILED", async () => {
    // catatan: Elysia mengubah teks angka ("2") menjadi angka untuk t.Integer; itu perilaku framework, bukan celah
    for (const qty of [-1, 100, 1.5, "dua", null]) {
      const { res, body } = await put(alice.token, chair.id, qty);
      expect(res.status, `qty ${qty}`).toBe(422);
      expect(body!.code).toBe("VALIDATION_FAILED");
    }
    const { res, body } = await api("PUT", "/cart/items/bukan-uuid", alice.token, { qty: 1 });
    expect(res.status).toBe(422);
    expect(body!.code).toBe("VALIDATION_FAILED");
    expect((await api("PUT", `/cart/items/${chair.id}`, alice.token, {})).res.status).toBe(422);
  });

  test("qty melebihi stok diizinkan, tapi is_available false dan tidak masuk subtotal_amount", async () => {
    await api("DELETE", `/cart/items/${chair.id}`, bob.token);
    await put(bob.token, chair.id, 1); // stok 10, tersedia: 1.000.000
    const { res, body } = await put(bob.token, table.id, 4); // stok 3 < 4
    expect(res.status).toBe(200);

    const unavailable = body!.data.items.find((i: Json) => i.product_variant_id === table.id);
    expect(unavailable).toMatchObject({ qty: 4, stock_available: 3, is_available: false });
    expect(body!.data.subtotal_amount).toBe(1_000_000);
    expect(body!.data.item_count).toBe(5); // jumlah semua qty, termasuk yang tidak tersedia
  });
});

describe("DELETE /api/cart/items/:variantId", () => {
  test("menghapus barang; barang yang tidak ada di keranjang tetap 200 dengan keranjang lengkap", async () => {
    await put(alice.token, table.id, 1);
    const removed = await api("DELETE", `/cart/items/${table.id}`, alice.token);
    expect(removed.res.status).toBe(200);
    expect(removed.body!.data.items.map((i: Json) => i.product_variant_id)).toEqual([chair.id]);

    const again = await api("DELETE", `/cart/items/${table.id}`, alice.token);
    expect(again.res.status).toBe(200);
    expect(again.body!.data.items).toHaveLength(1);
  });
});

describe("data berubah di database", () => {
  test("harga diubah → GET /cart langsung menampilkan harga baru", async () => {
    await put(alice.token, chair.id, 2);
    await db.update(productVariants).set({ priceIdr: 1_500_000 }).where(eq(productVariants.id, chair.id));
    try {
      const { body } = await api("GET", "/cart", alice.token);
      const item = body!.data.items.find((i: Json) => i.product_variant_id === chair.id);
      expect(item.unit_price).toBe(1_500_000);
      expect(item.subtotal).toBe(3_000_000);
    } finally {
      await db.update(productVariants).set({ priceIdr: 1_000_000 }).where(eq(productVariants.id, chair.id));
    }
  });

  test("stok turun di bawah qty → is_available false; produk dinonaktifkan → is_available false", async () => {
    await db.update(productVariants).set({ stockAvailable: 1 }).where(eq(productVariants.id, chair.id));
    try {
      const low = (await api("GET", "/cart", alice.token)).body!.data.items.find((i: Json) => i.product_variant_id === chair.id);
      expect(low.is_available).toBe(false);
    } finally {
      await db.update(productVariants).set({ stockAvailable: 10 }).where(eq(productVariants.id, chair.id));
    }

    await db.update(products).set({ status: "inactive" }).where(eq(products.id, chair.productId));
    try {
      const { body } = await api("GET", "/cart", alice.token);
      const dead = body!.data.items.find((i: Json) => i.product_variant_id === chair.id);
      expect(dead).toBeDefined(); // tetap ditampilkan supaya user tahu
      expect(dead.is_available).toBe(false);
      expect(body!.data.subtotal_amount).toBe(0);
    } finally {
      await db.update(products).set({ status: "active" }).where(eq(products.id, chair.productId));
    }
  });
});

describe("isolasi antar user", () => {
  test("user B tidak melihat, mengubah, atau menghapus keranjang user A", async () => {
    const carol = await register("carol");
    const dave = await register("dave");
    await put(carol.token, chair.id, 3);

    // B tidak melihatnya
    expect((await api("GET", "/cart", dave.token)).body!.data.items).toEqual([]);

    // B memakai variantId yang sama: hanya mengubah keranjangnya sendiri
    await put(dave.token, chair.id, 7);
    await api("DELETE", `/cart/items/${chair.id}`, dave.token);

    const carolCart = (await api("GET", "/cart", carol.token)).body!.data;
    expect(carolCart.items).toHaveLength(1);
    expect(carolCart.items[0].qty).toBe(3);

    // user_id tidak bisa dititipkan lewat body
    const sneaky = await api("PUT", `/cart/items/${chair.id}`, dave.token, { qty: 9, user_id: carol.id });
    expect(sneaky.res.status).toBe(200);
    expect((await api("GET", "/cart", carol.token)).body!.data.items[0].qty).toBe(3);
  });
});

describe("batas 50 jenis barang", () => {
  test("baris ke-51 ditolak CART_LIMIT_REACHED; mengubah baris lama dan menambah setelah menghapus tetap boleh", async () => {
    const erin = await register("erin");
    for (const id of many.slice(0, 50)) {
      expect((await put(erin.token, id, 1)).res.status).toBe(200);
    }

    const over = await put(erin.token, many[50]!, 1);
    expect(over.res.status).toBe(422);
    expect(over.body!.code).toBe("CART_LIMIT_REACHED");

    // mengubah qty baris yang sudah ada tidak terkena batas
    const update = await put(erin.token, many[0]!, 9);
    expect(update.res.status).toBe(200);
    expect(update.body!.data.items).toHaveLength(50);

    // hapus satu, lalu baris baru boleh masuk lagi
    await api("DELETE", `/cart/items/${many[0]}`, erin.token);
    const after = await put(erin.token, many[50]!, 1);
    expect(after.res.status).toBe(200);
    expect(after.body!.data.items).toHaveLength(50);
  });

  test("PUT paralel untuk baris baru tidak bisa melewati batas (kunci per user)", async () => {
    const frank = await register("frank");
    for (const id of many.slice(0, 48)) await put(frank.token, id, 1);

    // 4 baris baru serentak, tersisa 2 slot
    const results = await Promise.all(many.slice(48, 52).map((id) => put(frank.token, id, 1)));
    const ok = results.filter((r) => r.res.status === 200).length;
    const rejected = results.filter((r) => r.res.status === 422 && r.body!.code === "CART_LIMIT_REACHED").length;
    expect(ok).toBe(2);
    expect(rejected).toBe(2);

    expect((await api("GET", "/cart", frank.token)).body!.data.items).toHaveLength(50);
  });
});

describe("efisiensi", () => {
  test("GET /cart memakai jumlah query tetap, berapa pun isi keranjang", async () => {
    const gina = await register("gina");
    const spy = spyOn(db.$client, "unsafe");

    await put(gina.token, many[0]!, 1);
    spy.mockClear();
    await api("GET", "/cart", gina.token);
    const withOne = spy.mock.calls.length;

    for (const id of many.slice(1, 20)) await put(gina.token, id, 1);
    spy.mockClear();
    await api("GET", "/cart", gina.token);
    const withTwenty = spy.mock.calls.length;
    spy.mockRestore();

    // minimal 1 membuktikan spy benar-benar menangkap query; sama persis = tidak ada N+1
    expect(withOne).toBeGreaterThanOrEqual(1);
    expect(withTwenty).toBe(withOne);
    // 1 query keranjang + 1 query pemuatan user oleh requireAuth
    expect(withOne).toBeLessThanOrEqual(2);
  });
});

describe("dokumentasi Swagger", () => {
  test("endpoint keranjang tercantum dengan skema Bearer", async () => {
    const res = await app.handle(new Request("http://localhost/swagger/json"));
    const spec = (await res.json()) as { paths: Json };
    expect(spec.paths["/api/cart"]?.get?.security).toEqual([{ bearerAuth: [] }]);
    expect(spec.paths["/api/cart/items/{variantId}"]?.put).toBeDefined();
    expect(spec.paths["/api/cart/items/{variantId}"]?.delete).toBeDefined();
    expect(spec.paths["/api/cart/merge"]).toBeUndefined();
  });
});
