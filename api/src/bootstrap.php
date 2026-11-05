<?php
declare(strict_types=1);

/**
 * Shared bootstrap for every entry point (public/index.php, install.php, CLI).
 * Plain requires instead of Composer so the same folder can be dropped onto
 * shared hosting with nothing but an FTP upload.
 */

require_once __DIR__ . '/Config.php';
require_once __DIR__ . '/Http.php';
require_once __DIR__ . '/Util.php';
require_once __DIR__ . '/Database.php';
require_once __DIR__ . '/Store.php';
require_once __DIR__ . '/Auth.php';
require_once __DIR__ . '/Schema.php';
require_once __DIR__ . '/Router.php';

spl_autoload_register(static function (string $class): void {
    $prefix = 'DXN\\';
    if (!str_starts_with($class, $prefix)) {
        return;
    }
    $relative = str_replace('\\', '/', substr($class, strlen($prefix)));
    $file = __DIR__ . '/' . $relative . '.php';
    if (is_file($file)) {
        require_once $file;
    }
});

\DXN\Config::load(dirname(__DIR__));
date_default_timezone_set('UTC');

set_exception_handler(static function (\Throwable $e): void {
    if ($e instanceof \DXN\ApiException) {
        \DXN\Response::error($e->getMessage(), $e->status, $e->errorCode);
    }

    $message = $e->getMessage();
    error_log('[dxn-api] ' . get_class($e) . ': ' . $message . ' @ ' . $e->getFile() . ':' . $e->getLine());

    if ($e instanceof \PDOException || str_contains($message, 'Database connection failed')) {
        \DXN\Response::error(
            'Database unavailable. Check api/config/config.php, then run install.php.',
            503,
            'database_unavailable'
        );
    }

    \DXN\Response::error(
        \DXN\Config::get('debug') ? $message : 'Internal server error',
        500,
        'internal_error'
    );
});

// CORS + pre-flight handling for the GitHub Pages / mobile clients.
\DXN\Response::cors();
if (strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
    http_response_code(204);
    exit;
}
