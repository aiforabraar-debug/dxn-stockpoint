<?php
declare(strict_types=1);

namespace DXN;

/**
 * Thin HTTP client for the SteadFast Courier API (Bangladesh).
 *
 * Credentials are read from the settings table so each shop configures its
 * own account through the admin UI; nothing secret lives in the repo.
 */
final class SteadFast
{
    public static function configured(): bool
    {
        return self::apiKey() !== '' && self::secretKey() !== '';
    }

    public static function baseUrl(): string
    {
        $url = (string) Store::setting('steadfast_base_url', 'https://portal.packzy.com/api/v1');
        return rtrim($url, '/');
    }

    public static function apiKey(): string
    {
        return (string) Store::setting('steadfast_api_key', '');
    }

    public static function secretKey(): string
    {
        return (string) Store::setting('steadfast_secret_key', '');
    }

    public static function webhookToken(): string
    {
        $token = (string) Store::setting('steadfast_webhook_token', '');
        return $token !== '' ? $token : self::apiKey();
    }

    /**
     * @return array{ok:bool,status:int,body:mixed,error:?string}
     */
    public static function request(string $method, string $path, ?array $payload = null): array
    {
        if (!self::configured() && !str_starts_with($path, '/')) {
            // allow balance/status calls only when configured
        }
        $url = self::baseUrl() . $path;

        $headers = [
            'Api-Key: ' . self::apiKey(),
            'Secret-Key: ' . self::secretKey(),
            'Accept: application/json',
            'Content-Type: application/json',
        ];

        $opts = [
            'http' => [
                'method'        => strtoupper($method),
                'header'        => implode("\r\n", $headers) . "\r\n",
                'timeout'       => 20,
                'ignore_errors' => true,
            ],
        ];

        if ($payload !== null) {
            $opts['http']['content'] = json_encode($payload, JSON_UNESCAPED_UNICODE);
        }

        $ctx = stream_context_create($opts);
        $raw = @file_get_contents($url, false, $ctx);

        $status = 0;
        if (isset($http_response_header) && is_array($http_response_header)) {
            foreach ($http_response_header as $line) {
                if (preg_match('#^HTTP/\S+\s+(\d{3})#', $line, $m)) {
                    $status = (int) $m[1];
                    break;
                }
            }
        }

        if ($raw === false) {
            return ['ok' => false, 'status' => $status, 'body' => null, 'error' => 'Network error contacting SteadFast'];
        }

        $body = json_decode($raw, true);
        if (!is_array($body)) {
            $body = ['raw' => substr($raw, 0, 500)];
        }

        $ok = $status >= 200 && $status < 300;
        $error = null;
        if (!$ok) {
            $error = $body['message'] ?? $body['error'] ?? ('HTTP ' . $status);
        }

        return ['ok' => $ok, 'status' => $status, 'body' => $body, 'error' => $error];
    }

    public static function createOrder(array $payload): array
    {
        return self::request('POST', '/create_order', $payload);
    }

    public static function createBulk(array $items): array
    {
        return self::request('POST', '/create_order/bulk-order', ['data' => json_encode($items)]);
    }

    public static function statusByCid(int $id): array
    {
        return self::request('GET', '/status_by_cid/' . $id);
    }

    public static function statusByInvoice(string $invoice): array
    {
        return self::request('GET', '/status_by_invoice/' . rawurlencode($invoice));
    }

    public static function statusByTracking(string $code): array
    {
        return self::request('GET', '/status_by_trackingcode/' . rawurlencode($code));
    }

    public static function balance(): array
    {
        return self::request('GET', '/get_balance');
    }

    public static function createReturn(array $payload): array
    {
        return self::request('POST', '/create_return_request', $payload);
    }

    public static function returns(): array
    {
        return self::request('GET', '/get_return_requests');
    }

    public static function payments(): array
    {
        return self::request('GET', '/payments');
    }

    public static function policeStations(): array
    {
        return self::request('GET', '/police_stations');
    }

    /**
     * Map a SteadFast delivery status string to our order status.
     */
    public static function mapOrderStatus(string $sfStatus): ?string
    {
        $s = strtolower(trim($sfStatus));
        return match (true) {
            in_array($s, ['delivered', 'delivered_approval_pending', 'partial_delivered', 'partial_delivered_approval_pending'], true) => 'DELIVERED',
            in_array($s, ['cancelled', 'cancelled_approval_pending'], true) => 'CANCELLED',
            default => null,
        };
    }
}
