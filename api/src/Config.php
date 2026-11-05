<?php
declare(strict_types=1);

namespace DXN;

/**
 * Configuration loader.
 *
 * Reads config/config.php (never committed, never overwritten by deploys) and
 * layers environment variables on top so the same code runs on InfinityFree,
 * on a VPS, and on a laptop with PHP's built-in server.
 */
final class Config
{
    /** @var array<string,mixed> */
    private static array $data = [];

    private static string $root = '';

    public static function load(string $root): void
    {
        self::$root = rtrim($root, '/\\');

        $data = [];
        $file = self::$root . '/config/config.php';
        if (is_file($file)) {
            $loaded = require $file;
            if (is_array($loaded)) {
                $data = $loaded;
            }
        }

        $data = self::mergeDefaults($data);
        $data = self::applyEnv($data);

        self::$data = $data;
    }

    /** @return array<string,mixed> */
    private static function mergeDefaults(array $data): array
    {
        $defaults = [
            'driver'          => 'mysql',            // mysql | sqlite
            'db'              => [
                'host'    => 'sql301.infinityfree.com',
                'port'    => 3306,
                'name'    => '',
                'user'    => '',
                'pass'    => '',
                'charset' => 'utf8mb4',
                'path'    => '',
            ],
            'admin_key'       => 'change-me-please',
            'token_secret'    => '',
            'token_ttl'       => 2592000,            // 30 days
            'install_key'     => 'install-me',
            'allowed_origins' => '*',
            'timezone'        => 'UTC',
            'debug'           => false,
            'trust_proxy'     => true,
            'version'         => '2.1.2',
        ];

        $merged = array_replace_recursive($defaults, $data);
        $merged['db'] = array_replace($defaults['db'], $data['db'] ?? []);

        if ($merged['db']['path'] === '') {
            $merged['db']['path'] = self::$root . '/storage/dxn.sqlite';
        }

        return $merged;
    }

    private static function applyEnv(array $data): array
    {
        $map = [
            'DXN_DRIVER'          => ['driver', null],
            'DXN_DB_HOST'         => ['db', 'host'],
            'DXN_DB_PORT'         => ['db', 'port'],
            'DXN_DB_NAME'         => ['db', 'name'],
            'DXN_DB_USER'         => ['db', 'user'],
            'DXN_DB_PASS'         => ['db', 'pass'],
            'DXN_DB_PATH'         => ['db', 'path'],
            'DXN_ADMIN_KEY'       => ['admin_key', null],
            'DXN_TOKEN_SECRET'    => ['token_secret', null],
            'DXN_INSTALL_KEY'     => ['install_key', null],
            'DXN_ALLOWED_ORIGINS' => ['allowed_origins', null],
            'DXN_DEBUG'           => ['debug', null],
        ];

        foreach ($map as $env => [$a, $b]) {
            $value = getenv($env);
            if ($value === false || $value === '') {
                continue;
            }
            if ($b === null) {
                if ($a === 'debug') {
                    $value = in_array(strtolower((string) $value), ['1', 'true', 'yes'], true);
                }
                $data[$a] = $value;
            } else {
                $data[$a][$b] = $a === 'db' && $b === 'port' ? (int) $value : $value;
            }
        }

        return $data;
    }

    public static function get(string $key, mixed $default = null): mixed
    {
        return self::$data[$key] ?? $default;
    }

    /** @param array<int,string> $path */
    public static function db(?string $key = null, mixed $default = null): mixed
    {
        $db = self::$data['db'] ?? [];
        if ($key === null) {
            return $db;
        }
        return $db[$key] ?? $default;
    }

    public static function root(?string $append = null): string
    {
        return $append === null ? self::$root : self::$root . '/' . ltrim($append, '/');
    }

    public static function isSqlite(): bool
    {
        return (self::$data['driver'] ?? 'mysql') === 'sqlite';
    }

    /**
     * The secret used to sign access tokens. Falls back to a derivation of the
     * admin key so a fresh install works without extra setup, but admins are
     * encouraged to set an explicit value.
     */
    public static function tokenSecret(): string
    {
        $secret = (string) (self::$data['token_secret'] ?? '');
        if ($secret !== '') {
            return $secret;
        }
        return hash('sha256', 'dxn-stockpoint|' . (self::$data['admin_key'] ?? '') . '|' . self::db('name'));
    }

    public static function installed(): bool
    {
        return is_file(self::root('config/installed.lock'));
    }

    public static function markInstalled(): void
    {
        $dir = self::root('config');
        if (!is_dir($dir)) {
            @mkdir($dir, 0775, true);
        }
        @file_put_contents($dir . '/installed.lock', gmdate('c'));
    }
}
