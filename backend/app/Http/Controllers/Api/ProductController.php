<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use Illuminate\Http\Request;

class ProductController extends Controller
{
    public function index()
    {
        $products = Product::with('variants')
            ->where('status', 'active')
            ->get()
            ->map(fn ($product) => [
                'id' => $product->id,
                'name' => $product->name,
                'slug' => $product->slug,
                'category' => $product->category,
                'description' => $product->description,
                'weight_kg' => $product->weight_kg,
                'dimensions' => [
                    'length' => $product->length_cm,
                    'width' => $product->width_cm,
                    'height' => $product->height_cm,
                ],
                'variants' => $product->variants->map(fn ($v) => [
                    'id' => $v->id,
                    'material' => $v->material,
                    'color_hex' => $v->color_hex,
                    'price_idr' => (int) $v->price_idr,
                    'compare_at_price_idr' => $v->compare_at_price_idr ? (int) $v->compare_at_price_idr : null,
                    'stock_available' => $v->stock_available,
                    'sku' => $v->sku,
                    'image_urls' => $v->image_urls ?? [],
                ]),
            ]);

        return response()->json(['data' => $products]);
    }

    public function show(string $slug)
    {
        $product = Product::with('variants')
            ->where('slug', $slug)
            ->where('status', 'active')
            ->first();

        if (! $product) {
            return response()->json(['error' => 'Product not found'], 404);
        }

        return response()->json([
            'data' => [
                'id' => $product->id,
                'name' => $product->name,
                'slug' => $product->slug,
                'category' => $product->category,
                'description' => $product->description,
                'weight_kg' => (float) $product->weight_kg,
                'dimensions' => [
                    'length' => (float) $product->length_cm,
                    'width' => (float) $product->width_cm,
                    'height' => (float) $product->height_cm,
                ],
                'model_3d_url' => $product->model_3d_url,
                'variants' => $product->variants->map(fn ($v) => [
                    'id' => $v->id,
                    'material' => $v->material,
                    'color_hex' => $v->color_hex,
                    'price_idr' => (int) $v->price_idr,
                    'price_usd' => (float) $v->price_usd,
                    'compare_at_price_idr' => $v->compare_at_price_idr ? (int) $v->compare_at_price_idr : null,
                    'stock_available' => $v->stock_available,
                    'sku' => $v->sku,
                    'image_urls' => $v->image_urls ?? [],
                ]),
            ],
        ]);
    }
}
