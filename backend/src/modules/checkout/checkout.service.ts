import { and, asc, eq, sql } from "drizzle-orm";
import { db } from "../../db/client";
import {
  addresses,
  orderItems,
  orderStatusLogs,
  orders,
  paymentTransactions,
  productVariants,
  products,
  shippingQuotes,
  userAddresses,
  users,
} from "../../db/schema";
import { AppError } from "../../lib/errors";
import { createUserAddress } from "../account/addresses.service";
import { parseCreate } from "../account/addresses.validation";
import { createTransaction, type PaymentMethod, type SnapItem } from "../payments/midtrans.service";
import { getRates } from "../shipping/shipping-rate.service";
import { INSTALLATION_FEE_IDR, PAYMENT_WINDOW_MINUTES, QUOTE_MINUTES } from "./checkout.constants";

// Langkah kedua checkout (issue 14): menyimpan alamat kirim order lalu menghitung ongkir.
// Beda dengan estimasi (issue 09) yang tidak menyimpan apa pun: harga quote yang disimpan di sini yang dipakai
// `confirm` (issue 15), bukan harga yang dikirim browser.

export { QUOTE_MINUTES };
const DELIVERY_DAYS = 7;

/** Isi alamat dari body (alamat baru). Semua kecuali full_address opsional, seperti perilaku Laravel lama. */
export interface AddressInput {
  full_address: string;
  recipient_name?: string | null;
  phone?: string | null;
  kelurahan?: string | null;
  kecamatan?: string | null;
  city?: string | null;
  province?: string | null;
  postal_code?: string | null;
  country?: string | null;
  latitude?: number | null;
  longitude?: number | null;
}

export interface ShippingRateInput {
  order_token: string;
  address?: AddressInput;
  address_id?: string;
  save_address?: boolean;
}

const invalid = (message = "Data yang dikirim tidak valid.") => new AppError(422, "VALIDATION_FAILED", message);
const orderNotFound = () => new AppError(404, "ORDER_NOT_FOUND", "Pesanan tidak ditemukan.");

/**
 * Tanggal pengiriman yang tersedia: H+1 sampai H+7, format YYYY-MM-DD menurut kalender **Asia/Jakarta**.
 * Jam 06.00 WIB masih tanggal kemarin di UTC, jadi tanggal UTC akan salah satu hari.
 */
export function availableDeliveryDates(now: Date = new Date()): string[] {
  // locale en-CA memformat sebagai YYYY-MM-DD
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta" }).format(now);
  const [y, m, d] = today.split("-").map(Number) as [number, number, number];
  // penambahan hari di UTC murni (tanpa DST), jadi aman dari pergeseran zona waktu
  return Array.from({ length: DELIVERY_DAYS }, (_, i) =>
    new Date(Date.UTC(y, m - 1, d + i + 1)).toISOString().slice(0, 10),
  );
}

const coordinate = (value: number | null | undefined) => (value == null ? null : String(value));

/**
 * Alur (satu transaksi):
 *   1. Validasi bentuk request (tepat satu dari `address` / `address_id`; yang butuh login → 401). Sebelum database.
 *   2. Kunci baris order (FOR UPDATE): dua pemanggilan bersamaan untuk order yang sama diserialkan, jadi
 *      "hapus quote lama + sisipkan quote baru" tidak pernah saling menimpa.
 *   3. Order harus ada, `draft`, milik pemanggil (order milik user lain = 404, bukan 403: keberadaan data tidak bocor),
 *      dan reservasi belum lewat (410).
 *   4. Alamat order = SALINAN di tabel `addresses` (mengedit buku alamat tidak mengubah pesanan).
 *   5. Berat total dari database, ongkir dari `getRates`, quote lama dihapus, quote baru disimpan 30 menit.
 */
