import type { DocumentDecoration } from "elysia";

// Teks dokumentasi Swagger untuk endpoint pesanan. Hanya dokumentasi: tidak mengubah perilaku API.

const json = (example: unknown) => ({ "application/json": { example } });
const errorExample = (code: string, error: string) => json({ error, code });

export const ordersDocs = {
  list: {
    tags: ["Orders"],
    security: [{ bearerAuth: [] as string[] }],
    summary: "Riwayat pesanan user yang login",
    description: [
      "Pesanan milik user, terbaru dulu. `draft` (checkout yang ditinggal) tidak pernah ditampilkan.",
      "",
      "- Filter `status`: `awaiting_payment` | `paid` | `expired` | `cancelled` | `refunded`. Paging: `page` ≥ 1 (default 1), `limit` 1–50 (default 10).",
      "- `item_count`: jumlah barang (Σ qty). `first_item`: barang dengan subtotal terbesar, sebagai gambaran isi pesanan.",
      "- `Cache-Control: private, no-store`.",
    ].join("\n"),
    responses: {
      200: {
        description: "Daftar pesanan (kosong: `data: []`)",
        content: json({
          data: [
            {
              order_token: "kqW3...64 karakter acak...Zx9",
              status: "paid",
              created_at: "2026-10-01T07:32:10.000Z",
              total_amount: 2516000,
              item_count: 2,
              first_item: { product_name: "Kursi Santai Rukun", material: "Rotan & Linen", image_url: null },
            },
          ],
          meta: { page: 1, limit: 10, total: 1 },
        }),
      },
      401: { description: "Tanpa token, token tidak valid, atau kedaluwarsa", content: errorExample("UNAUTHORIZED", "Silakan login dulu.") },
      422: { description: "`status`, `page`, atau `limit` tidak valid", content: errorExample("VALIDATION_FAILED", 'Data tidak valid pada field "limit".') },
    },
  },
  detail: {
    tags: ["Orders"],
    // login opsional: tamu membuka pesanan tamu lewat token
    security: [{} as Record<string, string[]>, { bearerAuth: [] as string[] }],
    summary: "Detail pesanan",
    description: [
      "Aturan akses:",
      "",
      "| Pesanan | Siapa boleh melihat |",
      "|---|---|",
      "| Tamu (`user_id` kosong) | Siapa pun yang punya `order_token`. Email dan telepon **disamarkan** (`bu***@contoh.com`, `0812****890`) |",
      "| Akun (`user_id` terisi) | Hanya pemiliknya, dan harus login (data lengkap). Token saja tidak cukup |",
      "",
      "Semua penolakan menjawab **404** `ORDER_NOT_FOUND` dengan pesan sama, termasuk token salah, token berbentuk tidak sah, pesanan milik orang lain, dan `draft`.",
      "",
      "- `payment.can_continue`: `awaiting_payment` dan reservasi stok belum lewat. `payment.redirect_url` hanya terisi saat `can_continue`.",
      "- `payments`: setiap percobaan bayar. `timeline`: riwayat status, lama ke baru.",
      "- Tidak pernah berisi id internal, `user_id`, `raw_payload`, `snap_token`, atau `gateway_transaction_id`. Waktu ISO 8601 UTC.",
    ].join("\n"),
    responses: {
      200: {
        description: "Detail pesanan",
        content: json({
          data: {
            order_token: "kqW3...64 karakter acak...Zx9",
            status: "awaiting_payment",
            created_at: "2026-10-01T07:32:10.000Z",
            reserved_until: "2026-10-01T08:02:10.000Z",
            amounts: { subtotal: 2450000, shipping: 66000, installation: 0, total: 2516000 },
            items: [
              {
                product_slug: "kursi-santai-rukun",
                product_name: "Kursi Santai Rukun",
                material: "Rotan & Linen",
                color_hex: "#C99A66",
                qty: 1,
                unit_price: 2450000,
                subtotal: 2450000,
                image_url: null,
              },
            ],
            shipping: {
              recipient_name: "Budi",
              phone: "0812****890",
              full_address: "Jl. Contoh No. 1",
              city: "Jakarta Selatan",
              province: "DKI Jakarta",
              postal_code: "12345",
              delivery_date: "2026-10-03",
            },
            contact: { email: "bu***@contoh.com" },
            payment: { redirect_url: "https://app.sandbox.midtrans.com/snap/v4/redirection/...", can_continue: true },
            payments: [{ method: "qris", status: "pending", amount: 2516000, created_at: "2026-10-01T07:33:00.000Z", updated_at: "2026-10-01T07:33:00.000Z" }],
            timeline: [{ from: "draft", to: "awaiting_payment", actor: "system", note: null, at: "2026-10-01T07:33:00.000Z" }],
          },
        }),
      },
      401: { description: "Token dikirim tapi tidak valid", content: errorExample("UNAUTHORIZED", "Silakan login dulu.") },
      404: { description: "`ORDER_NOT_FOUND`", content: errorExample("ORDER_NOT_FOUND", "Pesanan tidak ditemukan.") },
    },
  },
} satisfies Record<string, DocumentDecoration>;
