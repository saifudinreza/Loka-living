"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import { Reveal } from "@/components/Reveal";
import ProductCard from "@/components/ProductCard";
import Toast from "@/components/Toast";
import ScrollProgress from "@/components/ScrollProgress";
import { FILTERS } from "@/lib/products";
import type { Product } from "@/lib/products";
import { fetchProducts, mapApiProduct } from "@/lib/api";

function CollectionsInner() {
  const sp = useSearchParams();
  const active = sp.get("cat") ?? "Semua";
  const [products, setProducts] = useState<Product[]>([]);

  useEffect(() => {
    fetchProducts()
      .then((api) => setProducts(api.map(mapApiProduct)))
      .catch(() => setProducts([]));
  }, []);

  const list =
    active === "Semua"
      ? products
      : products.filter((p) => p.cat === active);

  return (
    <div className="min-h-screen overflow-x-hidden bg-bg">
      <ScrollProgress />
      <Navbar />
      <main className="px-[5vw] pt-[130px]">
        <Reveal className="flex flex-col items-center text-center">
          <p className="text-sm leading-[1.55] text-soft">
            Perabot yang menghormati gaya sekaligus lingkungan Anda.
          </p>
          <h1
            className="disp mt-2"
            style={{
              fontSize: "clamp(44px,7vw,104px)",
              lineHeight: 0.9,
              letterSpacing: "-0.04em",
            }}
          >
            Koleksi
          </h1>
        </Reveal>

        <Reveal className="mt-[52px] flex flex-wrap justify-center gap-2.5">
          {FILTERS.map((f) => {
            const isActive = f === active;
            const href = f === "Semua" ? "/collections" : `/collections?cat=${f}`;
            return (
              <motion.a
                key={f}
                href={href}
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
              </motion.a>
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
                <ProductCard product={item} href={`/products/${item.slug}`} />
              </motion.div>
            ))}
          </AnimatePresence>
        </motion.div>

        {list.length === 0 && (
          <p className="mt-20 text-center text-sm text-soft">
            Tidak ada produk dalam kategori ini.
          </p>
        )}
      </main>
      <Footer />
      <Toast />
    </div>
  );
}

export default function CollectionsPage() {
  return (
    <Suspense fallback={null}>
      <CollectionsInner />
    </Suspense>
  );
}
