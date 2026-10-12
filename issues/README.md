# Migrasi Backend Loka Living: Laravel → Elysia.js + Bun + Drizzle

Folder ini berisi issue untuk menulis ulang backend Loka Living. Setiap file adalah satu issue yang bisa dikerjakan terpisah oleh programmer junior atau AI model. Kerjakan **berurutan sesuai nomor**, karena issue berikutnya bergantung pada yang sebelumnya.

## Stack baru

| Bagian | Pilihan |
|---|---|
| Runtime | Bun |
| Framework HTTP | Elysia.js (TypeScript) |
| ORM | Drizzle ORM, driver `postgres` (postgres.js), migrasi lewat `drizzle-kit` |
| Database | PostgreSQL (sudah terinstall, versi 18) |
| Validasi request | `t` bawaan Elysia (TypeBox) |
| Auth | JWT access token + refresh token (disimpan di DB, dikirim lewat cookie httpOnly) + Google OAuth |
| Pembayaran | Midtrans Snap, dipanggil langsung lewat `fetch` (tanpa SDK) |
| Job terjadwal | Plugin cron Elysia, satu proses dengan server |

Frontend (Next.js + Tailwind di `frontend/`) **tidak boleh perlu diubah** untuk endpoint yang sudah ada. Frontend memanggil backend lewat `NEXT_PUBLIC_API_URL` (default `http://localhost:8000/api`). Backend baru harus jalan di port `8000` dengan prefix `/api`. Bentuk request/response endpoint lama harus sama persis dengan backend Laravel; field baru boleh **ditambahkan**, tidak boleh mengubah atau menghapus field lama.

## Alur produk yang didukung backend ini

Loka Living adalah toko satu brand dengan produk sedikit. Prioritasnya: halaman produk yang lengkap, ongkir yang jelas sejak awal, dan pembeli yang bisa bertanya dulu. Filter yang rumit tidak dibutuhkan.

### Landing page (urutan dari atas ke bawah)

| Bagian | Sumber data | Issue |
|---|---|---|
| Hero pendek: satu kalimat identitas brand + tombol "Lihat koleksi" | Statis di frontend | — |
| Kategori per ruangan (ruang tamu, kamar tidur, dapur & ruang makan, ruang kerja) | `GET /api/rooms` | 07 |
| Produk unggulan / terbaru | `GET /api/products?featured=true` dan `?sort=newest&limit=8` | 07 |
| Cerita brand: bahan, proses pembuatan, material berkelanjutan | Statis di frontend | — |
| Testimoni & foto pelanggan | `GET /api/testimonials` | 08 |
| Footer: info pengiriman, garansi, kontak WhatsApp | Statis di frontend; nomor WA dari `NEXT_PUBLIC_WHATSAPP_NUMBER` | — |

### Halaman produk

- Detail lengkap: dimensi, bahan & proses, cara perawatan, garansi, foto konteks ruangan (`GET /api/products/:slug`, issue 07).
- Estimasi ongkir **sebelum** masuk keranjang/checkout, karena ongkir barang besar adalah penyebab utama keranjang ditinggal (`POST /api/shipping/estimate`, issue 09).
- Tombol "Tanya via WhatsApp": link `https://wa.me/<nomor>?text=<nama produk + varian>` dibuat di frontend, tanpa backend.

### Kapan login diminta

| Fitur | Tanpa login | Dengan login |
|---|---|---|
| Lihat produk, estimasi ongkir | Ya | Ya |
| Keranjang | Ya, disimpan di `localStorage` browser | Disimpan di akun; isi keranjang browser **digabung** ke akun saat login (issue 10) |
| Checkout | Ya, sebagai tamu (wajib menurut PRD) | Ya, order tercatat di akun, bisa pakai alamat tersimpan |
| Riwayat pesanan | Hanya lewat link berisi `order_token` | Daftar semua pesanan (issue 18) |
| Wishlist | Tidak | Ya (issue 11) |
| Simpan alamat | Tidak | Ya (issue 12) |

## Ringkasan API

Semua endpoint ada di bawah `/api`. 🔒 = wajib login (header `Authorization: Bearer <access_token>`).

