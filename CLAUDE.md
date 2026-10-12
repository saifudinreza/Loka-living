# CLAUDE.md — Loka Living

> Baca file ini dulu di awal sesi. Ini adalah ringkasan status & alur kerja proyek, dibuat supaya Claude Code tidak perlu membaca ulang PRD/PLANNING/TECHNICAL/design.md secara penuh setiap sesi. Buka dokumen sumber di bawah hanya kalau butuh detail spesifik yang tidak ada di sini.

## 1. Apa Proyek Ini

Loka Living (nama produk sebelumnya: Alamrupa) — e-commerce furniture. 1 developer, dikerjakan paruh waktu (~10-15 jam/minggu, malam & weekend setelah kerja shift). Timeline dihitung dalam "minggu efektif", bukan hari kalender.

Dokumen sumber (jangan dibaca full kecuali dibutuhkan detailnya):
- `issues/README.md` — **acuan utama backend**: stack, ringkasan API, ringkasan DB, aturan umum, urutan issue 01–19. Satu file per issue di `issues/`.
- `PRD-LokaLiving.md` — requirement produk lengkap
- `PLANNING-LokaLiving.md` — roadmap fase, estimasi, daftar risiko
- `TECHNICAL-LokaLiving.md` — arsitektur, skema DB, kontrak API (ditulis saat backend masih Laravel; kontrak API tetap berlaku, detail implementasinya tidak)
- `design.md` — design tokens & spesifikasi animasi (warna, tipografi, motion)

## 2. Arsitektur

```
Next.js 14 (frontend/)  <-- REST /api -->  Bun + Elysia (backend/, port 8000)  <-->  PostgreSQL 18 (Drizzle ORM)
                                                      |
                                    Midtrans Snap (fetch, tanpa SDK), cron job satu proses dengan server
```

Prinsip kunci: Next.js **tidak pernah** panggil Midtrans/Stripe/Cargo API langsung dari client — selalu lewat backend. Validasi harga & stok wajib di server, bukan di client.

**Backend sudah pindah dari Laravel ke Bun + Elysia + Drizzle** (seluruh stack TypeScript). Tidak ada lagi kode PHP di repo. Kode Laravel lama hanya bisa dilihat lewat `git show bf3765d:backend/...` sebagai acuan logic.

**Struktur repo:**
- Git repo ada di **root project** (`C:/CODINGAN/full stack/Loka-Living`).
- `frontend/` — Next.js 14 (App Router), TypeScript, Tailwind, Zustand, react-hook-form + zod, `@google/model-viewer`, `motion`
- `backend/` — Bun + Elysia, Drizzle (`postgres.js`), JWT + refresh token cookie, Google OAuth (Arctic), `@elysiajs/cron`, test pakai `bun test`
  - `src/app.ts` — `createApp()`, semua route di bawah `/api`, Swagger hanya di non-production
  - `src/db/` — schema, migrasi (`bun run db:generate` / `db:migrate`), seed (`db:seed`)
  - `src/modules/{auth,catalog,shipping,account,checkout,payments,orders}/` — `*.routes.ts`, `*.service.ts`, `*.docs.ts`
  - `src/lib/errors.ts` — `AppError` + error handler (format `{ error, code }`)
  - `tests/` — satu file test per modul

## 3. Status Sekarang (per 2026-10-12)

Sedang di **Fase 1 — MVP**, mengerjakan migrasi backend sesuai `issues/README.md`.

