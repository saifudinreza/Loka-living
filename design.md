# Design.md — Alamrupa Visual & Motion System

Dokumen ini merangkum sistem desain (visual + animasi) untuk Alamrupa, diturunkan dari referensi layout homepage ("Inspired by Nature") dan referensi animasi produk (Tidyfolk product page). Dipakai sebagai acuan tunggal saat build UI, baik manual maupun lewat AI coding agent.

---

## 1. Prinsip Desain

- **Warm & organic, bukan generic e-commerce.** Nuansa eco/wood-tone, bukan e-commerce dingin ala marketplace umum.
- **Tipografi besar sebagai hero**, bukan gambar/banner promosi. Headline adalah elemen visual utama tiap section.
- **Motion sebagai kepercayaan, bukan hiasan.** Setiap animasi punya fungsi: FLIP transition memberi kontinuitas spasial (user tidak "hilang arah" saat klik produk), crossfade swatch memberi kepastian visual sebelum beli, scroll-reveal memberi ritme baca yang tenang.
- **Restraint.** Satu momen animasi per interaksi, tidak ditumpuk. Hindari efek dekoratif yang tidak melayani keputusan beli.

---

## 2. Design Tokens

### 2.1 Warna

| Token | Hex | Penggunaan |
|---|---|---|
| `--bg` | `#FAF7F1` | Background utama (warm cream) |
| `--bg-soft` | `#F2EEE4` | Background section alternatif |
| `--card` | `#F5F1E8` | Background card produk |
| `--ink` | `#1B1A16` | Teks utama, headline |
| `--ink-soft` | `#6E6A5E` | Teks sekunder, deskripsi, meta |
| `--olive` | `#5F6B45` | Aksen utama — tombol primer, filter aktif |
| `--olive-dark` | `#4A5436` | Hover state dari `--olive` |
| `--wood` | `#C99A66` | Aksen dekoratif (elemen kayu, swatch default) |
| `--line` | `#E4DFD1` | Border tipis, divider |

Prinsip pemakaian warna: **1 warna aksen dominan (olive)** untuk semua CTA & state aktif. Wood-tone (`--wood`) dipakai terbatas untuk elemen dekoratif/swatch, bukan CTA, supaya tidak berebut perhatian dengan olive.

### 2.2 Tipografi

- **Display/Headline**: sans-serif grotesque, bold (600–700), `letter-spacing: -0.03em`, `line-height: 0.92`. Dipakai di semua `<h1>`/`<h2>` section — ukuran besar (`clamp(36px, 6vw, 120px)` tergantung level hierarki).
- **Body**: sans-serif reguler, ukuran 13–15px, `color: var(--ink-soft)` untuk teks deskriptif; `color: var(--ink)` untuk teks fungsional (harga, nama produk).
- **Label/Button**: 11.5–13px, bold (600–700), `letter-spacing: 0.02–0.06em`, uppercase khusus untuk badge produk (mis. "LIMITED EDITION").

Skala type: Headline besar → sub-headline section (30–64px) → body (14–15px) → meta/label (11–13px). Jangan pakai lebih dari 4 tingkat ukuran per halaman.

### 2.3 Layout & Spacing

- Grid utama: `padding: 5vw` di kiri-kanan tiap section (bukan max-width fixed container), supaya layout tetap "napas" di layar lebar.
- Radius: `18–28px` untuk card/gambar besar (`--radius: 22px` standar), `999px` (pill) untuk semua tombol/filter.
- Jarak antar section: `96px` vertikal (desktop), turun ke `64px` di mobile.
- Product grid: 4 kolom (desktop) → 2 kolom (tablet ≤980px) → 2 kolom rapat (mobile ≤620px, gap diperkecil).

### 2.4 Komponen Kunci

**Pill button** — bentuk dasar semua CTA & filter:
- Default: border 1px `--ink`, transparent, radius penuh.
- Hover: background `--ink`, teks jadi `--bg`, `translateY(-2px)`.
- Solid variant: background `--olive`, dipakai untuk CTA utama ("Shop Now", "Add to cart").
- Active/filter state: background `--olive`.

**Product card**:
- Gambar aspect-ratio 1:1.05, radius 18px, overflow hidden.
- Badge (mis. "Limited Edition") — pill kecil, background putih semi-transparan + blur, posisi absolute top-left.
- Harga: harga lama dicoret (`--ink-soft`, lebih kecil) + harga baru bold di sebelahnya.

**Hotspot bubble** (dipakai di hero) — lingkaran kecil semi-transparan dengan blur, memunculkan label pill saat di-hover, dengan delay transisi halus.

---

## 3. Spesifikasi Animasi

Referensi: video produk Tidyfolk (28 detik) — animasi yang diadaptasi ke Alamrupa:

### 3.1 Navbar Shrink on Scroll
- **Trigger**: `scrollY > 40px`
- **Perubahan**: padding vertikal navbar mengecil (26px → 14px), background dari transparan jadi `rgba(bg, 0.92)` + `backdrop-filter: blur(10px)`, muncul `box-shadow` tipis.
- **Durasi**: `.35s ease`

