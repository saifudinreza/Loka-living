import { useAuthStore, type AuthUser } from "./authStore";
import { useCartStore } from "./cartStore";
import {
  apiFetch,
  applySession,
  dropSession,
  hasSessionHint,
  refreshSession,
  type AuthResponse,
} from "./http";
import { takePendingAdd } from "./redirect";
import { useToastStore } from "./toastStore";

export async function login(email: string, password: string): Promise<AuthUser> {
  const response = await apiFetch<AuthResponse>("/auth/login", { method: "POST", body: { email, password } });
  applySession(response);
  return response.user;
}

export async function register(name: string, email: string, password: string): Promise<AuthUser> {
  const response = await apiFetch<AuthResponse>("/auth/register", { method: "POST", body: { name, email, password } });
  applySession(response);
  return response.user;
}

export async function logout(): Promise<void> {
  // Sesi lokal selalu dihapus, walau server gagal dihubungi: user yang menekan "Keluar" harus benar-benar keluar di layar.
  await apiFetch("/auth/logout", { method: "POST" }).catch(() => undefined);
  dropSession();
  useCartStore.getState().reset();
}

// Pemulihan sesi saat halaman dibuka. Promise-nya dibagi supaya tombol yang diklik sebelum pemulihan selesai
// bisa menunggu (ensureSession), bukan salah menganggap user yang sebenarnya login sebagai tamu.
let restorePromise: Promise<void> | null = null;

export function restoreSession(): Promise<void> {
  if (!restorePromise) {
    restorePromise = (async () => {
      if (!hasSessionHint()) {
        useAuthStore.getState().clearSession();
        return;
      }
      await refreshSession(); // sukses → authenticated, gagal → guest (diatur di refreshSession)
    })();
  }
  return restorePromise;
}

/** Menunggu sampai status sesi pasti (bukan "unknown"). */
export async function ensureSession(): Promise<void> {
  if (useAuthStore.getState().status === "unknown") await restoreSession();
}

/**
 * Dipanggil sesaat setelah login/register/Google berhasil: muat keranjang, lalu jalankan pilihan
 * "tambah ke keranjang" yang tersimpan saat user masih tamu (kalau ada).
 */
export async function afterLogin(): Promise<void> {
  const cart = useCartStore.getState();
  const pending = takePendingAdd();

  try {
    await cart.load();
    if (pending) {
      await cart.add(pending.variantId, pending.qty);
      useToastStore.getState().show("Ditambahkan ke keranjang");
    }
  } catch (error) {
    // Login sudah berhasil; kegagalan di sini tidak boleh menggagalkannya. Cukup beri tahu user.
    useToastStore.getState().show(error instanceof Error ? error.message : "Gagal menambahkan ke keranjang");
  }
}
