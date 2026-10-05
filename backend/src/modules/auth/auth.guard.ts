import { and, eq, isNull } from "drizzle-orm";
import { Elysia } from "elysia";
import { db } from "../../db/client";
import { users } from "../../db/schema";
import { AppError } from "../../lib/errors";
import { jwtPlugin } from "./tokens";

export type AuthUser = typeof users.$inferSelect;

const unauthorized = () => new AppError(401, "UNAUTHORIZED", "Silakan login dulu.");

interface JwtVerifier {
  verify(token?: string): Promise<false | Record<string, unknown>>;
}

/**
 * null = tidak ada header Authorization.
 * Header ada tapi token tidak valid / kedaluwarsa / user hilang = 401 (bug frontend tidak boleh tersembunyi).
 */
async function authenticate(jwt: JwtVerifier, authorization: string | undefined): Promise<AuthUser | null> {
  if (!authorization) return null;

  const token = /^Bearer (.+)$/i.exec(authorization)?.[1];
  if (!token) throw unauthorized();

  const payload = await jwt.verify(token);
  // type "access" mencegah token jenis lain (mis. nanti token reset password) dipakai sebagai access token
  if (!payload || payload.type !== "access" || typeof payload.sub !== "string") throw unauthorized();

  const [user] = await db
    .select()
    .from(users)
    .where(and(eq(users.id, payload.sub), isNull(users.deletedAt)))
    .limit(1);
  if (!user) throw unauthorized();

  return user;
}

/** Wajib login: tanpa token = 401. Menyediakan `user` di context. */
export const requireAuth = new Elysia({ name: "require-auth" })
  .use(jwtPlugin)
  .resolve({ as: "scoped" }, async ({ jwt, headers }) => {
    const user = await authenticate(jwt, headers.authorization);
    if (!user) throw unauthorized();
    return { user };
  });

/** Login opsional: tanpa token `user` = null. Dipakai checkout (tamu boleh). */
export const optionalAuth = new Elysia({ name: "optional-auth" })
  .use(jwtPlugin)
  .resolve({ as: "scoped" }, async ({ jwt, headers }) => ({
    user: await authenticate(jwt, headers.authorization),
  }));
