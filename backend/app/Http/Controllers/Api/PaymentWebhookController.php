<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Order;
use App\Models\OrderStatusLog;
use App\Models\PaymentTransaction;
use App\Models\ProcessedWebhook;
use App\Services\Stock\StockReservationService;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class PaymentWebhookController extends Controller
{
    public function __construct(
        private StockReservationService $stockReservationService,
    ) {}

    public function handle(Request $request)
    {
        $payload = $request->all();

        // step 1: verifikasi signature
        // Midtrans compute signature_key = sha512(order_id + status_code + gross_amount + server_key)
        // Kita compute ulang & bandingin pake hash_equals (timing-safe comparison)

        if (! $this->verifySignature($payload)) {
            return response()->json([
                'error' => 'Invalid signature'
            ], 401);
        }

        // ───────────────────────────────────────────────
        // Step 2: Idempotency — cek apakah webhook ini udah diproses
        // event_id = transaction_id (bukan transaction_id + transaction_status)
        // Kenapa? Karena kalo settlement udah diproses, kita gamau expire yg datang
        // belakangan malah nge-release stock. Status pertama yg dateng = final.
        // ───────────────────────────────────────────────

        $eventId = $payload['transaction_id'] ?? null;
        if ($eventId && ProcessedWebhook::where('event_id', $eventId)->exists()) {
            return response()->json(['message' => 'Already processed'], 200);
        }

        // ───────────────────────────────────────────────
        // Step 3: Cari Order berdasarkan order_token
        // Midtrans pake order_id dari parameter transaction_details — itu isinya
        // order_token (random string 64 karakter), bukan UUID primary key.
        // ───────────────────────────────────────────────

        $orderToken = $payload['order_id'] ?? '';
        $order = Order::where('order_token', $orderToken)->first();

        if (! $order) {
            return response()->json([
                'error' => 'Order not found'
            ], 404);
        }

        // ───────────────────────────────────────────────
        // Step 4: Validasi Amount
        // Jangan percaya gross_amount dari webhook mentah2 — validasi sama
        // total_amount di DB untuk antisipasi tampering/man-in-the-middle.
        // ───────────────────────────────────────────────

        $grossAmount = (int) ($payload['gross_amount'] ?? 0);
        if ($grossAmount !== (int) $order->total_amount) {
            return response()->json([
                'error' => 'Amount mismatch'
            ], 400);
        }

        // ───────────────────────────────────────────────
        // Step 5: Map transaction_status Midtrans → status Order kita
        //
        // Midtrans statuses:
        //   settlement        → pembayaran sukses (transfer confirmed, QR scanned, card captured)
        //   capture           → credit card capture — cek fraud_status == 'accept'
        //   expire            → batas waktu habis
        //   deny / cancel     → ditolak / dibatalkan
        //   refund / partial_refund → refund
        //   pending           → masih nunggu bayar (order udah di set awaiting_payment di confirm)
        //
        // Kita cuma proses status yang relevan: settlement, expire, deny, cancel

        $midtransStatus = $payload['transaction_status'] ?? '';
        $fraudStatus = $payload['fraud_status'] ?? '';
        $orderStatus = null;

        if ($midtransStatus === 'settlement') {
            $orderStatus = 'paid';
        } elseif ($midtransStatus === 'capture' && $fraudStatus === 'accept') {
            $orderStatus = 'paid';
        } elseif (in_array($midtransStatus, ['expire', 'deny', 'cancel'])) {
            $orderStatus = 'expired';
        } elseif (in_array($midtransStatus, ['refund', 'partial_refund'])) {
            $orderStatus = 'refunded';
        }

        // ───────────────────────────────────────────────
        // Step 6: Proses — kalo ada status change, lakukan dalam DB transaction
        // ───────────────────────────────────────────────
        if (! $orderStatus) {
            // pending / authorize / dll - ga perlu action, tapi tetap ack 200
            return response()->json([
                'message' => 'No action needed'
            ], 200);
        }

        $previousStatus = $order->status;

        DB::transaction(function () use (
            $order, $payload, $orderStatus, $previousStatus,
            $midtransStatus, $eventId
        ) {
            // 6a. update status order
            $order->update(['status' => $orderStatus]);

            //6b. Update atau buat payment_transactions
            // cari transaction record yg pending ( dibikin pas confirm )
            // update dengan data dari gateway
            $transaction = PaymentTransaction::where('order_id', $order->id)
                ->where('gateway', 'midtrans')
                ->latest()
                ->first();
                
            if ($transaction) {
                $transaction->update([
                    'gateway_transaction_id' => $payload['transaction_id'] ?? null,
                    'gateway_payment_method' => $payload['payment_type'] ?? null,
                    'status' => $midtransStatus,
                    'raw_payload' => $payload
                ]);
            } else {
                //fallback: bikin baru (misal wbhook datang sebelum confirm selesei)
                PaymentTransaction::create([
                    'id' => (string) Str::uuid(),
                    'order_id' => $order->id,
                    'gateway' => 'midtrans',
                    'gateway_transaction_id' => $payload['transaction_id'] ?? null,
                    'gateway_payment_method' => $payload['payment_type'] ?? null,
                    'status' => $midtransStatus,
                    'amount' => (int) ($payload['gross_amount'] ?? 0),
                    'raw_payload' => $payload,
                ]);
            }

            // 6c. Catat status log
            OrderStatusLog::create([
                'id' => (string) Str::uuid(),
                'order_id' => $order->id,
                'from_status' => $previousStatus,
                'to_status' => $orderStatus,
                'note' => "Webhook ($midtransStatus)",
                'actor' => 'midtrans',
            ]);

            // 6d. kalo expired/dededny/cancel - release stock
            if (in_array($orderStatus, ['expired', 'cancelled'])) {
                $this->stockReservationService->release($order);
            }

            // 6e. tandai webhook sebagai proccessed (idemopotency)
            ProcessedWebhook::create([
                'id' => (string) Str::uuid(),
                'gateway' => 'midtrans',
                'event_id' => $eventId,
                'processed_at' => now()
            ]);
        });

        return response()->json([
            'message' => 'OK'
        ], 200);
    }

    private function verifySignature(array $payload): bool
    {
        $orderId = $payload['order_id'] ?? '';
        $statusCode = $payload['status_code'] ?? '';
        $grossAmt = $payload['gross_amount'] ?? '';
        $serverKey = config('midtrans.server_key');

        $computed = hash('sha512', $orderId . $statusCode . $grossAmt . $serverKey);

        return hash_equals($computed, $payload['signature_key'] ?? '');
    }
}
