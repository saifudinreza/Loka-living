"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useDragControls, type PanInfo } from "motion/react";
import ImageSlot from "./ImageSlot";
import { VARIANTS, findProduct, formatPrice, productImage } from "@/lib/products";
import { usePdpStore } from "@/lib/pdpStore";
import { useCartStore } from "@/lib/cartStore";
import { useToastStore } from "@/lib/toastStore";

const EASE = [0.19, 1, 0.22, 1] as const;

export default function PdpOverlay() {
  const openId = usePdpStore((s) => s.openId);
  const close = usePdpStore((s) => s.close);
  const addItem = useCartStore((s) => s.addItem);
  const showToast = useToastStore((s) => s.show);
  const [mat, setMat] = useState(0);
  const dragControls = useDragControls();

  const product = openId ? findProduct(openId) : undefined;

  const handleDragEnd = (
    _e: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo
  ) => {
    if (info.offset.y > 120 || info.velocity.y > 600) close();
  };

  useEffect(() => {
    if (openId) {
      setMat(0);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [openId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  return (
    <AnimatePresence>
      {product && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed inset-0 z-[200] overflow-y-auto bg-bg"
        >
          <motion.div
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.55 }}
            dragSnapToOrigin
            onDragEnd={handleDragEnd}
            className="mx-auto max-w-[1160px] px-[5vw] pb-[90px] pt-8"
          >
            <div
              onPointerDown={(e) => dragControls.start(e)}
              className="mb-6 flex cursor-grab justify-center touch-none active:cursor-grabbing sm:hidden"
              aria-hidden
            >
              <span className="h-1.5 w-10 rounded-full bg-line" />
            </div>
            <motion.button
              onClick={close}
              whileHover={{ x: -3 }}
              whileTap={{ scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 25 }}
              className="mb-8 inline-flex items-center gap-2 rounded-full border border-line px-[22px] py-[11px] text-[13px] font-medium text-ink transition-colors hover:border-ink"
            >
              ← Kembali ke koleksi
            </motion.button>
            <div
              className="grid items-start gap-[52px]"
              style={{ gridTemplateColumns: "repeat(auto-fit,minmax(300px,1fr))" }}
            >
              <motion.div
                layoutId={`pdp-image-${product.id}`}
                transition={{ duration: 0.6, ease: EASE }}
                className="relative w-full overflow-hidden rounded-2xl bg-card"
                style={{ aspectRatio: "4/5" }}
              >
                <ImageSlot label={product.placeholder} src={productImage(product.id)} />
              </motion.div>

              <div>
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-soft">
                  {product.cat}
                </span>
                <h2
                  className="disp mt-3"
                  style={{ fontSize: "clamp(32px,4.6vw,58px)", lineHeight: 0.96, letterSpacing: "-0.03em" }}
                >
                  {product.name}
                </h2>
                <div className="mt-5 flex items-baseline gap-3">
                  <span className="disp text-[34px] tracking-[-0.02em]">
                    {formatPrice(product.price)}
                  </span>
                  {product.old && (
                    <span className="text-[15px] text-soft line-through">
                      {formatPrice(product.old)}
                    </span>
                  )}
                </div>

                <div className="mt-[22px] max-w-[300px]">
                  <div className="mb-2 flex justify-between text-xs text-soft">
                    <span>Stok terbatas</span>
                    <span>{product.stock} / 100 tersedia</span>
                  </div>
                  <div className="h-1 overflow-hidden rounded-full bg-line">
                    <div
                      className="h-full rounded-full bg-wood"
                      style={{ width: `${product.stock}%` }}
                    />
                  </div>
                </div>

                <p className="mt-6 max-w-[460px] text-[15px] leading-[1.65] text-soft">
                  {product.desc}
                </p>

                <div className="mt-7">
                  <div className="mb-3.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-soft">
                    Material
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    {VARIANTS.map((v, i) => {
                      const isActive = i === mat;
                      return (
                        <motion.button
                          key={v.label}
                          onClick={() => setMat(i)}
                          whileHover={{ y: -2 }}
                          whileTap={{ scale: 0.94 }}
                          transition={{ type: "spring", stiffness: 400, damping: 22 }}
                          className="rounded-full px-4 py-[9px] text-xs font-semibold transition-colors duration-200"
                          style={{
                            border: isActive ? "1px solid var(--olive)" : "1px solid var(--line)",
                            background: isActive ? "var(--olive)" : "transparent",
                            color: isActive ? "var(--bg)" : "var(--ink)",
                          }}
                        >
                          {v.label}
                        </motion.button>
                      );
                    })}
                  </div>
                </div>

                <div className="mt-7 grid grid-cols-3 overflow-hidden rounded-xl border border-line">
                  {[
                    ["Panjang", product.dims.p],
                    ["Lebar", product.dims.l],
                    ["Tinggi", product.dims.t],
                  ].map(([label, val], i) => (
                    <div
                      key={label}
                      className={`p-[18px] ${i < 2 ? "border-r border-line" : ""}`}
                    >
                      <div className="text-[10.5px] uppercase tracking-[0.1em] text-soft">
                        {label}
                      </div>
                      <div className="disp mt-1.5 text-[22px]">
                        {val}
                        <span className="text-xs text-soft"> cm</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="mt-8 flex flex-wrap gap-3">
                  <motion.button
                    onClick={() => showToast("Membuka checkout instan…")}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    transition={{ type: "spring", stiffness: 400, damping: 20 }}
                    className="min-w-[180px] flex-1 rounded-full bg-olive px-[30px] py-[17px] text-[13px] font-semibold uppercase tracking-[0.06em] text-bg transition-colors hover:bg-olive-d"
                  >
                    Beli Langsung
                  </motion.button>
                  <motion.button
                    onClick={() => {
                      addItem(product.id);
                      showToast("Ditambahkan ke keranjang");
                    }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    transition={{ type: "spring", stiffness: 400, damping: 20 }}
                    className="rounded-full border border-ink px-7 py-[17px] text-[13px] font-semibold uppercase tracking-[0.06em] text-ink transition-colors hover:bg-ink hover:text-bg"
                  >
                    Keranjang
                  </motion.button>
                </div>

                <div className="mt-6 flex flex-wrap gap-5 text-[12.5px] text-soft">
                  <span>Garansi rangka 5 tahun</span>
                  <span className="text-line">·</span>
                  <span>Gratis konsultasi ruang</span>
                  <span className="text-line">·</span>
                  <span>Cicilan tanpa kartu</span>
                </div>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
