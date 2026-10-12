// Dokumentasi Swagger untuk endpoint pembayaran & webhook Midtrans.

const json = (example: unknown) => ({ "application/json": { example } });
const errorExample = (code: string, error: string) => json({ error, code });

export const paymentsDocs = {
  webhook: {
    tags: ["Payment"],
    summary: "Notifikasi webhook Midtrans (perubahan status pembayaran)",
    description: [
      "Endpoint publik yang dipanggil langsung oleh server Midtrans setiap status transaksi berubah.",
      "",
      "- **Verifikasi signature**: `sha512(order_id + status_code + gross_amount + SERVER_KEY)`. Signature salah → 401.",
      "- **Idempotency**: event `transaction_id + ':' + transaction_status` hanya diproses sekali. Permintaan ganda dibalas 200 `{ message: 'Already processed' }`.",
      "- **Validasi jumlah**: `gross_amount` diverifikasi terhadap `total_amount` pesanan di database. Selisih → 400 `AMOUNT_MISMATCH`.",
      "- **Stok & Keranjang**: jika order berubah ke `paid`, stok di-commit (`stock_reserved -= qty`) dan varian yang dibeli dihapus dari keranjang akun.",
    ].join("\n"),
    responses: {
      200: {
        description: "Notifikasi berhasil diproses atau sudah pernah diproses",
        content: json({ message: "OK" }),
      },
      400: {
        description: "Payload tidak lengkap / format salah / amount mismatch",
        content: errorExample("BAD_REQUEST", "Data webhook tidak lengkap atau tidak valid."),
      },
      401: {
        description: "Signature tidak valid atau SERVER_KEY belum dikonfigurasi",
        content: errorExample("INVALID_SIGNATURE", "Signature tidak valid."),
      },
      404: {
        description: "Pesanan dengan order_token tersebut tidak ditemukan",
        content: errorExample("ORDER_NOT_FOUND", "Pesanan tidak ditemukan."),
      },
    },
  },
};