export async function quoteShipping(input: ShippingRateInput, userId: string | null) {
  const { address, address_id: addressId } = input;

  // 1. tepat salah satu
  if ((address === undefined) === (addressId === undefined)) {
    throw invalid('Kirim salah satu dari "address" atau "address_id".');
  }
  const saveAddress = input.save_address === true && address !== undefined;
  if ((addressId !== undefined || input.save_address === true) && !userId) {
    throw new AppError(401, "UNAUTHORIZED", "Silakan login dulu.");
  }
  // Alamat yang akan disimpan ke buku alamat harus lolos aturan buku alamat (issue 12). Diperiksa SEBELUM transaksi,
  // supaya request yang ditolak tidak meninggalkan perubahan apa pun.
  const toSave = saveAddress ? parseCreate({ ...address, label: "Alamat" }) : null;

  return db.transaction(async (tx) => {
    // 2–3. kunci dan validasi order. Waktu dibandingkan di database (satu sumber waktu dengan job pelepas reservasi).
    const [order] = await tx
      .select({
        id: orders.id,
        userId: orders.userId,
        status: orders.status,
        addressId: orders.addressId,
        expired: sql<boolean>`${orders.reservedUntil} is not null and ${orders.reservedUntil} <= now()`,
      })
      .from(orders)
      .where(eq(orders.orderToken, input.order_token))
      .limit(1)
      .for("update");
    if (!order || order.status !== "draft") throw orderNotFound();
    if (order.userId && order.userId !== userId) throw orderNotFound();
    if (order.expired) throw new AppError(410, "RESERVATION_EXPIRED", "Reservasi stok sudah berakhir. Mulai checkout lagi.");

    // 4. isi alamat
    let source: AddressInput;
    if (addressId !== undefined) {
      const [saved] = await tx
        .select()
        .from(userAddresses)
        .where(and(eq(userAddresses.id, addressId), eq(userAddresses.userId, userId!)))
        .limit(1);
      if (!saved) throw new AppError(404, "ADDRESS_NOT_FOUND", "Alamat tidak ditemukan.");
      source = {
        full_address: saved.fullAddress,
        recipient_name: saved.recipientName,
        phone: saved.phone,
        kelurahan: saved.kelurahan,
        kecamatan: saved.kecamatan,
        city: saved.city,
        province: saved.province,
        postal_code: saved.postalCode,
        latitude: saved.latitude === null ? null : Number(saved.latitude),
        longitude: saved.longitude === null ? null : Number(saved.longitude),
      };
    } else {
      source = address!;
    }

    const [copy] = await tx
      .insert(addresses)
      .values({
        recipientName: source.recipient_name,
        phone: source.phone,
        fullAddress: source.full_address,
        kelurahan: source.kelurahan,
        kecamatan: source.kecamatan,
        city: source.city,
        province: source.province,
        postalCode: source.postal_code,
        country: source.country ?? "ID",
        latitude: coordinate(source.latitude),
        longitude: coordinate(source.longitude),
      })
      .returning({ id: addresses.id });
    await tx.update(orders).set({ addressId: copy!.id }).where(eq(orders.id, order.id));
    // salinan alamat lama milik order ini tidak dipakai siapa pun lagi
    if (order.addressId) await tx.delete(addresses).where(eq(addresses.id, order.addressId));

    // buku alamat penuh bukan alasan menggagalkan checkout: alamatnya saja yang tidak disimpan
    if (toSave) {
      try {
        await createUserAddress(userId!, toSave, tx);
      } catch (e) {
        if (!(e instanceof AppError && e.code === "ADDRESS_LIMIT_REACHED")) throw e;
      }
    }

    // 5. berat total (desimal) dari database: Σ qty × weight_kg
    const [{ weight }] = (await tx
      .select({ weight: sql<string | null>`sum(${orderItems.qty} * ${products.weightKg})` })
      .from(orderItems)
      .innerJoin(productVariants, eq(productVariants.id, orderItems.productVariantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(eq(orderItems.orderId, order.id))) as [{ weight: string | null }];
    const rates = getRates(Number(weight ?? 0), source.city ?? "", source.province ?? "");

    // hitung ulang tidak boleh menumpuk baris
    await tx.delete(shippingQuotes).where(eq(shippingQuotes.orderId, order.id));
    await tx.insert(shippingQuotes).values(
      rates.map((r) => ({
        orderId: order.id,
        courier: r.courier,
        serviceName: r.service_name,
        price: r.price,
        etaDays: r.eta_days,
        expiresAt: sql`now() + make_interval(mins => ${QUOTE_MINUTES})`,
      })),
    );

    return { options: rates, available_delivery_dates: availableDeliveryDates() };
  });
}

// ---------- confirm (issue 15) ----------

export { INSTALLATION_FEE_IDR };

export interface ConfirmInput {
  order_token: string;
  contact?: { email?: string; phone?: string };
  shipping: { courier: string; delivery_date?: string };
  wants_installation?: boolean;
  payment_method: PaymentMethod;
}

/** Bisa diganti di test supaya tidak memanggil Midtrans sungguhan. */
export interface ConfirmDeps {
  createTransaction: typeof createTransaction;
}

// ----- fungsi murni (tanpa database), mudah diuji sendiri -----

/** Total = subtotal order (dari `init`) + ongkir (dari quote tersimpan) + instalasi. Tidak ada angka dari client. */
export function computeTotals(subtotal: number, shipping: number, wantsInstallation: boolean) {
  const installation = wantsInstallation ? INSTALLATION_FEE_IDR : 0;
  return { shipping, installation, total: subtotal + shipping + installation };
}

export interface OrderLine {
  variantId: string;
  qty: number;
  unitPrice: number;
  productName: string;
  material: string | null;
}

/**
 * Item untuk Midtrans. Midtrans hanya menerima Σ(price × quantity) == gross_amount, jadi ongkir dan instalasi
 * ikut sebagai item tersendiri (hanya kalau nilainya > 0).
 */
export function buildSnapItems(lines: OrderLine[], shipping: number, installation: number): SnapItem[] {
  const items: SnapItem[] = lines.map((l) => ({
    id: l.variantId,
    price: l.unitPrice,
    quantity: l.qty,
    name: l.material ? `${l.productName} - ${l.material}` : l.productName,
  }));
  if (shipping > 0) items.push({ id: "SHIPPING", price: shipping, quantity: 1, name: "Ongkos Kirim" });
  if (installation > 0) items.push({ id: "INSTALLATION", price: installation, quantity: 1, name: "Jasa Instalasi" });
  return items;
}

/**
 * Kontak untuk Midtrans dan pesanan. Tamu wajib mengisi email; user login boleh mengosongkannya (email akun dipakai).
 * `accountEmail` null = tamu.
 */
export function resolveContact(contact: ConfirmInput["contact"], accountEmail: string | null) {
  const email = contact?.email?.trim().toLowerCase() || accountEmail;
  if (!email) throw invalid('Field "contact.email" wajib diisi.');
  return { email, phone: contact?.phone?.trim() || null };
}

/**
 * Langkah terakhir sebelum bayar. Total dihitung ULANG dari database; angka dari client tidak pernah dipakai
 * (body bahkan tidak punya field total/ongkir).
 *
 * Seluruh pekerjaan ada dalam SATU transaksi setelah kunci baris order (FOR UPDATE):
 *   - request kembar (klik dua kali) menunggu di kunci, lalu melihat status bukan draft lagi → 404;
 *   - `shipping-rate` memakai kunci yang sama, jadi quote tidak bisa berganti di tengah perhitungan;
 *   - Midtrans dipanggil SEBELUM status diubah. Kalau Midtrans gagal, transaksi di-rollback: order tetap `draft`
 *     dan user bisa mencoba lagi. Kalau status diubah dulu, order tersangkut di `awaiting_payment`.
 *
 * Konsekuensi yang disadari: koneksi database dan kunci order tertahan selama panggilan Midtrans (maksimal
 * `TIMEOUT_MS` di midtrans.service). Batas laju per IP di route membatasi berapa banyak yang bisa menunggu bersamaan.
 *
 * Keterbatasan yang diketahui: kalau Midtrans SUDAH menerima transaksi tetapi penulisan database sesudahnya gagal,
 * transaksi di-rollback sedangkan `order_id` itu sudah terpakai di Midtrans, jadi percobaan ulang ditolak Midtrans
 * (502). Sangat jarang; kalau terjadi, order tersebut kedaluwarsa sendiri dan pembeli memulai checkout baru.
 */
export async function confirm(
  input: ConfirmInput,
  userId: string | null,
  deps: ConfirmDeps = { createTransaction },
) {
  const wantsInstallation = input.wants_installation === true;

  // Sebelum database: tamu wajib mengisi email.
  if (!userId) resolveContact(input.contact, null);

  // Tanggal kirim hanya boleh dari rentang yang ditawarkan `shipping-rate` (H+1..H+7 WIB).
  const deliveryDate = input.shipping.delivery_date;
  if (deliveryDate !== undefined && !availableDeliveryDates().includes(deliveryDate)) {
    throw invalid("Tanggal pengiriman tidak tersedia. Pilih tanggal pengiriman lagi.");
  }

  return db.transaction(async (tx) => {
    const [order] = await tx
      .select({
        id: orders.id,
        userId: orders.userId,
        status: orders.status,
        addressId: orders.addressId,
        subtotalAmount: orders.subtotalAmount,
        expired: sql<boolean>`${orders.reservedUntil} is not null and ${orders.reservedUntil} <= now()`,
      })
      .from(orders)
      .where(eq(orders.orderToken, input.order_token))
      .limit(1)
      .for("update");
    // Order milik user lain = 404, bukan 403: keberadaan data tidak bocor.
    if (!order || order.status !== "draft") throw orderNotFound();
    if (order.userId && order.userId !== userId) throw orderNotFound();
    if (order.expired) throw new AppError(410, "RESERVATION_EXPIRED", "Reservasi stok sudah berakhir. Mulai checkout lagi.");
    if (!order.addressId) throw new AppError(422, "ADDRESS_REQUIRED", "Isi alamat pengiriman dulu.");

    // Ongkir = harga quote yang disimpan server (bukan angka dari browser), dan quote belum kedaluwarsa.
    // Urutan eksplisit: kalau satu kurir punya beberapa layanan, hasilnya tetap deterministik (termurah).
    const [quote] = await tx
      .select({ price: shippingQuotes.price })
      .from(shippingQuotes)
      .where(
        and(
          eq(shippingQuotes.orderId, order.id),
          eq(shippingQuotes.courier, input.shipping.courier),
          sql`${shippingQuotes.expiresAt} > now()`,
        ),
      )
      .orderBy(asc(shippingQuotes.price), asc(shippingQuotes.id))
      .limit(1);
    if (!quote) {
      throw new AppError(422, "SHIPPING_QUOTE_INVALID", "Ongkir sudah tidak berlaku. Hitung ongkir lagi.");
    }

    let accountEmail: string | null = null;
    if (userId) {
      const [account] = await tx.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
      accountEmail = account!.email;
    }
    const contact = resolveContact(input.contact, accountEmail);

    const { shipping, installation, total } = computeTotals(order.subtotalAmount, quote.price, wantsInstallation);

    // Harga snapshot dari order_items (bukan harga live).
    const lines = await tx
      .select({
        variantId: orderItems.productVariantId,
        qty: orderItems.qty,
        unitPrice: orderItems.unitPrice,
        productName: products.name,
        material: productVariants.material,
      })
      .from(orderItems)
      .innerJoin(productVariants, eq(productVariants.id, orderItems.productVariantId))
      .innerJoin(products, eq(products.id, productVariants.productId))
      .where(eq(orderItems.orderId, order.id));

    // Dipanggil di dalam transaksi: gagal → rollback, order tetap draft.
    const snap = await deps.createTransaction({
      orderToken: input.order_token,
      grossAmount: total,
      items: buildSnapItems(lines, shipping, installation),
      customer: contact,
      method: input.payment_method,
    });

    await tx
      .update(orders)
      .set({
        status: "awaiting_payment",
        guestEmail: contact.email,
        guestPhone: contact.phone,
        shippingAmount: shipping,
        installationAmount: installation,
        totalAmount: total,
        paymentGateway: "midtrans",
        scheduledDeliveryDate: deliveryDate ?? null,
        wantsInstallation,
        // Jendela bayar dimulai sekarang, sama dengan `expiry` Snap. Tanpa ini, reserved_until masih nilai dari
        // `init` dan can_continue jadi false padahal link Midtrans masih berlaku.
        reservedUntil: sql`now() + make_interval(mins => ${PAYMENT_WINDOW_MINUTES})`,
        updatedAt: sql`now()`,
      })
      .where(eq(orders.id, order.id));
    await tx.insert(orderStatusLogs).values({
      orderId: order.id,
      fromStatus: "draft",
      toStatus: "awaiting_payment",
      actor: "system",
    });
    await tx.insert(paymentTransactions).values({
      orderId: order.id,
      gateway: "midtrans",
      status: "pending",
      amount: total,
      requestedMethod: input.payment_method,
      snapToken: snap.token,
      snapRedirectUrl: snap.redirect_url,
    });

    return {
      order_token: input.order_token,
      total_amount: total,
      payment: { gateway: "midtrans", snap_token: snap.token, redirect_url: snap.redirect_url },
    };
  });
}
