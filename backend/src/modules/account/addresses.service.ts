import { and, asc, count, desc, eq } from "drizzle-orm";
import { db, type Transaction } from "../../db/client";
import { userAddresses, users } from "../../db/schema";
import { AppError } from "../../lib/errors";
import { type AddressFields, assertCoordinatesPaired } from "./addresses.validation";

export const MAX_ADDRESSES = 10;

type AddressRow = typeof userAddresses.$inferSelect;

/** Bentuk respons. Kolom numeric dikembalikan Drizzle sebagai teks, jadi latitude/longitude diubah ke number. */
export function toAddress(row: AddressRow) {
  return {
    id: row.id,
    label: row.label,
    recipient_name: row.recipientName,
    phone: row.phone,
    full_address: row.fullAddress,
    kelurahan: row.kelurahan,
    kecamatan: row.kecamatan,
    city: row.city,
    province: row.province,
    postal_code: row.postalCode,
    latitude: row.latitude === null ? null : Number(row.latitude),
    longitude: row.longitude === null ? null : Number(row.longitude),
    is_default: row.isDefault,
  };
}

const notFound = () => new AppError(404, "ADDRESS_NOT_FOUND", "Alamat tidak ditemukan.");

/**
 * Semua operasi TULIS memulai dengan mengunci baris user (SELECT ... FOR UPDATE), sehingga penulisan buku alamat
 * satu user diserialkan. Tanpa kunci:
 *   - dua POST bersamaan saat ada 9 alamat sama-sama lolos jadi 11,
 *   - dua alamat pertama yang dibuat bersamaan sama-sama jadi utama, lalu indeks unik parsial menolak salah satunya (500),
 *   - dua permintaan "jadikan utama" bersamaan bisa menyisakan nol atau dua alamat utama.
 */
async function lockUser(tx: Transaction, userId: string) {
  await tx.select({ id: users.id }).from(users).where(eq(users.id, userId)).for("update");
}

/** Melepas status utama alamat lain. Harus dijalankan SEBELUM menetapkan yang baru: indeks unik diperiksa per pernyataan. */
async function clearDefault(tx: Transaction, userId: string) {
  await tx
    .update(userAddresses)
    .set({ isDefault: false })
    .where(and(eq(userAddresses.userId, userId), eq(userAddresses.isDefault, true)));
}

const coordinate = (value: number | null) => (value === null ? null : value.toFixed(7));

/** Alamat milik user: yang utama paling atas, sisanya terbaru dulu (id sebagai pemutus seri agar urutan stabil). */
export async function listAddresses(userId: string) {
  const rows = await db
    .select()
    .from(userAddresses)
    .where(eq(userAddresses.userId, userId))
    .orderBy(desc(userAddresses.isDefault), desc(userAddresses.createdAt), asc(userAddresses.id));
  return rows.map(toAddress);
}

/**
 * Membuat alamat. Bisa dipakai ulang oleh checkout (`save_address`, issue 14): kirim `tx` agar ikut transaksi checkout.
 * Melempar `ADDRESS_LIMIT_REACHED` yang bisa ditangkap pemanggil (checkout tetap lanjut kalau buku alamat penuh).
 *
 * Alamat pertama otomatis utama. `is_default: true` melepas status utama alamat lain lebih dulu.
 */
export async function createUserAddress(
  userId: string,
  input: AddressFields & { is_default?: boolean },
  tx?: Transaction,
) {
  const run = async (conn: Transaction) => {
    await lockUser(conn, userId);

    const [{ total }] = (await conn
      .select({ total: count() })
      .from(userAddresses)
      .where(eq(userAddresses.userId, userId))) as [{ total: number }];
    if (total >= MAX_ADDRESSES) {
      throw new AppError(422, "ADDRESS_LIMIT_REACHED", `Buku alamat maksimal ${MAX_ADDRESSES} alamat.`);
    }

    const makeDefault = input.is_default === true || total === 0;
    if (makeDefault) await clearDefault(conn, userId);

    const [row] = await conn
      .insert(userAddresses)
      .values({
        userId,
        label: input.label,
        recipientName: input.recipient_name,
        phone: input.phone,
        fullAddress: input.full_address,
        kelurahan: input.kelurahan,
        kecamatan: input.kecamatan,
        city: input.city,
        province: input.province,
        postalCode: input.postal_code,
        latitude: coordinate(input.latitude),
        longitude: coordinate(input.longitude),
        isDefault: makeDefault,
      })
      .returning();
    return toAddress(row!);
  };

  return tx ? run(tx) : db.transaction(run);
}

