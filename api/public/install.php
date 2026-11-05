<?php
declare(strict_types=1);

/**
 * One-page installer. Open it in a browser after uploading the API:
 *
 *     https://your-subdomain.byethost7.com/api/install.php?key=<install_key>
 *
 * It creates the tables, seeds the approved 51-product catalog and stores a
 * hashed shop PIN. Submitting again resets the PIN; use /api/v1/migrate for
 * safe catalog upgrades on an already-installed shop.
 */

$bootstrap = __DIR__ . '/../src/bootstrap.php';
if (!is_file($bootstrap)) {
    // FTP deployment places this public file beside src/ at api/install.php.
    $bootstrap = __DIR__ . '/src/bootstrap.php';
}
require $bootstrap;

use DXN\Config;
use DXN\Database;
use DXN\Schema;
use DXN\Store;
use DXN\Util;

$configFile = Config::root('config/config.php');
$hasConfig = is_file($configFile);
$installKey = (string) Config::get('install_key', '');
$providedKey = (string) ($_GET['key'] ?? $_POST['key'] ?? '');
$keyOk = $installKey === '' || hash_equals($installKey, $providedKey);

$messages = [];
$errors = [];

$dbError = null;
if ($hasConfig) {
    try {
        Database::pdo();
    } catch (\Throwable $e) {
        $dbError = $e->getMessage();
    }
}

$installedBefore = Config::installed();

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'POST') {
    if (!$keyOk) {
        $errors[] = 'Install key missing or wrong. Append ?key=… using the install_key from config/config.php.';
    } elseif (!$hasConfig) {
        $errors[] = 'config/config.php is missing.';
    } elseif ($dbError !== null) {
        $errors[] = 'Database connection failed: ' . $dbError;
    } else {
        $pin = trim((string) ($_POST['pin'] ?? ''));
        $branch = Util::clean($_POST['branch_name'] ?? 'Mohammadpur Stock Point', 120);
        $wa = preg_replace('/\D+/', '', (string) ($_POST['whatsapp_number'] ?? '')) ?: '';
        $currency = strtoupper(Util::clean($_POST['currency'] ?? 'BDT', 8));

        if (strlen($pin) < 4) {
            $errors[] = 'Choose a shop PIN with at least 4 characters.';
        } else {
            try {
                $result = Schema::install(true);

                Store::putSetting('admin_pin_hash', password_hash($pin, PASSWORD_DEFAULT));
                Store::putSetting('branch_name', $branch);
                Store::putSetting('currency', $currency);
                if ($wa !== '') {
                    Store::putSetting('whatsapp_number', $wa);
                }

                Config::markInstalled();
                Store::audit('installed', 'system', null, (string) $result['driver']);

                $messages[] = 'Installation complete on ' . $result['driver'] . '.';
                $messages[] = 'Tables created: ' . implode(', ', $result['tables']);
            } catch (\Throwable $e) {
                $errors[] = 'Installation failed: ' . $e->getMessage();
            }
        }
    }
}

