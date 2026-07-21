"use client";

import { motion } from "motion/react";

const ITEMS = ["Ramah Lingkungan", "Buatan Tangan", "Kayu Daur Ulang", "Desain Abadi"];

export default function Marquee() {
  const track = (
    <div className="flex shrink-0 items-center gap-10 pr-10">
      {ITEMS.map((item, i) => (
        <span
          key={i}
          className="disp flex items-center gap-10 whitespace-nowrap text-[15px] font-semibold uppercase tracking-[0.14em] text-soft sm:text-[18px]"
        >
          {item}
          <span className="text-olive">✺</span>
        </span>
      ))}
    </div>
  );

  return (
    <div className="mt-[90px] overflow-hidden border-y border-line py-5">
      <motion.div
        className="flex w-max"
        animate={{ x: ["0%", "-50%"] }}
        transition={{ duration: 22, ease: "linear", repeat: Infinity }}
      >
        {track}
        {track}
      </motion.div>
    </div>
  );
}
