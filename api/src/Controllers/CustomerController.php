<?php
declare(strict_types=1);

namespace DXN\Controllers;

use DXN\Auth;
use DXN\Database;
use DXN\Request;
use DXN\Response;
use DXN\Store;
use DXN\Util;

final class CustomerController
{
    public static function index(): void
    {
        Auth::requireAdmin();

        $customers = Store::customers([
            'q'     => Request::query('q'),
            'limit' => Util::int(Request::query('limit', 200), 200),
        ]);

        Response::ok(['customers' => $customers, 'count' => count($customers)]);
    }

    public static function show(array $params): void
    {
        Auth::requireAdmin();
        $row = Database::one('SELECT * FROM customers WHERE id = ?', [(int) $params['id']]);
        if ($row === null) {
            Response::error('Customer not found', 404, 'not_found');
        }

        $orders = Database::all(
            'SELECT * FROM orders WHERE customer_id = ? ORDER BY created_at DESC LIMIT 50',
            [(int) $params['id']]
        );

        Response::ok([
            'customer' => Store::mapCustomer($row),
            'orders'   => array_map(static fn (array $o): array => Store::mapOrder($o), $orders),
        ]);
    }
}