### 3.2 Hover Zoom — Product Card
- **Trigger**: hover pada card produk.
- **Perubahan**: gambar `transform: scale(1.08)`, tombol "Add to cart" yang semula `opacity:0; translateY(10px)` menjadi `opacity:1; translateY(0)`.
- **Durasi/easing**: gambar `.6s cubic-bezier(.19,1,.22,1)` (ease-out lambat, terasa "berat" sesuai material furniture), tombol `.3s ease`.

### 3.3 FLIP Transition — Klik Produk ke Halaman Detail
Ini animasi paling penting dari referensi (transisi shared-element saat klik produk).

- **Prinsip**: gambar di card **tidak hilang lalu muncul ulang** di halaman detail — posisi & ukurannya di-"jembatani" secara visual.
- **Teknis**: First-Last-Invert-Play (FLIP)
  1. Ukur posisi & ukuran gambar sumber (card yang diklik).
  2. Render overlay detail dengan gambar di posisi natural-nya.
  3. Ukur posisi natural tersebut, hitung selisih (translate + scale) dari posisi sumber.
  4. Set transform awal = selisih tadi (tanpa transisi), lalu di frame berikutnya animasikan transform kembali ke `translate(0,0) scale(1,1)`.
- **Durasi/easing**: `.6s cubic-bezier(.19,1,.22,1)`.
- **Catatan implementasi**: kalau stack menggunakan React, ini bisa diganti dengan `layoutId` dari Framer Motion untuk hasil yang sama dengan kode lebih ringkas.

### 3.4 Crossfade — Material/Color Swatch
- **Trigger**: klik swatch warna/material di halaman detail produk atau spotlight section.
- **Perubahan**: gambar aktif `opacity: 0 → 1`, gambar sebelumnya sebaliknya (ditumpuk secara absolute, bukan digeser).
- **Durasi**: `.5s ease` (detail produk), `.22s ease` (spotlight — lebih cepat karena elemen lebih kecil di layar).

### 3.5 Scroll Reveal
- **Trigger**: `IntersectionObserver`, `threshold: 0.15`.
- **Perubahan**: `opacity: 0 → 1`, `translateY: 28px → 0`.
- **Durasi/easing**: `.8s cubic-bezier(.19,1,.22,1)`.
- **Staggering**: elemen dalam grup yang sama diberi delay bertingkat (`.08s`, `.16s`, `.24s`, `.32s`) supaya muncul berurutan, bukan serentak.
- **Aturan**: animasi trigger sekali saja (`unobserve` setelah `in-view`), tidak berulang tiap scroll naik-turun.

### 3.6 Hotspot Label (Hero)
- **Trigger**: hover pada hotspot bubble.
- **Perubahan**: label pill `opacity: 0 → 1`, `translateY: 6px → 0`.
- **Durasi**: `.25s ease`.

### 3.7 Aksesibilitas Motion
Semua animasi di atas **wajib** dinonaktifkan (durasi mendekati 0) saat `prefers-reduced-motion: reduce` terdeteksi — termasuk FLIP transition, yang harus fallback ke perpindahan halaman instan tanpa transform.

---

## 4. Responsive Behavior

| Breakpoint | Perubahan utama |
|---|---|
| Desktop (>980px) | Grid 4 kolom, hero 3 kolom (sub-teks / elemen dekoratif kayu / CTA), spotlight 2 kolom |
| Tablet (≤980px) | Grid 2 kolom, hero jadi 1 kolom (elemen dekoratif kayu disembunyikan), spotlight jadi 1 kolom (gambar background, panel teks di atasnya) |
| Mobile (≤620px) | Grid tetap 2 kolom tapi gap diperkecil, padding section dari 96px → 64px |

FLIP transition & hover-zoom tetap aktif di tablet, tapi di mobile hover-zoom sebaiknya di-skip (tidak ada hover state di touch device) — cukup tap langsung memicu FLIP transition ke halaman detail.

---

## 5. Referensi Implementasi

Sistem desain ini sudah diimplementasikan di `alamrupa.html` (prototype HTML/CSS/JS murni). Saat porting ke Next.js:

- Token warna & tipografi → pindahkan ke `tailwind.config` atau CSS variables di `globals.css`.
- FLIP transition → ganti dengan Framer Motion `layoutId` pada elemen gambar produk.
- Scroll reveal → ganti dengan Framer Motion `whileInView`, atau tetap pakai `IntersectionObserver` native jika ingin menghindari dependency tambahan.
- Crossfade swatch → tetap bisa pure CSS transition, tidak perlu library animasi.

---

## 6. Yang Sengaja Tidak Dipakai

Supaya konsisten dengan prinsip *restraint*:
- **Tidak** ada parallax scrolling — terlalu ramai untuk produk furniture yang butuh kejelasan visual.
- **Tidak** ada auto-playing carousel tanpa kontrol user — mengganggu proses membandingkan produk.
- **Tidak** ada numbered marker (01/02/03) kecuali kontennya benar-benar berurutan/proses — cek ulang tiap dipakai, jangan jadi default dekoratif.
