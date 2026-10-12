import { beforeEach, describe, expect, test } from "bun:test";
import { eq, sql } from "drizzle-orm";
import { createApp } from "../src/app";
import { db } from "../src/db/client";
import { orders, productVariants } from "../src/db/schema";
import { createRateLimiter } from "../src/lib/rate-limit";
import { GUEST_MAX_QTY, GUEST_UNIT_BUDGET } from "../src/modules/checkout/checkout.constants";
import { assertGuestBuyNow } from "../src/modules/checkout/stock-reservation.service";
import { resetDatabase, useCleanDatabase } from "./db-reset";

useCleanDatabase();

// Setiap test menghitung total stok tertahan, jadi mulai dari seed yang segar (bukan sisa test sebelumnya).
beforeEach(resetDatabase);

// Keputusan produk: tamu (tanpa login) hanya boleh "Beli Sekarang" (satu jenis barang, qty terbatas) dan punya jatah unit
// per IP. Checkout beberapa barang (keranjang) dan pembelian lebih banyak wajib login.

type Json = Record<string, any>;

async function http() {
  const app = createApp({ enableJobs: false }); // satu aplikasi = satu set pembatas
  return async (items: unknown, token?: string) => {
    const res = await app.handle(
      new Request("http://localhost/api/checkout/init", {
        method: "POST",
        headers: { "content-type": "application/json", ...(token ? { authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ items }),
      }),
    );
    return { status: res.status, body: (await res.json()) as Json };
  };
}

async function registerToken(app = createApp({ enableJobs: false })) {
  const res = await app.handle(
    new Request("http://localhost/api/auth/register", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: `guest-${crypto.randomUUID().slice(0, 8)}@contoh.com`, password: "password-rahasia", name: "Login" }),
    }),
  );
  return ((await res.json()) as Json).access_token as string;
}

const allVariants = async () => db.select({ id: productVariants.id, available: productVariants.stockAvailable, reserved: productVariants.stockReserved }).from(productVariants);
const reservedTotal = async () => (await allVariants()).reduce((s, v) => s + v.reserved, 0);
const orderCount = async () => (await db.select({ n: sql<number>`count(*)::int` }).from(orders))[0]!.n;
const line = (id: string, qty = 1) => ({ product_variant_id: id, qty });

describe("assertGuestBuyNow (aturan murni)", () => {
  test("satu jenis barang dengan qty sampai batas → lolos dan mengembalikan qty", () => {
    expect(assertGuestBuyNow([line("a", 1)])).toBe(1);
    expect(assertGuestBuyNow([line("a", GUEST_MAX_QTY)])).toBe(GUEST_MAX_QTY);
  });

  test("varian yang sama di beberapa baris digabung dulu", () => {
    expect(assertGuestBuyNow([line("a", 2), line("a", 3)])).toBe(5);
    expect(() => assertGuestBuyNow([line("a", 3), line("a", 3)])).toThrow(expect.objectContaining({ status: 401, code: "LOGIN_REQUIRED" }));
  });

  test("lebih dari satu jenis barang → LOGIN_REQUIRED (itu checkout keranjang)", () => {
    expect(() => assertGuestBuyNow([line("a"), line("b")])).toThrow(expect.objectContaining({ status: 401, code: "LOGIN_REQUIRED" }));
  });

  test("qty di atas batas → LOGIN_REQUIRED, pesan menyebut batasnya", () => {
    expect(() => assertGuestBuyNow([line("a", GUEST_MAX_QTY + 1)])).toThrow(expect.objectContaining({ code: "LOGIN_REQUIRED", message: expect.stringContaining(String(GUEST_MAX_QTY)) }));
  });
});

