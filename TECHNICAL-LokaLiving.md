# Technical Document — Loka Living

Dokumen ini adalah spesifikasi teknis detail, turunan dari PRD + workflow-system.md. Isinya hal-hal yang langsung dipakai saat coding: struktur project, skema database, kontrak API, dan detail integrasi pihak ketiga.

---

## 1. Arsitektur Sistem

```
┌─────────────────┐         ┌──────────────────┐         ┌─────────────────┐
│   Next.js 14     │  REST   │   Laravel 11 API  │         │   PostgreSQL     │
│   (Vercel)       │◄───────►│   (Railway/VPS)   │◄───────►│                  │
└─────────────────┘         └──────────────────┘         └─────────────────┘
                                     │      │
                    ┌────────────────┘      └────────────────┐
                    ▼                                          ▼
          ┌──────────────────┐                       ┌──────────────────┐
          │  Redis            │                       │  Cloudflare R2    │
          │  (queue + cache)  │                       │  (asset storage)  │
          └──────────────────┘                       └──────────────────┘
                    │
       ┌────────────┼────────────┬────────────────┬──────────────────┐
       ▼            ▼            ▼                ▼                  ▼
  ┌─────────┐  ┌─────────┐  ┌───────────┐  ┌──────────────┐  ┌──────────────┐
  │ Midtrans │  │ Stripe   │  │ Google    │  │ Cargo API     │  │ WA Business / │
  │ (lokal)  │  │ (global) │  │ Maps      │  │ (JNE/Dakota)  │  │ Email (Resend)│
  └─────────┘  └─────────┘  └───────────┘  └──────────────┘  └──────────────┘
```

