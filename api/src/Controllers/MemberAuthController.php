<?php
declare(strict_types=1);

namespace DXN\Controllers;

use DXN\Auth;
use DXN\Database;
use DXN\Request;
use DXN\Response;
use DXN\Store;
use DXN\Util;

/**
 * Member login for PV distribution at the stock point.
 *
 * Members authenticate with their DXN member ID + a 4-6 digit PIN.
 * Tokens are HMAC bearer tokens with role=member (30-day TTL).
 */
final class MemberAuthController
{
    public static function login(): void
    {
        $payload = Request::json();
        $memberId = Util::clean($payload['member_id'] ?? '', 40);
        $pin      = (string) ($payload['pin'] ?? '');

        if ($memberId === '' || $pin === '') {
            Response::error('member_id and pin are required', 422, 'validation_error');
        }

        $customer = Database::one(
            'SELECT * FROM customers WHERE dxn_member_id = ? AND is_member = 1 LIMIT 1',
            [$memberId]
        );
        if ($customer === null) {
            Store::logAttempt(Request::ip(), false);
            Response::error('Invalid member ID or PIN', 401, 'invalid_credentials');
        }

        $auth = Database::one(
            'SELECT * FROM member_auth WHERE customer_id = ? LIMIT 1',
            [(int) $customer['id']]
        );
        if ($auth === null || !password_verify($pin, (string) $auth['pin_hash'])) {
            Store::logAttempt(Request::ip(), false);
            Response::error('Invalid member ID or PIN', 401, 'invalid_credentials');
        }

        Store::logAttempt(Request::ip(), true);

        $ttl = (int) Util::clean(Request::input('ttl', 2592000), 10);
        $expires = time() + $ttl;

        $token = [
            'role'   => 'member',
            'member_id' => $memberId,
            'customer_id' => (int) $customer['id'],
            'exp'    => $expires,
        ];

        $signed = self::sign($token);

        Response::ok([
            'token'      => $signed,
            'expires_at' => gmdate('c', $expires),
            'role'       => 'member',
            'ttl'        => $ttl,
            'member'     => Store::mapMember($customer),
        ]);
    }

    /** HMAC sign (mirrors Auth::sign, member flavour). */
    private static function sign(array $claims): string
    {
        $payload = base64_encode(json_encode($claims, JSON_UNESCAPED_SLASHES) ?: '{}');
        $signature = hash_hmac('sha256', $payload, \DXN\Config::tokenSecret(), true);
        return rtrim(strtr($payload . '.' . base64_encode($signature), '+/', '-_'), '=');
    }
}
