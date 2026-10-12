import { cors } from "@elysiajs/cors";
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
import type { createTransaction } from "./modules/payments/midtrans.service";
import { webhookRoutes } from "./modules/payments/webhook.routes";
import { shippingRoutes } from "./modules/shipping/shipping.routes";

/** Dependensi yang bisa diganti (test), mis. klien Midtrans palsu. Default: yang sungguhan. */
export interface AppDeps {
  midtrans?: {
    /** Pengganti pemanggil Snap untuk `confirm`. */
    createTransaction?: typeof createTransaction;
    /** Server key untuk memverifikasi signature webhook. Default: MIDTRANS_SERVER_KEY dari env. */
    serverKey?: string;
  };
}

export interface AppOptions {
  deps?: AppDeps;
  enableJobs?: boolean;
}

// enableJobs dipakai issue 17 (cron); test memanggil createApp({ enableJobs: false }).
export function createApp(options: AppOptions = {}) {
  const midtrans = options.deps?.midtrans;
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
        .use(checkoutRoutes({ createTransaction: midtrans?.createTransaction }))
        .use(webhookRoutes({ serverKey: midtrans?.serverKey })),
    );

  // Swagger + diagram alur hanya untuk development; di production peta API tidak dibuka.
  if (process.env.NODE_ENV !== "production") app.use(docsRoutes);

  return app;
}

export type App = ReturnType<typeof createApp>;