Prinsip: Next.js **tidak pernah** memanggil Midtrans/Stripe/Cargo API langsung dari client — semua lewat Laravel API supaya secret key aman & logika perhitungan harga/ongkir tervalidasi di server (lihat PRD §11.1).

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
│   └── api/                         # Route handlers (proxy tipis ke Laravel, jika perlu)
├── components/
│   ├── product/ (ProductCard, VariantSwatch, DimensionGuide, ModelViewer)
│   ├── checkout/ (AddressAutofill, ShippingOptions, DeliveryCalendar, PaymentSelector)
│   └── ui/ (Pill, Badge, RevealOnScroll)
├── lib/
│   ├── api-client.ts                # fetch wrapper ke Laravel API
│   ├── store/ (cart.ts — Zustand)
│   └── validation/ (checkout-schema.ts — Zod)
└── styles/globals.css               # design tokens dari design.md
```

### 2.2 Backend (`loka-living-api/`)
```
loka-living-api/
├── app/
│   ├── Http/Controllers/Api/
│   │   ├── ProductController.php
│   │   ├── CheckoutController.php
│   │   ├── ShippingController.php
│   │   ├── PaymentWebhookController.php
│   │   └── OrderController.php
│   ├── Models/ (Product, ProductVariant, Order, OrderItem, Address, PaymentTransaction, ShippingQuote)
│   ├── Services/
│   │   ├── Payment/ (MidtransService.php, StripeService.php, PaymentGatewayResolver.php)
│   │   ├── Shipping/ (CargoRateService.php)
│   │   └── Stock/ (StockReservationService.php)
│   ├── Jobs/ (ReleaseExpiredReservations.php, SendOrderConfirmation.php)
│   └── Events/Listeners/ (OrderPaid, OrderPaidNotifyWarehouse)
├── database/migrations/
└── routes/api.php
```

---

## 3. Skema Database (DDL Ringkas)

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
Reservasi stock awal saat user klik "Beli Langsung" atau "Checkout" dari cart.

**Request**
```json
{
  "items": [
    { "product_variant_id": "uuid", "qty": 1 }
  ]
}
```
**Response 200**
```json
{
  "order_token": "lk_9f2a...",
  "reserved_until": "2026-07-16T10:15:00Z",
  "items": [
    { "name": "Semilir Chair", "variant": "Mahogany", "unit_price": 2100000, "qty": 1 }
  ],
  "subtotal_amount": 2100000
}
```
**Response 409** (stok habis)
```json
{ "error": "OUT_OF_STOCK", "message": "Stok Semilir Chair varian Mahogany sudah habis." }
```

### 4.2 `POST /api/checkout/shipping-rate`
**Request**
```json
{
  "order_token": "lk_9f2a...",
  "address": {
    "full_address": "Jl. Contoh No. 1",
    "kelurahan": "...", "kecamatan": "...", "city": "...", "province": "...",
    "postal_code": "50000", "country": "ID",
    "latitude": -6.98, "longitude": 110.42
  }
}
```
**Response 200**
```json
{
  "options": [
    { "courier": "jne_trucking", "service_name": "JTR Reguler", "price": 350000, "eta_days": "3-5 hari" },
    { "courier": "deliveree", "service_name": "Same-day Truck", "price": 620000, "eta_days": "1 hari" }
  ],
  "available_delivery_dates": ["2026-07-20", "2026-07-21", "2026-07-22"]
}
```

### 4.3 `POST /api/checkout/confirm`
Finalisasi checkout, memicu pembuatan payment request ke Midtrans/Stripe.

**Request**
```json
{
  "order_token": "lk_9f2a...",
  "contact": { "email": "user@mail.com", "phone": "+6281234567890" },
  "address": { "...": "sama seperti di atas" },
  "shipping": { "courier": "jne_trucking", "delivery_date": "2026-07-20" },
  "wants_installation": true,
  "payment_method": "qris"
}
```
**Response 200**
```json
{
  "order_token": "lk_9f2a...",
  "total_amount": 2470000,
  "payment": {
    "gateway": "midtrans",
    "snap_token": "66e4fa55-...",
    "redirect_url": "https://app.sandbox.midtrans.com/snap/v2/vtweb/..."
  }
}
```

### 4.4 `POST /api/webhooks/midtrans`
Menerima notifikasi dari Midtrans. Body sesuai format Notification Midtrans (`order_id`, `transaction_status`, `signature_key`, dll). Backend **wajib** re-compute signature (`sha512(order_id + status_code + gross_amount + server_key)`) dan cocokkan sebelum lanjut memproses — lihat detail alur di `workflow-system.md` §5.

### 4.5 `POST /api/webhooks/stripe`
Menerima event dari Stripe (`payment_intent.succeeded`, dll). Verifikasi pakai `Stripe-Signature` header + webhook secret (`Stripe\Webhook::constructEvent()`).

### 4.6 `GET /api/orders/{order_token}`
Tracking order untuk guest — tidak butuh auth, cukup token yang benar (lihat workflow-system §8).

---

## 5. Detail Integrasi Pihak Ketiga

### 5.1 Midtrans (Snap API)
- Gunakan **Snap** (bukan Core API) untuk MVP — hosted payment page, mengurangi beban kepatuhan PCI-DSS di sisi kita.
- Flow: `POST /checkout/confirm` di backend → panggil `Snap::createTransaction()` dengan `order_id`, `gross_amount`, `item_details`, `customer_details` → dapat `token` & `redirect_url` → kirim ke frontend.
- Environment: `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`, `MIDTRANS_IS_PRODUCTION`.
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

- **Laravel**: PSR-12, `$fillable` eksplisit di semua model (lihat PRD §11.4), Form Request class untuk validasi tiap endpoint (`CheckoutConfirmRequest`, dst), Service class untuk logic bisnis (Controller tetap tipis).
- **Next.js**: App Router, Server Components untuk halaman yang tidak butuh interaktivitas berat (Home, Our Brand, About Us), Client Components hanya untuk bagian interaktif (swatch, filter, checkout form).
- **Naming**: `snake_case` untuk kolom DB & payload API, `camelCase` di TypeScript/JS.
- **Commit**: gunakan Conventional Commits (`feat:`, `fix:`, `chore:`) — memudahkan tracking progress per fase MVP.

---

## 7. Testing Strategy (Minimal Viable)

| Area | Jenis Test | Prioritas |
|---|---|---|
| `StockReservationService` | Unit test — pastikan `lockForUpdate()` mencegah oversell saat concurrent request | **Tinggi** |
| Webhook signature verification | Unit test — payload valid vs dipalsukan | **Tinggi** |
| `POST /checkout/confirm` | Feature test — total harga dihitung ulang di server, tidak percaya input frontend | **Tinggi** |
| Shipping rate calculation | Feature test dengan mock response Cargo API | Sedang |
| Checkout form (frontend) | E2E test (Playwright) — alur isi alamat sampai klik bayar | Sedang, bisa fase 2 |

Untuk solo developer, prioritaskan test di 3 area "Tinggi" dulu — itu yang paling berisiko kalau salah (duit & stok), sisanya boleh manual testing dulu di MVP.

---

## 8. Environment Variables (Ringkasan)

```
# Database
DATABASE_URL=

# Redis
REDIS_URL=

# Storage
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
