/**
 * Preload test (dipanggil lewat bunfig.toml SEBELUM file test mana pun).
 *
 * Tujuannya satu: test TIDAK PERNAH menyentuh database development.
 *   1. Menentukan database test (TEST_DATABASE_URL, atau `<nama database dev>_test` kalau tidak diisi).
 *   2. Menimpa DATABASE_URL SEBELUM `src/config/env.ts` dibaca, jadi seluruh aplikasi memakai database test.
 *   3. Membuat database test kalau belum ada, lalu menjalankan migrasi.
 * Pengosongan data per file dilakukan oleh `useCleanDatabase()` (tests/db-reset.ts), dipanggil di setiap file test.
 *
 * Pengaman: nama database test WAJIB berakhiran `_test`, dan tidak boleh sama dengan database development.
 * Tanpa itu, TRUNCATE bisa menghapus data sungguhan.
 */
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";

const devUrl = process.env.DATABASE_URL ?? "";
const TEST_DB_SUFFIX = "_test";

function withDatabase(url: string, name: string): string {
  const u = new URL(url);
  u.pathname = `/${name}`;
  return u.toString();
}

function databaseName(url: string): string {
  return decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
}

function resolveTestUrl(): string {
  const explicit = process.env.TEST_DATABASE_URL;
  if (explicit) return explicit;
  if (!devUrl) {
    throw new Error("Isi TEST_DATABASE_URL (atau DATABASE_URL) di backend/.env supaya test punya database sendiri.");
  }
  return withDatabase(devUrl, `${databaseName(devUrl)}${TEST_DB_SUFFIX}`);
}

const testUrl = resolveTestUrl();
const testDb = databaseName(testUrl);

if (!testDb.endsWith(TEST_DB_SUFFIX)) {
  throw new Error(`Database test harus berakhiran "${TEST_DB_SUFFIX}" (dapat: "${testDb}"). Test menghapus semua data di dalamnya.`);
}
if (devUrl && databaseName(devUrl) === testDb) {
  throw new Error(`TEST_DATABASE_URL menunjuk database yang sama dengan DATABASE_URL ("${testDb}").`);
}

// Harus sebelum aplikasi mana pun diimpor: src/config/env.ts membaca process.env saat dimuat.
process.env.DATABASE_URL = testUrl;
// Seed menolak berjalan di production; test selalu berjalan sebagai "test".
process.env.NODE_ENV = "test";

async function ensureDatabaseExists() {
  const admin = postgres(withDatabase(testUrl, "postgres"), { max: 1, onnotice: () => {} });
  try {
    const found = await admin`select 1 from pg_database where datname = ${testDb}`;
    if (found.length === 0) {
      // Nama sudah diperiksa berakhiran _test, jadi aman disisipkan sebagai identifier.
      await admin.unsafe(`create database "${testDb}"`);
    }
  } catch (e) {
    throw new Error(
      `Tidak bisa menyiapkan database test "${testDb}": ${(e as Error).message}\n` +
        `Buat manual: CREATE DATABASE ${testDb};  (atau isi TEST_DATABASE_URL ke database test yang sudah ada)`,
    );
  } finally {
    await admin.end();
  }
}

async function migrateTestDatabase() {
  const client = postgres(testUrl, { max: 1, onnotice: () => {} });
  try {
    await migrate(drizzle(client), { migrationsFolder: resolve(import.meta.dir, "../src/db/migrations") });
  } finally {
    await client.end();
  }
}

await ensureDatabaseExists();
await migrateTestDatabase();
