import { sql } from "drizzle-orm";
import { bigint, check, index, jsonb, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
import { PAYMENT_GATEWAYS, inList } from "./enums";
import { orders } from "./orders";

export const paymentTransactions = pgTable(
  "payment_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    orderId: uuid("order_id")
      .notNull()
      .references(() => orders.id, { onDelete: "cascade" }),
    gateway: varchar("gateway", { length: 20 }).notNull(),
    gatewayTransactionId: varchar("gateway_transaction_id", { length: 120 }).unique(),
    gatewayPaymentMethod: varchar("gateway_payment_method", { length: 40 }),
    requestedMethod: varchar("requested_method", { length: 30 }),
    snapToken: varchar("snap_token", { length: 255 }),
    snapRedirectUrl: text("snap_redirect_url"),
    // status mentah dari gateway (settlement, expire, deny, ...). Sengaja tanpa CHECK:
    // kalau Midtrans menambah status baru, webhook tidak boleh gagal disimpan.
    status: varchar("status", { length: 30 }).notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    // payload webhook asli untuk audit & debug. Bisa memuat email/telepon pembeli:
    // tentukan masa simpan (mis. hapus/anonimkan setelah 1 tahun) sebelum produksi.
    rawPayload: jsonb("raw_payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("payment_transactions_order_id_idx").on(t.orderId),
    check("payment_transactions_gateway_valid", inList(t.gateway, PAYMENT_GATEWAYS)),
    check("payment_transactions_amount_nonneg", sql`${t.amount} >= 0`),
  ],
);

export const processedWebhooks = pgTable("processed_webhooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  gateway: varchar("gateway", { length: 20 }).notNull(),
  eventId: varchar("event_id", { length: 150 }).notNull().unique(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});
