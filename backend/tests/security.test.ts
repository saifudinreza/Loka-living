import { describe, expect, spyOn, test } from "bun:test";
import { eq } from "drizzle-orm";
import { resolve } from "node:path";
import { createApp } from "../src/app";
import { listenOptions, MAX_BODY_BYTES } from "../src/config/server";
import { db } from "../src/db/client";
import { orders, productVariants } from "../src/db/schema";
import { sha512Hex } from "../src/lib/crypto";
import { useCleanDatabase } from "./db-reset";

useCleanDatabase();

// Temuan audit keamanan (lihat deskripsi PR): setiap perbaikan dibuktikan di sini, dan satu risiko yang belum
// diperbaiki dicatat sebagai test.todo supaya tidak terlupa.

type Json = Record<string, any>;
const NUL = "a\u0000b";
const backendDir = resolve(import.meta.dir, "..");

const app = createApp({ enableJobs: false, deps: { midtrans: { serverKey: "SB-Mid-server-security-key", createTransaction: async () => ({ token: "T", redirect_url: "https://app.sandbox.midtrans.com/snap/T" }) } } });

async function call(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  const res = await app.handle(new Request(`http://localhost/api${path}`, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }));
  const text = await res.text();
  return { status: res.status, body: (text ? JSON.parse(text) : null) as Json | null };
}

describe("karakter NUL ditolak (422), bukan 500", () => {
  test("di body, query, dan parameter URL pada semua endpoint yang dulu menghasilkan 500", async () => {
    const [variant] = await db.select().from(productVariants).limit(1);
    const init = await call("POST", "/checkout/init", { items: [{ product_variant_id: variant!.id, qty: 1 }] });
    const token = init.body!.order_token as string;
    const reg = await call("POST", "/auth/register", { email: `sec-${crypto.randomUUID().slice(0, 8)}@contoh.com`, password: "password-rahasia", name: "Sec" });
    const auth = { authorization: `Bearer ${reg.body!.access_token}` };

    const attempts: [string, () => Promise<{ status: number }>][] = [
      ["register: name", () => call("POST", "/auth/register", { email: `n-${crypto.randomUUID().slice(0, 8)}@contoh.com`, password: "password-rahasia", name: NUL })],
      ["register: password", () => call("POST", "/auth/register", { email: `p-${crypto.randomUUID().slice(0, 8)}@contoh.com`, password: "password-rahasia\u0000", name: "x" })],
      ["login: email", () => call("POST", "/auth/login", { email: `${NUL}@x.com`, password: "x" })],
      ["shipping-rate: full_address", () => call("POST", "/checkout/shipping-rate", { order_token: token, address: { full_address: NUL } })],
      ["shipping-rate: order_token", () => call("POST", "/checkout/shipping-rate", { order_token: NUL, address: { full_address: "x" } })],
      ["confirm: order_token", () => call("POST", "/checkout/confirm", { order_token: NUL, contact: { email: "a@b.com" }, shipping: { courier: "x" }, payment_method: "qris" })],
      ["confirm: courier", () => call("POST", "/checkout/confirm", { order_token: token, contact: { email: "a@b.com" }, shipping: { courier: NUL }, payment_method: "qris" })],
      ["alamat: full_address", () => call("POST", "/addresses", { label: "L", recipient_name: "R", phone: "081234567890", full_address: NUL, city: "Jakarta", province: "DKI Jakarta", postal_code: "12345" }, auth)],
      ["URL: /products/:slug", () => call("GET", "/products/%00abc")],
      ["URL: /orders/:token", () => call("GET", "/orders/%00abc")],
      ["query: /testimonials?product_slug", () => call("GET", "/testimonials?product_slug=%00")],
      ["query: /products?room", () => call("GET", "/products?room=%00")],
      ["webhook: order_id", () => call("POST", "/payment/webhook", { order_id: NUL, status_code: "200", gross_amount: "1", signature_key: "x", transaction_status: "settlement", transaction_id: "t" })],
      ["nama kunci JSON", () => call("POST", "/auth/login", { "email\u0000": "x", password: "x" })],
    ];

    const results: Record<string, number> = {};
    for (const [label, run] of attempts) results[label] = (await run()).status;
    for (const [label, status] of Object.entries(results)) expect({ label, status }).toEqual({ label, status: 422 });
  });

  test("error-nya seragam dan tidak membocorkan detail database", async () => {
    const res = await call("POST", "/auth/login", { email: `${NUL}@x.com`, password: "x" });
    expect(res.body).toEqual({ error: "Data yang dikirim tidak valid.", code: "VALIDATION_FAILED" });
  });

  test("teks normal, unicode, dan emoji tetap diterima", async () => {
    const res = await call("POST", "/auth/register", { email: `u-${crypto.randomUUID().slice(0, 8)}@contoh.com`, password: "password-rahasia", name: "Budi 😀 日本語 é" });
    expect(res.status).toBe(201);
  });
});

