# PRD — Loka Living E-Commerce Platform
**Product Requirements Document**
Versi 1.0 | Status: Draft

---

## 1. Ringkasan Produk

**Loka Living** adalah platform e-commerce furniture yang menjual produk kayu/rattan ramah lingkungan langsung ke konsumen (D2C). Karena furniture adalah produk *high-involvement* (mahal, besar, butuh kepastian ruang sebelum beli), platform ini dirancang untuk dua hal sekaligus:

1. **Membantu keputusan beli** — lewat visual produk yang detail (360°, dimensi, material) sehingga pembeli yakin sebelum checkout.
2. **Mempercepat transaksi** — lewat alur checkout instan 2 langkah, dari halaman produk langsung ke pembayaran, selesai di bawah 2 menit.

### 1.1 Tujuan Bisnis
- Menjual produk furniture secara online dengan tingkat *cart abandonment* serendah mungkin.
- Melayani pembeli lokal (Indonesia) dan global dengan pengalaman pembayaran & pengiriman yang sesuai konteks masing-masing.
- Membangun kepercayaan pembeli lewat transparansi ongkos kirim, jadwal pengantaran, dan opsi cicilan sejak di halaman produk.

### 1.2 Target Pengguna
| Segmen | Karakteristik |
|---|---|
| Pembeli individu lokal | Beli 1–3 item, sensitif ongkir, sering pakai QRIS/PayLater |
| Pembeli individu global | Beli via kartu kredit/PayPal, ekspektasi 3D preview tinggi |
| Desainer interior / reseller kecil | Beli dalam jumlah lebih besar, butuh detail dimensi & material presisi |

### 1.3 Metrik Keberhasilan (Success Metrics)
- Conversion rate halaman produk → checkout selesai
- Rata-rata waktu checkout (target: < 2 menit dari klik "Beli Langsung")
- Cart abandonment rate
- % transaksi yang pakai PayLater/cicilan (indikator produk high-value diterima pasar)
- Return/komplain rate terkait "ukuran tidak sesuai ekspektasi" (indikator efektivitas Dimension Guide & 3D viewer)

---

## 2. Struktur Situs (Information Architecture)

```
Loka Living
├── Home
├── Collections
│   ├── [Filter: Chairs / Tables / Cabinets / Shelves]
│   └── Product Detail Page (PDP)
│       └── Checkout (Single-Screen)
│           └── Payment Confirmation
├── Our Brand
├── About Us
├── Contact Us
└── Cart (opsional — untuk multi-item, terpisah dari alur Buy Now)
```

Navigasi utama: **Home · Collections · Our Brand · About Us · Contact Us**, dengan ikon cart & akun di kanan atas (mengikuti layout referensi yang sudah dibangun di prototype).

---

## 3. Fitur per Halaman

### 3.1 Home
**Tujuan halaman:** hook pertama, arahkan ke Collections & bangun kepercayaan brand.

| Fitur | Deskripsi | Prioritas |
|---|---|---|
| Hero section | Headline + visual produk unggulan, CTA "Shop Now" | Must |
| Hotspot produk interaktif | Bubble hover di gambar hero yang link ke PDP produk terkait | Should |
| Collections preview | Grid produk dengan filter kategori cepat (sudah dibangun di prototype) | Must |
| New Arrival | Highlight produk terbaru | Should |
| Featured product spotlight | 1 produk unggulan dengan varian & CTA langsung | Should |
| Trust section ("Furniture with Value") | Poin kepercayaan: durability, sustainability, komunitas | Could |
| Newsletter signup | Email capture untuk retargeting | Could |

### 3.2 Collections
**Tujuan halaman:** listing produk lengkap dengan pencarian & filter.

| Fitur | Deskripsi | Prioritas |
|---|---|---|
| Filter kategori | Chairs / Tables / Cabinets / Shelves, multi-select | Must |
| Filter tambahan | Rentang harga, material, ketersediaan stok | Should |
| Sort | Terbaru, harga (rendah-tinggi/tinggi-rendah), terlaris | Should |
| Pagination / infinite scroll | Untuk katalog besar | Must |
| Quick add-to-cart di card | Tanpa masuk ke PDP (untuk produk aksesori kecil) | Could |

