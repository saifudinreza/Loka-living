<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\CheckoutController;
use App\Http\Controllers\Api\PaymentWebhookController;
use App\Http\Controllers\Api\ProductController;

Route::get('/products', [ProductController::class, 'index']);
Route::get('/products/{slug}', [ProductController::class, 'show']);

// Checkout & order endpoints ditembak langsung dari browser guest — rate limit
// buat cegah brute-force/abuse (PRD §11: "Rate limiting di endpoint sensitif").
Route::middleware('throttle:30,1')->group(function () {
    Route::post('/checkout/init', [CheckoutController::class, 'init']);
    Route::post('/checkout/shipping-rate', [CheckoutController::class, 'shippingRate']);
    Route::post('/checkout/confirm', [CheckoutController::class, 'confirm']);
});

// Webhook Midtrans TIDAK di-throttle — Midtrans yang kirim, bukan browser user,
// dan kita gak mau notifikasi pembayaran ke-drop gara-gara limit.
Route::post('/payment/webhook', [PaymentWebhookController::class, 'handle']);