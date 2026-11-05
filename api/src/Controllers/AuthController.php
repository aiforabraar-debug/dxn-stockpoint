<?php
declare(strict_types=1);

namespace DXN\Controllers;

use DXN\Auth;
use DXN\Request;
use DXN\Response;
use DXN\Util;

final class AuthController
{
    public static function login(): void
    {
        $pin = Util::clean(Request::input('pin', ''), 32);
        if ($pin === '') {
            Response::error('PIN is required', 422, 'validation_error');
        }

        $result = Auth::login($pin);
        Response::ok($result);
    }

    /** Lets clients check whether a stored token is still valid. */
    public static function me(): void
    {
        Auth::requireAdmin();
        Response::ok(['role' => Auth::ROLE_ADMIN]);
    }

    /** Changes the shop PIN. Requires the current PIN or the admin key. */
    public static function changePin(): void
    {
        Auth::requireAdmin();

        $newPin = Util::clean(Request::input('new_pin', ''), 32);
        if (strlen($newPin) < 4) {
            Response::error('The new PIN must be at least 4 characters', 422, 'validation_error');
        }

        \DXN\Store::putSetting('admin_pin_hash', password_hash($newPin, PASSWORD_DEFAULT));
        \DXN\Store::audit('pin_changed', 'settings');

        Response::ok(['message' => 'PIN updated. Existing tokens remain valid until they expire.']);
    }
}
