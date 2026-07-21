"use client";

import { AnimatePresence, motion } from "motion/react";
import { useToastStore } from "@/lib/toastStore";

export default function Toast() {
  const message = useToastStore((s) => s.message);

  return (
    <AnimatePresence>
      {message && (
        <motion.div
          initial={{ opacity: 0, y: 12, x: "-50%" }}
          animate={{ opacity: 1, y: 0, x: "-50%" }}
          exit={{ opacity: 0, y: 12, x: "-50%" }}
          transition={{ duration: 0.25, ease: "easeOut" }}
          className="fixed bottom-8 left-1/2 z-[400] rounded-full bg-ink px-[26px] py-3.5 text-[13px] font-medium text-bg shadow-[0_14px_44px_rgba(27,26,20,0.24)]"
        >
          {message}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
