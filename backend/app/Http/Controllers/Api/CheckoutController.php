<?php

namespace App\Http\Controllers\Api;

use App\Exceptions\PaymentConfigException;
use App\Http\Controllers\Controller;
use App\Models\Address;
use App\Models\Order;
use App\Models\OrderStatusLog;
use App\Models\PaymentTransaction;
use App\Models\ShippingQuote;
use App\Services\Payment\MidtransService;
use App\Services\Shipping\CargoRateService;
use App\Services\Stock\StockReservationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use RuntimeException;

class CheckoutController extends Controller
{
    public function __construct(
        private StockReservationService $stockReservationService,
        private CargoRateService $cargoRateService,
        private MidtransService $midtransService,
    ) {}

    public function init(Request $request)
    {
        $request->validate([
            'items' => 'required|array|min:1',
            'items.*.product_variant_id' => 'required|string|uuid',
            'items.*.qty' => 'required|integer|min:1',
        ]);

        try {
            $result = $this->stockReservationService->init($request->items);
            return response()->json($result);
        } catch (RuntimeException $e) {
            return response()->json([
                'error' => $e->getMessage(),
            ], 422);
        }
    }

    public function shippingRate(Request $request)
    {
        $validated = $request->validate([
            'order_token'              => 'required|string',
            'address.full_address'     => 'required|string',
            'address.recipient_name'   => 'nullable|string|max:120',
            'address.phone'            => 'nullable|string|max:20',
            'address.kelurahan'        => 'nullable|string|max:80',
            'address.kecamatan'        => 'nullable|string|max:80',
            'address.city'             => 'nullable|string|max:80',
            'address.province'         => 'nullable|string|max:80',
            'address.postal_code'      => 'nullable|string|max:10',
            'address.country'          => 'nullable|string|size:2',
            'address.latitude'         => 'nullable|numeric',
            'address.longitude'        => 'nullable|numeric',
        ]);

        // 1. Cari order — harus draft & belum expired
        $order = Order::where('order_token', $validated['order_token'])->first();

        if (! $order || $order->status !== 'draft') {
            return response()->json(['error' => 'Order not found'], 404);
        }

        if ($order->reserved_until && $order->reserved_until->isPast()) {
            return response()->json(['error' => 'Reservation expired'], 410);
        }

        // 2. Simpan alamat, lalu kaitkan ke order
        $address = Address::create($validated['address']);
        $order->update(['address_id' => $address->id]);

        // 3. Hitung total berat dari item produk
        $order->load('items.variant.product');
        $totalWeightKg = $order->items->sum(
            fn ($item) => $item->qty * ($item->variant->product->weight_kg ?? 0)
        );

        // 4. Dapatkan rate ongkir
        $rates = $this->cargoRateService->getRates(
            totalWeightKg: $totalWeightKg,
            city:          $validated['address']['city'] ?? '',
            province:      $validated['address']['province'] ?? '',
        );

        // 5. Simpan setiap quote ke DB (cache 30 menit)
        foreach ($rates as $rate) {
            ShippingQuote::create([
                'order_id'     => $order->id,
                'courier'      => $rate['courier'],
                'service_name' => $rate['service_name'],
                'price'        => $rate['price'],
                'eta_days'     => $rate['eta_days'],
                'expires_at'   => now()->addMinutes(30),
            ]);
        }

        // 6. Generate tanggal pengiriman yang tersedia (H+1 sampai H+7)
        $dates = collect(range(1, 7))->map(fn ($d) => now()->addDays($d)->format('Y-m-d'));

        return response()->json([
            'options'                  => $rates,
            'available_delivery_dates' => $dates,
        ]);
    }

