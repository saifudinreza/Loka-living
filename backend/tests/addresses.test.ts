import { afterAll, describe, expect, spyOn, test } from "bun:test";
import { asc, count, eq, like } from "drizzle-orm";
import { Elysia } from "elysia";
import { createApp } from "../src/app";
import { db } from "../src/db/client";
import { userAddresses, users } from "../src/db/schema";
import { createUserAddress } from "../src/modules/account/addresses.service";
import { parseCreate } from "../src/modules/account/addresses.validation";
import { jwtPlugin, signAccessToken } from "../src/modules/auth/tokens";

const app = createApp({ enableJobs: false });
const EMAIL_PREFIX = "addrtest-";

type Json = Record<string, any>;
type TestUser = { id: string; token: string };

const base = {
  label: "Rumah",
  recipient_name: "Budi Santoso",
  phone: "+62 812 3456 7890",
  full_address: "Jl. Kaliurang KM 5 No. 12",
  province: "DI Yogyakarta",
  city: "Sleman",
};

async function api(method: string, path: string, token?: string, body?: unknown) {
  const res = await app.handle(
    new Request(`http://localhost/api${path}`, {
      method,
      headers: {
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    }),
  );
  return { res, body: (await res.json().catch(() => null)) as Json | null };
}

// User dibuat langsung di database (tanpa /register yang dibatasi 10 permintaan/menit dan lambat karena argon2),
// lalu token access ditandatangani dengan plugin JWT yang sama dengan aplikasi.
const signer = new Elysia().use(jwtPlugin).get("/sign/:id", ({ jwt, params }) => signAccessToken(jwt, { id: params.id }));

async function makeUser(label: string): Promise<TestUser> {
  const [user] = await db
    .insert(users)
    .values({ email: `${EMAIL_PREFIX}${label}-${crypto.randomUUID().slice(0, 8)}@contoh.com`, name: label })
    .returning();
  const token = await (await signer.handle(new Request(`http://localhost/sign/${user!.id}`))).text();
  return { id: user!.id, token };
}

const create = (user: TestUser, over: Json = {}) => api("POST", "/addresses", user.token, { ...base, ...over });
const list = async (user: TestUser) => (await api("GET", "/addresses", user.token)).body!.data as Json[];
const dbRows = (userId: string) =>
  db.select().from(userAddresses).where(eq(userAddresses.userId, userId)).orderBy(asc(userAddresses.createdAt), asc(userAddresses.id));
const defaultsOf = async (userId: string) => (await dbRows(userId)).filter((r) => r.isDefault);

/** Mengisi buku alamat langsung lewat database (jauh lebih cepat daripada n kali POST). */
async function seedAddresses(user: TestUser, n: number) {
  const values = Array.from({ length: n }, (_, i) => ({
    userId: user.id,
    label: `Alamat ${i + 1}`,
    recipientName: "Budi",
    phone: "081234567890",
    fullAddress: `Jl. Contoh No. ${i + 1}`,
    city: "Sleman",
    province: "DI Yogyakarta",
    isDefault: i === 0,
    createdAt: new Date(Date.UTC(2026, 0, 1, 0, 0, i)),
  }));
  return db.insert(userAddresses).values(values).returning();
}

afterAll(async () => {
  // alamat ikut terhapus (ON DELETE CASCADE)
  await db.delete(users).where(like(users.email, `${EMAIL_PREFIX}%`));
});

describe("autentikasi", () => {
  test("semua endpoint alamat tanpa token → 401", async () => {
    const id = crypto.randomUUID();
    for (const [method, path, body] of [
      ["GET", "/addresses", undefined],
      ["POST", "/addresses", base],
      ["PATCH", `/addresses/${id}`, { city: "Bantul" }],
      ["DELETE", `/addresses/${id}`, undefined],
    ] as const) {
      const { res, body: json } = await api(method, path, undefined, body);
      expect(res.status, `${method} ${path}`).toBe(401);
      expect(json!.code).toBe("UNAUTHORIZED");
    }
  });

  test("token sampah → 401", async () => {
    expect((await api("GET", "/addresses", "bukan.jwt.valid")).res.status).toBe(401);
  });
});

describe("GET dan POST", () => {
  test("buku alamat kosong; respons data pribadi tidak boleh di-cache bersama", async () => {
    const user = await makeUser("kosong");
    const { res, body } = await api("GET", "/addresses", user.token);
    expect(res.status).toBe(200);
    expect(body).toEqual({ data: [] });
    expect(res.headers.get("cache-control")).toBe("private, no-store");
  });

  test("alamat pertama otomatis utama; bentuk respons lengkap dan tanpa user_id", async () => {
    const user = await makeUser("pertama");
    const { res, body } = await create(user, { kelurahan: "Caturtunggal", kecamatan: "Depok", postal_code: "55281", latitude: -7.7661, longitude: 110.3772 });

    expect(res.status).toBe(201);
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(body!.data).toEqual({
      id: expect.any(String),
      label: "Rumah",
      recipient_name: "Budi Santoso",
      phone: "+62 812 3456 7890",
      full_address: "Jl. Kaliurang KM 5 No. 12",
      kelurahan: "Caturtunggal",
      kecamatan: "Depok",
      city: "Sleman",
      province: "DI Yogyakarta",
      postal_code: "55281",
      latitude: -7.7661, // number, bukan teks
      longitude: 110.3772,
      is_default: true,
    });
    expect(JSON.stringify(body)).not.toContain("user_id");
  });

  test("label boleh dikosongkan (default 'Alamat'); field opsional yang kosong menjadi null", async () => {
    const user = await makeUser("label");
    const { label: _omit, ...withoutLabel } = base;
    const { body } = await api("POST", "/addresses", user.token, withoutLabel);
    expect(body!.data).toMatchObject({ label: "Alamat", kelurahan: null, kecamatan: null, postal_code: null, latitude: null, longitude: null });
  });

  test("alamat kedua tanpa is_default → tetap bukan utama; pertama tetap utama", async () => {
    const user = await makeUser("kedua");
    await create(user, { label: "Pertama" });
    const second = await create(user, { label: "Kedua" });
    expect(second.res.status).toBe(201);
    expect(second.body!.data.is_default).toBe(false);
    expect((await defaultsOf(user.id)).map((r) => r.label)).toEqual(["Pertama"]);
  });

  test("alamat kedua dengan is_default: true → yang pertama jadi bukan utama, tetap hanya satu utama", async () => {
    const user = await makeUser("ganti");
    await create(user, { label: "Pertama" });
    const second = await create(user, { label: "Kedua", is_default: true });
    expect(second.body!.data.is_default).toBe(true);

    const rows = await dbRows(user.id);
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.isDefault).map((r) => r.label)).toEqual(["Kedua"]);
  });

  test("urutan GET: utama paling atas, sisanya terbaru dulu", async () => {
    const user = await makeUser("urutan");
    await create(user, { label: "A" }); // utama (pertama)
    await create(user, { label: "B" });
    await create(user, { label: "C" });
    expect((await list(user)).map((a) => a.label)).toEqual(["A", "C", "B"]);

    await create(user, { label: "D", is_default: true });
    expect((await list(user)).map((a) => a.label)).toEqual(["D", "C", "B", "A"]);
  });
});

