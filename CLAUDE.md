# CLAUDE.md — Loka Living

> Baca file ini dulu di awal sesi. Ini adalah ringkasan status & alur kerja proyek, dibuat supaya Claude Code tidak perlu membaca ulang PRD/PLANNING/TECHNICAL/design.md secara penuh setiap sesi. Buka dokumen sumber di bawah hanya kalau butuh detail spesifik yang tidak ada di sini.

## 1. Apa Proyek Ini

Loka Living (nama produk sebelumnya: Alamrupa) — e-commerce furniture. 1 developer, dikerjakan paruh waktu (~10-15 jam/minggu, malam & weekend setelah kerja shift). Timeline dihitung dalam "minggu efektif", bukan hari kalender.

Dokumen sumber (jangan dibaca full kecuali dibutuhkan detailnya):
- `PRD-LokaLiving.md` — requirement produk lengkap
- `PLANNING-LokaLiving.md` — roadmap fase, estimasi, daftar risiko
- `TECHNICAL-LokaLiving.md` — arsitektur, skema DB, kontrak API
- `design.md` — design tokens & spesifikasi animasi (warna, tipografi, motion)

## 2. Arsitektur

```
Next.js 14 (frontend/, Vercel)  <-- REST -->  Laravel 11 API (belum dibuat)  <-->  PostgreSQL
                                                      |
                                        Redis (queue+cache), Cloudflare R2 (asset)
                                                      |
                                  Midtrans (lokal) / Stripe (global) / Google Maps / Cargo API / WA-Email
```

Prinsip kunci: Next.js **tidak pernah** panggil Midtrans/Stripe/Cargo API langsung dari client — selalu lewat Laravel API. Validasi harga & stok wajib di server, bukan di client.

**Struktur repo saat ini:**
- Git repo ada di **root project** (`C:/CODINGAN/full stack/Loka-Living`), bukan di `frontend/`.
- `frontend/` — Next.js 14 (App Router), TypeScript, Tailwind, Zustand, react-hook-form + zod, `@google/model-viewer`, `motion` (Framer Motion)
- `backend/` — Laravel 11 API (fresh install, dikerjakan ulang dari nol karena implementasi sebelumnya hilang)

## 3. Status Sekarang (per 2026-07-27)

Sedang di **Fase 1 — MVP**.

**⚠️ Catatan penting:** Backend Laravel yang sebelumnya diklaim "selesai & terverifikasi" di versi CLAUDE.md yang lama (checkout/init, checkout/shipping-rate, checkout/confirm, stock reservation, integrasi Midtrans sandbox, ReleaseExpiredReservations) **ternyata tidak ada di disk** — sudah dicek ke seluruh drive C, tidak ketemu. Folder `backend/` saat ini adalah instalasi Laravel fresh (hanya migration default `users`/`cache`/`jobs`). Backend perlu **dikerjakan ulang dari nol**. Spesifikasi di `TECHNICAL-LokaLiving.md` masih valid sebagai acuan skema/API contract, yang hilang cuma implementasinya.

**Backend (`backend/`):**
- ✅ PostgreSQL 18 terinstall & jalan sebagai service, database `loka_living` dibuat lewat pgAdmin4, `.env` sudah diarahkan ke situ (`DB_CONNECTION=pgsql`, user `postgres`), extension `pdo_pgsql`/`pgsql` diaktifkan di `php.ini`, koneksi terverifikasi (`migrate:fresh --seed` jalan sukses dengan migration default).
- ✅ Semua 12 migration terbuat & ter-migrate
- ✅ **9/9 Eloquent Models terisi** — semua model sudah lengkap (fillable, casts, relasi, timestamps)
- ✅ `ProductSeeder` — 8 produk + 12 varian, sudah terverifikasi via `migrate:fresh --seed`
- ✅ `ProcessedWebhook`, `OrderStatusLog` models sudah diisi
- ✅ `routes/api.php` + `bootstrap/app.php` (api routing diaktifkan)
- ✅ `CheckoutController::init()` — fixed property name + try-catch RuntimeException → 422
- ✅ `StockReservationService::init()` — full logic: FOR UPDATE lock, stock decrement, draft order creation, 30m TTL
- ✅ `ReleaseExpiredReservations` — job & handler (ReleaseOrderReservation + ReleaseExpiredReservations + scheduler)
- ✅ `CargoRateService` — manual rate table (5 zona berdasarkan provinsi, base_rate + per_kg)
- ✅ `MidtransService` — Snap API integration (transaction_details, item_details, customer_details)
- ✅ `CheckoutController` — `init`, `shippingRate`, `confirm` (lengkap dengan re-validasi harga server-side)
- ✅ `routes/api.php` — semua 3 endpoint checkout + webhook terdaftar (fixed double prefix bug — Laravel 11 sudah prefix otomatis)
- ✅ `ProductController` — `index()` (daftar produk aktif) + `show(slug)` (detail produk + varian) + routes terdaftar
- ✅ Webhook Midtrans handler — `PaymentWebhookController` lengkap (verifySignature → idempotency → cari order → validasi amount → map status → DB transaction: update order, upsert PaymentTransaction, OrderStatusLog, release stock, mark processed) + route terdaftar
- **Rencana urutan rebuild:** (1-3) ✅ migration, models, seeder (**selesai**), (4) ✅ `checkout/init` + stock reservation (**selesai — user review & paham**), (5) ✅ `ReleaseExpiredReservations` (**selesai — reviewed & fixed**), (6) ✅ `checkout/shipping-rate` + `CargoRateService` (**selesai — reviewed & fixed**), (7) ✅ `checkout/confirm` + `MidtransService` (**selesai — reviewed & fixed**), (8) webhook Midtrans + signature verification (critical logic — mode belajar).
- **Cara kerja disepakati:** Claude jelaskan + tulis kode di terminal (dengan komen penjelasan), user mengetik sendiri ke file. Jangan pakai Write/Edit langsung ke file migration/model/controller kecuali diminta.

