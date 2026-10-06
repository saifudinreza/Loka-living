import { and, eq, inArray } from "drizzle-orm";
import { db } from "../../db/client";
import { productVariants, products } from "../../db/schema";
import { AppError } from "../../lib/errors";
import { determineZone, getRates } from "./shipping-rate.service";

export interface EstimateItem {
  product_variant_id: string;
  qty: number;
}

// Hanya membaca database (satu query untuk berat semua varian); tidak menulis apa pun.
export async function estimateShipping(items: EstimateItem[], province: string, city: string) {
  // varian yang sama boleh muncul lebih dari sekali: jumlahkan qty-nya
  const qtyByVariant = new Map<string, number>();
  for (const item of items) {
    qtyByVariant.set(item.product_variant_id, (qtyByVariant.get(item.product_variant_id) ?? 0) + item.qty);
  }

  const rows = await db
    .select({ id: productVariants.id, weightKg: products.weightKg })
    .from(productVariants)
    .innerJoin(products, eq(products.id, productVariants.productId))
    .where(and(inArray(productVariants.id, [...qtyByVariant.keys()]), eq(products.status, "active")));

  // ada varian yang tidak ditemukan atau produknya non-aktif
  if (rows.length !== qtyByVariant.size) {
    throw new AppError(422, "VARIANT_NOT_FOUND", "Salah satu produk tidak ditemukan atau sudah tidak dijual.");
  }

  // hitung dalam sentikilogram (bilangan bulat) agar penjumlahan desimal tidak kena galat floating point
  const totalCentiKg = rows.reduce((sum, r) => sum + Math.round(Number(r.weightKg) * 100) * qtyByVariant.get(r.id)!, 0);
  const totalWeightKg = totalCentiKg / 100;

  return {
    zone: determineZone(city, province),
    total_weight_kg: totalWeightKg,
    options: getRates(totalWeightKg, city, province),
    note: "Estimasi. Ongkir final dihitung saat checkout.",
  };
}
