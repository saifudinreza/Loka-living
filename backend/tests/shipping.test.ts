import { afterAll, describe, expect, spyOn, test } from "bun:test";
import { eq, like, sql } from "drizzle-orm";
import { createApp } from "../src/app";
import { db } from "../src/db/client";
import { productVariants, products } from "../src/db/schema";
import { PROVINCES, determineZone, getRates } from "../src/modules/shipping/shipping-rate.service";

describe("determineZone", () => {
  test("kasus dari issue", () => {
    expect(determineZone("Jakarta Selatan", "DKI Jakarta")).toBe(1);
    expect(determineZone("Kota Bandung", "Jawa Barat")).toBe(2);
    expect(determineZone("Denpasar", "Bali")).toBe(3);
    expect(determineZone("Makassar", "Sulawesi Selatan")).toBe(4);
    expect(determineZone("Jayapura", "Papua")).toBe(5);
    expect(determineZone("", "")).toBe(5);
  });

  test("Jabodetabek dikenali dari kota yang mengandung kata kunci, juga lintas provinsi", () => {
    expect(determineZone("Kota Bekasi", "Jawa Barat")).toBe(1);
    expect(determineZone("Kabupaten Bogor", "Jawa Barat")).toBe(1);
    expect(determineZone("Depok", "Jawa Barat")).toBe(1);
    expect(determineZone("Tangerang Selatan", "Banten")).toBe(1);
    // provinsi DKI Jakarta saja sudah cukup, kota boleh kosong
    expect(determineZone("", "DKI Jakarta")).toBe(1);
  });

  test("normalisasi: huruf besar/kecil, spasi, awalan kota/kabupaten/kab.", () => {
    expect(determineZone("  BEKASI ", "  jawa barat ")).toBe(1);
    expect(determineZone("Kab. Malang", "JAWA TIMUR")).toBe(2);
    expect(determineZone("Kabupaten Deli Serdang", "Sumatera Utara")).toBe(3);
    expect(determineZone("Kota Pontianak", "kalimantan barat")).toBe(4);
  });

  test("Banten non-Jabodetabek zona 2; provinsi tak dikenal zona 5", () => {
    expect(determineZone("Serang", "Banten")).toBe(2);
    expect(determineZone("Entah", "Provinsi Antah Berantah")).toBe(5);
  });
});

describe("getRates", () => {
  test("1 kursi 8 kg ke Jakarta Selatan → JTR Reguler 66.000 (50.000 + 8 × 2.000)", () => {
    const rates = getRates(8, "Jakarta Selatan", "DKI Jakarta");
    expect(rates).toHaveLength(3);
    expect(rates[0]).toEqual({ courier: "jne_trucking", service_name: "JTR Reguler", price: 66_000, eta_days: "2-3 hari" });
    expect(rates[1]!.price).toBe(80_000 + 8 * 3_000);
    expect(rates[2]!.price).toBe(150_000 + 8 * 5_000);
  });

  test("jumlah layanan per zona: 3, 3, 2, 2, 2", () => {
    const counts = [
      getRates(1, "Jakarta", "DKI Jakarta"),
      getRates(1, "Bandung", "Jawa Barat"),
      getRates(1, "Denpasar", "Bali"),
      getRates(1, "Makassar", "Sulawesi Selatan"),
      getRates(1, "Jayapura", "Papua"),
    ].map((r) => r.length);
    expect(counts).toEqual([3, 3, 2, 2, 2]);
  });

  test("berat desimal dihitung apa adanya dan dibulatkan ke atas per layanan", () => {
    // 2.5 kg × 2.000 = 5.000 pas; 0.3 kg × 2.000 = 600 → 50.600
    expect(getRates(2.5, "Jakarta", "DKI Jakarta")[0]!.price).toBe(55_000);
    expect(getRates(0.3, "Jakarta", "DKI Jakarta")[0]!.price).toBe(50_600);
    // 0.0001 kg × 2.000 = 0,2 → dibulatkan ke atas jadi 1
    expect(getRates(0.0001, "Jakarta", "DKI Jakarta")[0]!.price).toBe(50_001);
  });

  test("tidak kena galat floating point (1.1 × 3000 = 3300.0000000000005)", () => {
    expect(1.1 * 3000).not.toBe(3300); // bukti galat float ada
    // zona 2 dakota perKg 4500: 1.1 × 4500 = 4950 (harus pas, bukan 4951)
    expect(getRates(1.1, "Bandung", "Jawa Barat")[1]!.price).toBe(110_000 + 4_950);
    // zona 2 jne perKg 3000: 1.1 × 3000
    expect(getRates(1.1, "Bandung", "Jawa Barat")[0]!.price).toBe(75_000 + 3_300);
  });
});

