import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Elysia } from "elysia";
import { eq, like } from "drizzle-orm";
import { createApp } from "../src/app";
import { db } from "../src/db/client";
import { users } from "../src/db/schema";
import { jwtPlugin } from "../src/modules/auth/tokens";

const app = createApp({ enableJobs: false });
const EMAIL_PREFIX = "sessiontest-";
const email = `${EMAIL_PREFIX}${crypto.randomUUID().slice(0, 8)}@contoh.com`;
const password = "password-rahasia";

type Json = Record<string, any>;

const call = (path: string, init: RequestInit = {}) => app.handle(new Request(`http://localhost/api/auth${path}`, init));

const cookieOf = (res: Response) => /refresh_token=([^;]*)/.exec(res.headers.get("set-cookie") ?? "")?.[1];

const refresh = (token?: string) =>
  call("/refresh", { method: "POST", headers: token ? { cookie: `refresh_token=${token}` } : {} });

let accessToken: string;
let userId: string;
let cookie1: string;

beforeAll(async () => {
  const res = await call("/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email, password, name: "Sesi" }),
  });
  const body = (await res.json()) as Json;
  accessToken = body.access_token;
  userId = body.user.id;
  cookie1 = cookieOf(res)!;
});

afterAll(async () => {
  await db.delete(users).where(like(users.email, `${EMAIL_PREFIX}%`));
});

describe("guard & /me", () => {
  test("tanpa header → 401 UNAUTHORIZED", async () => {
    const res = await call("/me");
    expect(res.status).toBe(401);
    expect(((await res.json()) as Json).code).toBe("UNAUTHORIZED");
  });

  test("token sampah → 401", async () => {
    const res = await call("/me", { headers: { authorization: "Bearer bukan.jwt.valid" } });
    expect(res.status).toBe(401);
  });

  test("token valid → 200, tanpa field sensitif", async () => {
    const res = await call("/me", { headers: { authorization: `Bearer ${accessToken}` } });
    expect(res.status).toBe(200);
    const { user } = (await res.json()) as Json;
    expect(user).toMatchObject({ id: userId, email, name: "Sesi", has_password: true, google_linked: false });
    expect(JSON.stringify(user)).not.toContain("password_hash");
  });

  test("token yang sudah lewat exp → 401", async () => {
    const signer = new Elysia()
      .use(jwtPlugin)
      .get("/t", ({ jwt }) => jwt.sign({ sub: userId, type: "access", exp: Math.floor(Date.now() / 1000) - 10 }));
    const expired = await (await signer.handle(new Request("http://localhost/t"))).text();

    const res = await call("/me", { headers: { authorization: `Bearer ${expired}` } });
    expect(res.status).toBe(401);
  });

  test("token dengan type selain access → 401", async () => {
    const signer = new Elysia().use(jwtPlugin).get("/t", ({ jwt }) => jwt.sign({ sub: userId, type: "refresh" }));
    const wrongType = await (await signer.handle(new Request("http://localhost/t"))).text();

    const res = await call("/me", { headers: { authorization: `Bearer ${wrongType}` } });
    expect(res.status).toBe(401);
  });
});

describe("refresh & logout", () => {
  let cookie2: string;
  let cookie3: string;

  test("refresh tanpa cookie → 401 REFRESH_TOKEN_MISSING", async () => {
    const res = await refresh();
    expect(res.status).toBe(401);
    expect(((await res.json()) as Json).code).toBe("REFRESH_TOKEN_MISSING");
  });

  test("cookie acak → 401 REFRESH_TOKEN_INVALID + cookie dihapus", async () => {
    const res = await refresh("tidak-ada-di-database");
    expect(res.status).toBe(401);
    expect(((await res.json()) as Json).code).toBe("REFRESH_TOKEN_INVALID");
    expect(res.headers.get("set-cookie")).toContain("refresh_token=;");
  });

  test("refresh sukses: access token baru dan cookie berbeda", async () => {
    const res = await refresh(cookie1);
    expect(res.status).toBe(200);
    const body = (await res.json()) as Json;
    expect(body.access_token).toBeString();
    expect(body.user.email).toBe(email);
    cookie2 = cookieOf(res)!;
    expect(cookie2).not.toBe(cookie1);
  });

  test("cookie lama dipakai lagi → REUSED, lalu cookie terbaru ikut mati (family dicabut)", async () => {
    const reused = await refresh(cookie1);
    expect(reused.status).toBe(401);
    expect(((await reused.json()) as Json).code).toBe("REFRESH_TOKEN_REUSED");

    const latest = await refresh(cookie2);
    expect(latest.status).toBe(401);
    expect(((await latest.json()) as Json).code).toBe("REFRESH_TOKEN_REUSED");
  });

  test("dua refresh paralel dengan cookie sama → tepat satu yang 200", async () => {
    const login = await call("/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    cookie3 = cookieOf(login)!;

    const results = await Promise.all([refresh(cookie3), refresh(cookie3)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 401]);
  });

  test("logout lalu refresh → 401; logout dua kali → keduanya 204", async () => {
    const login = await call("/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const token = cookieOf(login)!;

    const headers = { cookie: `refresh_token=${token}` };
    const out1 = await call("/logout", { method: "POST", headers });
    const out2 = await call("/logout", { method: "POST", headers });
    const outNoCookie = await call("/logout", { method: "POST" });
    expect([out1.status, out2.status, outNoCookie.status]).toEqual([204, 204, 204]);
    expect(out1.headers.get("set-cookie")).toContain("refresh_token=;");

    expect((await refresh(token)).status).toBe(401);
  });

  test("logout satu perangkat tidak memutus perangkat lain", async () => {
    const login = () =>
      call("/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
    const phone = cookieOf(await login())!;
    const laptop = cookieOf(await login())!;

    await call("/logout", { method: "POST", headers: { cookie: `refresh_token=${phone}` } });

    expect((await refresh(laptop)).status).toBe(200);
  });

  test("akun yang dihapus tidak bisa refresh", async () => {
    const login = await call("/login", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const token = cookieOf(login)!;
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.id, userId));

    expect((await refresh(token)).status).toBe(401);
  });
});
