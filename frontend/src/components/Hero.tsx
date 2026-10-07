"use client";

import ImageSlot from "./ImageSlot";
import { RevealLines } from "./Reveal";
import { Button3D } from "./Button3D";
import { ScrollReveal, ParallaxDepth } from "./ScrollReveal";

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
        <ScrollReveal
          preset="zoom-blur"
          // Fotonya potret (4:5). Bingkai lebar 16:8,5 hanya menampilkan ~42% tinggi foto. Rasio dibuat bertingkat:
          // ponsel 4:5 (foto utuh), tablet 4:3 (~60%), laptop 3:2 (~53%), layar lebar 16:10 (~50%, agar tidak
          // lebih tinggi dari layar).
          className="relative aspect-[4/5] w-full overflow-hidden rounded-2xl bg-card md:aspect-[4/3] lg:aspect-[3/2] 2xl:aspect-[16/10]"
        >
          {/* ParallaxDepth menggeser foto ±strength px saat scroll. Lapisannya HARUS lebih besar dari bingkai minimal
              sebesar strength (-inset-y-10 = 40px >= 35), kalau tidak tepi bingkai terbuka dan celah kosong terlihat. */}
          <ParallaxDepth className="absolute inset-x-0 -inset-y-10" strength={35} depth={0}>
            <ImageSlot
              label="Meja makan kayu suar dengan kursi rotan di ruang makan"
              src="/images/products/meja-makan-bumi-ruang-1.jpg"
              objectPosition="50% 55%"
            />
          </ParallaxDepth>
        </ScrollReveal>
        <ScrollReveal preset="fade-up" className="mt-[22px] flex flex-wrap items-center justify-between gap-4">
          <Button3D variant="primary" onClick={() => {
            document.getElementById("koleksi")?.scrollIntoView({ behavior: "smooth" });
          }}>
            <span className="inline-flex items-center gap-3">
              Belanja Sekarang
              <span className="flex h-6 w-6 items-center justify-center rounded-full border border-[rgba(246,241,232,0.5)] text-[11px]">
                →
              </span>
            </span>
          </Button3D>
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
        </ScrollReveal>
      </section>
    </>
  );
}

