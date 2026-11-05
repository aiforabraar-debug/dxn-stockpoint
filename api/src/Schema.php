<?php
declare(strict_types=1);

namespace DXN;

/**
 * Database schema + seed data.
 *
 * Every statement is written so it runs unchanged on MySQL/MariaDB (production,
 * ByetHost) and on SQLite (local development, CI). Only the primary key
 * syntax and the table suffix differ, and those are resolved here.
 */
final class Schema
{
    public static function install(bool $seed = true): array
    {
        $pdo = Database::pdo();
        $driver = Config::isSqlite() ? 'sqlite' : 'mysql';

        foreach (self::statements($driver) as $sql) {
            try {
                $pdo->exec($sql);
            } catch (\PDOException $e) {
                // Re-running the installer must never be fatal: tables and
                // indexes that already exist simply skip.
                $message = strtolower($e->getMessage());
                $ignorable = str_contains($message, 'already exists')
                    || str_contains($message, 'duplicate key name')
                    || str_contains($message, 'duplicate column name');
                if (!$ignorable) {
                    throw $e;
                }
            }
        }

        self::ensureCounter();

        if ($seed) {
            self::seed();
        }

        return ['driver' => $driver, 'tables' => self::tableNames()];
    }

    /** @return array<int,string> */
    public static function statements(string $driver): array
    {
        $pk = $driver === 'sqlite'
            ? 'INTEGER PRIMARY KEY AUTOINCREMENT'
            : 'INT NOT NULL AUTO_INCREMENT PRIMARY KEY';

        $suffix = $driver === 'sqlite' ? '' : ' ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci';

        return [
            "CREATE TABLE IF NOT EXISTS sync_counter (
                id    INTEGER NOT NULL PRIMARY KEY,
                value BIGINT  NOT NULL DEFAULT 0
            ){$suffix}",

            "CREATE TABLE IF NOT EXISTS products (
                id            {$pk},
                sku           VARCHAR(64)  NOT NULL,
                name          VARCHAR(160) NOT NULL,
                category      VARCHAR(64)  NOT NULL DEFAULT 'General',
                description   TEXT         NULL,
                retail_price  DECIMAL(12,2) NOT NULL DEFAULT 0,
                member_price  DECIMAL(12,2) NOT NULL DEFAULT 0,
                pv_points     DECIMAL(12,2) NOT NULL DEFAULT 0,
                stock_qty     INTEGER      NOT NULL DEFAULT 0,
                low_stock_at  INTEGER      NOT NULL DEFAULT 5,
                image_url     VARCHAR(255) NULL,
                is_active     INTEGER      NOT NULL DEFAULT 1,
                created_at    DATETIME     NOT NULL,
                updated_at    DATETIME     NOT NULL,
                rev           BIGINT       NOT NULL DEFAULT 0
            ){$suffix}",

