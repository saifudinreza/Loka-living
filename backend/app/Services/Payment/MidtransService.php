<?php

namespace App\Services\Payment;

use App\Models\Order;
use Midtrans\Snap;
use Midtrans\Config;

class MidtransService 
{
    public function __construct()
    {
        Config::$serverKey    = config('midtrans.server_key');
        Config::$clientKey    = config('midtrans.client_key');
        Config::$isProduction = config('midtrans.is_production');
        Config::$isSanitized  = true;
        Config::$is3ds        = true;
    }

    public function createTransaction(Order $order, array $customer): array
    {
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

        $snap = Snap::createTransaction($params);

        return [
            'snap_token'   => $snap->token,
            'redirect_url' => $snap->redirect_url,
        ];
    }
}