### 3.3 Product Detail Page (PDP) — *Fitur Inti Nomor 1*
Ini halaman paling krusial karena keputusan beli terjadi di sini.

| Fitur | Deskripsi | Prioritas |
|---|---|---|
| **Instant "Buy Now"** | Tombol yang skip halaman cart, langsung ke checkout single-screen dengan produk ini | **Must** |
| **Add to Cart** | Untuk pembeli yang mau checkout multi-item sekaligus | **Must** |
| **3D Product Viewer & 360° View** | Model 3D interaktif (rotate, zoom) atau minimal sequence foto 360° | **Must** |
| **Dimension Guide & Room Fit** | Diagram panjang/lebar/tinggi dengan angka jelas; ideal + AR "lihat di ruangan saya" (fase lanjut) | **Must** |
| **Material & Fabric Swatch** | Swatch warna/material interaktif, ganti gambar produk real-time (sudah ada polanya di prototype) | **Must** |
| Deskripsi & spesifikasi | Material, berat, garansi, cara perawatan | Must |
| Related/Similar products | Cross-sell di bawah PDP | Should |
| Stock indicator | "13/100 tersedia" — menciptakan urgency | Should |
| Review & rating | Foto ulasan dari pembeli sebelumnya | Should |

### 3.4 Checkout — Single-Screen, 2-Step Flow

**Alur:**
```
[PDP] --klik "Beli Langsung"--> [Checkout Single-Screen] --bayar--> [Konfirmasi]
```

Satu halaman checkout berisi semua tahap tanpa reload:

| Fitur | Deskripsi | Prioritas |
|---|---|---|
| **Guest Checkout** | Isi email/nomor WhatsApp + alamat, tanpa wajib bikin akun | **Must** |
| **Address Autofill (Google Maps API)** | Ketik sebagian alamat → auto-lengkapi kelurahan/kecamatan/kode pos, plus pin map draggable | **Must** |
| **Real-time Cargo Shipping Rate** | Terintegrasi API ekspedisi kargo (JNE Trucking, Dakota, Deliveree) — ongkir volume besar muncul otomatis berdasarkan berat/dimensi produk & alamat tujuan | **Must** |
| **Scheduled Delivery** | Kalender interaktif pilih tanggal pengantaran, slot tersedia real-time | **Must** |
| **Add-on: Unboxing & Installation** | Checkbox tambahan biaya untuk jasa rakit + buang kemasan | Should |
| **Payment Gateway** | **Midtrans** (lokal: QRIS, Virtual Account, kartu kredit lokal, GoPay/ShopeePay) & **Stripe** (global: kartu kredit internasional, PayPal, Apple Pay/Google Pay) — sistem deteksi otomatis berdasarkan lokasi/mata uang pembeli | **Must** |
| **PayLater / Cicilan Tanpa Kartu** | Integrasi Kredivo, SPayLater, Akulaku — muncul sebagai opsi pembayaran khusus pembeli Indonesia | **Should** |
| Order summary sticky | Ringkasan produk + total (harga + ongkir + add-on) selalu terlihat | Must |
| Validasi real-time | Error inline per field, tidak submit-then-error | Must |

**Prinsip desain checkout:** tidak ada perpindahan halaman/loading antar tahap (address → shipping → payment semua di satu scroll), agar sesuai target < 2 menit.

### 3.5 Cart
Untuk pembeli yang tidak pakai jalur "Buy Now" (checkout multi-produk).

| Fitur | Deskripsi | Prioritas |
|---|---|---|
| List item + edit qty/varian | Update tanpa reload | Must |
| Ringkasan estimasi ongkir | Estimasi kasar sebelum masuk checkout penuh | Should |
| Simpan cart untuk guest (local storage / cookie) | Cart tidak hilang walau belum login | Should |
| CTA "Checkout" | Masuk ke halaman checkout single-screen yang sama dengan Buy Now | Must |

### 3.6 Our Brand
Halaman storytelling brand — nilai eco-friendly, proses produksi, sumber material.

| Fitur | Deskripsi | Prioritas |
|---|---|---|
| Brand story | Narasi + visual proses produksi | Must |
| Sustainability practices | Poin konkret (repurposing, komunitas eco) | Should |
| Sertifikasi/partnership (jika ada) | Badge kepercayaan | Could |

