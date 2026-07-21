export type Category = "Kursi" | "Meja" | "Lemari" | "Rak";

export interface Product {
  id: string;
  name: string;
  cat: Category;
  mat: string;
  price: number;
  old: number | null;
  badge: string | null;
  sold: number;
  stock: number;
  dims: { p: number; l: number; t: number };
  desc: string;
  placeholder: string;
}

export interface Variant {
  label: string;
  color: string;
  placeholder: string;
  slot: string;
}

export function productImage(id: string): string {
  return `/images/lk-${id}.svg`;
}

export const FILTERS: Array<"Semua" | Category> = [
  "Semua",
  "Kursi",
  "Meja",
  "Lemari",
  "Rak",
];

export const PRODUCTS: Product[] = [
  {
    id: "p1",
    name: "Kursi Santai Rukun",
    cat: "Kursi",
    mat: "Rotan & linen",
    price: 2450000,
    old: 2900000,
    badge: "Best Seller",
    sold: 167,
    stock: 13,
    dims: { p: 72, l: 80, t: 98 },
    desc: "Rangka rotan anyaman tangan dengan bantalan linen lepas-cuci — kursi baca yang menua dengan indah.",
    placeholder: "Kursi santai rotan",
  },
  {
    id: "p2",
    name: "Kursi Makan Tani",
    cat: "Kursi",
    mat: "Kayu jati",
    price: 1150000,
    old: null,
    badge: null,
    sold: 214,
    stock: 48,
    dims: { p: 46, l: 52, t: 84 },
    desc: "Kursi makan kayu solid dengan dudukan anyaman rotan, ringan namun kokoh untuk pemakaian harian.",
    placeholder: "Kursi makan kayu",
  },
  {
    id: "p3",
    name: "Meja Kopi Lestari",
    cat: "Meja",
    mat: "Jati reklamasi",
    price: 1850000,
    old: 2200000,
    badge: "Limited Edition",
    sold: 89,
    stock: 21,
    dims: { p: 110, l: 60, t: 42 },
    desc: "Meja kopi bidang lebar dari kayu jati reklamasi, permukaan diminyaki natural tanpa lapisan kimia.",
    placeholder: "Meja kopi kayu",
  },
  {
    id: "p4",
    name: "Meja Makan Bumi",
    cat: "Meja",
    mat: "Kayu suar",
    price: 4900000,
    old: null,
    badge: null,
    sold: 42,
    stock: 7,
    dims: { p: 180, l: 90, t: 75 },
    desc: "Meja makan enam kursi dari satu bilah kayu suar, urat kayu unik pada tiap unit.",
    placeholder: "Meja makan besar",
  },
  {
    id: "p5",
    name: "Lemari Arsip Wana",
    cat: "Lemari",
    mat: "Kayu & rotan",
    price: 5600000,
    old: 6400000,
    badge: null,
    sold: 31,
    stock: 5,
    dims: { p: 90, l: 45, t: 180 },
    desc: "Lemari penyimpanan tinggi dengan pintu panel rotan berventilasi dan engsel kuningan solid.",
    placeholder: "Lemari kayu tinggi",
  },
  {
    id: "p6",
    name: "Rak Buku Tumbuh",
    cat: "Rak",
    mat: "Kayu jati",
    price: 2100000,
    old: null,
    badge: "Baru",
    sold: 58,
    stock: 34,
    dims: { p: 80, l: 32, t: 160 },
    desc: "Rak buku modular yang bisa ditambah tingkat seiring koleksi Anda bertumbuh.",
    placeholder: "Rak buku modular",
  },
  {
    id: "p7",
    name: "Bangku Panjang Sela",
    cat: "Kursi",
    mat: "Kayu mahoni",
    price: 1680000,
    old: null,
    badge: "Baru",
    sold: 73,
    stock: 19,
    dims: { p: 140, l: 38, t: 45 },
    desc: "Bangku lorong ramping dari kayu mahoni, sempurna untuk area masuk atau ujung tempat tidur.",
    placeholder: "Bangku panjang kayu",
  },
  {
    id: "p8",
    name: "Meja Samping Endap",
    cat: "Meja",
    mat: "Kayu ek",
    price: 890000,
    old: 1050000,
    badge: null,
    sold: 126,
    stock: 52,
    dims: { p: 40, l: 40, t: 55 },
    desc: "Meja samping mungil dengan laci tersembunyi, pas untuk lampu baca dan barang kecil.",
    placeholder: "Meja samping kecil",
  },
];

export const VARIANTS: Variant[] = [
  { label: "Rotan Alami", color: "#C99A66", placeholder: "Kursi — rotan alami", slot: "lk-spot-rotan" },
  { label: "Kayu Jati", color: "#9B6B3A", placeholder: "Kursi — kayu jati", slot: "lk-spot-jati" },
  { label: "Kayu Walnut", color: "#5A3D2B", placeholder: "Kursi — kayu walnut", slot: "lk-spot-walnut" },
  { label: "Linen Abu", color: "#9A968A", placeholder: "Kursi — linen abu", slot: "lk-spot-linen" },
];

export function variantImage(slot: string): string {
  return `/images/${slot}.svg`;
}

export const SPOTS: Array<{ top: string; left: string; pid: string }> = [
  { top: "62%", left: "19%", pid: "p1" },
  { top: "40%", left: "55%", pid: "p3" },
  { top: "68%", left: "81%", pid: "p7" },
];

export const NEW_ARRIVAL_IDS = ["p6", "p7", "p2"];

export function formatPrice(n: number): string {
  return "Rp " + new Intl.NumberFormat("id-ID").format(n);
}

export function findProduct(id: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === id);
}
