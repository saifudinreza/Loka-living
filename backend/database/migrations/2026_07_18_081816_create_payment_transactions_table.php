<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('payment_transactions', function (Blueprint $table) {
            $table->uuid('id')->primary()->default(DB::raw('gen_random_uuid()'));

            $table->foreignUuid('order_id')
                ->constrained('orders')
                ->cascadeOnDelete();

            // midtrans | stripe
            $table->string('gateway', 20);

            // ID transaksi dari sisi gateway (mis. Midtrans transaction_id)
            $table->string('gateway_transaction_id', 120)->nullable();

            // qris | va_bca | credit_card | paypal | kredivo, dst
            $table->string('gateway_payment_method', 40)->nullable();

            // pending | settlement | expired | failed | refunded
            
            $table->string('status', 30);

            $table->bigInteger('amount');

            // simpan payload webhook/response asli untuk audit & debug
            $table->jsonb('raw_payload')->nullable();
            
            $table->timestamp('created_at')->useCurrent();
            
            $table->index('order_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('payment_transactions');
    }
};