### 3.7 About Us
| Fitur | Deskripsi | Prioritas |
|---|---|---|
| Profil perusahaan | Sejarah singkat, misi | Must |
| Tim (opsional) | Foto/nama singkat | Could |

### 3.8 Contact Us
| Fitur | Deskripsi | Prioritas |
|---|---|---|
| Form kontak | Nama, email, pesan | Must |
| Info kontak langsung | WhatsApp, email, alamat showroom (jika ada) | Must |
| Live chat / WhatsApp widget | Respons cepat pra-penjualan | Should |
| Map lokasi showroom (jika ada) | Google Maps embed | Could |

---

## 4. Alur Checkout Instan (Detail)

### Step 1 — Halaman Produk
1. User membuka PDP, eksplorasi 3D viewer / 360°, cek dimensi, pilih material/warna via swatch.
2. User klik **"Beli Langsung"** (skip cart) *atau* **"Add to Cart"** (lanjut belanja produk lain).

### Step 2 — Checkout Single-Screen
1. **Kontak**: email atau nomor WhatsApp (guest, tanpa password).
2. **Alamat**: mulai ketik, Google Maps API men-suggest & auto-fill kelurahan/kecamatan/kode pos; user drag pin untuk presisi.
3. **Opsi Kargo**: sistem hitung ongkir otomatis (berdasarkan berat/volume produk × jarak) dari beberapa ekspedisi kargo, user pilih salah satu.
4. **Jadwal Pengiriman**: kalender pilih tanggal (menyesuaikan slot ketersediaan armada).
5. **Add-on**: centang jasa unboxing & instalasi jika perlu (+biaya).
6. **Pembayaran**: pilih metode (QRIS / Virtual Account / kartu via Midtrans untuk lokal; kartu/PayPal via Stripe untuk global; atau PayLater).
7. Klik **Bayar** → konfirmasi order.

**Target end-to-end: < 2 menit.**

---

## 5. Kebutuhan Teknis (Technical Requirements)

### 5.1 Arsitektur yang Disarankan
- **Frontend**: Next.js (SSR/ISR untuk SEO produk, penting karena furniture sering dicari via Google Shopping/organic search)
- **Backend**: Laravel (REST/GraphQL API), menangani order, inventory, integrasi shipping & payment
- **Database**: MySQL/PostgreSQL untuk data transaksional; pgvector opsional jika nanti mau tambah fitur rekomendasi produk berbasis AI
- **3D/360° Viewer**: model glTF/GLB dirender via `<model-viewer>` (Google) atau Three.js untuk 3D; sequence image + JS slider untuk 360° foto (lebih murah secara produksi konten dibanding full 3D model)

### 5.2 Integrasi Pihak Ketiga
| Kebutuhan | Provider |
|---|---|
| Payment lokal | **Midtrans** (Snap/Core API — QRIS, VA, kartu, e-wallet) |
| Payment global | **Stripe** (Checkout/Payment Intents — kartu, PayPal, Apple/Google Pay) |
| PayLater | Kredivo, SPayLater, Akulaku (biasanya tersedia sebagai payment channel dalam Midtrans, cek dulu ketersediaannya sebelum integrasi terpisah) |
| Alamat & peta | Google Maps Platform (Places Autocomplete + Geocoding API) |
| Cargo shipping | JNE Trucking / Dakota / Deliveree (API rate calculation) — perlu dicek mana yang punya API publik vs butuh partnership manual |
| Notifikasi order | WhatsApp Business API / email transactional (mis. Resend, SendGrid) |

### 5.3 Logika Deteksi Payment Gateway
Sistem perlu menentukan Midtrans vs Stripe secara otomatis:
- Berdasarkan **negara pengiriman** (Indonesia → Midtrans, luar negeri → Stripe), *atau*
- Berdasarkan **mata uang yang dipilih user** di awal sesi.
- Perlu didefinisikan: apakah produk dijual dalam 2 mata uang (IDR & USD) atau 1 mata uang dengan konversi otomatis.

