<?php
declare(strict_types=1);

/**
 * Mohammadpur Stock Point API configuration.
 *
 * Copy this file to `config/config.php` on the server and fill in the values
 * from your ByetHost control panel (MySQL Databases). `config.php` is
 * git-ignored and is never overwritten by the deploy workflow, so your
 * credentials survive every update.
 *
 * ByetHost details you will need:
 *   - MySQL host looks like  sql209.byethost7.com  (NOT localhost)
 *   - Database name looks like  b7_12345678_dxn
 *   - Username looks like       b7_12345678
 */

return [
    // 'mysql' on real hosting, 'sqlite' for a laptop with zero setup.
    'driver' => 'mysql',

    'db' => [
        'host'    => 'sql209.byethost7.com',
        'port'    => 3306,
        'name'    => 'b7_XXXXXXXX_dxn',
        'user'    => 'b7_XXXXXXXX',
        'pass'    => 'your-database-password',
        'charset' => 'utf8mb4',
        // Only used when driver = sqlite
        'path'    => __DIR__ . '/../storage/dxn.sqlite',
    ],

    // Machine access. Keep it long, random and private. It is also used as a
    // fallback signing secret when `token_secret` is empty.
    'admin_key' => 'CHANGE-ME-to-a-random-64-char-string',

    // Optional: dedicated signing secret for shop PIN tokens.
    'token_secret' => '',

    // How long a PIN login stays valid (seconds). Default 30 days.
    'token_ttl' => 2592000,

    // Required to run install.php on a fresh server.
    'install_key' => 'CHANGE-ME-too',

    // '*' is fine: clients authenticate with a bearer token, not cookies.
    // For a stricter setup list your origins: 'https://abraar05.github.io'
    'allowed_origins' => '*',

    'timezone' => 'UTC',
    'debug'    => false,
    'trust_proxy' => true,
    'version'  => '2.2.0',
];
