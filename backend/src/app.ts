import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { env } from "./config/env";
import { docsRoutes } from "./docs/docs.routes";
import { errorHandler } from "./lib/errors";
import { cartRoutes } from "./modules/account/cart.routes";
import { authRoutes } from "./modules/auth/auth.routes";
import { catalogRoutes } from "./modules/catalog/catalog.routes";
import { shippingRoutes } from "./modules/shipping/shipping.routes";

export interface AppOptions {
  enableJobs?: boolean;
}

// enableJobs dipakai issue 17 (cron); test memanggil createApp({ enableJobs: false }).
export function createApp(_options: AppOptions = {}) {
  const app = new Elysia()
    .use(errorHandler)
    .use(
      cors({
        origin: env.FRONTEND_URL,
        credentials: true,
      }),
    )
    .get("/health", () => ({ status: "ok" }))
    .group("/api", (api) => api.use(authRoutes()).use(catalogRoutes).use(shippingRoutes).use(cartRoutes));

  // Swagger + diagram alur hanya untuk development; di production peta API tidak dibuka.
  if (process.env.NODE_ENV !== "production") app.use(docsRoutes);

  return app;
}

export type App = ReturnType<typeof createApp>;