describe("tamu: hanya Beli Sekarang", () => {
  test("satu barang dengan qty sampai batas → 200, stok ditahan", async () => {
    const init = await http();
    const [v] = await allVariants();
    const { status, body } = await init([line(v!.id, GUEST_MAX_QTY)]);
    expect(status).toBe(200);
    expect(body.items).toHaveLength(1);
    expect((await allVariants()).find((x) => x.id === v!.id)!.reserved).toBe(GUEST_MAX_QTY);
  });

  test("dua jenis barang (checkout keranjang) → 401 LOGIN_REQUIRED, tanpa order dan tanpa stok tertahan", async () => {
    const init = await http();
    const [a, b] = await allVariants();
    const { status, body } = await init([line(a!.id), line(b!.id)]);
    expect(status).toBe(401);
    expect(body.code).toBe("LOGIN_REQUIRED");
    expect(typeof body.error).toBe("string");
    expect(await reservedTotal()).toBe(0);
    expect(await orderCount()).toBe(0);
  });

  test("qty melebihi batas → 401 LOGIN_REQUIRED tanpa efek", async () => {
    const init = await http();
    const [v] = await allVariants();
    const { status, body } = await init([line(v!.id, GUEST_MAX_QTY + 1)]);
    expect(status).toBe(401);
    expect(body.code).toBe("LOGIN_REQUIRED");
    expect(await reservedTotal()).toBe(0);
  });

  test("varian yang sama dua baris yang jumlahnya melebihi batas → 401", async () => {
    const init = await http();
    const [v] = await allVariants();
    expect((await init([line(v!.id, 3), line(v!.id, 3)])).status).toBe(401);
    expect(await reservedTotal()).toBe(0);
  });
});

