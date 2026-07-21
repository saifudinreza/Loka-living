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
        Schema::create('orders', function (Blueprint $table) {
            $table->uuid('id')->primary()->default(DB::raw('gen_random_uuid()'));

            // untuk guest tracking (link "cek status pesanan"), bukan sequental ID
            $table->string('order_token, 64')->unique();

            $table->string('guest_email', 150)->nullable();
            $table->string('guest_phone', 20)->nullable();

            // nullable karena address baru terisi setelah tahap checkout/shipping
            $table->foreignUuid('address_id')
                ->nullable()
                ->constrained('addresses');

            // draft | awaiting_payment | paid | processing | scheduled | shipped | installed | completed | cancelled | expired | refunded
            $table->string('status', 30)->default('draft');

            $table->bigInteger('subtotal_amount');
            $table->bigInteger('shipping_amount')->default(0);
            $table->bigInteger('installation_amount')->default(0);
            $table->bigInteger('total_amount');
            $table->string('currency', 3)->default('IDR');

            // midtrans | stripe
            $table->string('payment_gateway', 20)->nullable();

            $table->date('schedule_delivery_date')->nullable();
            $table->boolean('wants_installation')->default(false);

            // TTL reservasi stock, lihat workflow-system §4
            $table->timestamp('reserved_until')->nullable();

            $table->timestamps();

            $table->index('status');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('orders');
    }
};
