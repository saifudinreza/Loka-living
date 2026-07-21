<?php

namespace Database\Seeders;

use App\Models\Product;
use App\Models\ProductVariant;
use Illuminate\Database\Seeder;

class ProductSeeder extends Seeder
{
    public function run(): void
    {
        $products = [
            [
                'id' => '00000000-0000-0000-0000-000000000001',
                'name' => 'Kursi Santai Rukun',
                'slug' => 'kursi-santai-rukun',
                'category' => 'chairs',
                'description' => 'Rangka rotan anyaman tangan dengan bantalan linen lepas-cuci — kursi baca yang menua dengan indah.',
                'length_cm' => 72, 'width_cm' => 80, 'height_cm' => 98, 'weight_kg' => 8,
                'variants' => [
                    ['material' => 'Rotan & Linen', 'color_hex' => '#C99A66', 'price_idr' => 2450000, 'price_usd' => 153.13, 'compare_at_price_idr' => 2900000, 'stock_available' => 13, 'sku' => 'KSR-RLN-01'],
                ],
            ],
            [
                'id' => '00000000-0000-0000-0000-000000000002',
                'name' => 'Kursi Makan Tani',
                'slug' => 'kursi-makan-tani',
                'category' => 'chairs',
                'description' => 'Kursi makan kayu solid dengan dudukan anyaman rotan, ringan namun kokoh untuk pemakaian harian.',
                'length_cm' => 46, 'width_cm' => 52, 'height_cm' => 84, 'weight_kg' => 6,
                'variants' => [
                    ['material' => 'Kayu Jati', 'color_hex' => '#9B6B3A', 'price_idr' => 1150000, 'price_usd' => 71.88, 'stock_available' => 48, 'sku' => 'KMT-JTI-01'],
                    ['material' => 'Kayu Mahoni', 'color_hex' => '#5A2D1A', 'price_idr' => 1250000, 'price_usd' => 78.13, 'stock_available' => 24, 'sku' => 'KMT-MHN-01'],
                ],
            ],
            [
                'id' => '00000000-0000-0000-0000-000000000003',
                'name' => 'Meja Kopi Lestari',
                'slug' => 'meja-kopi-lestari',
                'category' => 'tables',
                'description' => 'Meja kopi bidang lebar dari kayu jati reklamasi, permukaan diminyaki natural tanpa lapisan kimia.',
                'length_cm' => 110, 'width_cm' => 60, 'height_cm' => 42, 'weight_kg' => 18,
                'variants' => [
                    ['material' => 'Jati Reklamasi', 'color_hex' => '#8B6B4A', 'price_idr' => 1850000, 'price_usd' => 115.63, 'compare_at_price_idr' => 2200000, 'stock_available' => 21, 'sku' => 'MKL-JTR-01'],
                ],
            ],
            [
                'id' => '00000000-0000-0000-0000-000000000004',
                'name' => 'Meja Makan Bumi',
                'slug' => 'meja-makan-bumi',
                'category' => 'tables',
                'description' => 'Meja makan enam kursi dari satu bilah kayu suar, urat kayu unik pada tiap unit.',
                'length_cm' => 180, 'width_cm' => 90, 'height_cm' => 75, 'weight_kg' => 35,
                'variants' => [
                    ['material' => 'Kayu Suar', 'color_hex' => '#A0784A', 'price_idr' => 4900000, 'price_usd' => 306.25, 'stock_available' => 7, 'sku' => 'MMB-SUAR-01'],
                ],
            ],
            [
                'id' => '00000000-0000-0000-0000-000000000005',
                'name' => 'Lemari Arsip Wana',
                'slug' => 'lemari-arsip-wana',
                'category' => 'cabinets',
                'description' => 'Lemari penyimpanan tinggi dengan pintu panel rotan berventilasi dan engsel kuningan solid.',
                'length_cm' => 90, 'width_cm' => 45, 'height_cm' => 180, 'weight_kg' => 45,
                'variants' => [
                    ['material' => 'Kayu & Rotan', 'color_hex' => '#6B4226', 'price_idr' => 5600000, 'price_usd' => 350.00, 'compare_at_price_idr' => 6400000, 'stock_available' => 5, 'sku' => 'LAW-KRT-01'],
                ],
            ],
            [
                'id' => '00000000-0000-0000-0000-000000000006',
                'name' => 'Rak Buku Tumbuh',
                'slug' => 'rak-buku-tumbuh',
                'category' => 'shelves',
                'description' => 'Rak buku modular yang bisa ditambah tingkat seiring koleksi Anda bertumbuh.',
                'length_cm' => 80, 'width_cm' => 32, 'height_cm' => 160, 'weight_kg' => 22,
                'variants' => [
                    ['material' => 'Kayu Jati', 'color_hex' => '#9B6B3A', 'price_idr' => 2100000, 'price_usd' => 131.25, 'stock_available' => 34, 'sku' => 'RBT-JTI-01'],
                    ['material' => 'Kayu Walnut', 'color_hex' => '#5A3D2B', 'price_idr' => 2400000, 'price_usd' => 150.00, 'stock_available' => 18, 'sku' => 'RBT-WLN-01'],
                ],
            ],
            [
                'id' => '00000000-0000-0000-0000-000000000007',
                'name' => 'Bangku Panjang Sela',
                'slug' => 'bangku-panjang-sela',
                'category' => 'chairs',
                'description' => 'Bangku lorong ramping dari kayu mahoni, sempurna untuk area masuk atau ujung tempat tidur.',
                'length_cm' => 140, 'width_cm' => 38, 'height_cm' => 45, 'weight_kg' => 12,
                'variants' => [
                    ['material' => 'Kayu Mahoni', 'color_hex' => '#5A2D1A', 'price_idr' => 1680000, 'price_usd' => 105.00, 'stock_available' => 19, 'sku' => 'BPS-MHN-01'],
                ],
            ],
            [
                'id' => '00000000-0000-0000-0000-000000000008',
                'name' => 'Meja Samping Endap',
                'slug' => 'meja-samping-endap',
                'category' => 'tables',
                'description' => 'Meja samping mungil dengan laci tersembunyi, pas untuk lampu baca dan barang kecil.',
                'length_cm' => 40, 'width_cm' => 40, 'height_cm' => 55, 'weight_kg' => 8,
                'variants' => [
                    ['material' => 'Kayu Ek', 'color_hex' => '#C4A882', 'price_idr' => 890000, 'price_usd' => 55.63, 'compare_at_price_idr' => 1050000, 'stock_available' => 52, 'sku' => 'MSE-KEK-01'],
                ],
            ],
        ];

        foreach ($products as $data) {
            $variants = $data['variants'];
            unset($data['variants']);

            $product = Product::create($data);

            foreach ($variants as $v) {
                $v['product_id'] = $product->id;
                ProductVariant::create($v);
            }
        }
    }
}
