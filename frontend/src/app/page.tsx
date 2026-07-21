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

export default function Home() {
  return (
    <div className="min-h-screen overflow-x-hidden bg-bg">
      <ScrollProgress />
      <Navbar />
      <Hero />
      <Marquee />
      <Koleksi />
      <BaruTiba />
      <Sorotan />
      <Nilai />
      <Footer />
      <PdpOverlay />
      <Toast />
    </div>
  );
}
