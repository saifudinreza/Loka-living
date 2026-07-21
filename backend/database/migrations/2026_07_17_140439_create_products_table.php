<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Run the migrations.
     */
    public function up(): void
    {
        Schema::create('products', function (Blueprint $table) {
            $table->uuid('id')->primary();

            $table->string('name', 150);
            $table->string('slug', 160)->unique(); // dipakai di URL PDP, mis. /produk/kursi-santai-oak
            $table->string('category', 50); // chairs | tables | cabinets | shelves
            $table->text('description')->nullable();

            // Dimensi & berat fisik produk — weight_kg WAJIB diisi karena
            // dipakai CargoRateService buat hitung ongkir (lihat TECHNICAL §5.4)
            $table->decimal('length_cm', 6, 1)->nullable();
            $table->decimal('width_cm', 6, 1)->nullable();
            $table->decimal('height_cm', 6, 1)->nullable();
            $table->decimal('weight_kg', 6, 2);

            $table->string('model_3d_url', 255)->nullable(); //dipakai model viewer di PDP nanti
            
            // active = tampil di storefront, draft = belum dipublish, archived = disembunyikan
            $table->string('status', 20)->default('active');

            $table->timestamps(); // bikin created_at & updated_at otomatis
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('products');
    }
};
