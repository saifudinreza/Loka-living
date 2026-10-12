# 16 — `POST /api/payment/webhook`: notifikasi Midtrans [LOGIC KRITIS]

**Tipe:** feature · **Tergantung:** 15 · **Label:** [LOGIC KRITIS]

## Konteks

Midtrans memanggil endpoint ini setiap status pembayaran berubah. **Ini satu-satunya tempat status order berubah jadi `paid`.** Browser user tidak pernah dipercaya untuk itu.

Endpoint ini publik, jadi siapa pun bisa mengirim request palsu "order X sudah dibayar". Pertahanannya adalah **signature**: Midtrans menghitung `sha512(order_id + status_code + gross_amount + SERVER_KEY)`. Penyerang tidak tahu server key, jadi tidak bisa membuat signature yang cocok.

Referensi: `git show bf3765d:backend/app/Http/Controllers/Api/PaymentWebhookController.php`. Beberapa perilaku **sengaja diubah** di sini karena kode lama punya bug (ditandai *Beda dari Laravel*).

## Tugas

### `signature.ts` → `verifyMidtransSignature(payload): boolean`
1. Server key kosong → `console.error` dan `return false` **langsung**. (Kalau key kosong, rumusnya bisa dihitung siapa saja.)
2. `expected = sha512Hex(order_id + status_code + gross_amount + serverKey)`, pakai string **mentah** dari payload. Jangan ubah `gross_amount` jadi angka dulu, karena Midtrans mengirim `"2516000.00"` dan signature dihitung dari teks itu.
3. Bandingkan dengan `timingSafeEqualHex(expected, payload.signature_key)` dari issue 04.

### `payment-status.service.ts` → `applyMidtransStatus(payload)`

Pemetaan status Midtrans ke status order:

| `transaction_status` (+ `fraud_status`) | Status order baru | Efek stok |
|---|---|---|
| `settlement` | `paid` | **commit**: `stock_reserved -= qty` |
| `capture` + `accept` | `paid` | commit |
| `capture` + `challenge`, `pending`, `authorize` | tetap | — |
| `deny` | **tetap `awaiting_payment`** | — |
| `expire` | `expired` | **release**: reserved → available |
| `cancel` | `cancelled` | release |
| `refund`, `partial_refund` | `refunded` | — |

*Beda dari Laravel:*
- `deny` dulu langsung membuat order `expired` dan melepas stok. Padahal di halaman Snap user masih bisa mencoba kartu lain. Kalau kartu kedua berhasil, order yang stoknya sudah dilepas jadi `paid`, sehingga terjadi oversell.
- Status `paid` dulu tidak mengurangi `stock_reserved`, jadi angka reserved naik terus.

Transisi yang **boleh** (selain ini: abaikan + `console.warn`, tetap balas 200 supaya Midtrans tidak mengulang terus):
- `awaiting_payment` → `paid` | `expired` | `cancelled`
- `paid` → `refunded`

Kasus khusus: order sudah `expired`/`cancelled` tapi datang `settlement` → `console.error` level kritis "uang masuk tapi stok sudah dilepas, perlu refund manual". Jangan ubah order.

### Alur handler (`webhook.routes.ts` + service)
1. Body sebagai `unknown`, validasi minimal field string: `order_id`, `status_code`, `gross_amount`, `signature_key`, `transaction_status`, `transaction_id`. Field kurang → 400.
2. Signature salah → 401 `INVALID_SIGNATURE`.
3. Semua langkah berikut dalam **satu** `db.transaction`:
   1. **Idempotency:** `eventId = transaction_id + ":" + transaction_status`. Insert ke `processed_webhooks` dengan `onConflictDoNothing().returning()`. Tidak ada baris yang kembali → sudah pernah diproses → balas 200 `{ "message": "Already processed" }`.
      *Beda dari Laravel:* kunci lama hanya `transaction_id`, padahal `pending` lalu `settlement` untuk transaksi yang sama memakai `transaction_id` yang sama.
   2. Cari order by `order_token = order_id`, **`FOR UPDATE`**. Tidak ada → 404 (Midtrans akan mengulang).
   3. `Math.round(Number(gross_amount)) !== order.total_amount` → `console.error` kritis, 400 `AMOUNT_MISMATCH`, tanpa mengubah apa pun.
   4. Upsert `payment_transactions` berdasarkan `gateway_transaction_id = transaction_id`:
      - Ada → update `status`, `gateway_payment_method` (= `payment_type`), `raw_payload`, `updated_at`.
      - Tidak ada, tapi ada baris milik order ini yang `gateway_transaction_id` masih null → isi baris itu.
      - Tidak ada juga → insert baru.
      Dengan begini setiap percobaan bayar (misalnya kartu ditolak lalu kartu lain) punya barisnya sendiri.
   5. Tentukan status baru dari tabel. Kalau berubah dan transisinya boleh:
      - Update `orders.status`, `updated_at`. Untuk `expired`/`cancelled` juga `reserved_until = null`.
      - Stok: commit atau release lewat `stock-reservation.service.ts` (tambahkan fungsi `commit(tx, orderId)` dan `release(tx, orderId)`). Lock varian urut id, update atomik di SQL.
      - Insert `order_status_logs` (actor `midtrans`, note `"Webhook: <transaction_status>"`).
      - Kalau status baru `paid` dan order punya `user_id`: hapus dari `cart_items` user itu semua varian yang ada di order ini. Barang yang sudah dibeli tidak tertinggal di keranjang akun. Keranjang tamu (`localStorage`) dikosongkan frontend sendiri.
4. Balas 200 `{ "message": "OK" }`.

Route webhook **tidak** memakai CORS terbatas atau limiter. Yang memanggil adalah server Midtrans.

## Menguji di lokal

Midtrans tidak bisa memanggil `localhost`. Pilihan:
- Buat payload palsu lalu hitung signature-nya sendiri di test (cara utama, lihat issue 19).
- Untuk uji nyata: tunnel (misalnya `ngrok http 8000`), lalu set Payment Notification URL di dashboard Midtrans sandbox ke `https://<tunnel>/api/payment/webhook`.

## Acceptance Criteria

- [ ] Signature salah → 401, tidak ada perubahan DB. Server key kosong → selalu 401.
- [ ] `settlement` valid → order `paid`, `stock_reserved` turun sebesar qty, `stock_available` tidak berubah.
- [ ] Payload yang sama dikirim 2x → diproses sekali.
- [ ] `pending` lalu `settlement` (transaction_id sama) → keduanya tercatat, order akhirnya `paid`.
- [ ] `deny` lalu `settlement` dengan transaction_id berbeda → order `paid`, stok tidak pernah dilepas, ada 2 baris `payment_transactions`.
- [ ] `settlement` lalu `expire` → order tetap `paid`.
- [ ] `expire` → order `expired`, stok kembali ke available.
- [ ] Order milik user login menjadi `paid` → varian yang dibeli hilang dari `cart_items` user itu, varian lain di keranjang tetap ada.
- [ ] `gross_amount` beda dari `total_amount` → 400, order tidak berubah.
