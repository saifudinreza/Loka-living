import type { DocumentDecoration } from "elysia";

// Teks dokumentasi Swagger untuk endpoint buku alamat. Hanya dokumentasi: tidak mengubah perilaku API.

const TAG = "Addresses";

const json = (example: unknown) => ({ "application/json": { example } });
const errorExample = (code: string, error: string) => json({ error, code });

const addressExample = {
  id: "5b1c0a52-9f0e-4d56-8a3c-2f7a1b9e4c10",
  label: "Rumah",
  recipient_name: "Budi Santoso",
  phone: "+62 812 3456 7890",
  full_address: "Jl. Kaliurang KM 5 No. 12",
  kelurahan: "Caturtunggal",
  kecamatan: "Depok",
  city: "Sleman",
  province: "DI Yogyakarta",
  postal_code: "55281",
  latitude: -7.7661,
  longitude: 110.3772,
  is_default: true,
};

const unauthorized = {
  description: "Tanpa token, token tidak valid, atau kedaluwarsa",
  content: errorExample("UNAUTHORIZED", "Silakan login dulu."),
};
const notFound = {
  description: "Alamat tidak ada atau bukan milik user (keduanya 404 agar keberadaan data tidak bocor)",
  content: errorExample("ADDRESS_NOT_FOUND", "Alamat tidak ditemukan."),
};

const shared = {
  tags: [TAG],
  security: [{ bearerAuth: [] as string[] }],
};

const rules = [
  "Aturan isi:",
  "- `recipient_name` 1–120, `full_address` 5–500, `city` **wajib** 1–80 (zona ongkir Jabodetabek ditentukan dari nama kota).",
  "- `phone` 8–20 karakter berisi angka, `+`, spasi, `-`, dan minimal 8 digit.",
  "- `province` harus persis salah satu dari `GET /api/shipping/provinces`.",
  "- `postal_code` tepat 5 digit; `latitude` −90..90 dan `longitude` −180..180 (maks 7 desimal), diisi berpasangan.",
  "- Teks di-trim; isian yang hanya spasi dianggap kosong.",
].join("\n");

export const addressesDocs = {
  get: {
    ...shared,
    summary: "Daftar alamat user yang login",
    description: "Alamat utama paling atas, sisanya terbaru dulu. Respons `Cache-Control: private, no-store` (data pribadi).",
    responses: {
      200: { description: "Daftar alamat (kosong: `data: []`)", content: json({ data: [addressExample] }) },
      401: unauthorized,
    },
  },

  post: {
    ...shared,
    summary: "Tambah alamat",
    description: [
      "- Alamat **pertama** otomatis menjadi utama.",
      "- `is_default: true` melepas status utama alamat lain (dalam satu transaksi).",
      "- Maksimal 10 alamat (`ADDRESS_LIMIT_REACHED`). `label` boleh dikosongkan (default `\"Alamat\"`).",
      "",
      rules,
    ].join("\n"),
    responses: {
      201: { description: "Alamat dibuat", content: json({ data: addressExample }) },
      401: unauthorized,
      422: {
        description: "`VALIDATION_FAILED` (isi tidak valid) atau `ADDRESS_LIMIT_REACHED`",
        content: errorExample("ADDRESS_LIMIT_REACHED", "Buku alamat maksimal 10 alamat."),
      },
    },
  },

  patch: {
    ...shared,
    summary: "Ubah sebagian field alamat",
    description: [
      "Hanya field yang dikirim yang diubah. Mengosongkan field opsional (`kecamatan`, `kelurahan`, `postal_code`, `latitude`/`longitude`) dengan `null`; field wajib tidak boleh `null`. Body kosong ditolak.",
      "",
      "- `is_default: true` → menjadi alamat utama (yang lama dilepas).",
      "- `is_default: false` pada alamat utama → `DEFAULT_ADDRESS_REQUIRED` (jadikan alamat lain utama untuk memindahkannya).",
      "- `id`, `user_id`, `created_at` di body diabaikan.",
      "",
      rules,
    ].join("\n"),
    responses: {
      200: { description: "Alamat terbaru", content: json({ data: addressExample }) },
      401: unauthorized,
      404: notFound,
      422: {
        description: "`VALIDATION_FAILED` atau `DEFAULT_ADDRESS_REQUIRED`",
        content: errorExample("DEFAULT_ADDRESS_REQUIRED", "Harus ada satu alamat utama. Jadikan alamat lain sebagai utama untuk memindahkannya."),
      },
    },
  },

  delete: {
    ...shared,
    summary: "Hapus alamat",
    description: [
      "Kalau yang dihapus alamat utama dan masih ada alamat lain, alamat **terbaru** menjadi utama.",
      "Berbeda dari keranjang dan wishlist, alamat yang tidak ada menghasilkan **404** (bukan 204 idempoten).",
      "Pesanan lama tidak terpengaruh: checkout memakai salinan di tabel `addresses`.",
    ].join("\n"),
    responses: { 204: { description: "Dihapus (tanpa body)" }, 401: unauthorized, 404: notFound },
  },
} satisfies Record<string, DocumentDecoration>;
