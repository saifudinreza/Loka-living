import { env } from "../config/env";

/** Bagian konteks Elysia yang dibutuhkan untuk mengetahui alamat klien. */
export interface IpContext {
  request: Request;
  server: { requestIP(r: Request): { address: string } | null } | null;
}

/**
 * Alamat IP klien, dipakai sebagai kunci rate limit.
 *
 * Tanpa proxy (TRUSTED_PROXY_HOPS=0, default): alamat koneksi TCP. Header `X-Forwarded-For` DIABAIKAN, karena klien
 * bisa mengisinya sesukanya (memalsukan IP untuk lolos dari pembatas).
 *
 * Di belakang reverse proxy: alamat koneksi adalah alamat proxy, jadi SEMUA pengunjung berbagi satu jatah (sepuluh `init`
 * per menit untuk seluruh toko!). Set TRUSTED_PROXY_HOPS ke jumlah proxy tepercaya di depan server (mis. 1 untuk satu
 * Nginx/Cloudflare). IP klien diambil dari ujung KANAN daftar `X-Forwarded-For`, yaitu entri yang ditambahkan proxy
 * kita sendiri; entri di kirinya bisa dipalsukan klien dan tidak dipercaya.
 */
export function clientIp(ctx: IpContext, trustedHops: number = env.TRUSTED_PROXY_HOPS): string {
  const socket = ctx.server?.requestIP(ctx.request)?.address ?? "unknown";
  if (trustedHops <= 0) return socket;

  const forwarded = (ctx.request.headers.get("x-forwarded-for") ?? "")
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  return forwarded[forwarded.length - trustedHops] ?? socket;
}
