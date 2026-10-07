import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { useAuthStore } from "../src/lib/authStore";
import { ApiError, apiFetch, describeError, refreshSession } from "../src/lib/http";

// bun test tidak punya DOM/navigator.locks: refresh jatuh ke jalur tanpa kunci antar-tab (yang diuji di sini
// adalah berbagi satu permintaan yang sedang berjalan dalam satu tab).

const realFetch = globalThis.fetch;

interface Call {
  url: string;
  method: string;
  authorization: string | null;
}

let calls: Call[] = [];

function mockFetch(handler: (call: Call, index: number) => Response | Promise<Response>) {
  calls = [];
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const call: Call = {
      url: String(input),
      method: init?.method ?? "GET",
      authorization: headers.get("authorization"),
    };
    calls.push(call);
    return handler(call, calls.length - 1);
  }) as typeof fetch;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const session = (token: string) => ({
  access_token: token,
  token_type: "Bearer",
  expires_in: 900,
  user: { id: "u1", email: "budi@contoh.com", name: "Budi" },
});

beforeEach(() => {
  useAuthStore.setState({ status: "unknown", accessToken: null, user: null });
});

afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("refreshSession (satu-satu)", () => {
  test("banyak pemanggil bersamaan hanya mengirim SATU permintaan /refresh dan berbagi hasilnya", async () => {
    mockFetch(async () => {
      await Bun.sleep(20); // beri waktu agar pemanggil lain sempat masuk
      return json(session("token-1"));
    });

    const results = await Promise.all(Array.from({ length: 6 }, () => refreshSession()));

    expect(calls).toHaveLength(1); // 2 permintaan = REFRESH_TOKEN_REUSED dan seluruh sesi dicabut
    expect(calls[0]!.url).toContain("/auth/refresh");
    expect(calls[0]!.method).toBe("POST");
    for (const r of results) expect(r?.access_token).toBe("token-1");
    expect(useAuthStore.getState()).toMatchObject({ status: "authenticated", accessToken: "token-1" });
  });

  test("setelah selesai, panggilan berikutnya boleh mengirim permintaan baru", async () => {
    let n = 0;
    mockFetch(() => json(session(`token-${++n}`)));

    await refreshSession();
    await refreshSession();

    expect(calls).toHaveLength(2);
    expect(useAuthStore.getState().accessToken).toBe("token-2");
  });

  test("401 → null dan status guest", async () => {
    mockFetch(() => json({ error: "x", code: "REFRESH_TOKEN_MISSING" }, 401));
    expect(await refreshSession()).toBeNull();
    expect(useAuthStore.getState()).toMatchObject({ status: "guest", accessToken: null });
  });

  test("error jaringan → null (tidak melempar), status guest", async () => {
    mockFetch(() => {
      throw new TypeError("Failed to fetch");
    });
    expect(await refreshSession()).toBeNull();
    expect(useAuthStore.getState().status).toBe("guest");
  });

  test("gagal tidak mengunci: refresh berikutnya tetap bisa berhasil", async () => {
    mockFetch((_c, i) => (i === 0 ? json({ error: "x", code: "X" }, 500) : json(session("pulih"))));
    expect(await refreshSession()).toBeNull();
    expect((await refreshSession())?.access_token).toBe("pulih");
  });
});

describe("apiFetch", () => {
  test("withAuth: mengirim Bearer; 401 → /refresh sekali → ulangi dengan token baru", async () => {
    useAuthStore.setState({ status: "authenticated", accessToken: "lama", user: null });
    mockFetch((call) => {
      if (call.url.endsWith("/auth/refresh")) return json(session("baru"));
      return call.authorization === "Bearer baru" ? json({ data: "ok" }) : json({ error: "x", code: "UNAUTHORIZED" }, 401);
    });

    const result = await apiFetch<{ data: string }>("/cart", { withAuth: true });

    expect(result).toEqual({ data: "ok" });
    expect(calls.map((c) => [c.url.split("/api")[1] ?? c.url.replace(/^.*localhost:8000/, ""), c.authorization])).toEqual([
      ["/cart", "Bearer lama"],
      ["/auth/refresh", null],
      ["/cart", "Bearer baru"],
    ]);
  });

  test("withAuth: refresh gagal → error 401 diteruskan, tidak mengulang tanpa akhir", async () => {
    useAuthStore.setState({ status: "authenticated", accessToken: "lama", user: null });
    mockFetch((call) =>
      call.url.endsWith("/auth/refresh")
        ? json({ error: "x", code: "REFRESH_TOKEN_EXPIRED" }, 401)
        : json({ error: "Silakan login dulu.", code: "UNAUTHORIZED" }, 401),
    );

    await expect(apiFetch("/cart", { withAuth: true })).rejects.toMatchObject({ status: 401, code: "UNAUTHORIZED" });
    expect(calls).toHaveLength(2); // permintaan awal + satu kali refresh
    expect(useAuthStore.getState().status).toBe("guest");
  });

  test("tanpa withAuth (login): 401 INVALID_CREDENTIALS TIDAK memicu refresh", async () => {
    mockFetch(() => json({ error: "Email atau password salah.", code: "INVALID_CREDENTIALS" }, 401));

    const error = await apiFetch("/auth/login", { method: "POST", body: { email: "a", password: "b" } }).catch((e) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect(error).toMatchObject({ status: 401, code: "INVALID_CREDENTIALS", message: "Email atau password salah." });
    expect(calls).toHaveLength(1);
  });

  test("tanpa withAuth: tidak mengirim header Authorization walau ada token di memori", async () => {
    useAuthStore.setState({ status: "authenticated", accessToken: "rahasia", user: null });
    mockFetch(() => json({ ok: true }));
    await apiFetch("/shipping/provinces");
    expect(calls[0]!.authorization).toBeNull();
  });

  test("204 tanpa isi → undefined", async () => {
    mockFetch(() => new Response(null, { status: 204 }));
    expect(await apiFetch("/auth/logout", { method: "POST" })).toBeUndefined();
  });

  test("error tanpa body JSON tetap menjadi ApiError dengan pesan umum", async () => {
    mockFetch(() => new Response("Bad Gateway", { status: 502 }));
    const error = await apiFetch("/cart").catch((e) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect(error.status).toBe(502);
    expect(error.message).toContain("502");
  });
});

describe("describeError", () => {
  test("ApiError → pesan server; error lain → pesan koneksi", () => {
    expect(describeError(new ApiError(409, "EMAIL_TAKEN", "Email sudah terdaftar."))).toBe("Email sudah terdaftar.");
    expect(describeError(new TypeError("Failed to fetch"))).toContain("Tidak bisa terhubung");
  });
});
