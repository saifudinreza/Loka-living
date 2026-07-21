"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useCartStore } from "@/lib/cartStore";

const LINKS = [
  { href: "#koleksi", label: "Koleksi" },
  { href: "#baru", label: "Baru Tiba" },
  { href: "#sorotan", label: "Sorotan" },
  { href: "#nilai", label: "Brand Kami" },
];

export default function Navbar() {
  const [scrolled, setScrolled] = useState(false);
  const count = useCartStore((s) => s.lines.reduce((sum, l) => sum + l.qty, 0));

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <motion.nav
      animate={{
        paddingTop: scrolled ? 14 : 26,
        paddingBottom: scrolled ? 14 : 26,
        backgroundColor: scrolled ? "rgba(246,241,232,0.9)" : "rgba(246,241,232,0)",
        borderBottomColor: scrolled ? "var(--line)" : "rgba(0,0,0,0)",
      }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="fixed left-0 top-0 z-[100] flex w-full items-center justify-between border-b px-[5vw]"
      style={{ backdropFilter: scrolled ? "blur(12px)" : "none" }}
    >
      <a
        href="#top"
        className="disp text-xl font-medium tracking-[-0.02em] text-ink"
      >
        loka living<span className="text-olive">.</span>
      </a>
      <div className="hidden gap-9 text-sm sm:flex">
        {LINKS.map((l) => (
          <a key={l.href} href={l.href}>
            {l.label}
          </a>
        ))}
      </div>
      <motion.button
        whileHover={{ y: -2 }}
        whileTap={{ scale: 0.95 }}
        transition={{ type: "spring", stiffness: 400, damping: 22 }}
        className="flex items-center gap-2.5 rounded-full border border-line py-2 pl-[18px] pr-2 text-sm font-medium text-ink transition-colors hover:border-ink"
        aria-label="Keranjang"
      >
        Keranjang
        <span className="relative flex h-6 min-w-6 items-center justify-center overflow-hidden rounded-full bg-olive px-1.5 text-xs font-semibold text-bg">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={count}
              initial={{ y: 10, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: -10, opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {count}
            </motion.span>
          </AnimatePresence>
        </span>
      </motion.button>
    </motion.nav>
  );
}
