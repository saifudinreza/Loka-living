import { existsSync } from "node:fs";
import { resolve } from "node:path";

// Fungsi murni untuk seed.ts. Sengaja tidak mengimpor koneksi database supaya bisa dites tanpa Postgres.

export interface SeedVariant {
  sku: string;
  material: string;
  colorHex: string;
  priceIdr: number;
  priceUsd: string;
  compareAtPriceIdr?: number;
  // Hanya dipakai saat varian PERTAMA KALI dibuat. Seed ulang tidak mengubah stok varian yang sudah ada.
  stockAvailable: number;
  // Path foto relatif terhadap frontend/public, diawali "/". Foto nomor 1 = foto utama.
  images: string[];
}

export interface SeedProduct {
  id: string;
  name: string;
  slug: string;
  category: "chairs" | "tables" | "cabinets" | "shelves";
  description: string;
  lengthCm: string;
  widthCm: string;
  heightCm: string;
  weightKg: string;
  // Foto konteks ruangan: "/images/products/{slug}-ruang-{nomor}.jpg"
  gallery: string[];
  variants: SeedVariant[];
}

export interface SeedData {
  products: SeedProduct[];
  rooms: readonly { slug: string }[];
  productRooms: Record<string, string[]>;
  featuredSlugs: string[];
}

// Produk dari seed memakai id tetap berawalan ini. Hanya produk ber-id seperti ini yang boleh
// dinonaktifkan otomatis oleh seed; produk yang dibuat di luar seed tidak pernah disentuh.
export const SEED_PRODUCT_ID_PREFIX = "00000000-0000-0000-0000-";

export function validateSeedData(data: SeedData): void {
  const roomSlugs = new Set(data.rooms.map((r) => r.slug));
  const productSlugs = new Set<string>();
  const productIds = new Set<string>();
  const skus = new Set<string>();

  for (const p of data.products) {
    if (productSlugs.has(p.slug)) throw new Error(`Slug produk dobel: "${p.slug}"`);
    if (productIds.has(p.id)) throw new Error(`Id produk dobel: "${p.id}"`);
    if (!p.id.startsWith(SEED_PRODUCT_ID_PREFIX)) {
      throw new Error(`Id produk seed harus diawali "${SEED_PRODUCT_ID_PREFIX}": ${p.id}`);
    }
    productSlugs.add(p.slug);
    productIds.add(p.id);

    for (const v of p.variants) {
      // SKU dobel akan membuat upsert menimpa varian produk lain
      if (skus.has(v.sku)) throw new Error(`SKU dobel: "${v.sku}" (setiap SKU hanya boleh untuk satu varian)`);
      skus.add(v.sku);
      if (v.images.length === 0) throw new Error(`Varian ${v.sku} tidak punya foto (isi minimal ilustrasi sementara)`);
    }
    for (const path of [...p.gallery, ...p.variants.flatMap((v) => v.images)]) {
      if (!path.startsWith("/images/")) throw new Error(`Path foto harus diawali "/images/": ${path}`);
    }
  }

  for (const [slug, list] of Object.entries(data.productRooms)) {
    if (!productSlugs.has(slug)) throw new Error(`PRODUCT_ROOMS: produk tidak dikenal "${slug}"`);
    for (const r of list) if (!roomSlugs.has(r)) throw new Error(`PRODUCT_ROOMS: ruangan tidak dikenal "${r}"`);
  }
  for (const slug of data.featuredSlugs) {
    if (!productSlugs.has(slug)) throw new Error(`FEATURED_SLUGS: produk tidak dikenal "${slug}"`);
  }
  for (const r of data.rooms) {
    if (!Object.values(data.productRooms).some((l) => l.includes(r.slug))) {
      throw new Error(`Ruangan "${r.slug}" tidak punya produk`);
    }
  }
}

export function findMissingImages(paths: string[], publicDir: string): string[] {
  return [...new Set(paths)].filter((p) => !existsSync(resolve(publicDir, "." + p)));
}

export interface SeedEnv {
  NODE_ENV?: string;
  SEED_ALLOW_PRODUCTION?: string;
}

export function isProduction(env: SeedEnv): boolean {
  return env.NODE_ENV === "production";
}

// Seed menimpa data katalog dengan isi file. Di production ini harus disengaja.
export function assertSeedAllowed(env: SeedEnv): void {
  if (isProduction(env) && env.SEED_ALLOW_PRODUCTION !== "true") {
    throw new Error(
      "Seed ditolak karena NODE_ENV=production. Seed menimpa harga, deskripsi, dan foto produk dengan isi seed.ts. " +
        "Set SEED_ALLOW_PRODUCTION=true kalau memang disengaja.",
    );
  }
}

// Testimoni contoh adalah ulasan karangan; tidak boleh pernah tampil ke pembeli asli.
export function shouldSeedExampleTestimonials(env: SeedEnv): boolean {
  return !isProduction(env);
}
