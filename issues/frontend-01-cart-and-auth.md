# Frontend — Login, register, dan keranjang (keranjang wajib login)

**Tipe:** feature · **Tergantung:** issue 04, 05, 06 (auth) dan 10 (API keranjang), semuanya sudah selesai · **Label:** —

## Konteks

Backend sudah siap: register/login/refresh/logout/me, login Google, dan `GET/PUT/DELETE /api/cart`. Frontend belum punya halaman login/register, `/auth/callback`, dan halaman keranjang. Tombol "Keranjang" di navbar belum melakukan apa pun, dan keranjang masih memakai `localStorage` lewat `frontend/src/lib/cartStore.ts`.

Aturan produk (diputuskan bersama):
- Lihat produk dan estimasi ongkir: **tanpa login**.
- **Keranjang wajib login.** Tamu yang menekan "Tambah ke Keranjang" atau tombol "Keranjang" diarahkan ke login/register dulu.
- "Beli Sekarang" tetap jalur tamu (`/checkout?vid=&qty=`), tidak lewat keranjang.

```
Tamu klik "Tambah ke Keranjang"
  ─► simpan pilihan sementara (variantId, qty, halaman asal) di sessionStorage
  ─► /login?next=<halaman asal>
  ─► login berhasil ─► jalankan pilihan tertunda (PUT /api/cart/items/:variantId)
  ─► kembali ke halaman asal, toast "Ditambahkan ke keranjang"
```

## Tugas

### Sesi (auth store)
- `lib/authStore.ts` (zustand, **tidak** disimpan ke storage): `status` (`unknown` | `guest` | `authenticated`), `accessToken`, `user`.
- **Access token hanya di memori.** Refresh token ada di cookie httpOnly (tidak terbaca JavaScript). Menyimpan access token di `localStorage` membuatnya bisa dicuri lewat XSS.
- `AuthProvider` di `app/layout.tsx`: saat halaman dibuka, pulihkan sesi lewat `POST /api/auth/refresh` (`credentials: "include"`). Gagal/tidak ada cookie → `guest`.
- Penanda ringan `loka-has-session` di `localStorage` (bukan rahasia) supaya pengunjung yang tidak pernah login tidak memanggil `/refresh` setiap halaman dibuka.

### Klien HTTP
- `lib/http.ts`: `apiFetch` menambahkan `Authorization: Bearer`, dan kalau 401 mencoba `/refresh` **sekali** lalu mengulang permintaan; gagal → sesi dihapus.
- **Refresh harus satu-satu (single-flight).** Backend memakai rotasi refresh token dan *reuse detection*: dua `/refresh` bersamaan dengan cookie yang sama membuat yang kedua dianggap pencurian dan **seluruh sesi dicabut**. Maka: (1) satu permintaan refresh yang sedang berjalan dipakai bersama (promise), dan (2) antar-tab diserialkan dengan Web Locks API (`navigator.locks`) bila tersedia. Tanpa ini, React Strict Mode (efek jalan dua kali di dev) dan dua tab yang dibuka bersamaan bisa mengeluarkan user sendiri.

### Halaman
- `/login`: email + password, tombol "Masuk dengan Google" (`GET {API}/auth/google`, halaman penuh, bukan fetch), tautan ke register. Pesan error dari server (`INVALID_CREDENTIALS`, `TOO_MANY_REQUESTS`, dll.).
- `/register`: nama, email, password (8–72 karakter, sama dengan backend), validasi dengan react-hook-form + zod, tautan ke login. `EMAIL_TAKEN` ditampilkan di field email.
- `/auth/callback`: tujuan balik login Google. Ada `?error=<kode>` → tampilkan pesan yang ramah (kode: `google_state_mismatch`, `google_access_denied`, `google_exchange_failed`, `google_email_unverified`, `google_email_invalid`, `google_account_conflict`, `google_account_disabled`, `google_login_failed`, `google_auth_disabled`) dengan tautan kembali ke login. Tanpa error → `POST /refresh`, simpan sesi, jalankan pilihan tertunda, arahkan ke halaman tujuan.
- `/cart` (wajib login; tamu diarahkan ke `/login?next=/cart`): daftar barang (foto, nama, bahan, harga satuan, subtotal), ubah jumlah (− / +), hapus, `subtotal_amount`, barang `is_available: false` ditandai ("Stok tidak mencukupi" / "Tidak tersedia") dan tidak dihitung, keranjang kosong dengan tautan ke koleksi.
- Tombol "Lanjut ke Checkout" di keranjang **dinonaktifkan dengan keterangan** sampai `checkout/init` dari keranjang tersedia (issue 13). Checkout yang ada hanya mendukung satu barang lewat `?vid=&qty=`.