describe("user login: checkout beberapa barang dan qty lebih besar", () => {
  test("multi barang dan qty di atas batas tamu → 200", async () => {
    const app = createApp({ enableJobs: false });
    const token = await registerToken(app);
    const [a, b] = await allVariants();
    const res = await app.handle(
      new Request("http://localhost/api/checkout/init", {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${token}` },
        body: JSON.stringify({ items: [line(a!.id, GUEST_MAX_QTY + 1), line(b!.id, 2)] }),
      }),
    );
    expect(res.status).toBe(200);
    expect(((await res.json()) as Json).items).toHaveLength(2);
  });

  test("login tidak memakai jatah tamu", async () => {
    const app = createApp({ enableJobs: false });
    const token = await registerToken(app);
    const [v] = await allVariants();
    const init = async (qty: number) =>
      (await app.handle(new Request("http://localhost/api/checkout/init", { method: "POST", headers: { "content-type": "application/json", authorization: `Bearer ${token}` }, body: JSON.stringify({ items: [line(v!.id, 1)] }) }))).status;
    // 5 draft aktif adalah batas user login (bukan jatah tamu); semuanya lolos walau total unit tak jadi soal
    for (let i = 0; i < 4; i++) expect(await init(1)).toBe(200);
  });
});

describe("jatah unit per IP tamu", () => {
  test(`total unit yang ditahan satu IP dibatasi ${GUEST_UNIT_BUDGET}; sesudahnya 429 GUEST_LIMIT_REACHED tanpa efek`, async () => {
    const init = await http();
    const [a, b, c] = await allVariants();
    expect((await init([line(a!.id, 5)])).status).toBe(200);
    expect((await init([line(b!.id, 5)])).status).toBe(200);
    const over = await init([line(c!.id, 1)]);
    expect(over.status).toBe(429);
    expect(over.body.code).toBe("GUEST_LIMIT_REACHED");
    expect(await reservedTotal()).toBe(GUEST_UNIT_BUDGET);
    expect(await orderCount()).toBe(2);
  });

  test("permintaan yang gagal (stok kurang) tidak memakai jatah", async () => {
    const init = await http();
    const [a, b] = await allVariants();
    await db.update(productVariants).set({ stockAvailable: 1 }).where(eq(productVariants.id, a!.id));
    const failed = await init([line(a!.id, 5)]);
    expect(failed.status).toBe(422);
    expect(failed.body.code).toBe("STOCK_INSUFFICIENT");

    // jatah utuh: masih bisa menahan 5 + 5
    expect((await init([line(b!.id, 5)])).status).toBe(200);
    const [, , c] = await allVariants();
    expect((await init([line(c!.id, 5)])).status).toBe(200);
  });

  test("permintaan yang ditolak aturan Beli Sekarang tidak memakai jatah", async () => {
    const init = await http();
    const [a, b] = await allVariants();
    expect((await init([line(a!.id), line(b!.id)])).status).toBe(401);
    expect((await init([line(a!.id, 99)])).status).toBe(401);
    expect((await init([line(a!.id, GUEST_MAX_QTY)])).status).toBe(200);
    expect((await init([line(b!.id, GUEST_MAX_QTY)])).status).toBe(200);
  });

  test("tiap aplikasi (dan tiap IP) punya jatah sendiri", async () => {
    const [a, b] = await allVariants();
    const one = await http();
    const two = await http();
    expect((await one([line(a!.id, 5)])).status).toBe(200);
    expect((await one([line(b!.id, 5)])).status).toBe(200);
    expect((await one([line(a!.id, 1)])).status).toBe(429);
    expect((await two([line(a!.id, 1)])).status).toBe(200);
  });
});

describe("regresi: penimbunan seluruh stok oleh satu klien anonim", () => {
  test("satu klien yang mencoba menahan stok SETIAP varian hanya berhasil menahan sebesar jatahnya", async () => {
    const init = await http();
    const variants = await allVariants();
    const before = variants.reduce((s, v) => s + v.available, 0);

    // sebelum aturan ini: 10 permintaan qty = stok menahan 100% stok semua varian
    for (const v of variants) await init([line(v.id, Math.min(v.available, 99))]);
    for (const v of variants) await init([line(v.id, GUEST_MAX_QTY)]);

    expect(await reservedTotal()).toBeLessThanOrEqual(GUEST_UNIT_BUDGET);
    const after = (await allVariants()).reduce((s, v) => s + v.available, 0);
    expect(after).toBeGreaterThanOrEqual(before - GUEST_UNIT_BUDGET);
  });
});

describe("rate limiter berbobot", () => {
  const hit = (limiter: ReturnType<typeof createRateLimiter>, now: number, weight: number) => {
    try {
      limiter("ip", now, weight);
      return "ok";
    } catch (e) {
      return (e as { code?: string }).code;
    }
  };

  test("bobot dijumlahkan sampai batas; yang melebihi ditolak TANPA memakai jatah", () => {
    const limiter = createRateLimiter(10, 1000);
    expect(hit(limiter, 0, 6)).toBe("ok");
    expect(hit(limiter, 0, 5)).toBe("TOO_MANY_REQUESTS"); // 6 + 5 > 10, ditolak
    expect(hit(limiter, 0, 4)).toBe("ok"); // jatah masih 4 karena yang ditolak tidak dihitung
    expect(hit(limiter, 0, 1)).toBe("TOO_MANY_REQUESTS");
  });

  test("bobot tunggal yang melebihi batas ditolak, juga pada permintaan pertama", () => {
    const limiter = createRateLimiter(10, 1000);
    expect(hit(limiter, 0, 11)).toBe("TOO_MANY_REQUESTS");
    expect(hit(limiter, 0, 10)).toBe("ok");
  });

  test("refund mengembalikan jatah, tidak pernah di bawah nol, dan kunci tak dikenal diabaikan", () => {
    const limiter = createRateLimiter(10, 1000);
    expect(hit(limiter, 0, 10)).toBe("ok");
    expect(hit(limiter, 0, 1)).toBe("TOO_MANY_REQUESTS");
    limiter.refund("ip", 4);
    expect(hit(limiter, 0, 4)).toBe("ok");
    limiter.refund("ip", 999);
    expect(hit(limiter, 0, 10)).toBe("ok"); // jatah penuh lagi, bukan lebih
    expect(hit(limiter, 0, 1)).toBe("TOO_MANY_REQUESTS");
    expect(() => limiter.refund("tidak-ada", 5)).not.toThrow();
  });

  test("kode dan pesan kustom, jendela baru mereset jatah", () => {
    const limiter = createRateLimiter(1, 1000, { code: "KUSTOM", message: "pesan kustom" });
    limiter("ip", 0);
    expect(() => limiter("ip", 1)).toThrow(expect.objectContaining({ status: 429, code: "KUSTOM", message: "pesan kustom" }));
    expect(hit(limiter, 1000, 1)).toBe("ok");
  });
});
