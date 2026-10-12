# Technical Document — Loka Living

Dokumen ini adalah spesifikasi teknis detail, turunan dari PRD + workflow-system.md. Isinya hal-hal yang langsung dipakai saat coding: struktur project, skema database, kontrak API, dan detail integrasi pihak ketiga.

---

## 1. Arsitektur Sistem

```
┌─────────────────┐         ┌───────────────────────┐         ┌─────────────────┐
│   Next.js 14     │  REST   │  Bun + Elysia API      │         │   PostgreSQL 18  │
│   (Vercel)       │◄───────►│  (port 8000, /api)     │◄───────►│  (Drizzle ORM)   │
└─────────────────┘         └───────────────────────┘         └─────────────────┘
                                     │
       ┌────────────┬────────────────┼──────────────────┬──────────────────┐
       ▼            ▼                ▼                  ▼                  ▼
  ┌─────────┐  ┌─────────┐   ┌─────────────┐   ┌──────────────┐   ┌──────────────┐
  │ Midtrans │  │ Google   │   │ Cron (satu   │   │ Stripe        │   │ Cargo API /   │
  │ Snap     │  │ OAuth    │   │ proses)      │   │ (Fase 2)      │   │ WA / Email    │
  │ (aktif)  │  │ (aktif)  │   │ (aktif)      │   │ (belum)       │   │ (belum)       │
  └─────────┘  └─────────┘   └─────────────┘   └──────────────┘   └──────────────┘
```

**Status implementasi (MVP):** Midtrans Snap, login Google, dan job terjadwal sudah berjalan. Stripe, API cargo
sungguhan (sekarang tabel tarif zona), notifikasi WhatsApp/email, Redis, dan Cloudflare R2 belum dipakai: foto
produk berupa URL statis dan tarif ongkir dihitung dari tabel zona di `shipping-rate.service.ts`.

Backend dulu ditulis dengan Laravel 11, lalu dipindah ke Bun + Elysia + Drizzle supaya seluruh stack TypeScript.
Kode Laravel lama hanya bisa dilihat lewat `git show bf3765d:backend/...`.

Prinsip: Next.js **tidak pernah** memanggil Midtrans/Stripe/Cargo API langsung dari client — semua lewat backend supaya secret key aman & logika perhitungan harga/ongkir tervalidasi di server (lihat PRD §11.1).

---

## 2. Struktur Project

### 2.1 Frontend (`loka-living-web/`)
```
loka-living-web/
├── app/
│   ├── (marketing)/
│   │   ├── page.tsx                 # Home
│   │   ├── about-us/page.tsx
│   │   ├── our-brand/page.tsx
│   │   └── contact-us/page.tsx
│   ├── collections/
│   │   ├── page.tsx                 # Listing + filter
│   │   └── [slug]/page.tsx          # Product Detail Page
│   ├── checkout/
│   │   ├── page.tsx                 # Single-screen checkout
│   │   └── confirmation/[orderToken]/page.tsx
│   ├── cart/page.tsx
│   └── api/                         # Route handlers (proxy tipis ke backend, jika perlu)
├── components/
│   ├── product/ (ProductCard, VariantSwatch, DimensionGuide, ModelViewer)
│   ├── checkout/ (AddressAutofill, ShippingOptions, DeliveryCalendar, PaymentSelector)
│   └── ui/ (Pill, Badge, RevealOnScroll)
├── lib/
│   ├── api-client.ts                # fetch wrapper ke API backend
│   ├── store/ (cart.ts — Zustand)
│   └── validation/ (checkout-schema.ts — Zod)
└── styles/globals.css               # design tokens dari design.md
```

