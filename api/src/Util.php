<?php
declare(strict_types=1);

namespace DXN;

final class Util
{
    public static function now(): string
    {
        return gmdate('Y-m-d H:i:s');
    }

    public static function iso(?string $value): ?string
    {
        if ($value === null || $value === '') {
            return null;
        }
        $ts = strtotime($value . ' UTC');
        return $ts === false ? null : gmdate('c', $ts);
    }

    public static function uuid(): string
    {
        $bytes = random_bytes(16);
        $bytes[6] = chr((ord($bytes[6]) & 0x0f) | 0x40);
        $bytes[8] = chr((ord($bytes[8]) & 0x3f) | 0x80);
        return vsprintf('%s%s-%s-%s-%s-%s%s%s', str_split(bin2hex($bytes), 4));
    }

    public static function orderNumber(): string
    {
        return 'DXN-' . gmdate('ymd') . '-' . strtoupper(bin2hex(random_bytes(2)));
    }

    public static function money(mixed $value): float
    {
        return round((float) $value, 2);
    }

    public static function int(mixed $value, int $default = 0): int
    {
        if (is_numeric($value)) {
            return (int) $value;
        }
        return $default;
    }

    /** Trims and collapses whitespace; useful for names coming from clients. */
    public static function clean(mixed $value, int $max = 160): string
    {
        $text = is_scalar($value) ? (string) $value : '';
        $text = trim(preg_replace('/\s+/u', ' ', $text) ?? $text);
        if (function_exists('mb_substr')) {
            return mb_substr($text, 0, $max, 'UTF-8');
        }
        return substr($text, 0, $max);
    }

    public static function requireFields(array|string $keys): void
    {
        foreach ((array) $keys as $key) {
            $value = Request::input($key);
            if ($value === null || $value === '' || $value === []) {
                throw new ApiException("Missing required field: {$key}", 422, 'validation_error');
            }
        }
    }

    public static function bool(mixed $value): int
    {
        return in_array($value, [true, 1, '1', 'true', 'yes'], true) ? 1 : 0;
    }

    /**
     * Escapes user text for safe inclusion in HTML (install page, receipts).
     */
    public static function e(mixed $value): string
    {
        return htmlspecialchars((string) $value, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');
    }
}
