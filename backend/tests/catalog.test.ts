import { afterAll, describe, expect, spyOn, test } from "bun:test";
import { eq, like } from "drizzle-orm";
import { createApp } from "../src/app";
import { db } from "../src/db/client";
import { productVariants, products } from "../src/db/schema";

// Tes ini membaca data seed (bun run db:seed): 8 produk aktif, 4 unggulan, 4 ruangan.
const app = createApp({ enableJobs: false });

type Json = Record<string, any>;
const get = async (path: string) => {
  const res = await app.handle(new Request(`http://localhost/api${path}`));
  return { res, body: (await res.json()) as Json };
};

const HIDDEN = JSON.stringify;

afterAll(async () => {
  await db.delete(products).where(like(products.slug, "catalogtest-%"));
});

describe("GET /api/products", () => {
  test("tanpa parameter: semua produk aktif, urut id, bentuk lama, tanpa field internal", async () => {
    const { res, body } = await get("/products");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=60");
    expect(body.data.length).toBeGreaterThanOrEqual(8);

    const ids = body.data.map((p: Json) => p.id);
    expect(ids).toEqual([...ids].sort());

    const p = body.data[0];
    expect(Object.keys(p).sort()).toEqual(
      ["category", "description", "dimensions", "id", "is_featured", "name", "rooms", "slug", "variants", "weight_kg"].sort(),
    );
    // tipe lama: weight_kg & dimensions string, harga number, image_urls array
    expect(typeof p.weight_kg).toBe("string");
    expect(typeof p.dimensions.length).toBe("string");
    const v = p.variants[0];
    expect(typeof v.price_idr).toBe("number");
    expect(Array.isArray(v.image_urls)).toBe(true);
    expect("compare_at_price_idr" in v).toBe(true);

    const raw = HIDDEN(body);
    for (const secret of ["stock_reserved", "price_usd", '"status"', "created_at"]) {
      expect(raw).not.toContain(secret);
    }
  });

  test("?featured=true → hanya produk unggulan (4 dari seed)", async () => {
    const { body } = await get("/products?featured=true");
    expect(body.data).toHaveLength(4);
    expect(body.data.every((p: Json) => p.is_featured)).toBe(true);
  });

  test("?sort=newest&limit=3 → maksimal 3 produk", async () => {
    const { body } = await get("/products?sort=newest&limit=3");
    expect(body.data.length).toBeLessThanOrEqual(3);
    expect(body.data.length).toBeGreaterThan(0);
  });

  test("?room=ruang-tamu → hanya produk di ruangan itu; slug tak ada → data kosong", async () => {
    const { body } = await get("/products?room=ruang-tamu");
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data.every((p: Json) => p.rooms.includes("ruang-tamu"))).toBe(true);

    const none = await get("/products?room=tidak-ada");
    expect(none.res.status).toBe(200);
    expect(none.body.data).toEqual([]);
  });

  test("limit di luar 1–50 atau bukan angka → 422 VALIDATION_FAILED", async () => {
    for (const q of ["limit=500", "limit=0", "limit=abc"]) {
      const { res, body } = await get(`/products?${q}`);
      expect(res.status, q).toBe(422);
      expect(body.code).toBe("VALIDATION_FAILED");
    }
  });

  test("daftar, detail, dan ruangan memakai query tetap, bukan 1 + jumlah produk", async () => {
    // postgres.js: Drizzle mengirim setiap SQL lewat client.unsafe
    const spy = spyOn(db.$client, "unsafe");
    for (const path of ["/products", "/products/kursi-santai-rukun", "/rooms"]) {
      spy.mockClear();
      await get(path);
      // minimal 1 membuktikan spy benar-benar menangkap query (bukan lulus kosong)
      expect(spy.mock.calls.length, path).toBeGreaterThanOrEqual(1);
      expect(spy.mock.calls.length, path).toBeLessThanOrEqual(2);
    }
    spy.mockRestore();
  });

  test("produk non-aktif tidak muncul di daftar dan detail (404)", async () => {
    const slug = `catalogtest-${crypto.randomUUID().slice(0, 8)}`;
    const [row] = await db
      .insert(products)
      .values({ name: "Produk Nonaktif", slug, category: "chairs", weightKg: "1", status: "inactive" })
      .returning();
    await db.insert(productVariants).values({ productId: row!.id, priceIdr: 1000, priceUsd: "1", stockAvailable: 1 });

    const list = await get("/products");
    expect(list.body.data.some((p: Json) => p.slug === slug)).toBe(false);

    const detail = await get(`/products/${slug}`);
    expect(detail.res.status).toBe(404);

    // aktifkan: sekarang muncul
    await db.update(products).set({ status: "active" }).where(eq(products.id, row!.id));
    expect((await get(`/products/${slug}`)).res.status).toBe(200);
  });
});

describe("GET /api/products/:slug", () => {
  test("detail: field tambahan, angka berupa number, rooms berupa objek", async () => {
    const { res, body } = await get("/products/kursi-santai-rukun");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=60");

    const p = body.data;
    expect(typeof p.weight_kg).toBe("number");
    expect(typeof p.dimensions.length).toBe("number");
    for (const field of ["model_3d_url", "gallery_urls", "materials_detail", "care_instructions", "warranty_months"]) {
      expect(field in p, field).toBe(true);
    }
    expect(Array.isArray(p.gallery_urls)).toBe(true);
    expect(p.rooms[0]).toEqual({ slug: expect.any(String), name: expect.any(String) });
    expect(typeof p.variants[0].price_usd).toBe("number");
    expect(HIDDEN(body)).not.toContain("stock_reserved");
  });

  test("slug tidak ada → 404 PRODUCT_NOT_FOUND", async () => {
    const { res, body } = await get("/products/tidak-ada");
    expect(res.status).toBe(404);
    expect(body).toEqual({ error: "Produk tidak ditemukan.", code: "PRODUCT_NOT_FOUND" });
    expect(res.headers.get("cache-control")).toBeNull();
  });
});

describe("GET /api/rooms", () => {
  test("empat ruangan urut sort_order dengan product_count yang benar", async () => {
    const { res, body } = await get("/rooms");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
    expect(body.data.map((r: Json) => r.slug)).toEqual(["ruang-tamu", "kamar-tidur", "dapur-ruang-makan", "ruang-kerja"]);

    // product_count harus sama dengan jumlah produk yang dikembalikan filter ?room=
    for (const room of body.data) {
      const { body: list } = await get(`/products?room=${room.slug}`);
      expect(room.product_count, room.slug).toBe(list.data.length);
    }
    expect(Object.keys(body.data[0]).sort()).toEqual(["description", "image_url", "name", "product_count", "slug"]);
  });
});
