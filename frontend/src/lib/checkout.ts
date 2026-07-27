const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000/api";

export interface InitItem {
  product_variant_id: string;
  qty: number;
}

export interface InitResponseItem {
  product_variant_id: string;
  product_name: string;
  sku: string;
  material: string;
  color_hex: string;
  qty: number;
  unit_price: number;
  subtotal: number;
  image_url: string | null;
}

export interface InitResponse {
  order_token: string;
  reserved_until: string;
  items: InitResponseItem[];
  subtotal_amount: number;
  currency: string;
}

export interface ShippingAddress {
  full_address: string;
  recipient_name?: string;
  phone?: string;
  kelurahan?: string;
  kecamatan?: string;
  city?: string;
  province?: string;
  postal_code?: string;
  country?: string;
  latitude?: number;
  longitude?: number;
}

export interface ShippingOption {
  courier: string;
  service_name: string;
  price: number;
  eta_days: number;
}

export interface ShippingRateResponse {
  options: ShippingOption[];
  available_delivery_dates: string[];
}

export interface ConfirmContact {
  email: string;
  phone: string;
}

export interface ConfirmShipping {
  courier: string;
  delivery_date?: string;
}

export interface ConfirmResponse {
  order_token: string;
  total_amount: number;
  payment: {
    gateway: string;
    snap_token: string;
    redirect_url: string;
  };
}

async function postApi<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const json = await res.json().catch(() => ({}));
    throw new Error(json.error || `API ${res.status}: ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export function initCheckout(items: InitItem[]): Promise<InitResponse> {
  return postApi<InitResponse>('/checkout/init', { items });
}

export function getShippingRate(
  orderToken: string,
  address: ShippingAddress
): Promise<ShippingRateResponse> {
  return postApi<ShippingRateResponse>('/checkout/shipping-rate', {
    order_token: orderToken,
    address,
  });
}

export function confirmCheckout(data: {
  order_token: string;
  contact: ConfirmContact;
  shipping: ConfirmShipping;
  wants_installation?: boolean;
  payment_method: string;
}): Promise<ConfirmResponse> {
  return postApi<ConfirmResponse>('/checkout/confirm', data);
}