import { Elysia, t } from "elysia";
import { requireAuth } from "../auth/auth.guard";
import { cartDocs } from "./cart.docs";
import { getCart, removeFromCart, setCartQty } from "./cart.service";

const variantParams = t.Object({ variantId: t.String({ format: "uuid" }) });

// Keranjang hanya untuk user login (requireAuth). user_id SELALU dari token, tidak pernah dari body atau URL,
// jadi user tidak bisa membaca atau mengubah keranjang orang lain.
export const cartRoutes = new Elysia({ prefix: "/cart" })
  .use(requireAuth)
  // Data milik satu user: jangan sampai tersimpan di cache bersama (CDN/proxy) dan terbaca user lain.
  .onAfterHandle(({ set }) => {
    set.headers["cache-control"] = "private, no-store";
  })
  .get("", ({ user }) => getCart(user.id).then((data) => ({ data })), { detail: cartDocs.get })
  .put(
    "/items/:variantId",
    ({ user, params, body }) => setCartQty(user.id, params.variantId, body.qty).then((data) => ({ data })),
    {
      detail: cartDocs.put,
      params: variantParams,
      body: t.Object({ qty: t.Integer({ minimum: 0, maximum: 99 }) }),
    },
  )
  .delete(
    "/items/:variantId",
    ({ user, params }) => removeFromCart(user.id, params.variantId).then((data) => ({ data })),
    { detail: cartDocs.delete, params: variantParams },
  );
