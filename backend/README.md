# Loka Living API

Backend e-commerce Loka Living: **Bun + Elysia + Drizzle ORM + PostgreSQL**, seluruhnya TypeScript.
Frontend (Next.js) ada di `../frontend` dan memanggil API ini lewat `NEXT_PUBLIC_API_URL` (default `http://localhost:8000/api`).

## Prasyarat

- [Bun](https://bun.sh) 1.x
- PostgreSQL 18 (lokal) dengan satu database kosong, mis. `loka_living_bun`

## Menjalankan

```bash
cd backend
cp .env.example .env        # lalu isi DATABASE_URL dan JWT_ACCESS_SECRET (minimal 32 karakter)
bun install
bun run db:migrate          # membuat tabel
bun run db:seed             # 8 produk, 10 varian, 4 ruangan, contoh testimoni
bun run dev                 # http://localhost:8000
```

Cek: `curl http://localhost:8000/health` → `{"status":"ok"}`. Dokumentasi interaktif semua endpoint (Swagger UI) ada di
`http://localhost:8000/swagger` selama `NODE_ENV` bukan `production`.

### Environment (`backend/.env`)

| Variabel | Keterangan |
|---|---|
| `PORT` | default 8000 |
| `DATABASE_URL` | wajib |
| `DATABASE_SSL` | `true` di production |
| `FRONTEND_URL` | origin yang diizinkan CORS, default `http://localhost:3000` |
| `JWT_ACCESS_SECRET` | wajib, minimal 32 karakter |
| `ACCESS_TOKEN_TTL_SECONDS`, `REFRESH_TOKEN_TTL_DAYS`, `COOKIE_SECURE` | masa berlaku token, cookie `Secure` di production |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` | login Google (kosong = nonaktif, endpoint menjawab 503) |
| `MIDTRANS_SERVER_KEY`, `MIDTRANS_CLIENT_KEY`, `MIDTRANS_IS_PRODUCTION` | pembayaran (kosong = `confirm` menjawab 503 `PAYMENT_CONFIG_MISSING`) |
| `TEST_DATABASE_URL` | opsional, database khusus test (lihat di bawah) |

Login Google: buat OAuth client "Web application" di Google Cloud Console dengan redirect URI
`http://localhost:8000/api/auth/google/callback`. Mulai alur dari `http://localhost:8000/api/auth/google` dengan host yang
sama persis dengan `GOOGLE_REDIRECT_URI` (memakai `127.0.0.1` alih-alih `localhost` membuat cookie state hilang →
`?error=google_state_mismatch`).

## Perintah

| Perintah | Fungsi |
|---|---|
| `bun run dev` | server dengan auto-reload |
| `bun run start` | server tanpa reload |
| `bun run db:generate` | membuat migrasi baru dari perubahan `src/db/schema` |
| `bun run db:migrate` | menjalankan migrasi |
| `bun run db:seed` | mengisi/menyegarkan katalog (aman diulang; stok varian yang sudah ada tidak ditimpa; ditolak di production kecuali `SEED_ALLOW_PRODUCTION=true`) |
| `bun test` | seluruh test (lihat di bawah) |
| `bunx tsc --noEmit -p .` | cek tipe |

## Test

```bash
bun test                         # semua
bun test tests/orders.test.ts    # satu file
```

- Test berjalan di **database terpisah**, `<nama database dev>_test` (atau `TEST_DATABASE_URL`). Database itu dibuat dan
  dimigrasi otomatis. Database development **tidak pernah disentuh**.
- Sebelum setiap file test, semua tabel dikosongkan lalu di-seed ulang (`useCleanDatabase()` di bagian atas file test).
  Nama database test wajib berakhiran `_test`; kalau tidak, test menolak berjalan.
- Midtrans tidak pernah dipanggil sungguhan. Test memakai `createApp({ enableJobs: false, deps: { midtrans: { createTransaction, serverKey } } })`.
- Jangan menjalankan dua `bun test` bersamaan (mis. dari dua folder/worktree): keduanya memakai database test yang sama
  dan saling menghapus data. Beri `TEST_DATABASE_URL` yang berbeda kalau perlu paralel.

## Struktur

```
src/
  app.ts            createApp(): semua route di /api, cron, Swagger
  config/env.ts     variabel environment
  db/               skema Drizzle, migrasi, seed
  lib/              AppError, crypto, rate-limit, order-token, uuid
  jobs/             job terjadwal (lepas reservasi kedaluwarsa, bersihkan refresh token)
  modules/          auth, catalog, shipping, account, checkout, payments, orders
tests/              bun test, satu file per modul + purchase-flow.test.ts (alur utuh)
```

Tiap modul: `*.routes.ts` (validasi + wiring), `*.service.ts` (logic bisnis), `*.docs.ts` (teks Swagger).
Detail kontrak API dan skema: `../TECHNICAL-LokaLiving.md`.

## Uji manual dengan frontend

1. Backend: langkah "Menjalankan" di atas (port 8000).
2. Frontend: `cd ../frontend && npm install && npm run dev` (port 3000).
3. Tanpa key Midtrans: Home, Collections, halaman produk, checkout sampai ongkir berjalan; **Bayar Sekarang** menampilkan pesan
   "Metode pembayaran sedang tidak tersedia." (503 `PAYMENT_CONFIG_MISSING`), dan order tetap `draft`.
4. Dengan key sandbox Midtrans (isi `MIDTRANS_SERVER_KEY` dan `MIDTRANS_CLIENT_KEY`):
   - **Bayar Sekarang** mengarahkan ke halaman Snap. Cek di sandbox bahwa QRIS muncul (`enabled_payments: ["other_qris"]`;
     kalau tidak muncul, coba `["qris"]` di `midtrans.service.ts`).
   - Midtrans tidak bisa memanggil `localhost`. Untuk menguji webhook nyata: `ngrok http 8000`, lalu isi
     **Payment Notification URL** di dashboard Midtrans sandbox dengan `https://<tunnel>/api/payment/webhook`, bayar lewat
     simulator sandbox, dan pastikan order menjadi `paid` (`GET /api/orders/<order_token>`).
5. Uji stok terakhir: buka dua tab, beli varian yang stoknya 1 bersamaan; hanya satu yang lolos `init`.

## Catatan operasional

- **Satu proses.** Job terjadwal (tiap menit melepas reservasi `draft` yang kedaluwarsa; harian membersihkan refresh token
  lama) berjalan di dalam proses server. Dengan beberapa instance, kunci `FOR UPDATE` tetap mencegah stok dilepas dua kali
  (hanya kerja dobel). Rate limit juga di memori per proses.
- **Di belakang reverse proxy**, alamat IP klien harus diteruskan dengan benar (`X-Forwarded-For`); rate limit memakai IP
  koneksi.
- `order_token` berfungsi seperti kata sandi pesanan tamu: jangan dicatat di log akses.
- Retensi `payment_transactions.raw_payload` (memuat data pembeli) belum ditentukan; tentukan sebelum production.
