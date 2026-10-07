import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { safeNext, savePendingAdd, saveNext, takeNext, takePendingAdd } from "../src/lib/redirect";

// sessionStorage tiruan (bun test tidak punya DOM)
function installStorage(overrides: Partial<Storage> = {}) {
  const data = new Map<string, string>();
  const storage = {
    getItem: (k: string) => data.get(k) ?? null,
    setItem: (k: string, v: string) => void data.set(k, v),
    removeItem: (k: string) => void data.delete(k),
    ...overrides,
  };
  (globalThis as { window?: unknown }).window = { sessionStorage: storage };
  return data;
}

afterEach(() => {
  delete (globalThis as { window?: unknown }).window;
});

describe("safeNext (anti open-redirect)", () => {
  test("path internal diterima apa adanya", () => {
    for (const ok of ["/", "/cart", "/products/kursi-santai-rukun", "/collections?cat=Kursi", "/#koleksi", "/a/b?x=1#y"]) {
      expect(safeNext(ok), ok).toBe(ok);
    }
  });

  test("kosong / null / undefined → fallback", () => {
    expect(safeNext(null)).toBe("/");
    expect(safeNext(undefined)).toBe("/");
    expect(safeNext("")).toBe("/");
    expect(safeNext(null, "/cart")).toBe("/cart");
  });

  test("URL luar, protocol-relative, dan trik backslash/karakter kontrol ditolak", () => {
    const evil = [
      "https://evil.com",
      "http://evil.com/cart",
      "//evil.com",
      "///evil.com",
      "/\\evil.com",
      "/\\/evil.com",
      "\\\\evil.com",
      "javascript:alert(1)",
      "cart", // bukan diawali "/"
      "/\tevil.com",
      "/\nevil.com",
      "/\r\nSet-Cookie: x=1",
      "/\u0000",
      "/\u007f",
    ];
    for (const value of evil) expect(safeNext(value), JSON.stringify(value)).toBe("/");
    expect(safeNext("//evil.com", "/masuk")).toBe("/masuk");
  });
});

describe("pilihan 'tambah ke keranjang' yang tertunda", () => {
  beforeEach(() => installStorage());

  test("disimpan lalu dibaca sekali saja (setelah itu hilang)", () => {
    savePendingAdd({ variantId: "abc", qty: 2 });
    expect(takePendingAdd()).toEqual({ variantId: "abc", qty: 2 });
    expect(takePendingAdd()).toBeNull();
  });

  test("tidak ada → null", () => {
    expect(takePendingAdd()).toBeNull();
  });

  test("isi yang rusak atau tidak masuk akal dibuang dan tidak menimbulkan error", () => {
    const data = installStorage();
    const bad = [
      "bukan json",
      "null",
      "{}",
      JSON.stringify({ variantId: "", qty: 1 }),
      JSON.stringify({ variantId: 123, qty: 1 }),
      JSON.stringify({ variantId: "abc", qty: 0 }),
      JSON.stringify({ variantId: "abc", qty: 100 }),
      JSON.stringify({ variantId: "abc", qty: 1.5 }),
      JSON.stringify({ variantId: "abc", qty: "2" }),
      JSON.stringify({ variantId: "abc" }),
    ];
    for (const raw of bad) {
      data.set("loka-pending-cart", raw);
      expect(takePendingAdd(), raw).toBeNull();
      expect(data.has("loka-pending-cart"), "harus tetap dihapus").toBe(false);
    }
  });

  test("batas qty 1 dan 99 diterima", () => {
    savePendingAdd({ variantId: "a", qty: 1 });
    expect(takePendingAdd()?.qty).toBe(1);
    savePendingAdd({ variantId: "a", qty: 99 });
    expect(takePendingAdd()?.qty).toBe(99);
  });

  test("storage diblokir (mode privat): tidak crash", () => {
    installStorage({
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
      removeItem: () => {
        throw new Error("blocked");
      },
    });
    expect(() => savePendingAdd({ variantId: "a", qty: 1 })).not.toThrow();
    expect(takePendingAdd()).toBeNull();
    expect(() => saveNext("/cart")).not.toThrow();
    expect(takeNext()).toBe("/");
  });
});

describe("tujuan setelah login Google", () => {
  beforeEach(() => installStorage());

  test("disimpan lalu dibaca sekali; tanpa isi → fallback", () => {
    saveNext("/products/kursi-santai-rukun");
    expect(takeNext()).toBe("/products/kursi-santai-rukun");
    expect(takeNext()).toBe("/");
    expect(takeNext("/cart")).toBe("/cart");
  });

  test("tujuan berbahaya dibersihkan sejak disimpan, dan dicek lagi saat dibaca", () => {
    saveNext("https://evil.com");
    expect(takeNext()).toBe("/");

    const data = installStorage();
    data.set("loka-auth-next", "//evil.com");
    expect(takeNext()).toBe("/");
  });
});
