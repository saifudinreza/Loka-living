<?php

namespace App\Services\Stock;

use App\Models\Order;
use App\Models\OrderItem;
use App\Models\ProductVariant;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;

class StockReservationService
{
    /**
     * Inisiasi checkout: lock stock → validasi → kurangi → bikin draft order
     *
     * Urutannya penting:
     *   1. Lock variant rows (FOR UPDATE) biar dua request bareng gak oversell
     *   2. Urutkan variant berdasarkan ID — hindari deadlock
     *   3. Validasi stok pake nilai dari DB, bukan dari client
     *   4. Update stock_available - qty, stock_reserved + qty
     *   5. Create Order (draft) + OrderItems dalam 1 transaksi
     *
     * @param array $items [{product_variant_id: string, qty: int}]
     * @return array
     */
    public function init(array $items): array
    {
        $variantIds = collect($items)->pluck('product_variant_id');

        return DB::transaction(function () use ($items, $variantIds) {
            // --- Langkah 1: Lock variant rows ---
            // orderBy('id') penting: semua request lock dgn urutan yg sama,
            // mencegah circular wait (deadlock).
            $variants = ProductVariant::whereIn('id', $variantIds)
                ->orderBy('id')
                ->lockForUpdate()
                ->get()
                ->keyBy('id');

            // Pre-load product names di luar lock (read-only, gak perlu di-lock)
            $productNames = ProductVariant::whereIn('id', $variantIds)
                ->with('product:id,name')
                ->get()
                ->keyBy('id')
                ->map(fn ($v) => $v->product->name);

            $orderItemData = []; // [ ['variant'=>..., 'qty'=>..., 'unit_price'=>..., 'subtotal'=>...], ... ]

            foreach ($items as $item) {
                $variant = $variants->get($item['product_variant_id']);

                if (! $variant) {
                    throw new RuntimeException(
                        "Variant {$item['product_variant_id']} tidak ditemukan"
                    );
                }

                if ($variant->stock_available < $item['qty']) {
                    throw new RuntimeException(
                        "Stok {$variant->sku} tidak mencukupi. " .
                        "Tersedia: {$variant->stock_available}, diminta: {$item['qty']}"
                    );
                }

                // --- Langkah 2: Kurangi available, tambah reserved ---
                $variant->decrement('stock_available', $item['qty']);
                $variant->increment('stock_reserved', $item['qty']);

                // --- Langkah 3: Hitung harga dari DB (jangan percaya dari client!) ---
                $unitPrice = $variant->price_idr;
                $subtotal  = $unitPrice * $item['qty'];

                $orderItemData[] = compact('variant', 'unitPrice', 'subtotal') + ['qty' => $item['qty']];
            }

            // --- Langkah 4: Create Order (draft) ---
            $subtotalAmount = collect($orderItemData)->sum('subtotal');

            $order = Order::create([
                'order_token'   => Str::random(64),
                'status'        => 'draft',
                'subtotal_amount' => $subtotalAmount,
                'total_amount'  => $subtotalAmount, // shipping & installation diisi nanti
                'currency'      => 'IDR',
                'reserved_until' => now()->addMinutes(30),
            ]);

            // --- Langkah 5: Create OrderItems ---
            foreach ($orderItemData as $data) {
                OrderItem::create([
                    'order_id'          => $order->id,
                    'product_variant_id'=> $data['variant']->id,
                    'qty'               => $data['qty'],
                    'unit_price'        => $data['unitPrice'],
                    'subtotal'          => $data['subtotal'],
                ]);
            }

            // --- Langkah 6: Return response ---
            return [
                'order_token'    => $order->order_token,
                'reserved_until' => $order->reserved_until->toIso8601String(),
                'items'          => collect($orderItemData)->map(fn ($d) => [
                    'product_variant_id' => $d['variant']->id,
                    'product_name'       => $productNames->get($d['variant']->id) ?? '',
                    'sku'                => $d['variant']->sku,
                    'material'           => $d['variant']->material,
                    'color_hex'          => $d['variant']->color_hex,
                    'qty'                => $d['qty'],
                    'unit_price'         => $d['unitPrice'],
                    'subtotal'           => $d['subtotal'],
                    'image_url'          => $d['variant']->image_urls[0] ?? null,
                ])->values(),
                'subtotal_amount'  => $subtotalAmount,
                'currency'         => 'IDR',
            ];
        });
    }
}