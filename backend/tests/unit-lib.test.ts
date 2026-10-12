import { describe, expect, test } from "bun:test";
import { clientIp, type IpContext } from "../src/lib/client-ip";
import { MIDTRANS_ORDER_ID_MAX, ORDER_TOKEN_BYTES, ORDER_TOKEN_MAX_LENGTH, ORDER_TOKEN_PATTERN, generateOrderToken } from "../src/lib/order-token";
import { createRateLimiter } from "../src/lib/rate-limit";
import { containsNul } from "../src/lib/reject-nul";
import { UUID_PATTERN } from "../src/lib/uuid";
import { computeTotals } from "../src/modules/checkout/checkout.service";
import { maskEmail, maskPhone } from "../src/modules/orders/orders.service";

// Unit test murni (tanpa database, tanpa HTTP) untuk pembantu di src/lib dan fungsi murni modul.

const hit = (limiter: ReturnType<typeof createRateLimiter>, key: string, now: number) => {
  try {
    limiter(key, now);
    return "ok";
  } catch (e) {
    return (e as { status?: number }).status === 429 ? "429" : "error";
  }
};

describe("createRateLimiter", () => {
  test("jatah habis → 429 pada permintaan ke-(max+1)", () => {
    const limiter = createRateLimiter(3, 1000);
    expect([1, 2, 3, 4, 5].map(() => hit(limiter, "ip", 0))).toEqual(["ok", "ok", "ok", "429", "429"]);
  });

  test("tiap kunci punya jatah sendiri", () => {
    const limiter = createRateLimiter(1, 1000);
    expect(hit(limiter, "a", 0)).toBe("ok");
    expect(hit(limiter, "b", 0)).toBe("ok");
    expect(hit(limiter, "a", 0)).toBe("429");
  });

  test("jendela baru mereset hitungan, tepat di batas waktunya", () => {
    const limiter = createRateLimiter(1, 1000);
    expect(hit(limiter, "ip", 0)).toBe("ok");
    expect(hit(limiter, "ip", 999)).toBe("429");
    expect(hit(limiter, "ip", 1000)).toBe("ok");
  });

  test("bucket kedaluwarsa direset walaupun belum tersapu (sapuan hanya sekali per jendela)", () => {
    const limiter = createRateLimiter(1, 1000);
    expect(hit(limiter, "ip", 0)).toBe("ok"); // sapuan terjadi di sini, berikutnya baru pada t >= 1000
    expect(hit(limiter, "ip", 500)).toBe("429"); // tanpa sapuan, bucket masih berlaku
    expect(hit(limiter, "ip", 1500)).toBe("ok"); // sudah lewat jendela
  });

  test("banyak kunci berbeda lalu waktu berjalan tidak mengganggu kunci lain", () => {
    const limiter = createRateLimiter(2, 1000);
    for (let i = 0; i < 5000; i++) expect(hit(limiter, `ip-${i}`, 0)).toBe("ok");
    expect(hit(limiter, "ip-0", 10)).toBe("ok");
    expect(hit(limiter, "ip-0", 20)).toBe("429");
    expect(hit(limiter, "ip-0", 5000)).toBe("ok");
  });

  test("error yang dilempar berbentuk AppError 429 dengan kode tetap", () => {
    const limiter = createRateLimiter(1, 1000);
    limiter("ip", 0);
    try {
      limiter("ip", 1);
      throw new Error("seharusnya melempar");
    } catch (e) {
      expect(e).toMatchObject({ status: 429, code: "TOO_MANY_REQUESTS" });
    }
  });
});

describe("clientIp", () => {
  const ctx = (opts: { socket?: string | null; xff?: string }): IpContext => ({
    request: new Request("http://localhost/", { headers: opts.xff === undefined ? {} : { "x-forwarded-for": opts.xff } }),
    server: opts.socket === null ? null : { requestIP: () => ({ address: opts.socket ?? "10.0.0.1" }) },
  });

  test("tanpa proxy tepercaya: alamat koneksi, X-Forwarded-For diabaikan (tidak bisa dipalsukan)", () => {
    expect(clientIp(ctx({ socket: "203.0.113.9", xff: "1.2.3.4" }), 0)).toBe("203.0.113.9");
  });

  test("tanpa server (mis. test in-process) → 'unknown'", () => {
    expect(clientIp(ctx({ socket: null }), 0)).toBe("unknown");
  });

  test("satu proxy tepercaya: entri paling kanan (ditambahkan proxy kita)", () => {
    expect(clientIp(ctx({ xff: "9.9.9.9, 198.51.100.7" }), 1)).toBe("198.51.100.7");
  });

  test("klien mengirim X-Forwarded-For palsu: entri palsu di kiri tidak dipercaya", () => {
    // klien mengirim "6.6.6.6"; proxy menambahkan IP aslinya di kanan
    expect(clientIp(ctx({ xff: "6.6.6.6, 198.51.100.7" }), 1)).toBe("198.51.100.7");
    expect(clientIp(ctx({ xff: "6.6.6.6, 198.51.100.7" }), 1)).not.toBe("6.6.6.6");
  });

  test("dua proxy tepercaya: entri kedua dari kanan", () => {
    expect(clientIp(ctx({ xff: "198.51.100.7, 10.1.1.1" }), 2)).toBe("198.51.100.7");
  });

  test("header kosong, hilang, atau lebih pendek dari jumlah hop → kembali ke alamat koneksi", () => {
    expect(clientIp(ctx({ socket: "10.0.0.5" }), 1)).toBe("10.0.0.5");
    expect(clientIp(ctx({ socket: "10.0.0.5", xff: "" }), 1)).toBe("10.0.0.5");
    expect(clientIp(ctx({ socket: "10.0.0.5", xff: " , " }), 1)).toBe("10.0.0.5");
    expect(clientIp(ctx({ socket: "10.0.0.5", xff: "1.1.1.1" }), 3)).toBe("10.0.0.5");
  });
});

