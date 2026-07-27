import HomeClient from "./HomeClient";
import { fetchProducts, mapApiProduct, type ApiProduct } from "@/lib/api";

export default async function Home() {
  const apiProducts = await fetchProducts().catch(() => [] as ApiProduct[]);
  const products = apiProducts.map(mapApiProduct);

  return <HomeClient products={products} />;
}
