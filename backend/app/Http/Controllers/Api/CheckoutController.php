<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\Stock\StockReservationService;
use Illuminate\Http\Request;
use RuntimeException;

class CheckoutController extends Controller
{
    public function __construct(
        private StockReservationService $stockReservationService,
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
}