### 2.2 Backend (`backend/`)
```
backend/
├── src/
│   ├── index.ts                  # menjalankan server (port 8000)
│   ├── app.ts                    # createApp({ enableJobs, deps }): semua route di bawah /api, cron, Swagger (non-production)
│   ├── config/env.ts             # membaca & memvalidasi variabel environment
│   ├── db/
│   │   ├── client.ts             # koneksi postgres.js + Drizzle
│   │   ├── schema/               # tabel (catalog, users, orders, payments, relations, enums)
│   │   ├── migrations/           # SQL hasil drizzle-kit (jangan diedit setelah dijalankan)
│   │   ├── seed.ts, seed-checks.ts
│   ├── lib/                      # errors (AppError + format {error, code}), crypto, rate-limit, order-token, uuid
│   ├── jobs/release-expired-reservations.ts
│   └── modules/
│       ├── auth/                 # register, login, refresh (rotasi), logout, Google OAuth, guard requireAuth/optionalAuth
│       ├── catalog/              # rooms, products, testimonials
│       ├── shipping/             # tabel tarif zona, provinsi, estimasi ongkir
│       ├── account/              # cart, wishlist, addresses (wajib login)
│       ├── checkout/             # init (+ reservasi stok), shipping-rate, confirm
│       ├── payments/             # midtrans.service (Snap), webhook.routes, signature, payment-status.service
│       └── orders/               # riwayat & detail pesanan
├── tests/                        # bun test; setup.ts (database test), db-reset.ts, satu file per modul
├── drizzle.config.ts
└── bunfig.toml                   # preload tests/setup.ts
```

Pola tiap modul: `*.routes.ts` (validasi TypeBox + wiring), `*.service.ts` (logic bisnis, tanpa tahu HTTP), `*.docs.ts` (teks Swagger).

---

## 3. Skema Database (DDL Ringkas)

> DDL di bawah adalah gambaran awal (saat perencanaan). **Sumber kebenaran skema adalah `backend/src/db/schema/` dan migrasinya di `backend/src/db/migrations/`.** Beberapa hal sudah berbeda, misalnya tabel `user_addresses`, `cart_items`, `wishlist_items`, `refresh_tokens`, `rooms`, dan `testimonials` yang tidak ada di sini.

