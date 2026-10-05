import { openapi } from "@elysiajs/openapi";
import { Elysia } from "elysia";

/**
 * Dokumentasi API untuk pengembangan lokal. Hanya dipasang saat NODE_ENV bukan
 * "production" (lihat createApp): di production, peta API tidak perlu terbuka.
 *
 *   /swagger            Swagger UI (coba endpoint langsung dari browser)
 *   /swagger/json       spesifikasi OpenAPI mentah
 *   /docs/auth-flows    diagram alur login biasa, refresh, dan Google
 */
const FLOWS_PATH = "/docs/auth-flows";

export const docsRoutes = new Elysia()
  .use(
    openapi({
      provider: "swagger-ui",
      path: "/swagger",
      exclude: { paths: [FLOWS_PATH] },
      documentation: {
        info: {
          title: "Loka Living API",
          version: "0.1.0",
          description: [
            "API backend Loka Living (Bun + Elysia + Drizzle).",
            "",
            `Diagram alur auth: [${FLOWS_PATH}](${FLOWS_PATH})`,
            "",
            "**Cara mencoba endpoint yang butuh login:**",
            "1. Jalankan `POST /api/auth/register` atau `POST /api/auth/login`, salin `access_token` dari response.",
            "2. Klik **Authorize**, tempel token di `bearerAuth`.",
            "3. Coba `GET /api/auth/me`.",
          ].join("\n"),
        },
        tags: [{ name: "Auth", description: "Register, login, sesi (refresh token), dan login Google" }],
        components: {
          securitySchemes: {
            bearerAuth: {
              type: "http",
              scheme: "bearer",
              bearerFormat: "JWT",
              description: "Access token dari /register, /login, atau /refresh (berlaku 15 menit).",
            },
            refreshCookie: {
              type: "apiKey",
              in: "cookie",
              name: "refresh_token",
              description: "Cookie httpOnly yang dipasang /register, /login, /refresh. Dikirim browser otomatis.",
            },
          },
        },
      },
    }),
  )
  .get(
    FLOWS_PATH,
    () =>
      new Response(Bun.file(new URL("./auth-flows.html", import.meta.url)), {
        headers: { "content-type": "text/html; charset=utf-8" },
      }),
  );
