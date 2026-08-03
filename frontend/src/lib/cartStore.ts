import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface CartLine {
  productId: string;
  qty: number;
}

interface CartState {
  lines: CartLine[];
  addItem: (productId: string, qty?: number) => void;
  removeItem: (productId: string) => void;
  setQty: (productId: string, qty: number) => void;
  clear: () => void;
  count: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      lines: [],
      addItem: (productId, qty = 1) =>
        set((state) => {
          const existing = state.lines.find((l) => l.productId === productId);
          if (existing) {
            return {
              lines: state.lines.map((l) =>
                l.productId === productId ? { ...l, qty: l.qty + qty } : l
              ),
            };
          }
          return { lines: [...state.lines, { productId, qty }] };
        }),
      removeItem: (productId) =>
        set((state) => ({
          lines: state.lines.filter((l) => l.productId !== productId),
        })),
      setQty: (productId, qty) =>
        set((state) => ({
          lines: state.lines.map((l) =>
            l.productId === productId ? { ...l, qty } : l
          ),
        })),
      clear: () => set({ lines: [] }),
      count: () => get().lines.reduce((sum, l) => sum + l.qty, 0),
    }),
    { name: "loka-living-cart" }
  )
);
