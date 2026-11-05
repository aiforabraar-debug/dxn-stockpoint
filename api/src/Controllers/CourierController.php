<?php
declare(strict_types=1);

namespace DXN\Controllers;

use DXN\Auth;
use DXN\Database;
use DXN\Request;
use DXN\Response;
use DXN\SteadFast;
use DXN\Store;
use DXN\Util;

final class CourierController
{
    public static function settings(): void
    {
        Auth::requireAdmin();
        Response::ok([
            'settings' => [
                'base_url'      => SteadFast::baseUrl(),
                'api_key'       => SteadFast::apiKey(),
                'secret_key'    => SteadFast::secretKey() !== '' ? '••••' . substr(SteadFast::secretKey(), -4) : '',
                'webhook_token' => SteadFast::webhookToken(),
                'configured'    => SteadFast::configured(),
            ],
        ]);
    }

    public static function saveSettings(): void
    {
        Auth::requireAdmin();
        $payload = Request::json();

        $updated = [];
        if (array_key_exists('base_url', $payload)) {
            $url = trim((string) $payload['base_url']);
            if ($url !== '') {
                Store::putSetting('steadfast_base_url', $url, true);
                $updated[] = 'base_url';
            }
        }
        if (array_key_exists('api_key', $payload)) {
            $key = trim((string) $payload['api_key']);
            if ($key !== '') {
                Store::putSetting('steadfast_api_key', $key, true);
                $updated[] = 'api_key';
            }
        }
        if (array_key_exists('secret_key', $payload)) {
            $key = trim((string) $payload['secret_key']);
            if ($key !== '') {
                Store::putSetting('steadfast_secret_key', $key, true);
                $updated[] = 'secret_key';
            }
        }
        if (array_key_exists('webhook_token', $payload)) {
            $token = trim((string) $payload['webhook_token']);
            if ($token !== '') {
                Store::putSetting('steadfast_webhook_token', $token, true);
                $updated[] = 'webhook_token';
            }
        }

        if ($updated === []) {
            Response::error('No settings were supplied', 422, 'validation_error');
        }

        Store::audit('courier_settings_updated', 'settings', null, implode(',', $updated));
        Response::ok(['message' => 'SteadFast settings saved', 'configured' => SteadFast::configured()]);
    }

    public static function ship(array $params): void
    {
        Auth::requireAdmin();
        $orderId = (int) $params['id'];
        $order = Store::order($orderId);
        if ($order === null) {
            Response::error('Order not found', 404, 'not_found');
        }

        if (!SteadFast::configured()) {
            Response::error('SteadFast is not configured. Add API credentials in Settings.', 422, 'not_configured');
        }

        if (!empty($order['courier_consignment_id'])) {
            Response::error('This order already has a consignment (' . $order['courier_tracking_code'] . ')', 409, 'already_shipped');
        }

        $payload = Request::json();
        $customerName = Util::clean($order['customer_name'] ?? '', 100);
        $phone = Util::clean($order['customer_phone'] ?? '', 40);
        $address = Util::clean($payload['recipient_address'] ?? '', 250);
        $note = Util::clean($payload['note'] ?? ($order['note'] ?? ''), 500);
        $codAmount = isset($payload['cod_amount']) && is_numeric($payload['cod_amount'])
            ? (float) $payload['cod_amount']
            : (float) $order['total_amount'];
        $itemDescription = Util::clean($payload['item_description'] ?? '', 250);

        if ($phone === '') {
            Response::error('Customer phone is required to ship', 422, 'validation_error');
        }
        if ($address === '') {
            Response::error('Recipient address is required', 422, 'validation_error');
        }

        $invoice = 'DXN-' . $order['order_number'];

        $sfPayload = [
            'invoice'          => $invoice,
            'recipient_name'   => $customerName !== '' ? $customerName : 'Customer',
            'recipient_phone'  => $phone,
            'recipient_address' => $address,
            'cod_amount'       => $codAmount,
        ];
        if ($note !== '') {
            $sfPayload['note'] = $note;
        }
        if ($itemDescription !== '') {
            $sfPayload['item_description'] = $itemDescription;
        }
        if (isset($payload['delivery_type'])) {
            $sfPayload['delivery_type'] = (int) $payload['delivery_type'];
        }

        $result = SteadFast::createOrder($sfPayload);
        if (!$result['ok']) {
            Response::error('SteadFast: ' . ($result['error'] ?? 'unknown error'), 502, 'courier_error');
        }

        $consignment = $result['body']['consignment'] ?? null;
        if (!is_array($consignment) || empty($consignment['consignment_id'])) {
            Response::error('SteadFast did not return a consignment', 502, 'courier_error');
        }

        $consignmentId = (int) $consignment['consignment_id'];
        $trackingCode = (string) ($consignment['tracking_code'] ?? '');
        $sfStatus = (string) ($consignment['status'] ?? 'in_review');

        $rev = Store::nextRev();
        Database::run(
            'UPDATE orders SET courier_provider = ?, courier_consignment_id = ?, courier_tracking_code = ?,
                courier_status = ?, courier_cod_amount = ?, courier_created_at = ?, updated_at = ?, rev = ? WHERE id = ?',
            [
                'steadfast',
                $consignmentId,
                $trackingCode !== '' ? $trackingCode : null,
                $sfStatus,
                $codAmount,
                Util::now(),
                Util::now(),
                $rev,
                $orderId,
            ]
        );

        Database::run(
            'INSERT INTO courier_events (order_id, consignment_id, invoice, event_type, payload, created_at)
             VALUES (?, ?, ?, ?, ?, ?)',
            [$orderId, $consignmentId, $invoice, 'created', json_encode($consignment), Util::now()]
        );

        Store::audit('courier_shipment_created', 'order', (string) $orderId, 'consignment ' . $consignmentId);

        Response::ok([
            'message'      => 'Shipment created with SteadFast',
            'order'        => Store::order($orderId),
            'consignment'  => $consignment,
        ]);
    }

