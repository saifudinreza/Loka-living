/**
 * ============================================================================
 *  auth.routes.ts — "pelayan": pintu masuk HTTP untuk fitur login
 * ============================================================================
 *
 * File ini mendaftarkan alamat (endpoint) yang bisa dipanggil frontend, dan
 * menghubungkannya ke "koki" di auth.service.ts. Isinya sengaja tipis: terima
 * request → validasi bentuknya → panggil service → atur cookie → kirim jawaban.
 *
 * Semua alamat berawalan /api/auth:
 *
 *   POST /register   daftar akun baru                    (dibatasi rate limit)
 *   POST /login      masuk                               (dibatasi rate limit)
 *   POST /refresh    tukar cookie refresh → access token baru
 *   POST /logout     keluar (cabut refresh token)
 *   GET  /me         data user yang sedang login         (butuh access token)
 *
 * ALUR LENGKAP dari sudut pandang pengguna:
 *
 *   1. Daftar/login   → server mengirim access token (di body JSON) dan
 *                       refresh token (di cookie httpOnly).
 *   2. Menjelajah     → frontend mengirim access token di header
 *                       `Authorization: Bearer <token>` ke endpoint yang butuh login.
 *   3. Token habis    → (15 menit) endpoint menjawab 401. Frontend memanggil
 *                       /refresh; cookie terkirim otomatis oleh browser, dan
 *                       server menjawab access token baru + cookie baru.
 *   4. Logout         → /logout mencabut refresh token dan menghapus cookie.
 */
import { Elysia, t } from "elysia";
import { env } from "../../config/env";
import { createRateLimiter } from "../../lib/rate-limit";
import { requireAuth } from "./auth.guard";
import { type PublicUser, loginUser, refreshSession, registerUser, revokeRefreshToken } from "./auth.service";
import { REFRESH_COOKIE, clearRefreshCookie, jwtPlugin, setRefreshCookie, signAccessToken } from "./tokens";

/**
 * Mengambil jenis browser/perangkat dari header `User-Agent`, dipotong 255
 * karakter (sesuai ukuran kolom database). Disimpan bersama refresh token agar
 * nanti bisa menampilkan "perangkat yang sedang login".
 */
const userAgentOf = (headers: Record<string, string | undefined>) =>
  headers["user-agent"]?.slice(0, 255) ?? null;

/**
 * Bentuk jawaban sukses yang SAMA untuk register, login, dan refresh, sehingga
 * frontend cukup menulis satu cara membacanya:
 *   {
 *     access_token: "eyJ...",   ← tiket 15 menit
 *     token_type:  "Bearer",    ← cara memakainya di header
 *     expires_in:  900,         ← berlaku berapa detik
 *     user: { id, email, name } ← data publik user
 *   }
 * Refresh token TIDAK ada di sini; ia hanya lewat cookie.
 */
async function authResponse(jwt: Parameters<typeof signAccessToken>[0], user: PublicUser) {
  return {
    access_token: await signAccessToken(jwt, user),
    token_type: "Bearer" as const,
    expires_in: env.ACCESS_TOKEN_TTL_SECONDS,
    user: { id: user.id, email: user.email, name: user.name },
  };
}

/**
 * Membangun kelompok route /auth.
 *
 * Dibuat sebagai FUNGSI (bukan konstanta) supaya setiap aplikasi yang dibuat
 * punya pembatas (limiter) sendiri. Kalau limiter dibuat sekali di tingkat
 * file, test yang membuat banyak aplikasi akan saling berbagi hitungan dan
 * saling mengganggu.
 */
