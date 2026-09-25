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
        // Kolom asli ditulis 'schedule_delivery_date' (typo), tapi model &
        // controller sudah dari awal pakai 'scheduled_delivery_date' — jadi
        // confirm() selalu gagal dengan SQL error "column does not exist".
        Schema::table('orders', function (Blueprint $table) {
            $table->renameColumn('schedule_delivery_date', 'scheduled_delivery_date');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::table('orders', function (Blueprint $table) {
            $table->renameColumn('scheduled_delivery_date', 'schedule_delivery_date');
        });
    }
};