### 5.4 Non-Functional Requirements
- **Performa**: PDP dengan 3D viewer harus tetap load < 3 detik (lazy-load model 3D setelah konten utama tampil).
- **Keamanan**: proses pembayaran wajib PCI-DSS compliant (ditangani otomatis oleh Midtrans/Stripe selama tidak menyimpan data kartu sendiri).
- **Responsif**: prioritas mobile-first, karena mayoritas trafik e-commerce Indonesia dari mobile — 3D viewer & swatch harus tetap smooth di HP.
- **Aksesibilitas**: form checkout harus bisa dinavigasi keyboard & screen reader (penting untuk kepercayaan & kepatuhan dasar).

---

## 6. Model Data (Ringkas)

Entitas inti yang perlu ada di database:

- **Product** — nama, deskripsi, dimensi (P/L/T), berat, kategori, model 3D/gambar 360°
- **ProductVariant** — kombinasi material/warna, harga per varian, stok per varian
- **Cart** / **CartItem** — terikat session guest atau user
- **Order** — status, total, metode pembayaran, jadwal kirim
- **OrderItem** — produk + varian + qty per order
- **ShippingQuote** — cache hasil rate cargo per order (karena ongkir volume besar bisa mahal di-compute berkali-kali)
- **Address** — hasil autofill Google Maps (kelurahan, kecamatan, kode pos, koordinat)
- **PaymentTransaction** — referensi ke Midtrans/Stripe transaction ID + status

---

## 7. Prioritas & Fasing (MVP vs Lanjutan)

### MVP (Fase 1) — fokus: alur beli inti berfungsi
- Home, Collections, PDP dasar (tanpa 3D, pakai galeri foto + swatch dulu)
- Add to Cart + Buy Now
- Checkout single-screen dengan Guest Checkout + Address Autofill
- Payment: Midtrans (lokal) minimal QRIS + VA
- Cargo shipping rate — bisa mulai dari 1 ekspedisi dulu, bukan langsung 3
- About Us, Contact Us statis

### Fase 2 — pengalaman produk & konversi
- 3D Viewer / 360° View
- Dimension Guide visual (bukan cuma angka, tapi diagram)
- Stripe untuk pembeli global
- PayLater (Kredivo/SPayLater/Akulaku)
- Scheduled Delivery calendar

### Fase 3 — retensi & skala
- Add-on Unboxing & Installation service
- Review & rating produk
- Rekomendasi produk personalisasi (bisa manfaatkan pgvector kalau mau explore AI recommendation)
- Multi-ekspedisi cargo dengan perbandingan otomatis

---

## 8. Risiko & Pertanyaan Terbuka

| Area | Pertanyaan yang perlu dijawab sebelum development |
|---|---|
| Cargo shipping API | Apakah JNE Trucking/Dakota/Deliveree punya API publik yang bisa langsung diintegrasi, atau perlu partnership/perjanjian bisnis dulu? |
| PayLater | Apakah diakses langsung (Kredivo/Akulaku API terpisah) atau cukup lewat channel yang sudah disediakan Midtrans? Perlu dicek dokumentasi terbaru Midtrans. |
| 3D model produksi | Siapa yang akan membuat model 3D/360° tiap produk — vendor eksternal atau foto sendiri? Ini berdampak ke biaya & timeline konten. |
| Currency & pricing global | Harga untuk pembeli global ditampilkan dalam USD tetap, atau convert otomatis dari IDR? |
| Instalasi & unboxing | Apakah jasa ini dikerjakan tim internal atau vendor pihak ketiga per kota? Berdampak ke availability opsi ini di checkout. |

---

## 9. Referensi Desain
Prototype visual awal (layout homepage, animasi produk, transisi PDP) sudah dibangun terpisah — lihat file `loka-living.html` sebagai referensi tone visual (warm/eco, tipografi besar, animasi FLIP saat buka produk, crossfade swatch warna). Lihat juga `design.md` untuk detail token & spesifikasi animasi.

---

## 10. Tech Stack Rekomendasi

