import { resolve } from "node:path";
import { and, inArray, like, notInArray, sql } from "drizzle-orm";
import { db } from "./client";
import { productRooms, productVariants, products, rooms, testimonials } from "./schema";
import {
  SEED_PRODUCT_ID_PREFIX,
  type SeedProduct,
  assertSeedAllowed,
  findMissingImages,
  shouldSeedExampleTestimonials,
  validateSeedData,
} from "./seed-checks";

// ---------------------------------------------------------------------------
// Data. Nilai produk & varian disalin persis dari ProductSeeder Laravel lama
// (git show bf3765d:backend/database/seeders/ProductSeeder.php).
//
// File ini adalah SUMBER KEBENARAN data katalog sampai ada panel admin. Ubah harga, deskripsi,
// foto, produk unggulan, dan ruangan DI SINI lalu jalankan `bun run db:seed`. Perubahan yang
// dibuat langsung lewat SQL akan ditimpa seed berikutnya. Pengecualian: STOK (lihat SeedVariant).
//
// Berhenti menjual produk: hapus dari PRODUCTS. Seed mengubah statusnya jadi "inactive"
// (bukan menghapus, karena pesanan lama masih merujuk ke variannya).
// ---------------------------------------------------------------------------

// Ilustrasi sementara yang sudah ada di frontend. Ganti dengan foto asli di `images` kalau sudah ada:
// simpan file di frontend/public/images/products/, tulis path-nya di sini, lalu `bun run db:seed`.
const placeholder = (n: number) => [`/images/lk-p${n}.svg`];

