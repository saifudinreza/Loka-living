import { AppError } from "../../lib/errors";
import { PROVINCES } from "../shipping/shipping-rate.service";

// Validasi isi alamat (dipakai POST dan PATCH). Fungsi murni, tanpa database.
// TypeBox di route hanya memeriksa TIPE dan batas ukuran kasar; aturan isi (trim, telepon, provinsi, koordinat)
// ada di sini karena TypeBox tidak bisa men-trim dan tidak bisa membandingkan dengan daftar provinsi.

export interface AddressFields {
  label: string;
  recipient_name: string;
  phone: string;
  full_address: string;
  province: string;
  city: string;
  kecamatan: string | null;
  kelurahan: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
}

type Raw = Record<string, unknown>;

const invalid = (field: string) =>
  new AppError(422, "VALIDATION_FAILED", `Data tidak valid pada field "${field}".`);

// Pesan hanya menyebut NAMA field, tidak pernah mengulang isi input (nama/telepon/alamat adalah data pribadi).

/** trim; teks kosong atau hanya spasi dianggap kosong (null). */
function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function required(raw: Raw, field: string, min: number, max: number): string {
  const value = clean(raw[field]);
  if (value === null || value.length < min || value.length > max) throw invalid(field);
  return value;
}

function optional(raw: Raw, field: string, max: number): string | null {
  const given = raw[field];
  if (given !== undefined && given !== null && typeof given !== "string") throw invalid(field);
  const value = clean(given);
  if (value !== null && value.length > max) throw invalid(field);
  return value;
}

function phone(raw: Raw): string {
  const value = required(raw, "phone", 8, 20);
  // hanya angka, +, spasi, -; dan minimal 8 DIGIT (agar "--- +++" tidak lolos)
  if (!/^[0-9+\- ]+$/.test(value) || value.replace(/\D/g, "").length < 8) throw invalid("phone");
  return value;
}

function province(raw: Raw): string {
  const value = required(raw, "province", 1, 80);
  // persis sama dengan daftar di GET /api/shipping/provinces: nama lain membuat tarif ongkir salah
  if (!PROVINCES.includes(value)) throw invalid("province");
  return value;
}

function postalCode(raw: Raw): string | null {
  const given = raw.postal_code;
  if (given !== undefined && given !== null && typeof given !== "string") throw invalid("postal_code");
  const value = clean(given);
  if (value !== null && !/^\d{5}$/.test(value)) throw invalid("postal_code");
  return value;
}

function coordinate(raw: Raw, field: "latitude" | "longitude", limit: number): number | null {
  const value = raw[field];
  if (value === null || value === undefined) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > limit) throw invalid(field);
  // kolom numeric(10,7): maksimal 7 desimal
  if (Math.abs(value * 1e7 - Math.round(value * 1e7)) > 1e-6) throw invalid(field);
  return value;
}

/** Garis lintang dan bujur harus diisi berpasangan: keduanya ada atau keduanya kosong. */
export function assertCoordinatesPaired(latitude: number | null, longitude: number | null) {
  if ((latitude === null) !== (longitude === null)) throw invalid(latitude === null ? "latitude" : "longitude");
}

/** Untuk POST. `label` boleh dikosongkan (default "Alamat"); field lain sesuai tabel di issue 12. */
export function parseCreate(raw: Raw): AddressFields {
  const fields: AddressFields = {
    label: optional(raw, "label", 40) ?? "Alamat",
    recipient_name: required(raw, "recipient_name", 1, 120),
    phone: phone(raw),
    full_address: required(raw, "full_address", 5, 500),
    province: province(raw),
    // city WAJIB: zona ongkir Jabodetabek ditentukan dari nama kota (determineZone)
    city: required(raw, "city", 1, 80),
    kecamatan: optional(raw, "kecamatan", 80),
    kelurahan: optional(raw, "kelurahan", 80),
    postal_code: postalCode(raw),
    latitude: coordinate(raw, "latitude", 90),
    longitude: coordinate(raw, "longitude", 180),
  };
  assertCoordinatesPaired(fields.latitude, fields.longitude);
  return fields;
}

/**
 * Untuk PATCH: hanya field yang DIKIRIM yang diperiksa dan dikembalikan (pilih eksplisit: `id`, `user_id`, `created_at`
 * di body diabaikan). `null` berarti mengosongkan field opsional; untuk field wajib `null` ditolak.
 */
export function parsePatch(raw: Raw): Partial<AddressFields> {
  const patch: Partial<AddressFields> = {};

  for (const [field, min, max] of [
    ["label", 1, 40],
    ["recipient_name", 1, 120],
    ["full_address", 5, 500],
    ["city", 1, 80],
  ] as const) {
    if (field in raw) patch[field] = required(raw, field, min, max);
  }
  if ("phone" in raw) patch.phone = phone(raw);
  if ("province" in raw) patch.province = province(raw);

  if ("kecamatan" in raw) patch.kecamatan = optional(raw, "kecamatan", 80);
  if ("kelurahan" in raw) patch.kelurahan = optional(raw, "kelurahan", 80);
  if ("postal_code" in raw) patch.postal_code = postalCode(raw);
  if ("latitude" in raw) patch.latitude = coordinate(raw, "latitude", 90);
  if ("longitude" in raw) patch.longitude = coordinate(raw, "longitude", 180);

  return patch;
}
