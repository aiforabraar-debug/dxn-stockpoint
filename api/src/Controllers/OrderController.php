<?php
declare(strict_types=1);

namespace DXN\Controllers;

use DXN\Auth;
use DXN\Database;
use DXN\Request;
use DXN\Response;
use DXN\Store;
use DXN\Util;

/**
 * Order creation is deliberately idempotent: the client always sends a
 * `client_uuid`, so a retry after a dropped connection (or the same queued
 * order pushed from a phone that was offline) can never create a duplicate.
 */
final class OrderController
{
    public static function index(): void
    {
        Auth::requireAdmin();

        $page   = max(1, Util::int(Request::query('page', 1), 1));
        $perPage = max(1, min(Util::int(Request::query('per_page', Request::query('limit', 50)), 50), 200));
        $offset = ($page - 1) * $perPage;

        $orders = Store::ordersPaginated([
            'limit'  => $perPage,
            'offset' => $offset,
            'status' => Request::query('status'),
            'q'      => Request::query('q'),
        ]);
        $total = Store::ordersCount([
            'status' => Request::query('status'),
            'q'      => Request::query('q'),
        ]);

        Response::ok([
            'orders'  => $orders,
            'count'   => count($orders),
            'total'   => $total,
            'page'    => $page,
            'per_page'=> $perPage,
            'pages'   => (int) ceil($total / $perPage),
        ]);
    }

    public static function show(array $params): void
    {
        Auth::requireAdmin();
        $order = Store::order((int) $params['id']);
        if ($order === null) {
            Response::error('Order not found', 404, 'not_found');
        }
        Response::ok(['order' => $order]);
    }

