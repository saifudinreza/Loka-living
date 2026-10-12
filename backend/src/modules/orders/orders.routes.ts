import { Elysia, t } from "elysia";
import { AppError } from "../../lib/errors";
import { optionalAuth } from "../auth/auth.guard";
import { ordersDocs } from "./orders.docs";
import { LISTABLE_STATUSES, getOrder, listOrders } from "./orders.service";

// Satu penjaga untuk dua endpoint: daftar WAJIB login (dicek di handler), detail login opsional (tamu lewat token).
// Token dikirim tapi tidak valid → 401 di kedua endpoint (bug frontend tidak boleh tersembunyi).
export const ordersRoutes = new Elysia({ prefix: "/orders" })
  .use(optionalAuth)
  // Berisi nama, telepon, alamat: jangan sampai tersimpan di cache bersama (CDN/proxy) dan terbaca orang lain.
  .onAfterHandle(({ set }) => {
    set.headers["cache-control"] = "private, no-store";
  })
  .get(
    "",
    ({ user, query }) => {
      if (!user) throw new AppError(401, "UNAUTHORIZED", "Silakan login dulu.");
      // user_id SELALU dari token, tidak pernah dari query atau URL
      return listOrders(user.id, query);
    },
    {
      detail: ordersDocs.list,
      query: t.Object({
        status: t.Optional(t.Union(LISTABLE_STATUSES.map((s) => t.Literal(s)))),
        page: t.Optional(t.Numeric({ minimum: 1, maximum: 10_000, multipleOf: 1 })),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 50, multipleOf: 1 })),
      }),
    },
  )
  .get("/:token", ({ params, user }) => getOrder(params.token, user?.id ?? null), {
    detail: ordersDocs.detail,
    params: t.Object({ token: t.String({ maxLength: 200 }) }),
  });