| Method | Path | Gunanya | Issue |
|---|---|---|---|
| POST | `/api/auth/register` | Daftar akun email + password | 04 |
| POST | `/api/auth/login` | Masuk, dapat access token + cookie refresh token | 04 |
| GET 🔒 | `/api/auth/me` | Data user yang sedang login | 05 |
| POST | `/api/auth/refresh` | Tukar cookie refresh token dengan access token baru | 05 |
| POST | `/api/auth/logout` | Cabut refresh token, hapus cookie | 05 |
| GET | `/api/auth/google` | Mulai login Google | 06 |
| GET | `/api/auth/google/callback` | Google mengembalikan user ke sini | 06 |
| GET | `/api/rooms` | Daftar kategori ruangan | 07 |
| GET | `/api/products` | Daftar produk (filter `room`, `featured`, `sort`, `limit`) | 07 |
| GET | `/api/products/:slug` | Detail produk | 07 |
| GET | `/api/testimonials` | Testimoni yang sudah dipublikasikan | 08 |
| GET | `/api/shipping/provinces` | Daftar provinsi untuk dropdown alamat | 09 |
| POST | `/api/shipping/estimate` | Estimasi ongkir tanpa membuat order | 09 |
| GET 🔒 | `/api/cart` | Isi keranjang akun | 10 |
| PUT 🔒 | `/api/cart/items/:variantId` | Set jumlah satu barang (0 = hapus) | 10 |
| DELETE 🔒 | `/api/cart/items/:variantId` | Hapus satu barang | 10 |
| POST 🔒 | `/api/cart/merge` | Gabungkan keranjang browser ke akun setelah login | 10 |
| GET 🔒 | `/api/wishlist` | Daftar wishlist | 11 |
| POST 🔒 | `/api/wishlist` | Tambah produk ke wishlist | 11 |
| DELETE 🔒 | `/api/wishlist/:productId` | Hapus dari wishlist | 11 |
| GET 🔒 | `/api/addresses` | Daftar alamat tersimpan | 12 |
| POST 🔒 | `/api/addresses` | Tambah alamat | 12 |
| PATCH 🔒 | `/api/addresses/:id` | Ubah alamat / jadikan utama | 12 |
| DELETE 🔒 | `/api/addresses/:id` | Hapus alamat | 12 |
| POST | `/api/checkout/init` | Mulai checkout: tahan stok, buat order draft | 13 |
| POST | `/api/checkout/shipping-rate` | Simpan alamat order, hitung ongkir | 14 |
| POST | `/api/checkout/confirm` | Hitung total final, buat transaksi Midtrans | 15 |
| POST | `/api/payment/webhook` | Notifikasi pembayaran dari Midtrans | 16 |
| GET 🔒 | `/api/orders` | Riwayat pesanan user | 18 |
| GET | `/api/orders/:token` | Detail pesanan (tamu lewat token; pesanan akun wajib login) | 18 |
| GET | `/health` | Cek server hidup | 01 |

**Format error** (sama untuk semua endpoint, kompatibel dengan frontend yang membaca `json.error` sebagai teks):
```json
{ "error": "Stok KSR-RLN-01 tidak mencukupi. Tersedia: 1, diminta: 2", "code": "STOCK_INSUFFICIENT" }
```

## Ringkasan database

PostgreSQL, semua primary key UUID (dibuat database lewat `gen_random_uuid()`), semua uang dalam rupiah sebagai bilangan bulat (`bigint`), tanpa desimal.

| Tabel | Isi |
|---|---|
| `users` | Akun pembeli (email/password atau Google) |
| `refresh_tokens` | Hash refresh token aktif per perangkat login |
| `rooms` | Kategori ruangan untuk landing page (ruang tamu, kamar tidur, dst) |
| `products` | Katalog produk, termasuk penanda unggulan, foto konteks ruangan, bahan, perawatan, garansi |
| `product_rooms` | Produk mana cocok untuk ruangan mana (satu produk bisa di beberapa ruangan) |
| `product_variants` | Varian (material/warna), harga, stok tersedia & stok ditahan |
| `testimonials` | Testimoni pelanggan, hanya tampil kalau `is_published` |
| `cart_items` | Keranjang milik akun (keranjang tamu tidak disimpan di DB) |
| `wishlist_items` | Produk yang disimpan user |
| `user_addresses` | Buku alamat user (bisa diubah kapan saja) |
| `addresses` | Salinan alamat **saat order dibuat** (tidak ikut berubah kalau alamat tersimpan diedit) |
| `orders` | Satu checkout, dari `draft` sampai `paid` |
| `order_items` | Barang di order dengan harga snapshot saat beli |
| `shipping_quotes` | Penawaran ongkir untuk order, berlaku 30 menit |
| `payment_transactions` | Tiap percobaan bayar ke Midtrans + payload asli |
| `order_status_logs` | Riwayat perubahan status order |
| `processed_webhooks` | Penanda webhook yang sudah diproses (anti dobel) |

Dua angka stok di `product_variants`:
- `stock_available`: masih bisa dibeli.
- `stock_reserved`: sedang ditahan untuk order yang belum dibayar.

`checkout/init` memindahkan stok dari available ke reserved. Kalau order kedaluwarsa atau batal, stok dikembalikan. Kalau order dibayar, stok reserved dikurangi (barang terjual). **Keranjang dan wishlist tidak menahan stok.**

## Aturan umum (berlaku untuk SEMUA issue)

