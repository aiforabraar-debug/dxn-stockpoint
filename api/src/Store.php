<?php
declare(strict_types=1);

namespace DXN;

/**
 * Data-access helpers shared by the controllers.
 *
 * The revision counter is what makes multi-device sync possible: every write
 * bumps `sync_counter.value` and stamps the new number onto the touched row.
 * Clients then ask "give me everything with rev > my last seen rev".
 */
final class Store
{
    public static function nextRev(): int
    {
        Database::run('UPDATE sync_counter SET value = value + 1 WHERE id = 1');
        $value = (int) Database::scalar('SELECT value FROM sync_counter WHERE id = 1');
        return $value > 0 ? $value : 1;
    }

    public static function currentRev(): int
    {
        $value = Database::scalar('SELECT value FROM sync_counter WHERE id = 1');
        return $value === null ? 0 : (int) $value;
    }

    // ── Settings ────────────────────────────────────────────────────────────

    public static function setting(string $key, ?string $default = null): ?string
    {
        $row = Database::one('SELECT setting_value FROM settings WHERE setting_key = ?', [$key]);
        if ($row === null) {
            return $default;
        }
        return $row['setting_value'] === null ? $default : (string) $row['setting_value'];
    }

    /** @return array<string,string> */
    public static function settings(): array
    {
        $rows = Database::all('SELECT setting_key, setting_value FROM settings');
        $out = [];
        foreach ($rows as $row) {
            $out[(string) $row['setting_key']] = (string) ($row['setting_value'] ?? '');
        }
        return $out;
    }

    public static function putSetting(string $key, mixed $value, bool $bump = true): void
    {
        $rev = $bump ? self::nextRev() : 0;
        $now = Util::now();
        $existing = Database::one('SELECT setting_key FROM settings WHERE setting_key = ?', [$key]);

        if ($existing === null) {
            Database::run(
                'INSERT INTO settings (setting_key, setting_value, updated_at, rev) VALUES (?, ?, ?, ?)',
                [$key, (string) $value, $now, $rev]
            );
            return;
        }

        Database::run(
            'UPDATE settings SET setting_value = ?, updated_at = ?, rev = ? WHERE setting_key = ?',
            [(string) $value, $now, $rev, $key]
        );
    }

    /** Settings that are safe to expose to an unauthenticated catalogue. */
    public static function publicSettings(): array
    {
        $all = self::settings();
        return [
            'branch_name'     => $all['branch_name'] ?? 'Mohammadpur Stock Point',
            'whatsapp_number' => $all['whatsapp_number'] ?? '',
            'currency'        => $all['currency'] ?? 'BDT',
            'low_stock_threshold' => (int) ($all['low_stock_threshold'] ?? 5),
            'receipt_footer'  => $all['receipt_footer'] ?? '',
            'business_address' => $all['business_address'] ?? '',
            'business_phone'  => $all['business_phone'] ?? '',
            'allow_public_orders' => (int) ($all['allow_public_orders'] ?? 1),
        ];
    }

    // ── Products ────────────────────────────────────────────────────────────

    /** @return array<string,mixed> */
    public static function mapProduct(array $row): array
    {
        return [
            'id'           => (int) $row['id'],
            'sku'          => (string) $row['sku'],
            'name'         => (string) $row['name'],
            'category'     => (string) $row['category'],
            'description'  => $row['description'] ?? null,
            'retail_price' => (float) $row['retail_price'],
            'member_price' => (float) $row['member_price'],
            'pv_points'    => (float) $row['pv_points'],
            'stock_qty'    => (int) $row['stock_qty'],
            'low_stock_at' => (int) ($row['low_stock_at'] ?? 5),
            'image_url'    => $row['image_url'] ?? null,
            'is_active'    => (int) ($row['is_active'] ?? 1),
            'created_at'   => Util::iso($row['created_at'] ?? null),
            'updated_at'   => Util::iso($row['updated_at'] ?? null),
            'rev'          => (int) ($row['rev'] ?? 0),
        ];
    }

