// Helper pengalihan setelah login: tujuan aman (anti open-redirect) dan pilihan "tambah ke keranjang" yang tertunda.
// Semuanya memakai sessionStorage: hanya berlaku di tab itu dan hilang saat tab ditutup.

const PENDING_KEY = "loka-pending-cart";
const NEXT_KEY = "loka-auth-next";

/**
 * Parameter `next` datang dari URL, jadi bisa dipalsukan. Hanya path internal yang diterima:
 * diawali "/", bukan "//" (protocol-relative) dan tanpa backslash (browser menganggap "/\evil.com" = "//evil.com")
 * atau karakter kontrol. Selain itu jatuh ke `fallback`.
 */
export function safeNext(raw: string | null | undefined, fallback = "/"): string {
  if (!raw) return fallback;
  if (!raw.startsWith("/") || raw.startsWith("//")) return fallback;
  if (/[\\\u0000-\u001f\u007f]/.test(raw)) return fallback;
  return raw;
}

export interface PendingAdd {
  variantId: string;
  qty: number;
}

function read(key: string): string | null {
  try {
    return window.sessionStorage.getItem(key);
  } catch {
    return null; // mode privat / storage diblokir
  }
}

function write(key: string, value: string) {
  try {
    window.sessionStorage.setItem(key, value);
  } catch {
    /* tanpa storage fitur ini sekadar tidak berjalan */
  }
}

function remove(key: string) {
  try {
    window.sessionStorage.removeItem(key);
  } catch {
    /* abaikan */
  }
}

export function savePendingAdd(pending: PendingAdd) {
  write(PENDING_KEY, JSON.stringify(pending));
}

/** Dibaca SEKALI lalu dihapus (sebelum dijalankan), supaya tidak berulang kalau ada yang gagal. Isi yang aneh dibuang. */
export function takePendingAdd(): PendingAdd | null {
  const raw = read(PENDING_KEY);
  remove(PENDING_KEY);
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<PendingAdd>;
    if (typeof value.variantId !== "string" || value.variantId === "") return null;
    if (!Number.isInteger(value.qty) || value.qty! < 1 || value.qty! > 99) return null;
    return { variantId: value.variantId, qty: value.qty! };
  } catch {
    return null;
  }
}

/** Tujuan setelah login Google (halaman penuh keluar-masuk situs, jadi `next` dititipkan di sessionStorage). */
export function saveNext(path: string) {
  write(NEXT_KEY, safeNext(path));
}

export function takeNext(fallback = "/"): string {
  const value = read(NEXT_KEY);
  remove(NEXT_KEY);
  return safeNext(value, fallback);
}
