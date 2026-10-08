import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import type { Address } from "../src/lib/addressSchema";
import { useAddressStore } from "../src/lib/addressStore";
import { useAuthStore } from "../src/lib/authStore";
import { ApiError } from "../src/lib/http";
import { loadProvinces, resetProvincesCache } from "../src/lib/useProvinces";

const realFetch = globalThis.fetch;

interface Call {
  url: string;
  method: string;
  body: unknown;
  authorization: string | null;
}

let calls: Call[] = [];

function mockFetch(handler: (call: Call, index: number) => Response | Promise<Response>) {
  calls = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const call: Call = {
      url: String(input).replace(/^.*localhost:8000\/api/, ""),
      method: init?.method ?? "GET",
      body: init?.body ? JSON.parse(String(init.body)) : undefined,
      authorization: headers.get("authorization"),
    };
    calls.push(call);
    return handler(call, calls.length - 1);
  }) as typeof fetch;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const addr = (id: string, over: Partial<Address> = {}): Address => ({
  id,
  label: id,
  recipient_name: "Budi",
  phone: "081234567890",
  full_address: "Jl. Contoh 1",
  kelurahan: null,
  kecamatan: null,
  city: "Sleman",
  province: "DI Yogyakarta",
  postal_code: null,
  latitude: null,
  longitude: null,
  is_default: false,
  ...over,
});

beforeEach(() => {
  useAuthStore.setState({ status: "authenticated", accessToken: "token-a", user: null });
  useAddressStore.getState().reset();
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("addressStore", () => {
  test("load: mengisi daftar dari server dengan Bearer token", async () => {
    mockFetch(() => json({ data: [addr("a", { is_default: true }), addr("b")] }));
    await useAddressStore.getState().load();

    expect(useAddressStore.getState().addresses?.map((a) => a.id)).toEqual(["a", "b"]);
    expect(useAddressStore.getState().loading).toBe(false);
    expect(calls[0]).toMatchObject({ url: "/addresses", method: "GET", authorization: "Bearer token-a" });
  });

  test("create: POST lalu muat ulang dari server (server yang menentukan hasilnya)", async () => {
    mockFetch((call) =>
      call.method === "POST" ? json({ data: addr("baru") }, 201) : json({ data: [addr("baru", { is_default: true })] }),
    );
    await useAddressStore.getState().create({ label: "Baru", city: "Sleman" });

    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual(["POST /addresses", "GET /addresses"]);
    expect(calls[0]!.body).toEqual({ label: "Baru", city: "Sleman" });
    expect(useAddressStore.getState().addresses?.[0]).toMatchObject({ id: "baru", is_default: true });
  });

  test("update dan setDefault: PATCH hanya field yang diberikan, lalu muat ulang", async () => {
    mockFetch((call) => (call.method === "PATCH" ? json({ data: addr("x") }) : json({ data: [addr("x", { is_default: true })] })));
    await useAddressStore.getState().setDefault("x");
    expect(calls[0]).toMatchObject({ method: "PATCH", url: "/addresses/x", body: { is_default: true } });
    expect(calls[1]).toMatchObject({ method: "GET", url: "/addresses" });

    await useAddressStore.getState().update("x", { city: "Bantul" });
    expect(calls[2]).toMatchObject({ method: "PATCH", body: { city: "Bantul" } });
  });

  test("remove: DELETE (204) lalu muat ulang; alamat utama berikutnya TIDAK dihitung di klien", async () => {
    mockFetch((call) =>
      call.method === "DELETE"
        ? new Response(null, { status: 204 })
        : // server memutuskan "c" sebagai utama baru; klien hanya menampilkannya
          json({ data: [addr("c", { is_default: true }), addr("b")] }),
    );
    useAddressStore.setState({ addresses: [addr("a", { is_default: true }), addr("b"), addr("c")] });

    await useAddressStore.getState().remove("a");

    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual(["DELETE /addresses/a", "GET /addresses"]);
    expect(useAddressStore.getState().addresses?.map((a) => [a.id, a.is_default])).toEqual([
      ["c", true],
      ["b", false],
    ]);
  });

  test("galat server diteruskan sebagai ApiError dan daftar tidak berubah", async () => {
    mockFetch(() => json({ error: "Buku alamat maksimal 10 alamat.", code: "ADDRESS_LIMIT_REACHED" }, 422));
    useAddressStore.setState({ addresses: [addr("a")] });

    const error = await useAddressStore.getState().create({}).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 422, code: "ADDRESS_LIMIT_REACHED", message: "Buku alamat maksimal 10 alamat." });
    expect(useAddressStore.getState().addresses?.map((a) => a.id)).toEqual(["a"]);
    expect(calls).toHaveLength(1); // tidak memuat ulang setelah gagal
  });

  test("404 (alamat sudah dihapus di tab lain) → ApiError ADDRESS_NOT_FOUND agar UI bisa memuat ulang daftar", async () => {
    mockFetch(() => json({ error: "Alamat tidak ditemukan.", code: "ADDRESS_NOT_FOUND" }, 404));
    const error = await useAddressStore.getState().update("hilang", { city: "x" }).catch((e) => e);
    expect(error).toMatchObject({ status: 404, code: "ADDRESS_NOT_FOUND" });
  });

  test("respons muat yang lebih LAMA tapi terlambat tidak menimpa yang lebih baru", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    mockFetch(async (_c, i) => {
      if (i === 0) {
        await gate; // permintaan pertama sengaja ditahan
        return json({ data: [addr("lama")] });
      }
      return json({ data: [addr("baru")] });
    });

    const first = useAddressStore.getState().load();
    await useAddressStore.getState().load(); // permintaan kedua selesai lebih dulu
    expect(useAddressStore.getState().addresses?.map((a) => a.id)).toEqual(["baru"]);

    release();
    await first;
    expect(useAddressStore.getState().addresses?.map((a) => a.id)).toEqual(["baru"]); // tidak tertimpa "lama"
  });

  test("reset (keluar): daftar dikosongkan dan respons yang masih di perjalanan tidak mengisi ulang", async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    mockFetch(async () => {
      await gate;
      return json({ data: [addr("data-user-lama")] });
    });

    const pending = useAddressStore.getState().load();
    useAddressStore.getState().reset(); // user menekan Keluar saat permintaan berjalan
    release();
    await pending;

    expect(useAddressStore.getState().addresses).toBeNull();
  });

  test("tidak menyentuh storage browser (data pribadi)", async () => {
    const touched: string[] = [];
    const spy = (name: string) => () => {
      touched.push(name);
      return null;
    };
    (globalThis as { window?: unknown }).window = {
      localStorage: { getItem: spy("l.get"), setItem: spy("l.set"), removeItem: spy("l.rm") },
      sessionStorage: { getItem: spy("s.get"), setItem: spy("s.set"), removeItem: spy("s.rm") },
    };
    try {
      mockFetch(() => json({ data: [addr("a")] }));
      await useAddressStore.getState().load();
      await useAddressStore.getState().remove("a").catch(() => undefined);
      useAddressStore.getState().reset();
    } finally {
      delete (globalThis as { window?: unknown }).window;
    }
    expect(touched).toEqual([]);
  });
});

