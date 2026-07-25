<?php

use App\Jobs\ReleaseExpiredReservations;
use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\Schedule;

// Schedule release expired stock reservations every minute
Schedule::job(new ReleaseExpiredReservations)->everyMinute();

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');