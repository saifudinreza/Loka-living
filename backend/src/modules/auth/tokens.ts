/**
 * ============================================================================
 *  tokens.ts — pembuat dan pengelola "tiket masuk" (access token & refresh token)
 * ============================================================================
 *
 * Sistem login kita memakai DUA jenis tiket. Kenapa dua? Supaya aman sekaligus
 * nyaman bagi pengguna.
 *
 * ANALOGI: konser dengan gelang masuk.
 *
 *   ACCESS TOKEN  = gelang kertas yang cuma berlaku 15 menit.
 *     - Ditunjukkan ke petugas setiap kali masuk area (tiap request API).
 *     - Petugas cukup melihat gelangnya valid atau tidak, tanpa menelepon
 *       kantor pusat (stateless: server tidak menyimpannya di database).
 *     - Kalau hilang/dicuri, bahayanya cuma 15 menit.
 *     - Bentuknya JWT: teks bertanda tangan digital berisi "siapa pemiliknya"
 *       dan "kapan kedaluwarsa". Tidak bisa dipalsukan tanpa kunci rahasia
 *       (JWT_ACCESS_SECRET).
 *
 *   REFRESH TOKEN = kupon penukaran di loket yang berlaku 30 hari.
 *     - Disimpan di cookie yang TIDAK bisa dibaca JavaScript (httpOnly), jadi
 *       kalau halaman web kena XSS, kupon ini tidak ikut dicuri.
 *     - Fungsinya hanya satu: ditukar dengan gelang kertas baru ketika gelang
 *       lama habis (endpoint /refresh).
 *     - Server menyimpan HASH-nya di database, sehingga bisa DICABUT kapan saja
 *       (misalnya saat logout).
 *
 * Isi file ini: konfigurasi JWT, pembuat access token, pembuat refresh token,
 * serta pemasang/penghapus cookie refresh token.
 */
import { jwt } from "@elysiajs/jwt";
import type { Cookie } from "elysia";
import { env } from "../../config/env";
import { type Database, type Transaction } from "../../db/client";
import { refreshTokens } from "../../db/schema";
import { randomToken, sha256Hex } from "../../lib/crypto";

/** Nama cookie yang menyimpan refresh token di browser. */
export const REFRESH_COOKIE = "refresh_token";

/**
 * Cookie hanya DIKIRIM browser ke alamat yang diawali /api/auth.
 * Jadi saat browser memanggil /api/products, kupon ini tidak ikut terkirim:
 * semakin jarang terkirim, semakin kecil peluang bocor.
 */
const REFRESH_COOKIE_PATH = "/api/auth";

/** Masa berlaku refresh token dalam detik (hari × 24 jam × 60 menit × 60 detik). */
const REFRESH_TTL_SECONDS = env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60;

/**
 * Plugin JWT untuk Elysia. Setelah dipasang (`.use(jwtPlugin)`), setiap handler
 * mendapat objek `jwt` dengan dua kemampuan:
 *   - `jwt.sign(payload)`  → membuat access token bertanda tangan
 *   - `jwt.verify(token)`  → memeriksa tanda tangan & masa berlaku
 *
 * `secret` = kunci rahasia penanda tangan. Siapa pun yang tahu kunci ini bisa
 * membuat tiket palsu, jadi hanya disimpan di .env, tidak pernah di kode.
 */
export const jwtPlugin = jwt({
  name: "jwt",
  secret: env.JWT_ACCESS_SECRET,
  // string "Ns" = relatif dari sekarang (angka murni akan dibaca sebagai epoch absolut)
  exp: `${env.ACCESS_TOKEN_TTL_SECONDS}s`,
});

/** Bentuk minimal objek `jwt` yang kita butuhkan (agar fungsi mudah dites). */
interface JwtSigner {
  sign(payload: Record<string, string | number>): Promise<string>;
}