    public static function status(array $params): void
    {
        Auth::requireAdmin();
        $orderId = (int) $params['id'];
        $order = Store::order($orderId);
        if ($order === null) {
            Response::error('Order not found', 404, 'not_found');
        }
        if (empty($order['courier_consignment_id'])) {
            Response::error('No consignment for this order', 404, 'no_consignment');
        }

        $result = SteadFast::statusByCid((int) $order['courier_consignment_id']);
        if (!$result['ok']) {
            Response::error('SteadFast: ' . ($result['error'] ?? 'unknown error'), 502, 'courier_error');
        }

        $sfStatus = (string) ($result['body']['delivery_status'] ?? $result['body']['status'] ?? '');
        if ($sfStatus === '') {
            $sfStatus = (string) ($order['courier_status'] ?? '');
        }

        $rev = Store::nextRev();
        Database::run(
            'UPDATE orders SET courier_status = ?, updated_at = ?, rev = ? WHERE id = ?',
            [$sfStatus, Util::now(), $rev, $orderId]
        );

        // Auto-advance our order status when delivered/cancelled.
        $mapped = SteadFast::mapOrderStatus($sfStatus);
        if ($mapped !== null && $mapped !== $order['status']) {
            Database::run(
                'UPDATE orders SET status = ?, updated_at = ?, rev = ? WHERE id = ?',
                [$mapped, Util::now(), Store::nextRev(), $orderId]
            );
            Store::audit('courier_status_synced', 'order', (string) $orderId, $order['status'] . ' -> ' . $mapped);
        }

        Response::ok([
            'order'          => Store::order($orderId),
            'courier_status' => $sfStatus,
            'mapped_status'  => $mapped,
        ]);
    }

    public static function balance(): void
    {
        Auth::requireAdmin();
        if (!SteadFast::configured()) {
            Response::error('SteadFast is not configured', 422, 'not_configured');
        }
        $result = SteadFast::balance();
        if (!$result['ok']) {
            Response::error('SteadFast: ' . ($result['error'] ?? 'unknown error'), 502, 'courier_error');
        }
        Response::ok(['balance' => $result['body']]);
    }

