import { z } from "zod";

// Bentuk alamat dari GET/POST/PATCH /api/addresses.
export interface Address {
  id: string;
  label: string;
  recipient_name: string;
  phone: string;
  full_address: string;
  kelurahan: string | null;
  kecamatan: string | null;
  city: string;
  province: string;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  is_default: boolean;
}

export const MAX_ADDRESSES = 10;

// Aturan mencerminkan backend (issue 12), supaya kesalahan terlihat di form sebelum request dikirim.
// Server tetap yang menentukan: aturan ini hanya kenyamanan, bukan pengaman.
export const addressFormSchema = z.object({
  label: z.string().trim().min(1, "Label wajib diisi").max(40, "Label maksimal 40 karakter"),
  recipient_name: z.string().trim().min(1, "Nama penerima wajib diisi").max(120, "Nama maksimal 120 karakter"),
  phone: z
    .string()
    .trim()
    .min(8, "Nomor telepon minimal 8 karakter")
    .max(20, "Nomor telepon maksimal 20 karakter")
    .regex(/^[0-9+\- ]+$/, "Nomor telepon hanya boleh berisi angka, +, spasi, dan -")
    .refine((v) => v.replace(/\D/g, "").length >= 8, "Nomor telepon minimal 8 digit"),
  full_address: z.string().trim().min(5, "Alamat lengkap minimal 5 karakter").max(500, "Alamat maksimal 500 karakter"),
  province: z.string().trim().min(1, "Pilih provinsi"),
  // wajib: zona ongkir Jabodetabek ditentukan dari nama kota
  city: z.string().trim().min(1, "Kota / kabupaten wajib diisi").max(80, "Kota maksimal 80 karakter"),
  kecamatan: z.string().trim().max(80, "Kecamatan maksimal 80 karakter"),
  kelurahan: z.string().trim().max(80, "Kelurahan maksimal 80 karakter"),
  postal_code: z.string().trim().refine((v) => v === "" || /^\d{5}$/.test(v), "Kode pos harus 5 digit"),
  is_default: z.boolean(),
});

export type AddressFormValues = z.infer<typeof addressFormSchema>;

export const emptyAddressForm = (isDefault = false): AddressFormValues => ({
  label: "",
  recipient_name: "",
  phone: "",
  full_address: "",
  province: "",
  city: "",
  kecamatan: "",
  kelurahan: "",
  postal_code: "",
  is_default: isDefault,
});

export const formFromAddress = (a: Address): AddressFormValues => ({
  label: a.label,
  recipient_name: a.recipient_name,
  phone: a.phone,
  full_address: a.full_address,
  province: a.province,
  city: a.city,
  kecamatan: a.kecamatan ?? "",
  kelurahan: a.kelurahan ?? "",
  postal_code: a.postal_code ?? "",
  is_default: a.is_default,
});

const OPTIONAL = ["kecamatan", "kelurahan", "postal_code"] as const;
const REQUIRED = ["label", "recipient_name", "phone", "full_address", "province", "city"] as const;

/** Body POST: field opsional yang kosong tidak dikirim. */
export function toCreatePayload(values: AddressFormValues) {
  const body: Record<string, string | boolean> = {};
  for (const field of REQUIRED) body[field] = values[field].trim();
  for (const field of OPTIONAL) {
    const value = values[field].trim();
    if (value !== "") body[field] = value;
  }
  if (values.is_default) body.is_default = true;
  return body;
}

/**
 * Body PATCH: HANYA field yang berubah. Mengosongkan field opsional dikirim sebagai `null`.
 * `is_default` hanya dikirim saat berubah menjadi true (alamat utama tidak bisa "dilepas": pindahkan dengan
 * menjadikan alamat lain utama). Hasil kosong berarti tidak ada yang perlu dikirim.
 */
export function toPatchPayload(values: AddressFormValues, original: Address) {
  const body: Record<string, string | boolean | null> = {};
  for (const field of REQUIRED) {
    const value = values[field].trim();
    if (value !== original[field]) body[field] = value;
  }
  for (const field of OPTIONAL) {
    const value = values[field].trim();
    const before = original[field] ?? "";
    if (value !== before) body[field] = value === "" ? null : value;
  }
  if (values.is_default && !original.is_default) body.is_default = true;
  return body;
}