/**
 * Mengubah sebagian field. Hanya field di `patch` yang ditulis (daftar eksplisit, bukan menyebar body), jadi `id`,
 * `user_id`, dan `created_at` tidak mungkin ikut berubah.
 */
export async function updateUserAddress(
  userId: string,
  id: string,
  patch: Partial<AddressFields>,
  isDefault?: boolean,
) {
  return db.transaction(async (tx) => {
    await lockUser(tx, userId);

    // bukan milik user dan tidak ada sama-sama 404 (aturan umum #6: keberadaan data tidak boleh bocor)
    const [row] = await tx
      .select()
      .from(userAddresses)
      .where(and(eq(userAddresses.id, id), eq(userAddresses.userId, userId)))
      .limit(1);
    if (!row) throw notFound();

    // user yang punya alamat harus punya satu alamat utama: pindahkan dengan menjadikan alamat LAIN utama
    if (isDefault === false && row.isDefault) {
      throw new AppError(
        422,
        "DEFAULT_ADDRESS_REQUIRED",
        "Harus ada satu alamat utama. Jadikan alamat lain sebagai utama untuk memindahkannya.",
      );
    }

    // pasangan lintang/bujur dinilai dari keadaan AKHIR (gabungan isi lama dan perubahan)
    const finalLat = "latitude" in patch ? patch.latitude ?? null : row.latitude === null ? null : Number(row.latitude);
    const finalLon = "longitude" in patch ? patch.longitude ?? null : row.longitude === null ? null : Number(row.longitude);
    assertCoordinatesPaired(finalLat, finalLon);

    const changes: Partial<typeof userAddresses.$inferInsert> = {};
    if ("label" in patch) changes.label = patch.label!;
    if ("recipient_name" in patch) changes.recipientName = patch.recipient_name!;
    if ("phone" in patch) changes.phone = patch.phone!;
    if ("full_address" in patch) changes.fullAddress = patch.full_address!;
    if ("province" in patch) changes.province = patch.province!;
    if ("city" in patch) changes.city = patch.city!;
    if ("kecamatan" in patch) changes.kecamatan = patch.kecamatan ?? null;
    if ("kelurahan" in patch) changes.kelurahan = patch.kelurahan ?? null;
    if ("postal_code" in patch) changes.postalCode = patch.postal_code ?? null;
    if ("latitude" in patch) changes.latitude = coordinate(patch.latitude ?? null);
    if ("longitude" in patch) changes.longitude = coordinate(patch.longitude ?? null);

    const becomesDefault = isDefault === true && !row.isDefault;
    if (!becomesDefault && Object.keys(changes).length === 0) return toAddress(row); // tidak ada yang berubah

    if (becomesDefault) {
      await clearDefault(tx, userId);
      changes.isDefault = true;
    }

    const [updated] = await tx
      .update(userAddresses)
      .set({ ...changes, updatedAt: new Date() }) // created_at tidak disentuh
      .where(and(eq(userAddresses.id, id), eq(userAddresses.userId, userId)))
      .returning();
    return toAddress(updated!);
  });
}

/**
 * Menghapus alamat. Kalau yang dihapus alamat utama dan masih ada alamat lain, alamat TERBARU menjadi utama
 * (dalam transaksi yang sama). Pesanan lama tidak terpengaruh: checkout memakai SALINAN di tabel `addresses`.
 */
export async function deleteUserAddress(userId: string, id: string): Promise<void> {
  await db.transaction(async (tx) => {
    await lockUser(tx, userId);

    const [row] = await tx
      .select()
      .from(userAddresses)
      .where(and(eq(userAddresses.id, id), eq(userAddresses.userId, userId)))
      .limit(1);
    if (!row) throw notFound();

    await tx.delete(userAddresses).where(eq(userAddresses.id, id));

    if (row.isDefault) {
      const [newest] = await tx
        .select({ id: userAddresses.id })
        .from(userAddresses)
        .where(eq(userAddresses.userId, userId))
        .orderBy(desc(userAddresses.createdAt), asc(userAddresses.id))
        .limit(1);
      if (newest) await tx.update(userAddresses).set({ isDefault: true }).where(eq(userAddresses.id, newest.id));
    }
  });
}
