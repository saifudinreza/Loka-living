/**
 * ============================================================================
 *  auth.service.ts — "otak" dari fitur login (aturan bisnisnya)
 * ============================================================================
 *
 * Pembagian tugas di folder auth (seperti restoran):
 *
 *   auth.routes.ts   = PELAYAN. Menerima pesanan (request) dari pelanggan,
 *                      mengantar hasilnya. Tidak memasak.
 *   auth.service.ts  = KOKI (file ini). Tahu resep: cara mendaftar, memeriksa
 *                      password, memutar (rotasi) token. Tidak peduli pesanan
 *                      datang lewat HTTP atau cara lain.
 *   tokens.ts        = pembuat tiket (JWT & refresh token) + urusan cookie.
 *   auth.guard.ts    = penjaga pintu.
 *
 * Kenapa dipisah? Supaya logika penting bisa dites tanpa HTTP, dan supaya
 * anggota tim bisa membaca "aturan bisnis" tanpa tersesat di detail HTTP.
 *
 * Fungsi di file ini:
 *   registerUser        → daftar akun baru
 *   loginUser           → masuk dengan email + password
 *   refreshSession      → tukar kupon (refresh token) lama dengan yang baru
 *   revokeRefreshToken  → logout (cabut satu kupon)
 */
import { and, eq, isNull } from "drizzle-orm";
import { db } from "../../db/client";
import { refreshTokens, users } from "../../db/schema";
import { sha256Hex } from "../../lib/crypto";
import { AppError } from "../../lib/errors";
import { issueRefreshToken } from "./tokens";

/**
 * Data user yang BOLEH dikirim ke client. Perhatikan: tidak ada passwordHash,
 * googleId, dll. Prinsipnya: kirim hanya yang perlu.
 */
export interface PublicUser {
  id: string;
  email: string;
  name: string;
}

/** Pola sederhana email: ada teks, "@", teks, ".", teks, tanpa spasi. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Merapikan email: buang spasi di pinggir, jadikan huruf kecil semua.
 * Supaya "  Budi@Contoh.COM " dan "budi@contoh.com" dianggap SATU orang yang
 * sama. Database juga menjaga ini dengan aturan CHECK (email harus lowercase),
 * jadi kita wajib merapikan SEBELUM menyimpan dan SEBELUM mencari.
 */
// CHECK di database mewajibkan email lowercase, jadi selalu normalisasi sebelum insert dan sebelum mencari.
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/** Membuat error 422 "data tidak valid" untuk satu field tertentu. */
function invalidField(field: string): AppError {
  return new AppError(422, "VALIDATION_FAILED", `Data tidak valid pada field "${field}".`);
}

/**
 * Hash PALSU, dihitung sekali saat server menyala.
 *
 * Untuk apa? Saat login, memeriksa password (argon2) itu sengaja LAMBAT (ratusan
 * milidetik). Kalau email tidak terdaftar kita langsung menjawab "salah" tanpa
 * memeriksa apa pun, jawabannya jauh lebih cepat. Penyerang yang mengukur
 * kecepatan bisa menebak "email ini terdaftar atau tidak".
 * Solusinya: untuk email tak terdaftar, tetap lakukan pemeriksaan lambat
 * terhadap hash palsu ini, sehingga waktunya sama saja.
 */
// Hash palsu: dipakai supaya login email tak terdaftar tetap memakan waktu verify yang sama.
const DUMMY_HASH = await Bun.password.hash("dummy-password-for-timing");

/**
 * Satu pesan error yang SAMA untuk semua alasan login gagal. Kalau pesannya
 * berbeda ("email tidak ditemukan" vs "password salah"), penyerang bisa
 * mengumpulkan daftar email yang terdaftar.
 */
const invalidCredentials = () => new AppError(401, "INVALID_CREDENTIALS", "Email atau password salah.");

/**
 * DAFTAR AKUN BARU.
 *
 * Alur:
 *   1. Rapikan email & nama, lalu validasi (format email, panjang nama).
 *   2. Hash password dengan argon2id. Password asli TIDAK pernah disimpan.
 *      (Dilakukan DI LUAR transaksi karena lambat, jangan menahan koneksi
 *      database selama proses itu.)
 *   3. Dalam SATU transaksi database (semua berhasil atau semua dibatalkan):
 *        a. Masukkan user baru. Kalau email sudah ada, `onConflictDoNothing`
 *           membuat insert diabaikan dan tidak mengembalikan baris.
 *        b. Tidak ada baris kembali → email sudah dipakai → 409 EMAIL_TAKEN.
 *        c. Buat refresh token untuk user itu (family baru).
 *   4. Kembalikan data user + refresh token (route yang memasang cookie-nya).
 *
 * Kenapa `onConflictDoNothing`, bukan "cek dulu baru insert"? Bayangkan dua
 * orang mendaftar dengan email sama pada detik yang sama: keduanya mengecek,
 * keduanya melihat "belum ada", keduanya insert, satu error aneh. Dengan
 * aturan unik di database, hanya satu yang menang dan yang lain mendapat 409
 * yang rapi. Tidak ada celah di antara "cek" dan "insert".
 */
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

