import { useAuthStore, type AuthUser } from "./authStore";

export const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

export interface AuthResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  user: AuthUser;
}

/** Error dari backend: { error, code } dengan status HTTP-nya. */
export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

// Penanda ringan (bukan rahasia): pernah login di browser ini. Pengunjung yang tidak pernah login tidak perlu
// memanggil /refresh setiap halaman dibuka (yang pasti 401 dan mengotori konsol).
const HINT_KEY = "loka-has-session";

export function hasSessionHint(): boolean {
  try {
    return window.localStorage.getItem(HINT_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSessionHint(on: boolean) {
  try {
    if (on) window.localStorage.setItem(HINT_KEY, "1");
    else window.localStorage.removeItem(HINT_KEY);
  } catch {
    /* abaikan */
  }
}

export function applySession(response: AuthResponse) {
  useAuthStore.getState().setSession(response.access_token, response.user);
  setSessionHint(true);
}

export function dropSession() {
  useAuthStore.getState().clearSession();
  setSessionHint(false);
}

// ---------------------------------------------------------------------------
// Refresh token
//
// Backend memakai ROTASI refresh token: setiap token hanya boleh dipakai sekali, dan memakai token yang sudah
// dipakai dianggap pencurian, lalu SELURUH sesi dicabut. Artinya dua permintaan /refresh bersamaan dengan cookie
// yang sama akan mengeluarkan user sendiri. Dua sumber yang mudah terjadi:
//   1. React Strict Mode (dev) menjalankan efek dua kali, dan beberapa komponen bisa memicu refresh bersamaan.
//   2. Dua tab dibuka bersamaan, keduanya memulihkan sesi.
// Maka refresh dibuat satu-satu: satu permintaan yang sedang berjalan dipakai bersama (promise), dan antar-tab
// diserialkan dengan Web Locks API. Tab kedua menunggu, lalu mengirim cookie yang SUDAH diperbarui tab pertama.
// ---------------------------------------------------------------------------

let refreshInFlight: Promise<AuthResponse | null> | null = null;

// Batas waktu supaya permintaan yang macet tidak menahan kunci antar-tab selamanya (tab lain ikut menunggu tanpa akhir).
const REFRESH_TIMEOUT_MS = 15_000;

async function callRefresh(): Promise<AuthResponse | null> {
  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      credentials: "include",
      signal: typeof AbortSignal.timeout === "function" ? AbortSignal.timeout(REFRESH_TIMEOUT_MS) : undefined,
    });
    if (res.ok) return (await res.json()) as AuthResponse;
    // 401 = sesi memang tidak ada / sudah dicabut. Kegagalan lain (500, jaringan) tidak membuktikan itu,
    // jadi penanda sesi tidak dihapus supaya user tidak "keluar" hanya karena server sedang sibuk.
    if (res.status === 401) setSessionHint(false);
    return null;
  } catch {
    return null;
  }
}

// Serialkan antar-tab dengan Web Locks (kalau tersedia): tab kedua menunggu, lalu memakai cookie yang sudah diperbarui.
async function refreshExclusively(): Promise<AuthResponse | null> {
  const locks = typeof navigator !== "undefined" ? navigator.locks : undefined;
  if (!locks) return callRefresh();
  return await locks.request("loka-auth-refresh", callRefresh);
}

/** Tukar cookie refresh token dengan access token baru. Aman dipanggil bersamaan dari banyak tempat. */
export function refreshSession(): Promise<AuthResponse | null> {
  if (!refreshInFlight) {
    refreshInFlight = refreshExclusively()
      .then((response) => {
        if (response) applySession(response);
        else useAuthStore.getState().clearSession();
        return response;
      })
      .finally(() => {
        refreshInFlight = null;
      });
  }
  return refreshInFlight;
}

// ---------------------------------------------------------------------------

interface ApiFetchInit extends Omit<RequestInit, "body"> {
  body?: unknown;
  /** Untuk endpoint yang butuh login: kalau 401, coba /refresh sekali lalu ulangi. */
  withAuth?: boolean;
}

async function parse<T>(res: Response): Promise<T> {
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(res.status, json?.code ?? "UNKNOWN", json?.error ?? `Permintaan gagal (${res.status}).`);
  }
  return json as T;
}

export async function apiFetch<T>(path: string, init: ApiFetchInit = {}): Promise<T> {
  const { body, withAuth = false, headers, ...rest } = init;

  const send = (token: string | null) =>
    fetch(`${API_BASE}${path}`, {
      ...rest,
      // cookie refresh token (path /api/auth) hanya terkirim kalau credentials: "include"
      credentials: "include",
      headers: {
        ...(body !== undefined ? { "content-type": "application/json" } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

  let res = await send(withAuth ? useAuthStore.getState().accessToken : null);

  // Access token cuma berumur 15 menit. Habis → tukar lewat /refresh sekali, lalu ulangi permintaan yang sama.
  if (withAuth && res.status === 401) {
    const session = await refreshSession();
    if (session) res = await send(session.access_token);
  }

  return parse<T>(res);
}

/** Pesan untuk user dari error apa pun: pesan server kalau ada, selain itu pesan koneksi. */
export function describeError(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return "Tidak bisa terhubung ke server. Periksa koneksi Anda lalu coba lagi.";
}
