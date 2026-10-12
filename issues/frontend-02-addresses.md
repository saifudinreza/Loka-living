# Frontend — Buku alamat (halaman "Alamat Saya")

**Tipe:** feature · **Tergantung:** issue 12 (API buku alamat), issue 09 (daftar provinsi), dan frontend-01 (login dan sesi), yang terakhir sudah selesai · **Label:** —

## Konteks

User yang login bisa menyimpan beberapa alamat (Rumah, Kantor, dst), memilih satu sebagai alamat utama, mengubah, dan menghapusnya. Backend-nya adalah issue 12 (`GET/POST /api/addresses`, `PATCH/DELETE /api/addresses/:id`). Issue ini membuat halaman dan komponennya di frontend.

Ada satu masalah yang sudah ada di frontend dan harus dibereskan bersamaan, karena form alamat butuh daftar provinsi yang sama: dropdown provinsi di `app/checkout/page.tsx` **ditulis manual** (Jawa Barat, Jawa Tengah, …, **"Jakarta"**) dan hanya sebagian provinsi. Backend menghitung zona ongkir dari nama provinsi yang persis ada di `GET /api/shipping/provinces` (38 provinsi, termasuk `DKI Jakarta`); `"Jakarta"` tidak ada di daftar itu sehingga tarifnya salah. Dropdown harus mengambil daftar dari API, bukan menulis sendiri.

Semua endpoint alamat wajib login. Halaman ini memakai fondasi dari frontend-01: `apiFetch({ withAuth: true })`, `useAuthStore`, dan komponen form di `components/AuthUi.tsx`.

## Tugas

### Halaman `/account/addresses`
- Wajib login: tamu diarahkan ke `/login?next=%2Faccount%2Faddresses` (sama seperti `/cart`). Selama status sesi masih `unknown`, tampilkan keadaan memuat, jangan langsung mengalihkan.
- Daftar kartu alamat: label, nama penerima, telepon, alamat lengkap (kelurahan, kecamatan, kota, provinsi, kode pos), lencana **"Utama"** pada alamat utama. Alamat utama selalu paling atas (urutan dari server, jangan diurutkan ulang di klien).
- Aksi per alamat: **Jadikan utama** (hanya pada yang bukan utama; `PATCH { is_default: true }`), **Ubah**, **Hapus** (dengan konfirmasi).
- Tidak ada aksi "lepas status utama": user yang punya alamat harus punya satu alamat utama, jadi cara pindahnya adalah menjadikan alamat lain utama.
- Tombol **Tambah alamat** dan penghitung `n/10`. Saat sudah 10, tombol dinonaktifkan dengan keterangan; pesan `ADDRESS_LIMIT_REACHED` dari server tetap ditampilkan kalau tetap terjadi (mis. dari tab lain).
- Keadaan kosong: ajakan menambah alamat pertama ("alamat pertama otomatis menjadi utama").
- Setelah **menghapus alamat utama**, muat ulang daftar dari server: server yang memutuskan alamat mana yang menjadi utama berikutnya, jangan dihitung di klien.

### Form tambah / ubah alamat
Dialog (modal) atau panel, dengan react-hook-form + zod yang **mencerminkan aturan backend** (issue 12):

| Field | Aturan |
|---|---|
| `label` | 1–40 karakter |
| `recipient_name` | 1–120, wajib |
| `phone` | 8–20 karakter, hanya angka, `+`, spasi, `-`; minimal 8 digit; wajib |
| `full_address` | 5–500, wajib |
| `province` | wajib, dipilih dari dropdown daftar provinsi API |
| `city` | **wajib**, 1–80 (zona ongkir Jabodetabek bergantung pada nama kota) |
| `kecamatan`, `kelurahan` | opsional, maks 80 |
| `postal_code` | opsional, tepat 5 digit |
| `is_default` | kotak centang (alamat pertama otomatis utama, kotak centang bisa dikunci aktif) |

