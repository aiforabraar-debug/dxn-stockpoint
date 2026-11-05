<?php
declare(strict_types=1);

namespace DXN;

/**
 * Minimal request/response helpers. No framework, no Composer — this runs on
 * shared PHP hosting where only plain PHP files are available.
 */
final class Request
{
    /** @var array<string,mixed>|null */
    private static ?array $json = null;

    public static function method(): string
    {
        $method = strtoupper($_SERVER['REQUEST_METHOD'] ?? 'GET');
        // Support method spoofing through _method for HTML form clients.
        if ($method === 'POST' && isset($_GET['_method'])) {
            $method = strtoupper((string) $_GET['_method']);
        }
        return $method;
    }

    public static function path(): string
    {
        $uri = $_SERVER['REQUEST_URI'] ?? '/';
        $path = parse_url($uri, PHP_URL_PATH) ?: '/';

        $script = $_SERVER['SCRIPT_NAME'] ?? '';
        $base = rtrim(str_replace('\\', '/', dirname($script)), '/');
        // When deployed at /api/, the /api prefix is part of the public route
        // contract (/api/v1/...). Do not strip it from rewritten requests.
        $publicApiPath = $base === '/api' && str_starts_with($path, '/api/v1/');
        if (!$publicApiPath && $base !== '' && $base !== '/' && str_starts_with($path, $base)) {
            $path = substr($path, strlen($base));
        }

        $path = '/' . ltrim($path, '/');
        return $path === '' ? '/' : $path;
    }

    /** @return array<string,mixed> */
    public static function json(): array
    {
        if (self::$json !== null) {
            return self::$json;
        }

        $raw = file_get_contents('php://input') ?: '';
        $body = $raw === '' ? [] : json_decode($raw, true);
        if (!is_array($body)) {
            $body = [];
        }
        // Form posts (install form, curl convenience) are merged in.
        self::$json = $body + $_POST;
        return self::$json;
    }

    public static function input(string $key, mixed $default = null): mixed
    {
        $body = self::json();
        if (array_key_exists($key, $body)) {
            return $body[$key];
        }
        return $_GET[$key] ?? $default;
    }

    public static function query(string $key, mixed $default = null): mixed
    {
        $value = $_GET[$key] ?? null;
        return $value === null || $value === '' ? $default : $value;
    }

    public static function header(string $name): ?string
    {
        $key = 'HTTP_' . strtoupper(str_replace('-', '_', $name));
        $value = $_SERVER[$key] ?? null;
        if ($value === null && strtoupper($name) === 'CONTENT_TYPE') {
            $value = $_SERVER['CONTENT_TYPE'] ?? null;
        }
        return $value === null ? null : (string) $value;
    }

    public static function bearerToken(): ?string
    {
        $auth = self::header('Authorization');
        if ($auth !== null && preg_match('/Bearer\s+(.+)/i', $auth, $m) === 1) {
            return trim($m[1]);
        }
        return null;
    }

    public static function ip(): string
    {
        if (Config::get('trust_proxy')) {
            $forwarded = self::header('X-Forwarded-For');
            if ($forwarded !== null && $forwarded !== '') {
                $parts = explode(',', $forwarded);
                return trim($parts[0]);
            }
        }
        return (string) ($_SERVER['REMOTE_ADDR'] ?? '0.0.0.0');
    }

    public static function isHttps(): bool
    {
        if (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off') {
            return true;
        }
        return strtolower((string) self::header('X-Forwarded-Proto')) === 'https';
    }
}

final class Response
{
    public static function cors(): void
    {
        $allowed = (string) Config::get('allowed_origins', '*');
        $origin = $_SERVER['HTTP_ORIGIN'] ?? '';

        if ($allowed === '*') {
            header('Access-Control-Allow-Origin: *');
        } elseif ($origin !== '') {
            $list = array_map('trim', explode(',', $allowed));
            if (in_array($origin, $list, true)) {
                header('Access-Control-Allow-Origin: ' . $origin);
                header('Vary: Origin');
            }
        }

        header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');
        header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Api-Key');
        header('Access-Control-Max-Age: 86400');
    }

    public static function json(mixed $payload, int $status = 200): never
    {
        http_response_code($status);
        header('Content-Type: application/json; charset=utf-8');
        header('Cache-Control: no-store, max-age=0');
        header('X-Content-Type-Options: nosniff');
        echo json_encode($payload, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    public static function ok(array $payload = [], int $status = 200): never
    {
        self::json(['success' => true] + $payload, $status);
    }

    public static function error(string $message, int $status = 400, string $code = 'bad_request', array $extra = []): never
    {
        self::json([
            'success' => false,
            'message' => $message,
            'error'   => ['code' => $code, 'message' => $message] + $extra,
        ], $status);
    }

    public static function noContent(): never
    {
        http_response_code(204);
        exit;
    }
}

/**
 * Domain error that maps directly onto an HTTP response.
 */
class ApiException extends \RuntimeException
{
    public function __construct(
        string $message,
        public readonly int $status = 400,
        public readonly string $errorCode = 'bad_request'
    ) {
        parent::__construct($message, $status);
    }
}