describe("validasi", () => {
  test("isi tidak valid → 422 VALIDATION_FAILED dan tidak ada alamat yang tersimpan", async () => {
    const user = await makeUser("validasi");
    const cases: [string, Json][] = [
      ["province 'Jakarta' tidak ada di daftar", { province: "Jakarta" }],
      ["city kosong", { city: "" }],
      ["city hanya spasi", { city: "   " }],
      ["telepon berisi huruf", { phone: "0812abc7890" }],
      ["telepon kurang dari 8 digit", { phone: "+62 81 23" }],
      ["telepon hanya simbol", { phone: "--- +++ ---" }],
      ["kode pos 4 digit", { postal_code: "5528" }],
      ["latitude 91", { latitude: 91, longitude: 0 }],
      ["longitude tanpa latitude", { longitude: 110 }],
      ["nama hanya spasi", { recipient_name: "   " }],
      ["alamat terlalu pendek", { full_address: "abcd" }],
      ["label 41 karakter", { label: "x".repeat(41) }],
      ["is_default bukan boolean", { is_default: "ya" }],
      ["latitude bukan angka", { latitude: "-7.7", longitude: 110 }],
    ];
    for (const [name, over] of cases) {
      const { res, body } = await create(user, over);
      expect(res.status, name).toBe(422);
      expect(body!.code, name).toBe("VALIDATION_FAILED");
    }
    expect(await list(user)).toEqual([]);
  });

  test("field wajib hilang → 422", async () => {
    const user = await makeUser("hilang");
    for (const field of ["recipient_name", "phone", "full_address", "province", "city"]) {
      const { [field]: _omit, ...rest } = base as Json;
      const { res } = await api("POST", "/addresses", user.token, rest);
      expect(res.status, field).toBe(422);
    }
  });

  test("pesan error tidak mengulang isi input (data pribadi)", async () => {
    const user = await makeUser("privasi");
    const { body } = await create(user, { phone: "0812-RAHASIA-xyz" });
    expect(JSON.stringify(body)).not.toContain("RAHASIA");
  });

  test("teks di-trim saat disimpan", async () => {
    const user = await makeUser("trim");
    const { body } = await create(user, { recipient_name: "  Budi  ", city: " Sleman ", kecamatan: "   " });
    expect(body!.data).toMatchObject({ recipient_name: "Budi", city: "Sleman", kecamatan: null });
  });
});