```sql
-- PRODUCTS
CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(150) NOT NULL,
  slug VARCHAR(160) UNIQUE NOT NULL,
  category VARCHAR(50) NOT NULL,        -- chairs | tables | cabinets | shelves
  description TEXT,
  length_cm DECIMAL(6,1),
  width_cm DECIMAL(6,1),
  height_cm DECIMAL(6,1),
  weight_kg DECIMAL(6,2) NOT NULL,      -- wajib untuk hitung ongkir kargo
  model_3d_url VARCHAR(255),
  status VARCHAR(20) DEFAULT 'active',  -- active | draft | archived
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- PRODUCT VARIANTS
CREATE TABLE product_variants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID REFERENCES products(id) ON DELETE CASCADE,
  material VARCHAR(80),
  color_hex VARCHAR(7),
  price_idr BIGINT NOT NULL,
  price_usd DECIMAL(10,2) NOT NULL,
  compare_at_price_idr BIGINT,          -- harga coret
  stock_available INT NOT NULL DEFAULT 0,
  stock_reserved INT NOT NULL DEFAULT 0, -- dikunci saat checkout berlangsung
  sku VARCHAR(50) UNIQUE,
  image_urls JSONB,                     -- array gambar per varian
  created_at TIMESTAMP DEFAULT now()
);

-- ADDRESSES
CREATE TABLE addresses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_name VARCHAR(120),
  phone VARCHAR(20),
  full_address TEXT NOT NULL,
  kelurahan VARCHAR(80),
  kecamatan VARCHAR(80),
  city VARCHAR(80),
  province VARCHAR(80),
  postal_code VARCHAR(10),
  country VARCHAR(2) DEFAULT 'ID',      -- ISO code, dipakai untuk routing Midtrans/Stripe
  latitude DECIMAL(10,7),
  longitude DECIMAL(10,7),
  created_at TIMESTAMP DEFAULT now()
);

-- ORDERS
CREATE TABLE orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_token VARCHAR(64) UNIQUE NOT NULL,  -- untuk guest tracking, bukan sequential ID
  guest_email VARCHAR(150),
  guest_phone VARCHAR(20),
  address_id UUID REFERENCES addresses(id),
  status VARCHAR(30) NOT NULL DEFAULT 'draft',
  -- draft | awaiting_payment | paid | processing | scheduled | shipped | installed | completed | cancelled | expired | refunded
  subtotal_amount BIGINT NOT NULL,
  shipping_amount BIGINT NOT NULL DEFAULT 0,
  installation_amount BIGINT NOT NULL DEFAULT 0,
  total_amount BIGINT NOT NULL,
  currency VARCHAR(3) NOT NULL DEFAULT 'IDR',
  payment_gateway VARCHAR(20),          -- midtrans | stripe
  scheduled_delivery_date DATE,
  wants_installation BOOLEAN DEFAULT false,
  reserved_until TIMESTAMP,             -- TTL reservasi stock, lihat workflow-system §4
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);

-- ORDER ITEMS
CREATE TABLE order_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  product_variant_id UUID REFERENCES product_variants(id),
  qty INT NOT NULL DEFAULT 1,
  unit_price BIGINT NOT NULL,
  subtotal BIGINT NOT NULL
);

-- SHIPPING QUOTES (cache hasil rate cargo)
CREATE TABLE shipping_quotes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  courier VARCHAR(30),                  -- jne_trucking | dakota | deliveree
  service_name VARCHAR(60),
  price BIGINT,
  eta_days VARCHAR(20),
  raw_response JSONB,                   -- simpan payload asli untuk audit
  expires_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT now()
);

-- PAYMENT TRANSACTIONS
CREATE TABLE payment_transactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  gateway VARCHAR(20) NOT NULL,          -- midtrans | stripe
  gateway_transaction_id VARCHAR(120),
  gateway_payment_method VARCHAR(40),    -- qris | va_bca | credit_card | paypal | kredivo, dst
  status VARCHAR(30) NOT NULL,           -- pending | settlement | expired | failed | refunded
  amount BIGINT NOT NULL,
  raw_payload JSONB,
  created_at TIMESTAMP DEFAULT now()
);

-- PROCESSED WEBHOOKS (idempotency, lihat workflow-system §5)
CREATE TABLE processed_webhooks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  gateway VARCHAR(20) NOT NULL,
  event_id VARCHAR(150) UNIQUE NOT NULL,
  processed_at TIMESTAMP DEFAULT now()
);

-- ORDER STATUS AUDIT LOG
CREATE TABLE order_status_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID REFERENCES orders(id) ON DELETE CASCADE,
  from_status VARCHAR(30),
  to_status VARCHAR(30) NOT NULL,
  actor VARCHAR(30),                    -- system | webhook | admin:{id}
  note TEXT,
  created_at TIMESTAMP DEFAULT now()
);
```

**Index penting:** `orders(order_token)`, `orders(status, reserved_until)` (buat job `ReleaseExpiredReservations`), `product_variants(product_id)`, `payment_transactions(order_id)`, `processed_webhooks(event_id)`.

---

## 4. Kontrak API (Request/Response)

### 4.1 `POST /api/checkout/init`
Menahan stok 30 menit dan membuat order `draft`. Login opsional (tamu boleh). Harga selalu dari database.

**Request**
```json
{ "items": [ { "product_variant_id": "uuid", "qty": 1 } ] }
```
**Response 200** (`Cache-Control: no-store`)
```json
{
  "order_token": "kqW3...43 karakter acak...Zx9",
  "reserved_until": "2026-07-16T10:15:00.000Z",
  "items": [
    { "product_variant_id": "uuid", "product_name": "Kursi Santai Rukun", "sku": "KSR-RLN-01", "material": "Rotan & Linen",
      "color_hex": "#C99A66", "qty": 1, "unit_price": 2450000, "subtotal": 2450000, "image_url": "/images/products/ksr-rln-01-1.jpg" }
  ],
  "subtotal_amount": 2450000,
  "currency": "IDR"
}
```
**Error:** 422 `STOCK_INSUFFICIENT` (pesan memuat nama produk dan bahan), `VARIANT_NOT_FOUND`, `VALIDATION_FAILED`, `TOO_MANY_PENDING_ORDERS` (maks 5 draft aktif per user login); 429 (maks 10 permintaan/menit per IP).

