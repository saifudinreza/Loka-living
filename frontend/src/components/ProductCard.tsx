"use client";

import { motion } from "motion/react";
import ImageSlot from "./ImageSlot";
import { formatPrice, type Product } from "@/lib/products";
import { usePdpStore } from "@/lib/pdpStore";
import { useCartStore } from "@/lib/cartStore";
import { useToastStore } from "@/lib/toastStore";
import { useRouter } from "next/navigation";

export default function ProductCard({ product, href }: { product: Product; href?: string }) {
  const router = useRouter();
  const openPdp = usePdpStore((s) => s.open);
  const addItem = useCartStore((s) => s.addItem);
  const showToast = useToastStore((s) => s.show);

  const subline =
    product.badge === "Best Seller"
      ? `${product.mat} · ${product.sold} terjual`
      : product.mat;

  return (
    <motion.article
      layout
      onClick={() => {
        if (href) router.push(href);
        else openPdp(product.id);
      }}
      className="group flex cursor-pointer flex-col gap-4"
      whileHover="hover"
      initial="rest"
      animate="rest"
    >
      <div
        className="relative overflow-hidden rounded-[10px] bg-card"
        style={{ aspectRatio: "1/1.04" }}
      >
        <motion.div
          layoutId={`pdp-image-${product.id}`}
          className="absolute inset-0"
          variants={{ rest: { scale: 1 }, hover: { scale: 1.06 } }}
          transition={{ type: "spring", stiffness: 220, damping: 28 }}
        >
          <ImageSlot label={product.placeholder} src={product.image_url} />
        </motion.div>
        {product.badge && (
          <span className="absolute left-3.5 top-3.5 rounded-full bg-[rgba(246,241,232,0.86)] px-3.5 py-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-ink">
            {product.badge}
          </span>
        )}
        <motion.button
          variants={{
            rest: { opacity: 0, y: 10 },
            hover: { opacity: 1, y: 0 },
          }}
          transition={{ duration: 0.3, ease: "easeOut" }}
          onClick={(e) => {
            e.stopPropagation();
            addItem(product.id);
            showToast("Ditambahkan ke keranjang");
          }}
          className="absolute bottom-3.5 left-3.5 right-3.5 rounded-full bg-ink py-3 text-[13px] font-semibold text-bg"
        >
          Tambah ke Keranjang
        </motion.button>
      </div>
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[15px] font-medium text-ink">
            {product.name}
          </span>
          <span className="text-[12.5px] text-soft">{subline}</span>
        </div>
        <div className="flex flex-shrink-0 items-baseline gap-1.5">
          {product.old && (
            <span className="text-xs text-soft line-through">
              {formatPrice(product.old)}
            </span>
          )}
          <span className="text-sm font-semibold text-ink">
            {formatPrice(product.price)}
          </span>
        </div>
      </div>
    </motion.article>
  );
}
