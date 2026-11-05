<?php
declare(strict_types=1);

namespace DXN\Controllers;

use DXN\Auth;
use DXN\Request;
use DXN\Response;
use DXN\Store;

final class SettingsController
{
    private const WRITABLE = [
        'branch_name',
        'whatsapp_number',
        'currency',
        'low_stock_threshold',
        'receipt_footer',
        'business_address',
        'business_phone',
        'allow_public_orders',
        'steadfast_base_url',
        'steadfast_api_key',
        'steadfast_secret_key',
        'steadfast_webhook_token',
    ];

    public static function index(): void
    {
        $public = Store::publicSettings();

        if (!Auth::isAdmin()) {
            Response::ok(['settings' => $public]);
        }

        Response::ok([
            'settings' => Store::settings() + $public,
            'public'   => $public,
            'rev'      => Store::currentRev(),
        ]);
    }

    public static function update(): void
    {
        Auth::requireAdmin();

        $payload = Request::json();
        $updated = [];

        foreach (self::WRITABLE as $key) {
            if (!array_key_exists($key, $payload)) {
                continue;
            }
            $value = $payload[$key];
            if (is_bool($value)) {
                $value = $value ? '1' : '0';
            }
            Store::putSetting($key, $value, true);
            $updated[$key] = (string) $value;
        }

        if ($updated === []) {
            Response::error('No writable settings were supplied', 422, 'validation_error');
        }

        Store::audit('settings_updated', 'settings', null, implode(',', array_keys($updated)));

        Response::ok([
            'message'  => 'Settings saved',
            'settings' => Store::settings() + Store::publicSettings(),
            'public'   => Store::publicSettings(),
        ]);
    }
}
