import { afterAll, describe, expect, test } from "bun:test";
import { Google } from "arctic";
import { count, eq, like } from "drizzle-orm";
import { Elysia } from "elysia";
import { env } from "../src/config/env";
import { db } from "../src/db/client";
import { refreshTokens, users } from "../src/db/schema";
import { errorHandler } from "../src/lib/errors";
import { authRoutes } from "../src/modules/auth/auth.routes";
import { GoogleLoginError, loginWithGoogle, registerUser } from "../src/modules/auth/auth.service";

const PREFIX = "googletest-";
const unique = () => crypto.randomUUID().slice(0, 8);
const fakeGoogle = new Google("id", "secret", "http://localhost:8000/api/auth/google/callback");

const appWith = (client: Google | null) =>
  new Elysia().use(errorHandler).group("/api", (api) => api.use(authRoutes(client)));

const get = (app: ReturnType<typeof appWith>, path: string, cookie?: string) =>
  app.handle(new Request(`http://localhost/api/auth/google${path}`, { headers: cookie ? { cookie } : {} }));

const totalUsers = async () => (await db.select({ n: count() }).from(users))[0]!.n;

afterAll(async () => {
  await db.delete(users).where(like(users.email, `${PREFIX}%`));
});

describe("GET /api/auth/google", () => {
  test("env Google kosong → 503 GOOGLE_AUTH_DISABLED", async () => {
    const res = await get(appWith(null), "");
    expect(res.status).toBe(503);
    expect(((await res.json()) as { code: string }).code).toBe("GOOGLE_AUTH_DISABLED");
  });

  test("302 ke accounts.google.com dengan state & code_challenge, dua cookie httpOnly", async () => {
    const res = await get(appWith(fakeGoogle), "");
    expect(res.status).toBe(302);

    const location = new URL(res.headers.get("location")!);
    expect(location.host).toBe("accounts.google.com");
    expect(location.searchParams.get("state")).toBeString();
    expect(location.searchParams.get("code_challenge")).toBeString();
    expect(location.searchParams.get("scope")).toBe("openid profile email");

    const cookies = res.headers.getSetCookie();
    const state = cookies.find((c) => c.startsWith("google_oauth_state="))!;
    const verifier = cookies.find((c) => c.startsWith("google_code_verifier="))!;
    for (const c of [state, verifier]) {
      expect(c).toContain("HttpOnly");
      expect(c).toContain("SameSite=Lax");
      expect(c).toContain("Path=/api/auth/google");
      expect(c).toContain("Max-Age=600");
    }
    // state di cookie = state di URL
    expect(state).toContain(`google_oauth_state=${location.searchParams.get("state")}`);
  });
});

