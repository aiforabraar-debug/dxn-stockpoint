<?php
declare(strict_types=1);

/**
 * DXN Stockpoint API — front controller.
 *
 * Everything is routed through this file (see .htaccess). Works on any PHP 8
 * host: ByetHost, cPanel, a VPS, or `php -S localhost:8080 -t api/public`.
 */

$bootstrap = __DIR__ . '/../src/bootstrap.php';
if (!is_file($bootstrap)) {
    // FTP deployment places this public file beside src/ at api/index.php.
    $bootstrap = __DIR__ . '/src/bootstrap.php';
}
require $bootstrap;

use DXN\Controllers\AuthController;
use DXN\Controllers\CatalogController;
use DXN\Controllers\CourierController;
use DXN\Controllers\CustomerController;
use DXN\Controllers\DashboardController;
use DXN\Controllers\HealthController;
use DXN\Controllers\OrderController;
use DXN\Controllers\SettingsController;
use DXN\Controllers\SyncController;
use DXN\Request;
use DXN\Response;
use DXN\Router;

$router = new Router();

// ── Service ─────────────────────────────────────────────────────────────────
$router->get('/api/v1/health', static fn () => HealthController::index());
$router->get('/api/v1/config', static fn () => HealthController::config());
$router->get('/api/v1/migrate', static fn () => HealthController::migrate());
$router->post('/api/v1/migrate', static fn () => HealthController::migrate());

// ── Auth ────────────────────────────────────────────────────────────────────
$router->post('/api/v1/auth/login', static fn () => AuthController::login());
$router->get('/api/v1/auth/me', static fn () => AuthController::me());
$router->post('/api/v1/auth/pin', static fn () => AuthController::changePin());

// ── Catalogue ───────────────────────────────────────────────────────────────
$router->get('/api/v1/products', static fn () => CatalogController::index());
$router->get('/api/v1/products/{id}', static fn (array $p) => CatalogController::show($p));
$router->post('/api/v1/products', static fn () => CatalogController::store());
$router->put('/api/v1/products/{id}', static fn (array $p) => CatalogController::update($p));
$router->patch('/api/v1/products/{id}', static fn (array $p) => CatalogController::update($p));
$router->delete('/api/v1/products/{id}', static fn (array $p) => CatalogController::destroy($p));
$router->post('/api/v1/products/{id}/restore', static fn (array $p) => CatalogController::restore($p));

// ── Stock ───────────────────────────────────────────────────────────────────
$router->post('/api/v1/stock/update', static fn () => CatalogController::updateStock());
$router->post('/api/v1/stock/adjust', static fn () => CatalogController::adjustStock());
$router->get('/api/v1/stock/movements', static fn () => CatalogController::movements());
// ── Courier (SteadFast) ─────────────────────────────────────────────────────
$router->get('/api/v1/courier/settings', static fn () => CourierController::settings());
$router->put('/api/v1/courier/settings', static fn () => CourierController::saveSettings());
$router->post('/api/v1/courier/ship/{id}', static fn (array $p) => CourierController::ship($p));
$router->get('/api/v1/courier/status/{id}', static fn (array $p) => CourierController::status($p));
$router->get('/api/v1/courier/balance', static fn () => CourierController::balance());
$router->post('/api/v1/courier/return/{id}', static fn (array $p) => CourierController::createReturn($p));
$router->get('/api/v1/courier/returns', static fn () => CourierController::returns());
$router->post('/api/v1/courier/webhook', static fn () => CourierController::webhook());

// ── Orders ──────────────────────────────────────────────────────────────────
$router->get('/api/v1/orders', static fn () => OrderController::index());
$router->post('/api/v1/orders', static fn () => OrderController::create());
$router->get('/api/v1/orders/{id}', static fn (array $p) => OrderController::show($p));
$router->post('/api/v1/orders/{id}/status', static fn (array $p) => OrderController::updateStatus($p));
$router->post('/api/v1/orders/{id}/return', static fn (array $p) => OrderController::returnOrder($p));
$router->get('/api/v1/orders/{id}/receipt', static fn (array $p) => OrderController::receipt($p));

// ── Customers, dashboard, reporting ─────────────────────────────────────────
$router->get('/api/v1/customers', static fn () => CustomerController::index());
$router->get('/api/v1/customers/{id}', static fn (array $p) => CustomerController::show($p));
$router->get('/api/v1/dashboard', static fn () => DashboardController::index());
$router->get('/api/v1/reports/sales', static fn () => DashboardController::salesReport());

// ── Settings & sync ─────────────────────────────────────────────────────────
$router->get('/api/v1/settings', static fn () => SettingsController::index());
$router->put('/api/v1/settings', static fn () => SettingsController::update());
$router->get('/api/v1/sync', static fn () => SyncController::pull());
$router->get('/api/v1/sync/status', static fn () => SyncController::status());

// Friendly root for humans poking at the API.
if (in_array(Request::path(), ['/', '/index.php'], true)) {
    Response::json([
        'success'   => true,
        'service'   => 'Mohammadpur Stock Point API',
        'version'   => \DXN\Config::get('version'),
        'installed' => \DXN\Config::installed(),
        'endpoints' => [
            'GET /api/v1/health',
            'GET /api/v1/products',
            'POST /api/v1/orders',
            'GET /api/v1/sync?since=0',
        ],
    ]);
}

$router->dispatch(Request::method(), Request::path());