### 10.1 Frontend
| Layer | Pilihan | Alasan |
|---|---|---|
| Framework | **Next.js 14+ (App Router)** | SSR/ISR penting untuk SEO produk furniture (banyak dicari via Google Shopping/organic search); RSC mengurangi JS bundle di halaman produk yang sudah berat karena 3D viewer |
| Styling | **Tailwind CSS** | Cepat diselaraskan dengan design token di `design.md`; gampang di-maintain tim kecil |
| Animasi | **Framer Motion** | `layoutId` untuk FLIP transition antar card→detail; `whileInView` untuk scroll reveal — menggantikan implementasi vanilla JS di prototype |
| 3D/360° Viewer | **`<model-viewer>` (Google)** untuk model glTF/GLB, atau custom image-sequence slider untuk 360° foto | `<model-viewer>` web component, tidak perlu Three.js manual kecuali butuh interaksi custom lebih dalam |
| State management | **Zustand** atau React Context (untuk cart) | Cart guest perlu persist ke localStorage — Zustand + middleware persist paling ringan untuk kebutuhan ini |
| Form & validasi | **React Hook Form + Zod** | Checkout single-screen perlu validasi real-time per field tanpa reload |

### 10.2 Backend
| Layer | Pilihan | Alasan |
|---|---|---|
| Framework | **Laravel 11** | Sesuai stack yang sudah dikuasai; ekosistem matang untuk order management, queue (penting untuk proses async shipping rate & payment webhook) |
| API | **REST API** (Laravel API Resources) | Cukup untuk kebutuhan e-commerce standar; GraphQL baru relevan kalau nanti butuh query produk yang sangat fleksibel dari frontend |
| Database | **PostgreSQL** | Lebih baik dari MySQL untuk data terstruktur kompleks (order, shipping quote, multi-currency) + dukungan `pgvector` kalau nanti mau tambah rekomendasi produk berbasis AI |
| Queue & Job | **Laravel Queue (Redis driver)** | Proses shipping rate calculation & payment webhook harus async, tidak boleh blocking response checkout |
| Cache | **Redis** | Cache hasil shipping rate (karena API cargo eksternal bisa lambat/mahal di-call berulang), cache session cart guest |
| File/asset storage | **Cloudflare R2** atau S3-compatible | Untuk gambar produk, model 3D — sudah familiar dari pengalaman KasirAI |
| Search (opsional, fase lanjut) | **Meilisearch** atau **Laravel Scout** | Untuk pencarian produk yang lebih baik dari `LIKE` query biasa saat katalog membesar |

### 10.3 Infrastruktur & Deployment
| Kebutuhan | Pilihan |
|---|---|
| Hosting frontend | **Vercel** (native untuk Next.js, ISR otomatis) |
| Hosting backend | **Railway** atau **VPS terkelola** (mengacu pengalaman deployment KasirAI sebelumnya) — pastikan bukan free-tier untuk production karena traffic checkout tidak boleh kena cold-start/limit |
| CI/CD | **GitHub Actions** — otomatis test & deploy tiap push ke `main` |
| Monitoring error | **Sentry** (frontend & backend) — kritis untuk checkout flow, error di step pembayaran harus langsung ketahuan |
| Uptime monitoring | **Better Uptime** / **UptimeRobot** | Alert kalau endpoint checkout/payment webhook down |
| Domain & DNS | **DomaiNesia** (sudah dipakai sebelumnya) atau Cloudflare DNS untuk kontrol lebih baik |

---

## 11. Keamanan & Kepatuhan (Security & Compliance)

E-commerce dengan pembayaran langsung (bukan sekadar katalog) membawa risiko keamanan yang jauh lebih tinggi dibanding portfolio project biasa. Ini bukan area untuk "nanti aja" — beberapa poin di bawah wajib ada sejak MVP.

### 11.1 Keamanan Pembayaran
- **Jangan pernah simpan data kartu kredit di server sendiri.** Seluruh input kartu harus lewat SDK/hosted page dari Midtrans (Snap) atau Stripe (Elements/Checkout) — tokenisasi terjadi di sisi mereka, server Loka Living hanya menerima token/transaction ID.
- **Verifikasi webhook signature.** Setiap notifikasi status pembayaran dari Midtrans (`signature_key`) maupun Stripe (`Stripe-Signature` header) wajib diverifikasi sebelum mengubah status order — mencegah orang memalsukan notifikasi "pembayaran sukses".
- **Idempotency pada webhook & payment intent.** Webhook bisa terkirim lebih dari satu kali — proses update status order harus idempotent (tidak double-charge/double-fulfill kalau webhook sama diterima 2x).
- **Amount re-validation di server.** Total harga yang dikirim ke Midtrans/Stripe harus dihitung ulang di backend saat checkout, bukan percaya begitu saja angka dari frontend (mencegah manipulasi harga lewat DevTools/API call langsung).

