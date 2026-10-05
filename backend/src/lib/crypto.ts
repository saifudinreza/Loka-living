/**
 * ============================================================================
 *  crypto.ts — "kotak perkakas" untuk hal-hal yang berhubungan dengan rahasia
 * ============================================================================
 *
 * File ini berisi tiga fungsi kecil yang dipakai oleh sistem login:
 *
 *   1. randomToken()        → membuat string acak yang tidak bisa ditebak
 *   2. sha256Hex()          → "menggiling" sebuah teks jadi sidik jari (hash) satu arah
 *   3. timingSafeEqualHex() → membandingkan dua sidik jari dengan aman
 *
 * ANALOGI: bayangkan sistem login seperti hotel.
 *   - randomToken  = mesin pembuat kartu kunci kamar (setiap kartu unik).
 *   - sha256Hex    = resepsionis TIDAK menyimpan kartu aslinya, hanya mencatat
 *                    "ciri-ciri" kartu itu. Kalau buku catatan dicuri, pencuri
 *                    tidak bisa membuat kartu yang berfungsi dari catatan itu.
 *   - timingSafeEqualHex = petugas yang memeriksa kartu dengan kecepatan
 *                    selalu sama, supaya penjahat tidak bisa menebak "wah,
 *                    pemeriksaannya lama, berarti hampir benar".
 */
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Membuat token acak untuk dipakai sebagai refresh token.
 *
 * Cara kerja, langkah demi langkah:
 *   1. `crypto.getRandomValues(new Uint8Array(32))` → minta komputer menghasilkan
 *      32 angka acak (0–255). Ini memakai sumber acak milik sistem operasi yang
 *      aman secara kriptografi (BUKAN Math.random(), yang bisa ditebak).
 *   2. `Buffer.from(...)` → bungkus 32 angka itu menjadi data mentah (32 byte).
 *   3. `.toString("base64url")` → ubah byte mentah jadi teks yang aman dipakai di
 *      URL/cookie (hanya huruf, angka, `-` dan `_`). Hasilnya 43 karakter.
 *
 * Kenapa 32 byte? 32 byte = 256 bit. Jumlah kemungkinannya begitu besar sehingga
 * menebaknya secara brute-force praktis mustahil.
 */
/** 32 byte acak, di-encode base64url (43 karakter). */
export function randomToken(): string {
  return Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url");
}

/**
 * Mengubah teks menjadi sidik jari SHA-256 (64 karakter heksadesimal).
 *
 * Sifat penting hash:
 *   - SATU ARAH: dari teks bisa jadi hash, tapi dari hash tidak bisa balik ke teks.
 *   - DETERMINISTIK: teks yang sama selalu menghasilkan hash yang sama.
 *     Itu sebabnya kita bisa mencari token di database: hash-kan token yang
 *     dikirim browser, lalu cocokkan dengan hash yang tersimpan.
 *
 * Dipakai untuk: menyimpan refresh token di database (hanya hash-nya, bukan
 * token aslinya).
 *
 * Catatan: untuk PASSWORD kita tidak memakai SHA-256 (terlalu cepat, mudah
 * di-brute-force). Password memakai argon2id lewat `Bun.password` di
 * auth.service.ts. SHA-256 cukup untuk token karena token sudah acak dan
 * panjang, bukan kata yang bisa ditebak manusia.
 */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * Membandingkan dua hash heksadesimal dalam waktu yang selalu sama.
 *
 * Masalah dengan perbandingan biasa (`a === b`): komputer berhenti membandingkan
 * begitu menemukan karakter pertama yang beda. Penyerang yang mengukur waktu
 * respons dengan sangat teliti bisa menebak karakter demi karakter ("timing
 * attack"). `timingSafeEqual` selalu memeriksa semuanya, jadi waktunya tidak
 * membocorkan apa pun.
 *
 * Panjang dicek dulu karena `timingSafeEqual` melempar error kalau panjangnya
 * beda; beda panjang pasti tidak sama, jadi langsung `false`.
 *
 * (Disiapkan juga untuk dipakai di verifikasi webhook pembayaran, issue 16.)
 */
/** Perbandingan waktu-konstan untuk dua string hex; false kalau panjang beda. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
}
