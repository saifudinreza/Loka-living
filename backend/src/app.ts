import { cors } from "@elysiajs/cors";
import { cron } from "@elysiajs/cron";
import { Elysia } from "elysia";
import { env } from "./config/env";
import { docsRoutes } from "./docs/docs.routes";
import { errorHandler } from "./lib/errors";
import { addressesRoutes } from "./modules/account/addresses.routes";
import { cartRoutes } from "./modules/account/cart.routes";
import { wishlistRoutes } from "./modules/account/wishlist.routes";
import { authRoutes } from "./modules/auth/auth.routes";
import { catalogRoutes } from "./modules/catalog/catalog.routes";
import { checkoutRoutes } from "./modules/checkout/checkout.routes";
import { shippingRoutes } from "./modules/shipping/shipping.routes";
import { cleanupExpiredRefreshTokens, releaseExpiredReservations } from "./jobs/release-expired-reservations";

export interface AppOptions {
  enableJobs?: boolean;
}

// enableJobs dipakai issue 17 (cron); test memanggil createApp({ enableJobs: false }).
export function createApp(options: AppOptions = {}) {
  const { enableJobs = true } = options;
  const app = new Elysia()
    .use(errorHandler)
    .use(
      cors({
        origin: env.FRONTEND_URL,
        credentials: true,
      }),
    )
    .get("/health", () => ({ status: "ok" }))
    .group("/api", (api) =>
      api
        .use(authRoutes())
        .use(catalogRoutes)
        .use(shippingRoutes)
        .use(cartRoutes)
        .use(wishlistRoutes)
        .use(addressesRoutes)
        .use(checkoutRoutes()),
    );

  // Swagger + diagram alur hanya untuk development; di production peta API tidak dibuka.
  if (process.env.NODE_ENV !== "production") app.use(docsRoutes);

  // Cron jobs (hanya aktif kalau enableJobs=true, default true; test mematikan dengan enableJobs: false)
  if (enableJobs) {
    // Tiap menit: lepas reservasi order draft yang kedaluwarsa
    app.use(
      cron({
        name: "release-expired-reservations",
        pattern: "* * * * *",
        async run() {
          const released = await releaseExpiredReservations();
          if (released > 0) {
            console.log(`[cron] Released ${released} expired reservations`);
          }
        },
      }),
    );

    // Harian jam 03:00: bersihkan refresh token kedaluwarsa > 7 hari
    app.use(
      cron({
        name: "cleanup-expired-refresh-tokens",
        pattern: "0 3 * * *",
        async run() {
          const deleted = await cleanupExpiredRefreshTokens();
          if (deleted > 0) {
            console.log(`[cron] Cleaned up ${deleted} expired refresh tokens`);
          }
        },
      }),
    );
  }

  return app;
}

export type App = ReturnType<typeof createApp>;