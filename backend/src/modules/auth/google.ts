/**
 * google.ts — menyiapkan "klien" Google untuk login OAuth.
 *
 * `Google` (dari library arctic) adalah objek yang tahu cara berbicara dengan
 * server Google: membuat alamat login dan menukar "kode" dengan data user.
 * Ia butuh tiga hal dari .env:
 *   GOOGLE_CLIENT_ID      → "nama pengguna" aplikasi kita di Google
 *   GOOGLE_CLIENT_SECRET  → "kata sandi" aplikasi kita (JANGAN pernah di-commit)
 *   GOOGLE_REDIRECT_URI   → alamat balik setelah login; harus SAMA PERSIS dengan
 *                           yang didaftarkan di Google Cloud Console
 *
 * Kalau salah satu kosong, `google` bernilai null dan fitur Google dimatikan
 * dengan rapi (endpoint menjawab 503), bukan membuat server gagal menyala.
 * Cara menyiapkannya ada di README bagian "Google login".
 */
import { Google } from "arctic";
import { env } from "../../config/env";

// Instance hanya dibuat kalau ketiga env terisi; kalau kosong server tetap jalan dan endpoint menjawab 503.
export const google =
  env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET && env.GOOGLE_REDIRECT_URI
    ? new Google(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REDIRECT_URI)
    : null;

/** true kalau Google sudah dikonfigurasi lengkap. */
export const isGoogleEnabled = () => google !== null;
