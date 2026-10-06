// Tarif ongkir manual 5 zona (belum ada integrasi API kurir). Fungsi murni, tanpa database:
// dipakai oleh endpoint estimasi (issue 09) dan checkout (issue 14).
//
// Rumus per layanan: price = base_rate + ceil(total_berat_kg * per_kg)

export type Zone = 1 | 2 | 3 | 4 | 5;

export interface ShippingRate {
  courier: string;
  service_name: string;
  price: number;
  eta_days: string;
}

// Zona 1 ditentukan dari kota (lihat determineZone); zona 2–5 dari provinsi.
const ZONE_PROVINCES: Record<2 | 3 | 4 | 5, string[]> = {
  // Jawa selain Jabodetabek, plus Banten
  2: ["Jawa Barat", "Jawa Tengah", "DI Yogyakarta", "Jawa Timur", "Banten"],
  // Sumatera + Bali
  3: [
    "Aceh",
    "Sumatera Utara",
    "Sumatera Barat",
    "Riau",
    "Kepulauan Riau",
    "Jambi",
    "Bengkulu",
    "Sumatera Selatan",
    "Bangka Belitung",
    "Lampung",
    "Bali",
  ],
  // Kalimantan, Sulawesi, Nusa Tenggara
  4: [
    "Kalimantan Barat",
    "Kalimantan Tengah",
    "Kalimantan Selatan",
    "Kalimantan Timur",
    "Kalimantan Utara",
    "Sulawesi Utara",
    "Sulawesi Tengah",
    "Sulawesi Selatan",
    "Sulawesi Tenggara",
    "Sulawesi Barat",
    "Gorontalo",
    "Nusa Tenggara Barat",
    "Nusa Tenggara Timur",
  ],
  // Maluku, Papua (dan fallback untuk yang tidak dikenali)
  // "Papua Barat Daya" (dibentuk 2022) tidak ada di tabel Laravel lama; ditambahkan agar muncul di dropdown
  5: [
    "Maluku",
    "Maluku Utara",
    "Papua",
    "Papua Barat",
    "Papua Barat Daya",
    "Papua Selatan",
    "Papua Tengah",
    "Papua Pegunungan",
  ],
};

// Zona 1 (Jabodetabek). DKI Jakarta provinsinya; kota-kota penyangga dikenali dari nama kota.
const JABODETABEK_PROVINCE = "DKI Jakarta";
const JABODETABEK_CITY_KEYWORDS = ["jakarta", "bekasi", "bogor", "depok", "tangerang"];

/** Semua provinsi dari tabel zona (termasuk DKI Jakarta), urut abjad, tanpa duplikat. Untuk dropdown di frontend. */
export const PROVINCES: string[] = [...new Set([JABODETABEK_PROVINCE, ...Object.values(ZONE_PROVINCES).flat()])].sort(
  (a, b) => a.localeCompare(b, "id"),
);

type RateRow = readonly [courier: string, serviceName: string, baseRate: number, perKg: number, eta: string];

const RATES: Record<Zone, readonly RateRow[]> = {
  1: [
    ["jne_trucking", "JTR Reguler", 50_000, 2_000, "2-3 hari"],
    ["dakota", "Dakota Darat", 80_000, 3_000, "1-2 hari"],
    ["deliveree", "Same-day Truck", 150_000, 5_000, "1 hari"],
  ],
  2: [
    ["jne_trucking", "JTR Reguler", 75_000, 3_000, "3-5 hari"],
    ["dakota", "Dakota Darat", 110_000, 4_500, "2-4 hari"],
    ["deliveree", "Next-day Truck", 200_000, 7_000, "1-2 hari"],
  ],
  3: [
    ["jne_trucking", "JTR Reguler", 100_000, 5_000, "4-7 hari"],
    ["dakota", "Dakota Laut", 150_000, 7_000, "3-6 hari"],
  ],
  4: [
    ["jne_trucking", "JTR Reguler", 150_000, 8_000, "5-9 hari"],
    ["dakota", "Dakota Laut", 200_000, 10_000, "4-8 hari"],
  ],
  5: [
    ["jne_trucking", "JTR Reguler", 200_000, 12_000, "7-14 hari"],
    ["dakota", "Dakota Laut", 250_000, 15_000, "6-12 hari"],
  ],
};

// trim, lowercase, buang awalan "kota " / "kabupaten " / "kab. "
function normalize(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^(kota|kabupaten|kab\.)\s+/, "");
}

const ZONE_BY_PROVINCE = new Map<string, Zone>(
  (Object.entries(ZONE_PROVINCES) as [string, string[]][]).flatMap(([zone, names]) =>
    names.map((name) => [normalize(name), Number(zone) as Zone] as const),
  ),
);

/**
 * Beda dari Laravel lama: kode lama mencocokkan kota persis "Jakarta", sehingga "Jakarta Selatan"
 * (provinsi "DKI Jakarta") jatuh ke zona 5 (tarif Papua). Sekarang kota cukup MENGANDUNG kata kunci,
 * dan provinsi DKI Jakarta otomatis zona 1.
 */
export function determineZone(city: string, province: string): Zone {
  const c = normalize(city);
  const p = normalize(province);

  if (p === normalize(JABODETABEK_PROVINCE) || JABODETABEK_CITY_KEYWORDS.some((k) => c.includes(k))) return 1;
  return ZONE_BY_PROVINCE.get(p) ?? 5;
}

/**
 * Beda dari Laravel lama: berat dipakai desimal (tidak dibulatkan ke integer dulu).
 * Perkalian dibulatkan ke 6 desimal sebelum ceil agar tidak kena galat floating point
 * (mis. 1.1 * 3000 = 3300.0000000000005 yang bisa menaikkan harga 1 rupiah).
 */
export function getRates(totalWeightKg: number, city: string, province: string): ShippingRate[] {
  const zone = determineZone(city, province);
  return RATES[zone].map(([courier, service_name, baseRate, perKg, eta_days]) => ({
    courier,
    service_name,
    price: baseRate + Math.ceil(Number((totalWeightKg * perKg).toFixed(6))),
    eta_days,
  }));
}