describe("PATCH", () => {
  test("is_default: true pada alamat lain → hanya satu utama", async () => {
    const user = await makeUser("pindah");
    await create(user, { label: "A" });
    const b = await create(user, { label: "B" });

    const { res, body } = await api("PATCH", `/addresses/${b.body!.data.id}`, user.token, { is_default: true });
    expect(res.status).toBe(200);
    expect(body!.data.is_default).toBe(true);
    expect((await defaultsOf(user.id)).map((r) => r.label)).toEqual(["B"]);
  });

  test("is_default: false pada alamat utama → 422 DEFAULT_ADDRESS_REQUIRED, data tidak berubah", async () => {
    const user = await makeUser("wajibutama");
    const a = await create(user, { label: "A" });
    await create(user, { label: "B" });

    const { res, body } = await api("PATCH", `/addresses/${a.body!.data.id}`, user.token, { is_default: false, city: "Bantul" });
    expect(res.status).toBe(422);
    expect(body!.code).toBe("DEFAULT_ADDRESS_REQUIRED");
    const [row] = (await dbRows(user.id)).filter((r) => r.label === "A");
    expect(row!.isDefault).toBe(true);
    expect(row!.city).toBe("Sleman"); // perubahan lain ikut dibatalkan
  });

  test("is_default: false pada alamat yang memang bukan utama → 200 tanpa perubahan (updated_at tidak berubah)", async () => {
    const user = await makeUser("noop");
    await create(user, { label: "A" });
    const b = await create(user, { label: "B" });
    const before = (await dbRows(user.id)).find((r) => r.id === b.body!.data.id)!;

    const { res } = await api("PATCH", `/addresses/${b.body!.data.id}`, user.token, { is_default: false });
    expect(res.status).toBe(200);
    const after = (await dbRows(user.id)).find((r) => r.id === b.body!.data.id)!;
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    expect(after.isDefault).toBe(false);
  });

  test("mengubah field lain tidak mengubah status utama dan created_at, tapi memperbarui updated_at", async () => {
    const user = await makeUser("ubah");
    const a = await create(user, { label: "A" });
    const before = (await dbRows(user.id))[0]!;
    await Bun.sleep(15);

    const { res, body } = await api("PATCH", `/addresses/${a.body!.data.id}`, user.token, { city: "Bantul", label: "Rumah Baru" });
    expect(res.status).toBe(200);
    expect(body!.data).toMatchObject({ city: "Bantul", label: "Rumah Baru", is_default: true });

    const after = (await dbRows(user.id))[0]!;
    expect(after.isDefault).toBe(true);
    expect(after.createdAt.getTime()).toBe(before.createdAt.getTime());
    expect(after.updatedAt.getTime()).toBeGreaterThan(before.updatedAt.getTime());
  });

  test("body kosong → 422; hanya field tak dikenal juga → 422", async () => {
    const user = await makeUser("kosongpatch");
    const a = await create(user);
    for (const body of [{}, { foo: "bar" }]) {
      const { res, body: json } = await api("PATCH", `/addresses/${a.body!.data.id}`, user.token, body);
      expect(res.status, JSON.stringify(body)).toBe(422);
      expect(json!.code).toBe("VALIDATION_FAILED");
    }
  });

  test("null mengosongkan field opsional; null pada field wajib → 422", async () => {
    const user = await makeUser("nullpatch");
    const a = await create(user, { kecamatan: "Depok", postal_code: "55281" });
    const id = a.body!.data.id;

    const cleared = await api("PATCH", `/addresses/${id}`, user.token, { kecamatan: null, postal_code: null });
    expect(cleared.res.status).toBe(200);
    expect(cleared.body!.data).toMatchObject({ kecamatan: null, postal_code: null });

    for (const field of ["city", "province", "recipient_name", "phone", "full_address"]) {
      const { res } = await api("PATCH", `/addresses/${id}`, user.token, { [field]: null });
      expect(res.status, field).toBe(422);
    }
  });

  test("province divalidasi ulang saat diubah", async () => {
    const user = await makeUser("provpatch");
    const a = await create(user);
    expect((await api("PATCH", `/addresses/${a.body!.data.id}`, user.token, { province: "Jakarta" })).res.status).toBe(422);
    const ok = await api("PATCH", `/addresses/${a.body!.data.id}`, user.token, { province: "DKI Jakarta", city: "Jakarta Selatan" });
    expect(ok.res.status).toBe(200);
    expect(ok.body!.data).toMatchObject({ province: "DKI Jakarta", city: "Jakarta Selatan" });
  });

  test("id, user_id, dan created_at di body diabaikan (tidak ada mass assignment)", async () => {
    const owner = await makeUser("pemilik");
    const other = await makeUser("lain");
    const a = await create(owner);
    const before = (await dbRows(owner.id))[0]!;

    const { res } = await api("PATCH", `/addresses/${a.body!.data.id}`, owner.token, {
      city: "Bantul",
      id: crypto.randomUUID(),
      user_id: other.id,
      created_at: "2000-01-01T00:00:00Z",
    });
    expect(res.status).toBe(200);

    const rows = await dbRows(owner.id);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(before.id);
    expect(rows[0]!.userId).toBe(owner.id);
    expect(rows[0]!.createdAt.getTime()).toBe(before.createdAt.getTime());
    expect(await dbRows(other.id)).toEqual([]);
  });

  test("lintang/bujur dinilai dari keadaan akhir: salah satu saja → 422; keduanya, atau mengosongkan keduanya → 200", async () => {
    const user = await makeUser("koordinat");
    const a = await create(user);
    const id = a.body!.data.id;

    expect((await api("PATCH", `/addresses/${id}`, user.token, { latitude: -7.7 })).res.status).toBe(422); // belum ada bujur
    const both = await api("PATCH", `/addresses/${id}`, user.token, { latitude: -7.7, longitude: 110.3 });
    expect(both.res.status).toBe(200);
    expect(both.body!.data).toMatchObject({ latitude: -7.7, longitude: 110.3 });

    expect((await api("PATCH", `/addresses/${id}`, user.token, { latitude: null })).res.status).toBe(422); // bujur masih ada
    const cleared = await api("PATCH", `/addresses/${id}`, user.token, { latitude: null, longitude: null });
    expect(cleared.res.status).toBe(200);
    expect(cleared.body!.data).toMatchObject({ latitude: null, longitude: null });
  });
});

