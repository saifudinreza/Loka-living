<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OrderItem extends Model
{
    // UUID primary key — non-incrementing string
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'order_id',
        'product_variant_id',
        'qty',
        'unit_price',
        'subtotal',
    ];

    public $timestamps = false;

    // Setiap item punya 1 order induk
    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }

    // SetiapItem mengacu ke 1 varian produk tertentu
    public function variant(): BelongsTo
    {
        return $this->belongsTo(ProductVariant::class, 'product_variant_id');
    }
}