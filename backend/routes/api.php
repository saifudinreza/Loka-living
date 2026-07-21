<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\CheckoutController;

Route::prefix('api')->group(function () {
    Route::post('/checkout/init', [CheckoutController::class, 'init']);
});