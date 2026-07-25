<?php

use Illuminate\Support\Facades\Route;
use App\Http\Controllers\Api\CheckoutController;
use App\Http\Controllers\Api\PaymentWebhookController;
use App\Http\Controllers\Api\ProductController;

Route::get('/products', [ProductController::class, 'index']);
Route::get('/products/{slug}', [ProductController::class, 'show']);
Route::post('/checkout/init', [CheckoutController::class, 'init']);
Route::post('/checkout/shipping-rate', [CheckoutController::class, 'shippingRate']);
Route::post('/checkout/confirm', [CheckoutController::class, 'confirm']);
Route::post('/payment/webhook', [PaymentWebhookController::class, 'handle']);