- Teks di-`trim`; isian yang hanya spasi dianggap kosong.
- Mode ubah mengirim hanya field yang berubah; mengosongkan field opsional dikirim sebagai `null`.
- Kesalahan dari server tampil di tempatnya: `422 VALIDATION_FAILED` sebagai pesan umum di form, `ADDRESS_NOT_FOUND` (alamat sudah dihapus di tab lain) → tutup form dan muat ulang daftar.
- Tombol simpan dinonaktifkan selama request berjalan; fokus berpindah ke dialog saat dibuka, kembali ke pemicunya saat ditutup; tombol Escape menutup dialog.

### Daftar provinsi dari API
- Hook `useProvinces()` memuat `GET /api/shipping/provinces` **sekali** (hasil dan promise-nya dibagi di tingkat modul, respons backend di-cache 1 hari), dengan keadaan memuat dan gagal (bisa dicoba lagi). Dipakai oleh form alamat **dan** checkout.
- **Ganti dropdown provinsi tulis-manual di `app/checkout/page.tsx` dengan daftar dari hook ini.** Menghapus opsi `"Jakarta"`.

### Store alamat
- `lib/addressStore.ts` (zustand, **tidak** disimpan ke storage browser karena berisi data pribadi): `addresses`, `load`, `create`, `update`, `setDefault`, `remove`, `reset`.
- Respons yang terlambat tidak boleh menimpa yang lebih baru: pola nomor permintaan seperti di `cartStore`.
- Dikosongkan saat keluar (`reset` dipanggil dari `logout`, seperti keranjang).

### Navigasi
- Navbar: user yang login melihat tautan **"Alamat"** (menuju `/account/addresses`) di dekat namanya. Tamu tidak melihatnya.

### Kualitas
- Mengikuti `design.md`: CTA utama warna olive berbentuk pill, `--wood` tidak dipakai untuk CTA; hormati `prefers-reduced-motion`.
- Label terhubung ke input, `aria-invalid` dan pesan `role="alert"` pada kesalahan, dialog memakai `role="dialog"` dan `aria-modal`.
- Data alamat (nama, telepon, alamat) tidak boleh ditulis ke `localStorage`/`sessionStorage` maupun ke log konsol.

## Di luar scope
- **Pemilih alamat tersimpan di checkout** dan tombol "simpan alamat ini" saat checkout: menunggu `checkout/shipping-rate` (issue 14) dan `checkout/init` (issue 13) di backend, yang belum ada. Dikerjakan setelah itu.
- Wishlist (issue 11 sudah selesai di backend): frontend terpisah.
- Pratinjau ongkir per alamat.

## Acceptance Criteria

- [ ] Tamu membuka `/account/addresses` → diarahkan ke `/login?next=%2Faccount%2Faddresses`, dan setelah login kembali ke halaman itu.
- [ ] Menambah alamat pertama → muncul dengan lencana "Utama". Menambah alamat kedua dengan "jadikan utama" → lencana pindah, tetap hanya satu "Utama".
- [ ] "Jadikan utama" pada alamat lain memindahkan lencana. Tidak ada tombol untuk melepas status utama.
- [ ] Menghapus alamat utama → daftar dimuat ulang dan alamat terbaru yang tersisa menjadi "Utama" (sesuai server).
- [ ] Alamat ke-10 bisa ditambahkan, setelah itu tombol Tambah nonaktif dan `n/10` benar.
- [ ] Dropdown provinsi berisi 38 provinsi dari API (ada `DKI Jakarta` dan `Papua Barat Daya`, tidak ada `"Jakarta"`); dropdown provinsi di checkout memakai daftar yang sama.
- [ ] `city` kosong, telepon berisi huruf, kode pos 4 digit, atau nama hanya spasi → pesan validasi di form sebelum request dikirim.
- [ ] Mengubah alamat → hanya field yang berubah dikirim; mengosongkan `kecamatan` mengirim `null`.
- [ ] Alamat dihapus di tab lain lalu diubah di tab ini → form tertutup dan daftar dimuat ulang tanpa error mentah.
- [ ] Keluar → daftar alamat dihapus dari memori; membuka halaman lagi sebagai tamu → diarahkan ke login.
- [ ] Tidak ada data alamat di `localStorage`/`sessionStorage`.
- [ ] `tsc --noEmit`, `next lint` (0 error), dan `next build` bersih; uji di browser untuk alur utama (tambah, jadikan utama, ubah, hapus, batas 10).
