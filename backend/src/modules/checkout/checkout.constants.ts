// Angka-angka checkout yang saling bergantung, dikumpulkan di satu tempat (tanpa import, supaya bebas dari impor melingkar).

/** Lama stok ditahan sejak `init`. */
export const RESERVATION_MINUTES = 30;

/** Lama quote ongkir berlaku sejak `shipping-rate`. */
export const QUOTE_MINUTES = 30;

/**
 * Lama pembeli punya waktu membayar sejak `confirm`. Dipakai SEKALIGUS untuk `expiry` Snap di Midtrans dan untuk
 * `orders.reserved_until`, supaya "masih bisa bayar" (can_continue) dan masa berlaku link Midtrans tidak berselisih.
 */
export const PAYMENT_WINDOW_MINUTES = 30;

/** Biaya instalasi tetap (rupiah). Satu-satunya tempat angka ini ditulis. */
export const INSTALLATION_FEE_IDR = 150_000;
