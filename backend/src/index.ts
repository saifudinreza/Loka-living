import { createApp } from "./app";
import { env } from "./config/env";
import { listenOptions } from "./config/server";

createApp().listen(listenOptions(env.PORT));

console.log(`Loka Living API jalan di http://localhost:${env.PORT}`);
