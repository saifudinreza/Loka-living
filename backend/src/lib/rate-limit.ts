import { AppError } from "./errors";

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * Limiter sederhana di memori (cukup untuk satu instance; hilang saat restart).
 * Kalau nanti jalan di banyak instance, pindahkan ke Redis.
 */
export function createRateLimiter(max: number, windowMs: number) {
  const buckets = new Map<string, Bucket>();

  return function hit(key: string, now = Date.now()): void {
    // buang bucket kedaluwarsa supaya Map tidak tumbuh tanpa batas
    for (const [k, b] of buckets) {
      if (b.resetAt <= now) buckets.delete(k);
    }

    const bucket = buckets.get(key);
    if (!bucket) {
      buckets.set(key, { count: 1, resetAt: now + windowMs });
      return;
    }

    bucket.count += 1;
    if (bucket.count > max) {
      throw new AppError(429, "TOO_MANY_REQUESTS", "Terlalu banyak percobaan. Coba lagi sebentar lagi.");
    }
  };
}
