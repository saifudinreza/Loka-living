import type { Google } from "arctic";
import { decodeIdToken, generateCodeVerifier, generateState } from "arctic";
import { Elysia, t } from "elysia";
import { env } from "../../config/env";
import { timingSafeEqualString } from "../../lib/crypto";
import { createRateLimiter } from "../../lib/rate-limit";
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
export function authRoutes(google: Google | null = defaultGoogle) {
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
    .use(googleRoutes(google, limitByIp))
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

const GOOGLE_STATE_COOKIE = "google_oauth_state";
const GOOGLE_VERIFIER_COOKIE = "google_code_verifier";
const GOOGLE_COOKIE_PATH = "/api/auth/google";

// Semua kegagalan callback berupa redirect ke frontend: yang membuka URL ini adalah browser user, bukan fetch().
const callbackUrl = (error?: string) =>
  `${env.FRONTEND_URL}/auth/callback${error ? `?error=${error}` : ""}`;

type LimitByIp = (ctx: { request: Request; server: { requestIP(r: Request): { address: string } | null } | null }) => void;

function googleRoutes(google: Google | null, limitByIp: LimitByIp) {
  return new Elysia({ prefix: "/google" })
    .get("/", ({ cookie, redirect }) => {
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
    }, { beforeHandle: limitByIp })
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
        query: t.Object({
          code: t.Optional(t.String()),
          state: t.Optional(t.String()),
          error: t.Optional(t.String()),
        }),
      },
    );
}
