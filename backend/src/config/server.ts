/**
 * Batas ukuran body request. Bun menerima sampai 128 MB per request, dan body diurai di memori SEBELUM validasi
 * apa pun, jadi tanpa batas ini siapa pun bisa menghabiskan memori lewat endpoint publik (login, webhook).
 * Payload API ini kecil (alamat, daftar barang, notifikasi Midtrans < 10 KB), 1 MB sangat longgar.
 */
export const MAX_BODY_BYTES = 1024 * 1024;

/** Opsi `listen` untuk server: port dan batas body. Dipakai index.ts dan test. */
export const listenOptions = (port: number) => ({ port, maxRequestBodySize: MAX_BODY_BYTES });
