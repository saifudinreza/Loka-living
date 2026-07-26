"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { Reveal } from "./Reveal";
import ImageSlot from "./ImageSlot";
import { useToastStore } from "@/lib/toastStore";

export default function Footer() {
  const [email, setEmail] = useState("");
  const showToast = useToastStore((s) => s.show);

  return (
    <footer
      id="footer"
      className="mt-[140px] border-t border-line bg-bg-soft px-[5vw] pb-10 pt-24"
    >
      <Reveal
        className="disp max-w-[16ch]"
        style={{ fontSize: "clamp(34px,5.8vw,76px)", lineHeight: 0.94, letterSpacing: "-0.035em" }}
      >
        Dapatkan kabar koleksi terbaru kami
      </Reveal>

      <div className="mt-[52px] grid items-start gap-12" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(280px,1fr))" }}>
        <div className="flex flex-col gap-7">
          <p className="max-w-[340px] text-[15px] leading-[1.6] text-soft">
            Jadilah yang pertama tahu koleksi baru, tips ramah lingkungan, dan
            proyek komunitas. Bergabung dengan gerakan hidup lestari.
          </p>
          <form
            className="flex max-w-[360px] gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              if (!email) return;
              showToast("Terima kasih! Kami akan kabari.");
              setEmail("");
            }}
          >
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email"
              required
              placeholder="Masukkan email Anda"
              className="min-w-0 flex-1 rounded-full border border-line bg-bg px-5 py-[15px] text-sm text-ink outline-none"
            />
            <motion.button
              type="submit"
              whileHover={{ scale: 1.06, rotate: 8 }}
              whileTap={{ scale: 0.92 }}
              transition={{ type: "spring", stiffness: 400, damping: 18 }}
              className="flex h-[52px] w-[52px] flex-none items-center justify-center rounded-full bg-olive text-lg text-bg transition-colors hover:bg-olive-d"
            >
              →
            </motion.button>
          </form>
        </div>
        <div className="overflow-hidden rounded-xl bg-card" style={{ aspectRatio: "16/10" }}>
          <ImageSlot label="Ruang kerja" src="/images/lk-footer-desk.svg" />
        </div>
        <div className="flex flex-col gap-3.5">
          <h3 className="disp mb-2" style={{ fontSize: "clamp(26px,3.2vw,40px)", letterSpacing: "-0.02em" }}>
            Temukan Jalan Anda
          </h3>
          <a href="#top" className="text-sm tracking-[0.02em]">Tentang Kami</a>
          <a href="/collections" className="text-sm tracking-[0.02em]">Katalog</a>
          <a href="#sorotan" className="text-sm tracking-[0.02em]">Penawaran Spesial</a>
          <a href="#footer" className="text-sm tracking-[0.02em]">Kontak</a>
        </div>
      </div>

      <div className="mt-16 flex flex-wrap items-center justify-between gap-4 border-t border-line pt-[26px] text-[13px] text-soft">
        <span>Loka Living © 2026 · Dibuat di Yogyakarta, Indonesia</span>
        <div className="flex gap-6 text-ink">
          <span>+62 812 345 678</span>
          <span>halo@lokaliving.id</span>
        </div>
      </div>
    </footer>
  );
}