            "CREATE TABLE IF NOT EXISTS customers (
                id            {$pk},
                name          VARCHAR(160) NOT NULL,
                phone         VARCHAR(40)  NULL,
                dxn_member_id VARCHAR(40)  NULL,
                is_member     INTEGER      NOT NULL DEFAULT 0,
                total_orders  INTEGER      NOT NULL DEFAULT 0,
                total_spent   DECIMAL(12,2) NOT NULL DEFAULT 0,
                total_pv      DECIMAL(12,2) NOT NULL DEFAULT 0,
                last_order_at DATETIME     NULL,
                created_at    DATETIME     NOT NULL,
                updated_at    DATETIME     NOT NULL,
                rev           BIGINT       NOT NULL DEFAULT 0
            ){$suffix}",

            "CREATE TABLE IF NOT EXISTS orders (
                id             {$pk},
                client_uuid    VARCHAR(64)  NULL,
                order_number   VARCHAR(40)  NOT NULL,
                customer_id    INTEGER      NULL,
                customer_name  VARCHAR(160) NOT NULL,
                customer_phone VARCHAR(40)  NULL,
                dxn_member_id  VARCHAR(40)  NULL,
                is_member      INTEGER      NOT NULL DEFAULT 0,
                subtotal       DECIMAL(12,2) NOT NULL DEFAULT 0,
                discount       DECIMAL(12,2) NOT NULL DEFAULT 0,
                total_amount   DECIMAL(12,2) NOT NULL DEFAULT 0,
                total_pv       DECIMAL(12,2) NOT NULL DEFAULT 0,
                status         VARCHAR(24)  NOT NULL DEFAULT 'CONFIRMED',
                payment_method VARCHAR(24)  NOT NULL DEFAULT 'CASH',
                note           TEXT         NULL,
                source         VARCHAR(24)  NOT NULL DEFAULT 'web',
                courier_provider        VARCHAR(32)  NULL,
                courier_consignment_id   BIGINT       NULL,
                courier_tracking_code   VARCHAR(64)  NULL,
                courier_status          VARCHAR(32)  NULL,
                courier_cod_amount     DECIMAL(12,2) NULL,
                courier_created_at     DATETIME     NULL,
                courier_note           TEXT         NULL,
                created_at     DATETIME     NOT NULL,
                updated_at     DATETIME     NOT NULL,
                rev            BIGINT       NOT NULL DEFAULT 0
            ){$suffix}",

            "CREATE TABLE IF NOT EXISTS order_items (
                id         {$pk},
                order_id   INTEGER      NOT NULL,
                product_id INTEGER      NOT NULL,
                sku        VARCHAR(64)  NOT NULL DEFAULT '',
                name       VARCHAR(160) NOT NULL DEFAULT '',
                quantity   INTEGER      NOT NULL DEFAULT 1,
                unit_price DECIMAL(12,2) NOT NULL DEFAULT 0,
                unit_pv    DECIMAL(12,2) NOT NULL DEFAULT 0
            ){$suffix}",

            "CREATE TABLE IF NOT EXISTS stock_movements (
                id           {$pk},
                product_id   INTEGER      NOT NULL,
                delta        INTEGER      NOT NULL,
                quantity_after INTEGER    NOT NULL,
                reason       VARCHAR(64)  NOT NULL DEFAULT 'adjustment',
                order_id     INTEGER      NULL,
                created_at   DATETIME     NOT NULL
            ){$suffix}",

            "CREATE TABLE IF NOT EXISTS settings (
                setting_key   VARCHAR(64) NOT NULL PRIMARY KEY,
                setting_value TEXT        NULL,
                updated_at    DATETIME    NOT NULL,
                rev           BIGINT      NOT NULL DEFAULT 0
            ){$suffix}",

            "CREATE TABLE IF NOT EXISTS auth_attempts (
                id           {$pk},
                ip           VARCHAR(64) NOT NULL,
                ok           INTEGER     NOT NULL DEFAULT 0,
                attempted_at DATETIME    NOT NULL
            ){$suffix}",

            "CREATE TABLE IF NOT EXISTS audit_log (
                id         {$pk},
                action     VARCHAR(64) NOT NULL,
                entity     VARCHAR(32) NOT NULL,
                entity_id  VARCHAR(64) NULL,
                detail     TEXT        NULL,
                created_at DATETIME    NOT NULL
            ){$suffix}",

            "CREATE TABLE IF NOT EXISTS courier_events (
                id             {$pk},
                order_id       INTEGER     NULL,
                consignment_id BIGINT      NULL,
                invoice        VARCHAR(64) NULL,
                event_type     VARCHAR(32) NOT NULL DEFAULT 'unknown',
                payload        TEXT        NULL,
                created_at     DATETIME    NOT NULL
            ){$suffix}",

            'CREATE UNIQUE INDEX idx_products_sku ON products (sku)',
            'CREATE INDEX idx_products_rev ON products (rev)',
            'CREATE INDEX idx_products_category ON products (category)',
            'CREATE UNIQUE INDEX idx_orders_number ON orders (order_number)',
            'CREATE UNIQUE INDEX idx_orders_uuid ON orders (client_uuid)',
            'CREATE INDEX idx_orders_rev ON orders (rev)',
            'CREATE INDEX idx_orders_created ON orders (created_at)',
            'CREATE INDEX idx_items_order ON order_items (order_id)',
            'CREATE INDEX idx_customers_rev ON customers (rev)',
            'CREATE UNIQUE INDEX idx_customers_member ON customers (dxn_member_id)',
            'CREATE INDEX idx_movements_product ON stock_movements (product_id)',
            'CREATE INDEX idx_attempts_ip ON auth_attempts (ip)',
            'CREATE INDEX idx_orders_status ON orders (status)',
            'CREATE INDEX idx_orders_customer ON orders (customer_id)',
            'CREATE INDEX idx_products_active ON products (is_active)',
            'CREATE INDEX idx_orders_courier ON orders (courier_consignment_id)',
            'CREATE INDEX idx_courier_events_order ON courier_events (order_id)',
            'CREATE INDEX idx_courier_events_consignment ON courier_events (consignment_id)',
            'ALTER TABLE orders ADD COLUMN courier_provider VARCHAR(32) NULL',
            'ALTER TABLE orders ADD COLUMN courier_consignment_id BIGINT NULL',
            'ALTER TABLE orders ADD COLUMN courier_tracking_code VARCHAR(64) NULL',
            'ALTER TABLE orders ADD COLUMN courier_status VARCHAR(32) NULL',
            'ALTER TABLE orders ADD COLUMN courier_cod_amount DECIMAL(12,2) NULL',
            'ALTER TABLE orders ADD COLUMN courier_created_at DATETIME NULL',
            'ALTER TABLE orders ADD COLUMN courier_note TEXT NULL',
        ];
    }

    private static function ensureCounter(): void
    {
        $exists = Database::one('SELECT id FROM sync_counter WHERE id = 1');
        if ($exists === null) {
            Database::run('INSERT INTO sync_counter (id, value) VALUES (1, 1)');
        }
    }

    /** @return array<int,string> */
    public static function tableNames(): array
    {
        return [
            'products', 'orders', 'order_items', 'customers',
            'stock_movements', 'settings', 'sync_counter', 'auth_attempts', 'audit_log',
            'courier_events',
        ];
    }

    public static function seed(): void
    {
        self::syncCatalog();
        self::backfillArtwork();

        foreach (self::defaultSettings() as $key => $value) {
            if (Store::setting($key) === null) {
                Store::putSetting($key, $value, false);
            }
        }

        self::backfillBranding();
    }

    /**
     * Keeps the bundled catalogue in step with the current DXN price list.
     * Missing SKUs are created, seeded prices/names are refreshed, and the
     * short-lived placeholder catalogue is retired without deleting rows, so
     * historical orders keep pointing at a valid product.
     */
    private static function syncCatalog(): void
    {
        foreach (self::products() as $product) {
            $row = Database::one('SELECT id FROM products WHERE sku = ?', [$product['sku']]);
            if ($row === null) {
                Store::createProduct($product);
                continue;
            }
            Database::run(
                'UPDATE products SET name = ?, category = ?, description = ?, retail_price = ?,
                    member_price = ?, pv_points = ?, updated_at = ?, rev = ? WHERE id = ?',
                [
                    $product['name'],
                    $product['category'],
                    $product['description'],
                    $product['retail_price'],
                    $product['member_price'],
                    $product['pv_points'],
                    Util::now(),
                    Store::nextRev(),
                    $row['id'],
                ]
            );
        }

        // Archive retired starter SKUs but never rewrite their inventory. A
        // quantity that happened to equal an old demo seed can be real stock.
        $placeholders = implode(',', array_fill(0, count(self::LEGACY_SKUS), '?'));
        $legacyActive = (int) Database::scalar(
            "SELECT COUNT(*) FROM products WHERE sku IN ({$placeholders}) AND is_active = 1",
            self::LEGACY_SKUS
        );
        if ($legacyActive === 0) {
            return;
        }

        foreach (self::LEGACY_SKUS as $sku) {
            Database::run(
                'UPDATE products SET is_active = 0, updated_at = ?, rev = ? WHERE sku = ?',
                [Util::now(), Store::nextRev(), $sku]
            );
        }
    }

    /**
     * Older installations seeded the placeholder "DXN Stockpoint Central"
     * profile. Move only untouched placeholder values to the Mohammadpur
     * profile; a shopkeeper's own branch name, number or address is preserved.
     */
    private static function backfillBranding(): void
    {
        $replacements = [
            'branch_name' => [
                'old' => ['DXN Stockpoint Central', 'DXN Stockpoint'],
                'new' => 'Mohammadpur Stock Point',
            ],
            'whatsapp_number' => [
                'old' => ['8801987851131'],
                'new' => '8801939994578',
            ],
            'receipt_footer' => [
                'old' => ['Thank you for choosing DXN!', 'Thank you for choosing DXN. Wealth through health.'],
                'new' => 'Thank you for choosing Mohammadpur Stock Point. Wealth through health.',
            ],
            'business_address' => [
                'old' => [''],
                'new' => 'H # 1, R # 11, B # A, Chandrima Model Town, Dhaka-1207',
            ],
            'business_phone' => [
                'old' => [''],
                'new' => '01939994578',
            ],
        ];

        foreach ($replacements as $key => $migration) {
            $current = Store::setting($key);
            if ($current === null || !in_array($current, $migration['old'], true)) {
                continue;
            }
            Store::putSetting($key, $migration['new'], true);
        }
    }

    /**
     * Existing shops that were seeded before product photography existed get
     * the bundled photos on the next install/upgrade run. Only empty columns
     * are touched, so a shopkeeper's own image URLs are never overwritten.
     */
    private static function backfillArtwork(): void
    {
        foreach (self::products() as $product) {
            $row = Database::one(
                'SELECT id, image_url, description FROM products WHERE sku = ?',
                [$product['sku']]
            );
            if ($row === null) {
                continue;
            }
            $needsImage = empty($row['image_url']);
            $needsDescription = empty($row['description']);
            if (!$needsImage && !$needsDescription) {
                continue;
            }
            Database::run(
                'UPDATE products SET image_url = ?, description = ?, updated_at = ?, rev = ? WHERE id = ?',
                [
                    $needsImage ? ($product['image_url'] ?? null) : $row['image_url'],
                    $needsDescription ? ($product['description'] ?? null) : $row['description'],
                    Util::now(),
                    Store::nextRev(),
                    $row['id'],
                ]
            );
        }
    }

    /** Public location of the product photography bundled with the web app. */
    private const IMAGE_BASE = 'https://abraar05.github.io/dxn-stockpoint/images/products/';

    /** Placeholder SKUs from the first catalogue release, retired in 2.1.2. */
    private const LEGACY_SKUS = [
        'DXN-LZC-2IN1-20', 'DXN-RGGL-90', 'DXN-MORINZHI-500',
        'DXN-SPIRULINA-120', 'DXN-ANDRO-90', 'DXN-LZC-TEA-25',
    ];

    /** @return array<int,array<string,mixed>> */
    public static function products(): array
    {
        return [
            [
                'sku' => 'DXN-SOAP-GANO', 'name' => 'Ganozhi Soap 75g', 'category' => 'Personal Care',
                'description' => 'Ganozhi translucent beauty soap with Ganoderma extract and moisturisers.',
                'retail_price' => 470.00, 'member_price' => 390.00, 'pv_points' => 65.0, 'stock_qty' => 25,
                'image_url' => self::IMAGE_BASE . 'ganozhi-beauty-soap.jpg',
            ],
            [
                'sku' => 'DXN-ALOE-BAR-1', 'name' => 'Aloe Vera Bathing Bar (100g)', 'category' => 'Personal Care',
                'description' => 'Aloe vera bathing bar that cleanses gently while keeping skin soft and hydrated.',
                'retail_price' => 185.00, 'member_price' => 155.00, 'pv_points' => 35.0, 'stock_qty' => 25,
                'image_url' => null,
            ],
            [
                'sku' => 'DXN-ALOE-BAR-3', 'name' => 'Aloe Vera Bathing Bar (Family Pack, 3x100g)', 'category' => 'Personal Care',
                'description' => 'Three-bar family pack of the aloe vera bathing bar.',
                'retail_price' => 490.00, 'member_price' => 410.00, 'pv_points' => 95.0, 'stock_qty' => 25,
                'image_url' => null,
            ],
            [
                'sku' => 'DXN-NEEM-BAR-1', 'name' => 'Neem Bathing Bar (100g)', 'category' => 'Personal Care',
                'description' => 'Neem bathing bar with natural neem extract for everyday skin care.',
                'retail_price' => 210.00, 'member_price' => 175.00, 'pv_points' => 35.0, 'stock_qty' => 25,
                'image_url' => self::IMAGE_BASE . 'neem-bathing-bar.jpg',
            ],
            [
                'sku' => 'DXN-NEEM-BAR-3', 'name' => 'Neem Bathing Bar (Family Pack, 3x100g)', 'category' => 'Personal Care',
                'description' => 'Three-bar family pack of the neem bathing bar.',
                'retail_price' => 490.00, 'member_price' => 410.00, 'pv_points' => 95.0, 'stock_qty' => 25,
                'image_url' => self::IMAGE_BASE . 'neem-bathing-bar.jpg',
            ],
            [
                'sku' => 'DXN-SHAMPOO-GANO', 'name' => 'Ganozhi Shampoo 200ml', 'category' => 'Personal Care',
                'description' => 'Ganozhi nourishing shampoo with Ganoderma extract for soft, healthy-looking hair.',
                'retail_price' => 440.00, 'member_price' => 365.00, 'pv_points' => 65.0, 'stock_qty' => 25,
                'image_url' => self::IMAGE_BASE . 'ganozhi-shampoo.jpg',
            ],
            [
                'sku' => 'DXN-NEEM-FACEWASH', 'name' => 'Neem Face Wash 100ml', 'category' => 'Personal Care',
                'description' => 'Gentle neem face wash that clears oil and impurities without drying the skin.',
                'retail_price' => 230.00, 'member_price' => 190.00, 'pv_points' => 45.0, 'stock_qty' => 25,
                'image_url' => self::IMAGE_BASE . 'neem-face-wash.jpg',
            ],
            [
                'sku' => 'DXN-PAPAYA-SCRUB', 'name' => 'Papaya Facial Scrub 100ml', 'category' => 'Personal Care',
                'description' => 'Papaya facial scrub that lifts dead skin for a fresher, brighter face.',
                'retail_price' => 280.00, 'member_price' => 235.00, 'pv_points' => 55.0, 'stock_qty' => 25,
                'image_url' => self::IMAGE_BASE . 'papaya-facial-scrub.jpg',
            ],
            [
                'sku' => 'DXN-APRICOT-SCRUB', 'name' => 'Apricot Facial Scrub 100ml', 'category' => 'Personal Care',
                'description' => 'Apricot facial scrub with fine granules to smooth and refresh the skin.',
                'retail_price' => 280.00, 'member_price' => 235.00, 'pv_points' => 55.0, 'stock_qty' => 25,
                'image_url' => null,
            ],
            [
                'sku' => 'DXN-ALOE-SCRUB', 'name' => 'Aloe Vera Facial Scrub 100ml', 'category' => 'Personal Care',
                'description' => 'Aloe vera facial scrub for gentle exfoliation and soft, calm skin.',
                'retail_price' => 1400.00, 'member_price' => 1165.00, 'pv_points' => 190.0, 'stock_qty' => 25,
                'image_url' => self::IMAGE_BASE . 'aloe-facial-scrub.jpg',
            ],
            [
                'sku' => 'DXN-ALOE-CLEANSING-JELLY', 'name' => 'Aloe Vera Cleansing Jelly', 'category' => 'Personal Care',
                'description' => 'Aloe vera cleansing jelly that removes make-up and daily grime gently.',
                'retail_price' => 1310.00, 'member_price' => 1090.00, 'pv_points' => 145.0, 'stock_qty' => 25,
                'image_url' => self::IMAGE_BASE . 'aloe-cleansing-gel.jpg',
            ],
            [
                'sku' => 'DXN-TOOTHPASTE-120', 'name' => 'Ganozhi Toothpaste (Malaysian) 150g', 'category' => 'Personal Care',
                'description' => 'Ganozhi toothpaste with Ganoderma extract for everyday oral care. 150g tube.',
                'retail_price' => 1000.00, 'member_price' => 835.00, 'pv_points' => 110.0, 'stock_qty' => 25,
                'image_url' => self::IMAGE_BASE . 'ganozhi-toothpaste.jpg',
            ],
            [
                'sku' => 'DXN-TOOTHPASTE-50', 'name' => 'Ganozhi Toothpaste (Malaysian) 50g', 'category' => 'Personal Care',
                'description' => 'Travel-size 50g tube of Ganozhi toothpaste.',
                'retail_price' => 640.00, 'member_price' => 535.00, 'pv_points' => 70.0, 'stock_qty' => 25,
                'image_url' => self::IMAGE_BASE . 'ganozhi-toothpaste.jpg',
            ],
            [
                'sku' => 'DXN-TOOTHPASTE-IND-150', 'name' => 'Ganozhi Toothpaste (Indian) 150g', 'category' => 'Personal Care',
                'description' => 'Indian-made 150g Ganozhi toothpaste tube.',
                'retail_price' => 840.00, 'member_price' => 700.00, 'pv_points' => 135.0, 'stock_qty' => 25,
                'image_url' => self::IMAGE_BASE . 'ganozhi-toothpaste.jpg',
            ],
            [
                'sku' => 'DXN-TOOTHPASTE-IND-75', 'name' => 'Ganozhi Toothpaste (Indian) 75g', 'category' => 'Personal Care',
                'description' => 'Indian-made 75g Ganozhi toothpaste tube.',
                'retail_price' => 565.00, 'member_price' => 470.00, 'pv_points' => 85.0, 'stock_qty' => 25,
                'image_url' => self::IMAGE_BASE . 'ganozhi-toothpaste.jpg',
            ],
            [
                'sku' => 'DXN-TALCUM', 'name' => 'Talcum Powder', 'category' => 'Personal Care',
                'description' => 'DXN talcum powder that keeps skin fresh, dry and comfortable.',
                'retail_price' => 1430.00, 'member_price' => 1190.00, 'pv_points' => 225.0, 'stock_qty' => 25,
                'image_url' => self::IMAGE_BASE . 'talcum-powder.jpg',
            ],
            [
                'sku' => 'DXN-SUNSCREEN-100', 'name' => 'Sun Screen Lotion 100ml', 'category' => 'Personal Care',
                'description' => 'Daily sun screen lotion for light, non-greasy protection outdoors.',
                'retail_price' => 295.00, 'member_price' => 245.00, 'pv_points' => 35.0, 'stock_qty' => 25,
                'image_url' => self::IMAGE_BASE . 'sun-screen-lotion.jpg',
            ],
            [
                'sku' => 'DXN-BODY-LOTION', 'name' => 'Aloe Vera Body Lotion', 'category' => 'Personal Care',
                'description' => 'Aloe vera hand and body lotion that moisturises without a greasy feel.',
                'retail_price' => 1530.00, 'member_price' => 1275.00, 'pv_points' => 180.0, 'stock_qty' => 25,
                'image_url' => self::IMAGE_BASE . 'aloe-body-lotion.jpg',
            ],
            [
                'sku' => 'DXN-BODY-SCRUB-200', 'name' => 'Body Scrub 200g', 'category' => 'Personal Care',
                'description' => 'Body scrub with natural exfoliating grains for smooth, refreshed skin.',
                'retail_price' => 540.00, 'member_price' => 450.00, 'pv_points' => 90.0, 'stock_qty' => 25,
                'image_url' => self::IMAGE_BASE . 'body-scrub.jpg',
            ],
            [
                'sku' => 'DXN-HAIR-OIL-100', 'name' => 'Hair Oil 100ml', 'category' => 'Personal Care',
                'description' => 'Herbal hair oil that helps reduce hair fall and nourish the scalp.',
                'retail_price' => 710.00, 'member_price' => 590.00, 'pv_points' => 135.0, 'stock_qty' => 25,
                'image_url' => self::IMAGE_BASE . 'hair-oil.jpg',
            ],
            [
                'sku' => 'DXN-HAIR-PACK-20X5', 'name' => 'Hair Pack (20g x 5)', 'category' => 'Personal Care',
                'description' => 'Nourishing hair pack sachets for a weekly deep-conditioning treatment.',
                'retail_price' => 290.00, 'member_price' => 240.00, 'pv_points' => 45.0, 'stock_qty' => 25,
                'image_url' => null,
            ],
            [
                'sku' => 'DXN-RISHI-GANO-TEA-200', 'name' => 'Rishi Gano Tea 200g', 'category' => 'Coffee & Tea',
                'description' => 'Premium herbal tea blending ginseng and Ganoderma extract.',
                'retail_price' => 545.00, 'member_price' => 455.00, 'pv_points' => 90.0, 'stock_qty' => 25,
                'image_url' => self::IMAGE_BASE . 'rishi-gano-tea.jpg',
            ],
            [
                'sku' => 'DXN-MASALA-TEA-100', 'name' => 'Masala Tea 100g', 'category' => 'Coffee & Tea',
                'description' => 'Aromatic spiced masala tea blend for a warming cup.',
                'retail_price' => 300.00, 'member_price' => 250.00, 'pv_points' => 60.0, 'stock_qty' => 25,
                'image_url' => self::IMAGE_BASE . 'masala-tea.jpg',
            ],
            [
                'sku' => 'DXN-LZC-BLACK-20', 'name' => 'Lingzhi Black Coffee (5g x 20)', 'category' => 'Coffee & Tea',
                'description' => 'DXN Lingzhi Black Coffee with Ganoderma extract. 20 sachets.',
                'retail_price' => 1190.00, 'member_price' => 990.00, 'pv_points' => 350.0, 'stock_qty' => 25,
                'image_url' => self::IMAGE_BASE . 'lingzhi-black-coffee.jpg',
            ],
            [
                'sku' => 'DXN-LZC-3IN1-20', 'name' => 'Lingzhi Coffee 3-in-1', 'category' => 'Coffee & Tea',
                'description' => 'The classic DXN coffee: premium instant coffee blended with Ganoderma lucidum extract, sugar and non-dairy creamer. 20 sachets.',
                'retail_price' => 2460.00, 'member_price' => 2050.00, 'pv_points' => 475.0, 'stock_qty' => 25,
                'image_url' => self::IMAGE_BASE . 'lingzhi-coffee-3in1.jpg',
            ],
            [
                'sku' => 'DXN-LZC-LITE-20', 'name' => 'Lingzhi Coffee 3-in-1 Lite', 'category' => 'Coffee & Tea',
                'description' => 'A lighter, creamier Lingzhi coffee with reduced sugar for an everyday cup.',
                'retail_price' => 2370.00, 'member_price' => 1975.00, 'pv_points' => 365.0, 'stock_qty' => 25,
                'image_url' => self::IMAGE_BASE . 'lingzhi-coffee-lite.jpg',
            ],
            [
                'sku' => 'DXN-WHITE-COFFEE-20', 'name' => 'White Coffee Zhino', 'category' => 'Coffee & Tea',
                'description' => 'Smooth white coffee with Ganoderma extract and a creamy finish.',
                'retail_price' => 2550.00, 'member_price' => 2125.00, 'pv_points' => 290.0, 'stock_qty' => 25,
                'image_url' => self::IMAGE_BASE . 'white-coffee.jpg',
            ],
            [
                'sku' => 'DXN-ZHI-MOCHA-20', 'name' => 'Zhi Mocha Coffee', 'category' => 'Coffee & Tea',
                'description' => 'A rich mocha blend of coffee, cocoa and Ganoderma extract for a cafe-style cup at home.',
                'retail_price' => 1510.00, 'member_price' => 1260.00, 'pv_points' => 290.0, 'stock_qty' => 25,
                'image_url' => self::IMAGE_BASE . 'zhi-mocha-premium.jpg',
            ],
            [
                'sku' => 'DXN-EU-CAFE-20', 'name' => 'Eu Cafe', 'category' => 'Coffee & Tea',
                'description' => 'Smooth European-style instant coffee enriched with Ganoderma extract.',
                'retail_price' => 2140.00, 'member_price' => 1785.00, 'pv_points' => 300.0, 'stock_qty' => 25,
                'image_url' => self::IMAGE_BASE . 'eu-cafe.jpg',
            ],
            [
                'sku' => 'DXN-VITA-CAFE-20', 'name' => 'Vita Cafe', 'category' => 'Coffee & Tea',
                'description' => 'Six-in-one coffee blend with ginseng, tongkat ali and Ganoderma extract.',
                'retail_price' => 2460.00, 'member_price' => 2050.00, 'pv_points' => 345.0, 'stock_qty' => 25,
                'image_url' => self::IMAGE_BASE . 'vita-cafe.jpg',
            ],
            [
                'sku' => 'DXN-CORDYCEPS-COFFEE-20', 'name' => 'Cordyceps Coffee 3-in-1', 'category' => 'Coffee & Tea',
                'description' => 'Instant coffee blended with cordyceps extract, creamer and cane sugar.',
                'retail_price' => 2330.00, 'member_price' => 1940.00, 'pv_points' => 450.0, 'stock_qty' => 25,
                'image_url' => self::IMAGE_BASE . 'cordyceps-coffee.jpg',
            ],
            [
                'sku' => 'DXN-LIONS-MANE-COFFEE-20', 'name' => 'Lion\'s Mane Coffee', 'category' => 'Coffee & Tea',
                'description' => 'Coffee enriched with lion\'s mane mushroom extract for a smooth, earthy cup.',
                'retail_price' => 2840.00, 'member_price' => 2365.00, 'pv_points' => 390.0, 'stock_qty' => 25,
                'image_url' => self::IMAGE_BASE . 'lions-mane-coffee.jpg',
            ],
            [
                'sku' => 'DXN-COCOZHI-500', 'name' => 'Cocozhi 500g', 'category' => 'Food & Drink',
                'description' => 'Healthy cocoa drink with Ganoderma extract, 20 sachets of 25g.',
                'retail_price' => 2695.00, 'member_price' => 2245.00, 'pv_points' => 525.0, 'stock_qty' => 25,
                'image_url' => self::IMAGE_BASE . 'cocozhi.jpg',
            ],
            [
                'sku' => 'DXN-SPIRULINA-CEREAL-500', 'name' => 'Spirulina Cereal 500g', 'category' => 'Food & Drink',
                'description' => 'Nutritious spirulina cereal drink mix, 20 sachets of 25g.',
                'retail_price' => 3180.00, 'member_price' => 2650.00, 'pv_points' => 540.0, 'stock_qty' => 25,
                'image_url' => self::IMAGE_BASE . 'spirulina-cereal.jpg',
            ],
            [
                'sku' => 'DXN-CORDYCEPS-CEREAL-500', 'name' => 'Cordyceps Cereal 500g', 'category' => 'Food & Drink',
                'description' => 'Cordyceps cereal drink mix, 20 sachets of 25g.',
                'retail_price' => 4255.00, 'member_price' => 3545.00, 'pv_points' => 825.0, 'stock_qty' => 25,
                'image_url' => self::IMAGE_BASE . 'cordyceps-cereal.jpg',
            ],
            [
                'sku' => 'DXN-LEMONZHI-500', 'name' => 'Lemonzhi 500g', 'category' => 'Food & Drink',
                'description' => 'Refreshing lemon and Ganoderma drink mix, 25 sachets of 20g.',
                'retail_price' => 895.00, 'member_price' => 745.00, 'pv_points' => 175.0, 'stock_qty' => 25,
                'image_url' => self::IMAGE_BASE . 'lemonzhi.jpg',
            ],
            [
                'sku' => 'DXN-ZHI-YOBITE-30', 'name' => 'Zhi Yobite 30g', 'category' => 'Food & Drink',
                'description' => 'Oat-based nutritious drink mix from DXN. 30g pack.',
                'retail_price' => 840.00, 'member_price' => 700.00, 'pv_points' => 125.0, 'stock_qty' => 25,
                'image_url' => self::IMAGE_BASE . 'zhi-yobite.jpg',
            ],
            [
                'sku' => 'DXN-LINA-YOBITE-30', 'name' => 'Lina Yobite 30g', 'category' => 'Food & Drink',
                'description' => 'Oat-based nutritious drink mix from DXN. 30g pack.',
                'retail_price' => 840.00, 'member_price' => 700.00, 'pv_points' => 125.0, 'stock_qty' => 25,
                'image_url' => self::IMAGE_BASE . 'lina-yobite.jpg',
            ],
            [
                'sku' => 'DXN-APPLE-ENZYME-750', 'name' => 'Apple Enzyme Drink 750ml', 'category' => 'Food & Drink',
                'description' => 'Fermented apple enzyme drink for digestion and daily wellbeing. 750ml.',
                'retail_price' => 4060.00, 'member_price' => 3385.00, 'pv_points' => 570.0, 'stock_qty' => 25,
                'image_url' => self::IMAGE_BASE . 'apple-enzyme.jpg',
            ],
            [
                'sku' => 'DXN-APPLE-JAM-300', 'name' => 'Apple Fermented Jam 300g', 'category' => 'Food & Drink',
                'description' => 'Apple jam made from fermented apples, 300g jar.',
                'retail_price' => 1555.00, 'member_price' => 1295.00, 'pv_points' => 225.0, 'stock_qty' => 25,
                'image_url' => self::IMAGE_BASE . 'apple-jam.jpg',
            ],
            [
                'sku' => 'DXN-LIONS-MANE-OOCHA', 'name' => 'Lion\'s Mane Oocha', 'category' => 'Food & Drink',
                'description' => 'Oocha green tea blend with lion\'s mane mushroom extract.',
                'retail_price' => 2810.00, 'member_price' => 2340.00, 'pv_points' => 395.0, 'stock_qty' => 25,
                'image_url' => self::IMAGE_BASE . 'lions-mane-ooocha.jpg',
            ],
            [
                'sku' => 'DXN-LIONS-MANE-MATCHA', 'name' => 'Lion\'s Mane Lemon Matcha', 'category' => 'Food & Drink',
                'description' => 'Lemon matcha drink with lion\'s mane mushroom extract.',
                'retail_price' => 2020.00, 'member_price' => 1685.00, 'pv_points' => 305.0, 'stock_qty' => 25,
                'image_url' => self::IMAGE_BASE . 'lions-mane-lemon-matcha.jpg',
            ],
            [
                'sku' => 'DXN-SPIRUDLE-PLAIN', 'name' => 'Spirudle', 'category' => 'Food & Drink',
                'description' => 'Spirulina noodle made without artificial colouring.',
                'retail_price' => 1225.00, 'member_price' => 1020.00, 'pv_points' => 190.0, 'stock_qty' => 25,
                'image_url' => self::IMAGE_BASE . 'spirudle.jpg',
            ],
            [
                'sku' => 'DXN-GOJI-BERRY', 'name' => 'Goji Berry', 'category' => 'Food & Drink',
                'description' => 'Dried goji berries, a naturally sweet source of antioxidants.',
                'retail_price' => 4115.00, 'member_price' => 3430.00, 'pv_points' => 625.0, 'stock_qty' => 25,
                'image_url' => self::IMAGE_BASE . 'goji-berry.jpg',
            ],
            [
                'sku' => 'DXN-OOCHA-NOODLES', 'name' => 'Oocha Noodles', 'category' => 'Food & Drink',
                'description' => 'Oocha noodles made with nutritious ingredients for a quick meal.',
                'retail_price' => 1225.00, 'member_price' => 1020.00, 'pv_points' => 175.0, 'stock_qty' => 25,
                'image_url' => self::IMAGE_BASE . 'oocha-noodles.jpg',
            ],
            [
                'sku' => 'DXN-OOCHA-NOODLES-TYF', 'name' => 'Oocha Noodles (TYF)', 'category' => 'Food & Drink',
                'description' => 'Oocha noodles in Tom Yam flavour.',
                'retail_price' => 1915.00, 'member_price' => 1595.00, 'pv_points' => 235.0, 'stock_qty' => 25,
                'image_url' => self::IMAGE_BASE . 'oocha-noodles-tyf.jpg',
            ],
            [
                'sku' => 'DXN-VEGGIE-NOODLE', 'name' => 'Veggie Noodle', 'category' => 'Food & Drink',
                'description' => 'Vegetable noodle from DXN, quick to cook and light to eat.',
                'retail_price' => 1060.00, 'member_price' => 885.00, 'pv_points' => 170.0, 'stock_qty' => 25,
                'image_url' => self::IMAGE_BASE . 'veggie-noodle.jpg',
            ],
            [
                'sku' => 'DXN-RG-POWDER-50', 'name' => 'RG Powder 50g', 'category' => 'Supplements',
                'description' => 'Reishi Gano (RG) Ganoderma lucidum mushroom powder, 50g.',
                'retail_price' => 4145.00, 'member_price' => 3455.00, 'pv_points' => 1070.0, 'stock_qty' => 25,
                'image_url' => self::IMAGE_BASE . 'rg-powder-50.jpg',
            ],
            [
                'sku' => 'DXN-GL-POWDER-80', 'name' => 'GL Powder 80g', 'category' => 'Supplements',
                'description' => 'Ganocelium (GL) Ganoderma mycelium powder, 80g.',
                'retail_price' => 3060.00, 'member_price' => 2550.00, 'pv_points' => 770.0, 'stock_qty' => 25,
                'image_url' => self::IMAGE_BASE . 'gl-powder-80.jpg',
            ],
            [
                'sku' => 'DXN-CORDYCEPS-POWDER-30', 'name' => 'Cordyceps Powder 30g', 'category' => 'Supplements',
                'description' => 'Cordyceps mushroom powder, 30g.',
                'retail_price' => 3275.00, 'member_price' => 2730.00, 'pv_points' => 960.0, 'stock_qty' => 25,
                'image_url' => self::IMAGE_BASE . 'cordyceps-powder-30.jpg',
            ],
            [
                'sku' => 'DXN-LIONS-MANE-POWDER-30', 'name' => 'Lion\'s Mane Powder 30g', 'category' => 'Supplements',
                'description' => 'Lion\'s mane mushroom powder, 30g.',
                'retail_price' => 1680.00, 'member_price' => 1400.00, 'pv_points' => 390.0, 'stock_qty' => 25,
                'image_url' => self::IMAGE_BASE . 'lions-mane-powder-30.jpg',
            ],
        ];
    }

    /** @return array<string,string> */
    public static function defaultSettings(): array
    {
        return [
            'branch_name'         => 'Mohammadpur Stock Point',
            'whatsapp_number'     => '8801939994578',
            'currency'            => 'BDT',
            'low_stock_threshold' => '5',
            'receipt_footer'      => 'Thank you for choosing Mohammadpur Stock Point. Wealth through health.',
            'business_address'    => 'H # 1, R # 11, B # A, Chandrima Model Town, Dhaka-1207',
            'business_phone'      => '01939994578',
            'allow_public_orders' => '1',
            'steadfast_base_url'    => 'https://portal.packzy.com/api/v1',
            'steadfast_api_key'     => '',
            'steadfast_secret_key'  => '',
            'steadfast_webhook_token' => '',
        ];
    }
}
