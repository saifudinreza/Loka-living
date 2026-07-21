<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class OrderStatusLog extends Model
{
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
         'id',
        'order_id',
        'from_status',
        'to_status',
        'actor',
        'note',
    ];

    public function order(): BelongsTo
    {
        return $this->belongsTo(Order::class);
    }
}
