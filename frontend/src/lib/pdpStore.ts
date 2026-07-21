import { create } from "zustand";

interface PdpState {
  openId: string | null;
  open: (id: string) => void;
  close: () => void;
}

export const usePdpStore = create<PdpState>((set) => ({
  openId: null,
  open: (id) => set({ openId: id }),
  close: () => set({ openId: null }),
}));
