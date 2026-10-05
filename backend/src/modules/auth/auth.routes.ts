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
 *   GET  /google           mulai login Google            (dibatasi rate limit)
 *   GET  /google/callback  tujuan balik dari Google      (dibatasi rate limit)
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
import type { Google } from "arctic";
import { decodeIdToken, generateCodeVerifier, generateState } from "arctic";
import { Elysia, t } from "elysia";
import { env } from "../../config/env";
import { timingSafeEqualString } from "../../lib/crypto";
import { createRateLimiter } from "../../lib/rate-limit";
import { authDocs } from "./auth.docs";
import { requireAuth } from "./auth.guard";
import {
  GoogleLoginError,
  type PublicUser,
  loginUser,
  loginWithGoogle,
  refreshSession,
  registerUser,
  revokeRefreshToken,
} from "./auth.service";
import { google as defaultGoogle } from "./google";
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
export function authRoutes(google: Google | null = defaultGoogle) {
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
        detail: authDocs.register,
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
        detail: authDocs.login,
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
    }, { detail: authDocs.refresh })

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
    }, { detail: authDocs.logout })

    /**
     * Route login Google (GET /api/auth/google dan /google/callback), dibuat di
     * fungsi `googleRoutes` di bagian bawah file ini. Sama seperti login biasa,
     * keduanya dibatasi `limitByIp` dan tidak butuh access token.
     */
    .use(googleRoutes(google, limitByIp))

    /**
     * Garis pembatas: route SETELAH baris ini dijaga `requireAuth`.
     * Urutannya penting. Register/login/refresh/logout dan route Google ada DI
     * ATAS sehingga tidak butuh access token (orang yang mau login memang belum punya).
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
    }), { detail: authDocs.me });
}

/**
 * ============================================================================
 *  LOGIN DENGAN GOOGLE (OAuth 2.0 "authorization code flow" + PKCE)
 * ============================================================================
 *
 * ANALOGI: kamu mau masuk gedung (Loka Living) tapi tidak punya kartu anggota.
 * Kamu bilang "saya punya KTP dari Google". Resepsionis (backend) TIDAK menerima
 * KTP-nya langsung dari tanganmu (bisa palsu). Sebaliknya:
 *   1. Resepsionis mengirimmu ke kantor Google dengan secarik kertas bernomor
 *      rahasia (state + code_verifier), dan menyimpan salinannya di saku
 *      (cookie).
 *   2. Google memeriksa identitasmu, lalu mengirimmu kembali membawa "kode
 *      tukar" sekali pakai (code) dan nomor yang sama (state).
 *   3. Resepsionis mencocokkan nomor di kertasmu dengan salinan di sakunya.
 *      Beda = ditolak (mungkin ada yang menyuruhmu memakai kode orang lain).
 *   4. Resepsionis menelepon Google langsung: "kode ini asli? siapa orangnya?"
 *      Baru percaya setelah Google sendiri yang menjawab.
 *
 * ALUR TEKNIS:
 *   Browser ──GET /google──────────────► backend: buat state + code_verifier,
 *                                         simpan di 2 cookie (10 menit)
 *   Browser ◄──302 ke accounts.google.com─ backend
 *   (user login & setuju di Google)
 *   Browser ◄──302 /google/callback?code&state── Google
 *   Browser ──GET /google/callback─────► backend: cocokkan state, tukar code
 *                                         ke Google, cari/buat user, pasang
 *                                         cookie refresh_token
 *   Browser ◄──302 ke FRONTEND/auth/callback
 *   Frontend memanggil POST /refresh untuk mendapat access token.
 *
 * Kenapa access token TIDAK dikirim lewat URL redirect? Alamat URL tersimpan
 * di riwayat browser dan log server. Token di sana bisa bocor.
 *
 * Istilah:
 *   - state          : nomor acak pencegah CSRF login (serangan yang menyuruh
 *                      browser korban memakai kode milik penyerang).
 *   - code_verifier  : rahasia PKCE. Google menerima "sidik jari"-nya di awal
 *                      (code_challenge), dan memintanya lagi saat penukaran
 *                      kode, sehingga kode yang dicuri di tengah jalan tidak
 *                      bisa dipakai pihak lain.
 */
const GOOGLE_STATE_COOKIE = "google_oauth_state";
const GOOGLE_VERIFIER_COOKIE = "google_code_verifier";
const GOOGLE_COOKIE_PATH = "/api/auth/google";

// Semua kegagalan callback berupa redirect ke frontend: yang membuka URL ini adalah browser user, bukan fetch().
const callbackUrl = (error?: string) =>
  `${env.FRONTEND_URL}/auth/callback${error ? `?error=${error}` : ""}`;

type LimitByIp = (ctx: { request: Request; server: { requestIP(r: Request): { address: string } | null } | null }) => void;

/**
 * Membangun route Google. `google` = null berarti belum dikonfigurasi
 * (GOOGLE_* di .env kosong): endpoint tetap ada tapi menjawab 503 dan server
 * tetap berjalan normal.
 */
