import type { DocumentDecoration } from "elysia";

// Teks dokumentasi Swagger untuk endpoint checkout. Hanya dokumentasi: tidak mengubah perilaku API.

const json = (example: unknown) => ({ "application/json": { example } });
const errorExample = (code: string, error: string) => json({ error, code });

export const checkoutDocs = {
  init: {
    tags: ["Checkout"],
    // login opsional: tanpa token = tamu, dengan token = pesanan tercatat di akun
    security: [{} as Record<string, string[]>, { bearerAuth: [] as string[] }],
    summary: "Mulai checkout: tahan stok 30 menit dan buat order draft",
    description: [
      "Menahan stok untuk pembeli selama 30 menit supaya dua orang yang membeli stok terakhir bersamaan tidak sama-sama berhasil (oversell).",
      "",
      "- **Tamu boleh** (tanpa token). Dengan header `Authorization: Bearer <access_token>`, order tercatat di akun (`user_id`). Token yang dikirim tapi tidak valid → 401, bukan dianggap tamu.",
      "- Item dengan varian yang sama digabung (qty dijumlahkan). Harga **selalu dari database**; field `price` di body diabaikan.",
      "- Keranjang tidak dikosongkan di sini (checkout bisa batal); itu dilakukan saat order `paid`.",
      "- Maksimal 5 order draft aktif per user login (`TOO_MANY_PENDING_ORDERS`) dan 10 permintaan per menit per IP (429).",
      "- `order_token` berfungsi seperti kata sandi pesanan tamu: respons `Cache-Control: no-store`, jangan dicatat di log.",
    ].join("\n"),
    responses: {
      200: {
        description: "Stok ditahan, order draft dibuat",
        content: json({
          order_token: "kqW3...64 karakter acak...Zx9",
          reserved_until: "2026-10-09T13:30:00.000Z",
          items: [
            {
              product_variant_id: "8d8302c0-e7b6-4c0b-ae59-69813fe07807",
              product_name: "Kursi Santai Rukun",
              sku: "KSR-RLN-01",
              material: "Rotan & Linen",
              color_hex: "#C99A66",
              qty: 1,
              unit_price: 2450000,
              subtotal: 2450000,
              image_url: "/images/products/ksr-rln-01-1.jpg",
            },
          ],
          subtotal_amount: 2450000,
          currency: "IDR",
        }),
      },
      401: {
        description: "Token dikirim tapi tidak valid atau kedaluwarsa",
        content: errorExample("UNAUTHORIZED", "Silakan login dulu."),
      },
      422: {
        description:
          "`VALIDATION_FAILED` (body tidak valid, atau qty gabungan satu varian > 99), `VARIANT_NOT_FOUND`, `STOCK_INSUFFICIENT`, atau `TOO_MANY_PENDING_ORDERS`",
        content: errorExample("STOCK_INSUFFICIENT", "Stok Kursi Santai Rukun (Rotan & Linen) tidak mencukupi. Tersedia: 1, diminta: 2"),
      },
      429: {
        description: "Terlalu sering memanggil (maks 10 permintaan/menit per IP)",
        content: errorExample("TOO_MANY_REQUESTS", "Terlalu banyak percobaan. Coba lagi sebentar lagi."),
      },
    },
  },
  shippingRate: {
    tags: ["Checkout"],
    security: [{} as Record<string, string[]>, { bearerAuth: [] as string[] }],
    summary: "Simpan alamat order dan hitung ongkir",
    description: [
      "Langkah kedua checkout. Menyimpan alamat kirim untuk order draft, lalu menghitung ongkir dengan tabel tarif yang sama dengan `POST /api/shipping/estimate`.",
      "",
      "- Alamat diisi dengan **tepat salah satu**: `address` (alamat baru, hanya `full_address` yang wajib) atau `address_id` (alamat tersimpan, butuh login). Keduanya ada atau keduanya kosong → 422.",
      "- `save_address: true` (butuh login, hanya bersama `address`) juga menyimpan alamat ke buku alamat dengan label `Alamat`. Kalau buku alamat penuh, checkout tetap lanjut; alamat saja yang tidak disimpan.",
      "- Order memakai **salinan** alamat: mengedit alamat tersimpan sesudahnya tidak mengubah alamat order.",
      "- Setiap pemanggilan menghapus quote lama order dan menyimpan quote baru (berlaku 30 menit). Harga quote inilah yang dipakai `confirm`.",
      "- `available_delivery_dates`: H+1 sampai H+7 menurut kalender Asia/Jakarta.",
    ].join("\n"),
    responses: {
      200: {
        description: "Alamat tersimpan, opsi ongkir dihitung",
        content: json({
          options: [{ courier: "jne_trucking", service_name: "JTR Reguler", price: 66000, eta_days: "2-3 hari" }],
          available_delivery_dates: ["2026-10-02", "2026-10-03", "2026-10-04", "2026-10-05", "2026-10-06", "2026-10-07", "2026-10-08"],
        }),
      },
      401: { description: "`address_id` / `save_address` tanpa login, atau token tidak valid", content: errorExample("UNAUTHORIZED", "Silakan login dulu.") },
      404: {
        description: "`ORDER_NOT_FOUND` (tidak ada, bukan draft, atau milik user lain) atau `ADDRESS_NOT_FOUND` (`address_id` tidak ada / bukan milik user)",
        content: errorExample("ORDER_NOT_FOUND", "Pesanan tidak ditemukan."),
      },
      410: { description: "Reservasi stok sudah lewat", content: errorExample("RESERVATION_EXPIRED", "Reservasi stok sudah berakhir. Mulai checkout lagi.") },
      422: { description: "`VALIDATION_FAILED`", content: errorExample("VALIDATION_FAILED", 'Kirim salah satu dari "address" atau "address_id".') },
      429: { description: "Terlalu sering memanggil (maks 30 permintaan/menit per IP)", content: errorExample("TOO_MANY_REQUESTS", "Terlalu banyak percobaan. Coba lagi sebentar lagi.") },
    },
  },
  confirm: {
    tags: ["Checkout"],
    security: [{} as Record<string, string[]>, { bearerAuth: [] as string[] }],
    summary: "Hitung total final dan buat transaksi Midtrans Snap",
    description: [
      "Langkah terakhir sebelum bayar. Server menghitung **ulang** total dari database: harga item (snapshot order), ongkir dari quote tersimpan (`shipping-rate`), dan biaya instalasi Rp150.000 bila `wants_installation`. Body tidak punya field total atau ongkir; angka dari client tidak dipakai.",
      "",
      "- Meminta Midtrans membuat transaksi Snap, lalu mengubah order `draft` → `awaiting_payment`. Kalau Midtrans gagal, order tetap `draft` dan bisa dicoba lagi dengan token yang sama.",
      "- Dua permintaan bersamaan untuk order yang sama: satu berhasil (200), satu 404.",
      "- Tamu wajib mengisi `contact.email`; user login boleh mengosongkannya (dipakai email akun).",
      "- `payment_method`: `qris` | `va_bca` | `credit_card`. `delivery_date` (opsional) harus salah satu dari `available_delivery_dates` hasil `shipping-rate`.",
      "- Pesan dari Midtrans tidak pernah diteruskan ke client; hanya masuk log server.",
      "- Respons `Cache-Control: no-store`. Maksimal 20 permintaan per menit per IP.",
    ].join("\n"),
    responses: {
      200: {
        description: "Transaksi Snap dibuat; arahkan user ke `redirect_url`",
        content: json({
          order_token: "kqW3...64 karakter acak...Zx9",
          total_amount: 2516000,
          payment: {
            gateway: "midtrans",
            snap_token: "66e4fa55-fdac-4ef9-91b5-733b97d1b862",
            redirect_url: "https://app.sandbox.midtrans.com/snap/v4/redirection/66e4fa55-fdac-4ef9-91b5-733b97d1b862",
          },
        }),
      },
      401: { description: "Token dikirim tapi tidak valid", content: errorExample("UNAUTHORIZED", "Silakan login dulu.") },
      404: {
        description: "`ORDER_NOT_FOUND`: tidak ada, bukan draft (termasuk sudah dikonfirmasi), atau milik user lain",
        content: errorExample("ORDER_NOT_FOUND", "Pesanan tidak ditemukan."),
      },
      410: { description: "Reservasi stok sudah lewat", content: errorExample("RESERVATION_EXPIRED", "Reservasi stok sudah berakhir. Mulai checkout lagi.") },
      422: {
        description: "`VALIDATION_FAILED` (termasuk email tamu kosong / tanggal kirim tidak tersedia), `ADDRESS_REQUIRED`, atau `SHIPPING_QUOTE_INVALID`",
        content: errorExample("SHIPPING_QUOTE_INVALID", "Ongkir sudah tidak berlaku. Hitung ongkir lagi."),
      },
      429: { description: "Terlalu sering memanggil (maks 20 permintaan/menit per IP)", content: errorExample("TOO_MANY_REQUESTS", "Terlalu banyak percobaan. Coba lagi sebentar lagi.") },
      502: { description: "`MIDTRANS_UNAVAILABLE`: Midtrans error atau timeout", content: errorExample("MIDTRANS_UNAVAILABLE", "Layanan pembayaran sedang bermasalah. Coba lagi beberapa saat.") },
      503: { description: "`PAYMENT_CONFIG_MISSING`: server key Midtrans belum diisi", content: errorExample("PAYMENT_CONFIG_MISSING", "Metode pembayaran sedang tidak tersedia.") },
    },
  },
} satisfies Record<string, DocumentDecoration>;