const PRODUCTS: SeedProduct[] = [
  {
    id: "00000000-0000-0000-0000-000000000001",
    name: "Kursi Santai Rukun",
    slug: "kursi-santai-rukun",
    category: "chairs",
    description: "Rangka rotan anyaman tangan dengan bantalan linen lepas-cuci — kursi baca yang menua dengan indah.",
    lengthCm: "72", widthCm: "80", heightCm: "98", weightKg: "8",
    gallery: ["/images/products/kursi-santai-rukun-ruang-1.jpg"],
    variants: [
      { sku: "KSR-RLN-01", material: "Rotan & Linen", colorHex: "#C99A66", priceIdr: 2450000, priceUsd: "153.13", compareAtPriceIdr: 2900000, stockAvailable: 13, images: ["/images/products/ksr-rln-01-1.jpg"] },
    ],
  },
  {
    id: "00000000-0000-0000-0000-000000000002",
    name: "Kursi Makan Tani",
    slug: "kursi-makan-tani",
    category: "chairs",
    description: "Kursi makan kayu solid dengan dudukan anyaman rotan, ringan namun kokoh untuk pemakaian harian.",
    lengthCm: "46", widthCm: "52", heightCm: "84", weightKg: "6",
    gallery: ["/images/products/kursi-makan-tani-ruang-1.jpg"],
    variants: [
      { sku: "KMT-JTI-01", material: "Kayu Jati", colorHex: "#9B6B3A", priceIdr: 1150000, priceUsd: "71.88", stockAvailable: 48, images: ["/images/products/kmt-jti-01-1.jpg"] },
      { sku: "KMT-MHN-01", material: "Kayu Mahoni", colorHex: "#5A2D1A", priceIdr: 1250000, priceUsd: "78.13", stockAvailable: 24, images: ["/images/products/kmt-mhn-01-1.jpg"] },
    ],
  },
  {
    id: "00000000-0000-0000-0000-000000000003",
    name: "Meja Kopi Lestari",
    slug: "meja-kopi-lestari",
    category: "tables",
    description: "Meja kopi bidang lebar dari kayu jati reklamasi, permukaan diminyaki natural tanpa lapisan kimia.",
    lengthCm: "110", widthCm: "60", heightCm: "42", weightKg: "18",
    gallery: ["/images/products/meja-kopi-lestari-ruang-1.jpg"],
    variants: [
      { sku: "MKL-JTR-01", material: "Jati Reklamasi", colorHex: "#8B6B4A", priceIdr: 1850000, priceUsd: "115.63", compareAtPriceIdr: 2200000, stockAvailable: 21, images: ["/images/products/mkl-jtr-01-1.jpg"] },
    ],
  },
  {
    id: "00000000-0000-0000-0000-000000000004",
    name: "Meja Makan Bumi",
    slug: "meja-makan-bumi",
    category: "tables",
    description: "Meja makan enam kursi dari satu bilah kayu suar, urat kayu unik pada tiap unit.",
    lengthCm: "180", widthCm: "90", heightCm: "75", weightKg: "35",
    gallery: ["/images/products/meja-makan-bumi-ruang-1.jpg"],
    variants: [
      { sku: "MMB-SUAR-01", material: "Kayu Suar", colorHex: "#A0784A", priceIdr: 4900000, priceUsd: "306.25", stockAvailable: 7, images: ["/images/products/mmb-suar-01-1.jpg"] },
    ],
  },
  {
    id: "00000000-0000-0000-0000-000000000005",
    name: "Lemari Arsip Wana",
    slug: "lemari-arsip-wana",
    category: "cabinets",
    description: "Lemari penyimpanan tinggi dengan pintu panel rotan berventilasi dan engsel kuningan solid.",
    lengthCm: "90", widthCm: "45", heightCm: "180", weightKg: "45",
    gallery: ["/images/products/lemari-arsip-wana-ruang-1.jpg"],
    variants: [
      { sku: "LAW-KRT-01", material: "Kayu & Rotan", colorHex: "#6B4226", priceIdr: 5600000, priceUsd: "350.00", compareAtPriceIdr: 6400000, stockAvailable: 5, images: ["/images/products/law-krt-01-1.jpg"] },
    ],
  },
  {
    id: "00000000-0000-0000-0000-000000000006",
    name: "Rak Buku Tumbuh",
    slug: "rak-buku-tumbuh",
    category: "shelves",
    description: "Rak buku modular yang bisa ditambah tingkat seiring koleksi Anda bertumbuh.",
    lengthCm: "80", widthCm: "32", heightCm: "160", weightKg: "22",
    gallery: ["/images/products/rak-buku-tumbuh-ruang-1.jpg"],
    variants: [
      { sku: "RBT-JTI-01", material: "Kayu Jati", colorHex: "#9B6B3A", priceIdr: 2100000, priceUsd: "131.25", stockAvailable: 34, images: ["/images/products/rbt-jti-01-1.jpg"] },
      { sku: "RBT-WLN-01", material: "Kayu Walnut", colorHex: "#5A3D2B", priceIdr: 2400000, priceUsd: "150.00", stockAvailable: 18, images: ["/images/products/rbt-wln-01-1.jpg"] },
    ],
  },
  {
    id: "00000000-0000-0000-0000-000000000007",
    name: "Bangku Panjang Sela",
    slug: "bangku-panjang-sela",
    category: "chairs",
    description: "Bangku lorong ramping dari kayu mahoni, sempurna untuk area masuk atau ujung tempat tidur.",
    lengthCm: "140", widthCm: "38", heightCm: "45", weightKg: "12",
    gallery: ["/images/products/bangku-panjang-sela-ruang-1.jpg"],
    variants: [
      { sku: "BPS-MHN-01", material: "Kayu Mahoni", colorHex: "#5A2D1A", priceIdr: 1680000, priceUsd: "105.00", stockAvailable: 19, images: ["/images/products/bps-mhn-01-1.jpg"] },
    ],
  },
  {
    id: "00000000-0000-0000-0000-000000000008",
    name: "Meja Samping Endap",
    slug: "meja-samping-endap",
    category: "tables",
    description: "Meja samping mungil dengan laci tersembunyi, pas untuk lampu baca dan barang kecil.",
    lengthCm: "40", widthCm: "40", heightCm: "55", weightKg: "8",
    gallery: ["/images/products/meja-samping-endap-ruang-1.jpg"],
    variants: [
      { sku: "MSE-KEK-01", material: "Kayu Ek", colorHex: "#C4A882", priceIdr: 890000, priceUsd: "55.63", compareAtPriceIdr: 1050000, stockAvailable: 52, images: ["/images/products/mse-kek-01-1.jpg"] },
    ],
  },
];