describe("DELETE", () => {
  test("menghapus alamat utama → alamat terbaru yang tersisa menjadi utama", async () => {
    const user = await makeUser("hapusutama");
    const a = await create(user, { label: "A" }); // utama
    await create(user, { label: "B" });
    await create(user, { label: "C" }); // terbaru

    const { res, body } = await api("DELETE", `/addresses/${a.body!.data.id}`, user.token);
    expect(res.status).toBe(204);
    expect(body).toBeNull();
    expect(res.headers.get("cache-control")).toBe("private, no-store");

    expect((await defaultsOf(user.id)).map((r) => r.label)).toEqual(["C"]);
    expect((await list(user)).map((x) => x.label)).toEqual(["C", "B"]);
  });

  test("menghapus alamat bukan utama tidak mengubah alamat utama", async () => {
    const user = await makeUser("hapusbiasa");
    await create(user, { label: "A" });
    const b = await create(user, { label: "B" });
    expect((await api("DELETE", `/addresses/${b.body!.data.id}`, user.token)).res.status).toBe(204);
    expect((await defaultsOf(user.id)).map((r) => r.label)).toEqual(["A"]);
  });

  test("menghapus alamat terakhir berhasil; daftar kosong, lalu alamat berikutnya menjadi utama lagi", async () => {
    const user = await makeUser("terakhir");
    const a = await create(user);
    expect((await api("DELETE", `/addresses/${a.body!.data.id}`, user.token)).res.status).toBe(204);
    expect(await list(user)).toEqual([]);
    expect((await create(user)).body!.data.is_default).toBe(true);
  });

  test("alamat yang tidak ada → 404 ADDRESS_NOT_FOUND (bukan 204 idempoten); dua kali hapus → kedua 404", async () => {
    const user = await makeUser("hapusdua");
    const a = await create(user);
    await api("DELETE", `/addresses/${a.body!.data.id}`, user.token);
    const again = await api("DELETE", `/addresses/${a.body!.data.id}`, user.token);
    expect(again.res.status).toBe(404);
    expect(again.body!.code).toBe("ADDRESS_NOT_FOUND");
    expect((await api("DELETE", `/addresses/${crypto.randomUUID()}`, user.token)).res.status).toBe(404);
  });
});

