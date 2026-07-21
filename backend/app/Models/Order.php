<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Order extends Model
{
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'order_token', 'guest_email', 'guest_phone', 'address_id',
        'status', 'subtotal_amount', 'shipping_amount',
        'installation_amount', 'total_amount', 'currency',
        'payment_gateway', 'scheduled_delivery_date',
        'wants_installation', 'reserved_until',
    ];

    protected $casts = [
        'wants_installation' => 'boolean',
        'scheduled_delivery_date' => 'date:Y-m-d',
        'reserved_until' => 'datetime',
    ];

    public function address(): BelongsTo
    {
        return $this->belongsTo(Address::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(OrderItem::class);
    }

    public function shippingQuotes(): HasMany
    {
        return $this->hasMany(ShippingQuote::class);
    }

    public function paymentTransactions(): HasMany
    {
        return $this->hasMany(PaymentTransaction::class);
    }

    public function statusLogs(): HasMany
    {
        return $this->hasMany(OrderStatusLog::class);
    }
}
