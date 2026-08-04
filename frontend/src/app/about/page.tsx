"use client";

import { motion } from "motion/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ScrollProgress from "@/components/ScrollProgress";
import { Reveal, RevealGroup, RevealItem, RevealLines } from "@/components/Reveal";
import ImageSlot from "@/components/ImageSlot";

const VALUES = [
  {
    title: "Lokal",
    body: "Setiap perabot dikerjakan pengrajin Indonesia dengan material dari negeri sendiri — kayu, rotan, dan anyaman yang tumbuh di tanah kita.",
  },
  {
    title: "Lestari",
    body: "Kami memilih bahan terbarukan, proses yang hemat energi, dan kemasan minimal — karena rumah yang indah tidak harus mengorbankan bumi.",
  },
  {
    title: "Abadi",
    body: "Kami tidak mengejar tren musiman. Desain yang tenang, proporsi yang pas, dan kualitas yang bertahan bertahun-tahun.",
  },
];

const STATS = [
  { value: "30+", label: "Pengrajin mitra" },
  { value: "10", label: "Koleksi aktif" },
  { value: "100%", label: "Desain sendiri" },
];

export default function AboutPage() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-bg">
      <ScrollProgress />
      <Navbar />
      <main className="px-[5vw] pt-[130px] pb-[60px]">
        {/* ── Hero ── */}
        <Reveal className="flex flex-col items-center text-center">
          <p className="text-sm leading-[1.55] text-soft">
            Kisah kami, dari bengkel kecil di Yogyakarta
          </p>
          <h1
            className="disp mt-2"
            style={{
              fontSize: "clamp(44px,7vw,104px)",
              lineHeight: 0.9,
              letterSpacing: "-0.04em",
            }}
          >
            Tentang Kami
          </h1>
        </Reveal>

        {/* ── Story ── */}
        <section className="mx-auto mt-[72px] max-w-[720px]">
          <RevealLines
            lines={[
              "Loka Living lahir dari satu pertanyaan sederhana:",
              "kenapa rumah yang hangat dan berkarakter",
              "harus datang dari negeri yang jauh?",
            ]}
            className="disp"
            lineClassName="text-[clamp(26px,4vw,44px)] leading-[1.08] tracking-[-0.02em] text-ink"
          />
          <Reveal delay={0.15} className="mt-8">
            <p className="max-w-[560px] text-[15px] leading-[1.7] text-soft">
              Kami percaya perabot terbaik adalah yang membawa cerita — tangan
              pengrajin yang paham kayu, keluarga yang menumbuhkan rotan,
              dan budaya yang menghargai ketekunan. Dari situ kami bekerja
              bersama pengrajin di seluruh Indonesia untuk menghadirkan
              perabot yang jujur, awet, dan dekat dengan rumah Anda.
            </p>
          </Reveal>
        </section>

        {/* ── Image band ── */}
        <Reveal className="mx-auto mt-[72px] max-w-[960px]">
          <div
            className="overflow-hidden rounded-2xl bg-card"
            style={{ aspectRatio: "16/9" }}
          >
            <ImageSlot label="Bengkel pengrajin" src="/images/lk-footer-desk.svg" />
          </div>
        </Reveal>

        {/* ── Stats ── */}
        <RevealGroup className="mx-auto mt-[72px] grid max-w-[960px] grid-cols-3 gap-4 sm:gap-8">
          {STATS.map((s) => (
            <RevealItem key={s.label} className="rounded-2xl border border-line bg-card p-6 text-center sm:p-10">
              <p
                className="disp text-ink"
                style={{ fontSize: "clamp(28px,4vw,52px)", letterSpacing: "-0.03em" }}
              >
                {s.value}
              </p>
              <p className="mt-2 text-[12.5px] font-medium tracking-[0.04em] text-soft uppercase">
                {s.label}
              </p>
            </RevealItem>
          ))}
        </RevealGroup>

        {/* ── Values ── */}
        <section className="mx-auto mt-[96px] max-w-[960px]">
          <Reveal className="disp text-center text-[clamp(24px,3.4vw,38px)] tracking-[-0.02em] text-ink">
            Yang kami pegang
          </Reveal>
          <RevealGroup className="mt-12 grid gap-4 sm:grid-cols-3 sm:gap-[22px]">
            {VALUES.map((v) => (
              <RevealItem key={v.title} className="rounded-2xl border border-line bg-card p-7">
                <p className="disp text-[24px] tracking-[-0.02em] text-ink">{v.title}</p>
                <p className="mt-3 text-[14px] leading-[1.65] text-soft">{v.body}</p>
              </RevealItem>
            ))}
          </RevealGroup>
        </section>

        {/* ── CTA ── */}
        <Reveal className="mx-auto mt-[100px] flex max-w-[960px] flex-col items-center text-center">
          <p className="disp max-w-[18ch] text-[clamp(26px,4vw,46px)] leading-[1.05] tracking-[-0.02em] text-ink">
            Tertarik membawa cerita kami ke rumah Anda?
          </p>
          <motion.a
            href="/collections"
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            className="mt-8 rounded-full bg-olive px-[34px] py-[15px] text-[12px] font-semibold uppercase tracking-[0.06em] text-bg transition-colors hover:bg-olive-d"
          >
            Jelajahi Koleksi
          </motion.a>
        </Reveal>
      </main>
      <Footer />
    </div>
  );
}
