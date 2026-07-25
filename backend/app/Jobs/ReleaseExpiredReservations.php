<?php

namespace App\Jobs;

use App\Models\Order;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;

class ReleaseExpiredReservations implements ShouldQueue
{
    use Queueable;
    // GAK pake Dispatchable — kita panggil dispatch() langsung di scheduler

    public function __construct() {}

    public function handle(): void
    {
        // Cari order draft yang reserved_until-nya udah lewat
        // Chunk biar kalau ribuan order gak overload memory
        Order::where('status', 'draft')
            ->where('reserved_until', '<=', now())
            ->chunk(100, function ($orders) {
                foreach ($orders as $order) {
                    // Dispatch per-order job — kalau satu gagal, yang lain tetap jalan
                    ReleaseOrderReservation::dispatch($order->id);
                }
            });
    }
}