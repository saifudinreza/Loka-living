"use client";

import ImageSlot from "./ImageSlot";
import { Reveal, RevealLines } from "./Reveal";
import { Parallax } from "./Parallax";
import { Magnetic } from "./Magnetic";

export default function Hero() {
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
          {/* Lapisan parallax dibuat 32px lebih tinggi di atas dan bawah (container overflow-hidden)
              supaya geseran ±28px tidak membuka celah kosong di tepi foto. */}
          <Parallax className="absolute inset-x-0 -inset-y-8" strength={28}>
            <ImageSlot
              label="Meja makan kayu suar dengan kursi rotan di ruang makan"
              src="/images/products/meja-makan-bumi-ruang-1.jpg"
              objectPosition="50% 55%"
            />
          </Parallax>
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
