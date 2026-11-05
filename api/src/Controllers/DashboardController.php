<?php
declare(strict_types=1);

namespace DXN\Controllers;

use DXN\Auth;
use DXN\Database;
use DXN\Request;
use DXN\Response;
use DXN\Store;
use DXN\Util;

final class DashboardController
{
    public static function index(): void
    {
        Auth::requireAdmin();

        $totals = Database::one(
            "SELECT COUNT(*) AS orders,
                    COALESCE(SUM(total_amount), 0) AS revenue,
                    COALESCE(SUM(total_pv), 0) AS pv
             FROM orders WHERE status <> 'CANCELLED'"
        ) ?? ['orders' => 0, 'revenue' => 0, 'pv' => 0];

        $today = gmdate('Y-m-d') . ' 00:00:00';
        $todayTotals = Database::one(
            "SELECT COUNT(*) AS orders,
                    COALESCE(SUM(total_amount), 0) AS revenue,
                    COALESCE(SUM(total_pv), 0) AS pv
             FROM orders WHERE status <> 'CANCELLED' AND created_at >= ?",
            [$today]
        ) ?? ['orders' => 0, 'revenue' => 0, 'pv' => 0];

        $stock = Database::one(
            'SELECT COUNT(*) AS products,
                    COALESCE(SUM(stock_qty), 0) AS units,
                    COALESCE(SUM(stock_qty * member_price), 0) AS value
             FROM products WHERE is_active = 1'
        ) ?? ['products' => 0, 'units' => 0, 'value' => 0];

        $threshold = (int) Store::setting('low_stock_threshold', '5');
        $lowStock = array_values(array_filter(
            Store::products(),
            static fn (array $p): bool => (int) $p['stock_qty'] <= max((int) $p['low_stock_at'], $threshold)
        ));
        usort($lowStock, static fn (array $a, array $b): int => $a['stock_qty'] <=> $b['stock_qty']);

        $topProducts = Database::all(
            "SELECT oi.product_id, oi.name, SUM(oi.quantity) AS qty, SUM(oi.quantity * oi.unit_price) AS revenue
             FROM order_items oi
             JOIN orders o ON o.id = oi.order_id AND o.status <> 'CANCELLED'
             GROUP BY oi.product_id, oi.name
             ORDER BY qty DESC
             LIMIT 5"
        );

        $recentOrders = Store::orders(['limit' => 5]);
        $series = self::dailySeries(6);

        Response::ok([
            'data' => [
                'total_orders'   => (int) $totals['orders'],
                'total_revenue'  => Util::money($totals['revenue']),
                'total_pv'       => Util::money($totals['pv']),
                'today_orders'   => (int) $todayTotals['orders'],
                'today_revenue'  => Util::money($todayTotals['revenue']),
                'today_pv'       => Util::money($todayTotals['pv']),
                'total_products' => (int) $stock['products'],
                'stock_units'    => (int) $stock['units'],
                'stock_value'    => Util::money($stock['value']),
                'low_stock_count' => count($lowStock),
                'low_stock_products' => $lowStock,
                'top_products'   => array_map(static fn (array $r): array => [
                    'product_id' => (int) $r['product_id'],
                    'name'       => (string) $r['name'],
                    'quantity'   => (int) $r['qty'],
                    'revenue'    => Util::money($r['revenue']),
                ], $topProducts),
                'recent_orders'  => $recentOrders,
                'sales_by_day'   => $series,
            ],
        ]);
    }

    public static function salesReport(): void
    {
        Auth::requireAdmin();

        $from = (string) Request::query('from', gmdate('Y-m-d', time() - 86400 * 29));
        $to = (string) Request::query('to', gmdate('Y-m-d'));

        $rows = Database::all(
            "SELECT SUBSTR(created_at, 1, 10) AS day,
                    COUNT(*) AS orders,
                    COALESCE(SUM(total_amount), 0) AS revenue,
                    COALESCE(SUM(total_pv), 0) AS pv
             FROM orders
             WHERE status <> 'CANCELLED' AND SUBSTR(created_at, 1, 10) BETWEEN ? AND ?
             GROUP BY SUBSTR(created_at, 1, 10)
             ORDER BY day ASC",
            [$from, $to]
        );

        $byPayment = Database::all(
            "SELECT payment_method, COUNT(*) AS orders, COALESCE(SUM(total_amount), 0) AS revenue
             FROM orders
             WHERE status <> 'CANCELLED' AND SUBSTR(created_at, 1, 10) BETWEEN ? AND ?
             GROUP BY payment_method ORDER BY revenue DESC",
            [$from, $to]
        );

        $totals = Database::one(
            "SELECT COUNT(*) AS orders, COALESCE(SUM(total_amount), 0) AS revenue, COALESCE(SUM(total_pv), 0) AS pv
             FROM orders WHERE status <> 'CANCELLED' AND SUBSTR(created_at, 1, 10) BETWEEN ? AND ?",
            [$from, $to]
        ) ?? ['orders' => 0, 'revenue' => 0, 'pv' => 0];

        Response::ok([
            'from'  => $from,
            'to'    => $to,
            'totals' => [
                'orders'  => (int) $totals['orders'],
                'revenue' => Util::money($totals['revenue']),
                'pv'      => Util::money($totals['pv']),
            ],
            'days' => array_map(static fn (array $r): array => [
                'day'     => (string) $r['day'],
                'orders'  => (int) $r['orders'],
                'revenue' => Util::money($r['revenue']),
                'pv'      => Util::money($r['pv']),
            ], $rows),
            'by_payment' => array_map(static fn (array $r): array => [
                'payment_method' => (string) $r['payment_method'],
                'orders'         => (int) $r['orders'],
                'revenue'        => Util::money($r['revenue']),
            ], $byPayment),
        ]);
    }

    /** @return array<int,array<string,mixed>> */
    private static function dailySeries(int $daysBack): array
    {
        $start = gmdate('Y-m-d', time() - 86400 * $daysBack) . ' 00:00:00';
        $rows = Database::all(
            "SELECT SUBSTR(created_at, 1, 10) AS day,
                    COUNT(*) AS orders,
                    COALESCE(SUM(total_amount), 0) AS revenue
             FROM orders
             WHERE status <> 'CANCELLED' AND created_at >= ?
             GROUP BY SUBSTR(created_at, 1, 10)",
            [$start]
        );

        $map = [];
        foreach ($rows as $row) {
            $map[(string) $row['day']] = $row;
        }

        $series = [];
        for ($i = $daysBack; $i >= 0; $i--) {
            $day = gmdate('Y-m-d', time() - 86400 * $i);
            $series[] = [
                'day'     => $day,
                'orders'  => isset($map[$day]) ? (int) $map[$day]['orders'] : 0,
                'revenue' => isset($map[$day]) ? Util::money($map[$day]['revenue']) : 0.0,
            ];
        }
        return $series;
    }
}
