import { create } from "zustand";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
}

// unknown       = sesi belum dipulihkan (halaman baru dibuka); jangan anggap tamu dulu
// guest         = tidak ada sesi
// authenticated = login
export type AuthStatus = "unknown" | "guest" | "authenticated";

interface AuthState {
  status: AuthStatus;
  accessToken: string | null;
  user: AuthUser | null;
  setSession: (accessToken: string, user: AuthUser) => void;
  clearSession: () => void;
}

// Sengaja TIDAK memakai persist: access token hanya di memori. Menyimpannya di localStorage membuatnya
// bisa dicuri lewat XSS. Refresh token ada di cookie httpOnly dan dipakai untuk memulihkan sesi saat halaman dibuka.
export const useAuthStore = create<AuthState>((set) => ({
  status: "unknown",
  accessToken: null,
  user: null,
  setSession: (accessToken, user) => set({ status: "authenticated", accessToken, user }),
  clearSession: () => set({ status: "guest", accessToken: null, user: null }),
}));
