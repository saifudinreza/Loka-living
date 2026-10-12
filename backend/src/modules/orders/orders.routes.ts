import { Elysia, t } from "elysia";
import { createRateLimiter } from "../../lib/rate-limit";
import { requireAuth, optionalAuth } from "../auth/auth.guard";
import { ordersDocs } from "./orders.docs";
import { LISTABLE_STATUSES, getOrder, listOrders } from "./orders.service";

// Batas permintaan detail per IP per menit.
const DETAIL_LIMIT = 60;
const WINDOW_MS = 60_000;

// Dibuat sebagai fungsi (bukan konstanta) supaya setiap aplikasi punya pembatasnya sendiri, seperti checkoutRoutes.
export function ordersRoutes() {
  // Token 256 bit tidak bisa ditebak, tetapi endpoint publik ini tetap memakai database untuk setiap token yang
  // lolos pemeriksaan bentuk. Di memori: hilang saat restart, tidak dibagi antar-instance.
  const limiter = createRateLimiter(DETAIL_LIMIT, WINDOW_MS);
  // Di belakang reverse proxy, IP asli ada di X-Forwarded-For; atur di sana, jangan percaya header dari client.
  const limitByIp = ({ request, server }: { request: Request; server: { requestIP(r: Request): { address: string } | null } | null }) =>
    limiter(server?.requestIP(request)?.address ?? "unknown");

  // Berisi nama, telepon, alamat: jangan sampai tersimpan di cache bersama (CDN/proxy) dan terbaca orang lain.
  const noStore = ({ set }: { set: { headers: Record<string, string | number | undefined> } }) => {
    set.headers["cache-control"] = "private, no-store";
  };

  // Daftar: WAJIB login. user_id SELALU dari token, tidak pernah dari query atau URL.
  const list = new Elysia()
    .use(requireAuth)
    .onAfterHandle(noStore)
    .get("", ({ user, query }) => listOrders(user.id, query), {
      detail: ordersDocs.list,
      query: t.Object({
        status: t.Optional(t.Union(LISTABLE_STATUSES.map((s) => t.Literal(s)))),
        page: t.Optional(t.Numeric({ minimum: 1, maximum: 10_000, multipleOf: 1 })),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 50, multipleOf: 1 })),
      }),
    });

  // Detail: login opsional (tamu membuka pesanan tamu lewat token). Token dikirim tapi tidak valid → 401.
  const detail = new Elysia()
    .use(optionalAuth)
    .onAfterHandle(noStore)
    .get("/:token", ({ params, user }) => getOrder(params.token, user?.id ?? null), {
      beforeHandle: limitByIp,
      detail: ordersDocs.detail,
      params: t.Object({ token: t.String({ maxLength: 200 }) }),
    });

  return new Elysia({ prefix: "/orders" }).use(list).use(detail);
}
