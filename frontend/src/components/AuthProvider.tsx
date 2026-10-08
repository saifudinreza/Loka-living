"use client";

import { useEffect } from "react";
import { restoreSession } from "@/lib/authApi";
import { useAddressStore } from "@/lib/addressStore";
import { useAuthStore } from "@/lib/authStore";
import { useCartStore } from "@/lib/cartStore";

// Memulihkan sesi saat halaman dibuka dan menjaga keranjang sesuai status login:
// login → muat keranjang dari server, keluar → kosongkan keranjang di memori.
export default function AuthProvider({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    // keranjang lama (sebelum keranjang pindah ke akun) dulu disimpan di localStorage; buang sisanya
    try {
      window.localStorage.removeItem("loka-living-cart");
    } catch {
      /* storage diblokir: abaikan */
    }

    void restoreSession();

    return useAuthStore.subscribe((state, previous) => {
      if (state.status === previous.status) return;
      const cart = useCartStore.getState();
      if (state.status === "authenticated") void cart.load().catch(() => undefined);
      else if (state.status === "guest") {
        cart.reset();
        useAddressStore.getState().reset();
      }
    });
  }, []);

  return <>{children}</>;
}
