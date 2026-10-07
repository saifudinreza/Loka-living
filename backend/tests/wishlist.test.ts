import { afterAll, beforeAll, describe, expect, spyOn, test } from "bun:test";
import { and, count, eq, like } from "drizzle-orm";
import { createApp } from "../src/app";
import { db } from "../src/db/client";
import { productVariants, products, users, wishlistItems } from "../src/db/schema";

const app = createApp({ enableJobs: false });
const SLUG_PREFIX = "wishtest-";
const EMAIL_PREFIX = "wishtest-";

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

const add = (token: string, productId: string) => api("POST", "/wishlist", token, { product_id: productId });
const list = async (token: string) => (await api("GET", "/wishlist", token)).body!.data as Json[];
const rows = async (userId: string) =>
  (await db.select({ n: count() }).from(wishlistItems).where(eq(wishlistItems.userId, userId)))[0]!.n;

async function createProduct(name: string, status = "active") {
  const [row] = await db
    .insert(products)
    .values({ name, slug: `${SLUG_PREFIX}${crypto.randomUUID().slice(0, 8)}`, category: "chairs", weightKg: "5", status })
    .returning();
  return row!;
}

let alice: { token: string; id: string };
let bob: { token: string; id: string };
let sofa: Awaited<ReturnType<typeof createProduct>>; // 2 varian: 900.000 (stok 0) dan 1.200.000 (stok 5), foto di varian pertama
let table: Awaited<ReturnType<typeof createProduct>>; // 1 varian, stok 0
let bare: Awaited<ReturnType<typeof createProduct>>; // tanpa varian
let many: string[] = []; // 105 produk untuk uji batas

beforeAll(async () => {
  alice = await register("alice");
  bob = await register("bob");

  sofa = await createProduct("Sofa Uji");
  await db.insert(productVariants).values([
    { productId: sofa.id, material: "A", priceIdr: 1_200_000, priceUsd: "75", stockAvailable: 5, imageUrls: ["/images/uji-1.jpg", "/images/uji-2.jpg"], createdAt: new Date("2026-01-02T00:00:00Z") },
    { productId: sofa.id, material: "B", priceIdr: 900_000, priceUsd: "56", stockAvailable: 0, imageUrls: ["/images/lain.jpg"], createdAt: new Date("2026-01-03T00:00:00Z") },
  ]);

  table = await createProduct("Meja Uji");
  await db.insert(productVariants).values({ productId: table.id, priceIdr: 2_000_000, priceUsd: "125", stockAvailable: 0 });

  bare = await createProduct("Tanpa Varian");

  const bulk = await db
    .insert(products)
    .values(
      Array.from({ length: 105 }, (_, i) => ({
        name: `Massal ${i}`,
        slug: `${SLUG_PREFIX}m${i}-${crypto.randomUUID().slice(0, 6)}`,
        category: "chairs",
        weightKg: "1",
      })),
    )
    .returning({ id: products.id });
  many = bulk.map((r) => r.id);
});

afterAll(async () => {
  // baris wishlist dan varian ikut terhapus (ON DELETE CASCADE)
  await db.delete(products).where(like(products.slug, `${SLUG_PREFIX}%`));
  await db.delete(users).where(like(users.email, `${EMAIL_PREFIX}%`));
});

describe("autentikasi", () => {
  test("semua endpoint wishlist tanpa token → 401", async () => {
    for (const [method, path, body] of [
      ["GET", "/wishlist", undefined],
      ["POST", "/wishlist", { product_id: sofa.id }],
      ["DELETE", `/wishlist/${sofa.id}`, undefined],
    ] as const) {
      const { res, body: json } = await api(method, path, undefined, body);
      expect(res.status, `${method} ${path}`).toBe(401);
      expect(json!.code).toBe("UNAUTHORIZED");
    }
  });

  test("token sampah → 401", async () => {
    expect((await api("GET", "/wishlist", "bukan.jwt.valid")).res.status).toBe(401);
  });
});

describe("GET /api/wishlist", () => {
  test("wishlist kosong, dan respons tidak boleh di-cache bersama", async () => {
    const { res, body } = await api("GET", "/wishlist", alice.token);
    expect(res.status).toBe(200);
    expect(body).toEqual({ data: [] });
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });
});

describe("POST /api/wishlist", () => {
  test("produk baru → 201; diulang → 200; tetap satu baris di database", async () => {
    const first = await add(alice.token, sofa.id);
    expect(first.res.status).toBe(201);
    expect(first.body).toEqual({ data: { product_id: sofa.id, in_wishlist: true } });
    expect(first.res.headers.get("cache-control")).toBe("private, no-store");

    const second = await add(alice.token, sofa.id);
    expect(second.res.status).toBe(200);
    expect(second.body).toEqual({ data: { product_id: sofa.id, in_wishlist: true } });

    expect(await rows(alice.id)).toBe(1);
  });

  test("produk tidak ada / non-aktif → 422 PRODUCT_NOT_FOUND", async () => {
    const unknown = await add(alice.token, crypto.randomUUID());
    expect(unknown.res.status).toBe(422);
    expect(unknown.body!.code).toBe("PRODUCT_NOT_FOUND");

    const inactive = await createProduct("Nonaktif", "inactive");
    const res = await add(alice.token, inactive.id);
    expect(res.res.status).toBe(422);
    expect(res.body!.code).toBe("PRODUCT_NOT_FOUND");
  });

  test("validasi: product_id bukan UUID / hilang / bukan teks → 422 VALIDATION_FAILED", async () => {
    for (const body of [{ product_id: "bukan-uuid" }, {}, { product_id: 123 }, { product_id: null }]) {
      const { res, body: json } = await api("POST", "/wishlist", alice.token, body);
      expect(res.status, JSON.stringify(body)).toBe(422);
      expect(json!.code).toBe("VALIDATION_FAILED");
    }
  });
});

