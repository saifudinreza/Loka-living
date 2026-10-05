import { eq } from "drizzle-orm";
import { db } from "../../db/client";
import { users } from "../../db/schema";
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
