import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { PRODUCT_STATUSES, inList } from "./enums";

export const rooms = pgTable("rooms", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: varchar("slug", { length: 60 }).notNull().unique(),
  name: varchar("name", { length: 80 }).notNull(),
  description: text("description"),
  imageUrl: text("image_url"),
  sortOrder: integer("sort_order").notNull().default(0),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const products = pgTable(
  "products",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: varchar("name", { length: 150 }).notNull(),
    slug: varchar("slug", { length: 160 }).notNull().unique(),
    // chairs | tables | cabinets | shelves
    category: varchar("category", { length: 50 }).notNull(),
    description: text("description"),
    lengthCm: numeric("length_cm", { precision: 6, scale: 1 }),
    widthCm: numeric("width_cm", { precision: 6, scale: 1 }),
    heightCm: numeric("height_cm", { precision: 6, scale: 1 }),
    weightKg: numeric("weight_kg", { precision: 6, scale: 2 }).notNull(),
    model3dUrl: varchar("model_3d_url", { length: 255 }),
    status: varchar("status", { length: 20 }).notNull().default("active"),
    isFeatured: boolean("is_featured").notNull().default(false),
    // foto konteks ruangan, terpisah dari foto varian
    galleryUrls: jsonb("gallery_urls").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    materialsDetail: text("materials_detail"),
    careInstructions: text("care_instructions"),
    warrantyMonths: smallint("warranty_months"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("products_is_featured_idx").on(t.isFeatured),
    index("products_created_at_idx").on(t.createdAt),
    check("products_status_valid", inList(t.status, PRODUCT_STATUSES)),
    check("products_weight_positive", sql`${t.weightKg} > 0`),
  ],
);

export const productRooms = pgTable(
  "product_rooms",
  {
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    roomId: uuid("room_id")
      .notNull()
      .references(() => rooms.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.productId, t.roomId] }), index("product_rooms_room_id_idx").on(t.roomId)],
);

export const productVariants = pgTable(
  "product_variants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    material: varchar("material", { length: 80 }),
    colorHex: varchar("color_hex", { length: 7 }),
    priceIdr: bigint("price_idr", { mode: "number" }).notNull(),
    priceUsd: numeric("price_usd", { precision: 10, scale: 2 }).notNull(),
    compareAtPriceIdr: bigint("compare_at_price_idr", { mode: "number" }),
    stockAvailable: integer("stock_available").notNull().default(0),
    stockReserved: integer("stock_reserved").notNull().default(0),
    sku: varchar("sku", { length: 50 }).unique(),
    imageUrls: jsonb("image_urls").$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("product_variants_product_id_idx").on(t.productId),
    // pengaman terakhir terhadap oversell
    check("product_variants_stock_available_nonneg", sql`${t.stockAvailable} >= 0`),
    check("product_variants_stock_reserved_nonneg", sql`${t.stockReserved} >= 0`),
    check("product_variants_price_nonneg", sql`${t.priceIdr} >= 0 AND ${t.priceUsd} >= 0`),
    check("product_variants_compare_price_nonneg", sql`${t.compareAtPriceIdr} IS NULL OR ${t.compareAtPriceIdr} >= 0`),
  ],
);

export const testimonials = pgTable(
  "testimonials",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    customerName: varchar("customer_name", { length: 80 }).notNull(),
    city: varchar("city", { length: 80 }),
    quote: text("quote").notNull(),
    rating: smallint("rating"),
    photoUrl: text("photo_url"),
    productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
    isPublished: boolean("is_published").notNull().default(false),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("testimonials_published_sort_idx").on(t.isPublished, t.sortOrder),
    check("testimonials_rating_range", sql`${t.rating} IS NULL OR ${t.rating} BETWEEN 1 AND 5`),
  ],
);