describe("batas ukuran body", () => {
  test("body di atas batas ditolak server (413) sebelum diurai; body normal tetap diproses", async () => {
    const server = createApp({ enableJobs: false }).listen(listenOptions(0));
    try {
      const base = `http://localhost:${server.server!.port}`;
      const post = (body: string) => fetch(`${base}/api/auth/login`, { method: "POST", headers: { "content-type": "application/json" }, body });

      // Server menjawab 413, tapi bisa juga menutup koneksi sebelum klien selesai mengunggah (ECONNRESET). Keduanya
      // berarti ditolak; yang tidak boleh terjadi adalah body diproses (401/422 dari endpoint login).
      const outcome = await post(JSON.stringify({ email: "a@b.com", password: "x".repeat(MAX_BODY_BYTES + 1024) })).then(
        (res) => res.status,
        () => "koneksi ditutup",
      );
      expect([413, "koneksi ditutup"]).toContain(outcome);

      const normal = await post(JSON.stringify({ email: "tidak-ada@contoh.com", password: "salah-total" }));
      expect(normal.status).toBe(401);
    } finally {
      await server.stop(true);
    }
  });

  test("batasnya 1 MB: jauh di atas payload API (alamat, daftar barang, notifikasi Midtrans < 10 KB)", () => {
    expect(MAX_BODY_BYTES).toBe(1024 * 1024);
    expect(listenOptions(8000)).toEqual({ port: 8000, maxRequestBodySize: 1024 * 1024 });
  });
});

describe("konfigurasi production gagal keras kalau tidak aman", () => {
  const load = (env: Record<string, string>) =>
    Bun.spawnSync(["bun", "-e", "import { env } from './src/config/env'; console.log('HOPS=' + env.TRUSTED_PROXY_HOPS + ' SECURE=' + env.COOKIE_SECURE)"], {
      cwd: backendDir,
      env: { ...process.env, NODE_ENV: "development", COOKIE_SECURE: "", TRUSTED_PROXY_HOPS: "", ...env } as Record<string, string>,
    });
  const out = (r: ReturnType<typeof load>) => `${r.stdout.toString()}${r.stderr.toString()}`;

  test("production tanpa COOKIE_SECURE=true → server menolak start", () => {
    for (const secure of ["", "false", "0"]) {
      const r = load({ NODE_ENV: "production", COOKIE_SECURE: secure });
      expect(r.exitCode).not.toBe(0);
      expect(out(r)).toContain("COOKIE_SECURE harus true di production");
    }
  });

  test("production dengan COOKIE_SECURE=true → berjalan", () => {
    const r = load({ NODE_ENV: "production", COOKIE_SECURE: "true" });
    expect(r.exitCode).toBe(0);
    expect(out(r)).toContain("SECURE=true");
  });

  test("development tidak dipaksa", () => {
    expect(load({ NODE_ENV: "development" }).exitCode).toBe(0);
  });

  test("TRUSTED_PROXY_HOPS: default 0, angka valid diterima, negatif/pecahan/teks ditolak", () => {
    expect(out(load({}))).toContain("HOPS=0");
    expect(out(load({ TRUSTED_PROXY_HOPS: "2" }))).toContain("HOPS=2");
    for (const bad of ["-1", "1.5", "satu"]) {
      const r = load({ TRUSTED_PROXY_HOPS: bad });
      expect(r.exitCode).not.toBe(0);
      expect(out(r)).toContain("TRUSTED_PROXY_HOPS");
    }
  });
});