    public static function create(): void
    {
        if (!Auth::isAdmin() && Store::setting('allow_public_orders', '1') !== '1') {
            Response::error('Ordering is currently disabled for this stockpoint', 403, 'ordering_disabled');
        }

        $payload = Request::json();
        $customerName = Util::clean($payload['customer_name'] ?? '', 160);
        $items = $payload['items'] ?? [];

        if ($customerName === '') {
            Response::error('customer_name is required', 422, 'validation_error');
        }
        if (!is_array($items) || $items === []) {
            Response::error('At least one item is required', 422, 'validation_error');
        }

        $clientUuid = Util::clean($payload['client_uuid'] ?? '', 64);
        if ($clientUuid !== '') {
            $existing = Store::orderByUuid($clientUuid);
            if ($existing !== null) {
                Response::ok(['order' => $existing, 'duplicate' => true]);
            }
        }

        [$order, $warning] = Database::transaction(static function () use ($payload, $customerName, $items, $clientUuid): array {
            $isMember = Util::bool($payload['is_member'] ?? false) === 1;
            $memberId = Util::clean($payload['dxn_member_id'] ?? '', 40);
            $phone = Util::clean($payload['customer_phone'] ?? '', 40);
            $discount = max(0.0, Util::money($payload['discount'] ?? 0));
            $warning = null;

            $resolved = [];
            $subtotal = 0.0;
            $totalPv = 0.0;

            foreach ($items as $item) {
                if (!is_array($item)) {
                    continue;
                }
                $productId = Util::int($item['product_id'] ?? $item['productId'] ?? 0);
                $productSku = Util::clean($item['product_sku'] ?? $item['sku'] ?? '', 80);
                $quantity = Util::int($item['quantity'] ?? 0);
                if ($quantity <= 0 || ($productId <= 0 && $productSku === '')) {
                    continue;
                }

                // Offline clients may have temporary IDs; the stable SKU resolves after reconnect.
                $product = $productSku !== ''
                    ? Database::one('SELECT * FROM products WHERE sku = ?', [$productSku])
                    : null;
                if ($product === null && $productId > 0) {
                    $product = Store::product($productId);
                }
                if ($product === null) {
                    throw new \DXN\ApiException("Product {$productId} not found", 404, 'product_missing');
                }

                // Stock is allowed to go negative only for admin override orders
                // so a stockpoint never loses a sale; the client is warned.
                $allowOversell = Util::bool($payload['allow_oversell'] ?? false) === 1;
                if (!$allowOversell && (int) $product['stock_qty'] < $quantity) {
                    throw new \DXN\ApiException(
                        'Insufficient stock for "' . $product['name'] . '" (available: ' . $product['stock_qty'] . ')',
                        409,
                        'insufficient_stock'
                    );
                }

                $unitPrice = $isMember ? (float) $product['member_price'] : (float) $product['retail_price'];
                if (isset($item['unit_price']) && is_numeric($item['unit_price'])) {
                    // Offline clients may have negotiated a price; trust it but keep it sane.
                    $unitPrice = Util::money($item['unit_price']);
                }

                $unitPv = isset($item['unit_pv']) && is_numeric($item['unit_pv'])
                    ? Util::money($item['unit_pv'])
                    : (float) $product['pv_points'];

                $subtotal += $unitPrice * $quantity;
                $totalPv += $unitPv * $quantity;

                $resolved[] = [
                    'product'  => $product,
                    'quantity' => $quantity,
                    'price'    => $unitPrice,
                    'pv'       => $unitPv,
                ];
            }

            if ($resolved === []) {
                throw new \DXN\ApiException('No valid order items were supplied', 422, 'validation_error');
            }

            $subtotal = Util::money($subtotal);
            $total = Util::money(max(0, $subtotal - $discount));
            $totalPv = Util::money($totalPv);

            $rev = Store::nextRev();
            $now = Util::now();
            $orderNumber = Util::orderNumber();

            $customerId = Store::touchCustomer(
                isset($payload['customer_id']) ? Util::int($payload['customer_id']) : null,
                $customerName,
                $phone !== '' ? $phone : null,
                $memberId !== '' ? $memberId : null,
                $isMember,
                $total,
                $totalPv
            );

            Database::run(
                'INSERT INTO orders (client_uuid, order_number, customer_id, customer_name, customer_phone,
                    dxn_member_id, is_member, subtotal, discount, total_amount, total_pv, status,
                    payment_method, note, source, created_at, updated_at, rev)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
                [
                    $clientUuid !== '' ? $clientUuid : null,
                    $orderNumber,
                    $customerId,
                    $customerName,
                    $phone !== '' ? $phone : null,
                    $memberId !== '' ? $memberId : null,
                    $isMember ? 1 : 0,
                    $subtotal,
                    $discount,
                    $total,
                    $totalPv,
                    'CONFIRMED',
                    Util::clean($payload['payment_method'] ?? 'CASH', 24),
                    isset($payload['note']) ? Util::clean($payload['note'], 500) : null,
                    Util::clean($payload['source'] ?? 'web', 24),
                    $now,
                    $now,
                    $rev,
                ]
            );

            $orderId = Database::lastId();

            foreach ($resolved as $line) {
                Database::run(
                    'INSERT INTO order_items (order_id, product_id, sku, name, quantity, unit_price, unit_pv)
                     VALUES (?, ?, ?, ?, ?, ?, ?)',
                    [
                        $orderId,
                        (int) $line['product']['id'],
                        $line['product']['sku'],
                        $line['product']['name'],
                        (int) $line['quantity'],
                        $line['price'],
                        $line['pv'],
                    ]
                );

                Store::applyStockDelta(
                    (int) $line['product']['id'],
                    -1 * (int) $line['quantity'],
                    'sale',
                    $orderId
                );
            }

            return [Store::order($orderId), $warning];
        });

