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
        Schema::create('product_variants', function (Blueprint $table) {
            $table->uuid('id')->primary()->default(DB::raw('gen_random_uuid()'));

            // relasi ke produk induk - kalau produk dihapus , semua variantnya ikut terhapus
            $table->foreignUuid('product_id')
                ->constrained('products')
                ->cascadeOnDelete();
            
                $table->string('material', 80)->nullable();
                $table->string('color_hex', 7)->nullable();

                // IDR disimpan sebagai integer penuh ( bukan desimal ) - hindari floating point error
                $table->bigInteger('price_idr');
                $table->decimal('price_usd', 10, 2);

                // harga coret (opsional), buat tampilan diskon di PDP
                $table->bigInteger('compare_at_price_idr')->nullable();

                // inti stock reservation system - lihat catatan di CLAUDE.md soal kenapa dipisah
                $table->integer('stock_available')->default(0);
                $table->integer('stock_reserved')->default(0);
                
                $table->string('sku', 50)->unique()->nullable();

                // array gambar per varian, tidak butuh table terpisah karena tidak ada query relasional atas gambar
                $table->jsonb('image_urls')->nullable();

                $table->timestamp('created_at')->useCurrent();

                // dipakai berat saat checkout & PDP query varian per produk
                $table->index('product_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('product_variants');
    }
};
