import { createApp } from "./app";
import { env } from "./config/env";

createApp().listen(env.PORT);

console.log(`Loka Living API jalan di http://localhost:${env.PORT}`);
