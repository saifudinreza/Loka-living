<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\CheckoutController;
use App\Http\Controllers\Api\PaymentWebhookController;

Route::prefix('api')->group(function () {
    Route::post('/checkout/init', [CheckoutController::class, 'init']);
    Route::post('/checkout/shipping-rate', [CheckoutController::class, 'shippingRate']);
    Route::post('/checkout/confirm', [CheckoutController::class, 'confirm']);
    Route::post('/payment/webhook', [PaymentWebhookController::class, 'handle']);
});