describe("order_token tidak masuk log", () => {
  test("notifikasi dengan jumlah salah: log KRITIS memuat id internal order, bukan token (token = kata sandi pesanan tamu)", async () => {
    const [variant] = await db.select().from(productVariants).limit(1);
    const init = await call("POST", "/checkout/init", { items: [{ product_variant_id: variant!.id, qty: 1 }] });
    const token = init.body!.order_token as string;
    const rate = await call("POST", "/checkout/shipping-rate", { order_token: token, address: { full_address: "Jl. Log No. 1", city: "Jakarta Selatan", province: "DKI Jakarta" } });
    const confirm = await call("POST", "/checkout/confirm", { order_token: token, contact: { email: "log@contoh.com" }, shipping: { courier: rate.body!.options[0].courier }, payment_method: "qris" });
    expect(confirm.status).toBe(200);
    const [order] = await db.select().from(orders).where(eq(orders.orderToken, token));

    const status_code = "200";
    const gross_amount = "1.00"; // salah
    const logs: string[] = [];
    const error = spyOn(console, "error").mockImplementation((...args: unknown[]) => void logs.push(args.map(String).join(" ")));
    const warn = spyOn(console, "warn").mockImplementation((...args: unknown[]) => void logs.push(args.map(String).join(" ")));
    try {
      const res = await call("POST", "/payment/webhook", {
        order_id: token,
        status_code,
        gross_amount,
        signature_key: sha512Hex(`${token}${status_code}${gross_amount}SB-Mid-server-security-key`),
        transaction_status: "settlement",
        transaction_id: `trx-${crypto.randomUUID()}`,
      });
      expect(res.status).toBe(400);
      expect(res.body!.code).toBe("AMOUNT_MISMATCH");
    } finally {
      error.mockRestore();
      warn.mockRestore();
    }

    const joined = logs.join("\n");
    expect(joined).toContain("AMOUNT_MISMATCH");
    expect(joined).toContain(order!.id);
    expect(joined).not.toContain(token);
  });

  test("uang masuk untuk order yang sudah expired: log dan catatan database tanpa token", async () => {
    const [variant] = await db.select().from(productVariants).limit(1);
    const init = await call("POST", "/checkout/init", { items: [{ product_variant_id: variant!.id, qty: 1 }] });
    const token = init.body!.order_token as string;
    const rate = await call("POST", "/checkout/shipping-rate", { order_token: token, address: { full_address: "Jl. Log No. 2", city: "Jakarta Selatan", province: "DKI Jakarta" } });
    const confirm = await call("POST", "/checkout/confirm", { order_token: token, contact: { email: "log2@contoh.com" }, shipping: { courier: rate.body!.options[0].courier }, payment_method: "qris" });
    const gross_amount = `${confirm.body!.total_amount}.00`;
    const send = (transaction_status: string) =>
      call("POST", "/payment/webhook", { order_id: token, status_code: "200", gross_amount, signature_key: sha512Hex(`${token}200${gross_amount}SB-Mid-server-security-key`), transaction_status, transaction_id: `trx-${crypto.randomUUID()}` });

    expect((await send("expire")).status).toBe(200);
    const logs: string[] = [];
    const error = spyOn(console, "error").mockImplementation((...args: unknown[]) => void logs.push(args.map(String).join(" ")));
    try {
      expect((await send("settlement")).status).toBe(200);
    } finally {
      error.mockRestore();
    }
    expect(logs.join("\n")).toContain("refund manual");
    expect(logs.join("\n")).not.toContain(token);
  });
});

describe("signature webhook", () => {
  test("signature 128 karakter non-hex → 401, bukan 500", async () => {
    const res = await call("POST", "/payment/webhook", { order_id: "o", status_code: "200", gross_amount: "1.00", signature_key: "z".repeat(128), transaction_status: "settlement", transaction_id: "t" });
    expect(res.status).toBe(401);
    expect(res.body!.code).toBe("INVALID_SIGNATURE");
  });
});

describe("risiko yang diketahui dan belum diperbaiki (butuh keputusan produk)", () => {
  // Terbukti saat audit: satu klien tanpa login, 10 permintaan init (masih di bawah batas 10/menit) dengan qty = stok
  // tiap varian, menahan SELURUH stok toko selama 30 menit. Rate limit menghitung permintaan, bukan jumlah barang.
  // Pilihan mitigasi: batas total qty tertahan per IP/tamu, reservasi lebih singkat untuk tamu, login wajib untuk qty
  // besar, atau captcha. Semuanya mempengaruhi pembeli sungguhan, jadi dipilih pemilik produk.
  test.todo("satu klien anonim tidak boleh menahan seluruh stok toko lewat checkout/init", () => {});

  // Webhook hanya memverifikasi signature. Praktik yang dianjurkan Midtrans: setelah signature valid, konfirmasi status
  // lewat Status API (GET /v2/{order_id}/status) sebelum menandai paid. Butuh key sandbox untuk diuji.
  test.todo("status pembayaran dikonfirmasi ke Midtrans Status API sebelum order ditandai paid", () => {});

  // Order awaiting_payment hanya dilepas oleh webhook `expire`. Kalau notifikasi tidak pernah sampai (URL notifikasi
  // belum diatur, server mati terlalu lama), stok tertahan selamanya. Perlu job pemeriksa lewat Status API.
  test.todo("order awaiting_payment yang lewat jendela bayar + masa tenggang dilepas lewat pemeriksaan Status API", () => {});
});