    /** @return array<int,array<string,mixed>> */
    public static function products(bool $includeInactive = false): array
    {
        $sql = 'SELECT * FROM products';
        if (!$includeInactive) {
            $sql .= ' WHERE is_active = 1';
        }
        $sql .= ' ORDER BY category, name';
        return array_map([self::class, 'mapProduct'], Database::all($sql));
    }

    /** @return array<string,mixed>|null */
    public static function product(int $id): ?array
    {
        $row = Database::one('SELECT * FROM products WHERE id = ?', [$id]);
        return $row === null ? null : self::mapProduct($row);
    }

    public static function createProduct(array $data): int
    {
        $rev = self::nextRev();
        $now = Util::now();
        Database::run(
            'INSERT INTO products (sku, name, category, description, retail_price, member_price, pv_points,
                stock_qty, low_stock_at, image_url, is_active, created_at, updated_at, rev)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
            [
                Util::clean($data['sku'] ?? '', 64),
                Util::clean($data['name'] ?? '', 160),
                Util::clean($data['category'] ?? 'General', 64),
                $data['description'] ?? null,
                Util::money($data['retail_price'] ?? 0),
                Util::money($data['member_price'] ?? 0),
                Util::money($data['pv_points'] ?? 0),
                Util::int($data['stock_qty'] ?? 0),
                Util::int($data['low_stock_at'] ?? 5),
                $data['image_url'] ?? null,
                isset($data['is_active']) ? Util::int($data['is_active']) : 1,
                $now,
                $now,
                $rev,
            ]
        );
        $id = Database::lastId();

        if ((int) ($data['stock_qty'] ?? 0) !== 0) {
            self::recordMovement($id, (int) $data['stock_qty'], 'opening_stock', null);
        }