describe("isolasi antar user", () => {
  test("user B tidak melihat, mengubah, atau menghapus alamat user A (404), dan data A tidak berubah", async () => {
    const a = await makeUser("pemilik");
    const b = await makeUser("penyusup");
    const created = await create(a, { label: "Rumah A" });
    const id = created.body!.data.id;
    const before = await dbRows(a.id);

    expect(await list(b)).toEqual([]);

    const patch = await api("PATCH", `/addresses/${id}`, b.token, { city: "Diretas", is_default: true });
    expect(patch.res.status).toBe(404);
    expect(patch.body!.code).toBe("ADDRESS_NOT_FOUND");

    const del = await api("DELETE", `/addresses/${id}`, b.token);
    expect(del.res.status).toBe(404);

    expect(await dbRows(a.id)).toEqual(before);
    expect((await list(a)).map((x) => x.label)).toEqual(["Rumah A"]);
  });

  test("alamat user A tidak ikut memengaruhi batas dan status utama user B", async () => {
    const a = await makeUser("a-banyak");
    const b = await makeUser("b-sedikit");
    await seedAddresses(a, 10);
    const { res, body } = await create(b);
    expect(res.status).toBe(201);
    expect(body!.data.is_default).toBe(true);
  });
});

describe("batas 10 alamat", () => {
  test("alamat ke-10 berhasil, ke-11 → 422 ADDRESS_LIMIT_REACHED; mengubah alamat lama tetap boleh; hapus satu lalu tambah boleh", async () => {
    const user = await makeUser("batas");
    const seeded = await seedAddresses(user, 9);

    const tenth = await create(user, { label: "Ke-10" });
    expect(tenth.res.status).toBe(201);

    const eleventh = await create(user, { label: "Ke-11" });
    expect(eleventh.res.status).toBe(422);
    expect(eleventh.body!.code).toBe("ADDRESS_LIMIT_REACHED");
    expect(await dbRows(user.id)).toHaveLength(10);

    expect((await api("PATCH", `/addresses/${seeded[1]!.id}`, user.token, { city: "Bantul" })).res.status).toBe(200);

    await api("DELETE", `/addresses/${tenth.body!.data.id}`, user.token);
    expect((await create(user, { label: "Pengganti" })).res.status).toBe(201);
  });

  test("POST paralel saat tersisa 5 slot → tepat 5 yang berhasil (kunci per user)", async () => {
    const user = await makeUser("paralel");
    await seedAddresses(user, 5);

    // 15 permintaan serentak (jumlah besar agar balapan benar-benar terpicu bila kuncinya tidak ada)
    const results = await Promise.all(Array.from({ length: 15 }, (_, i) => create(user, { label: `P${i}` })));
    expect(results.filter((r) => r.res.status === 201)).toHaveLength(5);
    expect(results.filter((r) => r.res.status === 422 && r.body!.code === "ADDRESS_LIMIT_REACHED")).toHaveLength(10);
    expect(await dbRows(user.id)).toHaveLength(10);
  });
});

