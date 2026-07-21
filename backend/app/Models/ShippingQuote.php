<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ShippingQuote extends Model
{
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'order_id',
        'courier',
        'service_name',
        'price',
        'eta_days',
        'raw_response',   // JSON asli dari cargo API
        'expires_at',
    ];

    protected $casts = [
        'raw_response' => 'array',
        'expires_at' => 'datetime',
    ];

    // Hanya punya created_at (pakai useCurrent di migration)
    public $timestamps = false;

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }
}


