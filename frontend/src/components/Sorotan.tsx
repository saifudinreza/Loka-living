"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { Button3D } from "./Button3D";
import { ScrollReveal, ParallaxDepth } from "./ScrollReveal";
import ImageSlot from "./ImageSlot";
import { formatPrice } from "@/lib/products";
import type { Product } from "@/lib/products";
import { useAddToCart } from "@/lib/useAddToCart";

export default function Sorotan({ products, featuredSlug }: { products: Product[]; featuredSlug: string }) {
  const [variant, setVariant] = useState(0);
  const highlight = products.find((p) => p.slug === featuredSlug);
  const addToCart = useAddToCart();
  const router = useRouter();

  if (!highlight) return null;

  return (
    <section id="sorotan" className="px-[5vw] pt-[130px]">
      <ScrollReveal preset="fade-scale" className="mb-11 text-center">
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
      </ScrollReveal>

      <div className="grid items-center gap-11" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(320px,1fr))" }}>
        <ScrollReveal
          preset="zoom-blur"
          className="relative w-full overflow-hidden rounded-2xl bg-card"
          style={{ aspectRatio: "4/5" }}
        >
          <ParallaxDepth className="absolute inset-0" strength={30} depth={0}>
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
                  label={highlight.variants[variant]?.label || highlight.name}
                  src={highlight.variants[variant]?.image_url || highlight.image_url}
                />
              </motion.div>
            </AnimatePresence>
          </ParallaxDepth>
          <span className="absolute left-[18px] top-[18px] rounded-full bg-[rgba(246,241,232,0.86)] px-3.5 py-[7px] text-[10px] font-semibold uppercase tracking-[0.1em] text-ink">
            Sorotan Produk
          </span>
        </ScrollReveal>

        <ScrollReveal preset="slide-right">
          <div className="flex items-center gap-3.5 text-[13px] text-soft">
            <span className="text-wood">★★★★★</span> 4.9
            <span className="h-1 w-1 rounded-full bg-line" /> 167 terjual
          </div>
          <h3
            className="disp mt-3.5"
            style={{ fontSize: "clamp(30px,4.4vw,52px)", lineHeight: 0.96, letterSpacing: "-0.03em" }}
          >
            {highlight.name}
          </h3>
          <p className="mt-4 max-w-[440px] text-[15px] leading-[1.6] text-soft">
            {highlight.desc}
          </p>
          <div className="mt-6 flex items-baseline gap-3">
            <span className="disp text-[40px] tracking-[-0.02em]">
              {formatPrice(highlight.price)}
            </span>
            {highlight.old && (
              <span className="text-[15px] text-soft line-through">
                {formatPrice(highlight.old)}
              </span>
            )}
          </div>
          <div className="mt-[26px]">
            <div className="mb-3.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft">
              Material — {highlight.variants[variant]?.label || highlight.mat}
            </div>
            <div className="flex gap-3.5">
              {highlight.variants.map((v, i) => (
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
            <Button3D
              variant="primary"
              onClick={() =>
                router.push(`/checkout?vid=${highlight.variants[variant]?.id}&qty=1`)
              }
            >
              Beli Langsung
            </Button3D>
            <Button3D
              variant="outline"
              onClick={() => {
                void addToCart(highlight.variants[variant]?.id);
              }}
            >
              Tambah ke Keranjang
            </Button3D>
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