/**
 * Membuat access token untuk seorang user.
 *
 * Isi (payload) token:
 *   - `sub`  ("subject") = id user. Inilah "nama pemilik gelang".
 *   - `type` = "access". Penanda jenis tiket. Nanti kalau ada token jenis lain
 *     (misalnya reset password), penjaga pintu bisa menolaknya kalau dipakai
 *     sebagai access token. Lihat auth.guard.ts.
 *
 * Waktu kedaluwarsa (`exp`) ditambahkan otomatis oleh plugin di atas.
 */
export function signAccessToken(signer: JwtSigner, user: { id: string }): Promise<string> {
  return signer.sign({ sub: user.id, type: "access" });
}

/**
 * Membuat refresh token baru dan mencatatnya di database.
 *
 * Alur:
 *   1. Buat token acak (`randomToken`). Inilah token ASLI.
 *   2. Simpan di tabel `refresh_tokens`: HASH-nya (bukan token asli), id user,
 *      `familyId`, kapan kedaluwarsa, dan jenis browser (userAgent).
 *   3. Kembalikan token ASLI ke pemanggil, untuk dipasang di cookie.
 *      Ini satu-satunya saat token asli ada di server. Setelah fungsi selesai,
 *      server sendiri tidak bisa lagi mengetahuinya.
 *
 * Apa itu `familyId`? Satu "keluarga" = semua token turunan dari SATU kali login.
 *   login → T1, refresh → T2, refresh → T3  (semuanya satu family)
 * Dipakai untuk mendeteksi pencurian: kalau token lama dipakai ulang, seluruh
 * keluarga dicabut. Lihat `refreshSession` di auth.service.ts.
 *   - Login baru        → family baru (parameter tidak diisi, dibuat otomatis)
 *   - Rotasi (/refresh) → family yang SAMA diteruskan
 *
 * `conn` bisa berupa koneksi biasa atau transaksi, sehingga insert ini bisa ikut
 * "satu paket" dengan operasi lain (kalau salah satu gagal, semua dibatalkan).
 */
/** Mengembalikan token ASLI; di database hanya hash-nya yang disimpan. */
export async function issueRefreshToken(
  conn: Database | Transaction,
  userId: string,
  userAgent: string | null,
  familyId: string = crypto.randomUUID(),
): Promise<string> {
  const token = randomToken();
  await conn.insert(refreshTokens).values({
    userId,
    tokenHash: sha256Hex(token),
    familyId,
    expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
    userAgent,
  });
  return token;
}

/**
 * Memasang refresh token ke browser lewat cookie.
 *
 * Arti tiap pengaturan keamanannya:
 *   - httpOnly: true      → JavaScript di halaman TIDAK bisa membaca cookie ini.
 *                           Melindungi dari pencurian lewat XSS.
 *   - sameSite: "lax"     → browser tidak mengirim cookie ini pada request lintas
 *                           situs yang berbahaya (membantu melawan CSRF).
 *   - secure              → true di production: cookie hanya lewat HTTPS.
 *                           false di lokal karena localhost memakai HTTP.
 *   - path: "/api/auth"   → hanya terkirim ke endpoint auth (lihat di atas).
 *   - maxAge              → umur cookie di browser, sama dengan umur token.
 */
export function setRefreshCookie(cookie: Record<string, Cookie<unknown>>, token: string): void {
  cookie[REFRESH_COOKIE]!.set({
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: env.COOKIE_SECURE,
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_TTL_SECONDS,
  });
}

/**
 * Menghapus cookie refresh token dari browser (dipakai saat logout atau saat
 * token ternyata tidak valid).
 *
 * Caranya: kirim cookie bernama sama dengan isi kosong dan `maxAge: 0`
 * ("kedaluwarsa sejak detik ini"), sehingga browser membuangnya.
 *
 * PENTING: `path` harus SAMA dengan saat cookie dipasang. Cookie dengan path
 * berbeda dianggap cookie lain, sehingga yang lama tidak akan terhapus.
 */
export function clearRefreshCookie(cookie: Record<string, Cookie<unknown>>): void {
  // path harus sama dengan saat set, kalau tidak browser tidak menghapusnya
  cookie[REFRESH_COOKIE]!.set({ value: "", maxAge: 0, path: REFRESH_COOKIE_PATH });
}
