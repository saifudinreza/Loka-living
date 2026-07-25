<?php

namespace App\Jobs;

use App\Models\Order;
use App\Models\OrderStatusLog;
use App\Models\ProductVariant;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ReleaseOrderReservation implements ShouldQueue
{
    use Queueable;

    // Terima order_id (UUID string) — kita panggil dari job satunya nanti
    public function __construct(
        private string $orderId,
    ) {}
    
    public function handle(): void
    {
        DB::transaction(function () {
            // lock order row dulu - cegah dua worker proses order yg sama
            $order = Order::where('id',$this->orderId)
                ->lockForUpdate()
                ->first();

                // Guard: udah bayar / udah expired / gak ada
                if (! $order || $order->status !== 'draft') {
                    return;
                }

                // Guard: reservasi masih berlaku? skip aja (belum waktunya)
                if ($order->reserved_until && $order->reserved_until->isFuture()) {
                    return;
                }

                // Load items + lock variant rows (urut sesuai ID biar ga ada deadlock)
                $items = $order->items; //hasMany, select * by default
                $variantIds = $items->pluck('product_variant_id')->sort()->values();

                $variants = ProductVariant::whereIn('id', $variantIds)
                    ->orderBy('id')
                    ->lockForUpdate()
                    ->get()
                    ->keyBy('id');

                foreach ($items as $item) {
                    $variant = $variants->get($item->product_variant_id);

                    if (! $variant) continue;

                    // Balikin stock: reserved -> available
                    $variant->decrement('stock_reserved', $item->qty);
                    $variant->increment('stock_available', $item->qty);
                }

                // Update status order jadi expired
                $order->update([
                    'status' => 'expired',
                ]);

                // Catat log
                OrderStatusLog::create([
                    'id' => (string) Str::uuid(),
                    'order_id' => $order->id,
                    'from_status' => 'draft',
                    'to_status' => 'expired',
                    'actor' => 'system',
                    'note' => 'Reservation expired, stock released.',
                ]);
        });
    }
}