### 11.2 Autentikasi & Otorisasi
- **Guest checkout tetap butuh proteksi session.** Order guest diikat ke token session/order-token unik (bukan cuma email) supaya orang lain tidak bisa menebak/akses order orang lain lewat URL.
- **Rate limiting di endpoint sensitif** — login (kalau ada akun), checkout, dan validasi kupon/diskon, untuk mencegah brute-force dan abuse.
- **Password hashing** pakai `bcrypt`/`argon2` (default Laravel sudah benar, jangan diubah ke custom hashing).

### 11.3 Perlindungan Data Pengguna
- **Enkripsi data alamat & kontak** yang sensitif at-rest jika database ter-compromise (Laravel encrypted casts untuk kolom alamat/no. HP).
- **Kepatuhan UU PDP (Indonesia)** — karena mengumpulkan alamat, nomor WhatsApp, dan data pembayaran: perlu privacy policy jelas, mekanisme user request hapus data, dan pembatasan siapa saja (internal) yang bisa akses data pelanggan mentah.
- **Minimalkan data yang disimpan** — misal, tidak perlu simpan foto KTP/dokumen apa pun untuk transaksi furniture biasa.

### 11.4 Keamanan Aplikasi Umum (OWASP-aligned)
| Risiko | Mitigasi |
|---|---|
| SQL Injection | Gunakan Eloquent ORM/query builder Laravel secara konsisten, hindari raw query dengan input user langsung |
| XSS | Escape semua output user-generated (review produk, nama, alamat) — Blade/React sudah escape by default, tapi hati-hati kalau ada `dangerouslySetInnerHTML`/`{!! !!}` |
| CSRF | Laravel CSRF token untuk semua form state-changing; API mobile/SPA pakai Sanctum token-based auth |
| Mass assignment | Selalu definisikan `$fillable`/`$guarded` eksplisit di tiap Eloquent model, terutama model Order & Payment |
| Dependency vulnerabilities | `composer audit` & `npm audit` dijalankan otomatis di CI, update dependency berkala |
| Secrets management | API key Midtrans/Stripe/Google Maps disimpan di environment variable, tidak pernah di-commit ke repo — gunakan `.env` + secret manager platform hosting (Vercel/Railway secrets) |

### 11.5 Keamanan Spesifik Alur Checkout
- **HTTPS wajib di semua environment**, termasuk staging — terutama karena checkout mengirim data pribadi & terhubung ke payment gateway.
- **Validasi ongkir & jadwal kirim di server**, bukan hanya divalidasi di frontend — mencegah user memanipulasi request API langsung untuk dapat ongkir Rp0 atau slot yang sudah penuh.
- **Stock reservation saat checkout berlangsung** — untuk mencegah overselling ketika 2 pembeli checkout produk stok terakhir bersamaan (gunakan `lockForUpdate()` di transaction, sesuai pola yang pernah dipakai di KasirAI untuk race condition).
- **Audit log transaksi** — setiap perubahan status order (dibuat, dibayar, dikirim) tercatat dengan timestamp & aktor (sistem/webhook/admin), untuk investigasi kalau ada komplain atau sengketa pembayaran.

### 11.6 Checklist Keamanan Sebelum Go-Live
- [ ] Payment gateway berjalan di mode production key, bukan sandbox
- [ ] Webhook signature verification aktif & sudah ditest dengan payload asli
- [ ] HTTPS + HSTS aktif di seluruh domain
- [ ] Rate limiting aktif di endpoint checkout & auth
- [ ] Environment variable/secrets tidak ada yang ter-expose ke frontend bundle
- [ ] Backup database otomatis (minimal harian) sudah berjalan
- [ ] Privacy policy & syarat & ketentuan sudah tayang di halaman Contact Us/footer
