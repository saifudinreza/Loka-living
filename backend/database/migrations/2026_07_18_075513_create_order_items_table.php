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
        Schema::create('order_items', function (Blueprint $table) {
            $table->uuid('id')->primary()->default(DB::raw('gen_random_uuid()'));

            $table->foreignUuid('order_id')
                ->constrained('orders')
                ->cascadeOnDelete();

            // tidak cascade delete - kalau variant produk dihapus, riwayat order_items tetap harus ada(history transaksi)
            $table->foreignUuid('product_variant_id')
                ->constrained('product_variants');
            
            $table->integer('qty')->default(1);

            // snapshort harga saat transaksi, bukan ambil live dari product_variants.price_idr
            $table->bigInteger('unit_price');
            $table->bigInteger('subtotal');

            $table->index('order_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('order_items');
    }
};
