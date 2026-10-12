import { Elysia, t } from "elysia";
import { UUID_PATTERN } from "../../lib/uuid";
import { requireAuth } from "../auth/auth.guard";
import { addToWishlist, getWishlist, removeFromWishlist } from "./wishlist.service";
import { wishlistDocs } from "./wishlist.docs";

// Pola longgar, bukan format "uuid": id produk seed tetap dan polos (000...001) dan ditolak validator ketat bawaan.
const productId = t.String({ pattern: UUID_PATTERN });
const productParams = t.Object({ productId });

// Wishlist hanya untuk user login (requireAuth). user_id SELALU dari token, tidak pernah dari body atau URL.
export const wishlistRoutes = new Elysia({ prefix: "/wishlist" })
  .use(requireAuth)
  // Data milik satu user: jangan sampai tersimpan di cache bersama (CDN/proxy) dan terbaca user lain.
  .onAfterHandle(({ set }) => {
    set.headers["cache-control"] = "private, no-store";
  })
  .get("", ({ user }) => getWishlist(user.id).then((data) => ({ data })), { detail: wishlistDocs.get })
  .post(
    "",
    async ({ user, body, set }) => {
      const { created } = await addToWishlist(user.id, body.product_id);
      set.status = created ? 201 : 200;
      return { data: { product_id: body.product_id, in_wishlist: true } };
    },
    {
      detail: wishlistDocs.post,
      body: t.Object({ product_id: productId }),
    },
  )
  .delete(
    "/:productId",
    async ({ user, params, set }) => {
      await removeFromWishlist(user.id, params.productId);
      set.status = 204;
    },
    { detail: wishlistDocs.delete, params: productParams },
  );
