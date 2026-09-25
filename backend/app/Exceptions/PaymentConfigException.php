<?php

namespace App\Exceptions;

use RuntimeException;

/**
 * Dilempar saat kredensial payment gateway (mis. MIDTRANS_SERVER_KEY) belum
 * diset di .env. Dipetakan ke error code PAYMENT_CONFIG_MISSING di controller
 * (lihat ISSUE-03 untuk format error standar penuh).
 */
class PaymentConfigException extends RuntimeException
{
}