const ROOMS = [
  { slug: "ruang-tamu", name: "Ruang Tamu", description: "Tempat berkumpul yang hangat dan lapang." },
  { slug: "kamar-tidur", name: "Kamar Tidur", description: "Ruang tenang untuk istirahat." },
  { slug: "dapur-ruang-makan", name: "Dapur & Ruang Makan", description: "Meja dan kursi untuk makan bersama." },
  { slug: "ruang-kerja", name: "Ruang Kerja", description: "Rak dan meja untuk bekerja dengan fokus." },
] as const;

// Produk -> ruangan. Satu produk boleh di beberapa ruangan. Silakan tinjau dan ubah.
const PRODUCT_ROOMS: Record<string, string[]> = {
  "kursi-santai-rukun": ["ruang-tamu"],
  "kursi-makan-tani": ["dapur-ruang-makan"],
  "meja-kopi-lestari": ["ruang-tamu"],
  "meja-makan-bumi": ["dapur-ruang-makan"],
  "lemari-arsip-wana": ["kamar-tidur", "ruang-kerja"],
  "rak-buku-tumbuh": ["ruang-tamu", "ruang-kerja"],
  "bangku-panjang-sela": ["kamar-tidur", "ruang-tamu"],
  "meja-samping-endap": ["ruang-tamu", "kamar-tidur"],
};

// 4 produk dengan total stok terbanyak. Ganti manual kapan saja.
const FEATURED_SLUGS = ["kursi-makan-tani", "rak-buku-tumbuh", "meja-samping-endap", "meja-kopi-lestari"];

const WARRANTY_MONTHS = 12;

// CONTOH SAJA, supaya landing page bisa diuji. Wajib diganti dengan testimoni pelanggan asli
// (atas izin pelanggan) sebelum produksi. Baris berawalan "[CONTOH] " dihapus & dibuat ulang tiap seed.
const EXAMPLE_PREFIX = "[CONTOH] ";
const EXAMPLE_TESTIMONIALS = [
  { customerName: "Rina", city: "Bandung", quote: "Kursinya nyaman dan finishing rotannya rapi.", rating: 5, productSlug: "kursi-santai-rukun" },
  { customerName: "Dimas", city: "Jakarta", quote: "Meja makannya kokoh, urat kayunya cantik.", rating: 5, productSlug: "meja-makan-bumi" },
  { customerName: "Sari", city: "Yogyakarta", quote: "Rak bukunya mudah dirakit dan terasa kuat.", rating: 4, productSlug: "rak-buku-tumbuh" },
];

// ---------------------------------------------------------------------------

const PUBLIC_DIR = resolve(import.meta.dir, "../../../frontend/public");

