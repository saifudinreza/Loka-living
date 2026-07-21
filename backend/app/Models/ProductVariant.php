<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductVariant extends Model
{
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id', 'product_id', 'material', 'color_hex',
        'price_idr', 'price_usd', 'compare_at_price_idr',
        'stock_available', 'stock_reserved', 'sku', 'image_urls',
    ];

    protected $casts = [
        'image_urls' => 'array',
    ];

    public $timestamps = false;

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
