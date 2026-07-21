"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Reveal } from "./Reveal";
import { Parallax } from "./Parallax";
import { Magnetic } from "./Magnetic";
import ImageSlot from "./ImageSlot";
import { PRODUCTS, VARIANTS, formatPrice, variantImage } from "@/lib/products";
import { useCartStore } from "@/lib/cartStore";
import { useToastStore } from "@/lib/toastStore";

export default function Sorotan() {
  const [variant, setVariant] = useState(0);
  const spotProduct = PRODUCTS[0];
  const addItem = useCartStore((s) => s.addItem);
  const showToast = useToastStore((s) => s.show);

  return (
    <section id="sorotan" className="px-[5vw] pt-[130px]">
      <Reveal className="mb-11 text-center">
        <div
          className="disp text-soft"
          style={{ fontSize: "clamp(18px,2.4vw,26px)" }}
        >
          Tingkatkan Ruang Anda dengan
        </div>
        <h2
          className="disp mt-1"
          style={{ fontSize: "clamp(34px,5.4vw,72px)", lineHeight: 0.94, letterSpacing: "-0.035em" }}
        >
          Set Furnitur Kasaya
        </h2>
      </Reveal>

      <div className="grid items-center gap-11" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))" }}>
        <Reveal
          className="relative w-full overflow-hidden rounded-2xl bg-card"
          style={{ aspectRatio: "4/5" }}
        >
          <Parallax className="absolute inset-0" strength={26}>
            <AnimatePresence mode="sync">
              <motion.div
                key={variant}
                className="absolute inset-0"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.4, ease: "easeInOut" }}
              >
                <ImageSlot
                  label={VARIANTS[variant].placeholder}
                  src={variantImage(VARIANTS[variant].slot)}
                />
              </motion.div>
            </AnimatePresence>
          </Parallax>
          <span className="absolute left-[18px] top-[18px] rounded-full bg-[rgba(246,241,232,0.86)] px-3.5 py-[7px] text-[10px] font-semibold uppercase tracking-[0.1em] text-ink">
            Sorotan Produk
          </span>
        </Reveal>

        <Reveal>
          <div className="flex items-center gap-3.5 text-[13px] text-soft">
            <span className="text-wood">★★★★★</span> 4.9
            <span className="h-1 w-1 rounded-full bg-line" /> 167 terjual
          </div>
          <h3
            className="disp mt-3.5"
            style={{ fontSize: "clamp(30px,4.4vw,52px)", lineHeight: 0.96, letterSpacing: "-0.03em" }}
          >
            Kursi Santai Rukun
          </h3>
          <p className="mt-4 max-w-[440px] text-[15px] leading-[1.6] text-soft">
            Rangka rotan anyaman tangan dengan bantalan linen yang bisa
            dilepas-cuci. Satu kursi, banyak wajah — pilih material yang
            paling menyatu dengan ruang Anda.
          </p>
          <div className="mt-6 flex items-baseline gap-3">
            <span className="disp text-[40px] tracking-[-0.02em]">
              {formatPrice(spotProduct.price)}
            </span>
            <span className="text-[15px] text-soft line-through">
              {formatPrice(spotProduct.old!)}
            </span>
          </div>
          <div className="mt-[26px]">
            <div className="mb-3.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft">
              Material — {VARIANTS[variant].label}
            </div>
            <div className="flex gap-3.5">
              {VARIANTS.map((v, i) => (
                <button
                  key={v.label}
                  title={v.label}
                  onClick={() => setVariant(i)}
                  className="h-9 w-9 rounded-full border-2 border-bg p-0 transition-shadow duration-200"
                  style={{
                    background: v.color,
                    boxShadow:
                      i === variant
                        ? "0 0 0 2px var(--olive)"
                        : "0 0 0 1px var(--line)",
                  }}
                />
              ))}
            </div>
          </div>
          <div className="mt-8 flex flex-wrap gap-3">
            <Magnetic className="inline-block">
              <button
                onClick={() => showToast("Membuka checkout instan…")}
                className="rounded-full bg-olive px-8 py-4 text-[13px] font-semibold uppercase tracking-[0.06em] text-bg transition-colors hover:bg-olive-d"
              >
                Beli Langsung
              </button>
            </Magnetic>
            <button
              onClick={() => {
                addItem(spotProduct.id);
                showToast("Ditambahkan ke keranjang");
              }}
              className="rounded-full border border-ink px-8 py-4 text-[13px] font-semibold uppercase tracking-[0.06em] text-ink transition-colors hover:bg-ink hover:text-bg"
            >
              Tambah ke Keranjang
            </button>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
