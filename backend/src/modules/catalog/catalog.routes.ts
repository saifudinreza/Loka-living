import { Elysia, t } from "elysia";
import { getProductBySlug, listProducts, listRooms } from "./catalog.service";

// Katalog publik dan jarang berubah: cache di browser/CDN mengurangi beban database tanpa Redis.
const cache = (set: { headers: Record<string, string | number | undefined> }, seconds: number) => {
  set.headers["cache-control"] = `public, max-age=${seconds}`;
};

export const catalogRoutes = new Elysia()
  .get("/rooms", async ({ set }) => {
    const data = await listRooms();
    cache(set, 300);
    return { data };
  })
  .get(
    "/products",
    async ({ query, set }) => {
      const data = await listProducts({
        room: query.room,
        featured: query.featured === "true" ? true : undefined,
        sort: query.sort,
        limit: query.limit,
      });
      cache(set, 60);
      return { data };
    },
    {
      query: t.Object({
        room: t.Optional(t.String({ maxLength: 60 })),
        featured: t.Optional(t.Literal("true")),
        sort: t.Optional(t.Literal("newest")),
        limit: t.Optional(t.Numeric({ minimum: 1, maximum: 50 })),
      }),
    },
  )
  .get("/products/:slug", async ({ params, set }) => {
    const data = await getProductBySlug(params.slug);
    cache(set, 60);
    return { data };
  });
