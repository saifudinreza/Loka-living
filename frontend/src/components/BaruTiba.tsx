"use client";

import { motion } from "motion/react";
import { Reveal, RevealGroup, RevealItem } from "./Reveal";
import ImageSlot from "./ImageSlot";
import { formatPrice } from "@/lib/products";
import type { Product } from "@/lib/products";
import { usePdpStore } from "@/lib/pdpStore";
import { useCartStore } from "@/lib/cartStore";
import { useToastStore } from "@/lib/toastStore";

export default function BaruTiba({ products, newArrivalSlugs }: { products: Product[]; newArrivalSlugs: string[] }) {
  const openPdp = usePdpStore((s) => s.open);
  const addItem = useCartStore((s) => s.addItem);
  const showToast = useToastStore((s) => s.show);
  const items = newArrivalSlugs.map((slug) => products.find((p) => p.slug === slug)!).filter(Boolean);

  return (
    <section id="baru" className="px-[5vw] pt-[130px]">
      <Reveal className="flex flex-wrap items-center justify-between gap-8">
        <h2
          className="disp"
          style={{ fontSize: "clamp(40px,7vw,104px)", lineHeight: 0.88, letterSpacing: "-0.04em" }}
        >
          Baru Tiba
        </h2>
        <div className="relative h-px min-w-[120px] flex-1 bg-line">
          <span className="absolute -top-[3px] left-0 h-1.5 w-1.5 rounded-full bg-wood" />
          <span className="absolute -top-[3px] right-0 h-1.5 w-1.5 rounded-full bg-wood" />
        </div>
        <p className="max-w-[250px] text-sm leading-[1.55] text-soft">
          Perabot yang menghormati gaya sekaligus lingkungan Anda.
        </p>
      </Reveal>

      <RevealGroup className="mt-[52px] grid grid-cols-1 gap-3.5 sm:grid-cols-3">
        {items.map((item) => (
          <RevealItem
            key={item.id}
            onClick={() => openPdp(item.id)}
            className="flex cursor-pointer items-center gap-5 rounded-2xl border border-transparent p-4 transition-colors hover:border-line"
          >
            <div className="h-[120px] w-[120px] flex-none overflow-hidden rounded-[10px] bg-card">
              <ImageSlot label={item.placeholder} src={item.image_url} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="text-[15px] font-medium text-ink">{item.name}</div>
              <div className="mt-[3px] text-[12.5px] text-soft">{item.mat}</div>
              <div className="mt-3 flex items-baseline gap-2">
                {item.old && (
                  <span className="text-xs text-soft line-through">
                    {formatPrice(item.old)}
                  </span>
                )}
                <span className="text-[15px] font-semibold text-ink">
                  {formatPrice(item.price)}
                </span>
              </div>
            </div>
            <motion.button
              onClick={(e) => {
                e.stopPropagation();
                addItem(item.id);
                showToast("Ditambahkan ke keranjang");
              }}
              whileHover={{ scale: 1.1, rotate: 90 }}
              whileTap={{ scale: 0.9 }}
              transition={{ type: "spring", stiffness: 350, damping: 18 }}
              title="Tambah ke keranjang"
              className="flex h-[42px] w-[42px] flex-none items-center justify-center rounded-full border border-line text-[22px] font-light text-ink transition-colors hover:border-ink hover:bg-ink hover:text-bg"
            >
              +
            </motion.button>
          </RevealItem>
        ))}
      </RevealGroup>
    </section>
  );
}
