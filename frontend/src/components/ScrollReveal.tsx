"use client";

import { useRef, type ReactNode } from "react";
import {
  motion,
  useScroll,
  useTransform,
  useSpring,
  type MotionStyle,
} from "motion/react";

/**
 * ScrollReveal — Enhanced scroll-driven reveal animation.
 *
 * 📚 Konsep:
 * - useScroll({ target, offset }) → scrollYProgress: 0 saat elemen mulai masuk viewport, 1 saat keluar.
 * - useTransform() memetakan scrollYProgress ke property CSS (opacity, y, scale, filter, rotate).
 * - useSpring() membuat pergerakan smooth (bukan abrupt).
 * - Beda dari Reveal.tsx: Reveal pakai `whileInView` (satu kali), ScrollReveal terus-menerus
 *   mengikuti scroll position, jadi animasi "hidup" selama scrolling.
 */

interface ScrollRevealProps {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** Preset animation style */
  preset?: "fade-up" | "fade-scale" | "fade-rotate" | "zoom-blur" | "slide-left" | "slide-right";
}

export function ScrollReveal({
  children,
  className,
  style,
  preset = "fade-up",
}: ScrollRevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.92", "start 0.4"],
  });

  // Spring for smoother interpolation
  const progress = useSpring(scrollYProgress, {
    stiffness: 100,
    damping: 30,
    restDelta: 0.001,
  });

  // Build transforms based on preset
  const transforms = usePresetTransforms(progress, preset);

  // SATU elemen: className dan style (flex, grid, aspect-ratio, relative, dll.) dan animasinya ada di elemen yang sama,
  // seperti Reveal. Kalau animasi dipasang pada div perantara di dalamnya, div itu (a) menjadi acuan posisi bagi anak
  // `absolute` dan tingginya 0px sehingga anak itu ikut mengecil, dan (b) kelas tata letak di luar tidak lagi mengatur
  // anak-anak aslinya.
  return (
    <motion.div ref={ref} className={className} style={{ ...style, ...transforms }}>
      {children}
    </motion.div>
  );
}

function usePresetTransforms(
  progress: ReturnType<typeof useSpring>,
  preset: string
): MotionStyle {
  // Each preset maps scrollYProgress [0→1] to different CSS transforms
  const opacity = useTransform(progress, [0, 0.6], [0, 1]);
  const y_up = useTransform(progress, [0, 1], [60, 0]);
  const scale_grow = useTransform(progress, [0, 1], [0.88, 1]);
  const rotate_in = useTransform(progress, [0, 1], [3, 0]);
  const blur = useTransform(progress, [0, 0.7], [8, 0]);
  const x_left = useTransform(progress, [0, 1], [-80, 0]);
  const x_right = useTransform(progress, [0, 1], [80, 0]);

  const filterBlur = useTransform(blur, (v) => `blur(${v}px)`);

  switch (preset) {
    case "fade-up":
      return { opacity, y: y_up };
    case "fade-scale":
      return { opacity, scale: scale_grow };
    case "fade-rotate":
      return { opacity, y: y_up, rotateX: rotate_in };
    case "zoom-blur":
      return { opacity, scale: scale_grow, filter: filterBlur };
    case "slide-left":
      return { opacity, x: x_left };
    case "slide-right":
      return { opacity, x: x_right };
    default:
      return { opacity, y: y_up };
  }
}

/**
 * ParallaxDepth — Enhanced parallax with depth illusion (scale + opacity + blur).
 * Elements closer appear to move faster and stay sharper.
 */
interface ParallaxDepthProps {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  /** Movement strength in px */
  strength?: number;
  /** Depth layer: 0 = nearest (moves most), 1 = far (moves least) */
  depth?: number;
}

export function ParallaxDepth({
  children,
  className,
  style,
  strength = 50,
  depth = 0,
}: ParallaxDepthProps) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start end", "end start"],
  });

  const factor = 1 - depth * 0.6; // depth 0 → factor 1, depth 1 → factor 0.4
  const y = useTransform(scrollYProgress, [0, 1], [
    -strength * factor,
    strength * factor,
  ]);
  const scale = useTransform(scrollYProgress, [0, 0.5, 1], [
    1 - depth * 0.04,
    1,
    1 - depth * 0.04,
  ]);

  const springY = useSpring(y, { stiffness: 100, damping: 30 });
  const springScale = useSpring(scale, { stiffness: 100, damping: 30 });

  return (
    <div ref={ref} className={className} style={{ ...style, overflow: "hidden" }}>
      <motion.div
        style={{ y: springY, scale: springScale }}
        className="h-full w-full"
      >
        {children}
      </motion.div>
    </div>
  );
}

/**
 * ScrollCounter — Numbers that count up as you scroll into view.
 */
interface ScrollCounterProps {
  from?: number;
  to: number;
  suffix?: string;
  className?: string;
}

export function ScrollCounter({
  from = 0,
  to,
  suffix = "",
  className,
}: ScrollCounterProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ["start 0.9", "start 0.4"],
  });

  const springProgress = useSpring(scrollYProgress, {
    stiffness: 80,
    damping: 30,
  });

  const display = useTransform(springProgress, (p) => {
    const val = Math.round(from + (to - from) * Math.min(p, 1));
    return `${val}${suffix}`;
  });

  return (
    <motion.span ref={ref} className={className}>
      {display}
    </motion.span>
  );
}
