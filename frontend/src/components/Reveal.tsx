"use client";

import { motion, type HTMLMotionProps } from "motion/react";

const EASE = [0.19, 1, 0.22, 1] as const;

interface RevealProps extends HTMLMotionProps<"div"> {
  delay?: number;
}

export function Reveal({ delay = 0, children, ...rest }: RevealProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 28 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{ duration: 0.8, ease: EASE, delay }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

export function RevealGroup({
  children,
  ...rest
}: HTMLMotionProps<"div">) {
  return (
    <motion.div
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.12 }}
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: 0.08 } },
      }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

export function RevealItem({ children, ...rest }: HTMLMotionProps<"div">) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y: 28 },
        show: { opacity: 1, y: 0, transition: { duration: 0.8, ease: EASE } },
      }}
      {...rest}
    >
      {children}
    </motion.div>
  );
}

interface RevealLinesProps {
  lines: string[];
  className?: string;
  lineClassName?: string;
  delay?: number;
}

export function RevealLines({ lines, className, lineClassName, delay = 0 }: RevealLinesProps) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, amount: 0.4 }}
      variants={{
        hidden: {},
        show: { transition: { staggerChildren: 0.12, delayChildren: delay } },
      }}
    >
      {lines.map((line, i) => (
        <div key={i} className="overflow-hidden">
          <motion.div
            className={lineClassName}
            variants={{
              hidden: { y: "100%" },
              show: { y: "0%", transition: { duration: 0.9, ease: EASE } },
            }}
          >
            {line}
          </motion.div>
        </div>
      ))}
    </motion.div>
  );
}
