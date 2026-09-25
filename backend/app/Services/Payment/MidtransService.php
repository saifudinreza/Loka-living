<?php

namespace App\Services\Payment;

use App\Exceptions\PaymentConfigException;
use App\Models\Order;
use Midtrans\Snap;
use Midtrans\Config;

class MidtransService 
{
    // Mapping payment_method kita -> channel yang diaktifkan di Snap
    private const PAYMENT_CHANNELS = [
        'qris'        => ['qris'],
        'va_bca'      => ['bca_va'],
        'credit_card' => ['credit_card'],
    ];

    public function __construct()
    {
        Config::$serverKey    = config('midtrans.server_key');
        Config::$clientKey    = config('midtrans.client_key');
        Config::$isProduction = config('midtrans.is_production');
        Config::$isSanitized  = true;
        Config::$is3ds        = true;
    }

    public function createTransaction(Order $order, array $customer, ?string $paymentMethod = null): array
    {
        // Dicek di sini (bukan constructor) supaya endpoint lain yang cuma
        // inject controller ini (init, shipping-rate) tidak ikut gagal
        // gara-gara Midtrans key belum diisi — cuma confirm yang butuh ini.
        if (empty(config('midtrans.server_key')) || empty(config('midtrans.client_key'))) {
            throw new PaymentConfigException(
                'MIDTRANS_SERVER_KEY / MIDTRANS_CLIENT_KEY belum diset di .env.'
            );
        }

        $itemDetails = $order->items->map(fn ($item) => [
            'id'       => $item->product_variant_id,
            'price'    => (int) $item->unit_price,
            'quantity' => $item->qty,
            'name'     => $item->variant->product->name . ' - ' . $item->variant->material,
        ])->toArray();

        // Shipping fee sebagai item
        if ($order->shipping_amount > 0) {
            $itemDetails[] = [
                'id'       => 'SHIPPING',
                'price'    => (int) $order->shipping_amount,
                'quantity' => 1,
                'name'     => 'Ongkos Kirim',
            ];
        }

        $params = [
            'transaction_details' => [
                'order_id'     => $order->order_token,
                'gross_amount' => (int) $order->total_amount,
            ],
            'item_details'  => $itemDetails,
            'customer_details' => [
                'first_name' => $customer['first_name'] ?? '',
                'last_name'  => $customer['last_name'] ?? '',
                'email'      => $customer['email'],
                'phone'      => $customer['phone'],
            ],
        ];

        // Batasi channel Snap sesuai pilihan user kalau ada mapping-nya
        if ($paymentMethod && isset(self::PAYMENT_CHANNELS[$paymentMethod])) {
            $params['enabled_payments'] = self::PAYMENT_CHANNELS[$paymentMethod];
        }

        $snap = Snap::createTransaction($params);

        return [
            'snap_token'   => $snap->token,
            'redirect_url' => $snap->redirect_url,
        ];
    }
}

