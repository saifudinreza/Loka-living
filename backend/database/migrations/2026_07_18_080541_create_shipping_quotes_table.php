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
        Schema::create('shipping_quotes', function (Blueprint $table) {
            $table->uuid('id')->primary()->default(DB::raw('gen_random_uuid()'));
            $table->foreignUuid('order_id')
                ->constrained('orders')
                ->cascadeOnDelete();
            
            // jne_trucking | dakota | deliveree
            $table->string('courier', 30)->nullable();
            $table->string('service_name', 60)->nullable();
            $table->bigInteger('price')->nullable();
            $table->string('eta_days', 20)->nullable();

            // simpan payload asli dari cargo API untuk audit/debug
            $table->jsonb('raw_response')->nullable();

            // quote cargo API biasanya cuma valid sementara (mis. 15-30 menit)
            $table->timestamp('expires_at')->nullable();

            $table->timestamp('created_at')->useCurrent();

            $table->index('order_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('shipping_quotes');
    }
};
