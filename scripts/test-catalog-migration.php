<?php
declare(strict_types=1);

require dirname(__DIR__) . '/api/src/bootstrap.php';

use DXN\Database;
use DXN\Schema;
use DXN\Store;
use DXN\Util;

function catalogCheck(bool $condition, string $message): void
{
    if (!$condition) {
        fwrite(STDERR, "FAIL: {$message}\n");
        exit(1);
    }
    echo "ok: {$message}\n";
}

Schema::install(true);

$catalogSku = (string) Schema::products()[0]['sku'];
Database::run('UPDATE products SET stock_qty = 17 WHERE sku = ?', [$catalogSku]);

// This is the old demo quantity for this retired SKU. It must not be treated
// as proof that the shop has no real stock.
$legacyId = Store::createProduct([
    'sku' => 'DXN-LZC-2IN1-20',
    'name' => 'Legacy sample coffee',
    'category' => 'Coffee',
    'retail_price' => 45,
    'member_price' => 40,
    'pv_points' => 10,
    'stock_qty' => 80,
]);

$now = Util::now();
Database::run(
    'INSERT INTO orders (client_uuid, order_number, customer_name, is_member, subtotal, discount,
        total_amount, total_pv, status, payment_method, source, created_at, updated_at, rev)
     VALUES (?, ?, ?, 0, 45, 0, 45, 10, ?, ?, ?, ?, ?, 0)',
    ['catalog-migration-history-test', 'DXN-TEST-LEGACY-01', 'Migration Regression', 'CONFIRMED', 'CASH', 'ci', $now, $now]
);
$orderId = Database::lastId();
Database::run(
    'INSERT INTO order_items (order_id, product_id, sku, name, quantity, unit_price, unit_pv)
     VALUES (?, ?, ?, ?, 1, 45, 10)',
    [$orderId, $legacyId, 'DXN-LZC-2IN1-20', 'Legacy sample coffee']
);

Schema::install(true);

$catalog = Database::one('SELECT stock_qty FROM products WHERE sku = ?', [$catalogSku]);
$legacy = Database::one('SELECT stock_qty, is_active FROM products WHERE sku = ?', ['DXN-LZC-2IN1-20']);
catalogCheck((int) $catalog['stock_qty'] === 17, 'rerunning the catalog preserves counted stock');
catalogCheck((int) $legacy['stock_qty'] === 80, 'retired legacy SKU stock is never reset, even at the former demo quantity');
catalogCheck((int) $legacy['is_active'] === 0, 'retired legacy SKU is soft-archived');
catalogCheck((int) Database::scalar('SELECT COUNT(*) FROM order_items WHERE order_id = ?', [$orderId]) === 1, 'order-item history remains intact');

// Give the API HTTP smoke test a known-stock item to exercise SKU replay.
Database::run('UPDATE products SET stock_qty = 5 WHERE sku = ?', [$catalogSku]);
echo "Catalog migration regression test passed.\n";
