import { Elysia, t } from "elysia";
import { ORDER_TOKEN_MAX_LENGTH } from "../../lib/order-token";
import { createRateLimiter } from "../../lib/rate-limit";
import { optionalAuth } from "../auth/auth.guard";
import { checkoutDocs } from "./checkout.docs";
import type { createTransaction } from "../payments/midtrans.service";
import { confirm, quoteShipping } from "./checkout.service";
import { init } from "./stock-reservation.service";

// Dibuat sebagai fungsi (bukan konstanta) supaya setiap aplikasi punya pembatasnya sendiri, seperti authRoutes:
// test yang membuat banyak aplikasi tidak saling berbagi hitungan.
export interface CheckoutRoutesDeps {
  /** Pengganti klien Midtrans (test). Default: klien sungguhan. */
  createTransaction?: typeof createTransaction;
}

// Batas permintaan per IP per menit.
const INIT_LIMIT = 10;
const SHIPPING_LIMIT = 30;
const CONFIRM_LIMIT = 20;
const WINDOW_MS = 60_000;

export function checkoutRoutes(deps: CheckoutRoutesDeps = {}) {
  // Setiap init menahan stok 30 menit tanpa pembayaran. Tanpa batas, satu orang bisa membuat produk terlihat habis
  // (stok seed ada yang hanya 5). Tamu tidak punya identitas, jadi pengamannya per IP; user login juga dibatasi
  // jumlah order draft-nya di service. Di memori: hilang saat restart, tidak dibagi antar-instance.
  const limiter = createRateLimiter(INIT_LIMIT, WINDOW_MS);

  // Di belakang reverse proxy, IP asli ada di X-Forwarded-For; atur di sana, jangan percaya header dari client.
  const ipOf = ({ request, server }: { request: Request; server: { requestIP(r: Request): { address: string } | null } | null }) =>
    server?.requestIP(request)?.address ?? "unknown";
  const limitByIp = ({ request, server }: { request: Request; server: { requestIP(r: Request): { address: string } | null } | null }) =>
    limiter(ipOf({ request, server }));
  // Hitung ongkir menulis alamat dan quote setiap kali dipanggil, tapi pembeli wajar mengganti alamat berkali-kali.
  const rateLimiter = createRateLimiter(SHIPPING_LIMIT, WINDOW_MS);
  const limitShippingByIp = (ctx: Parameters<typeof ipOf>[0]) => rateLimiter(ipOf(ctx));
  // Confirm memanggil layanan pihak ketiga (Midtrans) dan menahan kunci order selama itu; batasi per IP.
  const confirmLimiter = createRateLimiter(CONFIRM_LIMIT, WINDOW_MS);
  const limitConfirmByIp = (ctx: Parameters<typeof ipOf>[0]) => confirmLimiter(ipOf(ctx));

  return (
    new Elysia({ prefix: "/checkout" })
      // Tamu boleh. Token dikirim tapi tidak valid → 401 (bug frontend tidak boleh tersembunyi).
      .use(optionalAuth)
      // Respons memuat order_token, yang berfungsi seperti kata sandi pesanan tamu: jangan sampai tersimpan di cache bersama.
      .onAfterHandle(({ set }) => {
        set.headers["cache-control"] = "no-store";
      })
      .post(
        "/init",
        ({ body, user }) => init(body.items, user?.id ?? null),
        {
          beforeHandle: limitByIp,
          detail: checkoutDocs.init,
          body: t.Object({
            items: t.Array(
              t.Object({
                product_variant_id: t.String({ format: "uuid" }),
                qty: t.Integer({ minimum: 1, maximum: 99 }),
              }),
              { minItems: 1, maxItems: 20 },
            ),
          }),
        },
      )
      .post(
        "/shipping-rate",
        ({ body, user }) => quoteShipping(body, user?.id ?? null),
        {
          beforeHandle: limitShippingByIp,
          detail: checkoutDocs.shippingRate,
          // Panjang maksimal = ukuran kolom tabel addresses. Tepat salah satu dari address / address_id diperiksa di service.
          body: t.Object({
            order_token: t.String({ minLength: 1, maxLength: ORDER_TOKEN_MAX_LENGTH }),
            address: t.Optional(
              t.Object({
                full_address: t.String({ minLength: 1, maxLength: 2000 }),
                recipient_name: t.Optional(t.Union([t.String({ maxLength: 120 }), t.Null()])),
                phone: t.Optional(t.Union([t.String({ maxLength: 20 }), t.Null()])),
                kelurahan: t.Optional(t.Union([t.String({ maxLength: 80 }), t.Null()])),
                kecamatan: t.Optional(t.Union([t.String({ maxLength: 80 }), t.Null()])),
                city: t.Optional(t.Union([t.String({ maxLength: 80 }), t.Null()])),
                province: t.Optional(t.Union([t.String({ maxLength: 80 }), t.Null()])),
                postal_code: t.Optional(t.Union([t.String({ maxLength: 10 }), t.Null()])),
                country: t.Optional(t.Union([t.String({ minLength: 2, maxLength: 2 }), t.Null()])),
                latitude: t.Optional(t.Union([t.Number({ minimum: -90, maximum: 90 }), t.Null()])),
                longitude: t.Optional(t.Union([t.Number({ minimum: -180, maximum: 180 }), t.Null()])),
              }),
            ),
            address_id: t.Optional(t.String({ format: "uuid" })),
            save_address: t.Optional(t.Boolean()),
          }),
        },
      )
      .post(
        "/confirm",
        ({ body, user }) => confirm(body, user?.id ?? null, deps.createTransaction ? { createTransaction: deps.createTransaction } : undefined),
        {
          beforeHandle: limitConfirmByIp,
          detail: checkoutDocs.confirm,
          // Sengaja TIDAK ada field total/ongkir: semua angka dihitung ulang server dari database.
          body: t.Object({
            order_token: t.String({ minLength: 1, maxLength: ORDER_TOKEN_MAX_LENGTH }),
            contact: t.Optional(
              t.Object({
                email: t.Optional(t.String({ format: "email", maxLength: 150 })),
                phone: t.Optional(t.String({ maxLength: 20 })),
              }),
            ),
            shipping: t.Object({
              courier: t.String({ minLength: 1, maxLength: 30 }),
              delivery_date: t.Optional(t.String({ pattern: "^[0-9]{4}-[0-9]{2}-[0-9]{2}$" })),
            }),
            wants_installation: t.Optional(t.Boolean()),
            payment_method: t.Union([t.Literal("qris"), t.Literal("va_bca"), t.Literal("credit_card")]),
          }),
        },
      )
  );
}
