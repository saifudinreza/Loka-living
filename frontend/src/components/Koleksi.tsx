"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Reveal } from "./Reveal";
import ProductCard from "./ProductCard";
import { FILTERS, PRODUCTS } from "@/lib/products";

export default function Koleksi() {
  const [active, setActive] = useState<(typeof FILTERS)[number]>("Semua");

  const list =
    active === "Semua" ? PRODUCTS : PRODUCTS.filter((p) => p.cat === active);

  return (
    <section id="koleksi" className="px-[5vw] pt-[130px]">
      <div className="grid items-center gap-8" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))" }}>
        <Reveal className="flex flex-col gap-3.5">
          <p className="max-w-[280px] text-sm leading-[1.55] text-soft">
            Perabot yang menghormati gaya sekaligus lingkungan Anda.
          </p>
          <div className="relative h-px max-w-[340px] bg-line">
            <span className="absolute -top-[3px] left-0 h-1.5 w-1.5 rounded-full bg-wood" />
            <span className="absolute -top-[3px] right-0 h-1.5 w-1.5 rounded-full bg-wood" />
          </div>
        </Reveal>
        <Reveal className="justify-self-end text-right">
          <h2
            className="disp"
            style={{
              fontSize: "clamp(44px,7vw,104px)",
              lineHeight: 0.9,
              letterSpacing: "-0.04em",
            }}
          >
            Koleksi
          </h2>
          <a
            href="/collections"
            className="mt-4 inline-block text-[13px] font-semibold tracking-[0.06em] text-olive underline-offset-4 hover:underline"
          >
            Lihat Semua →
          </a>
        </Reveal>
      </div>

      <Reveal className="mt-[52px] flex flex-wrap justify-center gap-2.5">
        {FILTERS.map((f) => {
          const isActive = f === active;
          return (
            <motion.button
              key={f}
              onClick={() => setActive(f)}
              whileHover={{ y: -2 }}
              whileTap={{ scale: 0.94 }}
              transition={{ type: "spring", stiffness: 400, damping: 22 }}
              className="rounded-full px-[22px] py-[11px] text-[12.5px] font-semibold tracking-[0.02em] transition-colors duration-200"
              style={{
                border: isActive ? "1px solid var(--olive)" : "1px solid var(--line)",
                background: isActive ? "var(--olive)" : "transparent",
                color: isActive ? "var(--bg)" : "var(--ink)",
              }}
            >
              {f}
            </motion.button>
          );
        })}
      </Reveal>

      <motion.div
        layout
        className="mt-11 grid grid-cols-2 gap-3.5 sm:gap-[22px] lg:grid-cols-4"
      >
        <AnimatePresence mode="popLayout">
          {list.map((item) => (
            <motion.div
              key={item.id}
              layout
              initial={{ opacity: 0, scale: 0.92 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.92 }}
              transition={{ duration: 0.35, ease: [0.19, 1, 0.22, 1] }}
            >
              <ProductCard product={item} />
            </motion.div>
          ))}
        </AnimatePresence>
      </motion.div>
    </section>
  );
}