/**
 * MASUK (LOGIN) dengan email + password.
 *
 * Alur:
 *   1. Rapikan email, cari user di database.
 *   2. Tentukan hash yang diperiksa: hash asli user, atau HASH PALSU kalau user
 *      tidak ada / tidak punya password (lihat penjelasan DUMMY_HASH).
 *   3. Periksa password dengan `Bun.password.verify` (SELALU dijalankan, satu
 *      kali, apa pun kasusnya, supaya waktunya konsisten).
 *   4. Tolak dengan pesan yang SAMA kalau salah satu terjadi:
 *        - user tidak ada
 *        - akun hanya login Google (passwordHash kosong)
 *        - akun sudah dihapus (deletedAt terisi)
 *        - password salah
 *   5. Berhasil: buat refresh token baru (family baru, karena ini login baru)
 *      dan kembalikan data user.
 */
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

/** Alasan sebuah refresh gagal. */
type RefreshFailure = "INVALID" | "REUSED" | "EXPIRED";

/** Peta alasan gagal → error yang dikirim ke client (kode berbeda, pesan aman). */
const REFRESH_ERRORS: Record<RefreshFailure, AppError> = {
  INVALID: new AppError(401, "REFRESH_TOKEN_INVALID", "Sesi tidak valid. Silakan login lagi."),
  REUSED: new AppError(401, "REFRESH_TOKEN_REUSED", "Sesi tidak valid. Silakan login lagi."),
  EXPIRED: new AppError(401, "REFRESH_TOKEN_EXPIRED", "Sesi sudah berakhir. Silakan login lagi."),
};

/**
 * TUKAR KUPON (refresh token) LAMA DENGAN YANG BARU — fungsi paling rumit di
 * file ini, dan paling penting untuk keamanan.
 *
 * KONSEP "ROTASI": setiap kupon hanya boleh dipakai SEKALI. Setelah ditukar,
 * kupon lama dicabut dan pemilik menerima kupon baru.
 *
 * KONSEP "REUSE DETECTION" (deteksi pemakaian ulang):
 *   login ─► T1 ─refresh─► T2 ─refresh─► T3
 *   Kalau ada yang memakai T1 LAGI padahal sudah dicabut, berarti ada dua pihak
 *   yang memegang kupon yang sama. Kemungkinan besar dicuri. Kita tidak tahu
 *   mana pemilik asli, jadi SELURUH keluarga (T1, T2, T3) dicabut dan dua-duanya
 *   harus login ulang.
 *   ANALOGI: kupon sekali pakai yang dicoba ditukar dua kali = kupon diduplikasi.
 *   Loket membatalkan semua kupon dari seri itu.
 *
 * Alur lengkap (semua dalam SATU transaksi):
 *   1. Hash token dari cookie, cari barisnya di database dengan `FOR UPDATE`
 *      (baris dikunci; lihat catatan di bawah).
 *   2. Tidak ketemu                → INVALID.
 *   3. Sudah dicabut (revokedAt)   → REUSED: cabut seluruh family, catat log.
 *   4. Sudah kedaluwarsa           → EXPIRED.
 *   5. User sudah dihapus/hilang   → INVALID.
 *   6. Normal: cabut token lama, buat token baru dengan family SAMA.
 *
 * Dua jebakan yang sengaja ditangani:
 *
 *   (a) `FOR UPDATE` = kunci baris. Kalau dua tab browser me-refresh bersamaan
 *       dengan kupon sama, yang kedua MENUNGGU yang pertama selesai, lalu
 *       melihat kuponnya sudah dicabut. Hasilnya tepat satu yang berhasil.
 *       Tanpa kunci, keduanya bisa lolos dan kupon jadi dua.
 *
 *   (b) Kegagalan DIKEMBALIKAN sebagai nilai (`{ failure }`), tidak di-throw di
 *       dalam transaksi. Kenapa? Kalau di-throw, transaksi dibatalkan (rollback)
 *       dan pencabutan family pada kasus REUSED ikut batal, padahal itu justru
 *       harus tersimpan. Jadi: selesaikan transaksi dulu, baru lempar error
 *       setelah di luar transaksi.
 */
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

/**
 * LOGOUT: cabut SATU refresh token (milik perangkat ini saja).
 *
 * - Hanya token itu yang dicabut, bukan seluruh family. Jadi logout di HP tidak
 *   memutus sesi di laptop.
 * - Idempoten: dipanggil dua kali, atau dengan token yang tidak ada, tidak
 *   menimbulkan error. (`isNull(revokedAt)` = hanya yang belum dicabut yang
 *   diubah; kalau tidak ada yang cocok, tidak terjadi apa-apa.)
 *
 * Catatan: access token yang sudah terbit tetap berlaku sampai habis (maksimal
 * 15 menit), karena JWT tidak disimpan di server. Itu harga yang dibayar untuk
 * sistem tanpa-status dan dapat diterima di proyek ini.
 */
/** Idempoten: token tidak ditemukan atau sudah dicabut tidak dianggap error. Hanya token ini yang dicabut. */
export async function revokeRefreshToken(rawToken: string): Promise<void> {
  await db
    .update(refreshTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(refreshTokens.tokenHash, sha256Hex(rawToken)), isNull(refreshTokens.revokedAt)));
}
