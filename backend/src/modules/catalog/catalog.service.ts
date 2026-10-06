import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import { db } from "../../db/client";
import { productRooms, productVariants, products, rooms, testimonials } from "../../db/schema";
import { AppError } from "../../lib/errors";

export interface ProductFilters {
  room?: string;
  featured?: boolean;
  sort?: "newest";
  limit?: number;
}

// Varian dan ruangan ikut diambil dalam satu query relasional (Drizzle menggabungkannya jadi satu SQL),
// bukan 1 + N query. Varian diurutkan supaya urutan di response stabil.
const productWith = {
  variants: { orderBy: [asc(productVariants.createdAt), asc(productVariants.id)] },
  productRooms: { with: { room: true as const } },
};

function findProduct(slug: string) {
  return db.query.products.findFirst({
    where: and(eq(products.slug, slug), eq(products.status, "active")),
    with: productWith,
  });
}

type ProductRow = NonNullable<Awaited<ReturnType<typeof findProduct>>>;

const sortedRooms = (row: ProductRow) =>
  row.productRooms.map((pr) => pr.room).sort((a, b) => a.sortOrder - b.sortOrder);

// Bentuk lama (kompatibel dengan frontend dan backend Laravel): weight_kg dan dimensions string, harga number.
// Sengaja TIDAK menyertakan stock_reserved, price_usd, status, created_at.
function toListItem(row: ProductRow) {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    category: row.category,
    description: row.description,
    weight_kg: row.weightKg,
    dimensions: { length: row.lengthCm, width: row.widthCm, height: row.heightCm },
    is_featured: row.isFeatured,
    rooms: sortedRooms(row).map((r) => r.slug),
    variants: row.variants.map((v) => ({
      id: v.id,
      material: v.material,
      color_hex: v.colorHex,
      price_idr: v.priceIdr,
      compare_at_price_idr: v.compareAtPriceIdr,
      stock_available: v.stockAvailable,
      sku: v.sku,
      image_urls: v.imageUrls,
    })),
  };
}

const toNumber = (value: string | null) => (value === null ? null : Number(value));

export async function listProducts(filters: ProductFilters) {
  const conditions = [eq(products.status, "active")];
  if (filters.featured) conditions.push(eq(products.isFeatured, true));
  if (filters.room) {
    conditions.push(
      inArray(
        products.id,
        db
          .select({ id: productRooms.productId })
          .from(productRooms)
          .innerJoin(rooms, eq(rooms.id, productRooms.roomId))
          .where(eq(rooms.slug, filters.room)),
      ),
    );
  }

  const rows = await db.query.products.findMany({
    where: and(...conditions),
    // default urut id (perilaku lama); id jadi pemutus seri agar urutan "newest" stabil
    orderBy: filters.sort === "newest" ? [desc(products.createdAt), asc(products.id)] : [asc(products.id)],
    limit: filters.limit,
    with: productWith,
  });

  return rows.map(toListItem);
}

export async function getProductBySlug(slug: string) {
  const row = await findProduct(slug);
  if (!row) throw new AppError(404, "PRODUCT_NOT_FOUND", "Produk tidak ditemukan.");

  const item = toListItem(row);
  return {
    ...item,
    // di endpoint detail angka berupa number (perilaku Laravel lama)
    weight_kg: Number(row.weightKg),
    dimensions: { length: toNumber(row.lengthCm), width: toNumber(row.widthCm), height: toNumber(row.heightCm) },
    model_3d_url: row.model3dUrl,
    gallery_urls: row.galleryUrls,
    materials_detail: row.materialsDetail,
    care_instructions: row.careInstructions,
    warranty_months: row.warrantyMonths,
    rooms: sortedRooms(row).map((r) => ({ slug: r.slug, name: r.name })),
    variants: item.variants.map((v, i) => ({ ...v, price_usd: Number(row.variants[i]!.priceUsd) })),
  };
}

export async function listRooms() {
  // satu query: left join supaya ruangan tanpa produk tetap muncul dengan product_count 0;
  // join ke products memfilter status aktif di kondisi ON agar ruangan tidak ikut hilang
  const rows = await db
    .select({
      slug: rooms.slug,
      name: rooms.name,
      description: rooms.description,
      imageUrl: rooms.imageUrl,
      productCount: count(products.id),
    })
    .from(rooms)
    .leftJoin(productRooms, eq(productRooms.roomId, rooms.id))
    .leftJoin(products, and(eq(products.id, productRooms.productId), eq(products.status, "active")))
    .groupBy(rooms.id)
    .orderBy(asc(rooms.sortOrder), asc(rooms.id));

  return rows.map((r) => ({
    slug: r.slug,
    name: r.name,
    description: r.description,
    image_url: r.imageUrl,
    product_count: r.productCount,
  }));
}

export interface TestimonialFilters {
  productSlug?: string;
  limit: number;
}

export async function listTestimonials(filters: TestimonialFilters) {
  const conditions = [eq(testimonials.isPublished, true)];
  // join produk hanya yang aktif: testimoni produk non-aktif tetap tampil, tapi `product` bernilai null;
  // dan filter slug produk non-aktif/tak ada otomatis menghasilkan daftar kosong
  if (filters.productSlug) conditions.push(eq(products.slug, filters.productSlug));

  const rows = await db
    .select({
      id: testimonials.id,
      customerName: testimonials.customerName,
      city: testimonials.city,
      quote: testimonials.quote,
      rating: testimonials.rating,
      photoUrl: testimonials.photoUrl,
      productSlug: products.slug,
      productName: products.name,
    })
    .from(testimonials)
    .leftJoin(products, and(eq(products.id, testimonials.productId), eq(products.status, "active")))
    .where(and(...conditions))
    // id sebagai pemutus seri agar urutan stabil
    .orderBy(asc(testimonials.sortOrder), desc(testimonials.createdAt), asc(testimonials.id))
    .limit(filters.limit);

  // is_published dan sort_order sengaja tidak dikirim
  return rows.map((r) => ({
    id: r.id,
    customer_name: r.customerName,
    city: r.city,
    quote: r.quote,
    rating: r.rating,
    photo_url: r.photoUrl,
    product: r.productSlug && r.productName ? { slug: r.productSlug, name: r.productName } : null,
  }));
}