        return $id;
    }

    public static function recordMovement(int $productId, int $delta, string $reason, ?int $orderId): void
    {
        $after = (int) Database::scalar('SELECT stock_qty FROM products WHERE id = ?', [$productId]);
        Database::run(
            'INSERT INTO stock_movements (product_id, delta, quantity_after, reason, order_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?)',
            [$productId, $delta, $after, $reason, $orderId, Util::now()]
        );
    }

    // ── Orders ──────────────────────────────────────────────────────────────

    /** @return array<string,mixed> */
    public static function mapOrder(array $row, array $items = []): array
    {
        return [
            'id'             => (int) $row['id'],
            'client_uuid'    => $row['client_uuid'] ?? null,
            'order_number'   => (string) $row['order_number'],
            'customer_id'    => isset($row['customer_id']) ? (int) $row['customer_id'] : null,
            'customer_name'  => (string) $row['customer_name'],
            'customer_phone' => $row['customer_phone'] ?? null,
            'dxn_member_id'  => $row['dxn_member_id'] ?? null,
            'is_member'      => (int) ($row['is_member'] ?? 0),
            'subtotal'       => (float) ($row['subtotal'] ?? 0),
            'discount'       => (float) ($row['discount'] ?? 0),
            'total_amount'   => (float) $row['total_amount'],
            'total_pv'       => (float) $row['total_pv'],
            'status'         => (string) $row['status'],
            'payment_method' => (string) ($row['payment_method'] ?? 'CASH'),
            'note'           => $row['note'] ?? null,
            'source'                  => (string) ($row['source'] ?? 'web'),
            'courier_provider'        => $row['courier_provider'] ?? null,
            'courier_consignment_id'  => isset($row['courier_consignment_id']) ? (int) $row['courier_consignment_id'] : null,
            'courier_tracking_code'   => $row['courier_tracking_code'] ?? null,
            'courier_status'          => $row['courier_status'] ?? null,
            'courier_cod_amount'      => isset($row['courier_cod_amount']) ? (float) $row['courier_cod_amount'] : null,
            'courier_created_at'     => Util::iso($row['courier_created_at'] ?? null),
            'created_at'     => Util::iso($row['created_at'] ?? null),
            'updated_at'     => Util::iso($row['updated_at'] ?? null),
            'rev'            => (int) ($row['rev'] ?? 0),
            'items'          => array_map([self::class, 'mapItem'], $items),
        ];
    }

    /** @return array<string,mixed> */
    public static function mapItem(array $row): array
    {
        return [
            'product_id' => (int) $row['product_id'],
            'sku'        => (string) ($row['sku'] ?? ''),
            'name'       => (string) ($row['name'] ?? ''),
            'quantity'   => (int) $row['quantity'],
            'unit_price' => (float) $row['unit_price'],
            'unit_pv'    => (float) ($row['unit_pv'] ?? 0),
            'line_total' => round((float) $row['unit_price'] * (int) $row['quantity'], 2),
            'line_pv'    => round((float) ($row['unit_pv'] ?? 0) * (int) $row['quantity'], 2),
        ];
    }

    /** @param array<int,array<string,mixed>> $itemRows */
    public static function itemsForOrders(array $itemRows): array
    {
        $grouped = [];
        foreach ($itemRows as $row) {
            $grouped[(int) $row['order_id']][] = $row;
        }
        return $grouped;
    }

    /** @return array<int,array<string,mixed>> */
    public static function orders(array $filters = []): array
    {
        $where = [];
        $params = [];

        if (!empty($filters['status'])) {
            $where[] = 'status = ?';
            $params[] = $filters['status'];
        }
        if (isset($filters['since_rev'])) {
            $where[] = 'rev > ?';
            $params[] = (int) $filters['since_rev'];
        }
        if (!empty($filters['from'])) {
            $where[] = 'created_at >= ?';
            $params[] = $filters['from'];
        }
        if (!empty($filters['to'])) {
            $where[] = 'created_at <= ?';
            $params[] = $filters['to'];
        }
        if (!empty($filters['q'])) {
            $where[] = '(customer_name LIKE ? OR order_number LIKE ? OR dxn_member_id LIKE ?)';
            $like = '%' . $filters['q'] . '%';
            array_push($params, $like, $like, $like);
        }

        $sql = 'SELECT * FROM orders';
        if ($where !== []) {
            $sql .= ' WHERE ' . implode(' AND ', $where);
        }
        $sql .= ' ORDER BY created_at DESC, id DESC';

        $limit = (int) ($filters['limit'] ?? 50);
        $limit = max(1, min($limit, 500));
        $sql .= ' LIMIT ' . $limit;

        $rows = Database::all($sql, $params);
        if ($rows === []) {
            return [];
        }

        $ids = array_map(static fn (array $r): int => (int) $r['id'], $rows);
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $itemRows = Database::all(
            "SELECT * FROM order_items WHERE order_id IN ({$placeholders}) ORDER BY id",
            $ids
        );
        $grouped = self::itemsForOrders($itemRows);

        return array_map(
            static fn (array $row): array => self::mapOrder($row, $grouped[(int) $row['id']] ?? []),
            $rows
        );
    }

    /** @return array<string,mixed>|null */
    public static function order(int $id): ?array
    {
        $row = Database::one('SELECT * FROM orders WHERE id = ?', [$id]);
        if ($row === null) {
            return null;
        }
        $items = Database::all('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', [$id]);
        return self::mapOrder($row, $items);
    }

    /** @return array<string,mixed>|null */
    public static function orderByUuid(string $uuid): ?array
    {
        $row = Database::one('SELECT id FROM orders WHERE client_uuid = ?', [$uuid]);
        return $row === null ? null : self::order((int) $row['id']);
    }

    // ── Customers ───────────────────────────────────────────────────────────

    /** @return array<string,mixed> */
    public static function mapCustomer(array $row): array
    {
        return [
            'id'            => (int) $row['id'],
            'name'          => (string) $row['name'],
            'phone'         => $row['phone'] ?? null,
            'dxn_member_id' => $row['dxn_member_id'] ?? null,
            'is_member'     => (int) ($row['is_member'] ?? 0),
            'total_orders'  => (int) ($row['total_orders'] ?? 0),
            'total_spent'   => (float) ($row['total_spent'] ?? 0),
            'total_pv'      => (float) ($row['total_pv'] ?? 0),
            'last_order_at' => Util::iso($row['last_order_at'] ?? null),
            'created_at'    => Util::iso($row['created_at'] ?? null),
            'updated_at'    => Util::iso($row['updated_at'] ?? null),
            'rev'           => (int) ($row['rev'] ?? 0),
        ];
    }

    /** @return array<int,array<string,mixed>> */
    public static function customers(array $filters = []): array
    {
        $where = [];
        $params = [];
        if (!empty($filters['q'])) {
            $where[] = '(name LIKE ? OR phone LIKE ? OR dxn_member_id LIKE ?)';
            $like = '%' . $filters['q'] . '%';
            array_push($params, $like, $like, $like);
        }
        if (isset($filters['since_rev'])) {
            $where[] = 'rev > ?';
            $params[] = (int) $filters['since_rev'];
        }

        $sql = 'SELECT * FROM customers';
        if ($where !== []) {
            $sql .= ' WHERE ' . implode(' AND ', $where);
        }
        $sql .= ' ORDER BY last_order_at DESC, id DESC';
        $sql .= ' LIMIT ' . max(1, min((int) ($filters['limit'] ?? 200), 1000));

        return array_map([self::class, 'mapCustomer'], Database::all($sql, $params));
    }

    public static function touchCustomer(?int $customerId, string $name, ?string $phone, ?string $memberId, bool $isMember, float $amount, float $pv): ?int
    {
        if ($customerId === null && $memberId === null && $phone === null) {
            return null;
        }

        $row = null;
        if ($customerId !== null) {
            $row = Database::one('SELECT * FROM customers WHERE id = ?', [$customerId]);
        }
        if ($row === null && $memberId !== null && $memberId !== '') {
            $row = Database::one('SELECT * FROM customers WHERE dxn_member_id = ?', [$memberId]);
        }
        if ($row === null && $phone !== null && $phone !== '') {
            $row = Database::one('SELECT * FROM customers WHERE phone = ? AND name = ?', [$phone, $name]);
        }

        $rev = self::nextRev();
        $now = Util::now();

        if ($row === null) {
            Database::run(
                'INSERT INTO customers (name, phone, dxn_member_id, is_member, total_orders, total_spent, total_pv, last_order_at, created_at, updated_at, rev)
                 VALUES (?, ?, ?, ?, 1, ?, ?, ?, ?, ?, ?)',
                [
                    $name,
                    $phone,
                    $memberId !== '' ? $memberId : null,
                    $isMember ? 1 : 0,
                    $amount,
                    $pv,
                    $now,
                    $now,
                    $now,
                    $rev,
                ]
            );
            return Database::lastId();
        }

        Database::run(
            'UPDATE customers SET name = ?, phone = COALESCE(?, phone), is_member = ?,
                total_orders = total_orders + 1, total_spent = total_spent + ?, total_pv = total_pv + ?,
                last_order_at = ?, updated_at = ?, rev = ? WHERE id = ?',
            [
                $name,
                $phone,
                $isMember ? 1 : 0,
                $amount,
                $pv,
                $now,
                $now,
                $rev,
                (int) $row['id'],
            ]
        );

        return (int) $row['id'];
    }

    // ── Misc ────────────────────────────────────────────────────────────────

    public static function logAttempt(string $ip, bool $ok): void
    {
        Database::run(
            'INSERT INTO auth_attempts (ip, ok, attempted_at) VALUES (?, ?, ?)',
            [$ip, $ok ? 1 : 0, Util::now()]
        );

        // Keep the table small on shared hosting.
        if (random_int(1, 25) === 1) {
            Database::run('DELETE FROM auth_attempts WHERE attempted_at < ?', [gmdate('Y-m-d H:i:s', time() - 604800)]);
        }
    }

    public static function audit(string $action, string $entity, ?string $entityId = null, ?string $detail = null): void
    {
        Database::run(
            'INSERT INTO audit_log (action, entity, entity_id, detail, created_at) VALUES (?, ?, ?, ?, ?)',
            [$action, $entity, $entityId, $detail, Util::now()]
        );
    }

    // ── Product writes ──────────────────────────────────────────────────────

    public static function updateProduct(int $id, array $data): void
    {
        $existing = self::product($id);
        if ($existing === null) {
            throw new ApiException("Product {$id} not found", 404, 'not_found');
        }

        $name = array_key_exists('name', $data) ? Util::clean($data['name'], 160) : $existing['name'];
        if ($name === '') {
            throw new ApiException('Product name cannot be empty', 422, 'validation_error');
        }

        $sku = array_key_exists('sku', $data) ? Util::clean($data['sku'], 64) : $existing['sku'];
        $rev = self::nextRev();

        Database::run(
            'UPDATE products SET sku = ?, name = ?, category = ?, description = ?, retail_price = ?,
                member_price = ?, pv_points = ?, low_stock_at = ?, image_url = ?, is_active = ?,
                updated_at = ?, rev = ? WHERE id = ?',
            [
                $sku,
                $name,
                array_key_exists('category', $data) ? Util::clean($data['category'], 64) : $existing['category'],
                array_key_exists('description', $data) ? $data['description'] : $existing['description'],
                array_key_exists('retail_price', $data) ? Util::money($data['retail_price']) : $existing['retail_price'],
                array_key_exists('member_price', $data) ? Util::money($data['member_price']) : $existing['member_price'],
                array_key_exists('pv_points', $data) ? Util::money($data['pv_points']) : $existing['pv_points'],
                array_key_exists('low_stock_at', $data) ? Util::int($data['low_stock_at'], 5) : $existing['low_stock_at'],
                array_key_exists('image_url', $data) ? $data['image_url'] : $existing['image_url'],
                array_key_exists('is_active', $data) ? Util::int($data['is_active']) : $existing['is_active'],
                Util::now(),
                $rev,
                $id,
            ]
        );
    }

    /**
     * Applies a stock delta atomically. A negative delta fails when there is
     * not enough stock, which is what stops two devices from overselling the
     * same unit during an offline-then-sync race.
     */
    public static function applyStockDelta(int $productId, int $delta, string $reason, ?int $orderId = null): int
    {
        $product = self::product($productId);
        if ($product === null) {
            throw new ApiException("Product {$productId} not found", 404, 'not_found');
        }
        if ($delta === 0) {
            return (int) $product['stock_qty'];
        }

        $rev = self::nextRev();

        if ($delta < 0) {
            $stmt = Database::run(
                'UPDATE products SET stock_qty = stock_qty + ?, updated_at = ?, rev = ? WHERE id = ? AND stock_qty >= ?',
                [$delta, Util::now(), $rev, $productId, abs($delta)]
            );
            if ($stmt->rowCount() === 0) {
                throw new ApiException(
                    'Insufficient stock for "' . $product['name'] . '" (available: ' . $product['stock_qty'] . ')',
                    409,
                    'insufficient_stock'
                );
            }
        } else {
            Database::run(
                'UPDATE products SET stock_qty = stock_qty + ?, updated_at = ?, rev = ? WHERE id = ?',
                [$delta, Util::now(), $rev, $productId]
            );
        }

        self::recordMovement($productId, $delta, $reason, $orderId);

        return (int) Database::scalar('SELECT stock_qty FROM products WHERE id = ?', [$productId]);
    }
}