describe("batas 10 alamat: balapan di tingkat service", () => {
  // Lewat HTTP, permintaan tiba berselang beberapa milidetik sehingga sebagian besar selesai sebelum yang lain menghitung:
  // balapan tidak selalu terpicu. Di sini semua transaksi dimulai bersamaan, jadi tanpa kunci batas PASTI terlewati.
  test("20 pembuatan serentak saat tersisa 3 slot → tepat 3 berhasil, sisanya ADDRESS_LIMIT_REACHED", async () => {
    const user = await makeUser("service-paralel");
    await seedAddresses(user, 7);
    const input = { ...parseCreate(base), is_default: false };

    const results = await Promise.allSettled(Array.from({ length: 20 }, () => createUserAddress(user.id, input)));
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r): r is PromiseRejectedResult => r.status === "rejected");

    expect(fulfilled).toHaveLength(3);
    expect(rejected).toHaveLength(17);
    for (const r of rejected) expect(r.reason).toMatchObject({ status: 422, code: "ADDRESS_LIMIT_REACHED" });
    expect(await dbRows(user.id)).toHaveLength(10);
  });
});

describe("tepat satu alamat utama (balapan)", () => {
  test("banyak alamat pertama dibuat bersamaan → semuanya berhasil, tepat satu utama, tanpa error 500", async () => {
    const user = await makeUser("balapan-pertama");
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => create(user, { label: `X${i}` })));
    expect(results.map((r) => r.res.status)).toEqual(Array(8).fill(201));
    expect(await dbRows(user.id)).toHaveLength(8);
    expect(await defaultsOf(user.id)).toHaveLength(1);
  });

  test("beberapa alamat dibuat bersamaan dengan is_default: true → tepat satu utama", async () => {
    const user = await makeUser("balapan-utama");
    await create(user, { label: "Awal" });
    const results = await Promise.all(Array.from({ length: 5 }, (_, i) => create(user, { label: `D${i}`, is_default: true })));
    expect(results.every((r) => r.res.status === 201)).toBe(true);
    expect(await defaultsOf(user.id)).toHaveLength(1);
  });

  test("dua PATCH 'jadikan utama' bersamaan pada alamat berbeda → tepat satu utama", async () => {
    const user = await makeUser("balapan-patch");
    const rows = await seedAddresses(user, 4);
    const results = await Promise.all([
      api("PATCH", `/addresses/${rows[1]!.id}`, user.token, { is_default: true }),
      api("PATCH", `/addresses/${rows[2]!.id}`, user.token, { is_default: true }),
      api("PATCH", `/addresses/${rows[3]!.id}`, user.token, { is_default: true }),
    ]);
    expect(results.every((r) => r.res.status === 200)).toBe(true);
    expect(await defaultsOf(user.id)).toHaveLength(1);
  });

  test("hapus alamat utama bersamaan dengan membuat alamat → tetap tepat satu utama", async () => {
    const user = await makeUser("balapan-hapus");
    const rows = await seedAddresses(user, 3);
    await Promise.all([
      api("DELETE", `/addresses/${rows[0]!.id}`, user.token),
      create(user, { label: "Baru" }),
      api("DELETE", `/addresses/${rows[1]!.id}`, user.token),
    ]);
    const remaining = await dbRows(user.id);
    expect(remaining.length).toBeGreaterThan(0);
    expect(remaining.filter((r) => r.isDefault)).toHaveLength(1);
  });
});