describe("GET /api/auth/google/callback", () => {
  const errorOf = (res: Response) => new URL(res.headers.get("location")!).searchParams.get("error");

  test("state diubah → redirect google_state_mismatch, tidak ada user dibuat", async () => {
    const before = await totalUsers();
    const res = await get(
      appWith(fakeGoogle),
      "/callback?code=abc&state=diubah",
      "google_oauth_state=asli; google_code_verifier=verifier",
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${env.FRONTEND_URL}/auth/callback?error=google_state_mismatch`);
    expect(await totalUsers()).toBe(before);
  });

  test("tanpa cookie → google_state_mismatch", async () => {
    const res = await get(appWith(fakeGoogle), "/callback?code=abc&state=apa-saja");
    expect(errorOf(res)).toBe("google_state_mismatch");
  });

  test("cookie state & verifier dihapus setelah callback", async () => {
    const res = await get(appWith(fakeGoogle), "/callback?code=abc&state=x", "google_oauth_state=y; google_code_verifier=v");
    const cleared = res.headers.getSetCookie().filter((c) => /^google_(oauth_state|code_verifier)=;/.test(c));
    expect(cleared).toHaveLength(2);
  });

  test("user menekan Batal di Google → google_access_denied", async () => {
    const res = await get(
      appWith(fakeGoogle),
      "/callback?error=access_denied&state=s",
      "google_oauth_state=s; google_code_verifier=v",
    );
    expect(errorOf(res)).toBe("google_access_denied");
  });

  // client tiruan: tidak ada panggilan jaringan ke Google
  const fakeWith = (impl: () => { idToken(): string }) =>
    ({ validateAuthorizationCode: async () => impl() }) as unknown as Google;
  const idToken = (claims: object) =>
    `h.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.s`;
  const cb = (client: Google) =>
    get(appWith(client), "/callback?code=c&state=s", "google_oauth_state=s; google_code_verifier=v");

  test("tukar code gagal → google_exchange_failed", async () => {
    const res = await cb(fakeWith(() => { throw new Error("invalid_grant"); }));
    expect(errorOf(res)).toBe("google_exchange_failed");
  });

  test("email_verified bukan true → google_email_unverified, tidak ada user dibuat", async () => {
    const email = `${PREFIX}${unique()}@contoh.com`;
    const res = await cb(fakeWith(() => ({ idToken: () => idToken({ sub: "x", email, email_verified: false }) })));
    expect(errorOf(res)).toBe("google_email_unverified");
    expect(await db.select().from(users).where(eq(users.email, email))).toHaveLength(0);
  });

  test("sukses → redirect tanpa error + cookie refresh; user dibuat", async () => {
    const email = `${PREFIX}${unique()}@contoh.com`;
    const res = await cb(
      fakeWith(() => ({ idToken: () => idToken({ sub: `sub-${unique()}`, email, email_verified: true, name: "Sari" }) })),
    );
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`${env.FRONTEND_URL}/auth/callback`);
    expect(res.headers.getSetCookie().some((c) => c.startsWith("refresh_token=") && c.includes("HttpOnly"))).toBe(true);
    expect(await db.select().from(users).where(eq(users.email, email))).toHaveLength(1);
  });
});

describe("loginWithGoogle", () => {
  test("login pertama membuat user baru tanpa password; login berikutnya memakai user yang sama", async () => {
    const email = `${PREFIX}${unique()}@contoh.com`;
    const sub = `sub-${unique()}`;

    await loginWithGoogle({ sub, email, name: "Sari" }, null);
    await loginWithGoogle({ sub, email, name: "Sari" }, "ua");

    const rows = await db.select().from(users).where(eq(users.email, email));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ googleId: sub, passwordHash: null, name: "Sari" });
    expect(rows[0]!.emailVerifiedAt).not.toBeNull();

    const tokens = await db.select().from(refreshTokens).where(eq(refreshTokens.userId, rows[0]!.id));
    expect(tokens).toHaveLength(2);
    expect(tokens[0]!.familyId).not.toBe(tokens[1]!.familyId);
  });

  test("nama kosong → bagian sebelum @", async () => {
    const local = `${PREFIX}${unique()}`;
    await loginWithGoogle({ sub: `sub-${unique()}`, email: `${local}@contoh.com` }, null);
    const [row] = await db.select().from(users).where(eq(users.email, `${local}@contoh.com`));
    expect(row!.name).toBe(local);
  });

  test("akun email/password dengan email sama → dihubungkan, tetap satu user", async () => {
    const email = `${PREFIX}${unique()}@contoh.com`;
    const sub = `sub-${unique()}`;
    const { user } = await registerUser({ email, password: "password-rahasia", name: "Budi", userAgent: null });

    await loginWithGoogle({ sub, email: email.toUpperCase(), name: "Budi G" }, null);

    const rows = await db.select().from(users).where(eq(users.email, email));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(user.id);
    expect(rows[0]!.googleId).toBe(sub);
    expect(rows[0]!.emailVerifiedAt).not.toBeNull();
    expect(rows[0]!.passwordHash).not.toBeNull();
  });

  test("email sudah tertaut ke akun Google lain → google_account_conflict, tidak ditimpa", async () => {
    const email = `${PREFIX}${unique()}@contoh.com`;
    const sub = `sub-${unique()}`;
    await loginWithGoogle({ sub, email }, null);

    const err = await loginWithGoogle({ sub: `sub-${unique()}`, email }, null).catch((e) => e);
    expect(err).toBeInstanceOf(GoogleLoginError);
    expect(err.code).toBe("google_account_conflict");

    const [row] = await db.select().from(users).where(eq(users.email, email));
    expect(row!.googleId).toBe(sub);
  });

  test("akun yang sudah dihapus → google_account_disabled, tanpa refresh token", async () => {
    const email = `${PREFIX}${unique()}@contoh.com`;
    const sub = `sub-${unique()}`;
    await loginWithGoogle({ sub, email }, null);
    const [row] = await db.update(users).set({ deletedAt: new Date() }).where(eq(users.email, email)).returning();
    const before = (await db.select().from(refreshTokens).where(eq(refreshTokens.userId, row!.id))).length;

    const err = await loginWithGoogle({ sub, email }, null).catch((e) => e);
    expect(err.code).toBe("google_account_disabled");
    expect((await db.select().from(refreshTokens).where(eq(refreshTokens.userId, row!.id))).length).toBe(before);
  });

  test("login password untuk akun yang hanya Google → 401 INVALID_CREDENTIALS", async () => {
    const email = `${PREFIX}${unique()}@contoh.com`;
    await loginWithGoogle({ sub: `sub-${unique()}`, email }, null);

    const res = await appWith(null).handle(
      new Request("http://localhost/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password: "apa-saja-123" }),
      }),
    );
    expect(res.status).toBe(401);
    expect(((await res.json()) as { code: string }).code).toBe("INVALID_CREDENTIALS");
  });
});
