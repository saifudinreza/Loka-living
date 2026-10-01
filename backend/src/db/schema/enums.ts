import { type AnyColumn, sql } from "drizzle-orm";

// Nilai tetap yang dipakai skema dan kode aplikasi. Dibatasi lewat CHECK constraint
// (bukan pgEnum) karena menambah nilai pada CHECK cukup satu migrasi biasa,
// sedangkan mengubah tipe enum Postgres jauh lebih merepotkan.

export const ORDER_STATUSES = ["draft", "awaiting_payment", "paid", "expired", "cancelled", "refunded"] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const ORDER_ACTORS = ["system", "customer", "midtrans"] as const;
export type OrderActor = (typeof ORDER_ACTORS)[number];

export const PAYMENT_GATEWAYS = ["midtrans", "stripe"] as const;
export type PaymentGateway = (typeof PAYMENT_GATEWAYS)[number];

export const PRODUCT_STATUSES = ["active", "inactive"] as const;
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];

// Hanya untuk konstanta di atas (bukan input user), jadi aman dirangkai sebagai literal SQL.
// DDL tidak mendukung parameter, makanya tidak memakai placeholder.
export function inList(column: AnyColumn, values: readonly string[]) {
  const literal = values.map((v) => `'${v}'`).join(", ");
  return sql`${column} IN (${sql.raw(literal)})`;
}
