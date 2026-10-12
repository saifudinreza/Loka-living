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
export interface RateLimitOptions {
  /** Kode dan pesan error saat jatah habis. Default: 429 TOO_MANY_REQUESTS. */
  code?: string;
  message?: string;
}

export interface RateLimiter {
  /** Memakai `weight` (default 1) dari jatah `key`. Melempar AppError 429 kalau jatahnya tidak cukup. */
  (key: string, now?: number, weight?: number): void;
  /** Mengembalikan jatah yang sudah dipakai (mis. permintaan gagal sebelum benar-benar memakai sumber daya). */
  refund(key: string, weight?: number): void;
}

/**
 * Limiter sederhana di memori (cukup untuk satu instance; hilang saat restart).
 * Kalau nanti jalan di banyak instance, pindahkan ke Redis.
 *
 * Jatah dihitung dalam satuan "bobot": permintaan biasa berbobot 1 (jumlah permintaan), tetapi bisa juga berbobot
 * jumlah barang (mis. anggaran unit stok yang boleh ditahan satu IP). Permintaan yang DITOLAK tidak memakai jatah.
 */
export function createRateLimiter(max: number, windowMs: number, options: RateLimitOptions = {}): RateLimiter {
  const tooMany = () =>
    new AppError(429, options.code ?? "TOO_MANY_REQUESTS", options.message ?? "Terlalu banyak percobaan. Coba lagi sebentar lagi.");

  // Papan catatan: kunci = identitas (IP), nilai = catatannya.
  const buckets = new Map<string, Bucket>();
  // Sapuan bucket kedaluwarsa paling sering sekali per jendela. Memindai SEMUA bucket di setiap request membuat
  // biaya tiap request naik sebanding jumlah IP berbeda (penyerang dengan banyak IP memperlambat semua orang).
  let nextSweep = 0;

  /**
   * Alur `hit`, setiap kali ada request:
   *   1. Bersihkan catatan yang sudah kedaluwarsa (paling sering sekali per jendela).
   *   2. Kalau kunci ini belum punya catatan (atau jendelanya sudah lewat) → mulai catatan baru.
   *   3. Kalau pemakaian + bobot melebihi `max` → tolak tanpa menambah hitungan. Kalau tidak, tambah hitungannya.
   *
   * @param now  waktu sekarang; ada agar mudah dites dengan "waktu palsu" tanpa menunggu betulan
   */
  const hit = (key: string, now = Date.now(), weight = 1): void => {
    if (now >= nextSweep) {
      for (const [k, b] of buckets) {
        if (b.resetAt <= now) buckets.delete(k);
      }
      nextSweep = now + windowMs;
    }

    const bucket = buckets.get(key);
    // bucket yang sudah lewat jendela tapi belum tersapu diperlakukan seperti tidak ada
    if (!bucket || bucket.resetAt <= now) {
      if (weight > max) throw tooMany();
      buckets.set(key, { count: weight, resetAt: now + windowMs });
      return;
    }

    if (bucket.count + weight > max) throw tooMany();
    bucket.count += weight;
  };

  const refund = (key: string, weight = 1): void => {
    const bucket = buckets.get(key);
    if (bucket) bucket.count = Math.max(0, bucket.count - weight);
  };

  return Object.assign(hit, { refund });
}