### 4.2 `POST /api/checkout/shipping-rate`
Menyimpan alamat kirim order (salinan) dan menghitung ongkir dari tabel tarif zona. Alamat diisi dengan **tepat salah satu**: `address` (baru) atau `address_id` (dari buku alamat, wajib login).

**Request**
```json
{
  "order_token": "...",
  "address": {
    "full_address": "Jl. Contoh No. 1",
    "recipient_name": "Budi", "phone": "081234567890",
    "kelurahan": "...", "kecamatan": "...", "city": "Jakarta Selatan", "province": "DKI Jakarta",
    "postal_code": "12345", "country": "ID", "latitude": -6.26, "longitude": 106.81
  },
  "save_address": false
}
```
Hanya `full_address` yang wajib. `save_address: true` (login) menyimpan alamat ke buku alamat.

**Response 200**
```json
{
  "options": [
    { "courier": "jne_trucking", "service_name": "JTR Reguler", "price": 66000, "eta_days": "2-3 hari" }
  ],
  "available_delivery_dates": ["2026-07-17", "2026-07-18", "2026-07-19", "2026-07-20", "2026-07-21", "2026-07-22", "2026-07-23"]
}
```
Quote disimpan 30 menit dan **harga inilah yang dipakai `confirm`**, bukan angka dari browser. **Error:** 404 `ORDER_NOT_FOUND` (tidak ada, bukan draft, atau milik user lain), 410 `RESERVATION_EXPIRED`, 404 `ADDRESS_NOT_FOUND`, 401, 422, 429.

### 4.3 `POST /api/checkout/confirm`
Menghitung total final dari database dan membuat transaksi Midtrans Snap. Midtrans dipanggil di dalam transaksi database: kalau gagal, order tetap `draft` dan bisa dicoba lagi. Dua permintaan bersamaan untuk order yang sama: satu 200, satu 404.

**Request**
```json
{
  "order_token": "...",
  "contact": { "email": "user@mail.com", "phone": "081234567890" },
  "shipping": { "courier": "jne_trucking", "delivery_date": "2026-07-18" },
  "wants_installation": false,
  "payment_method": "qris"
}
```
`payment_method`: `qris` | `va_bca` | `credit_card`. Tamu wajib mengisi `contact.email`; user login boleh mengosongkannya. `delivery_date` opsional, harus salah satu `available_delivery_dates`. **Tidak ada field total/ongkir**: semua dihitung ulang server (subtotal order + quote ongkir + instalasi Rp150.000 bila `wants_installation`).

**Response 200**
```json
{
  "order_token": "...",
  "total_amount": 2516000,
  "payment": { "gateway": "midtrans", "snap_token": "66e4fa55-...", "redirect_url": "https://app.sandbox.midtrans.com/snap/v4/redirection/..." }
}
```
Order berubah ke `awaiting_payment` dan jendela bayar 30 menit dimulai (`reserved_until` diperpanjang, sama dengan `expiry` Snap).

| Kondisi | Status | code |
|---|---|---|
| Order tidak ada / bukan draft / milik user lain | 404 | `ORDER_NOT_FOUND` |
| Reservasi lewat | 410 | `RESERVATION_EXPIRED` |
| Belum ada alamat | 422 | `ADDRESS_REQUIRED` |
| Kurir tidak ada di quote / quote kedaluwarsa | 422 | `SHIPPING_QUOTE_INVALID` |
| `MIDTRANS_SERVER_KEY` kosong | 503 | `PAYMENT_CONFIG_MISSING` |
| Midtrans error / timeout | 502 | `MIDTRANS_UNAVAILABLE` |

Pesan error ke user tidak pernah memuat teks dari Midtrans.

