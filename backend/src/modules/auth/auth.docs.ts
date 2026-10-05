/**
 * auth.docs.ts — teks dokumentasi Swagger/OpenAPI untuk endpoint auth.
 *
 * Dipisah dari auth.routes.ts supaya file route tetap fokus pada logika.
 * Isi di sini HANYA dokumentasi: contoh response tidak divalidasi saat runtime,
 * jadi mengubah file ini tidak mengubah perilaku API.
 *
 * Dibuka di lokal: http://localhost:8000/swagger (hanya di development).
 */

import type { DocumentDecoration } from "elysia";

const TAG = "Auth";

const json = (example: unknown) => ({ "application/json": { example } });

const errorExample = (code: string, error: string) => json({ error, code });

const authSuccess = {
  access_token: "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIuLi4iLCJ0eXBlIjoiYWNjZXNzIn0.signature",
  token_type: "Bearer",
  expires_in: 900,
  user: { id: "4f9c2a1e-8b7d-4c3a-9e21-0a1b2c3d4e5f", email: "budi@contoh.com", name: "Budi" },
};

const setCookieHeader = {
  "Set-Cookie": {
    description: "Refresh token (30 hari): `refresh_token=...; HttpOnly; SameSite=Lax; Path=/api/auth`",
    schema: { type: "string" as const },
  },
};

const tooManyRequests = {
  description: "Terlalu banyak percobaan (maks 10 request/menit per IP)",
  content: errorExample("TOO_MANY_REQUESTS", "Terlalu banyak percobaan. Coba lagi sebentar lagi."),
};

const validationFailed = {
  description: "Body tidak sesuai skema",
  content: errorExample("VALIDATION_FAILED", 'Data tidak valid pada field "email".'),
};

/** Lokasi frontend tempat Google callback mengembalikan user. */
const FRONTEND_CALLBACK = "`FRONTEND_URL/auth/callback`";

