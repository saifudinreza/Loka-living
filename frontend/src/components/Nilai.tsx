"use client";

import { Reveal, RevealGroup, RevealItem } from "./Reveal";
import { Parallax } from "./Parallax";
import ImageSlot from "./ImageSlot";

const POINTS = [
  { n: "01", text: "Dibuat awet, harga tetap terjangkau" },
  { n: "02", text: "Praktik lestari lewat kayu daur ulang" },
  { n: "03", text: "Berkolaborasi dengan komunitas hijau" },
];

const IMAGES = [
  { label: "Interior lemari", src: "/images/lk-trust1.svg" },
  { label: "Detail material", src: "/images/lk-trust2.svg" },
  { label: "Kursi kayu", src: "/images/lk-trust3.svg" },
  { label: "Ruang makan", src: "/images/lk-trust4.svg" },
];

export default function Nilai() {
  return (
    <section id="nilai" className="px-[5vw] pt-[140px] text-center">
      <Reveal>
        <div className="disp text-soft" style={{ fontSize: "clamp(18px,2.4vw,28px)" }}>
          Perabot Bernilai
        </div>
        <h2
          className="disp mt-1"
          style={{ fontSize: "clamp(32px,5.4vw,66px)", lineHeight: 0.94, letterSpacing: "-0.035em" }}
        >
          Dirancang dengan Tujuan
        </h2>
      </Reveal>

      <RevealGroup className="mx-auto mt-14 grid max-w-[960px] grid-cols-1 gap-8 sm:grid-cols-3">
        {POINTS.map((p) => (
          <RevealItem key={p.n} className="flex flex-col gap-3 text-left">
            <div className="text-[13px] tracking-[0.12em] text-soft">{p.n}</div>
            <div className="text-base font-medium leading-[1.4] text-ink">{p.text}</div>
          </RevealItem>
        ))}
      </RevealGroup>

      <RevealGroup
        className="mx-auto mt-[60px] grid max-w-[1000px] items-center gap-[18px]"
        style={{ gridTemplateColumns: "1.15fr .82fr 1.15fr" }}
      >
        <RevealItem className="overflow-hidden rounded-xl bg-card" style={{ aspectRatio: "1/1" }}>
          <Parallax className="h-full w-full" strength={22}>
            <ImageSlot label={IMAGES[0].label} src={IMAGES[0].src} />
          </Parallax>
        </RevealItem>
        <div className="flex flex-col gap-[18px]">
          <RevealItem className="overflow-hidden rounded-xl bg-card" style={{ aspectRatio: "1/1" }}>
            <Parallax className="h-full w-full" strength={-32}>
              <ImageSlot label={IMAGES[1].label} src={IMAGES[1].src} />
            </Parallax>
          </RevealItem>
          <RevealItem className="overflow-hidden rounded-xl bg-card" style={{ aspectRatio: "1/1" }}>
            <Parallax className="h-full w-full" strength={-32}>
              <ImageSlot label={IMAGES[2].label} src={IMAGES[2].src} />
            </Parallax>
          </RevealItem>
        </div>
        <RevealItem className="overflow-hidden rounded-xl bg-card" style={{ aspectRatio: "1/1" }}>
          <Parallax className="h-full w-full" strength={22}>
            <ImageSlot label={IMAGES[3].label} src={IMAGES[3].src} />
          </Parallax>
        </RevealItem>
      </RevealGroup>
    </section>
  );
}
