<?php

namespace App\Services\Shipping;

class CargoRateService
{
    // Mapping provinsi ke zona ongkir — makin jauh, makin mahal
    private const ZONES = [
        // Zona 1: Jabodetabek
        'jabodetabek' => ['Jakarta', 'Bekasi', 'Bogor', 'Depok', 'Tangerang'],
        // Zona 2: Jawa non-Jabodetabek
        'jawa'        => ['Jawa Barat', 'Jawa Tengah', 'DI Yogyakarta', 'Jawa Timur', 'Banten'],
        // Zona 3: Sumatera + Bali
        'sumatera_bali' => ['Aceh', 'Sumatera Utara', 'Sumatera Barat', 'Riau', 'Kepulauan Riau',
                            'Jambi', 'Bengkulu', 'Sumatera Selatan', 'Bangka Belitung', 'Lampung', 'Bali'],
        // Zona 4: Kalimantan, Sulawesi, Nusa Tenggara
        'kal_sul_nusa' => ['Kalimantan Barat', 'Kalimantan Tengah', 'Kalimantan Selatan',
                           'Kalimantan Timur', 'Kalimantan Utara',
                           'Sulawesi Utara', 'Sulawesi Tengah', 'Sulawesi Selatan',
                           'Sulawesi Tenggara', 'Sulawesi Barat', 'Gorontalo',
                           'Nusa Tenggara Barat', 'Nusa Tenggara Timur'],
        // Zona 5: Maluku + Papua
        'maluku_papua' => ['Maluku', 'Maluku Utara', 'Papua', 'Papua Barat',
                           'Papua Selatan', 'Papua Tengah', 'Papua Pegunungan'],
    ];

    // Rate table: [zona] => [[courier, service_name, base_rate, price_per_kg, eta_days], ...]
    // price = base_rate + ceil(weight * price_per_kg)
    private const RATES = [
        1 => [
            ['jne_trucking', 'JTR Reguler',     50000,  2000, '2-3 hari'],
            ['dakota',       'Dakota Darat',     80000,  3000, '1-2 hari'],
            ['deliveree',    'Same-day Truck',  150000,  5000, '1 hari'],
        ],
        2 => [
            ['jne_trucking', 'JTR Reguler',     75000,  3000, '3-5 hari'],
            ['dakota',       'Dakota Darat',    110000,  4500, '2-4 hari'],
            ['deliveree',    'Next-day Truck',  200000,  7000, '1-2 hari'],
        ],
        3 => [
            ['jne_trucking', 'JTR Reguler',    100000,  5000, '4-7 hari'],
            ['dakota',       'Dakota Laut',     150000,  7000, '3-6 hari'],
        ],
        4 => [
            ['jne_trucking', 'JTR Reguler',    150000,  8000, '5-9 hari'],
            ['dakota',       'Dakota Laut',     200000, 10000, '4-8 hari'],
        ],
        5 => [
            ['jne_trucking', 'JTR Reguler',    200000, 12000, '7-14 hari'],
            ['dakota',       'Dakota Laut',     250000, 15000, '6-12 hari'],
        ],
    ];

    public function getRates(int $totalWeightKg, string $city, string $province): array
    {
        $zone = $this->determineZone($city, $province);
        $rates = self::RATES[$zone] ?? self::RATES[5]; // fallback ke zona termahal

        return array_map(fn ($r) => [
            'courier'      => $r[0],
            'service_name' => $r[1],
            'price'        => $r[2] + (int) ceil($totalWeightKg * $r[3]),
            'eta_days'     => $r[4],
        ], $rates);
    }

    private function determineZone(string $city, string $province): int
    {
        $city = trim($city);
        $province = trim($province);

        if (in_array($city, self::ZONES['jabodetabek'], true)) return 1;
        if (in_array($province, self::ZONES['jawa'], true))        return 2;
        if (in_array($province, self::ZONES['sumatera_bali'], true)) return 3;
        if (in_array($province, self::ZONES['kal_sul_nusa'], true)) return 4;

        return 5; // maluku_papua + fallback
    }
}