**Backend — issue selesai (sudah di `main`):**
- ✅ 01–03 Setup project, skema Drizzle 17 tabel + migrasi, seed
- ✅ 04–06 Auth: register/login, `/me`, refresh (rotasi), logout, login Google
- ✅ 07–08 Katalog (`/rooms`, `/products`, `/products/:slug`) + testimoni
- ✅ 09 Tarif ongkir zona, `/shipping/provinces`, `/shipping/estimate`
- ✅ 10–12 Keranjang akun (+ merge), wishlist, buku alamat
- ✅ 13 `POST /checkout/init` — reservasi stok + order draft (PR #55)
- ✅ 14 `POST /checkout/shipping-rate` — salinan alamat order + quote ongkir tersimpan (PR #57)
- ✅ 15 `POST /checkout/confirm` + Midtrans Snap (GitHub #59) — total dihitung ulang dari DB, Midtrans dipanggil di dalam transaksi (gagal → order tetap draft); belum diuji dengan key sandbox asli

**Backend — belum dikerjakan (file masih stub `export {}`):**
- [ ] 16 `POST /payment/webhook` + signature — GitHub #61 — `payments/webhook.routes.ts`, `signature.ts`, `payment-status.service.ts`
- [ ] 17 Job release reservasi kedaluwarsa — GitHub #62 — `src/jobs/release-expired-reservations.ts`
- [ ] 18 `GET /orders`, `GET /orders/:token` — GitHub #63 — `orders/orders.routes.ts`
- [ ] 19 Test kritis, uji dengan frontend, update dokumentasi — GitHub #64

**Frontend (`frontend/src/`):**
- ✅ Homepage, koleksi, detail produk — data dari API
- ✅ Login, register, `/auth/callback` (Google), keranjang akun (wajib login)
- ✅ Buku alamat (`/account/addresses`), daftar provinsi dari API
- ✅ `app/checkout/page.tsx` + `lib/checkout.ts` — UI checkout single-screen, sudah memanggil `init` / `shipping-rate` / `confirm`, tapi `confirm` baru bisa jalan setelah issue 15
- ✅ Scroll animation, about, contact

## Todo (daftar kerja — update tiap selesai)

- [ ] Issue 15–19 berurutan (lihat di atas)
- [ ] Isi `MIDTRANS_SERVER_KEY` / `MIDTRANS_CLIENT_KEY` (sandbox) di `backend/.env` untuk uji issue 15–16
- [ ] QA alur beli end-to-end (tes beli QRIS/VA sandbox)
- [ ] Test kritis wajib: 2 tab browser beli stok terakhir bersamaan (oversell check)
- [ ] Checkout dari cart (multiple items)
- [ ] Frontend: wishlist, riwayat pesanan, estimasi ongkir di PDP, tombol WhatsApp (lihat `issues/README.md` bagian frontend)
- [ ] Integrasi Google Maps Autocomplete (opsional, PLANNING §3)

## 4. Yang TIDAK BOLEH Dipangkas / Dilonggarkan

Meski waktu mepet, ini wajib benar sebelum MVP dianggap selesai:
- Stock reservation yang benar (test skenario 2 tab beli stok terakhir bersamaan)
- Verifikasi webhook signature (Midtrans)
- Re-validasi harga di server saat checkout (jangan percaya harga dari client/DevTools)

## 5. Prinsip Desain (ringkas, detail penuh di `design.md`)

- Warm/organic eco tone, bukan e-commerce dingin. Warna aksen dominan: `--olive` (#5F6B45) untuk semua CTA/active state; `--wood` (#C99A66) hanya dekoratif, jangan dipakai di CTA.
- Tipografi besar sebagai hero, bukan banner gambar.
- Motion harus fungsional: FLIP transition saat klik produk (pakai Framer Motion `layoutId`), crossfade swatch warna/material, scroll-reveal sekali jalan (`IntersectionObserver`/`whileInView`), hover-zoom card produk.
- Wajib hormati `prefers-reduced-motion: reduce` — FLIP fallback ke instant navigation.
- Restraint: tidak ada parallax scroll, tidak ada auto-play carousel, tidak ada numbered marker dekoratif.

## 6. Cara Kerja dengan Claude Code

- User adalah developer solo, ngoding di sela kerja shift. User memberi perintah, **Claude yang mengimplementasikan** (tulis/edit file langsung, jalankan test/typecheck). Tidak ada mode belajar: jangan minta user mengetik kode sendiri.
- Tetap teliti di logic kritis (issue berlabel [LOGIC KRITIS]: stock reservation, webhook/signature verification, harga/ongkir): tulis test, cari edge case, dan jelaskan singkat keputusan desainnya di ringkasan akhir.
- Satu branch per issue, dibuat dari `main` terbaru, commit format Conventional Commits.
- Kalau mengerjakan fitur baru, cek dulu urutan di `issues/README.md` dan prioritas di `PLANNING-LokaLiving.md` §3 & §5 supaya tidak keluar jalur fase.
- Update bagian **"Status Sekarang"** di file ini setiap kali menyelesaikan potongan kerja signifikan — supaya sesi berikutnya tetap akurat tanpa perlu re-scan seluruh repo.
