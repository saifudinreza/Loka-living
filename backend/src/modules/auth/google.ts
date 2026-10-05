import { Google } from "arctic";
import { env } from "../../config/env";

// Instance hanya dibuat kalau ketiga env terisi; kalau kosong server tetap jalan dan endpoint menjawab 503.
export const google =
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI
    ? new Google(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REDIRECT_URI)
    : null;

export const isGoogleEnabled = () => google !== null;
