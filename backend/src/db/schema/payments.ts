import { bigint, index, jsonb, pgTable, text, timestamp, uuid, varchar } from "drizzle-orm/pg-core";
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
    status: varchar("status", { length: 30 }).notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    // payload webhook asli untuk audit & debug
    rawPayload: jsonb("raw_payload"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [index("payment_transactions_order_id_idx").on(t.orderId)],
);

export const processedWebhooks = pgTable("processed_webhooks", {
  id: uuid("id").primaryKey().defaultRandom(),
  gateway: varchar("gateway", { length: 20 }).notNull(),
  eventId: varchar("event_id", { length: 150 }).notNull().unique(),
  processedAt: timestamp("processed_at", { withTimezone: true }).notNull().defaultNow(),
});