describe("GET /api/wishlist: isi", () => {
  test("bentuk item: harga termurah, foto varian pertama, ada stok; tanpa field internal", async () => {
    const [item] = await list(alice.token);
    expect(item!.product).toEqual({
      id: sofa.id,
      slug: sofa.slug,
      name: "Sofa Uji",
      price_from_idr: 900_000, // varian termurah, walau stoknya 0
      image_url: "/images/uji-1.jpg", // foto pertama VARIAN PERTAMA (urut created_at), bukan varian termurah
      in_stock: true, // ada varian dengan stok 5
    });
    expect(new Date(item!.added_at).toISOString()).toBe(item!.added_at);
    expect(JSON.stringify(item)).not.toContain("user_id");
  });

  test("tanpa stok sama sekali → in_stock false; tanpa foto → image_url null; tanpa varian → harga null", async () => {
    await add(alice.token, table.id);
    await add(alice.token, bare.id);
    const items = await list(alice.token);
    const byId = Object.fromEntries(items.map((i) => [i.product.id, i.product]));

    expect(byId[table.id]).toMatchObject({ price_from_idr: 2_000_000, image_url: null, in_stock: false });
    expect(byId[bare.id]).toMatchObject({ price_from_idr: null, image_url: null, in_stock: false });
  });

  test("urutan: yang terakhir ditambahkan paling atas", async () => {
    const items = await list(alice.token);
    // ditambahkan berurutan: sofa, table, bare
    expect(items.map((i) => i.product.id)).toEqual([bare.id, table.id, sofa.id]);
  });

  test("produk dinonaktifkan → hilang dari GET (barisnya tetap), aktif lagi → muncul lagi", async () => {
    await db.update(products).set({ status: "inactive" }).where(eq(products.id, sofa.id));
    try {
      expect((await list(alice.token)).map((i) => i.product.id)).not.toContain(sofa.id);
      expect(await rows(alice.id)).toBe(3); // barisnya masih ada
    } finally {
      await db.update(products).set({ status: "active" }).where(eq(products.id, sofa.id));
    }
    expect((await list(alice.token)).map((i) => i.product.id)).toContain(sofa.id);
  });

  test("harga varian berubah → price_from_idr ikut berubah", async () => {
    const [cheapest] = await db.select().from(productVariants).where(and(eq(productVariants.productId, sofa.id), eq(productVariants.material, "B")));
    await db.update(productVariants).set({ priceIdr: 1_500_000 }).where(eq(productVariants.id, cheapest!.id));
    try {
      const item = (await list(alice.token)).find((i) => i.product.id === sofa.id)!;
      expect(item.product.price_from_idr).toBe(1_200_000); // sekarang varian A yang termurah
    } finally {
      await db.update(productVariants).set({ priceIdr: 900_000 }).where(eq(productVariants.id, cheapest!.id));
    }
  });
});

describe("DELETE /api/wishlist/:productId", () => {
  test("dua kali → keduanya 204 tanpa isi; produk hilang dari wishlist", async () => {
    const first = await api("DELETE", `/wishlist/${bare.id}`, alice.token);
    expect(first.res.status).toBe(204);
    expect(first.body).toBeNull();
    expect(first.res.headers.get("cache-control")).toBe("private, no-store");

    expect((await api("DELETE", `/wishlist/${bare.id}`, alice.token)).res.status).toBe(204);
    expect((await list(alice.token)).map((i) => i.product.id)).not.toContain(bare.id);
  });

  test("produk yang tidak pernah ada di wishlist → tetap 204; :productId bukan UUID → 422", async () => {
    expect((await api("DELETE", `/wishlist/${crypto.randomUUID()}`, alice.token)).res.status).toBe(204);
    const bad = await api("DELETE", "/wishlist/bukan-uuid", alice.token);
    expect(bad.res.status).toBe(422);
    expect(bad.body!.code).toBe("VALIDATION_FAILED");
  });
});

