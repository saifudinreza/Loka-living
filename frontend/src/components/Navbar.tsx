"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { logout } from "@/lib/authApi";
import { useAuthStore } from "@/lib/authStore";
import { useCartStore } from "@/lib/cartStore";
import { useToastStore } from "@/lib/toastStore";

// Navbar dipakai di semua halaman, jadi link bagian beranda diawali "/" (bukan "#...").
// "#baru" saja hanya berfungsi di beranda; "/#baru" berfungsi dari halaman mana pun.
const LINKS = [
  { href: "/collections", label: "Koleksi" },
  { href: "/#baru", label: "Baru Tiba" },
  { href: "/#sorotan", label: "Sorotan" },
  { href: "/about", label: "Tentang" },
  { href: "/contact", label: "Kontak" },
];

const MotionLink = motion.create(Link);

export default function Navbar() {
  const router = useRouter();
  const pathname = usePathname();
  const [scrolled, setScrolled] = useState(false);
  const status = useAuthStore((s) => s.status);
  const user = useAuthStore((s) => s.user);
  const count = useCartStore((s) => s.cart?.item_count ?? 0);
  const showToast = useToastStore((s) => s.show);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  // Keranjang hanya untuk user login: tamu langsung diarahkan ke login (lalu kembali ke /cart).
  // Saat status masih "unknown" (sesi sedang dipulihkan) tujuannya /cart; halaman itu sendiri yang menjaga.
  const cartHref = status === "guest" ? "/login?next=%2Fcart" : "/cart";

  const handleLogout = async () => {
    await logout();
    showToast("Anda sudah keluar");
    if (pathname === "/cart") router.replace("/");
  };

  return (
    <motion.nav
      animate={{
        paddingTop: scrolled ? 14 : 26,
        paddingBottom: scrolled ? 14 : 26,
        backgroundColor: scrolled ? "rgba(246,241,232,0.9)" : "rgba(246,241,232,0)",
        borderBottomColor: scrolled ? "var(--line)" : "rgba(0,0,0,0)",
      }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="fixed left-0 top-0 z-[100] flex w-full items-center justify-between border-b px-[5vw]"
      style={{ backdropFilter: scrolled ? "blur(12px)" : "none" }}
    >
      {/* Logo = kembali ke beranda dari halaman mana pun */}
      <Link
        href="/"
        className="disp text-xl font-medium tracking-[-0.02em] text-ink"
      >
        loka living<span className="text-olive">.</span>
      </Link>
      <div className="hidden gap-9 text-sm sm:flex">
        {LINKS.map((l) => (
          <Link key={l.href} href={l.href}>
            {l.label}
          </Link>
        ))}
      </div>
      <div className="flex items-center gap-4">
        {status === "authenticated" && (
          <>
            <span className="hidden max-w-[120px] truncate text-sm text-soft md:inline">
              {user?.name.split(" ")[0]}
            </span>
            <button onClick={handleLogout} className="text-sm text-ink transition-colors hover:text-olive">
              Keluar
            </button>
          </>
        )}
        {status === "guest" && (
          <Link href="/login" className="text-sm text-ink">
            Masuk
          </Link>
        )}
        <MotionLink
          href={cartHref}
          whileHover={{ y: -2 }}
          whileTap={{ scale: 0.95 }}
          transition={{ type: "spring", stiffness: 400, damping: 22 }}
          className="flex items-center gap-2.5 rounded-full border border-line py-2 pl-[18px] pr-2 text-sm font-medium text-ink transition-colors hover:border-ink"
          aria-label={`Keranjang, ${count} barang`}
        >
          Keranjang
          <span className="relative flex h-6 min-w-6 items-center justify-center overflow-hidden rounded-full bg-olive px-1.5 text-xs font-semibold text-bg">
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={count}
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -10, opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {count}
              </motion.span>
            </AnimatePresence>
          </span>
        </MotionLink>
      </div>
    </motion.nav>
  );
}
