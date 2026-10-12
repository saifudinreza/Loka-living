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

/**
 * Tamu (tanpa login) hanya boleh "Beli Sekarang": SATU jenis barang, maksimal sebanyak ini. Checkout beberapa barang
 * (dari keranjang) dan pembelian lebih banyak wajib login. Keranjang sendiri sudah wajib login.
 */
export const GUEST_MAX_QTY = 5;

/**
 * Jatah total unit yang boleh ditahan satu IP tamu dalam satu masa reservasi. Rate limit biasa menghitung permintaan,
 * bukan jumlah barang, sehingga tanpa ini satu klien anonim bisa menahan seluruh stok toko dengan beberapa permintaan.
 */
export const GUEST_UNIT_BUDGET = 10;

/** Biaya instalasi tetap (rupiah). Satu-satunya tempat angka ini ditulis. */
export const INSTALLATION_FEE_IDR = 150_000;
