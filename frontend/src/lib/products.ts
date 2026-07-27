export type Category = "Kursi" | "Meja" | "Lemari" | "Rak";

export interface ProductVariant {
  label: string;
  color: string;
  image_url: string;
}

export interface Product {
  id: string;
  slug: string;
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
  image_url: string;
  variants: ProductVariant[];
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

export function formatPrice(n: number): string {
  return "Rp " + new Intl.NumberFormat("id-ID").format(n);
}
