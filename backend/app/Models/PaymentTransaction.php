<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PaymentTransaction extends Model
{
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'id',
        'order_id',
        'gateway',                 // midtrans | stripe
        'gateway_transaction_id',   // ID dari pihak gateway
        'gateway_payment_method',   // qris | va_bca | credit_card | paypal
        'status',                   // pending | settlement | expired | failed | refunded
        'amount',
        'raw_payload',
    ];

    protected $casts = [
        'raw_payload' => 'array',
    ];

    public $timestamps = false;

    public function order():BelongsTo
    {
        return $this->belongsTo(Order::class);
    }
}
