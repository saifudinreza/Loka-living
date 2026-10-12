# 18 — Riwayat & detail pesanan [LOGIC KRITIS]

**Tipe:** feature · **Tergantung:** 16 · **Label:** [LOGIC KRITIS] (kontrol akses data pesanan)

## Konteks

- User yang login melihat daftar semua pesanannya.
- Tamu (checkout tanpa login) melihat pesanannya lewat link berisi `order_token`. Token ini string acak 64 karakter, jadi praktis tidak bisa ditebak.

Bagian kritisnya adalah **kontrol akses**: pesanan berisi nama, nomor HP, dan alamat. Pesanan milik akun hanya boleh dilihat pemiliknya.

| Pesanan | Siapa boleh melihat detail |
|---|---|
| `user_id` null (checkout sebagai tamu) | Siapa pun yang punya `order_token` |
| `user_id` terisi (checkout saat login) | Hanya user itu, dan harus login. Token saja tidak cukup |

## Tugas

### `GET /api/orders` (`requireAuth`)
Daftar pesanan milik user, **kecuali `draft`** (checkout yang ditinggal bukan pesanan).

Query parameter opsional:
| Param | Nilai |
|---|---|
| `status` | `awaiting_payment` \| `paid` \| `expired` \| `cancelled` \| `refunded` |
| `page` | ≥ 1, default 1 |
| `limit` | 1–50, default 10 |

Urut `created_at` turun. Satu query untuk daftar + satu query `count` untuk total. Data item pertama diambil dengan join, bukan query per order.

Response 200:
```json
{
  "data": [
    {
      "order_token": "...",
      "status": "paid",
      "created_at": "2026-10-01T07:32:10.000Z",
      "total_amount": 2516000,
      "item_count": 2,
      "first_item": { "product_name": "Kursi Santai Rukun", "material": "Rotan & Linen", "image_url": null }
    }
  ],
  "meta": { "page": 1, "limit": 10, "total": 1 }
}
```

### `GET /api/orders/:token` (`optionalAuth`)
Aturan akses sesuai tabel di atas. Semua penolakan menjawab **404** `ORDER_NOT_FOUND` dengan pesan sama, supaya orang tidak bisa membedakan "token salah" dari "pesanan milik orang lain". Token yang bukan 64 karakter → langsung 404 tanpa query.

Response 200:
```json
{
  "data": {
    "order_token": "...",
    "status": "awaiting_payment",
    "created_at": "...",
    "reserved_until": "...",
    "amounts": { "subtotal": 2450000, "shipping": 66000, "installation": 0, "total": 2516000 },
    "items": [ { "product_slug": "kursi-santai-rukun", "product_name": "...", "material": "...", "color_hex": "...", "qty": 1, "unit_price": 2450000, "subtotal": 2450000, "image_url": null } ],
    "shipping": { "recipient_name": "Budi", "phone": "0812****890", "full_address": "...", "city": "...", "province": "...", "postal_code": "...", "delivery_date": "2026-10-03" },
    "contact": { "email": "bu***@contoh.com" },
    "payment": { "redirect_url": "https://app.sandbox.midtrans.com/...", "can_continue": true },
    "payments": [ { "method": "qris", "status": "pending", "amount": 2516000, "created_at": "...", "updated_at": "..." } ],
    "timeline": [ { "from": "draft", "to": "awaiting_payment", "actor": "system", "note": "...", "at": "..." } ]
  }
}
```

Aturan isi response:
- **Dilarang** ada: `id` internal order/item, `user_id`, `address_id`, `raw_payload`, `gateway_transaction_id`, `snap_token`.
- Untuk **pesanan tamu** (akses lewat token saja), samarkan data pribadi: email `bu***@contoh.com` (2 huruf pertama + `***`), telepon 4 digit awal + `****` + 3 digit akhir. Untuk pemilik akun yang login, tampilkan lengkap.
- `payment.can_continue = status === "awaiting_payment" && reserved_until > now`. `redirect_url` (dari `payment_transactions.snap_redirect_url` terbaru) hanya diisi kalau `can_continue`, supaya user bisa melanjutkan bayar.
- `timeline` dari `order_status_logs` urut waktu naik.
- Semua waktu ISO 8601 UTC. Frontend yang menampilkan dalam WIB.

## Acceptance Criteria

- [ ] `GET /api/orders` tanpa token → 401. Dengan token → hanya pesanan user itu, tanpa `draft`.
- [ ] `?status=paid&page=2&limit=5` → filter & paging benar, `meta.total` sesuai.
- [ ] Pesanan tamu: dibuka tanpa login lewat token → 200 dengan email & telepon disamarkan.
- [ ] Pesanan milik user A: dibuka tanpa login → 404; dibuka user B → 404; dibuka user A → 200 dengan data lengkap.
- [ ] Token acak 64 karakter dan token 10 karakter → 404 dengan body identik.
- [ ] Response tidak pernah berisi `raw_payload`, `snap_token`, atau id internal.
