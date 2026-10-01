import { sql } from "drizzle-orm";
import {
  boolean,
  char,
  check,
  index,
  integer,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { productVariants, products } from "./catalog";

export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // disimpan lowercase; dijaga CHECK di bawah supaya "A@x.com" dan "a@x.com" tidak bisa jadi dua akun
    email: varchar("email", { length: 150 }).notNull().unique(),
    // null untuk akun yang hanya login Google
    passwordHash: text("password_hash"),
    name: varchar("name", { length: 120 }).notNull(),
    googleId: varchar("google_id", { length: 64 }).unique(),
    emailVerifiedAt: timestamp("email_verified_at", { withTimezone: true }),
    // Akun tidak dihapus permanen: user yang pernah punya pesanan hanya dinonaktifkan
    // (orders.user_id memakai ON DELETE RESTRICT). Akun dengan deleted_at terisi tidak boleh login.
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    // diperbarui trigger database (lihat migrasi updated_at_triggers)
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check("users_email_lowercase", sql`${t.email} = lower(${t.email})`)],
);

export const refreshTokens = pgTable(
  "refresh_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // sha256 hex dari token asli; token asli tidak pernah disimpan
    tokenHash: char("token_hash", { length: 64 }).notNull().unique(),
    // semua token hasil rotasi dari satu login berbagi family
    familyId: uuid("family_id").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    userAgent: varchar("user_agent", { length: 255 }),
  },
  (t) => [
    index("refresh_tokens_user_id_idx").on(t.userId),
    index("refresh_tokens_family_id_idx").on(t.familyId),
    // untuk job pembersihan token kedaluwarsa
    index("refresh_tokens_expires_at_idx").on(t.expiresAt),
  ],
);

export const userAddresses = pgTable(
  "user_addresses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    label: varchar("label", { length: 40 }).notNull(),
    recipientName: varchar("recipient_name", { length: 120 }).notNull(),
    phone: varchar("phone", { length: 20 }).notNull(),
    fullAddress: text("full_address").notNull(),
    kelurahan: varchar("kelurahan", { length: 80 }),
    kecamatan: varchar("kecamatan", { length: 80 }),
    city: varchar("city", { length: 80 }),
    province: varchar("province", { length: 80 }),
    postalCode: varchar("postal_code", { length: 10 }),
    latitude: numeric("latitude", { precision: 10, scale: 7 }),
    longitude: numeric("longitude", { precision: 10, scale: 7 }),
    isDefault: boolean("is_default").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("user_addresses_user_id_idx").on(t.userId),
    // database sendiri menjamin paling banyak satu alamat utama per user
    uniqueIndex("user_addresses_one_default_per_user").on(t.userId).where(sql`${t.isDefault} = true`),
  ],
);

export const cartItems = pgTable(
  "cart_items",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productVariantId: uuid("product_variant_id")
      .notNull()
      .references(() => productVariants.id, { onDelete: "cascade" }),
    qty: integer("qty").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.productVariantId] }),
    check("cart_items_qty_range", sql`${t.qty} BETWEEN 1 AND 99`),
  ],
);

export const wishlistItems = pgTable(
  "wishlist_items",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.productId] })],
);