export const authDocs = {
  register: {
    tags: [TAG],
    summary: "Daftar akun baru (email + password)",
    description: [
      "Membuat akun, lalu langsung login.",
      "",
      "- Email di-trim dan di-lowercase; email yang sama dengan huruf berbeda dianggap sama.",
      "- Password 8–72 karakter, disimpan sebagai hash argon2id.",
      "- Mengembalikan **access token** (body, 15 menit) dan memasang **refresh token** di cookie httpOnly (30 hari).",
    ].join("\n"),
    responses: {
      201: { description: "Akun dibuat", headers: setCookieHeader, content: json(authSuccess) },
      409: { description: "Email sudah dipakai", content: errorExample("EMAIL_TAKEN", "Email sudah terdaftar.") },
      422: validationFailed,
      429: tooManyRequests,
    },
  },

  login: {
    tags: [TAG],
    summary: "Masuk dengan email + password",
    description: [
      "Pesan gagal **sama** untuk semua kasus (email tidak ada, password salah, akun hanya-Google, akun dihapus),",
      "dan waktu responsnya juga dibuat sama, supaya tidak membocorkan email mana yang terdaftar.",
      "",
      "Setiap login membuat *family* refresh token baru (satu family = satu sesi perangkat).",
    ].join("\n"),
    responses: {
      200: { description: "Berhasil", headers: setCookieHeader, content: json(authSuccess) },
      401: {
        description: "Kredensial salah",
        content: errorExample("INVALID_CREDENTIALS", "Email atau password salah."),
      },
      422: validationFailed,
      429: tooManyRequests,
    },
  },

  refresh: {
    tags: [TAG],
    summary: "Tukar refresh token (cookie) dengan access token baru",
    description: [
      "Tidak butuh header Authorization; cukup cookie `refresh_token` yang dikirim browser otomatis",
      "(frontend memanggil dengan `credentials: \"include\"`).",
      "",
      "**Rotasi:** refresh token lama dicabut dan diganti yang baru (family sama). Setiap token hanya bisa dipakai sekali.",
      "",
      "**Reuse detection:** kalau token yang sudah dicabut dipakai lagi, seluruh family dicabut dan user harus login ulang.",
      "",
      "Di Swagger UI: login dulu lewat `/login` di halaman ini, cookie akan terpasang di browser lalu endpoint ini bisa dicoba.",
    ].join("\n"),
    security: [{ refreshCookie: [] }],
    responses: {
      200: { description: "Access token baru + cookie baru", headers: setCookieHeader, content: json(authSuccess) },
      401: {
        description:
          "Gagal. `code` salah satu dari: `REFRESH_TOKEN_MISSING`, `REFRESH_TOKEN_INVALID`, `REFRESH_TOKEN_REUSED`, `REFRESH_TOKEN_EXPIRED`. Cookie dihapus (kecuali MISSING).",
        content: errorExample("REFRESH_TOKEN_REUSED", "Sesi tidak valid. Silakan login lagi."),
      },
    },
  },

  logout: {
    tags: [TAG],
    summary: "Keluar dari perangkat ini",
    description:
      "Mencabut refresh token di cookie (hanya perangkat ini, perangkat lain tetap login) dan menghapus cookie. Selalu 204, aman dipanggil berulang.",
    security: [{ refreshCookie: [] }],
    responses: { 204: { description: "Selesai (tanpa body)" } },
  },

  me: {
    tags: [TAG],
    summary: "Data user yang sedang login",
    description: "Butuh header `Authorization: Bearer <access_token>`. Klik tombol **Authorize** di atas dan tempel access token dari `/login`.",
    security: [{ bearerAuth: [] }],
    responses: {
      200: {
        description: "Data user (tanpa field sensitif)",
        content: json({
          user: {
            id: "4f9c2a1e-8b7d-4c3a-9e21-0a1b2c3d4e5f",
            email: "budi@contoh.com",
            name: "Budi",
            has_password: true,
            google_linked: false,
            created_at: "2026-10-01T12:00:00.000Z",
          },
        }),
      },
      401: {
        description: "Token tidak ada, tidak valid, kedaluwarsa, atau user dihapus",
        content: errorExample("UNAUTHORIZED", "Silakan login dulu."),
      },
    },
  },

  googleStart: {
    tags: [TAG],
    summary: "Mulai login Google (buka di browser, bukan lewat Try it out)",
    description: [
      "Membuat `state` + `code_verifier` (PKCE), menyimpannya di dua cookie httpOnly (10 menit), lalu redirect 302 ke Google.",
      "",
      "Endpoint ini dipakai dengan **membuka URL-nya langsung di browser**: http://localhost:8000/api/auth/google.",
      "\"Try it out\" di Swagger tidak bisa mengikuti redirect ke halaman login Google.",
    ].join("\n"),
    responses: {
      302: { description: "Redirect ke `accounts.google.com`" },
      503: {
        description: "`GOOGLE_*` di .env belum diisi",
        content: errorExample("GOOGLE_AUTH_DISABLED", "Login Google belum diaktifkan."),
      },
      429: tooManyRequests,
    },
  },

  googleCallback: {
    tags: [TAG],
    summary: "Tujuan balik dari Google (dipanggil oleh Google, bukan frontend)",
    description: [
      `Selalu berakhir dengan redirect 302 ke ${FRONTEND_CALLBACK}.`,
      "",
      "- Sukses: tanpa query, cookie `refresh_token` terpasang. Frontend lalu memanggil `POST /api/auth/refresh` untuk mendapat access token.",
      "- Gagal: `?error=<code>`, salah satu dari `google_state_mismatch`, `google_access_denied`, `google_exchange_failed`,",
      "  `google_email_unverified`, `google_email_invalid`, `google_account_conflict`, `google_account_disabled`, `google_login_failed`, `google_auth_disabled`.",
    ].join("\n"),
    responses: {
      302: { description: `Redirect ke ${FRONTEND_CALLBACK} (dengan atau tanpa \`?error=\`)` },
      429: tooManyRequests,
    },
  },
} satisfies Record<string, DocumentDecoration>;