// Limiter dibuat per instance app supaya test yang membuat app sendiri-sendiri tidak berbagi hitungan.
export function authRoutes() {
  // 10 request per menit per IP, dipakai bersama oleh /register dan /login
  const authLimiter = createRateLimiter(10, 60_000);

  /**
   * Pemeriksa batas, dipasang sebagai `beforeHandle` (dijalankan SEBELUM
   * handler). Mengambil IP penelepon lalu menghitungnya. Kalau jatah habis,
   * `authLimiter` melempar 429 dan handler tidak pernah jalan.
   *
   * Catatan: di belakang reverse proxy (Nginx, Cloudflare, dll.) semua request
   * akan terlihat berasal dari IP proxy. Atur proxy agar meneruskan IP asli,
   * dan jangan percaya header IP kiriman client begitu saja (mudah dipalsukan).
   */
  // Di belakang reverse proxy, IP asli ada di X-Forwarded-For; atur di sana, jangan percaya header dari client.
  const limitByIp = ({ request, server }: { request: Request; server: { requestIP(r: Request): { address: string } | null } | null }) =>
    authLimiter(server?.requestIP(request)?.address ?? "unknown");

  return new Elysia({ prefix: "/auth" })
    .use(jwtPlugin)

    /**
     * POST /api/auth/register — daftar akun.
     * Body: { email, password (8–72 karakter), name }
     * Sukses: 201 + access token (body) + refresh token (cookie).
     * Gagal : 409 EMAIL_TAKEN, 422 data tidak valid, 429 terlalu sering.
     * `body: t.Object(...)` = Elysia memeriksa bentuk & batas panjang input
     * SEBELUM handler jalan; input yang salah ditolak otomatis (422).
     */
    .post(
      "/register",
      async ({ body, jwt, cookie, headers, set }) => {
        const { user, refreshToken } = await registerUser({ ...body, userAgent: userAgentOf(headers) });
        setRefreshCookie(cookie, refreshToken);
        set.status = 201;
        return authResponse(jwt, user);
      },
      {
        beforeHandle: limitByIp,
        body: t.Object({
          email: t.String({ maxLength: 254 }),
          password: t.String({ minLength: 8, maxLength: 72 }),
          name: t.String({ minLength: 1, maxLength: 200 }),
        }),
      },
    )

    /**
     * POST /api/auth/login — masuk.
     * Body: { email, password }
     * Sukses: 200 + access token (body) + refresh token baru (cookie).
     * Gagal : 401 INVALID_CREDENTIALS (pesan sama untuk semua alasan), 429.
     */
    .post(
      "/login",
      async ({ body, jwt, cookie, headers }) => {
        const { user, refreshToken } = await loginUser({ ...body, userAgent: userAgentOf(headers) });
        setRefreshCookie(cookie, refreshToken);
        return authResponse(jwt, user);
      },
      {
        beforeHandle: limitByIp,
        body: t.Object({
          email: t.String({ maxLength: 254 }),
          password: t.String({ minLength: 1, maxLength: 72 }),
        }),
      },
    )

    /**
     * POST /api/auth/refresh — minta access token baru.
     * Tidak butuh header Authorization; cukup cookie `refresh_token` yang
     * dikirim browser otomatis.
     *
     * Alur:
     *   - Cookie tidak ada            → 401 REFRESH_TOKEN_MISSING.
     *   - Ada → `refreshSession` (rotasi, lihat auth.service.ts):
     *       sukses → pasang cookie BARU, kirim access token baru.
     *       gagal  → HAPUS cookie (sudah tidak berguna; browser berhenti
     *                mengirimnya), lalu teruskan error 401-nya.
     */
    .post("/refresh", async ({ jwt, cookie, headers, set }) => {
      const raw = cookie[REFRESH_COOKIE]?.value;
      if (typeof raw !== "string" || raw === "") {
        set.status = 401;
        return { error: "Silakan login dulu.", code: "REFRESH_TOKEN_MISSING" };
      }

      try {
        const { user, refreshToken } = await refreshSession(raw, userAgentOf(headers));
        setRefreshCookie(cookie, refreshToken);
        return await authResponse(jwt, user);
      } catch (err) {
        // cookie yang sudah tidak berguna dihapus supaya browser berhenti mengirimnya
        clearRefreshCookie(cookie);
        throw err;
      }
    })

    /**
     * POST /api/auth/logout — keluar.
     * Selalu menjawab 204 (tanpa isi), bahkan kalau tidak ada cookie atau
     * dipanggil dua kali: logout harus "aman diulang" (idempoten).
     * Yang dilakukan: cabut token itu di database, lalu hapus cookie.
     */
    .post("/logout", async ({ cookie, set }) => {
      const raw = cookie[REFRESH_COOKIE]?.value;
      if (typeof raw === "string" && raw !== "") await revokeRefreshToken(raw);
      clearRefreshCookie(cookie);
      set.status = 204;
    })

    /**
     * Garis pembatas: route SETELAH baris ini dijaga `requireAuth`.
     * Urutannya penting. Register/login/refresh/logout ada DI ATAS sehingga
     * tidak butuh access token (orang yang mau login memang belum punya).
     */
    .use(requireAuth)

    /**
     * GET /api/auth/me — "siapa saya?"
     * Butuh header `Authorization: Bearer <access_token>`.
     * `user` disediakan oleh requireAuth. Frontend memakainya, misalnya, saat
     * halaman dibuka untuk mengetahui apakah sesi masih berlaku.
     * Hanya data aman yang dikirim: `has_password` dan `google_linked` berupa
     * true/false saja, bukan hash atau id Google-nya.
     */
    .get("/me", ({ user }) => ({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        has_password: user.passwordHash !== null,
        google_linked: user.googleId !== null,
        created_at: user.createdAt.toISOString(),
      },
    }));
}
