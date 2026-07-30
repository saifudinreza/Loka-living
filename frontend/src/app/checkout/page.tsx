"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { motion } from "motion/react";
import Navbar from "@/components/Navbar";
import Footer from "@/components/Footer";
import ScrollProgress from "@/components/ScrollProgress";
import { formatPrice } from "@/lib/products";
import {
  initCheckout,
  getShippingRate,
  confirmCheckout,
} from "@/lib/checkout";
import type { InitResponse, ShippingOption } from "@/lib/checkout";

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.14em] text-soft">
        {title}
      </h2>
      <div className="rounded-xl border border-line bg-card p-5">
        {children}
      </div>
    </div>
  );
}

export default function CheckoutPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const variantId = sp.get("vid");
  const qty = parseInt(sp.get("qty") ?? "1", 10);

  // ── Init state ──
  const [order, setOrder] = useState<InitResponse | null>(null);
  const [error, setError] = useState("");

  // ── Contact form ──
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");

  // ── Address form ──
  const [fullAddress, setFullAddress] = useState("");
  const [city, setCity] = useState("");
  const [province, setProvince] = useState("");
  const [postalCode, setPostalCode] = useState("");
  const [recipientName, setRecipientName] = useState("");

  // ── Shipping ──
  const [shippingOptions, setShippingOptions] = useState<ShippingOption[]>([]);
  const [selectedCourier, setSelectedCourier] = useState("");
  const [deliveryDates, setDeliveryDates] = useState<string[]>([]);
  const [selectedDate, setSelectedDate] = useState("");

  // ── Payment ──
  const [paymentMethod, setPaymentMethod] = useState("qris");
  const [wantsInstallation, setWantsInstallation] = useState(false);

  // ── UI ──
  const [loading, setLoading] = useState(true);
  const [shippingLoading, setShippingLoading] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // ── Derived values ──
  const selectedShipping = shippingOptions.find(
    (o) => o.courier === selectedCourier
  );
  const shippingCost = selectedShipping?.price ?? 0;
  const installationCost = wantsInstallation ? 150000 : 0;
  const totalAmount =
    (order?.subtotal_amount ?? 0) + shippingCost + installationCost;

  // ── Init checkout saat mount ──
  useEffect(() => {
    if (!variantId) {
      setError("Tidak ada produk dipilih.");
      setLoading(false);
      return;
    }
    initCheckout([{ product_variant_id: variantId, qty }])
      .then((res) => {
        setOrder(res);
        setLoading(false);
      })
      .catch((err) => {
        setError(err.message);
        setLoading(false);
      });
  }, [variantId, qty]);

  // ── Hitung ongkir ──
  const handleCalculateShipping = useCallback(async () => {
    if (!order) return;
    if (!fullAddress || !city || !province) {
      setError("Lengkapi provinsi, kota, dan alamat lengkap");
      return;
    }
    setError("");
    setShippingLoading(true);
    try {
      const address = {
        full_address: fullAddress,
        recipient_name: recipientName || undefined,
        phone: phone || undefined,
        city,
        province,
        postal_code: postalCode || undefined,
        country: "ID",
      };
      const res = await getShippingRate(order.order_token, address);
      setShippingOptions(res.options);
      setDeliveryDates(res.available_delivery_dates);
      if (res.options.length > 0) setSelectedCourier(res.options[0].courier);
      if (res.available_delivery_dates.length > 0) setSelectedDate(res.available_delivery_dates[0]);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setShippingLoading(false);
    }
  }, [order, fullAddress, city, province, postalCode, recipientName, phone]);

  // ── Konfirmasi checkout & redirect ke Midtrans ──
  const handleConfirm = useCallback(async () => {
    if (!order || !selectedCourier || !selectedDate || !email) {
      setError("Lengkapi email, alamat, dan pilih kurir.");
      return;
    }
    setError("");
    setSubmitting(true);
    try {
      const res = await confirmCheckout({
        order_token: order.order_token,
        contact: { email, phone },
        shipping: {
          courier: selectedCourier,
          delivery_date: selectedDate || undefined,
        },
        wants_installation: wantsInstallation,
        payment_method: paymentMethod,
      });
      if (res.payment.redirect_url) {
        window.location.href = res.payment.redirect_url;
      }
    } catch (err: any) {
      setError(err.message);
      setSubmitting(false);
    }
  }, [order, selectedCourier, selectedDate, email, phone, wantsInstallation, paymentMethod]);

  return (
    <div className="min-h-screen overflow-x-hidden bg-bg">
      <ScrollProgress />
      <Navbar />
      <main className="px-[5vw] pt-[130px] pb-[90px]">
        {/* Back */}
        <motion.button
          onClick={() => router.back()}
          whileHover={{ x: -3 }}
          whileTap={{ scale: 0.95 }}
          transition={{ type: "spring", stiffness: 400, damping: 25 }}
          className="mb-8 inline-flex items-center gap-2 rounded-full border border-line px-[22px] py-[11px] text-[13px] font-medium text-ink transition-colors hover:border-ink"
        >
          ← Kembali
        </motion.button>

        <h1 className="disp mb-10 text-[clamp(32px,5vw,58px)] leading-[0.96] tracking-[-0.03em]">
          Checkout
        </h1>

        {/* Loading */}
        {loading && (
          <div className="flex items-center justify-center py-20">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-olive border-t-transparent" />
          </div>
        )}

        {/* Error */}
        {error && !loading && (
          <div className="rounded-xl border border-red-200 bg-red-50/50 p-6 text-center">
            <p className="text-sm text-red-700">{error}</p>
            <button
              onClick={() => router.push("/collections")}
              className="mt-4 rounded-full bg-olive px-6 py-3 text-sm font-semibold text-bg transition-colors hover:bg-olive-d"
            >
              Kembali ke Koleksi
            </button>
          </div>
        )}

        {/* ── Main content ── */}
        {order && !loading && (
          <div className="grid items-start gap-[52px] lg:grid-cols-[1fr_380px]">
            {/* LEFT: form sections */}
            <div className="flex flex-col gap-8">
              {/* SECTION: ringkasan pesanan */}
              <Section title="Ringkasan Pesanan">
                {order.items.map((item) => (
                  <div
                    key={item.product_variant_id}
                    className="flex items-center gap-4 border-b border-line py-4 last:border-0"
                  >
                    <div className="h-16 w-16 flex-shrink-0 overflow-hidden rounded-lg bg-card">
                      {item.image_url && (
                        <img
                          src={item.image_url}
                          alt={item.product_name}
                          className="h-full w-full object-cover"
                        />
                      )}
                    </div>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-ink">{item.product_name}</p>
                      <p className="text-xs text-soft">{item.material} · {item.sku}</p>
                      <p className="text-xs text-soft">×{item.qty}</p>
                    </div>
                    <p className="text-sm font-semibold text-ink">
                      {formatPrice(item.subtotal)}
                    </p>
                  </div>
                ))}
              </Section>

              {/* SECTION: kontak */}
              <Section title="Kontak Pembeli">
                <div className="flex flex-col gap-4">
                  <input
                    type="email"
                    placeholder="Email *"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full rounded-xl border border-line bg-bg px-4 py-3 text-sm text-ink outline-none transition-colors focus:border-olive"
                  />
                  <input
                    type="tel"
                    placeholder="No. WhatsApp *"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="w-full rounded-xl border border-line bg-bg px-4 py-3 text-sm text-ink outline-none transition-colors focus:border-olive"
                  />
                </div>
              </Section>

              {/* SECTION: alamat */}
              <Section title="Alamat Pengiriman">
                <div className="flex flex-col gap-4">
                  <input
                    placeholder="Nama penerima"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                    className="w-full rounded-xl border border-line bg-bg px-4 py-3 text-sm text-ink outline-none transition-colors focus:border-olive"
                  />
                  <select
                    value={province}
                    onChange={(e) => setProvince(e.target.value)}
                    className="w-full rounded-xl border border-line bg-bg px-4 py-3 text-sm text-ink outline-none transition-colors focus:border-olive"
                  >
                    <option value="">Pilih provinsi *</option>
                    <option>Jawa Barat</option>
                    <option>Jawa Tengah</option>
                    <option>DI Yogyakarta</option>
                    <option>Jawa Timur</option>
                    <option>Banten</option>
                    <option>Jakarta</option>
                  </select>
                  <input
                    placeholder="Kota / Kabupaten *"
                    value={city}
                    onChange={(e) => setCity(e.target.value)}
                    className="w-full rounded-xl border border-line bg-bg px-4 py-3 text-sm text-ink outline-none transition-colors focus:border-olive"
                  />
                  <input
                    placeholder="Kode pos"
                    value={postalCode}
                    onChange={(e) => setPostalCode(e.target.value)}
                    className="w-full rounded-xl border border-line bg-bg px-4 py-3 text-sm text-ink outline-none transition-colors focus:border-olive"
                  />
                  <textarea
                    placeholder="Alamat lengkap *"
                    value={fullAddress}
                    onChange={(e) => setFullAddress(e.target.value)}
                    rows={3}
                    className="w-full resize-none rounded-xl border border-line bg-bg px-4 py-3 text-sm text-ink outline-none transition-colors focus:border-olive"
                  />
                  <motion.button
                    onClick={handleCalculateShipping}
                    disabled={shippingLoading}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                    className="self-start rounded-full bg-olive px-[30px] py-[13px] text-[12px] font-semibold uppercase tracking-[0.06em] text-bg transition-colors hover:bg-olive-d disabled:opacity-50"
                  >
                    {shippingLoading ? "Menghitung..." : "Hitung Ongkir"}
                  </motion.button>
                </div>
              </Section>
            </div>

            {/* RIGHT: sticky summary */}
            <div className="sticky top-[130px] flex flex-col gap-6 rounded-2xl border border-line bg-card p-6">
              <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-soft">
                Ringkasan Belanja
              </p>
              <div className="flex flex-col gap-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-soft">Subtotal</span>
                  <span className="font-semibold text-ink">{formatPrice(order.subtotal_amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-soft">Ongkos kirim</span>
                  <span className="font-semibold text-ink">
                    {shippingOptions.length > 0 ? formatPrice(shippingCost) : "—"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-soft">Instalasi</span>
                  <span className="font-semibold text-ink">
                    {wantsInstallation ? formatPrice(150000) : "—"}
                  </span>
                </div>
                <hr className="border-line" />
                <div className="flex justify-between text-base">
                  <span className="font-semibold text-ink">Total</span>
                  <span className="disp text-[22px] tracking-[-0.02em] text-ink">
                    {formatPrice(totalAmount)}
                  </span>
                </div>
              </div>
              <motion.button
                onClick={handleConfirm}
                disabled={submitting || shippingOptions.length === 0}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.97 }}
                className="w-full rounded-full bg-olive px-[30px] py-[17px] text-[13px] font-semibold uppercase tracking-[0.06em] text-bg transition-colors hover:bg-olive-d disabled:opacity-50"
              >
                {submitting ? "Memproses..." : "Bayar Sekarang"}
              </motion.button>
            </div>
          </div>
        )}
      </main>
      <Footer />
    </div>
  );
}
