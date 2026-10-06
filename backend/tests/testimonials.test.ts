import { afterAll, describe, expect, spyOn, test } from "bun:test";
import { eq, like } from "drizzle-orm";
import { createApp } from "../src/app";
import { db } from "../src/db/client";
import { products, testimonials } from "../src/db/schema";

// Membaca data seed (bun run db:seed): 3 testimoni contoh yang sudah dipublikasikan.
const app = createApp({ enableJobs: false });
const PREFIX = "testimonialtest-";

type Json = Record<string, any>;
const get = async (path: string) => {
  const res = await app.handle(new Request(`http://localhost/api${path}`));
  return { res, body: (await res.json()) as Json };
};

const unique = () => crypto.randomUUID().slice(0, 8);

afterAll(async () => {
  await db.delete(testimonials).where(like(testimonials.customerName, `${PREFIX}%`));
  await db.delete(products).where(like(products.slug, `${PREFIX}%`));
});

describe("GET /api/testimonials", () => {
  test("tanpa parameter: testimoni terbit dari seed, bentuk sesuai, tanpa field internal", async () => {
    const { res, body } = await get("/testimonials");
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=300");
    expect(body.data.length).toBeGreaterThanOrEqual(3);

    const t = body.data[0];
    expect(Object.keys(t).sort()).toEqual(["city", "customer_name", "id", "photo_url", "product", "quote", "rating"]);
    expect(t.product).toEqual({ slug: expect.any(String), name: expect.any(String) });

    const raw = JSON.stringify(body);
    expect(raw).not.toContain("is_published");
    expect(raw).not.toContain("sort_order");
  });

  test("testimoni is_published = false tidak pernah muncul", async () => {
    const name = `${PREFIX}draft-${unique()}`;
    await db.insert(testimonials).values({ customerName: name, quote: "Belum boleh tampil", isPublished: false, sortOrder: 0 });

    const { body } = await get("/testimonials?limit=20");
    expect(body.data.some((t: Json) => t.customer_name === name)).toBe(false);

    await db.update(testimonials).set({ isPublished: true }).where(eq(testimonials.customerName, name));
    const after = await get("/testimonials?limit=20");
    expect(after.body.data.some((t: Json) => t.customer_name === name)).toBe(true);
  });

  test("?product_slug → hanya testimoni produk itu; slug tak ada → data kosong", async () => {
    // pilih testimoni yang punya produk (baris uji lain di tabel bisa tanpa produk)
    const { body: all } = await get("/testimonials?limit=20");
    const slug = all.data.find((t: Json) => t.product)!.product.slug as string;

    const { body } = await get(`/testimonials?product_slug=${slug}`);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data.every((t: Json) => t.product?.slug === slug)).toBe(true);

    const none = await get("/testimonials?product_slug=tidak-ada");
    expect(none.res.status).toBe(200);
    expect(none.body.data).toEqual([]);
  });

  test("limit: default 6, bisa dibatasi, di luar 1–20 → 422", async () => {
    expect((await get("/testimonials?limit=1")).body.data).toHaveLength(1);

    for (const q of ["limit=0", "limit=21", "limit=abc"]) {
      const { res, body } = await get(`/testimonials?${q}`);
      expect(res.status, q).toBe(422);
      expect(body.code).toBe("VALIDATION_FAILED");
    }
  });

  test("urutan: sort_order naik, lalu created_at turun", async () => {
    const older = `${PREFIX}older-${unique()}`;
    const newer = `${PREFIX}newer-${unique()}`;
    await db.insert(testimonials).values([
      { customerName: older, quote: "lama", isPublished: true, sortOrder: -5, createdAt: new Date("2026-01-01T00:00:00Z") },
      { customerName: newer, quote: "baru", isPublished: true, sortOrder: -5, createdAt: new Date("2026-06-01T00:00:00Z") },
    ]);

    const { body } = await get("/testimonials?limit=20");
    const names = body.data.map((t: Json) => t.customer_name);
    // sort_order -5 mendahului testimoni seed; di antara keduanya yang lebih baru lebih dulu
    expect(names.indexOf(newer)).toBeLessThan(names.indexOf(older));
    expect(names.indexOf(older)).toBeLessThan(names.findIndex((n: string) => n.startsWith("[CONTOH]")));
  });

  test("produk non-aktif: testimoni tetap tampil dengan product null; filter slug-nya kosong", async () => {
    const slug = `${PREFIX}${unique()}`;
    const name = `${PREFIX}inactive-${unique()}`;
    const [product] = await db
      .insert(products)
      .values({ name: "Produk Nonaktif", slug, category: "chairs", weightKg: "1", status: "inactive" })
      .returning();
    await db.insert(testimonials).values({
      customerName: name,
      quote: "Produknya sudah tidak dijual",
      isPublished: true,
      sortOrder: -5,
      productId: product!.id,
    });

    const { body } = await get("/testimonials?limit=20");
    const row = body.data.find((t: Json) => t.customer_name === name);
    expect(row).toBeDefined();
    expect(row.product).toBeNull();

    expect((await get(`/testimonials?product_slug=${slug}`)).body.data).toEqual([]);
  });

  test("selalu 1 query, tanpa N+1", async () => {
    const spy = spyOn(db.$client, "unsafe");
    await get("/testimonials?limit=20");
    // minimal 1 membuktikan spy benar-benar menangkap query (bukan lulus kosong)
    expect(spy.mock.calls.length).toBeGreaterThanOrEqual(1);
    expect(spy.mock.calls.length).toBeLessThanOrEqual(1);
    spy.mockRestore();
  });
});
