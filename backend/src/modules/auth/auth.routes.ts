import { Elysia, t } from "elysia";
import { env } from "../../config/env";
import { createRateLimiter } from "../../lib/rate-limit";
import { type PublicUser, loginUser, registerUser } from "./auth.service";
import { jwtPlugin, setRefreshCookie, signAccessToken } from "./tokens";

// 10 request per menit per IP, dipakai bersama oleh /register dan /login
const authLimiter = createRateLimiter(10, 60_000);

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

export const authRoutes = new Elysia({ prefix: "/auth" })
  .use(jwtPlugin)
  .onBeforeHandle(({ request, server }) => {
    // Di belakang reverse proxy, IP asli ada di X-Forwarded-For; atur di sana, jangan percaya header dari client.
    authLimiter(server?.requestIP(request)?.address ?? "unknown");
  })
  .post(
    "/register",
    async ({ body, jwt, cookie, headers, set }) => {
      const { user, refreshToken } = await registerUser({ ...body, userAgent: userAgentOf(headers) });
      setRefreshCookie(cookie, refreshToken);
      set.status = 201;
      return authResponse(jwt, user);
    },
    {
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
      body: t.Object({
        email: t.String({ maxLength: 254 }),
        password: t.String({ minLength: 1, maxLength: 72 }),
      }),
    },
  );
