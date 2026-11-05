<?php
declare(strict_types=1);

namespace DXN\Controllers;

use DXN\Auth;
use DXN\Database;
use DXN\Request;
use DXN\Response;
use DXN\Store;
use DXN\Util;

final class CatalogController
{
    public static function index(): void
    {
        $includeInactive = (string) Request::query('include_inactive', '0') === '1' && Auth::isAdmin();
        $page   = max(1, Util::int(Request::query('page', 1), 1));
        $perPage = max(1, min(Util::int(Request::query('per_page', 50), 1), 200));
        $offset = ($page - 1) * $perPage;

        $products = Store::productsPaginated($perPage, $offset, $includeInactive);
        $total    = Store::productsCount($includeInactive);

        $categories = [];
        foreach ($products as $product) {
            $categories[$product['category']] = true;
        }

        Response::ok([
            'products'   => $products,
            'categories' => array_keys($categories),
            'count'      => count($products),
            'total'      => $total,
            'page'       => $page,
            'per_page'   => $perPage,
            'pages'      => (int) ceil($total / $perPage),
        ]);
    }

    public static function show(array $params): void
    {
        $product = Store::product((int) $params['id']);
        if ($product === null) {
            Response::error('Product not found', 404, 'not_found');
        }
        Response::ok(['product' => $product]);
    }

    public static function store(): void
    {
        Auth::requireAdmin();
        Util::requireFields(['sku', 'name']);

        $sku = Util::clean(Request::input('sku'), 64);
        $existing = Database::one('SELECT id FROM products WHERE sku = ?', [$sku]);
        if ($existing !== null) {
            Response::error("SKU {$sku} already exists", 409, 'duplicate_sku');
        }

        $id = Store::createProduct([
            'sku'          => $sku,
            'name'         => Request::input('name'),
            'category'     => Request::input('category', 'General'),
            'description'  => Request::input('description'),
            'retail_price' => Request::input('retail_price', 0),
            'member_price' => Request::input('member_price', 0),
            'pv_points'    => Request::input('pv_points', 0),
            'stock_qty'    => Request::input('stock_qty', 0),
            'low_stock_at' => Request::input('low_stock_at', 5),
            'image_url'    => Request::input('image_url'),
        ]);

        Store::audit('created', 'product', (string) $id, $sku);

        Response::ok(['message' => 'Product created', 'product' => Store::product($id)], 201);
    }

    public static function update(array $params): void
    {
        Auth::requireAdmin();
        $id = (int) $params['id'];

        Store::updateProduct($id, Request::json());
        Store::audit('updated', 'product', (string) $id);

        Response::ok(['message' => 'Product updated', 'product' => Store::product($id)]);
    }

    /** Soft delete: keeps order history intact and propagates through sync. */
    public static function destroy(array $params): void
    {
        Auth::requireAdmin();
        $id = (int) $params['id'];

        Store::updateProduct($id, ['is_active' => 0]);
        Store::audit('archived', 'product', (string) $id);

        Response::ok(['message' => 'Product archived']);
    }

    public static function restore(array $params): void
    {
        Auth::requireAdmin();
        $id = (int) $params['id'];

        Store::updateProduct($id, ['is_active' => 1]);
        Store::audit('restored', 'product', (string) $id);

        Response::ok(['message' => 'Product restored', 'product' => Store::product($id)]);
    }

    /** Absolute stock set (the "stock take" action in the admin panel). */
    public static function updateStock(): void
    {
        Auth::requireAdmin();
        $productId = Util::int(Request::input('productId', Request::input('product_id')));
        $newQuantity = Util::int(Request::input('newQuantity', Request::input('new_quantity', -1)));

        if ($productId <= 0 || $newQuantity < 0) {
            Response::error('productId and a non-negative newQuantity are required', 422, 'validation_error');
        }

        $product = Store::product($productId);
        if ($product === null) {
            Response::error('Product not found', 404, 'not_found');
        }

        $delta = $newQuantity - (int) $product['stock_qty'];
        $after = Store::applyStockDelta($productId, $delta, Util::clean(Request::input('reason', 'stock_take'), 64));
        Store::audit('stock_set', 'product', (string) $productId, "{$product['stock_qty']} -> {$newQuantity}");

        Response::ok([
            'message'  => 'Stock updated',
            'product'  => Store::product($productId),
            'stock_qty' => $after,
        ]);
    }

    /** Relative stock change, e.g. receiving a delivery (+24) or shrinkage (-2). */
    public static function adjustStock(): void
    {
        Auth::requireAdmin();
        $productId = Util::int(Request::input('productId', Request::input('product_id')));
        $delta = Util::int(Request::input('delta', Request::input('change', 0)));

        if ($productId <= 0 || $delta === 0) {
            Response::error('productId and a non-zero delta are required', 422, 'validation_error');
        }

        $after = Store::applyStockDelta($productId, $delta, Util::clean(Request::input('reason', 'adjustment'), 64));
        Store::audit('stock_adjust', 'product', (string) $productId, (string) $delta);

        Response::ok([
            'message'   => 'Stock adjusted',
            'product'   => Store::product($productId),
            'stock_qty' => $after,
        ]);
    }

    public static function movements(): void
    {
        Auth::requireAdmin();
        $limit = max(1, min(Util::int(Request::query('limit', 100), 100), 500));

        $rows = Database::all(
            'SELECT m.*, p.name AS product_name, p.sku AS product_sku
             FROM stock_movements m
             LEFT JOIN products p ON p.id = m.product_id
             ORDER BY m.id DESC LIMIT ' . $limit
        );

        Response::ok([
            'movements' => array_map(static fn (array $row): array => [
                'id'             => (int) $row['id'],
                'product_id'     => (int) $row['product_id'],
                'product_name'   => $row['product_name'] ?? 'Deleted product',
                'product_sku'    => $row['product_sku'] ?? '',
                'delta'          => (int) $row['delta'],
                'quantity_after' => (int) $row['quantity_after'],
                'reason'         => (string) $row['reason'],
                'order_id'       => $row['order_id'] === null ? null : (int) $row['order_id'],
                'created_at'     => Util::iso($row['created_at']),
            ], $rows),
        ]);
    }
}
