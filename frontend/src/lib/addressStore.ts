import { create } from "zustand";
import type { Address } from "./addressSchema";
import { apiFetch } from "./http";

// Buku alamat milik user, disinkronkan dengan /api/addresses. Berisi DATA PRIBADI (nama, telepon, alamat), jadi
// sengaja tidak memakai persist: tidak pernah ditulis ke localStorage/sessionStorage.

interface AddressState {
  /** null = belum dimuat */
  addresses: Address[] | null;
  loading: boolean;
  load: () => Promise<void>;
  create: (payload: Record<string, unknown>) => Promise<void>;
  update: (id: string, payload: Record<string, unknown>) => Promise<void>;
  setDefault: (id: string) => Promise<void>;
  remove: (id: string) => Promise<void>;
  reset: () => void;
}

// Respons bisa tiba tidak berurutan. Setiap pemuatan diberi nomor saat DIMULAI; hasilnya hanya dipakai kalau lebih baru
// dari yang terakhir dipakai (pola yang sama dengan cartStore).
let issued = 0;
let applied = 0;

const fetchList = () => apiFetch<{ data: Address[] }>("/addresses", { withAuth: true });

export const useAddressStore = create<AddressState>((set, get) => ({
  addresses: null,
  loading: false,

  load: async () => {
    const ticket = ++issued;
    set({ loading: true });
    try {
      const { data } = await fetchList();
      if (ticket > applied) {
        applied = ticket;
        set({ addresses: data });
      }
    } finally {
      set({ loading: false });
    }
  },

  // Setiap perubahan diikuti pemuatan ulang dari server: menjadikan satu alamat utama atau menghapus alamat utama
  // mengubah alamat LAIN juga, dan server yang memutuskan hasilnya. Klien tidak menebak (mis. alamat utama berikutnya).
  create: async (payload) => {
    await apiFetch("/addresses", { method: "POST", body: payload, withAuth: true });
    await get().load();
  },

  update: async (id, payload) => {
    await apiFetch(`/addresses/${id}`, { method: "PATCH", body: payload, withAuth: true });
    await get().load();
  },

  setDefault: async (id) => {
    await get().update(id, { is_default: true });
  },

  remove: async (id) => {
    await apiFetch(`/addresses/${id}`, { method: "DELETE", withAuth: true });
    await get().load();
  },

  // Saat keluar: respons yang masih di perjalanan tidak boleh mengisi ulang data user yang sudah keluar
  reset: () => {
    applied = ++issued;
    set({ addresses: null, loading: false });
  },
}));