describe("isolasi antar user", () => {
  test("user B tidak melihat, menambah ke, atau menghapus wishlist user A", async () => {
    const carol = await register("carol");
    const dave = await register("dave");
    await add(carol.token, sofa.id);

    expect(await list(dave.token)).toEqual([]);

    // B memakai produk yang sama: hanya memengaruhi wishlist-nya sendiri
    expect((await add(dave.token, sofa.id)).res.status).toBe(201); // baru bagi B, walau A sudah menyimpannya
    await api("DELETE", `/wishlist/${sofa.id}`, dave.token);
    expect(await list(dave.token)).toEqual([]);
    expect((await list(carol.token)).map((i) => i.product.id)).toEqual([sofa.id]);

    // user_id tidak bisa dititipkan lewat body
    await api("POST", "/wishlist", dave.token, { product_id: table.id, user_id: carol.id });
    expect((await list(carol.token)).map((i) => i.product.id)).toEqual([sofa.id]);
  });
});

describe("batas 100 produk", () => {
  test("produk ke-101 ditolak WISHLIST_FULL; mengulang yang sudah ada tetap 200; hapus satu lalu tambah boleh", async () => {
    const erin = await register("erin");
    await db.insert(wishlistItems).values(many.slice(0, 100).map((productId) => ({ userId: erin.id, productId })));

    const over = await add(erin.token, many[100]!);
    expect(over.res.status).toBe(422);
    expect(over.body!.code).toBe("WISHLIST_FULL");
    expect(await rows(erin.id)).toBe(100);

    // sudah ada → bukan penambahan, jadi tidak terkena batas
    expect((await add(erin.token, many[0]!)).res.status).toBe(200);

    await api("DELETE", `/wishlist/${many[0]}`, erin.token);
    expect((await add(erin.token, many[100]!)).res.status).toBe(201);
    expect(await rows(erin.id)).toBe(100);
  });

  test("baris produk non-aktif (tersembunyi dari GET) tetap dihitung ke batas", async () => {
    const gina = await register("gina");
    await db.insert(wishlistItems).values(many.slice(0, 100).map((productId) => ({ userId: gina.id, productId })));
    // nonaktifkan beberapa produk: GET menampilkan lebih sedikit, tapi barisnya masih 100
    await db.update(products).set({ status: "inactive" }).where(eq(products.id, many[0]!));
    await db.update(products).set({ status: "inactive" }).where(eq(products.id, many[1]!));
    try {
      expect(await list(gina.token)).toHaveLength(98);
      const res = await add(gina.token, many[101]!);
      expect(res.res.status).toBe(422);
      expect(res.body!.code).toBe("WISHLIST_FULL");
    } finally {
      await db.update(products).set({ status: "active" }).where(eq(products.id, many[0]!));
      await db.update(products).set({ status: "active" }).where(eq(products.id, many[1]!));
    }
  });

  test("POST paralel untuk produk baru tidak bisa melewati batas (kunci per user)", async () => {
    const frank = await register("frank");
    await db.insert(wishlistItems).values(many.slice(0, 98).map((productId) => ({ userId: frank.id, productId })));

    // 4 produk baru serentak, tersisa 2 slot
    const results = await Promise.all(many.slice(98, 102).map((id) => add(frank.token, id)));
    const created = results.filter((r) => r.res.status === 201).length;
    const full = results.filter((r) => r.res.status === 422 && r.body!.code === "WISHLIST_FULL").length;
    expect(created).toBe(2);
    expect(full).toBe(2);
    expect(await rows(frank.id)).toBe(100);
  });

  test("dua POST bersamaan untuk produk yang SAMA → satu 201 dan satu 200, satu baris", async () => {
    const hana = await register("hana");
    const results = await Promise.all([add(hana.token, table.id), add(hana.token, table.id)]);
    expect(results.map((r) => r.res.status).sort()).toEqual([200, 201]);
    expect(await rows(hana.id)).toBe(1);
  });
});

describe("efisiensi", () => {
  test("GET /wishlist memakai jumlah query tetap, berapa pun isinya", async () => {
    const ivy = await register("ivy");
    const spy = spyOn(db.$client, "unsafe");

    await add(ivy.token, sofa.id);
    spy.mockClear();
    await api("GET", "/wishlist", ivy.token);
    const withOne = spy.mock.calls.length;

    await db.insert(wishlistItems).values(many.slice(0, 25).map((productId) => ({ userId: ivy.id, productId })));
    spy.mockClear();
    await api("GET", "/wishlist", ivy.token);
    const withMany = spy.mock.calls.length;
    spy.mockRestore();

    // minimal 1 membuktikan spy benar-benar menangkap query; sama persis = tidak ada N+1
    expect(withOne).toBeGreaterThanOrEqual(1);
    expect(withMany).toBe(withOne);
    // 1 query wishlist + 1 query pemuatan user oleh requireAuth
    expect(withOne).toBeLessThanOrEqual(2);
  });
});

describe("dokumentasi Swagger", () => {
  test("endpoint wishlist tercantum dengan skema Bearer", async () => {
    const res = await app.handle(new Request("http://localhost/swagger/json"));
    const spec = (await res.json()) as { paths: Json };
    expect(spec.paths["/api/wishlist"]?.get?.security).toEqual([{ bearerAuth: [] }]);
    expect(spec.paths["/api/wishlist"]?.post).toBeDefined();
    expect(spec.paths["/api/wishlist/{productId}"]?.delete).toBeDefined();
  });
});
