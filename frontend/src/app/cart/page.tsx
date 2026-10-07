"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ImageSlot from "@/components/ImageSlot";
import Toast from "@/components/Toast";
import { Reveal } from "@/components/Reveal";
import { useAuthStore } from "@/lib/authStore";
import { useCartStore, type CartItem } from "@/lib/cartStore";
import { describeError } from "@/lib/http";
import { formatPrice } from "@/lib/products";

const MAX_QTY = 99;

// Alasan barang tidak bisa dibeli, dari data server (is_available = produk aktif DAN stok >= qty)
function unavailableReason(item: CartItem): string {
  if (item.stock_available <= 0) return "Stok habis";
  if (item.stock_available < item.qty) return `Stok tersisa ${item.stock_available}. Kurangi jumlah agar bisa dibeli.`;
  return "Produk ini sudah tidak dijual";
}

export default function CartPage() {
  const router = useRouter();
  const status = useAuthStore((s) => s.status);
  const cart = useCartStore((s) => s.cart);
  const load = useCartStore((s) => s.load);
  const setQty = useCartStore((s) => s.setQty);
  const remove = useCartStore((s) => s.remove);

  const [busy, setBusy] = useState<string | null>(null); // varian yang sedang diproses (cegah klik ganda)
  const [error, setError] = useState<string | null>(null);

  // Keranjang hanya untuk user login: tamu diarahkan ke login, lalu kembali ke sini
  useEffect(() => {
    if (status === "guest") router.replace("/login?next=%2Fcart");
  }, [status, router]);

  // Selalu muat ulang saat halaman dibuka: harga dan stok bisa berubah sejak terakhir dilihat
  useEffect(() => {
    if (status !== "authenticated") return;
    load().catch((e) => setError(describeError(e)));
  }, [status, load]);

  const run = async (variantId: string, action: () => Promise<void>) => {
    setBusy(variantId);
    setError(null);
    try {
      await action();
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(null);
    }
  };

  const ready = status === "authenticated" && cart !== null;

  return (
    <div className="min-h-screen overflow-x-hidden bg-bg">
      <Navbar />
      <main className="px-[5vw] pb-[60px] pt-[130px]">
        <Reveal>
          <h1 className="disp" style={{ fontSize: "clamp(40px,6vw,88px)", lineHeight: 0.92, letterSpacing: "-0.04em" }}>
            Keranjang
          </h1>
        </Reveal>

        {error && (
          <p role="alert" className="mt-6 text-sm text-red-700">
            {error}
          </p>
        )}

        {!ready && (
          <p className="mt-10 text-sm text-soft" aria-live="polite">
            {status === "guest" ? "Mengalihkan ke halaman masuk…" : "Memuat keranjang…"}
          </p>
        )}

        {ready && cart.items.length === 0 && (
          <div className="mt-10 flex flex-col items-start gap-5">
            <p className="text-base text-soft">Keranjang Anda masih kosong.</p>
            <Link
              href="/collections"
              className="rounded-full bg-olive px-8 py-3.5 text-[13px] font-semibold uppercase tracking-[0.08em] text-bg transition-colors hover:bg-olive-d hover:text-bg"
            >
              Lihat Koleksi
            </Link>
          </div>
        )}

        {ready && cart.items.length > 0 && (
          <div className="mt-10 grid items-start gap-10 lg:grid-cols-[1fr_360px]">
            <ul className="flex flex-col divide-y divide-line border-y border-line">
              {cart.items.map((item) => {
                const id = item.product_variant_id;
                const disabled = busy === id;
                return (
                  <li key={id} className={`flex gap-5 py-6 ${item.is_available ? "" : "opacity-80"}`}>
                    <div className="h-[104px] w-[104px] flex-shrink-0 overflow-hidden rounded-[10px] bg-card">
                      <ImageSlot label={item.product.name} src={item.image_url ?? undefined} />
                    </div>
                    <div className="flex min-w-0 flex-1 flex-col gap-2">
                      <div className="flex items-start justify-between gap-4">
                        <div className="min-w-0">
                          <Link href={`/products/${item.product.slug}`} className="text-[15px] font-medium text-ink">
                            {item.product.name}
                          </Link>
                          {item.material && <p className="text-[12.5px] text-soft">{item.material}</p>}
                        </div>
                        <span className="flex-shrink-0 text-sm font-semibold text-ink">{formatPrice(item.subtotal)}</span>
                      </div>
                      <p className="text-xs text-soft">{formatPrice(item.unit_price)} / unit</p>
                      {!item.is_available && (
                        <p role="status" className="text-[12.5px] font-medium text-red-700">
                          {unavailableReason(item)}
                        </p>
                      )}
                      <div className="mt-1 flex items-center gap-4">
                        <div className="flex items-center rounded-full border border-line">
                          <button
                            aria-label={`Kurangi jumlah ${item.product.name}`}
                            disabled={disabled || item.qty <= 1}
                            onClick={() => run(id, () => setQty(id, item.qty - 1))}
                            className="h-9 w-9 rounded-full text-base text-ink transition-colors hover:bg-bg-soft disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            −
                          </button>
                          <span className="min-w-8 text-center text-sm font-medium" aria-live="polite">
                            {item.qty}
                          </span>
                          <button
                            aria-label={`Tambah jumlah ${item.product.name}`}
                            disabled={disabled || item.qty >= MAX_QTY}
                            onClick={() => run(id, () => setQty(id, item.qty + 1))}
                            className="h-9 w-9 rounded-full text-base text-ink transition-colors hover:bg-bg-soft disabled:cursor-not-allowed disabled:opacity-40"
                          >
                            +
                          </button>
                        </div>
                        <button
                          disabled={disabled}
                          onClick={() => run(id, () => remove(id))}
                          className="text-[13px] text-soft underline-offset-4 transition-colors hover:text-ink hover:underline disabled:opacity-40"
                        >
                          Hapus
                        </button>
                      </div>
                    </div>
                  </li>
                );
              })}
            </ul>

            <aside className="rounded-[18px] border border-line bg-bg-soft p-6 lg:sticky lg:top-[110px]">
              <h2 className="disp text-xl">Ringkasan</h2>
              <dl className="mt-5 flex flex-col gap-3 text-sm">
                <div className="flex justify-between">
                  <dt className="text-soft">Jumlah barang</dt>
                  <dd>{cart.item_count}</dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-soft">Subtotal</dt>
                  <dd className="font-semibold">{formatPrice(cart.subtotal_amount)}</dd>
                </div>
              </dl>
              <p className="mt-3 text-xs leading-[1.55] text-soft">
                Barang yang tidak tersedia tidak dihitung. Ongkir dihitung saat checkout.
              </p>
              {/* Checkout dari keranjang menunggu endpoint checkout/init (issue 13); checkout yang ada hanya untuk satu barang */}
              <button
                disabled
                className="mt-6 w-full cursor-not-allowed rounded-full bg-olive py-3.5 text-[13px] font-semibold uppercase tracking-[0.08em] text-bg opacity-50"
              >
                Lanjut ke Checkout
              </button>
              <p className="mt-3 text-xs leading-[1.55] text-soft">
                Checkout dari keranjang belum tersedia. Untuk saat ini gunakan tombol &quot;Beli Langsung&quot; di halaman
                produk.
              </p>
              <Link href="/collections" className="mt-5 block text-center text-[13px] text-soft underline-offset-4 hover:underline">
                Lanjut belanja
              </Link>
            </aside>
          </div>
        )}
      </main>
      <Footer />
      <Toast />
    </div>
  );
}
