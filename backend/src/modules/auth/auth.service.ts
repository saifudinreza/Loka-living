import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db/client";
import { refreshTokens, users } from "../../db/schema";
import { sha256Hex } from "../../lib/crypto";
import { AppError } from "../../lib/errors";
import { issueRefreshToken } from "./tokens";

export interface PublicUser {
  id: string;
  email: string;
  name: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// CHECK di database mewajibkan email lowercase, jadi selalu normalisasi sebelum insert dan sebelum mencari.
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function invalidField(field: string): AppError {
  return new AppError(422, "VALIDATION_FAILED", `Data tidak valid pada field "${field}".`);
}

// Hash palsu: dipakai supaya login email tak terdaftar tetap memakan waktu verify yang sama.
const DUMMY_HASH = await Bun.password.hash("dummy-password-for-timing");

const invalidCredentials = () => new AppError(401, "INVALID_CREDENTIALS", "Email atau password salah.");

export async function registerUser(input: {
  email: string;
  password: string;
  name: string;
  userAgent: string | null;
}): Promise<{ user: PublicUser; refreshToken: string }> {
  const email = normalizeEmail(input.email);
  const name = input.name.trim();
  if (email.length > 150 || !EMAIL_RE.test(email)) throw invalidField("email");
  if (name.length < 1 || name.length > 120) throw invalidField("name");

  // hash di luar transaksi: argon2 lambat, jangan menahan koneksi database selama itu
  const passwordHash = await Bun.password.hash(input.password);

  return db.transaction(async (tx) => {
    const [user] = await tx
      .insert(users)
      .values({ email, passwordHash, name })
      .onConflictDoNothing({ target: users.email })
      .returning({ id: users.id, email: users.email, name: users.name });

    // konflik ditangani atomik oleh unique index, tidak ada celah race antara cek dan insert
    if (!user) throw new AppError(409, "EMAIL_TAKEN", "Email sudah terdaftar.");

    const refreshToken = await issueRefreshToken(tx, user.id, input.userAgent);
    return { user, refreshToken };
  });
}

export async function loginUser(input: {
  email: string;
  password: string;
  userAgent: string | null;
}): Promise<{ user: PublicUser; refreshToken: string }> {
  const email = normalizeEmail(input.email);
  const [row] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  // verify selalu dijalankan sekali, ada atau tidaknya user
  const hash = row?.passwordHash ?? DUMMY_HASH;
  const passwordOk = await Bun.password.verify(input.password, hash);

  // user tidak ada / akun Google (tanpa password) / dihapus / password salah: respons identik
  if (!row || !row.passwordHash || row.deletedAt || !passwordOk) throw invalidCredentials();

  const refreshToken = await issueRefreshToken(db, row.id, input.userAgent);
  return { user: { id: row.id, email: row.email, name: row.name }, refreshToken };
}

type RefreshFailure = "INVALID" | "REUSED" | "EXPIRED";

const REFRESH_ERRORS: Record<RefreshFailure, AppError> = {
  INVALID: new AppError(401, "REFRESH_TOKEN_INVALID", "Sesi tidak valid. Silakan login lagi."),
  REUSED: new AppError(401, "REFRESH_TOKEN_REUSED", "Sesi tidak valid. Silakan login lagi."),
  EXPIRED: new AppError(401, "REFRESH_TOKEN_EXPIRED", "Sesi sudah berakhir. Silakan login lagi."),
};

/** Rotasi: token lama dicabut, token baru dalam family yang sama. Pemakaian ulang token yang sudah dicabut mencabut seluruh family. */
export async function refreshSession(
  rawToken: string,
  userAgent: string | null,
): Promise<{ user: PublicUser; refreshToken: string }> {
  const tokenHash = sha256Hex(rawToken);

  // Kegagalan dikembalikan sebagai nilai, bukan di-throw di dalam transaksi:
  // throw akan me-rollback pencabutan family pada kasus reuse.
  const result = await db.transaction(async (tx) => {
    // FOR UPDATE: dua refresh paralel dengan cookie sama diserialkan, yang kedua melihat token sudah dicabut
    const [row] = await tx.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, tokenHash)).for("update");
    if (!row) return { failure: "INVALID" as const };

    const now = new Date();

    if (row.revokedAt) {
      await tx
        .update(refreshTokens)
        .set({ revokedAt: now })
        .where(and(eq(refreshTokens.familyId, row.familyId), isNull(refreshTokens.revokedAt)));
      console.warn("[auth] refresh token reuse terdeteksi", { userId: row.userId, familyId: row.familyId });
      return { failure: "REUSED" as const };
    }

    if (row.expiresAt <= now) return { failure: "EXPIRED" as const };

    const [user] = await tx
      .select({ id: users.id, email: users.email, name: users.name })
      .from(users)
      .where(and(eq(users.id, row.userId), isNull(users.deletedAt)))
      .limit(1);
    if (!user) return { failure: "INVALID" as const };

    await tx.update(refreshTokens).set({ revokedAt: now }).where(eq(refreshTokens.id, row.id));
    const refreshToken = await issueRefreshToken(tx, user.id, userAgent, row.familyId);
    return { user, refreshToken };
  });

  if ("failure" in result && result.failure) throw REFRESH_ERRORS[result.failure];
  return result;
}

/** Idempoten: token tidak ditemukan atau sudah dicabut tidak dianggap error. Hanya token ini yang dicabut. */
export async function revokeRefreshToken(rawToken: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.tokenHash, sha256Hex(rawToken)), isNull(refreshTokens.revokedAt)));
}
