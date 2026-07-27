"use client";

import Navbar from "@/components/Navbar";
import Hero from "@/components/Hero";
import Marquee from "@/components/Marquee";
import Koleksi from "@/components/Koleksi";
import BaruTiba from "@/components/BaruTiba";
import Sorotan from "@/components/Sorotan";
import Nilai from "@/components/Nilai";
import Footer from "@/components/Footer";
import PdpOverlay from "@/components/PdpOverlay";
import Toast from "@/components/Toast";
import ScrollProgress from "@/components/ScrollProgress";
import type { Product } from "@/lib/products";

export default function HomeClient({ products }: { products: Product[] }) {
  const featuredSlug = "kursi-santai-rukun";
  const newArrivalSlugs = ["rak-buku-tumbuh", "bangku-panjang-sela", "kursi-makan-tani"];

  return (
    <div className="min-h-screen overflow-x-hidden bg-bg">
      <ScrollProgress />
      <Navbar />
      <Hero products={products} />
      <Marquee />
      <Koleksi products={products} />
      <BaruTiba products={products} newArrivalSlugs={newArrivalSlugs} />
      <Sorotan products={products} featuredSlug={featuredSlug} />
      <Nilai />
      <Footer />
      <PdpOverlay products={products} />
      <Toast />
    </div>
  );
}