    public static function webhook(): void
    {
        $raw = file_get_contents('php://input') ?: '';
        $payload = json_decode($raw, true);
        if (!is_array($payload)) {
            Response::error('Invalid payload', 400, 'bad_request');
        }

        // Verify bearer token (SteadFast sends the API key as bearer).
        $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? '';
        $token = '';
        if (preg_match('/^Bearer\s+(.+)$/i', $auth, $m)) {
            $token = trim($m[1]);
        }
        $expected = SteadFast::webhookToken();
        if ($expected !== '' && !hash_equals($expected, $token)) {
            Response::error('Unauthorized', 401, 'unauthorized');
        }

        $notificationType = (string) ($payload['notification_type'] ?? '');
        $consignmentId = (int) ($payload['consignment_id'] ?? 0);
        $invoice = (string) ($payload['invoice'] ?? '');

        // Find the order.
        $order = null;
        if ($consignmentId > 0) {
            $order = Database::one('SELECT * FROM orders WHERE courier_consignment_id = ?', [$consignmentId]);
        }
        if ($order === null && $invoice !== '') {
            // invoice format: DXN-{order_number}
            $orderNumber = str_replace('DXN-', '', $invoice);
            $order = Database::one('SELECT * FROM orders WHERE order_number = ?', [$orderNumber]);
        }

        Database::run(
            'INSERT INTO courier_events (order_id, consignment_id, invoice, event_type, payload, created_at)
             VALUES (?, ?, ?, ?, ?, ?)',
            [
                $order !== null ? (int) $order['id'] : null,
                $consignmentId > 0 ? $consignmentId : null,
                $invoice !== '' ? $invoice : null,
                $notificationType !== '' ? $notificationType : 'unknown',
                $raw,
                Util::now(),
            ]
        );

        if ($order !== null) {
            $orderId = (int) $order['id'];
            if ($notificationType === 'delivery_status') {
                $sfStatus = strtolower((string) ($payload['status'] ?? ''));
                $trackingMessage = (string) ($payload['tracking_message'] ?? '');
                $deliveryCharge = isset($payload['delivery_charge']) ? (float) $payload['delivery_charge'] : null;

                $rev = Store::nextRev();
                Database::run(
                    'UPDATE orders SET courier_status = ?, updated_at = ?, rev = ? WHERE id = ?',
                    [$sfStatus !== '' ? $sfStatus : $order['courier_status'], Util::now(), $rev, $orderId]
                );

                $mapped = SteadFast::mapOrderStatus($sfStatus);
                if ($mapped !== null && $mapped !== $order['status']) {
                    Database::run(
                        'UPDATE orders SET status = ?, updated_at = ?, rev = ? WHERE id = ?',
                        [$mapped, Util::now(), Store::nextRev(), $orderId]
                    );
                    Store::audit('courier_webhook', 'order', (string) $orderId, $order['status'] . ' -> ' . $mapped);
                }
            }
        }

        Response::ok(['status' => 'success', 'message' => 'Webhook received successfully.']);
    }

    public static function createReturn(array $params): void
    {
        Auth::requireAdmin();
        $orderId = (int) $params['id'];
        $order = Store::order($orderId);
        if ($order === null) {
            Response::error('Order not found', 404, 'not_found');
        }
        if (empty($order['courier_consignment_id'])) {
            Response::error('No consignment for this order', 404, 'no_consignment');
        }

        $payload = Request::json();
        $reason = Util::clean($payload['reason'] ?? '', 250);

        $sfPayload = ['consignment_id' => (int) $order['courier_consignment_id']];
        if ($reason !== '') {
            $sfPayload['reason'] = $reason;
        }

        $result = SteadFast::createReturn($sfPayload);
        if (!$result['ok']) {
            Response::error('SteadFast: ' . ($result['error'] ?? 'unknown error'), 502, 'courier_error');
        }

        Database::run(
            'INSERT INTO courier_events (order_id, consignment_id, invoice, event_type, payload, created_at)
             VALUES (?, ?, ?, ?, ?, ?)',
            [$orderId, (int) $order['courier_consignment_id'], 'DXN-' . $order['order_number'], 'return_requested', json_encode($result['body']), Util::now()]
        );

        Response::ok(['message' => 'Return request created', 'result' => $result['body']]);
    }

    public static function returns(): void
    {
        Auth::requireAdmin();
        $result = SteadFast::returns();
        if (!$result['ok']) {
            Response::error('SteadFast: ' . ($result['error'] ?? 'unknown error'), 502, 'courier_error');
        }
        Response::ok(['returns' => $result['body']]);
    }
}