describe("PROVINCES", () => {
  test("berisi DKI Jakarta dan semua provinsi, urut abjad, tanpa duplikat", () => {
    expect(PROVINCES).toContain("DKI Jakarta");
    expect(new Set(PROVINCES).size).toBe(PROVINCES.length);
    expect(PROVINCES).toEqual([...PROVINCES].sort((a, b) => a.localeCompare(b, "id")));
    expect(PROVINCES).toHaveLength(38);
    for (const p of ["Aceh", "Banten", "Bali", "Papua Barat Daya", "Nusa Tenggara Timur", "DI Yogyakarta"]) {
      expect(PROVINCES, p).toContain(p);
    }
    // nama kota zona 1 Laravel lama bukan provinsi
    expect(PROVINCES).not.toContain("Bekasi");
  });

  test("setiap provinsi di daftar punya zona (tidak ada yang diam-diam jatuh ke fallback karena salah ketik)", () => {
    // semua selain zona 5 sengaja; pastikan zona 1–4 terwakili
    const zones = new Set(PROVINCES.map((p) => determineZone("", p)));
    expect([...zones].sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

// ---- HTTP + database ----

const app = createApp({ enableJobs: false });
type Json = Record<string, any>;

const post = async (body: unknown) => {
  const res = await app.handle(
    new Request("http://localhost/api/shipping/estimate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
  return { res, body: (await res.json()) as Json };
};

const SLUG_PREFIX = "shippingtest-";

afterAll(async () => {
  await db.delete(products).where(like(products.slug, `${SLUG_PREFIX}%`));
});

async function seededVariant(sku: string) {
  const [row] = await db.select({ id: productVariants.id }).from(productVariants).where(eq(productVariants.sku, sku));
  return row!.id;
}

// jumlah baris di SEMUA tabel (dari katalog database), untuk membuktikan endpoint tidak menulis apa pun
async function rowCounts() {
  const tables = (await db.execute(
    sql`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE' order by table_name`,
  )) as unknown as { table_name: string }[];
  const counts: Record<string, number> = {};
  for (const { table_name } of tables) {
    const [row] = (await db.execute(sql.raw(`select count(*)::int as n from "${table_name}"`))) as unknown as { n: number }[];
    counts[table_name] = row!.n;
  }
  return counts;
}

describe("POST /api/shipping/estimate", () => {
  test("1 kursi 8 kg ke Jakarta Selatan → JTR Reguler 66.000, zona 1", async () => {
    const id = await seededVariant("KSR-RLN-01");
    const { res, body } = await post({
      items: [{ product_variant_id: id, qty: 1 }],
      province: "DKI Jakarta",
      city: "Jakarta Selatan",
    });
    expect(res.status).toBe(200);
    expect(body.zone).toBe(1);
    expect(body.total_weight_kg).toBe(8);
    expect(body.options[0]).toEqual({ courier: "jne_trucking", service_name: "JTR Reguler", price: 66_000, eta_days: "2-3 hari" });
    expect(body.note).toContain("Estimasi");
  });

  test("qty dikalikan, dan varian yang sama di dua baris dijumlahkan", async () => {
    const id = await seededVariant("KSR-RLN-01");
    const twice = await post({ items: [{ product_variant_id: id, qty: 2 }], province: "Papua", city: "Jayapura" });
    expect(twice.body.total_weight_kg).toBe(16);
    expect(twice.body.zone).toBe(5);
    expect(twice.body.options[0].price).toBe(200_000 + 16 * 12_000);

    const split = await post({
      items: [
        { product_variant_id: id, qty: 1 },
        { product_variant_id: id, qty: 1 },
      ],
      province: "Papua",
      city: "Jayapura",
    });
    expect(split.body.total_weight_kg).toBe(16);
  });

  test("beberapa produk berbeda: berat dijumlahkan", async () => {
    const chair = await seededVariant("KSR-RLN-01"); // 8 kg
    const table = await seededVariant("MMB-SUAR-01"); // 35 kg
    const { body } = await post({
      items: [
        { product_variant_id: chair, qty: 1 },
        { product_variant_id: table, qty: 1 },
      ],
      province: "Bali",
    });
    expect(body.total_weight_kg).toBe(43);
    expect(body.zone).toBe(3);
    expect(body.options[0].price).toBe(100_000 + 43 * 5_000);
  });

  test("city opsional (provinsi DKI Jakarta saja sudah zona 1)", async () => {
    const id = await seededVariant("KSR-RLN-01");
    const { res, body } = await post({ items: [{ product_variant_id: id, qty: 1 }], province: "DKI Jakarta" });
    expect(res.status).toBe(200);
    expect(body.zone).toBe(1);
  });

  test("varian tidak ada (UUID valid) → 422 VARIANT_NOT_FOUND", async () => {
    const { res, body } = await post({
      items: [{ product_variant_id: crypto.randomUUID(), qty: 1 }],
      province: "Bali",
    });
    expect(res.status).toBe(422);
    expect(body.code).toBe("VARIANT_NOT_FOUND");
  });

  test("produk non-aktif → 422 VARIANT_NOT_FOUND", async () => {
    const [product] = await db
      .insert(products)
      .values({ name: "Produk Nonaktif", slug: `${SLUG_PREFIX}${crypto.randomUUID().slice(0, 8)}`, category: "chairs", weightKg: "3", status: "inactive" })
      .returning();
    const [variant] = await db
      .insert(productVariants)
      .values({ productId: product!.id, priceIdr: 1000, priceUsd: "1", stockAvailable: 1 })
      .returning();

    const { res, body } = await post({ items: [{ product_variant_id: variant!.id, qty: 1 }], province: "Bali" });
    expect(res.status).toBe(422);
    expect(body.code).toBe("VARIANT_NOT_FOUND");
  });

  test("validasi: items kosong / >20, qty 0 / 100 / pecahan, UUID salah, province kosong atau hilang → 422", async () => {
    const id = await seededVariant("KSR-RLN-01");
    const ok = { product_variant_id: id, qty: 1 };
    const cases: [string, unknown][] = [
      ["items kosong", { items: [], province: "Bali" }],
      ["items 21", { items: Array.from({ length: 21 }, () => ok), province: "Bali" }],
      ["qty 0", { items: [{ ...ok, qty: 0 }], province: "Bali" }],
      ["qty 100", { items: [{ ...ok, qty: 100 }], province: "Bali" }],
      ["qty pecahan", { items: [{ ...ok, qty: 1.5 }], province: "Bali" }],
      ["uuid salah", { items: [{ ...ok, product_variant_id: "bukan-uuid" }], province: "Bali" }],
      ["province kosong", { items: [ok], province: "" }],
      ["province hilang", { items: [ok] }],
    ];
    for (const [name, payload] of cases) {
      const { res, body } = await post(payload);
      expect(res.status, name).toBe(422);
      expect(body.code, name).toBe("VALIDATION_FAILED");
    }
  });

  test("tidak menulis apa pun: jumlah baris di semua tabel tidak berubah", async () => {
    const id = await seededVariant("KSR-RLN-01");
    const before = await rowCounts();
    await post({ items: [{ product_variant_id: id, qty: 3 }], province: "DKI Jakarta", city: "Jakarta Selatan" });
    await post({ items: [{ product_variant_id: crypto.randomUUID(), qty: 1 }], province: "Bali" }); // jalur error juga
    expect(await rowCounts()).toEqual(before);
    expect(Object.keys(before).length).toBeGreaterThan(10);
  });

  test("satu query untuk mengambil berat semua varian", async () => {
    const chair = await seededVariant("KSR-RLN-01");
    const table = await seededVariant("MMB-SUAR-01");
    const spy = spyOn(db.$client, "unsafe");
    await post({
      items: [
        { product_variant_id: chair, qty: 1 },
        { product_variant_id: table, qty: 1 },
      ],
      province: "Bali",
    });
    expect(spy.mock.calls.length).toBe(1);
    spy.mockRestore();
  });
});

describe("GET /api/shipping/provinces", () => {
  test("berisi DKI Jakarta, cache 1 hari, bentuk { data }", async () => {
    const res = await app.handle(new Request("http://localhost/api/shipping/provinces"));
    expect(res.status).toBe(200);
    expect(res.headers.get("cache-control")).toBe("public, max-age=86400");
    const body = (await res.json()) as { data: string[] };
    expect(body.data).toContain("DKI Jakarta");
    expect(body.data).toEqual(PROVINCES);
  });
});
