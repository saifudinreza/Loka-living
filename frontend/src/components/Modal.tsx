"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Dialog aksesibel: role="dialog" + aria-modal, fokus pindah ke dalam dialog saat dibuka dan KEMBALI ke pemicunya saat
 * ditutup, Tab terkurung di dalam dialog, Escape menutup, dan halaman di belakangnya tidak ikut ter-scroll.
 * `dismissible = false` (mis. saat menyimpan) menonaktifkan Escape dan klik di luar.
 */
export default function Modal({
  open,
  title,
  onClose,
  dismissible = true,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  dismissible?: boolean;
  children: ReactNode;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  // nilai terbaru tanpa memicu ulang efek fokus (efek fokus hanya boleh jalan saat dibuka/ditutup)
  const latest = useRef({ onClose, dismissible });
  latest.current = { onClose, dismissible };

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const panel = panelRef.current!;
    const focusables = () => Array.from(panel.querySelectorAll<HTMLElement>(FOCUSABLE));

    (focusables()[0] ?? panel).focus();
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && latest.current.dismissible) {
        event.stopPropagation();
        latest.current.onClose();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
      opener?.focus?.(); // fokus kembali ke tombol yang membuka dialog
    };
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-center justify-center overflow-y-auto bg-[rgba(27,26,20,0.45)] p-4"
      // hanya klik langsung di latar (bukan seret dari dalam panel) yang menutup
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && latest.current.dismissible) latest.current.onClose();
      }}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="my-auto w-full max-w-[560px] rounded-[18px] border border-line bg-bg p-6 shadow-[0_24px_80px_rgba(27,26,20,0.25)] outline-none sm:p-8"
      >
        <h2 id={titleId} className="disp text-2xl">
          {title}
        </h2>
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}