export async function runSeed(env = process.env) {
  assertSeedAllowed(env);
  validateSeedData({ products: PRODUCTS, rooms: ROOMS, productRooms: PRODUCT_ROOMS, featuredSlugs: FEATURED_SLUGS });
  const withExamples = shouldSeedExampleTestimonials(env);

  const allImages = PRODUCTS.flatMap((p) => [...p.gallery, ...p.variants.flatMap((v) => v.images)]);
  for (const missing of findMissingImages(allImages, PUBLIC_DIR)) {
    console.warn(`PERINGATAN: file foto tidak ditemukan di frontend/public: ${missing}`);
  }

  const summary = await db.transaction(async (tx) => {
    // Produk (upsert by id)
    for (const p of PRODUCTS) {
      const values = {
        id: p.id,
        name: p.name,
        slug: p.slug,
        category: p.category,
        description: p.description,
        lengthCm: p.lengthCm,
        widthCm: p.widthCm,
        heightCm: p.heightCm,
        weightKg: p.weightKg,
        status: "active",
        isFeatured: FEATURED_SLUGS.includes(p.slug),
        galleryUrls: p.gallery,
        warrantyMonths: WARRANTY_MONTHS,
      };
      const { id: _id, ...updatable } = values;
      await tx.insert(products).values(values).onConflictDoUpdate({ target: products.id, set: updatable });
    }

    // Produk ber-id seed yang sudah tidak ada di PRODUCTS: nonaktifkan, jangan hapus.
    const seedIds = PRODUCTS.map((p) => p.id);
    const deactivated = await tx
      .update(products)
      .set({ status: "inactive" })
      .where(and(sql`${products.id}::text LIKE ${SEED_PRODUCT_ID_PREFIX + "%"}`, notInArray(products.id, seedIds)))
      .returning({ slug: products.slug });
    for (const p of deactivated) console.warn(`INFO: produk "${p.slug}" tidak ada lagi di seed, dinonaktifkan.`);

    // Varian yang sudah ada: dipakai untuk peringatan stok dan untuk mencegah varian pindah produk.
    const existing = await tx
      .select({ sku: productVariants.sku, productId: productVariants.productId, stock: productVariants.stockAvailable })
      .from(productVariants)
      .where(inArray(productVariants.sku, PRODUCTS.flatMap((p) => p.variants.map((v) => v.sku))));
    const existingBySku = new Map(existing.map((e) => [e.sku, e]));

    // Varian (upsert by sku). Stok TIDAK ditimpa saat seed diulang: kalau tidak, menjalankan seed
    // untuk memperbarui foto akan mereset stok yang sudah berubah karena penjualan/reservasi.
    let variantCount = 0;
    for (const p of PRODUCTS) {
      for (const v of p.variants) {
        const prev = existingBySku.get(v.sku);
        if (prev && prev.productId !== p.id) {
          throw new Error(`SKU ${v.sku} di database milik produk lain (${prev.productId}); tidak dipindahkan ke ${p.slug}.`);
        }
        if (prev && prev.stock !== v.stockAvailable) {
          console.warn(
            `INFO: stok ${v.sku} di seed (${v.stockAvailable}) beda dengan database (${prev.stock}). ` +
              "Stok varian yang sudah ada tidak diubah seed; ubah lewat database kalau memang perlu.",
          );
        }
        const values = {
          productId: p.id,
          sku: v.sku,
          material: v.material,
          colorHex: v.colorHex,
          priceIdr: v.priceIdr,
          priceUsd: v.priceUsd,
          compareAtPriceIdr: v.compareAtPriceIdr ?? null,
          stockAvailable: v.stockAvailable,
          imageUrls: v.images,
        };
        // productId tidak ikut di-update supaya varian tidak pernah pindah ke produk lain.
        const { stockAvailable: _stock, sku: _sku, productId: _pid, ...updatable } = values;
        await tx.insert(productVariants).values(values).onConflictDoUpdate({ target: productVariants.sku, set: updatable });
        variantCount++;
      }
    }

    // Ruangan (upsert by slug)
    for (const [i, r] of ROOMS.entries()) {
      await tx
        .insert(rooms)
        .values({ ...r, sortOrder: i + 1 })
        .onConflictDoUpdate({ target: rooms.slug, set: { name: r.name, description: r.description, sortOrder: i + 1 } });
    }

    // product_rooms: hapus semua lalu isi ulang
    const roomRows = await tx.select({ id: rooms.id, slug: rooms.slug }).from(rooms);
    const roomId = new Map(roomRows.map((r) => [r.slug, r.id]));
    const productId = new Map(PRODUCTS.map((p) => [p.slug, p.id]));
    await tx.delete(productRooms);
    const links = Object.entries(PRODUCT_ROOMS).flatMap(([slug, list]) =>
      list.map((r) => ({ productId: productId.get(slug)!, roomId: roomId.get(r)! })),
    );
    await tx.insert(productRooms).values(links);

    // Testimoni contoh: hanya baris berawalan [CONTOH]; testimoni asli tidak disentuh
    // Testimoni contoh: selalu dihapus; hanya dibuat ulang di luar production.
    await tx.delete(testimonials).where(like(testimonials.customerName, `${EXAMPLE_PREFIX}%`));
    if (withExamples) await tx.insert(testimonials).values(
      EXAMPLE_TESTIMONIALS.map((t, i) => ({
        customerName: EXAMPLE_PREFIX + t.customerName,
        city: t.city,
        quote: t.quote,
        rating: t.rating,
        productId: productId.get(t.productSlug)!,
        isPublished: true,
        sortOrder: i + 1,
      })),
    );

    return {
      products: PRODUCTS.length,
      variants: variantCount,
      rooms: ROOMS.length,
      testimonials: withExamples ? EXAMPLE_TESTIMONIALS.length : 0,
    };
  });

  console.log(
    `Seeded ${summary.products} products, ${summary.variants} variants, ${summary.rooms} rooms, ${summary.testimonials} example testimonials`,
  );
}

if (import.meta.main) {
  runSeed()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error("Seed gagal:", err);
      process.exit(1);
    });
}