describe("ID di URL", () => {
  test(":id bukan UUID → 422 VALIDATION_FAILED (UUID valid yang tidak ada → 404)", async () => {
    const user = await makeUser("idburuk");
    for (const method of ["PATCH", "DELETE"] as const) {
      const { res, body } = await api(method, "/addresses/bukan-uuid", user.token, method === "PATCH" ? { city: "x" } : undefined);
      expect(res.status, method).toBe(422);
      expect(body!.code).toBe("VALIDATION_FAILED");
    }
    expect((await api("PATCH", `/addresses/${crypto.randomUUID()}`, user.token, { city: "Bantul" })).res.status).toBe(404);
  });
});

describe("dipakai ulang oleh checkout (issue 14)", () => {
  test("createUserAddress ikut transaksi luar: dibatalkan bersama bila transaksi checkout gagal", async () => {
    const user = await makeUser("tx");
    await expect(
      db.transaction(async (tx) => {
        await createUserAddress(user.id, { ...parseCreate(base), is_default: false }, tx);
        expect(await tx.select({ n: count() }).from(userAddresses).where(eq(userAddresses.userId, user.id))).toEqual([{ n: 1 }]);
        throw new Error("checkout gagal");
      }),
    ).rejects.toThrow("checkout gagal");
    expect(await dbRows(user.id)).toEqual([]);
  });

  test("buku alamat penuh → melempar AppError ADDRESS_LIMIT_REACHED yang bisa ditangkap pemanggil", async () => {
    const user = await makeUser("penuh");
    await seedAddresses(user, 10);
    const error = await createUserAddress(user.id, { ...parseCreate(base), is_default: false }).catch((e) => e);
    expect(error).toMatchObject({ status: 422, code: "ADDRESS_LIMIT_REACHED" });
  });
});

describe("efisiensi", () => {
  test("GET /addresses memakai jumlah query tetap, berapa pun isinya", async () => {
    const user = await makeUser("query");
    const spy = spyOn(db.$client, "unsafe");

    await seedAddresses(user, 1);
    spy.mockClear();
    await api("GET", "/addresses", user.token);
    const withOne = spy.mock.calls.length;

    await db.insert(userAddresses).values(
      Array.from({ length: 8 }, (_, i) => ({
        userId: user.id, label: `Tambahan ${i}`, recipientName: "Budi", phone: "081234567890",
        fullAddress: `Jl. Tambahan No. ${i}`, city: "Sleman", province: "DI Yogyakarta",
      })),
    );
    spy.mockClear();
    await api("GET", "/addresses", user.token);
    const withNine = spy.mock.calls.length;
    spy.mockRestore();

    // minimal 1 membuktikan spy benar-benar menangkap query; sama persis = tidak ada N+1
    expect(withOne).toBeGreaterThanOrEqual(1);
    expect(withNine).toBe(withOne);
    expect(withOne).toBeLessThanOrEqual(2); // 1 query alamat + 1 pemuatan user oleh requireAuth
  });
});

describe("dokumentasi Swagger", () => {
  test("keempat endpoint tercantum dengan skema Bearer", async () => {
    const res = await app.handle(new Request("http://localhost/swagger/json"));
    const spec = (await res.json()) as { paths: Json };
    expect(spec.paths["/api/addresses"]?.get?.security).toEqual([{ bearerAuth: [] }]);
    expect(spec.paths["/api/addresses"]?.post).toBeDefined();
    expect(spec.paths["/api/addresses/{id}"]?.patch).toBeDefined();
    expect(spec.paths["/api/addresses/{id}"]?.delete).toBeDefined();
  });
});
