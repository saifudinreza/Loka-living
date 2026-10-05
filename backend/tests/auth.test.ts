import { afterAll, describe, expect, test } from "bun:test";
import { eq, like } from "drizzle-orm";
import { createApp } from "../src/app";
import { db } from "../src/db/client";
import { refreshTokens, users } from "../src/db/schema";
import { randomToken, sha256Hex, timingSafeEqualHex } from "../src/lib/crypto";
import { createRateLimiter } from "../src/lib/rate-limit";

const app = createApp({ enableJobs: false });
const EMAIL_PREFIX = "authtest-";
const email = `${EMAIL_PREFIX}${crypto.randomUUID().slice(0, 8)}@contoh.com`;
const password = "password-rahasia";

const post = (path: string, body: unknown) =>
  app.handle(
    new Request(`http://localhost/api/auth${path}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

afterAll(async () => {
  // refresh_tokens ikut terhapus (ON DELETE CASCADE)
  await db.delete(users).where(like(users.email, `${EMAIL_PREFIX}%`));
});

describe("crypto", () => {
  test("randomToken: 43 karakter base64url, tidak pernah sama", () => {
    const a = randomToken();
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(randomToken()).not.toBe(a);
  });

  test("sha256Hex: 64 hex, deterministik", () => {
    expect(sha256Hex("abc")).toBe("ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
  });

  test("timingSafeEqualHex: panjang beda false, sama true", () => {
    expect(timingSafeEqualHex("ab", "abcd")).toBe(false);
    expect(timingSafeEqualHex(sha256Hex("x"), sha256Hex("x"))).toBe(true);
    expect(timingSafeEqualHex(sha256Hex("x"), sha256Hex("y"))).toBe(false);
  });
});

describe("rate limiter", () => {
  test("request ke-11 dalam satu jendela ditolak, jendela baru reset", () => {
    const hit = createRateLimiter(10, 60_000);
    for (let i = 0; i < 10; i++) hit("ip", 1000);
    expect(() => hit("ip", 1000)).toThrow("Terlalu banyak");
    expect(() => hit("ip", 1000 + 60_001)).not.toThrow();
  });
});

describe("auth register & login", () => {
  test("register: 201, token di body, cookie refresh httpOnly, tanpa password_hash", async () => {
    const res = await post("/register", { email: `  ${email.toUpperCase()}  `, password, name: "  Budi  " });
    expect(res.status).toBe(201);

    const body = (await res.json()) as Record<string, any>;
    expect(body.token_type).toBe("Bearer");
    expect(body.expires_in).toBe(900);
    expect(body.user.email).toBe(email);
    expect(body.user.name).toBe("Budi");
    expect(JSON.stringify(body)).not.toContain("password");
    expect(JSON.stringify(body)).not.toContain("refresh");

    const cookie = res.headers.get("set-cookie") ?? "";
    expect(cookie).toContain("refresh_token=");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
    expect(cookie).toContain("Path=/api/auth");

    // database hanya menyimpan hash, bukan nilai cookie
    const raw = /refresh_token=([^;]+)/.exec(cookie)![1]!;
    const [stored] = await db
      .select({ hash: refreshTokens.tokenHash })
      .from(refreshTokens)
      .innerJoin(users, eq(users.id, refreshTokens.userId))
      .where(eq(users.email, email));
    expect(stored!.hash).toHaveLength(64);
    expect(stored!.hash).not.toBe(raw);
    expect(stored!.hash).toBe(sha256Hex(raw));
  });

  test("register email sama (beda huruf besar/kecil) → 409 EMAIL_TAKEN", async () => {
    const res = await post("/register", { email: email.toUpperCase(), password, name: "Budi" });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { code: string }).code).toBe("EMAIL_TAKEN");
  });

  test("login benar → 200 + cookie baru", async () => {
    const res = await post("/login", { email: email.toUpperCase(), password });
    expect(res.status).toBe(200);
    expect(res.headers.get("set-cookie")).toContain("refresh_token=");
    expect(((await res.json()) as { access_token: string }).access_token).toBeString();
  });

  test("password salah dan email tak terdaftar → respons identik", async () => {
    const wrong = await post("/login", { email, password: "salah-salah" });
    const unknown = await post("/login", { email: `${EMAIL_PREFIX}tidak-ada@contoh.com`, password });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await wrong.json()).toEqual(await unknown.json());
  });

  test("akun yang sudah dihapus tidak bisa login", async () => {
    await db.update(users).set({ deletedAt: new Date() }).where(eq(users.email, email));
    const res = await post("/login", { email, password });
    expect(res.status).toBe(401);
    expect(((await res.json()) as { code: string }).code).toBe("INVALID_CREDENTIALS");
  });

  // paling akhir: menghabiskan jatah 10 request/menit milik IP "unknown"
  test("terlalu banyak request → 429", async () => {
    let last = 0;
    for (let i = 0; i < 11; i++) last = (await post("/login", { email, password: "x" })).status;
    expect(last).toBe(429);
  });
});
