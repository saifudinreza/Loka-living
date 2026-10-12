import { beforeAll } from "bun:test";
import postgres from "postgres";

/**
 * Mengosongkan database test lalu seed ulang. Dipanggil lewat `useCleanDatabase()` di bagian atas setiap file test,
 * supaya setiap file mulai dari keadaan yang sama (8 produk hasil seed, tanpa user/order) dan tidak ada sisa data
 * dari file sebelumnya. (Hook global di preload hanya berjalan sekali per proses, bukan per file.)
 *
 * Tabel dikosongkan SEMUA, jadi pengaman di sini berlapis: DATABASE_URL (sudah ditimpa oleh tests/setup.ts) harus
 * menunjuk database yang namanya berakhiran `_test`.
 */
export async function resetDatabase() {
  const url = process.env.DATABASE_URL ?? "";
  const name = decodeURIComponent(new URL(url).pathname.replace(/^\//, ""));
  if (!name.endsWith("_test")) {
    throw new Error(`Menolak mengosongkan database "${name}": bukan database test (harus berakhiran "_test").`);
  }

  const client = postgres(url, { max: 1, onnotice: () => {} });
  try {
    // Tabel migrasi Drizzle ada di skema `drizzle`, jadi tidak ikut terhapus.
    const tables = await client<{ tablename: string }[]>`select tablename from pg_tables where schemaname = 'public'`;
    if (tables.length > 0) {
      const list = tables.map((t) => `"public"."${t.tablename}"`).join(", ");
      await client.unsafe(`truncate table ${list} restart identity cascade`);
    }
  } finally {
    await client.end();
  }

  // Dimuat di sini supaya env.ts baru dibaca setelah DATABASE_URL ditimpa oleh setup.ts.
  const { runSeed } = await import("../src/db/seed");
  // Seed berisik (ringkasan dan peringatan foto); di test tidak ada gunanya.
  const { log, warn } = console;
  console.log = () => {};
  console.warn = () => {};
  try {
    await runSeed({ NODE_ENV: "test" } as NodeJS.ProcessEnv);
  } finally {
    console.log = log;
    console.warn = warn;
  }
}

/** Panggil sekali di level atas file test, SEBELUM hook `beforeAll` milik file itu sendiri. */
export function useCleanDatabase() {
  beforeAll(resetDatabase);
}
