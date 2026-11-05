<?php
declare(strict_types=1);

namespace DXN\Controllers;

use DXN\Config;
use DXN\Database;
use DXN\Response;
use DXN\Schema;
use DXN\Store;
use DXN\Util;

final class HealthController
{
    public static function index(): void
    {
        $dbOk = true;
        $dbError = null;
        $counts = [];

        try {
            foreach (['products', 'orders', 'customers'] as $table) {
                $counts[$table] = (int) Database::scalar("SELECT COUNT(*) FROM {$table}");
            }
        } catch (\Throwable $e) {
            $dbOk = false;
            $dbError = $e->getMessage();
        }

        Response::ok([
            'status'     => $dbOk ? 'ok' : 'degraded',
            'version'    => Config::get('version'),
            'driver'     => Config::isSqlite() ? 'sqlite' : 'mysql',
            'installed'  => Config::installed(),
            'server_time' => gmdate('c'),
            'php'        => PHP_VERSION,
            'database'   => ['ok' => $dbOk, 'error' => $dbError, 'counts' => $counts],
            'server_rev' => $dbOk ? Store::currentRev() : null,
        ], $dbOk ? 200 : 503);
    }

    /** Public bootstrap payload for clients: where am I, what am I, what's the config. */
    public static function config(): void
    {
        Response::ok([
            'branch'   => Store::publicSettings(),
            'version'  => Config::get('version'),
            'features' => [
                'public_orders' => Store::setting('allow_public_orders', '1') === '1',
                'sync'          => true,
                'receipts'      => true,
            ],
            'server_time' => gmdate('c'),
            'server_rev'  => Store::currentRev(),
        ]);
    }

    /** Creates tables on a fresh install. Safe to call repeatedly. */
    public static function migrate(): void
    {
        if (!Config::installed()) {
            \DXN\Auth::requireAdmin();
        }

        $result = Schema::install(true);
        Util::now();

        Response::ok(['message' => 'Schema is up to date', 'result' => $result]);
    }
}
