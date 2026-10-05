import { jwt } from "@elysiajs/jwt";
import type { Cookie } from "elysia";
import { env } from "../../config/env";
import { type Database, type Transaction } from "../../db/client";
import { refreshTokens } from "../../db/schema";
import { randomToken, sha256Hex } from "../../lib/crypto";

export const REFRESH_COOKIE = "refresh_token";
const REFRESH_COOKIE_PATH = "/api/auth";
const REFRESH_TTL_SECONDS = env.REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60;

export const jwtPlugin = jwt({
  name: "jwt",
  secret: env.JWT_ACCESS_SECRET,
  // string "Ns" = relatif dari sekarang (angka murni akan dibaca sebagai epoch absolut)
  exp: `${env.ACCESS_TOKEN_TTL_SECONDS}s`,
});

interface JwtSigner {
  sign(payload: Record<string, string | number>): Promise<string>;
}

export function signAccessToken(signer: JwtSigner, user: { id: string }): Promise<string> {
  return signer.sign({ sub: user.id, type: "access" });
}

/** Mengembalikan token ASLI; di database hanya hash-nya yang disimpan. */
export async function issueRefreshToken(
  conn: Database | Transaction,
  userId: string,
  userAgent: string | null,
  familyId: string = crypto.randomUUID(),
): Promise<string> {
  const token = randomToken();
  await conn.insert(refreshTokens).values({
    userId,
    tokenHash: sha256Hex(token),
    familyId,
    expiresAt: new Date(Date.now() + REFRESH_TTL_SECONDS * 1000),
    userAgent,
  });
  return token;
}

export function setRefreshCookie(cookie: Record<string, Cookie<unknown>>, token: string): void {
  cookie[REFRESH_COOKIE]!.set({
    value: token,
    httpOnly: true,
    sameSite: "lax",
    secure: env.COOKIE_SECURE,
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_TTL_SECONDS,
  });
}

export function clearRefreshCookie(cookie: Record<string, Cookie<unknown>>): void {
  // path harus sama dengan saat set, kalau tidak browser tidak menghapusnya
  cookie[REFRESH_COOKIE]!.set({ value: "", maxAge: 0, path: REFRESH_COOKIE_PATH });
}