function googleRoutes(google: Google | null, limitByIp: LimitByIp) {
  return new Elysia({ prefix: "/google" })
    /**
     * GET /api/auth/google — langkah 1: kirim user ke Google.
     * Buat state + code_verifier, simpan di dua cookie httpOnly (path khusus
     * /api/auth/google, umur 10 menit), lalu redirect 302 ke Google.
     */
    .get("", ({ cookie, redirect }) => {
      if (!google) {
        return new Response(
          JSON.stringify({ error: "Login Google belum diaktifkan.", code: "GOOGLE_AUTH_DISABLED" }),
          { status: 503, headers: { "content-type": "application/json" } },
        );
      }

      const state = generateState();
      const codeVerifier = generateCodeVerifier();
      const options = {
        httpOnly: true,
        sameSite: "lax" as const,
        secure: env.COOKIE_SECURE,
        path: GOOGLE_COOKIE_PATH,
        maxAge: 600,
      };
      cookie[GOOGLE_STATE_COOKIE]!.set({ value: state, ...options });
      cookie[GOOGLE_VERIFIER_COOKIE]!.set({ value: codeVerifier, ...options });

      return redirect(google.createAuthorizationURL(state, codeVerifier, ["openid", "profile", "email"]).toString(), 302);
    }, { beforeHandle: limitByIp, detail: authDocs.googleStart })
    /**
     * GET /api/auth/google/callback — langkah 3: Google mengembalikan user ke sini.
     *
     * Semua kegagalan berupa REDIRECT ke `FRONTEND_URL/auth/callback?error=<kode>`
     * (bukan JSON) karena yang membuka alamat ini adalah browser user, bukan
     * fetch() dari frontend.
     *
     * Urutan pemeriksaan (berhenti di yang pertama gagal):
     *   1. Hapus cookie state/verifier (sekali pakai, apa pun hasilnya).
     *   2. Google belum dikonfigurasi         → google_auth_disabled
     *   3. state query ≠ state cookie         → google_state_mismatch
     *   4. user menekan Batal / tidak ada code → google_access_denied
     *   5. tukar code ke Google gagal          → google_exchange_failed
     *   6. klaim id_token tidak lengkap        → google_exchange_failed
     *   7. email belum terverifikasi di Google → google_email_unverified
     *   8. cari/hubungkan/buat user (loginWithGoogle di auth.service.ts);
     *      gagal → kode dari GoogleLoginError atau google_login_failed
     *   9. sukses: pasang cookie refresh_token, redirect ke frontend tanpa error.
     */
    .get(
      "/callback",
      async ({ query, cookie, headers, redirect }) => {
        const savedState = cookie[GOOGLE_STATE_COOKIE]?.value;
        const codeVerifier = cookie[GOOGLE_VERIFIER_COOKIE]?.value;

        // cookie sekali pakai: hapus apa pun hasilnya
        for (const name of [GOOGLE_STATE_COOKIE, GOOGLE_VERIFIER_COOKIE]) {
          cookie[name]!.set({ value: "", maxAge: 0, path: GOOGLE_COOKIE_PATH });
        }

        if (!google) return redirect(callbackUrl("google_auth_disabled"), 302);

        // state harus sama dengan cookie: mencegah CSRF login (penyerang menyuruh browser korban memakai code miliknya)
        if (
          typeof savedState !== "string" ||
          typeof codeVerifier !== "string" ||
          !query.state ||
          !timingSafeEqualString(query.state, savedState)
        ) {
          return redirect(callbackUrl("google_state_mismatch"), 302);
        }

        // user menekan "Batal" di halaman Google
        if (query.error || !query.code) return redirect(callbackUrl("google_access_denied"), 302);

        let claims: Record<string, unknown>;
        try {
          const tokens = await google.validateAuthorizationCode(query.code, codeVerifier);
          claims = decodeIdToken(tokens.idToken()) as Record<string, unknown>;
        } catch (err) {
          console.error("[auth] pertukaran code Google gagal", err);
          return redirect(callbackUrl("google_exchange_failed"), 302);
        }

        if (typeof claims.sub !== "string" || typeof claims.email !== "string") {
          return redirect(callbackUrl("google_exchange_failed"), 302);
        }
        if (claims.email_verified !== true) return redirect(callbackUrl("google_email_unverified"), 302);

        try {
          const { refreshToken } = await loginWithGoogle(
            { sub: claims.sub, email: claims.email, name: typeof claims.name === "string" ? claims.name : undefined },
            userAgentOf(headers),
          );
          setRefreshCookie(cookie, refreshToken);
          return redirect(callbackUrl(), 302);
        } catch (err) {
          if (err instanceof GoogleLoginError) return redirect(callbackUrl(err.code), 302);
          console.error("[auth] login Google gagal", err);
          return redirect(callbackUrl("google_login_failed"), 302);
        }
      },
      {
        beforeHandle: limitByIp,
        detail: authDocs.googleCallback,
        query: t.Object({
          code: t.Optional(t.String()),
          state: t.Optional(t.String()),
          error: t.Optional(t.String()),
        }),
      },
    );
}
