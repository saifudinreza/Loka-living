# 17 — Job: lepas stok order draft yang kedaluwarsa [LOGIC KRITIS]

**Tipe:** feature · **Tergantung:** 16 · **Label:** [LOGIC KRITIS]

## Konteks

Order `draft` menahan stok 30 menit. Kalau pembeli meninggalkan checkout tanpa confirm, stoknya harus dikembalikan, kalau tidak barang terlihat habis padahal tidak terjual.

Referensi: `git show bf3765d:backend/app/Jobs/ReleaseExpiredReservations.php` dan `ReleaseOrderReservation.php`.

Order `awaiting_payment` yang tidak dibayar sudah ditangani webhook `expire` dari Midtrans (issue 15 mengirim `expiry` 30 menit, issue 16 memprosesnya). Job ini hanya untuk `draft`.

## Tugas

1. `src/jobs/release-expired-reservations.ts` → `releaseExpiredReservations(): Promise<number>` (mengembalikan jumlah order yang dilepas, untuk log dan test).
2. Ambil id order `status = 'draft'` dan `reserved_until <= now()`, maksimal 100 per putaran (`limit 100`).
3. Proses **per order dalam transaksi sendiri-sendiri**, supaya satu order yang gagal tidak menggagalkan yang lain:
   1. Select order `FOR UPDATE`.
   2. **Cek ulang** `status === 'draft'` dan `reserved_until <= now()` setelah lock. Bisa saja user baru saja confirm tepat sebelum lock didapat.
   3. `release(tx, orderId)` dari `stock-reservation.service.ts` (fungsi yang sama dengan issue 16, jangan ditulis ulang).
   4. Update order `status: "expired"`, `reserved_until: null`.
   5. Insert `order_status_logs` (`draft` → `expired`, actor `system`, note `"Reservasi kedaluwarsa, stok dikembalikan"`).
   6. Error di satu order → `console.error` dengan order id, lanjut ke order berikutnya.
4. Daftarkan di `app.ts` dengan `@elysiajs/cron`, pola `* * * * *` (tiap menit), nama `release-expired-reservations`. Log `"Released N expired reservations"` hanya kalau N > 0.
5. Supaya test tidak terganggu job yang jalan sendiri: `createApp({ enableJobs })`, test memanggil dengan `enableJobs: false` dan menjalankan fungsinya secara langsung.

Catatan: ini hanya aman selama backend berjalan **satu proses**. Kalau nanti dijalankan beberapa instance, lock `FOR UPDATE` + cek ulang status tetap mencegah stok dilepas dua kali, jadi tidak ada data rusak, hanya kerja dobel.

## Acceptance Criteria

- [ ] Order draft dengan `reserved_until` di masa lalu → setelah `releaseExpiredReservations()`, status `expired`, stok kembali (available naik, reserved turun), ada log.
- [ ] Order draft yang belum kedaluwarsa tidak tersentuh.
- [ ] Order `awaiting_payment` dan `paid` tidak tersentuh walaupun `reserved_until` lewat.
- [ ] Menjalankan fungsi dua kali berturut-turut → stok tidak dikembalikan dua kali.
- [ ] Dengan server jalan, order yang kedaluwarsa dilepas dalam ±1 menit tanpa dipicu manual.

## Tambahan setelah review skema: pembersihan refresh token

Tambahkan job harian (menumpang scheduler yang sama) yang menghapus baris `refresh_tokens` yang `expires_at` lebih dari 7 hari lalu. Index `refresh_tokens_expires_at_idx` sudah tersedia. Tanpa ini tabel membesar tanpa batas.
