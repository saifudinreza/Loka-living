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
} satisfies Record<string, DocumentDecoration>;
