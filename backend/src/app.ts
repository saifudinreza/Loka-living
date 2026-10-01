import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { env } from "./config/env";
import { errorHandler } from "./lib/errors";

export interface AppOptions {
  enableJobs?: boolean;
}

// enableJobs dipakai issue 17 (cron); test memanggil createApp({ enableJobs: false }).
export function createApp(_options: AppOptions = {}) {
  return new Elysia()
    .use(errorHandler)
    .use(
      cors({
        origin: env.FRONTEND_URL,
        credentials: true,
      }),
    )
    .get("/health", () => ({ status: "ok" }))
    .group("/api", (api) => api);
}

export type App = ReturnType<typeof createApp>;