    public function confirm(Request $request)
    {
        $validated = $request->validate([
            'order_token'            => 'required|string',
            'contact.email'          => 'required|email',
            'contact.phone'          => 'required|string',
            'shipping.courier'       => 'required|string',
            'shipping.delivery_date' => 'nullable|date_format:Y-m-d',
            'wants_installation'     => 'boolean',
            'payment_method'         => 'required|string|in:qris,va_bca,credit_card',
        ]);

        $wantsInstallation = $request->boolean('wants_installation');

        // 1. Cari order (tanpa lock — ini cuma buat 404 check awal & load
        // relasi yang dibutuhkan; lock beneran terjadi di dalam transaction)
        $order = Order::where('order_token', $validated['order_token'])
            ->with('items.variant.product')
            ->first();

        if (! $order || $order->status !== 'draft') {
            return response()->json(['error' => 'Order not found'], 404);
        }
        if ($order->reserved_until && $order->reserved_until->isPast()) {
            return response()->json(['error' => 'Reservation expired'], 410);
        }
        if (! $order->address_id) {
            return response()->json([
                'error' => [
                    'code'    => 'ADDRESS_REQUIRED',
                    'message' => 'Alamat pengiriman belum diisi. Hitung ongkir dulu sebelum bayar.',
                ],
            ], 422);
        }

        // 2. Update contact info ke order (boleh di luar transaction —
        // bukan data kritis kalau di-retry)
        $order->update([
            'guest_email' => $validated['contact']['email'],
            'guest_phone' => $validated['contact']['phone'],
        ]);

        // 3. Ambil shipping quote dari DB — jangan percaya harga dari client!
        $selectedQuote = ShippingQuote::where('order_id', $order->id)
            ->where('courier', $validated['shipping']['courier'])
            ->where('expires_at', '>', now())
            ->first();

        if (! $selectedQuote) {
            return response()->json(['error' => 'Shipping quote expired or invalid'], 422);
        }

        // 4. Hitung ulang total di server
        $shippingAmount      = (int) $selectedQuote->price;
        $installationAmount  = $wantsInstallation ? 150000 : 0;
        $totalAmount         = (int) $order->subtotal_amount + $shippingAmount + $installationAmount;

        try {
            $payment = DB::transaction(function () use (
                $order, $validated, $wantsInstallation,
                $shippingAmount, $installationAmount, $totalAmount,
            ) {
                // Lock order row — cegah double-click / 2 request paralel
                // sama-sama lolos cek status 'draft' lalu sama-sama bikin
                // Snap transaction sendiri-sendiri. Request kedua akan
                // nunggu sampai request pertama commit/rollback, baru baca
                // status order yang sudah ter-update.
                $lockedOrder = Order::where('id', $order->id)
                    ->lockForUpdate()
                    ->with('items.variant.product')
                    ->first();

                if (! $lockedOrder || $lockedOrder->status !== 'draft') {
                    throw new RuntimeException('ORDER_ALREADY_PROCESSED');
                }

                // Panggil Midtrans Snap DULU, sebelum status order diubah.
                // Kalau ini throw, seluruh transaction di-rollback otomatis
                // (order tetap 'draft', tidak ada log/payment record baru)
                // sehingga user bisa klik "Bayar Sekarang" lagi tanpa macet.
                $snap = $this->midtransService->createTransaction(
                    $lockedOrder,
                    $validated['contact'],
                    $validated['payment_method'],
                );

                // 5. Baru sekarang update order dengan semua data final
                $lockedOrder->update([
                    'status'                  => 'awaiting_payment',
                    'shipping_amount'         => $shippingAmount,
                    'installation_amount'     => $installationAmount,
                    'total_amount'            => $totalAmount,
                    'payment_gateway'         => 'midtrans',
                    'scheduled_delivery_date' => $validated['shipping']['delivery_date'] ?? null,
                    'wants_installation'      => $wantsInstallation,
                ]);

                // 6. Catat status log
                OrderStatusLog::create([
                    'id'          => (string) Str::uuid(),
                    'order_id'    => $lockedOrder->id,
                    'from_status' => 'draft',
                    'to_status'   => 'awaiting_payment',
                    'actor'       => 'system',
                    'note'        => 'Checkout confirmed, payment pending',
                ]);

                // 7. Simpan transaksi pembayaran
                PaymentTransaction::create([
                    'order_id' => $lockedOrder->id,
                    'gateway'  => 'midtrans',
                    'status'   => 'pending',
                    'amount'   => $totalAmount,
                ]);

                return $snap;
            });

            return response()->json([
                'order_token'  => $order->order_token,
                'total_amount' => $totalAmount,
                'payment'      => [
                    'gateway'      => 'midtrans',
                    'snap_token'   => $payment['snap_token'],
                    'redirect_url' => $payment['redirect_url'],
                ],
            ]);
        } catch (PaymentConfigException $e) {
            // Kredensial Midtrans belum diset — jangan bocorkan detail ke user,
            // cukup log server-side. Lihat ISSUE-03 untuk format error standar penuh.
            Log::critical('Checkout confirm gagal: payment config missing.', [
                'order_id' => $order->id,
            ]);
            return response()->json([
                'error' => [
                    'code'    => 'PAYMENT_CONFIG_MISSING',
                    'message' => 'Metode pembayaran sedang tidak tersedia. Coba lagi beberapa saat.',
                ],
            ], 503);
        } catch (RuntimeException $e) {
            if ($e->getMessage() === 'ORDER_ALREADY_PROCESSED') {
                return response()->json(['error' => 'Order not found'], 404);
            }
            throw $e;
        } catch (\Exception $e) {
            // Midtrans gagal (timeout, 5xx, dll) — order tetap 'draft' karena
            // transaction di atas sudah rollback. Log detail lengkap di
            // server, tapi jangan sertakan $e->getMessage() di response.
            Log::error('Checkout confirm gagal: Midtrans tidak tersedia.', [
                'order_id' => $order->id,
                'message'  => $e->getMessage(),
            ]);
            return response()->json([
                'error' => [
                    'code'    => 'MIDTRANS_UNAVAILABLE',
                    'message' => 'Layanan pembayaran sedang bermasalah. Coba lagi beberapa saat.',
                ],
            ], 502);
        }
    }
}
