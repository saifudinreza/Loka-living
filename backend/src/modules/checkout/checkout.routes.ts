import { Elysia, t } from "elysia";
import { createRateLimiter } from "../../lib/rate-limit";
import { optionalAuth } from "../auth/auth.guard";
import { checkoutDocs } from "./checkout.docs";
import { init } from "./stock-reservation.service";

// Dibuat sebagai fungsi (bukan konstanta) supaya setiap aplikasi punya pembatasnya sendiri, seperti authRoutes:
// test yang membuat banyak aplikasi tidak saling berbagi hitungan.
export function checkoutRoutes() {
  // Setiap init menahan stok 30 menit tanpa pembayaran. Tanpa batas, satu orang bisa membuat produk terlihat habis
  // (stok seed ada yang hanya 5). Tamu tidak punya identitas, jadi pengamannya per IP; user login juga dibatasi
  // jumlah order draft-nya di service. Di memori: hilang saat restart, tidak dibagi antar-instance.
  const limiter = createRateLimiter(10, 60_000);

  // Di belakang reverse proxy, IP asli ada di X-Forwarded-For; atur di sana, jangan percaya header dari client.
  const limitByIp = ({ request, server }: { request: Request; server: { requestIP(r: Request): { address: string } | null } | null }) =>
    limiter(server?.requestIP(request)?.address ?? "unknown");

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
  );
}
