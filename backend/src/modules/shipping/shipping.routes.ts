import { Elysia, t } from "elysia";
import { PROVINCES } from "./shipping-rate.service";
import { estimateShipping } from "./shipping.service";

export const shippingRoutes = new Elysia({ prefix: "/shipping" })
  // Daftar provinsi untuk dropdown frontend: nama yang dikirim balik selalu cocok dengan tabel zona.
  .get("/provinces", ({ set }) => {
    set.headers["cache-control"] = "public, max-age=86400";
    return { data: PROVINCES };
  })
  // Publik dan tanpa login; tidak menulis apa pun ke database.
  .post(
    "/estimate",
    ({ body }) => estimateShipping(body.items, body.province, body.city ?? ""),
    {
      body: t.Object({
        items: t.Array(
          t.Object({
            product_variant_id: t.String({ format: "uuid" }),
            qty: t.Integer({ minimum: 1, maximum: 99 }),
          }),
          { minItems: 1, maxItems: 20 },
        ),
        province: t.String({ minLength: 1, maxLength: 80 }),
        city: t.Optional(t.String({ maxLength: 80 })),
      }),
    },
  );
