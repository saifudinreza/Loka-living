"use client";

import { useRef, useState, type ReactNode, type MouseEvent } from "react";
import { motion, useMotionValue, useSpring, useTransform } from "motion/react";

interface Button3DProps {
  children: ReactNode;
  onClick?: () => void;
  className?: string;
  /** olive (filled) or outline style */
  variant?: "primary" | "outline";
}

/**
 * 3D hover button — follows cursor with perspective rotateX/Y,
 * adds a gloss sweep and deep shadow on hover.
 *
 * 📚 Konsep:
 * - `perspective` CSS membuat "depth" 3D di container.
 * - `rotateX/Y` dihitung dari posisi mouse relatif ke center tombol.
 * - useSpring() membuat gerakannya smooth (spring physics), bukan langsung snap.
 * - Pseudo-element ::after untuk efek "shine" gloss yg bergerak.
 */
export function Button3D({
  children,
  onClick,
  className = "",
  variant = "primary",
}: Button3DProps) {
  const ref = useRef<HTMLButtonElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  // Raw motion values — update on every mousemove
  const rawRotateX = useMotionValue(0);
  const rawRotateY = useMotionValue(0);
  const glossX = useMotionValue(50); // percent position of gloss highlight

  // Springs untuk smooth interpolation
  const rotateX = useSpring(rawRotateX, { stiffness: 300, damping: 20, mass: 0.5 });
  const rotateY = useSpring(rawRotateY, { stiffness: 300, damping: 20, mass: 0.5 });
  const springGlossX = useSpring(glossX, { stiffness: 200, damping: 25 });

  // Transform gloss position menjadi gradient background
  const glossGradient = useTransform(
    springGlossX,
    (x) =>
      `radial-gradient(circle at ${x}% 50%, rgba(255,255,255,0.25) 0%, rgba(255,255,255,0) 60%)`
  );

  const handleMouseMove = (e: MouseEvent<HTMLButtonElement>) => {
    const rect = ref.current?.getBoundingClientRect();
    if (!rect) return;

    // Posisi mouse relatif ke center (range -0.5 sampai 0.5)
    const xRel = (e.clientX - rect.left) / rect.width - 0.5;
    const yRel = (e.clientY - rect.top) / rect.height - 0.5;

    // rotateY positif = miring ke kanan, rotateX negatif = miring ke atas
    rawRotateY.set(xRel * 20); // max 10 derajat
    rawRotateX.set(yRel * -14); // max 7 derajat
    glossX.set((xRel + 0.5) * 100);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
    rawRotateX.set(0);
    rawRotateY.set(0);
    glossX.set(50);
  };

  const baseStyles =
    variant === "primary"
      ? "bg-olive text-bg hover:bg-olive-d"
      : "border border-ink text-ink hover:bg-ink hover:text-bg";

  return (
    <motion.button
      ref={ref}
      onClick={onClick}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={handleMouseLeave}
      style={{
        perspective: 800,
        rotateX,
        rotateY,
        transformStyle: "preserve-3d",
      }}
      animate={{
        scale: isHovered ? 1.04 : 1,
        boxShadow: isHovered
          ? "0 14px 40px -8px rgba(85,96,58,0.35), 0 6px 16px -4px rgba(0,0,0,0.15)"
          : "0 2px 8px -2px rgba(0,0,0,0.08), 0 1px 3px -1px rgba(0,0,0,0.06)",
        y: isHovered ? -3 : 0,
      }}
      whileTap={{ scale: 0.96, y: 1 }}
      transition={{ type: "spring", stiffness: 400, damping: 22 }}
      className={`relative overflow-hidden rounded-full px-8 py-4 text-[13px] font-semibold uppercase tracking-[0.06em] transition-colors ${baseStyles} ${className}`}
    >
      {/* Gloss overlay */}
      <motion.span
        aria-hidden
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{
          background: glossGradient,
          opacity: isHovered ? 1 : 0,
          transition: "opacity 0.3s ease",
        }}
      />
      {/* Text content elevated in 3D space */}
      <span className="relative z-[1]" style={{ transform: "translateZ(4px)" }}>
        {children}
      </span>
    </motion.button>
  );
}