describe("containsNul", () => {
  test("mendeteksi NUL di string, objek bersarang, array, dan nama kunci", () => {
    expect(containsNul("a\u0000b")).toBe(true);
    expect(containsNul({ a: { b: ["ok", "x\u0000"] } })).toBe(true);
    expect(containsNul({ "k\u0000": 1 })).toBe(true);
  });

  test("teks biasa, angka, null, undefined, dan unicode lain lolos", () => {
    for (const ok of ["", "halo", "emoji 😀 日本語", 42, null, undefined, true, { a: 1, b: ["x"] }, [], {}]) {
      expect(containsNul(ok)).toBe(false);
    }
  });

  test("struktur sangat dalam tidak membuat stack overflow", () => {
    let deep: unknown = "x";
    for (let i = 0; i < 100_000; i++) deep = { a: deep };
    expect(() => containsNul(deep)).not.toThrow();
  });
});

describe("order token", () => {
  test("token yang dibuat memenuhi polanya, muat di batas order_id Midtrans, dan unik", () => {
    const tokens = new Set(Array.from({ length: 200 }, generateOrderToken));
    expect(tokens.size).toBe(200);
    for (const t of tokens) {
      expect(ORDER_TOKEN_PATTERN.test(t)).toBe(true);
      expect(t.length).toBeLessThanOrEqual(MIDTRANS_ORDER_ID_MAX);
      expect(t.length).toBeLessThanOrEqual(ORDER_TOKEN_MAX_LENGTH);
    }
    expect(ORDER_TOKEN_BYTES * 8).toBeGreaterThanOrEqual(256);
  });

  test("pola menolak yang tidak mungkin sah: terlalu pendek/panjang, karakter di luar base64url, NUL, spasi", () => {
    for (const bad of ["", "pendek", "a".repeat(31), "a".repeat(65), "a".repeat(40) + "!", "a".repeat(40) + "\u0000", "a".repeat(40) + " ", "../".repeat(20), "a".repeat(40) + "\n"]) {
      expect(ORDER_TOKEN_PATTERN.test(bad)).toBe(false);
    }
  });
});

describe("UUID_PATTERN", () => {
  test("menerima UUID apa pun termasuk id seed polos; menolak yang bukan", () => {
    for (const ok of ["00000000-0000-0000-0000-000000000001", crypto.randomUUID(), crypto.randomUUID().toUpperCase()]) {
      expect(new RegExp(UUID_PATTERN).test(ok)).toBe(true);
    }
    for (const bad of ["", "bukan-uuid", "00000000-0000-0000-0000-00000000000", "00000000-0000-0000-0000-0000000000011", "g0000000-0000-0000-0000-000000000001", `${crypto.randomUUID()}\n`]) {
      expect(new RegExp(UUID_PATTERN).test(bad)).toBe(false);
    }
  });
});

describe("maskEmail / maskPhone (data pribadi pesanan tamu)", () => {
  test("email: 2 huruf pertama + ***; bagian lokal pendek tidak tampil utuh", () => {
    expect(maskEmail("budi@contoh.com")).toBe("bu***@contoh.com");
    expect(maskEmail("abc@x.com")).toBe("ab***@x.com");
    expect(maskEmail("ab@x.com")).toBe("a***@x.com");
    expect(maskEmail("a@x.com")).toBe("a***@x.com");
  });

  test("email: tanpa @ atau kosong → tidak membocorkan isinya", () => {
    expect(maskEmail("tanpa-at")).toBe("***");
    expect(maskEmail("@x.com")).toBe("***");
    expect(maskEmail(null)).toBeNull();
    expect(maskEmail("")).toBeNull();
  });

  test("email dengan banyak @ memakai @ terakhir sebagai pemisah domain", () => {
    expect(maskEmail("a@b@contoh.com")).toBe("a@***@contoh.com");
  });

  test("telepon: 4 awal + **** + 3 akhir; yang pendek disamarkan seluruhnya", () => {
    expect(maskPhone("081234567890")).toBe("0812****890");
    expect(maskPhone("+6281234567890")).toBe("+628****890");
    expect(maskPhone("12345678")).toBe("1234****678");
    expect(maskPhone("1234567")).toBe("****");
    expect(maskPhone("")).toBeNull();
    expect(maskPhone(null)).toBeNull();
  });

  test("hasil penyamaran tidak memuat bagian tengah aslinya", () => {
    expect(maskPhone("081234567890")).not.toContain("3456");
    expect(maskEmail("rahasia.banget@contoh.com")).not.toContain("hasia");
  });
});

describe("computeTotals", () => {
  test("tanpa instalasi, dengan instalasi, dan nol", () => {
    expect(computeTotals(2_450_000, 66_000, false)).toEqual({ shipping: 66_000, installation: 0, total: 2_516_000 });
    expect(computeTotals(2_450_000, 66_000, true)).toEqual({ shipping: 66_000, installation: 150_000, total: 2_666_000 });
    expect(computeTotals(0, 0, false)).toEqual({ shipping: 0, installation: 0, total: 0 });
  });

  test("total selalu bilangan bulat dan tidak bergantung urutan penjumlahan", () => {
    const { total } = computeTotals(1_999_999, 1, true);
    expect(Number.isInteger(total)).toBe(true);
    expect(total).toBe(1_999_999 + 1 + 150_000);
  });
});