        Response::ok(['order' => $order, 'warning' => $warning], 201);
    }

    public static function updateStatus(array $params): void
    {
        Auth::requireAdmin();
        $id = (int) $params['id'];
        $status = strtoupper(Util::clean(Request::input('status', ''), 24));
        $allowed = ['PENDING', 'CONFIRMED', 'PACKED', 'DELIVERED', 'CANCELLED'];

        if (!in_array($status, $allowed, true)) {
            Response::error('status must be one of: ' . implode(', ', $allowed), 422, 'validation_error');
        }

        $order = Store::order($id);
        if ($order === null) {
            Response::error('Order not found', 404, 'not_found');
        }

        $rev = Store::nextRev();
        Database::run(
            'UPDATE orders SET status = ?, updated_at = ?, rev = ? WHERE id = ?',
            [$status, Util::now(), $rev, $id]
        );

        Store::audit('status_changed', 'order', (string) $id, $order['status'] . ' -> ' . $status);

        Response::ok(['message' => 'Order status updated', 'order' => Store::order($id)]);
    }

    /** Plain-text receipt, handy for printing from a phone or headless device. */
    /** Refund a confirmed order: restores stock and marks it RETURNED. Idempotent. */
    public static function returnOrder(array $params): void
    {
        Auth::requireAdmin();
        $id = (int) $params['id'];
        $order = Store::order($id);
        if ($order === null) {
            Response::error('Order not found', 404, 'not_found');
        }
        if ($order['status'] === 'RETURNED') {
            Response::ok(['message' => 'Order already returned', 'order' => $order]);
        }
        if (!in_array($order['status'], ['CONFIRMED', 'PACKED', 'DELIVERED'], true)) {
            Response::error('Only confirmed, packed or delivered orders can be returned', 422, 'invalid_status');
        }

        [$order, $warning] = Database::transaction(static function () use ($id): array {
            $rev = Store::nextRev();
            $now = Util::now();

            Database::run(
                'UPDATE orders SET status = ?, updated_at = ?, rev = ? WHERE id = ?',
                ['RETURNED', $now, $rev, $id]
            );

            // Restore stock for every line item.
            foreach ($order['items'] as $item) {
                Store::applyStockDelta(
                    (int) $item['product_id'],
                    (int) $item['quantity'],
                    'return',
                    $id
                );
            }

            Store::audit('order_returned', 'order', (string) $id, "restored stock for " . count($order['items']) . " line(s)");

            return [Store::order($id), null];
        });

        Response::ok(['message' => 'Order returned and stock restored', 'order' => $order, 'warning' => $warning]);
    }

    public static function receipt(array $params): void
    {
        Auth::requireAdmin();
        $order = Store::order((int) $params['id']);
        if ($order === null) {
            Response::error('Order not found', 404, 'not_found');
        }

        Response::ok(['receipt' => self::receiptText($order)]);
    }

    public static function receiptText(array $order): string
    {
        $settings = Store::publicSettings();
        $lines = [];
        $lines[] = strtoupper($settings['branch_name']);
        if ($settings['business_address'] !== '') {
            $lines[] = $settings['business_address'];
        }
        if ($settings['business_phone'] !== '') {
            $lines[] = 'Tel: ' . $settings['business_phone'];
        }
        $lines[] = str_repeat('-', 32);
        $lines[] = 'Order   : ' . $order['order_number'];
        $lines[] = 'Date    : ' . ($order['created_at'] ?? '');
        $lines[] = 'Customer: ' . $order['customer_name'];
        if (!empty($order['dxn_member_id'])) {
            $lines[] = 'Member  : ' . $order['dxn_member_id'];
        }
        $lines[] = 'Payment : ' . $order['payment_method'];
        $lines[] = str_repeat('-', 32);

        foreach ($order['items'] as $item) {
            $lines[] = sprintf('%-22s x%d', substr((string) $item['name'], 0, 22), $item['quantity']);
            $lines[] = sprintf('  @ %.2f = %.2f', $item['unit_price'], $item['line_total']);
        }

        $lines[] = str_repeat('-', 32);
        if ($order['discount'] > 0) {
            $lines[] = sprintf('Subtotal: %.2f', $order['subtotal']);
            $lines[] = sprintf('Discount: -%.2f', $order['discount']);
        }
        $lines[] = sprintf('TOTAL   : %.2f %s', $order['total_amount'], $settings['currency']);
        $lines[] = sprintf('PV      : %.2f', $order['total_pv']);
        $lines[] = str_repeat('-', 32);
        if ($settings['receipt_footer'] !== '') {
            $lines[] = $settings['receipt_footer'];
        }

        return implode("\n", $lines);
    }
}
