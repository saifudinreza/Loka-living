<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Address extends Model
{
    public $incrementing = false;
    protected $keyType = 'string';

    protected $fillable = [
        'recipient_name', 'phone', 'full_address',
        'kelurahan', 'kecamatan', 'city', 'province',
        'postal_code', 'country', 'latitude', 'longitude',
    ];

    public $timestamps = false;
}
