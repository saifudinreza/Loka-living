/**
 * ============================================================================
 *  auth.guard.ts — "penjaga pintu" untuk endpoint yang butuh login
 * ============================================================================
 *
 * Penjaga pintu memeriksa gelang (access token) setiap pengunjung SEBELUM
 * mereka boleh masuk ke ruangan (endpoint).
 *
 * Ada dua jenis penjaga:
 *
 *   requireAuth  → "WAJIB punya gelang."
 *                  Tanpa gelang = ditolak 401. Dipakai untuk endpoint yang
 *                  hanya boleh diakses user login (mis. /me, nanti /cart).
 *
 *   optionalAuth → "Gelang boleh tidak ada."
 *                  Tamu tanpa gelang tetap masuk (user = null). Dipakai untuk
 *                  checkout, karena pembeli tamu juga boleh bayar.
 *
 * ATURAN PENTING di optionalAuth: kalau gelang DIBAWA tapi rusak/kedaluwarsa,
 * tetap ditolak 401 (bukan dianggap tamu). Kenapa? Supaya bug di frontend
 * (misalnya lupa memperbarui token) langsung kelihatan, bukan diam-diam
 * membuat user yang sudah login diperlakukan seperti tamu.
 *
 * Cara pakai di route:
 *   new Elysia().use(requireAuth).get("/me", ({ user }) => user.email)
 *   → di dalam handler, `user` sudah tersedia dan pasti terisi.
 */
import { and, eq, isNull } from "drizzle-orm";
import { Elysia } from "elysia";
import { db } from "../../db/client";
import { users } from "../../db/schema";
import { AppError } from "../../lib/errors";
import { jwtPlugin } from "./tokens";

/** Satu baris lengkap tabel users, seperti yang dikembalikan penjaga. */
export type AuthUser = typeof users.$inferSelect;

/** Satu pesan 401 yang sama untuk semua alasan gagal (tidak membocorkan detail). */
const unauthorized = () => new AppError(401, "UNAUTHORIZED", "Silakan login dulu.");

/** Bentuk minimal objek `jwt` yang dibutuhkan untuk memeriksa token. */
interface JwtVerifier {
  verify(token?: string): Promise<false | Record<string, unknown>>;
}

/**
 * Inti pemeriksaan gelang. Dipakai oleh requireAuth maupun optionalAuth.
 *
 * Hasilnya:
 *   - null           → tidak ada header Authorization sama sekali (tamu)
 *   - AuthUser       → gelang valid, ini datanya
 *   - throw 401      → gelang ada tapi bermasalah
 *
 * Langkah pemeriksaan:
 *   1. Tidak ada header `Authorization`?  → tamu, kembalikan null.
 *   2. Formatnya harus `Bearer <token>`.  Salah format → 401.
 *   3. `jwt.verify` memeriksa tanda tangan DAN masa berlaku. Palsu atau sudah
 *      lewat 15 menit → `false` → 401.
 *   4. Pastikan `type === "access"` dan `sub` berupa teks. Mencegah jenis token
 *      lain dipakai sebagai access token.
 *   5. Ambil user dari database berdasarkan `sub`. Perlu karena:
 *        - user mungkin sudah dihapus (`deletedAt` terisi) setelah token terbit,
 *        - kita butuh data terbaru (nama, dll.).
 *      User tidak ada / sudah dihapus → 401.
 */
/**
 * null = tidak ada header Authorization.
 * Header ada tapi token tidak valid / kedaluwarsa / user hilang = 401 (bug frontend tidak boleh tersembunyi).
 */
async function authenticate(jwt: JwtVerifier, authorization: string | undefined): Promise<AuthUser | null> {
  if (!authorization) return null;

  const token = /^Bearer (.+)$/i.exec(authorization)?.[1];
  if (!token) throw unauthorized();

  const payload = await jwt.verify(token);
  // type "access" mencegah token jenis lain (mis. nanti token reset password) dipakai sebagai access token
  if (!payload || payload.type !== "access" || typeof payload.sub !== "string") throw unauthorized();

  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, payload.sub), isNull(users.deletedAt)))
    .limit(1);
  if (!user) throw unauthorized();

  return user;
}

/**
 * Penjaga WAJIB login.
 *
 * `.resolve` = "sebelum handler jalan, hitung dulu nilai tambahan (`user`) dan
 * titipkan ke handler". `as: "scoped"` = nilai ini tersedia untuk route yang
 * memakai plugin ini.
 *
 * Kalau `authenticate` mengembalikan null (tidak ada token), di sini diubah
 * jadi 401 karena endpoint ini mewajibkan login.
 */
/** Wajib login: tanpa token = 401. Menyediakan `user` di context. */
export const requireAuth = new Elysia({ name: "require-auth" })
  .use(jwtPlugin)
  .resolve({ as: "scoped" }, async ({ jwt, headers }) => {
    const user = await authenticate(jwt, headers.authorization);
    if (!user) throw unauthorized();
    return { user };
  });

/**
 * Penjaga login OPSIONAL: `user` bisa null (tamu) atau terisi (sudah login).
 * Handler yang memakainya harus siap menangani kedua kemungkinan itu.
 */
/** Login opsional: tanpa token `user` = null. Dipakai checkout (tamu boleh). */
export const optionalAuth = new Elysia({ name: "optional-auth" })
  .use(jwtPlugin)
  .resolve({ as: "scoped" }, async ({ jwt, headers }) => ({
    user: await authenticate(jwt, headers.authorization),
  }));
