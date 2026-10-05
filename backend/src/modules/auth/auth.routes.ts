import { Elysia, t } from "elysia";
import { env } from "../../config/env";
import { createRateLimiter } from "../../lib/rate-limit";
import { requireAuth } from "./auth.guard";
import { type PublicUser, loginUser, refreshSession, registerUser, revokeRefreshToken } from "./auth.service";
import { REFRESH_COOKIE, clearRefreshCookie, jwtPlugin, setRefreshCookie, signAccessToken } from "./tokens";

const userAgentOf = (headers: Record<string, string | undefined>) =>
  headers["user-agent"]?.slice(0, 255) ?? null;

async function authResponse(jwt: Parameters<typeof signAccessToken>[0], user: PublicUser) {
  return {
    access_token: await signAccessToken(jwt, user),
    token_type: "Bearer" as const,
    expires_in: env.ACCESS_TOKEN_TTL_SECONDS,
    user: { id: user.id, email: user.email, name: user.name },
  };
}

// Limiter dibuat per instance app supaya test yang membuat app sendiri-sendiri tidak berbagi hitungan.
export function authRoutes() {
  // 10 request per menit per IP, dipakai bersama oleh /register dan /login
  const authLimiter = createRateLimiter(10, 60_000);

  // Di belakang reverse proxy, IP asli ada di X-Forwarded-For; atur di sana, jangan percaya header dari client.
  const limitByIp = ({ request, server }: { request: Request; server: { requestIP(r: Request): { address: string } | null } | null }) =>
    authLimiter(server?.requestIP(request)?.address ?? "unknown");

  return new Elysia({ prefix: "/auth" })
    .use(jwtPlugin)
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
    .post("/logout", async ({ cookie, set }) => {
      const raw = cookie[REFRESH_COOKIE]?.value;
      if (typeof raw === "string" && raw !== "") await revokeRefreshToken(raw);
      clearRefreshCookie(cookie);
      set.status = 204;
    })
    .use(requireAuth)
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