### 4.4 `POST /api/payment/webhook`
Menerima notifikasi dari Midtrans (publik, tanpa CORS/limiter karena dipanggil server Midtrans). Urutan:
1. Field wajib (`order_id`, `status_code`, `gross_amount`, `signature_key`, `transaction_status`, `transaction_id`) — kurang → 400.
2. Signature: `sha512(order_id + status_code + gross_amount + server_key)` dari string **mentah**, dibandingkan waktu-konstan. Salah, bukan hex, atau server key kosong → 401 `INVALID_SIGNATURE`.
3. Dalam satu transaksi DB: idempotency (`transaction_id:transaction_status` di `processed_webhooks`), kunci order `FOR UPDATE`, cek `gross_amount` = `total_amount` (beda → 400 `AMOUNT_MISMATCH`), upsert `payment_transactions`, lalu ubah status order bila transisinya sah.

| `transaction_status` | Order | Stok |
|---|---|---|
| `settlement`, `capture`+`accept` | `paid` | commit (`stock_reserved -= qty`) |
| `expire` / `cancel` | `expired` / `cancelled` | release (reserved → available) |
| `refund`, `partial_refund` | `refunded` | — |
| `deny`, `pending`, `authorize`, `capture`+`challenge` | tetap | — |

Transisi sah: `awaiting_payment` → `paid`/`expired`/`cancelled`; `paid` → `refunded`. Uang masuk untuk order yang sudah expired/cancelled tidak mengubah order, tetapi dicatat sebagai log KRITIS di `order_status_logs` (perlu refund manual). Status pembayaran di `payment_transactions` hanya boleh maju (notifikasi terlambat tidak menimpa).

### 4.5 `POST /api/webhooks/stripe` (Fase 2, belum diimplementasi)
Menerima event dari Stripe (`payment_intent.succeeded`, dll). Verifikasi pakai `Stripe-Signature` header + webhook secret.

### 4.6 Pesanan
- `GET /api/orders` (login): daftar pesanan user, tanpa `draft`. Query `status`, `page`, `limit` (1–50). Respons `{ data: [{ order_token, status, created_at, total_amount, item_count, first_item }], meta: { page, limit, total } }`.
- `GET /api/orders/:token` (login opsional): detail. **Pesanan tamu** (`user_id` kosong) terbuka untuk siapa pun yang punya token, dengan email dan telepon disamarkan. **Pesanan akun** hanya untuk pemiliknya yang login; token saja tidak cukup. Semua penolakan = 404 `ORDER_NOT_FOUND` dengan body identik. Maksimal 60 permintaan/menit per IP.

### 4.7 Auth
| Method | Path | Keterangan |
|---|---|---|
| POST | `/api/auth/register` | body `{ email, password, name }` → 201 |
| POST | `/api/auth/login` | → 200; salah password dan email tak terdaftar memberi respons identik |
| GET 🔒 | `/api/auth/me` | data user |
| POST | `/api/auth/refresh` | menukar cookie refresh dengan access token baru (rotasi; token lama dipakai lagi → `REFRESH_TOKEN_REUSED` dan seluruh keluarga token dicabut) |
| POST | `/api/auth/logout` | mencabut refresh token, hapus cookie (204) |
| GET | `/api/auth/google`, `/api/auth/google/callback` | login Google |

Respons register/login: `{ token_type: "Bearer", expires_in: 900, access_token, user }`. Access token (JWT) dikirim sebagai `Authorization: Bearer <token>`; refresh token hanya berupa cookie `refresh_token` (`HttpOnly`, `SameSite=Lax`, `Path=/api/auth`), dan database hanya menyimpan hash-nya. 🔒 = wajib login.

### 4.8 Endpoint lain
| Method | Path | Login |
|---|---|---|
| GET | `/api/rooms`, `/api/products`, `/api/products/:slug`, `/api/testimonials` | tidak |
| GET / POST | `/api/shipping/provinces`, `/api/shipping/estimate` | tidak |
| GET / PUT / DELETE | `/api/cart`, `/api/cart/items/:variantId` | wajib |
| GET / POST / DELETE | `/api/wishlist`, `/api/wishlist/:productId` | wajib |
| GET / POST / PATCH / DELETE | `/api/addresses`, `/api/addresses/:id` | wajib |
| GET | `/health` | tidak |

