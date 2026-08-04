"use client";

import { useState } from "react";
import { motion } from "motion/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ScrollProgress from "@/components/ScrollProgress";
import { Reveal, RevealGroup, RevealItem } from "@/components/Reveal";
import { useToastStore } from "@/lib/toastStore";

const CONTACTS = [
  { label: "Email", value: "halo@lokaliving.id", href: "mailto:halo@lokaliving.id" },
  { label: "WhatsApp", value: "+62 812 345 678", href: "https://wa.me/62812345678" },
  { label: "Alamat", value: "Jl. Kaliurang KM 5, Yogyakarta", href: undefined },
];

const HOURS = [
  { day: "Senin – Jumat", time: "09.00 – 18.00" },
  { day: "Sabtu", time: "09.00 – 15.00" },
  { day: "Minggu / Libur", time: "Tutup" },
];

export default function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const showToast = useToastStore((s) => s.show);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !email || !message) return;
    showToast("Terima kasih! Pesan Anda sudah kami terima.");
    setName("");
    setEmail("");
    setMessage("");
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-bg">
      <ScrollProgress />
      <Navbar />
      <main className="px-[5vw] pt-[130px] pb-[60px]">
        {/* ── Hero ── */}
        <Reveal className="flex flex-col items-center text-center">
          <p className="text-sm leading-[1.55] text-soft">
            Kami senang mendengar dari Anda
          </p>
          <h1
            className="disp mt-2"
            style={{
              fontSize: "clamp(44px,7vw,104px)",
              lineHeight: 0.9,
              letterSpacing: "-0.04em",
            }}
          >
            Kontak
          </h1>
        </Reveal>

        <div className="mx-auto mt-[64px] grid max-w-[1080px] items-start gap-[44px] lg:grid-cols-[1fr_400px]">
          {/* ── Form ── */}
          <Reveal className="rounded-2xl border border-line bg-card p-7 sm:p-10">
            <h2 className="disp text-[24px] tracking-[-0.02em] text-ink">
              Kirim pesan
            </h2>
            <p className="mt-2 text-[14px] leading-[1.6] text-soft">
              Pertanyaan tentang produk, pesanan, atau kerja sama — tim kami
              akan membalas dalam 1–2 hari kerja.
            </p>
            <form className="mt-8 flex flex-col gap-4" onSubmit={handleSubmit}>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                placeholder="Nama Anda *"
                className="w-full rounded-xl border border-line bg-bg px-4 py-3 text-sm text-ink outline-none transition-colors focus:border-olive"
              />
              <input
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                type="email"
                placeholder="Email *"
                className="w-full rounded-xl border border-line bg-bg px-4 py-3 text-sm text-ink outline-none transition-colors focus:border-olive"
              />
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                required
                placeholder="Pesan Anda *"
                rows={6}
                className="w-full resize-none rounded-xl border border-line bg-bg px-4 py-3 text-sm text-ink outline-none transition-colors focus:border-olive"
              />
              <motion.button
                type="submit"
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                className="self-start rounded-full bg-olive px-[32px] py-[14px] text-[12px] font-semibold uppercase tracking-[0.06em] text-bg transition-colors hover:bg-olive-d"
              >
                Kirim Pesan
              </motion.button>
            </form>
          </Reveal>

          {/* ── Info ── */}
          <div className="flex flex-col gap-4">
            <RevealGroup className="flex flex-col gap-4">
              {CONTACTS.map((c) => (
                <RevealItem key={c.label} className="rounded-2xl border border-line bg-card p-6">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-soft">
                    {c.label}
                  </p>
                  {c.href ? (
                    <a
                      href={c.href}
                      target={c.href.startsWith("http") ? "_blank" : undefined}
                      rel={c.href.startsWith("http") ? "noreferrer" : undefined}
                      className="mt-1.5 block text-[15px] font-medium text-ink transition-colors hover:text-olive"
                    >
                      {c.value}
                    </a>
                  ) : (
                    <p className="mt-1.5 text-[15px] font-medium text-ink">{c.value}</p>
                  )}
                </RevealItem>
              ))}
            </RevealGroup>

            <Reveal className="rounded-2xl border border-line bg-card p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-soft">
                Jam Operasional
              </p>
              <div className="mt-3 flex flex-col gap-2">
                {HOURS.map((h) => (
                  <div key={h.day} className="flex items-center justify-between text-[13.5px]">
                    <span className="text-soft">{h.day}</span>
                    <span className="font-medium text-ink">{h.time}</span>
                  </div>
                ))}
              </div>
            </Reveal>
          </div>
        </div>
      </main>
      <Footer />
    </div>
  );
}
