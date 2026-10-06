import type { DocumentDecoration } from "elysia";

// Teks dokumentasi Swagger untuk endpoint keranjang. Hanya dokumentasi: tidak mengubah perilaku API.

const TAG = "Cart";

const json = (example: unknown) => ({ "application/json": { example } });
const errorExample = (code: string, error: string) => json({ error, code });

const cartExample = {
  data: {
    items: [
      {
        product_variant_id: "8d8302c0-e7b6-4c0b-ae59-69813fe07807",
        qty: 2,
        product: { slug: "kursi-makan-tani", name: "Kursi Makan Tani" },
        material: "Kayu Jati",
        color_hex: "#9B6B3A",
        unit_price: 1150000,
        subtotal: 2300000,
        image_url: "/images/products/kmt-jti-01-1.jpg",
        stock_available: 48,
        is_available: true,
      },
    ],
    subtotal_amount: 2300000,
    item_count: 2,
  },
};

const unauthorized = {
  description: "Tanpa token, token tidak valid, atau kedaluwarsa",
  content: errorExample("UNAUTHORIZED", "Silakan login dulu."),
};

const cartOk = (description: string) => ({ description, content: json(cartExample) });

const shared = {
  tags: [TAG],
  security: [{ bearerAuth: [] as string[] }],
};

export const cartDocs = {
  get: {
    ...shared,
    summary: "Isi keranjang user yang login",
    description: [
      "Harga selalu dari database saat ini (tidak disimpan di keranjang).",
      "",
      "- `is_available: false` kalau produk non-aktif atau `stock_available < qty`. Barang tetap tampil tapi **tidak** dihitung di `subtotal_amount`.",
      "- `item_count` = jumlah seluruh qty (untuk badge keranjang), termasuk yang tidak tersedia.",
      "- Keranjang **tidak menahan stok**; stok baru ditahan saat `checkout/init`.",
      "- Response `Cache-Control: private, no-store` (data milik satu user).",
    ].join("\n"),
    responses: { 200: cartOk("Keranjang (kosong: items [], subtotal_amount 0, item_count 0)"), 401: unauthorized },
  },

  put: {
    ...shared,
    summary: "Set jumlah satu barang (0 = hapus)",
    description: [
      "Men-*set* qty (bukan menambah), jadi memanggil ulang dengan nilai sama hasilnya tetap sama.",
      "",
      "- `qty` 0–99. `0` menghapus baris (boleh juga untuk varian yang sudah tidak dijual).",
      "- Melebihi stok **diizinkan**; barang hanya ditandai `is_available: false`.",
      "- Maksimal 50 jenis barang berbeda per keranjang (mengubah baris yang sudah ada selalu boleh).",
    ].join("\n"),
    responses: {
      200: cartOk("Keranjang lengkap setelah perubahan"),
      401: unauthorized,
      422: {
        description: "`VALIDATION_FAILED` (qty/variantId tidak valid), `VARIANT_NOT_FOUND`, atau `CART_LIMIT_REACHED`",
        content: errorExample("CART_LIMIT_REACHED", "Keranjang maksimal 50 jenis barang."),
      },
    },
  },

  delete: {
    ...shared,
    summary: "Hapus satu barang dari keranjang",
    description: "Selalu 200 dengan keranjang lengkap, walaupun barangnya memang tidak ada di keranjang.",
    responses: { 200: cartOk("Keranjang lengkap setelah penghapusan"), 401: unauthorized },
  },
} satisfies Record<string, DocumentDecoration>;