**Format error** (semua endpoint): `{ "error": "pesan untuk user", "code": "KODE_TETAP" }`. Frontend membaca `json.error` sebagai teks. Pesan error tidak pernah memuat stack trace, pesan SQL, atau pesan dari Midtrans.

Dokumentasi interaktif lengkap (Swagger) tersedia di mode development: `http://localhost:8000/swagger`.

---

## 5. Detail Integrasi Pihak Ketiga

### 5.1 Midtrans (Snap API)
- Gunakan **Snap** (bukan Core API) untuk MVP — hosted payment page, mengurangi beban kepatuhan PCI-DSS di sisi kita.
- Flow: `POST /checkout/confirm` di backend → panggil `POST /snap/v1/transactions` (lewat `fetch`, tanpa SDK) dengan `order_id`, `gross_amount`, `item_details`, `customer_details` → dapat `token` & `redirect_url` → kirim ke frontend.
- Environment: `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`, `MIDTRANS_IS_PRODUCTION`. Item `SHIPPING` dan `INSTALLATION` ikut dikirim: Midtrans menolak transaksi bila jumlah `price × quantity` semua item tidak sama dengan `gross_amount`. `order_id` = `order_token` (maks 50 karakter).
- **Amount harus integer IDR**, tidak ada desimal.

### 5.2 Stripe
- Gunakan **Payment Intents API** + Stripe Checkout (hosted) untuk konsistensi dengan pendekatan Midtrans Snap (sama-sama hosted, mengurangi kompleksitas PCI).
- Flow: backend buat `PaymentIntent` atau `Checkout Session` dengan `amount` (dalam cents/USD), `currency`, `metadata.order_token` → `client_secret`/`url` dikirim ke frontend.
- Environment: `STRIPE_SECRET_KEY`, `STRIPE_PUBLISHABLE_KEY`, `STRIPE_WEBHOOK_SECRET`.

### 5.3 Google Maps Platform
- **Places Autocomplete API** untuk suggestion alamat saat user mengetik.
- **Geocoding API** untuk convert alamat terpilih → koordinat (lat/lng), dan **reverse geocoding** kalau user drag pin manual di map.
- Autocomplete sebaiknya dipanggil langsung dari frontend (client-side, pakai API key dengan domain restriction) untuk latensi rendah — bukan lewat backend, karena ini bukan data sensitif.
- Environment: `NEXT_PUBLIC_GOOGLE_MAPS_API_KEY` (restricted by HTTP referrer).

### 5.4 Cargo Shipping API
- Perlu dicek satu per satu (lihat PRD §8 — risiko terbuka) apakah JNE Trucking/Dakota/Deliveree expose API publik dengan API key self-service, atau butuh partnership manual (approval bisnis dulu).
- **Rencana fallback MVP**: kalau API publik belum bisa diakses, buat `CargoRateService` dengan interface yang sama tapi implementasi awal berupa tabel rate manual (berdasarkan zona kota + berat), supaya checkout tetap jalan sambil proses integrasi API asli berlangsung paralel.
- Cache hasil rate di `shipping_quotes` dengan `expires_at` (mis. 30 menit) — supaya tidak call API berulang untuk kombinasi produk+alamat yang sama dalam window singkat.

### 5.5 WhatsApp/Email Notification
- Order confirmation dikirim via **Resend/SendGrid** (email) dan opsional **WhatsApp Business API** (jika sudah approved Meta Business).
- Trigger: job `SendOrderConfirmation` yang di-dispatch dari listener event `OrderPaid`.

---

## 6. Konvensi & Standar Kode