**Frontend (`frontend/src/`):**
- ✅ **Semua data produk dari API** — tidak ada lagi hardcoded `PRODUCTS`/`VARIANTS`/`SPOTS`/`NEW_ARRIVAL_IDS`
- ✅ Data mengalir: Laravel API → server component → `HomeClient` → child components (props)
- ✅ `Product` type sekarang punya `slug`, `variants: ProductVariant[]`, `image_url`
- ✅ `app/page.tsx` — async server component, fetch dari API
- ✅ `app/HomeClient.tsx` — client wrapper yg render semua section
- ✅ `components/Hero.tsx` — terima `products` prop, SPOTS konstanta lokal pake slug
- ✅ `components/Koleksi.tsx` — terima `products` prop, filter di client
- ✅ `components/BaruTiba.tsx` — terima `products` + `newArrivalSlugs` prop
- ✅ `components/Sorotan.tsx` — terima `products` + `featuredSlug`, pake product.variants
- ✅ `components/ProductCard.tsx` — pake `product.image_url`, type dari api.ts
- ✅ `components/PdpOverlay.tsx` — terima `products` prop, pake product.variants
- ✅ `app/collections/page.tsx` — fetch dari API via `useEffect`, filter by searchParams
- ✅ `app/products/[slug]/page.tsx` — fetch `fetchProductBySlug`, variants dari API

## Todo (daftar kerja — update tiap selesai)

Urutan kerja: kerjakan berurutan, mode belajar untuk logic kritis.

### Batch 1: ✅ Homepage → API (selesai)

**Sesi 2026-07-27 — capaian:**
- ✅ **Step 3** — Buat `app/HomeClient.tsx`
- ✅ **Step 4** — `app/page.tsx` jadi async server component + fetch API
- ✅ **Step 5** — `Hero.tsx` terima products + SPOTS konstanta lokal
- ✅ **Step 6** — `Koleksi.tsx` terima products prop
- ✅ **Step 7** — `BaruTiba.tsx` terima products + newArrivalSlugs
- ✅ **Step 8** — `Sorotan.tsx` terima products + featuredSlug, pake product.variants
- ✅ **Step 9** — `ProductCard.tsx` pake image_url, type dari api
- ✅ **Step 10** — `PdpOverlay.tsx` terima products, pake product.variants
- ✅ **Step 11** — `collections/page.tsx` fetch dari API
- ✅ **Step 12** — `products/[slug]/page.tsx` fetch dari API
- ✅ **Step 13** — Verifikasi: TypeScript clean, build compiled sukses, API jalan

### Batch 2: Checkout Single-Screen UI

- [ ] (detail menyusul saat sampai di sini)

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

- User adalah developer solo, ngoding di sela kerja shift, **dan sedang mempersiapkan interview** — tujuannya bukan cuma punya aplikasi yang jalan, tapi paham logic-nya sendiri untuk bisa dijelaskan.
- **Mode belajar untuk logic kritis** (stock reservation, webhook Midtrans/signature verification, checkout flow, perhitungan harga/ongkir, dan business logic penting lainnya): jelaskan dulu alurnya (step-by-step + pseudocode/diagram + alasan desainnya) sebelum menulis kode — biarkan user yang implementasi, lalu saya review, cari bug/edge case, dan tanya balik untuk memastikan paham (bukan cuma kode jalan).
- **Boilerplate murni** (routing skeleton, migration scaffolding standar, styling, CRUD repetitif) boleh langsung digenerate — itu bukan yang biasanya ditanya saat interview.
- Kalau ragu suatu potongan kerja termasuk "logic kritis" atau "boilerplate", tanya dulu ke user daripada asumsi.
- Kalau mengerjakan fitur baru, cek dulu urutan prioritas di `PLANNING-LokaLiving.md` §3 & §5 supaya tidak keluar jalur fase.
- Update bagian **"Status Sekarang"** di file ini setiap kali menyelesaikan potongan kerja signifikan (komponen baru, halaman baru, integrasi baru) — supaya sesi berikutnya tetap akurat tanpa perlu re-scan seluruh repo.
