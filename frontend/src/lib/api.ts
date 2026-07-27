const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000/api';

export interface ApiVariant {
    id: string;
    material: string;
    color_hex: string;
    price_idr: number;
    compare_at_price_idr: number | null;
    stock_available: number;
    sku: string;
    image_urls: string[];
}
export interface ApiProduct {
    id: string;
    name: string;
    slug: string;
    category: string;
    description: string;
    weight_kg: string;
    dimensions: {
        length: string;
        width: string;
        height: string;
    };
    variants: ApiVariant[];
}

async function fetchApi<T>(path: string): Promise<T> {
    const res = await fetch(`${API_BASE}${path}`);
    if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `API ${res.status}: ${res.statusText}`);
    }
    const json = await res.json();
    return json.data as T;    
}
export function fetchProducts(): Promise<ApiProduct[]> {
    return fetchApi<ApiProduct[]>('/products');
}

export function fetchProductBySlug(slug: string): Promise<ApiProduct> {
    return fetchApi<ApiProduct>(`/products/${slug}`);
}

import type { Product, Category } from "./products";

const CATEGORY_MAP: Record<string, Category> = {
  chairs: "Kursi",
  tables: "Meja",
  cabinets: "Lemari",
  shelves: "Rak",
};

export function mapApiProduct(p: ApiProduct): Product {
  const v = p.variants[0];
  return {
    id: p.id,
    slug: p.slug,
    name: p.name,
    cat: CATEGORY_MAP[p.category] || "Kursi",
    mat: v?.material || "",
    price: v?.price_idr || 0,
    old: v?.compare_at_price_idr || null,
    badge: null,
    sold: 0,
    stock: v?.stock_available || 0,
    dims: {
      p: parseFloat(p.dimensions.length),
      l: parseFloat(p.dimensions.width),
      t: parseFloat(p.dimensions.height),
    },
    desc: p.description,
    placeholder: p.name,
    image_url: (v?.image_urls?.[0]) || `/images/lk-${p.id}.svg`,
    variants: p.variants.map((v) => ({
      id: v.id,
      label: v.material,
      color: v.color_hex,
      image_url: v.image_urls[0] || "",
    })),
  };
}