1. **Kerjakan di branch `rework/elysia-bun-backend`.** Jangan commit langsung ke `main`. Kode Laravel lama tetap bisa dilihat lewat `git show bf3765d:backend/...`.
2. **TypeScript strict.** Tidak boleh ada `any` kecuali di payload webhook mentah (pakai `unknown` lalu dipersempit).
3. **Credential hanya di `.env`.** Jangan pernah menulis secret di kode. Setiap variabel baru wajib ditambahkan ke `backend/.env.example` dengan nilai kosong.
4. **Jangan percaya harga, total, atau status dari client.** Semua angka uang dihitung ulang dari database.
5. **Jangan pernah mengirim pesan error internal ke client** (stack trace, pesan SQL, pesan dari Midtrans). Detail hanya masuk log (`console.error`).
6. **Data milik user hanya boleh diakses pemiliknya.** Kalau user A meminta data milik user B (alamat, order, keranjang), jawab **404**, bukan 403, supaya keberadaan data tidak bocor.
7. **Perubahan skema = migrasi baru** lewat `bun run db:generate`. Jangan edit file migrasi yang sudah dijalankan.
8. **Commit per issue**, format Conventional Commits: `feat(auth): ...`, `feat(cart): ...`, `chore(db): ...`.
9. Issue berlabel **[LOGIC KRITIS]** menyangkut uang, stok, atau keamanan. Pemilik proyek sedang belajar logic ini untuk persiapan interview, jadi **tanyakan dulu ke pemilik proyek** sebelum mengerjakan issue berlabel ini.
10. Kalau kode Laravel lama dan issue ini berbeda, **ikuti issue ini**. Beberapa bug Laravel sengaja diperbaiki di sini (ditandai "Beda dari Laravel").

## Urutan issue

| No | File | Isi | Label |
|---|---|---|---|
| 01 | [01-setup-project.md](01-setup-project.md) | Branch, hapus Laravel, init Bun + Elysia, struktur folder, env, CORS, error handler | — |
| 02 | [02-database-schema.md](02-database-schema.md) | Skema Drizzle untuk 17 tabel + migrasi | — |
| 03 | [03-seed-data.md](03-seed-data.md) | Seed produk, ruangan, produk unggulan, contoh testimoni, **dan foto produk** | — |
| 04 | [04-auth-register-login.md](04-auth-register-login.md) | Hash password, JWT, refresh token, `/register`, `/login` | [LOGIC KRITIS] |
| 05 | [05-auth-me-refresh-logout.md](05-auth-me-refresh-logout.md) | Guard auth, `/me`, `/refresh` (rotasi), `/logout` | [LOGIC KRITIS] |
| 06 | [06-auth-google.md](06-auth-google.md) | Login Google | [LOGIC KRITIS] |
| 07 | [07-api-catalog.md](07-api-catalog.md) | Ruangan, daftar produk (unggulan/terbaru/per ruangan), detail produk | — |
| 08 | [08-api-testimonials.md](08-api-testimonials.md) | Testimoni untuk landing page & halaman produk | — |
| 09 | [09-api-shipping-estimate.md](09-api-shipping-estimate.md) | Tabel tarif zona, daftar provinsi, estimasi ongkir sebelum checkout | — |
| 10 | [10-api-cart.md](10-api-cart.md) | Keranjang akun + gabung keranjang browser saat login | — |
| 11 | [11-api-wishlist.md](11-api-wishlist.md) | Wishlist | — |
| 12 | [12-api-saved-addresses.md](12-api-saved-addresses.md) | Buku alamat user | — |
| 13 | [13-api-checkout-init.md](13-api-checkout-init.md) | Reservasi stok + order draft | [LOGIC KRITIS] |
| 14 | [14-api-checkout-shipping-rate.md](14-api-checkout-shipping-rate.md) | Alamat order (baru atau tersimpan) + ongkir | — |
| 15 | [15-api-checkout-confirm.md](15-api-checkout-confirm.md) | Total final + Midtrans Snap | [LOGIC KRITIS] |
| 16 | [16-api-payment-webhook.md](16-api-payment-webhook.md) | Webhook Midtrans + signature + status | [LOGIC KRITIS] |
| 17 | [17-job-release-reservations.md](17-job-release-reservations.md) | Job tiap menit melepas stok order kedaluwarsa | [LOGIC KRITIS] |
| 18 | [18-api-orders.md](18-api-orders.md) | Riwayat & detail pesanan | [LOGIC KRITIS] |
| 19 | [19-tests-and-cutover.md](19-tests-and-cutover.md) | Test kritis, uji dengan frontend, update dokumentasi | — |

Setelah 01–05 selesai, issue 07, 08, 09, 11, 12 tidak saling bergantung dan bisa dikerjakan paralel.

## Pekerjaan frontend yang menyusul (di luar issue backend ini)

- Susun ulang landing page sesuai urutan di atas (hero pendek, ruangan, unggulan/terbaru, cerita brand, testimoni, footer).
- Halaman login, register, dan `/auth/callback` (untuk Google).
- Panggil `POST /api/cart/merge` setelah login berhasil, lalu kosongkan keranjang `localStorage`.
- Widget estimasi ongkir di halaman produk dan keranjang.
- Tombol "Tanya via WhatsApp" di halaman produk.
- Halaman wishlist, buku alamat, riwayat pesanan.

## Di luar scope

- Panel admin (testimoni, produk, ruangan diisi lewat seed atau SQL dulu).
- Upload foto ke penyimpanan (Cloudflare R2). Untuk sekarang foto berupa URL.
- Pilihan e-wallet, status bayar realtime, dan cancel oleh pembeli. Dikerjakan setelah migrasi selesai.
- Stripe, notifikasi email/WhatsApp otomatis, Redis.
