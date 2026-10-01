import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import { productVariants } from "./catalog";
import { ORDER_ACTORS, ORDER_STATUSES, PAYMENT_GATEWAYS, inList } from "./enums";
import { users } from "./users";

// Salinan alamat saat order dibuat; sengaja terpisah dari user_addresses
// supaya mengedit buku alamat tidak mengubah alamat di pesanan lama.
export const addresses = pgTable("addresses", {
  id: uuid("id").primaryKey().defaultRandom(),
  recipientName: varchar("recipient_name", { length: 120 }),
  phone: varchar("phone", { length: 20 }),
  fullAddress: text("full_address").notNull(),
  kelurahan: varchar("kelurahan", { length: 80 }),
  kecamatan: varchar("kecamatan", { length: 80 }),
  city: varchar("city", { length: 80 }),
  province: varchar("province", { length: 80 }),
  postalCode: varchar("postal_code", { length: 10 }),
  country: char("country", { length: 2 }).notNull().default("ID"),
  latitude: numeric("latitude", { precision: 10, scale: 7 }),
  longitude: numeric("longitude", { precision: 10, scale: 7 }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const orders = pgTable(
  "orders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderToken: varchar("order_token", { length: 64 }).notNull().unique(),
    // RESTRICT, bukan SET NULL: user_id kosong berarti "pesanan tamu" yang bisa dibuka lewat token,
    // jadi menghapus akun tidak boleh diam-diam mengubah pesanan privat menjadi pesanan tamu.
    userId: uuid("user_id").references(() => users.id, { onDelete: "restrict" }),
    guestEmail: varchar("guest_email", { length: 150 }),
    guestPhone: varchar("guest_phone", { length: 20 }),
    addressId: uuid("address_id").references(() => addresses.id),
    // draft | awaiting_payment | paid | expired | cancelled | refunded
    status: varchar("status", { length: 30 }).notNull().default("draft"),
    subtotalAmount: bigint("subtotal_amount", { mode: "number" }).notNull(),
    shippingAmount: bigint("shipping_amount", { mode: "number" }).notNull().default(0),
    installationAmount: bigint("installation_amount", { mode: "number" }).notNull().default(0),
    totalAmount: bigint("total_amount", { mode: "number" }).notNull(),
    currency: char("currency", { length: 3 }).notNull().default("IDR"),
    // midtrans | stripe
    paymentGateway: varchar("payment_gateway", { length: 20 }),
    scheduledDeliveryDate: date("scheduled_delivery_date", { mode: "string" }),
    wantsInstallation: boolean("wants_installation").notNull().default(false),
    reservedUntil: timestamp("reserved_until", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("orders_status_idx").on(t.status),
    index("orders_user_id_idx").on(t.userId),
    index("orders_status_reserved_until_idx").on(t.status, t.reservedUntil),
    check("orders_status_valid", inList(t.status, ORDER_STATUSES)),
    check(
      "orders_payment_gateway_valid",
      sql`${t.paymentGateway} IS NULL OR ${inList(t.paymentGateway, PAYMENT_GATEWAYS)}`,
    ),
    check(
      "orders_amounts_nonneg",
      sql`${t.subtotalAmount} >= 0 AND ${t.shippingAmount} >= 0 AND ${t.installationAmount} >= 0 AND ${t.totalAmount} >= 0`,
    ),
    check(
      "orders_total_matches",
      sql`${t.totalAmount} = ${t.subtotalAmount} + ${t.shippingAmount} + ${t.installationAmount}`,
    ),
  ],
);

export const orderItems = pgTable(
  "order_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    // tanpa cascade supaya riwayat transaksi tetap ada
    productVariantId: uuid("product_variant_id")
      .notNull()
      .references(() => productVariants.id),
    qty: integer("qty").notNull(),
    // snapshot harga saat transaksi, bukan harga live
    unitPrice: bigint("unit_price", { mode: "number" }).notNull(),
    subtotal: bigint("subtotal", { mode: "number" }).notNull(),
  },
  (t) => [
    index("order_items_order_id_idx").on(t.orderId),
    check("order_items_qty_positive", sql`${t.qty} > 0`),
    check("order_items_amounts_nonneg", sql`${t.unitPrice} >= 0 AND ${t.subtotal} >= 0`),
    check("order_items_subtotal_matches", sql`${t.subtotal} = ${t.qty} * ${t.unitPrice}`),
  ],
);

export const shippingQuotes = pgTable(
  "shipping_quotes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    courier: varchar("courier", { length: 30 }).notNull(),
    serviceName: varchar("service_name", { length: 60 }).notNull(),
    price: bigint("price", { mode: "number" }).notNull(),
    etaDays: varchar("eta_days", { length: 20 }).notNull(),
    rawResponse: jsonb("raw_response"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("shipping_quotes_order_id_idx").on(t.orderId), check("shipping_quotes_price_nonneg", sql`${t.price} >= 0`)],
);

export const orderStatusLogs = pgTable(
  "order_status_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    fromStatus: varchar("from_status", { length: 30 }),
    toStatus: varchar("to_status", { length: 30 }).notNull(),
    // system | customer | midtrans
    actor: varchar("actor", { length: 30 }).notNull(),
    note: text("note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("order_status_logs_order_created_idx").on(t.orderId, t.createdAt),
    check("order_status_logs_actor_valid", inList(t.actor, ORDER_ACTORS)),
    check("order_status_logs_to_status_valid", inList(t.toStatus, ORDER_STATUSES)),
    check(
      "order_status_logs_from_status_valid",
      sql`${t.fromStatus} IS NULL OR ${inList(t.fromStatus, ORDER_STATUSES)}`,
    ),
  ],
);
