import { create } from "zustand";
import { apiFetch } from "./http";

// Bentuk keranjang dari GET/PUT/DELETE /api/cart. Harga dan stok SELALU dari server (tidak dihitung di klien).
export interface CartItem {
  product_variant_id: string;
  qty: number;
  product: { slug: string; name: string };
  material: string | null;
  color_hex: string | null;
  unit_price: number;
  subtotal: number;
  image_url: string | null;
  stock_available: number;
  is_available: boolean;
}

export interface Cart {
  items: CartItem[];
  subtotal_amount: number;
  item_count: number;
}

const MAX_QTY = 99;

interface CartState {
  // null = belum dimuat. Keranjang milik akun di server; TIDAK disimpan ke storage browser.
  cart: Cart | null;
  loading: boolean;
  load: () => Promise<void>;
  /** Menambah `qty` ke jumlah yang sekarang (maksimal 99). */
  add: (variantId: string, qty?: number) => Promise<void>;
  setQty: (variantId: string, qty: number) => Promise<void>;
  remove: (variantId: string) => Promise<void>;
  reset: () => void;
}

// Respons bisa tiba tidak berurutan (mis. muat keranjang dari AuthProvider dan dari afterLogin berjalan bersamaan
// dengan penambahan barang). Setiap permintaan diberi nomor saat DIMULAI, dan hasilnya hanya dipakai kalau lebih baru
// dari yang terakhir dipakai, jadi respons lama yang terlambat tidak menimpa keranjang yang lebih baru.
let issued = 0;
let applied = 0;

export const useCartStore = create<CartState>((set, get) => ({
  cart: null,
  loading: false,

  load: async () => {
    const ticket = ++issued;
    set({ loading: true });
    try {
      const { data } = await apiFetch<{ data: Cart }>("/cart", { withAuth: true });
      if (ticket > applied) {
        applied = ticket;
        set({ cart: data });
      }
    } finally {
      set({ loading: false });
    }
  },

  add: async (variantId, qty = 1) => {
    // PUT men-set jumlah (bukan menambah), jadi jumlah sekarang perlu diketahui dulu
    if (get().cart === null) await get().load();
    const current = get().cart?.items.find((i) => i.product_variant_id === variantId)?.qty ?? 0;
    await get().setQty(variantId, Math.min(MAX_QTY, current + qty));
  },

  setQty: async (variantId, qty) => {
    const ticket = ++issued;
    const { data } = await apiFetch<{ data: Cart }>(`/cart/items/${variantId}`, {
      method: "PUT",
      body: { qty },
      withAuth: true,
    });
    if (ticket > applied) {
      applied = ticket;
      set({ cart: data });
    }
  },

  remove: async (variantId) => {
    const ticket = ++issued;
    const { data } = await apiFetch<{ data: Cart }>(`/cart/items/${variantId}`, {
      method: "DELETE",
      withAuth: true,
    });
    if (ticket > applied) {
      applied = ticket;
      set({ cart: data });
    }
  },

  // Saat keluar: respons yang masih di perjalanan tidak boleh mengisi ulang keranjang user yang sudah keluar
  reset: () => {
    applied = ++issued;
    set({ cart: null, loading: false });
  },
}));
