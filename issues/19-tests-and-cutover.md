# 19 — Test kritis, uji dengan frontend, dan pindah ke backend baru

**Tipe:** test / chore · **Tergantung:** semua issue sebelumnya · **Label:** —

## Konteks

Backend baru dianggap selesai hanya kalau skenario uang & stok terbukti benar lewat test otomatis, dan frontend yang ada berjalan tanpa diubah.

## Tugas

### 1. Setup test
- Database terpisah: `CREATE DATABASE loka_living_bun_test;`, URL-nya di `TEST_DATABASE_URL`.
- Sebelum suite: jalankan migrasi ke DB test. Sebelum tiap test: `TRUNCATE ... RESTART IDENTITY CASCADE` semua tabel, lalu seed minimal (1–2 produk).
- Test memanggil app lewat `createApp({ enableJobs: false }).handle(new Request(...))`, tanpa membuka port.
- Midtrans **tidak boleh** dipanggil sungguhan di test. Buat `midtrans.service.ts` bisa diganti (misalnya `createApp` menerima `deps.midtrans`), lalu pakai versi palsu yang bisa diatur untuk sukses atau gagal.

### 2. Test wajib (`bun test`)

**Auth**
- [ ] register → login → `/me` sukses.
- [ ] login salah & email tidak terdaftar → response identik.
- [ ] refresh merotasi cookie. Memakai cookie lama lagi → `REFRESH_TOKEN_REUSED` dan cookie terbaru ikut mati.
- [ ] logout lalu refresh → 401.

**Katalog & landing page**
- [ ] list tidak berisi `stock_reserved`. Slug tidak ada → 404.
- [ ] tanpa parameter, list sama dengan perilaku lama; `featured`, `room`, `sort=newest`, `limit` bekerja.
- [ ] testimoni yang belum dipublikasikan tidak pernah muncul.

**Ongkir**
- [ ] `determineZone` untuk 6 contoh di issue 09.
- [ ] estimasi dan `checkout/shipping-rate` memberi harga sama untuk barang & alamat sama.
- [ ] estimasi tidak menulis apa pun ke database.

**Akun**
- [ ] cart merge idempoten (merge yang sama 2x → hasil sama), memakai `max`, melewati varian yang tidak ada.
- [ ] wishlist: tambah 2x → satu baris; hapus 2x → 204.
- [ ] alamat: selalu tepat satu alamat utama; hapus alamat utama → yang terbaru jadi utama.
- [ ] **akses silang:** user B tidak bisa membaca/mengubah keranjang, wishlist, alamat, atau pesanan user A (selalu 404 / data milik sendiri saja).

**Checkout**
- [ ] **Oversell:** stok 1, 5 × `init` paralel → tepat 1 sukses, stok akhir available 0 / reserved 1.
- [ ] Varian dobel di satu request tidak lolos cek stok.
- [ ] shipping-rate dengan `address_id` menyalin alamat; mengedit alamat tersimpan sesudahnya tidak mengubah alamat order.
- [ ] confirm: Midtrans palsu gagal → order tetap draft; Midtrans palsu sukses → `awaiting_payment` + 1 payment_transaction.
- [ ] confirm: `gross_amount` yang dikirim ke Midtrans palsu = subtotal + ongkir + instalasi, dan sama dengan Σ item_details.
- [ ] confirm paralel 2x → 1 sukses.

**Webhook** (buat helper `signedPayload(overrides)` yang menghitung signature dengan server key test)
- [ ] signature salah → 401.
- [ ] settlement → paid + stok commit.
- [ ] payload sama 2x → diproses sekali.
- [ ] deny lalu settlement → paid, stok tidak dilepas.
- [ ] settlement lalu expire → tetap paid.
- [ ] expire → expired + stok kembali.
- [ ] amount mismatch → 400, tidak ada perubahan.
- [ ] order akun jadi paid → varian yang dibeli hilang dari keranjang akun.

**Job**
- [ ] draft kedaluwarsa dilepas tepat sekali.

**Riwayat pesanan**
- [ ] `/orders` hanya berisi pesanan milik user, tanpa `draft`.
- [ ] pesanan tamu terbuka lewat token dengan data pribadi disamarkan; pesanan akun tidak terbuka lewat token saja.

### 3. Uji manual dengan frontend
1. `backend/`: `bun run db:migrate && bun run db:seed && bun run dev` (port 8000).
2. `frontend/`: `npm run dev`. `NEXT_PUBLIC_API_URL` tetap `http://localhost:8000/api`.
3. Cek tanpa mengubah kode frontend:
   - [ ] Home, Collections, PDP menampilkan produk & varian.
   - [ ] Checkout: init → isi alamat Jakarta Selatan → ongkir muncul dengan tarif zona 1.
   - [ ] Bayar Sekarang tanpa key Midtrans → pesan error tampil normal (bukan `[object Object]`).
   - [ ] (dengan key sandbox) Bayar Sekarang → diarahkan ke Snap. Bayar lewat simulator sandbox + tunnel webhook → order `paid` di DB.
   - [ ] 2 tab browser membeli stok terakhir bersamaan → hanya 1 yang lolos init.
   - Endpoint baru (ruangan, testimoni, estimasi ongkir, keranjang akun, wishlist, alamat, riwayat pesanan) belum dipakai frontend. Uji dengan `curl` atau Postman sampai halaman frontend-nya dibuat.

### 4. Dokumentasi & merge
- [ ] Update `CLAUDE.md`: §2 Arsitektur (Elysia + Bun + Drizzle, bukan Laravel), §3 Status Sekarang (backend baru, daftar endpoint auth, cara menjalankan), dan hapus catatan cara kerja yang khusus Laravel (`php artisan`).
- [ ] Update `TECHNICAL-LokaLiving.md`: struktur folder backend & kontrak API auth.
- [ ] `backend/README.md` singkat: install, env, migrate, seed, dev, test.
- [ ] Buka PR `rework/elysia-bun-backend` → `main`, dengan hasil `bun test` di deskripsi.

## Acceptance Criteria

- [ ] `bun test` hijau semua.
- [ ] Semua checklist uji manual lulus (yang butuh key Midtrans boleh ditandai "menunggu key" kalau key masih sengaja dikosongkan).
- [ ] Tidak ada perubahan di folder `frontend/` untuk endpoint yang sudah ada.
- [ ] `CLAUDE.md` tidak lagi menyebut Laravel sebagai backend aktif.
