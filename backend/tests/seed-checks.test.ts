import { describe, expect, test } from "bun:test";
import { resolve } from "node:path";
import {
  type SeedData,
  type SeedProduct,
  assertSeedAllowed,
  findMissingImages,
  shouldSeedExampleTestimonials,
  validateSeedData,
} from "../src/db/seed-checks";

const product = (over: Partial<SeedProduct> = {}): SeedProduct => ({
  id: "00000000-0000-0000-0000-000000000001",
  name: "Kursi",
  slug: "kursi",
  category: "chairs",
  description: "x",
  lengthCm: "1",
  widthCm: "1",
  heightCm: "1",
  weightKg: "1",
  gallery: [],
  variants: [
    { sku: "K-1", material: "Jati", colorHex: "#000000", priceIdr: 1, priceUsd: "1", stockAvailable: 1, images: ["/images/k.jpg"] },
  ],
  ...over,
});

const data = (over: Partial<SeedData> = {}): SeedData => ({
  products: [product()],
  rooms: [{ slug: "ruang-tamu" }],
  productRooms: { kursi: ["ruang-tamu"] },
  featuredSlugs: ["kursi"],
  ...over,
});

describe("validateSeedData", () => {
  test("data valid lolos", () => {
    expect(() => validateSeedData(data())).not.toThrow();
  });

  test("ruangan tanpa produk ditolak", () => {
    expect(() => validateSeedData(data({ rooms: [{ slug: "ruang-tamu" }, { slug: "dapur" }] }))).toThrow(/dapur/);
  });

  test("path foto tanpa /images/ ditolak", () => {
    const p = product({ gallery: ["public/images/x.jpg"] });
    expect(() => validateSeedData(data({ products: [p] }))).toThrow(/\/images\//);
  });

  test("varian tanpa foto ditolak", () => {
    const p = product();
    p.variants[0]!.images = [];
    expect(() => validateSeedData(data({ products: [p] }))).toThrow(/tidak punya foto/);
  });

  test("SKU dobel ditolak", () => {
    const a = product();
    const b = product({ id: "00000000-0000-0000-0000-000000000002", slug: "kursi-2" });
    expect(() =>
      validateSeedData(data({ products: [a, b], productRooms: { kursi: ["ruang-tamu"], "kursi-2": ["ruang-tamu"] } })),
    ).toThrow(/SKU dobel/);
  });

  test("slug tidak dikenal di pemetaan ruangan ditolak", () => {
    expect(() => validateSeedData(data({ productRooms: { kursi: ["ruang-tamu"], meja: ["ruang-tamu"] } }))).toThrow(/meja/);
  });

  test("produk unggulan tidak dikenal ditolak", () => {
    expect(() => validateSeedData(data({ featuredSlugs: ["meja"] }))).toThrow(/FEATURED_SLUGS/);
  });

  test("id produk di luar prefix seed ditolak", () => {
    const p = product({ id: "11111111-0000-0000-0000-000000000001" });
    expect(() => validateSeedData(data({ products: [p] }))).toThrow(/diawali/);
  });
});

describe("findMissingImages", () => {
  const publicDir = resolve(import.meta.dir, "../../frontend/public");

  test("file yang ada tidak dilaporkan, yang hilang dilaporkan sekali", () => {
    const missing = findMissingImages(
      ["/images/lk-p1.svg", "/images/products/tidak-ada.jpg", "/images/products/tidak-ada.jpg"],
      publicDir,
    );
    expect(missing).toEqual(["/images/products/tidak-ada.jpg"]);
  });
});

describe("guard production", () => {
  test("ditolak di production tanpa flag", () => {
    expect(() => assertSeedAllowed({ NODE_ENV: "production" })).toThrow(/SEED_ALLOW_PRODUCTION/);
  });

  test("diizinkan di production dengan flag", () => {
    expect(() => assertSeedAllowed({ NODE_ENV: "production", SEED_ALLOW_PRODUCTION: "true" })).not.toThrow();
  });

  test("diizinkan di development", () => {
    expect(() => assertSeedAllowed({ NODE_ENV: "development" })).not.toThrow();
    expect(() => assertSeedAllowed({})).not.toThrow();
  });

  test("testimoni contoh tidak pernah dibuat di production, walau seed diizinkan", () => {
    expect(shouldSeedExampleTestimonials({ NODE_ENV: "production", SEED_ALLOW_PRODUCTION: "true" })).toBe(false);
    expect(shouldSeedExampleTestimonials({ NODE_ENV: "development" })).toBe(true);
  });
});
