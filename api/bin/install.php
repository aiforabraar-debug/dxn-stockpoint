<?php
declare(strict_types=1);

/**
 * CLI installer / reset for local development and CI.
 *
 *   php api/bin/install.php --pin=1234
 *   php api/bin/install.php --pin=1234 --fresh      (wipe the SQLite file first)
 *
 * Uses config/config.php when present, otherwise the DXN_* environment
 * variables (see api/src/Config.php).
 */

require __DIR__ . '/../src/bootstrap.php';

use DXN\Config;
use DXN\Schema;
use DXN\Store;

$options = [];
foreach (array_slice($argv, 1) as $arg) {
    if (str_starts_with($arg, '--')) {
        [$key, $value] = array_pad(explode('=', substr($arg, 2), 2), 2, '1');
        $options[$key] = $value;
    }
}

if (isset($options['fresh']) && Config::isSqlite()) {
    $path = (string) Config::db('path');
    foreach ([$path, $path . '-wal', $path . '-shm'] as $file) {
        if (is_file($file)) {
            unlink($file);
            echo "removed {$file}\n";
        }
    }
}

$result = Schema::install(true);
echo "schema ready ({$result['driver']})\n";
echo 'tables: ' . implode(', ', $result['tables']) . "\n";

$pin = (string) ($options['pin'] ?? '');
if ($pin !== '') {
    Store::putSetting('admin_pin_hash', password_hash($pin, PASSWORD_DEFAULT));
    echo "shop PIN updated\n";
} else {
    echo "shop PIN unchanged (pass --pin=1234 to set one)\n";
}

Config::markInstalled();
echo "installed lock written\n";
echo 'products: ' . count(Store::products()) . "\n";
echo 'server_rev: ' . Store::currentRev() . "\n";
