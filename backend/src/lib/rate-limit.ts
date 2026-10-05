/**
 * ============================================================================
 *  rate-limit.ts — pembatas jumlah percobaan ("satpam antrean")
 * ============================================================================
 *
 * MASALAH: tanpa pembatas, penyerang bisa mencoba ribuan password per menit
 * di endpoint /login (disebut brute-force), atau membuat ribuan akun palsu
 * lewat /register.
 *
 * SOLUSI: batasi tiap alamat IP maksimal N request dalam satu jendela waktu.
 *
 * ANALOGI: seperti satpam di pintu klub yang memegang papan catatan.
 *   - Setiap tamu (IP) punya satu baris di papan: "sudah masuk berapa kali,
 *     dan kapan hitungannya dihapus".
 *   - Kalau dalam 1 menit tamu yang sama mencoba lebih dari 10 kali, satpam
 *     berkata "cukup, tunggu dulu" (HTTP 429).
 *   - Setelah semenit, catatan tamu itu dihapus dan ia boleh coba lagi.
 *
 * KETERBATASAN (disengaja, sesuai issue): catatannya disimpan di memori
 * (`Map`) proses server. Artinya:
 *   - Hilang kalau server restart.
 *   - Tidak dibagi antar-server kalau nanti ada lebih dari satu instance.
 *   Untuk skala lebih besar, pindahkan ke Redis.
 */
import { AppError } from "./errors";

/** Catatan satu IP: sudah berapa kali mencoba, dan kapan hitungannya di-reset. */
interface Bucket {
  count: number;
  resetAt: number; // waktu dalam milidetik (Date.now())
}

/**
 * Membuat satu pembatas baru.
 *
 * @param max       jumlah request maksimal per jendela (mis. 10)
 * @param windowMs  panjang jendela dalam milidetik (mis. 60_000 = 1 menit)
 * @returns         fungsi `hit(key)` yang dipanggil tiap ada request.
 *                  Kalau jatah habis, fungsi ini MELEMPAR AppError 429.
 *
 * Kenapa fungsi pembuat (factory)? Supaya tiap pemakai punya papan catatan
 * sendiri. Test, misalnya, tidak mengganggu hitungan aplikasi sungguhan.
 */
/**
 * Limiter sederhana di memori (cukup untuk satu instance; hilang saat restart).
 * Kalau nanti jalan di banyak instance, pindahkan ke Redis.
 */
export function createRateLimiter(max: number, windowMs: number) {
  // Papan catatan: kunci = identitas (IP), nilai = catatannya.
  const buckets = new Map<string, Bucket>();

  /**
   * Alur `hit`, setiap kali ada request:
   *   1. Bersihkan catatan yang sudah kedaluwarsa (supaya papan tidak
   *      membengkak tanpa batas).
   *   2. Kalau IP ini belum punya catatan → buat baru dengan hitungan 1.
   *      Boleh lewat.
   *   3. Kalau sudah punya → tambah hitungannya. Kalau melebihi `max`,
   *      lempar error 429 (ditolak). Kalau belum, boleh lewat.
   *
   * @param key  identitas yang dibatasi, di sini alamat IP
   * @param now  waktu sekarang; parameter ini ada agar mudah dites dengan
   *             "waktu palsu" tanpa harus menunggu betulan satu menit
   */
  return function hit(key: string, now = Date.now()): void {
    // buang bucket kedaluwarsa supaya Map tidak tumbuh tanpa batas
    for (const [k, b] of buckets) {
      if (b.resetAt <= now) buckets.delete(k);
    }

    const bucket = buckets.get(key);
    if (!bucket) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }

    bucket.count += 1;
    if (bucket.count > max) {
      throw new AppError(429, "TOO_MANY_REQUESTS", "Terlalu banyak percobaan. Coba lagi sebentar lagi.");
    }
  };
}