### Keranjang
- Ganti `cartStore.ts` (localStorage) dengan store yang sinkron dengan `/api/cart`: `load`, `add` (qty sekarang + 1, maksimal 99), `setQty`, `remove`, `reset`. Data keranjang **tidak** disimpan di storage.
- Hook `useAddToCart()`: dipakai 5 tempat tombol "Tambah ke Keranjang" (`ProductCard`, `BaruTiba`, `Sorotan`, `PdpOverlay`, `products/[slug]`). Belum login → simpan pilihan tertunda + arahkan ke login; sudah login → `PUT` lalu toast.
- Pilihan tertunda disimpan di `sessionStorage` (bukan localStorage: hanya untuk tab itu dan hilang saat tab ditutup), dibaca sekali lalu dihapus sebelum dijalankan supaya tidak berulang.

### Navbar
- Tombol "Keranjang": sudah login → `/cart`; belum → `/login?next=/cart`. Badge = `item_count` dari server (0 untuk tamu).
- Tamu melihat tautan "Masuk"; user login melihat namanya dan tombol "Keluar" (`POST /api/auth/logout`, sesi dan keranjang di memori dikosongkan).

### Keamanan dan kualitas
- Parameter `next` hanya boleh berupa path internal (diawali `/`, bukan `//` atau `/\`), supaya tidak bisa dipakai sebagai *open redirect* setelah login.
- Tombol submit dinonaktifkan selama request berjalan (cegah kirim ganda).
- Hormati `prefers-reduced-motion` (sudah global lewat `MotionConfig`); tanpa animasi baru yang berlebihan.
- Mengikuti `design.md`: CTA utama warna olive, tombol pill, tidak memakai `--wood` untuk CTA.

## Di luar scope
- Checkout dari keranjang (butuh issue 13) dan pembersihan keranjang setelah bayar (issue 16).
- Wishlist, alamat tersimpan, riwayat pesanan.
- Lupa password / verifikasi email.
- Masa tenggang (grace window) refresh token di backend untuk menangani dua tab yang me-refresh persis bersamaan. Frontend memakai kunci antar-tab sebagai mitigasi.

## Acceptance Criteria

- [ ] Tamu menekan "Tambah ke Keranjang" → diarahkan ke `/login?next=<halaman asal>`; setelah login (email/password maupun Google) barangnya sudah ada di keranjang dan user kembali ke halaman asal.
- [ ] Tombol "Keranjang" di navbar: tamu → halaman login, user login → `/cart`; badge menunjukkan jumlah dari server.
- [ ] `/cart` tanpa login → diarahkan ke `/login?next=/cart`.
- [ ] Register dan login berjalan; error server tampil jelas (email sudah terdaftar, kredensial salah, terlalu banyak percobaan).
- [ ] `/auth/callback?error=google_access_denied` menampilkan pesan dan tautan ke login.
- [ ] Muat ulang halaman → sesi tetap (via `/refresh`); Keluar → sesi hilang dan `/cart` kembali meminta login.
- [ ] Ubah jumlah dan hapus di `/cart` memperbarui subtotal; barang tidak tersedia ditandai dan tidak dihitung.
- [ ] Access token tidak ada di `localStorage`/`sessionStorage`; data keranjang tidak disimpan di storage.
- [ ] Membuka dua tab bersamaan atau React Strict Mode tidak mengeluarkan user (tidak ada `REFRESH_TOKEN_REUSED` di log backend).
- [ ] `next=https://situs-lain.com` atau `next=//situs-lain.com` diabaikan (tujuan jatuh ke `/`).
- [ ] `tsc --noEmit`, `next lint`, dan `next build` bersih.
