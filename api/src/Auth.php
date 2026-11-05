<?php
declare(strict_types=1);

namespace DXN;

/**
 * Stateless HMAC tokens.
 *
 * Two ways in:
 *  1. `POST /auth/login` with the shop PIN  -> short-lived bearer token
 *  2. `X-Api-Key: <admin_key>` header        -> machine access (scripts, CI)
 *
 * No sessions, no token table, nothing to garbage-collect on shared hosting.
 */
final class Auth
{
    public const ROLE_ADMIN = 'admin';

    /** @var array<string,mixed>|null */
    private static ?array $claims = null;

    public static function login(string $pin): array
    {
        self::guardBruteForce();

        $hash = Store::setting('admin_pin_hash');
        if ($hash === null || $hash === '') {
            throw new ApiException(
                'No shop PIN configured yet. Run the installer or set ADMIN_PIN.',
                409,
                'not_installed'
            );
        }

        if (!password_verify($pin, $hash)) {
            Store::logAttempt(Request::ip(), false);
            throw new ApiException('Invalid PIN', 401, 'invalid_credentials');
        }

        Store::logAttempt(Request::ip(), true);

        $ttl = (int) Config::get('token_ttl', 2592000);
        $expires = time() + $ttl;

        return [
            'token'      => self::sign(['role' => self::ROLE_ADMIN, 'exp' => $expires]),
            'expires_at' => gmdate('c', $expires),
            'role'       => self::ROLE_ADMIN,
            'ttl'        => $ttl,
        ];
    }

    public static function sign(array $claims): string
    {
        $payload = self::b64(json_encode($claims, JSON_UNESCAPED_SLASHES) ?: '{}');
        $signature = hash_hmac('sha256', $payload, Config::tokenSecret(), true);
        return $payload . '.' . self::b64($signature);
    }

    public static function verify(string $token): ?array
    {
        $parts = explode('.', $token);
        if (count($parts) !== 2) {
            return null;
        }
        [$payload, $signature] = $parts;

        $expected = self::b64(hash_hmac('sha256', $payload, Config::tokenSecret(), true));
        if (!hash_equals($expected, $signature)) {
            return null;
        }

        $claims = json_decode(self::unb64($payload), true);
        if (!is_array($claims)) {
            return null;
        }
        if (isset($claims['exp']) && (int) $claims['exp'] < time()) {
            return null;
        }
        return $claims;
    }

    public static function claims(): ?array
    {
        if (self::$claims !== null) {
            return self::$claims;
        }

        $token = Request::bearerToken();
        if ($token !== null) {
            self::$claims = self::verify($token);
        }

        return self::$claims;
    }

    public static function isAdmin(): bool
    {
        $key = Request::header('X-Api-Key');
        $adminKey = (string) Config::get('admin_key', '');
        if ($key !== null && $adminKey !== '' && hash_equals($adminKey, $key)) {
            return true;
        }

        $claims = self::claims();
        return $claims !== null && ($claims['role'] ?? null) === self::ROLE_ADMIN;
    }

    /** Throws 401 unless the caller proved they are the shop owner. */
    public static function requireAdmin(): void
    {
        if (!self::isAdmin()) {
            throw new ApiException('Admin authentication required', 401, 'unauthorized');
        }
    }

    private static function guardBruteForce(): void
    {
        $since = gmdate('Y-m-d H:i:s', time() - 900);
        $failures = (int) Database::scalar(
            'SELECT COUNT(*) FROM auth_attempts WHERE ip = ? AND ok = 0 AND attempted_at >= ?',
            [Request::ip(), $since]
        );
        if ($failures >= 8) {
            throw new ApiException('Too many failed PIN attempts. Try again in 15 minutes.', 429, 'rate_limited');
        }
    }

    private static function b64(string $raw): string
    {
        return rtrim(strtr(base64_encode($raw), '+/', '-_'), '=');
    }

    private static function unb64(string $encoded): string
    {
        $padded = $encoded . str_repeat('=', (4 - strlen($encoded) % 4) % 4);
        return (string) base64_decode(strtr($padded, '-_', '+/'));
    }
}