describe("loadProvinces (daftar dibagi, permintaan satu kali)", () => {
  beforeEach(() => resetProvincesCache());

  test("banyak pemanggil bersamaan hanya mengirim SATU permintaan; setelah itu dari cache", async () => {
    mockFetch(async () => {
      await Bun.sleep(15);
      return json({ data: ["Aceh", "Bali", "DKI Jakarta"] });
    });

    const results = await Promise.all([loadProvinces(), loadProvinces(), loadProvinces(), loadProvinces()]);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({ url: "/shipping/provinces", method: "GET", authorization: null }); // publik: tanpa token
    for (const r of results) expect(r).toEqual(["Aceh", "Bali", "DKI Jakarta"]);

    await loadProvinces();
    expect(calls).toHaveLength(1); // tidak meminta lagi
  });

  test("gagal tidak disimpan: percobaan berikutnya mengirim permintaan baru dan bisa berhasil", async () => {
    mockFetch((_c, i) => (i === 0 ? json({ error: "x", code: "X" }, 500) : json({ data: ["Bali"] })));

    await expect(loadProvinces()).rejects.toBeInstanceOf(ApiError);
    expect(await loadProvinces()).toEqual(["Bali"]);
    expect(calls).toHaveLength(2);
  });

  test("error jaringan juga tidak mengunci (bisa dicoba lagi)", async () => {
    mockFetch((_c, i) => {
      if (i === 0) throw new TypeError("Failed to fetch");
      return json({ data: ["Bali"] });
    });
    await expect(loadProvinces()).rejects.toThrow();
    expect(await loadProvinces()).toEqual(["Bali"]);
  });
});
