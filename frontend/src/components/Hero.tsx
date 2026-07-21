"use client";

import { AnimatePresence, motion } from "motion/react";
import { useState } from "react";
import ImageSlot from "./ImageSlot";
import { Reveal, RevealLines } from "./Reveal";
import { Parallax } from "./Parallax";
import { Magnetic } from "./Magnetic";
import { PRODUCTS, SPOTS, formatPrice } from "@/lib/products";
import { usePdpStore } from "@/lib/pdpStore";

export default function Hero() {
  const [hovered, setHovered] = useState<number | null>(null);
  const openPdp = usePdpStore((s) => s.open);

  return (
    <>
      <header id="top" className="px-[5vw] pt-[158px]">
        <h1
          className="disp text-balance"
          style={{
            fontSize: "clamp(52px,12vw,190px)",
            lineHeight: 0.9,
            letterSpacing: "-0.04em",
          }}
        >
          <RevealLines lines={["Terinspirasi", "oleh Alam"]} />
        </h1>
        <div className="mt-10 flex flex-wrap items-end justify-between gap-8 border-b border-line pb-9">
          <p className="max-w-[420px] text-base leading-[1.55] text-soft">
            Perabot kayu &amp; rotan ramah lingkungan untuk hunian modern —
            dibuat tangan dengan menghormati alam.
          </p>
          <a
            href="#nilai"
            className="inline-flex items-center gap-3 rounded-full border border-line py-3 pl-[22px] pr-3 text-xs font-semibold uppercase tracking-[0.14em] text-ink transition-colors hover:border-ink"
          >
            Brand Ramah Lingkungan
            <span className="flex h-[26px] w-[26px] items-center justify-center rounded-full bg-olive text-xs text-bg">
              →
            </span>
          </a>
        </div>
      </header>

      <section className="px-[5vw] pt-10">
        <Reveal
          className="relative w-full overflow-hidden rounded-2xl bg-card"
          style={{ aspectRatio: "16/8.5" }}
        >
          <Parallax className="absolute inset-0" strength={28}>
            <ImageSlot label="Foto ruang / hero furniture" src="/images/lk-hero.svg" />
          </Parallax>
          {SPOTS.map((s, i) => {
            const p = PRODUCTS.find((x) => x.id === s.pid);
            if (!p) return null;
            return (
              <div
                key={s.pid}
                onClick={() => openPdp(s.pid)}
                onMouseEnter={() => setHovered(i)}
                onMouseLeave={() => setHovered(null)}
                className="absolute z-[3] -translate-x-1/2 -translate-y-1/2 cursor-pointer"
                style={{ top: s.top, left: s.left }}
              >
                <span className="relative block h-[26px] w-[26px] rounded-full bg-[rgba(246,241,232,0.65)]">
                  <span className="absolute inset-[9px] rounded-full bg-olive" />
                </span>
                <AnimatePresence>
                  {hovered === i && (
                    <motion.span
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 6 }}
                      transition={{ duration: 0.25, ease: "easeOut" }}
                      className="pointer-events-none absolute bottom-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-full bg-ink px-[15px] py-[9px] text-xs font-medium text-bg"
                    >
                      {p.name} · {formatPrice(p.price)}
                    </motion.span>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </Reveal>
        <Reveal className="mt-[22px] flex flex-wrap items-center justify-between gap-4">
          <Magnetic className="inline-block">
            <a
              href="#koleksi"
              className="inline-flex items-center gap-3 rounded-full bg-olive py-[15px] pl-7 pr-[15px] text-[13px] font-semibold uppercase tracking-[0.08em] text-bg transition-colors hover:bg-olive-d"
            >
              Belanja Sekarang
              <span className="flex h-6 w-6 items-center justify-center rounded-full border border-[rgba(246,241,232,0.5)] text-[11px]">
                →
              </span>
            </a>
          </Magnetic>
          <div className="flex flex-wrap gap-3">
            <a
              href="#sorotan"
              className="inline-flex items-center gap-2.5 rounded-full border border-line px-[22px] py-[15px] text-xs font-semibold uppercase tracking-[0.1em] text-ink transition-colors hover:border-ink"
            >
              Desain Abadi
            </a>
            <a
              href="#baru"
              className="inline-flex items-center gap-2.5 rounded-full border border-line px-[22px] py-[15px] text-xs font-semibold uppercase tracking-[0.1em] text-ink transition-colors hover:border-ink"
            >
              Furnitur Pilihan
            </a>
          </div>
        </Reveal>
      </section>
    </>
  );
}
