import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface CartLine {
  variantId: string;
  qty: number;
}

interface CartState {
  lines: CartLine[];
  addItem: (variantId: string, qty?: number) => void;
  removeItem: (variantId: string) => void;
  setQty: (variantId: string, qty: number) => void;
  clear: () => void;
  count: () => number;
}

export const useCartStore = create<CartState>()(
  persist(
    (set, get) => ({
      lines: [],
      addItem: (variantId, qty = 1) =>
        set((state) => {
          const existing = state.lines.find((l) => l.variantId === variantId);
          if (existing) {
            return {
              lines: state.lines.map((l) =>
                l.variantId === variantId ? { ...l, qty: l.qty + qty } : l
              ),
            };
          }
          return { lines: [...state.lines, { variantId, qty }] };
        }),
      removeItem: (variantId) =>
        set((state) => ({
          lines: state.lines.filter((l) => l.variantId !== variantId),
        })),
      setQty: (variantId, qty) =>
        set((state) => ({
          lines: state.lines.map((l) =>
            l.variantId === variantId ? { ...l, qty } : l
          ),
        })),
      clear: () => set({ lines: [] }),
      count: () => get().lines.reduce((sum, l) => sum + l.qty, 0),
    }),
    {
      name: "loka-living-cart",
      version: 2,
      migrate: () => ({ lines: [] }),
    }
  )
);
