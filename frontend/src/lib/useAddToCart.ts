"use client";

import { useRouter } from "next/navigation";
import { useCallback } from "react";
import { ensureSession } from "./authApi";
import { useAuthStore } from "./authStore";
import { useCartStore } from "./cartStore";
import { savePendingAdd } from "./redirect";
import { useToastStore } from "./toastStore";

/**
 * Perilaku tombol "Tambah ke Keranjang" (dipakai di semua tempat):
 *   - sudah login → tambah ke keranjang di server, lalu toast
 *   - tamu        → simpan pilihannya sementara, arahkan ke login; setelah login pilihan itu dijalankan
 */
export function useAddToCart() {
  const router = useRouter();
  const showToast = useToastStore((s) => s.show);

  return useCallback(
    async (variantId: string | undefined, qty = 1) => {
      if (!variantId) return;

      // Sesi mungkin masih dipulihkan (halaman baru dibuka). Tunggu, jangan salah menganggap user login sebagai tamu.
      await ensureSession();

      if (useAuthStore.getState().status !== "authenticated") {
        const returnTo = window.location.pathname + window.location.search + window.location.hash;
        savePendingAdd({ variantId, qty });
        showToast("Masuk dulu untuk menambah ke keranjang");
        router.push(`/login?next=${encodeURIComponent(returnTo)}`);
        return;
      }

      try {
        await useCartStore.getState().add(variantId, qty);
        showToast("Ditambahkan ke keranjang");
      } catch (error) {
        showToast(error instanceof Error ? error.message : "Gagal menambahkan ke keranjang");
      }
    },
    [router, showToast],
  );
}