$origin = (isset($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off' ? 'https' : 'http')
    . '://' . ($_SERVER['HTTP_HOST'] ?? 'localhost');
?>
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Mohammadpur Stock Point — API Installer</title>
<style>
  :root { --green:#054A29; --emerald:#0A723D; --gold:#B8860B; --bg:#F4F7F5; --line:#e1e8e3; }
  * { box-sizing:border-box; font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
  body { margin:0; padding:32px 16px; background:var(--bg); color:#14281B; }
  .wrap { max-width:720px; margin:0 auto; }
  .card { background:#fff; border:1px solid var(--line); border-radius:20px; padding:28px; box-shadow:0 12px 32px rgba(5,74,41,.07); }
  h1 { font-size:22px; margin:0 0 4px; color:var(--green); }
  p.sub { margin:0 0 22px; color:#64746B; font-size:14px; }
  label { display:block; font-size:13px; font-weight:700; margin:16px 0 6px; }
  input { width:100%; padding:11px 13px; border:1.5px solid var(--line); border-radius:12px; font-size:14px; }
  input:focus { outline:none; border-color:var(--emerald); }
  button { margin-top:22px; width:100%; padding:14px; border:0; border-radius:12px; background:linear-gradient(135deg,var(--green),var(--emerald)); color:#fff; font-size:15px; font-weight:700; cursor:pointer; }
  .note { margin-top:14px; font-size:12.5px; color:#64746B; line-height:1.6; }
  .ok, .err { padding:12px 14px; border-radius:12px; font-size:13.5px; margin-bottom:10px; }
  .ok { background:#e8f6ee; color:#0a5b32; border:1px solid #b8e3c9; }
  .err { background:#fdecec; color:#8a1c1c; border:1px solid #f3c2c2; }
  code { background:#f1f5f2; padding:2px 6px; border-radius:6px; font-size:12.5px; }
  .step { font-size:13.5px; line-height:1.7; }
  .badge { display:inline-block; background:#e2ebe4; color:var(--green); font-size:11px; font-weight:800; letter-spacing:.6px; padding:4px 9px; border-radius:999px; text-transform:uppercase; }
</style>
</head>
<body>
<div class="wrap">
  <div class="card">
    <span class="badge">Mohammadpur Stock Point API</span>
    <h1 style="margin-top:12px">Install / repair</h1>
    <p class="sub">Version <?= Util::e(Config::get('version')) ?> · driver <code><?= Config::isSqlite() ? 'sqlite' : 'mysql' ?></code></p>

    <?php foreach ($messages as $message): ?>
      <div class="ok"><?= Util::e($message) ?></div>
    <?php endforeach; ?>
    <?php foreach ($errors as $error): ?>
      <div class="err"><?= Util::e($error) ?></div>
    <?php endforeach; ?>

    <?php if (!$hasConfig): ?>
      <div class="err">No <code>config/config.php</code> found next to this file.</div>
      <div class="note">
        <b>Fix it in 60 seconds:</b><br>
        1. In ByetHost open <i>MySQL Databases</i> and copy host, name, user, password.<br>
        2. In the file manager, copy <code>config/config.sample.php</code> to <code>config/config.php</code>.<br>
        3. Paste the four values plus a long random <code>admin_key</code>.<br>
        4. Reload this page.
      </div>
    <?php elseif ($dbError !== null): ?>
      <div class="err">Cannot reach the database: <?= Util::e($dbError) ?></div>
      <div class="note">
        On ByetHost the host is <b>not</b> <code>localhost</code> - it looks like
        <code>sql209.byethost7.com</code>. Double-check the database name
        (<code>b7_12345678_dxn</code>) as well.
      </div>
    <?php elseif (!$keyOk): ?>
      <div class="err">Install key missing or incorrect.</div>
      <div class="note">Open <code>install.php?key=YOUR_INSTALL_KEY</code> — the key is the
        <code>install_key</code> value in <code>config/config.php</code>.</div>
    <?php else: ?>
      <?php if ($installedBefore && $messages === []): ?>
        <div class="ok">This API is already installed. Submitting again will re-run the
          migration and reset the shop PIN.</div>
      <?php endif; ?>

      <form method="post" action="install.php">
        <input type="hidden" name="key" value="<?= Util::e($providedKey) ?>">

        <label for="pin">Shop PIN (used by the admin panel on web + Android)</label>
        <input id="pin" name="pin" type="password" inputmode="numeric" placeholder="At least 4 digits" required minlength="4">

        <label for="branch_name">Stockpoint name</label>
        <input id="branch_name" name="branch_name" value="<?= Util::e(Store::setting('branch_name', 'Mohammadpur Stock Point') ?? '') ?>">

        <label for="whatsapp_number">WhatsApp order number (digits, with country code)</label>
        <input id="whatsapp_number" name="whatsapp_number" value="<?= Util::e(Store::setting('whatsapp_number', '') ?? '') ?>" placeholder="8801939994578">

        <label for="currency">Currency code</label>
        <input id="currency" name="currency" value="<?= Util::e(Store::setting('currency', 'BDT') ?? 'BDT') ?>">

        <button type="submit">Create tables &amp; seed catalogue</button>
      </form>

      <div class="note">
        <b>API base URL for the web + Android clients</b><br>
        <code><?= Util::e($origin) ?></code><br><br>
        Health check: <code><?= Util::e($origin) ?>/api/v1/health</code><br>
        Once everything works, delete or rename <code>install.php</code> on the server.
      </div>
    <?php endif; ?>
  </div>
</div>
</body>
</html>
