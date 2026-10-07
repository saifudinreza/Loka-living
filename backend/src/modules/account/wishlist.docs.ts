import type { DocumentDecoration } from "elysia";

// Teks dokumentasi Swagger untuk endpoint wishlist. Hanya dokumentasi: tidak mengubah perilaku API.

const TAG = "Wishlist";

const json = (example: unknown) => ({ "application/json": { example } });
const errorExample = (code: string, error: string) => json({ error, code });

const unauthorized = {
  description: "Tanpa token, token tidak valid, atau kedaluwarsa",
  content: errorExample("UNAUTHORIZED", "Silakan login dulu."),
};

const shared = {
  tags: [TAG],
  security: [{ bearerAuth: [] as string[] }],
};

export const wishlistDocs = {
  get: {
    ...shared,
    summary: "Wishlist user yang login (terbaru dulu)",
    description: [
      "Yang disimpan adalah **produk**, bukan varian.",
      "",
      "- `price_from_idr`: harga varian termurah (`null` kalau produk belum punya varian).",
      "- `image_url`: foto pertama varian pertama, atau `null`.",
      "- `in_stock`: ada minimal satu varian dengan stok tersedia.",
      "- Produk yang sudah tidak aktif **tidak** ditampilkan (barisnya tetap ada; aktif lagi → muncul lagi).",
      "- Response `Cache-Control: private, no-store` (data milik satu user).",
    ].join("\n"),
    responses: {
      200: {
        description: "Daftar wishlist (kosong: `data: []`)",
        content: json({
          data: [
            {
              product: {
                id: "00000000-0000-0000-0000-000000000001",
                slug: "kursi-santai-rukun",
                name: "Kursi Santai Rukun",
                price_from_idr: 2450000,
                image_url: "/images/products/ksr-rln-01-1.jpg",
                in_stock: true,
              },
              added_at: "2026-10-01T12:00:00.000Z",
            },
          ],
        }),
      },
      401: unauthorized,
    },
  },

  post: {
    ...shared,
    summary: "Simpan produk ke wishlist",
    description: [
      "Idempoten: produk yang sudah ada tetap sukses.",
      "",
      "- **201** kalau baru ditambahkan, **200** kalau sebelumnya sudah ada.",
      "- Maksimal 100 produk per user (`WISHLIST_FULL`); mengulang produk yang sudah ada tidak terkena batas.",
    ].join("\n"),
    responses: {
      200: {
        description: "Sudah ada di wishlist",
        content: json({ data: { product_id: "00000000-0000-0000-0000-000000000001", in_wishlist: true } }),
      },
      201: {
        description: "Baru ditambahkan",
        content: json({ data: { product_id: "00000000-0000-0000-0000-000000000001", in_wishlist: true } }),
      },
      401: unauthorized,
      422: {
        description: "`VALIDATION_FAILED` (product_id bukan UUID), `PRODUCT_NOT_FOUND` (tidak ada atau tidak aktif), atau `WISHLIST_FULL`",
        content: errorExample("WISHLIST_FULL", "Wishlist maksimal 100 produk."),
      },
    },
  },

  delete: {
    ...shared,
    summary: "Hapus produk dari wishlist",
    description: "Idempoten: selalu 204 tanpa isi, walaupun produknya memang tidak ada di wishlist.",
    responses: { 204: { description: "Selesai (tanpa body)" }, 401: unauthorized },
  },
} satisfies Record<string, DocumentDecoration>;