- **Backend (Elysia)**: TypeScript strict; validasi request dengan TypeBox (`t`) di route; logic bisnis di `*.service.ts` (route tetap tipis); semua angka uang bilangan bulat rupiah (`bigint`); error lewat `AppError(status, code, message)`; perubahan skema = migrasi baru lewat `bun run db:generate`, jangan edit migrasi yang sudah dijalankan; data milik user yang diminta orang lain dijawab 404 (bukan 403).
- **Next.js**: App Router, Server Components untuk halaman yang tidak butuh interaktivitas berat (Home, Our Brand, About Us), Client Components hanya untuk bagian interaktif (swatch, filter, checkout form).
- **Naming**: `snake_case` untuk kolom DB & payload API, `camelCase` di TypeScript/JS.
- **Commit**: gunakan Conventional Commits (`feat:`, `fix:`, `chore:`) — memudahkan tracking progress per fase MVP.

---

## 7. Testing

`bun test` di `backend/`. Test berjalan di **database terpisah** (`<nama database dev>_test`, atau `TEST_DATABASE_URL`): dibuat dan dimigrasi otomatis oleh `tests/setup.ts`, dan sebelum setiap file test semua tabel dikosongkan lalu di-seed ulang (`useCleanDatabase()`). Nama database test wajib berakhiran `_test`; selain itu test menolak berjalan. Midtrans tidak pernah dipanggil sungguhan: `createApp({ deps: { midtrans: { createTransaction, serverKey } } })` menyuntikkan versi palsu.

| Area | Yang dibuktikan | Berkas |
|---|---|---|
| Reservasi stok | 5 `init` paralel untuk stok 1 → tepat 1 sukses; tanpa deadlock; varian dobel digabung | `checkout-init.test.ts` |
| Confirm | total dihitung ulang di server; Midtrans gagal → order tetap draft; confirm paralel → 1 sukses | `checkout-confirm.test.ts` |
| Webhook | signature salah/bukan hex → 401; idempotensi; deny→settlement; settlement→expire; amount mismatch | `payment-webhook.test.ts` |
| Job | draft kedaluwarsa dilepas tepat sekali; awaiting_payment/paid tidak tersentuh; satu order gagal tidak menghentikan yang lain | `release-expired-reservations.test.ts` |
| Pesanan & akses | pesanan akun hanya untuk pemilik; pesanan tamu disamarkan; 404 identik | `orders.test.ts`, `purchase-flow.test.ts` |
| Alur utuh | init → shipping-rate → confirm → webhook → riwayat; akses silang antar user | `purchase-flow.test.ts` |
| Auth, katalog, ongkir, akun | satu file per modul | `auth*.test.ts`, `catalog.test.ts`, `shipping.test.ts`, `cart/wishlist/addresses.test.ts` |

Belum ada: test E2E browser (Playwright) untuk alur checkout di frontend, dan uji nyata ke sandbox Midtrans (butuh key dan tunnel untuk webhook; lihat `backend/README.md`).

---

## 8. Environment Variables (Ringkasan)

```
# Backend (backend/.env, lihat backend/.env.example)
PORT=8000
DATABASE_URL=
DATABASE_SSL=false
TEST_DATABASE_URL=          # opsional; default: <nama database>_test
FRONTEND_URL=http://localhost:3000
JWT_ACCESS_SECRET=          # minimal 32 karakter
ACCESS_TOKEN_TTL_SECONDS=900
REFRESH_TOKEN_TTL_DAYS=30
COOKIE_SECURE=false          # WAJIB true di production (server menolak start)
TRUSTED_PROXY_HOPS=0         # jumlah reverse proxy tepercaya di depan server
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_REDIRECT_URI=

# Belum dipakai (rencana)
REDIS_URL=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET=

# Payment
MIDTRANS_SERVER_KEY=
MIDTRANS_CLIENT_KEY=
MIDTRANS_IS_PRODUCTION=
STRIPE_SECRET_KEY=
STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=

# Maps & Shipping
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=
CARGO_API_KEY=

# Notification
RESEND_API_KEY=
WHATSAPP_BUSINESS_TOKEN=

# App
APP_URL=
NEXT_PUBLIC_API_URL=
```

Semua secret **hanya** di backend `.env` kecuali yang eksplisit ditandai `NEXT_PUBLIC_*` (Google Maps client key — memang perlu terekspos ke browser, makanya wajib domain-restricted di Google Cloud Console).
