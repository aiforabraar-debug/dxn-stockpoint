#!/usr/bin/env node
/**
 * End-to-end test for the PHP API.
 *
 * Boots a throwaway SQLite database behind PHP's built-in server and exercises
 * the real HTTP surface (routing, auth, stock maths, idempotent orders, sync).
 *
 *   node scripts/test-api.mjs
 *
 * Runs on Windows, macOS, Linux and in GitHub Actions without any dependency.
 */

import { spawn, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const apiDir = join(root, 'api');
const port = Number(process.env.DXN_TEST_PORT || 8127);
const base = `http://127.0.0.1:${port}`;
const PIN = '2468';
const ADMIN_KEY = 'test-admin-key-0123456789';
const INSTALL_KEY = 'test-install-key';

let passed = 0;
let failed = 0;
const failures = [];

function check(name, condition, detail) {
  if (condition) {
    passed += 1;
    console.log(`  \u2713 ${name}`);
  } else {
    failed += 1;
    failures.push(`${name}${detail ? ` -> ${JSON.stringify(detail).slice(0, 300)}` : ''}`);
    console.log(`  \u2717 ${name}${detail ? ` -> ${JSON.stringify(detail).slice(0, 300)}` : ''}`);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function findPhp() {
  const candidates = [process.env.PHP_BINARY, 'php', 'php.exe'].filter(Boolean);
  for (const bin of candidates) {
    const res = spawnSync(bin, ['-v'], { encoding: 'utf8' });
    if (res.status === 0) return bin;
  }
  throw new Error('PHP not found on PATH. Install PHP 8.1+ and retry.');
}

function phpFlags(php) {
  const hasSqlite = spawnSync(php, ['-r', "echo extension_loaded('pdo_sqlite') ? '1' : '0';"], {
    encoding: 'utf8',
  });
  if (hasSqlite.stdout.trim() === '1') return [];

  // A portable PHP build (e.g. the Windows zip) ships the DLLs without an
  // ini file, so point extension_dir at the binary's own ext folder.
  const binary = spawnSync(php, ['-r', 'echo PHP_BINARY;'], { encoding: 'utf8' }).stdout.trim();
  const extDir = join(dirname(binary), 'ext');
  const candidates = ['php_pdo_sqlite.dll', 'pdo_sqlite.dll', 'pdo_sqlite.so'];
  if (!candidates.some((name) => existsSync(join(extDir, name)))) {
    throw new Error(`pdo_sqlite is not enabled and was not found in ${extDir}. Enable it in php.ini.`);
  }
  return ['-d', `extension_dir=${extDir}`, '-d', 'extension=pdo_sqlite'];
}

async function request(path, { method = 'GET', body, token, apiKey } = {}) {
  const headers = { Accept: 'application/json' };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  if (apiKey) headers['X-Api-Key'] = apiKey;

  const res = await fetch(base + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });

  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = { raw: text.slice(0, 400) };
  }
  return { status: res.status, json, headers: res.headers, text };
}

async function main() {
  const php = findPhp();
  const flags = phpFlags(php);
  const pathProbe = spawnSync(php, [...flags, '-r', `require ${JSON.stringify(join(apiDir, 'src/bootstrap.php'))}; $_SERVER['REQUEST_URI']='/api/v1/health'; $_SERVER['SCRIPT_NAME']='/api/index.php'; echo \\DXN\\Request::path();`], {
    encoding: 'utf8',
    env: { ...process.env, DXN_DRIVER: 'sqlite', DXN_DB_PATH: join(tmpdir(), 'dxn-path-probe.sqlite') },
  });
  check('nested /api mount preserves /api/v1 route prefix', pathProbe.status === 0 && pathProbe.stdout.trim() === '/api/v1/health', pathProbe.stderr || pathProbe.stdout);

  const workdir = mkdtempSync(join(tmpdir(), 'dxn-api-'));
  const dbPath = join(workdir, 'test.sqlite');

  const env = {
    ...process.env,
    DXN_DRIVER: 'sqlite',
    DXN_DB_PATH: dbPath,
    DXN_ADMIN_KEY: ADMIN_KEY,
    DXN_INSTALL_KEY: INSTALL_KEY,
    DXN_DEBUG: '1',
  };

  console.log(`\nPHP: ${php}`);
  console.log(`DB : ${dbPath}\n`);

  const install = spawnSync(php, [...flags, join(apiDir, 'bin', 'install.php'), `--pin=${PIN}`, '--fresh'], {
    cwd: root,
    env,
    encoding: 'utf8',
  });
  if (install.status !== 0) {
    console.error(install.stdout);
    console.error(install.stderr);
    throw new Error('Installer failed');
  }
  console.log(install.stdout.trim().split('\n').map((l) => `  ${l}`).join('\n'));

  const server = spawn(
    php,
    [...flags, '-S', `127.0.0.1:${port}`, '-t', join(apiDir, 'public'), join(apiDir, 'public', 'index.php')],
    { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] }
  );

  let serverLog = '';
  server.stdout.on('data', (d) => { serverLog += d.toString(); });
  server.stderr.on('data', (d) => { serverLog += d.toString(); });

  const shutdown = () => {
    if (!server.killed) server.kill();
    try { rmSync(workdir, { recursive: true, force: true }); } catch { /* ignore */ }
  };
  process.on('exit', shutdown);

  // Wait for the server to accept connections.
  let up = false;
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`${base}/api/v1/health`);
      if (res.ok) { up = true; break; }
    } catch { /* not yet */ }
    await sleep(250);
  }
  if (!up) {
    console.error(serverLog);
    throw new Error('PHP server did not start');
  }

  try {
    console.log('\nService');
    let r = await request('/api/v1/health');
    check('health returns ok', r.status === 200 && r.json?.status === 'ok', r.json);
    check('health reports sqlite driver', r.json?.database?.ok === true && r.json?.driver === 'sqlite', r.json?.driver);

    r = await request('/api/v1/config');
    check('config exposes branch settings', r.json?.branch?.branch_name?.length > 0, r.json?.branch);
    check('config advertises sync', r.json?.features?.sync === true, r.json?.features);

    console.log('\nAuth');
    r = await request('/api/v1/auth/login', { method: 'POST', body: { pin: '0000' } });
    check('wrong PIN is rejected', r.status === 401, r.json);

    r = await request('/api/v1/auth/login', { method: 'POST', body: { pin: PIN } });
    const token = r.json?.token;
    check('correct PIN returns a token', r.status === 200 && typeof token === 'string' && token.length > 20, r.json);
    check('token has an expiry', typeof r.json?.expires_at === 'string', r.json);

    r = await request('/api/v1/auth/me', { token });
    check('token authenticates /auth/me', r.status === 200 && r.json?.role === 'admin', r.json);

    r = await request('/api/v1/dashboard');
    check('dashboard rejects anonymous callers', r.status === 401, r.json);

    console.log('\nCatalogue');
    r = await request('/api/v1/products');
    check('catalogue is seeded with 51 products', r.json?.products?.length === 51, r.json?.count);
    const firstProduct = r.json.products[0];
    check('products expose both price tiers', firstProduct.retail_price > 0 && firstProduct.member_price > 0, firstProduct);
    const coffee = r.json.products.find((p) => p.sku === 'DXN-LZC-3IN1-20');
    check(
      'seeded prices match the 2026 price list',
      coffee?.retail_price === 2460 && coffee?.member_price === 2050 && coffee?.pv_points === 475,
      coffee,
    );
    check(
      'retired placeholder SKUs are hidden',
      !r.json.products.some((p) => p.sku === 'DXN-RGGL-90' || p.sku === 'DXN-LZC-2IN1-20'),
      r.json.products.map((p) => p.sku).filter((s) => s.startsWith('DXN-RGGL')),
    );
    check(
      'seeded stock is sellable (opening stock on every SKU)',
      r.json.products.every((p) => p.stock_qty > 0),
      r.json.products.filter((p) => p.stock_qty <= 0).map((p) => [p.sku, p.stock_qty]),
    );

    r = await request('/api/v1/products', {
      method: 'POST',
      token,
      body: {
        sku: 'DXN-TEST-01',
        name: 'Test Product',
        category: 'Testing',
        retail_price: 100,
        member_price: 80,
        pv_points: 50,
        stock_qty: 10,
      },
    });
    const newProductId = r.json?.product?.id;
    check('admin can create a product', r.status === 201 && typeof newProductId === 'number', r.json);

    r = await request('/api/v1/products', { method: 'POST', body: { sku: 'DXN-X', name: 'No auth' } });
    check('anonymous product creation is rejected', r.status === 401, r.json);

    r = await request('/api/v1/products', {
      method: 'POST',
      token,
      body: { sku: 'DXN-TEST-01', name: 'Duplicate' },
    });
    check('duplicate SKU is rejected', r.status === 409, r.json);

    r = await request(`/api/v1/products/${newProductId}`, {
      method: 'PUT',
      token,
      body: { member_price: 75 },
    });
    check('product update keeps other fields', r.json?.product?.member_price === 75 && r.json?.product?.retail_price === 100, r.json?.product);

    console.log('\nStock');
    r = await request('/api/v1/stock/adjust', {
      method: 'POST',
      token,
      body: { productId: newProductId, delta: 5, reason: 'delivery' },
    });
    check('stock adjust adds units', r.json?.stock_qty === 15, r.json);

    r = await request('/api/v1/stock/update', {
      method: 'POST',
      token,
      body: { productId: newProductId, newQuantity: 3 },
    });
    check('stock take sets an absolute quantity', r.json?.stock_qty === 3, r.json);

    r = await request('/api/v1/stock/movements', { token });
    check('stock movements are recorded', Array.isArray(r.json?.movements) && r.json.movements.length >= 3, r.json?.movements?.length);

    console.log('\nOrders');
    const clientUuid = 'test-order-uuid-0001';
    r = await request('/api/v1/orders', {
      method: 'POST',
      body: {
        client_uuid: clientUuid,
        customer_name: 'Test Customer',
        dxn_member_id: 'DXN-777',
        is_member: true,
        items: [{ product_id: newProductId, quantity: 2 }],
        payment_method: 'CASH',
        source: 'test',
      },
    });
    const order = r.json?.order;
    check('public order is accepted', r.status === 201 && typeof order?.id === 'number', r.json);
    check('member price is applied', order?.total_amount === 150, order?.total_amount);
    check('PV is calculated', order?.total_pv === 100, order?.total_pv);
    check('order number looks right', /^DXN-\d{6}-[0-9A-F]{4}$/.test(order?.order_number || ''), order?.order_number);

    r = await request('/api/v1/orders', {
      method: 'POST',
      body: {
        client_uuid: clientUuid,
        customer_name: 'Test Customer',
        is_member: true,
        items: [{ product_id: newProductId, quantity: 2 }],
      },
    });
    check('replaying the same client_uuid does not duplicate', r.json?.duplicate === true && r.json?.order?.id === order.id, r.json);

    r = await request(`/api/v1/products/${newProductId}`);
    check('stock was decremented by the sale', r.json?.product?.stock_qty === 1, r.json?.product?.stock_qty);

    r = await request('/api/v1/orders', {
      method: 'POST',
      body: {
        client_uuid: 'test-order-uuid-0002',
        customer_name: 'Test Customer',
        is_member: true,
        items: [{ product_id: newProductId, quantity: 5 }],
      },
    });
    check('oversell is blocked', r.status === 409 && r.json?.error?.code === 'insufficient_stock', r.json);

    r = await request('/api/v1/orders', { token });
    check('admin can list orders', r.json?.orders?.length === 1, r.json?.count);

    r = await request(`/api/v1/orders/${order.id}/status`, {
      method: 'POST',
      token,
      body: { status: 'DELIVERED' },
    });
    check('order status can be updated', r.json?.order?.status === 'DELIVERED', r.json);

    r = await request(`/api/v1/orders/${order.id}/receipt`, { token });
    check('receipt text is generated', typeof r.json?.receipt === 'string' && r.json.receipt.includes('TOTAL'), r.json?.receipt?.slice(0, 80));

    console.log('\nCustomers & dashboard');
    r = await request('/api/v1/customers', { token });
    check('customer is captured from the order', r.json?.customers?.[0]?.dxn_member_id === 'DXN-777', r.json?.customers?.[0]);
    check('customer spend is tracked', r.json?.customers?.[0]?.total_spent === 150, r.json?.customers?.[0]?.total_spent);

    r = await request('/api/v1/dashboard', { token });
    check('dashboard totals match', r.json?.data?.total_orders === 1 && r.json?.data?.total_revenue === 150, r.json?.data);

    r = await request('/api/v1/reports/sales?from=2000-01-01&to=2099-12-31', { token });
    check('sales report aggregates the period', r.json?.totals?.orders === 1 && r.json?.totals?.revenue === 150, r.json?.totals);

    console.log('\nSettings');
    r = await request('/api/v1/settings', { method: 'PUT', token, body: { branch_name: 'Renamed Branch', currency: 'MYR' } });
    check('admin can update settings', r.json?.public?.branch_name === 'Renamed Branch', r.json?.public);

    r = await request('/api/v1/config');
    check('settings are visible without auth', r.json?.branch?.branch_name === 'Renamed Branch' && r.json?.branch?.currency === 'MYR', r.json?.branch);

    console.log('\nSync');
    r = await request('/api/v1/sync?since=0', { token });
    const serverRev = r.json?.server_rev;
    check('full sync returns products', (r.json?.products?.length ?? 0) === 52, r.json?.products?.length);
    check('full sync returns orders to admins', r.json?.orders?.length === 1, r.json?.orders?.length);
    check('sync exposes a server revision', typeof serverRev === 'number' && serverRev > 0, serverRev);

    r = await request(`/api/v1/sync?since=${serverRev}`, { token });
    check('incremental sync returns nothing new', (r.json?.products?.length ?? -1) === 0 && (r.json?.orders?.length ?? -1) === 0, r.json?.products?.length);

    r = await request('/api/v1/sync?since=0');
    check('anonymous sync only exposes the catalogue', (r.json?.orders?.length ?? -1) === 0 && r.json?.scope === 'public', r.json?.scope);

    console.log('\nCatalogue upgrade');
    const catalogue = (await request('/api/v1/products?include_inactive=1', { token })).json.products;
    const coffeeId = catalogue.find((p) => p.sku === 'DXN-LZC-3IN1-20').id;
    r = await request('/api/v1/stock/update', { method: 'POST', token, body: { productId: coffeeId, newQuantity: 120 } });
    check('admin can set stock', r.status === 200 && r.json?.product?.stock_qty === 120, r.json?.product?.stock_qty);

    r = await request('/api/v1/products', {
      method: 'POST',
      token,
      body: {
        sku: 'DXN-RGGL-90',
        name: 'RG/GL Capsules (90s Duo)',
        category: 'Supplements',
        retail_price: 220,
        member_price: 170,
        pv_points: 115,
        stock_qty: 40,
      },
    });
    check('placeholder-era SKU can exist before the upgrade', r.status === 201, r.json);

    const upgrade = spawnSync(php, [...flags, join(apiDir, 'bin', 'install.php')], {
      cwd: root,
      env,
      encoding: 'utf8',
    });
    check('re-running the installer succeeds', upgrade.status === 0, upgrade.stderr || upgrade.stdout);

    r = await request('/api/v1/products?include_inactive=1', { token });
    const retired = r.json.products.find((p) => p.sku === 'DXN-RGGL-90');
    check('retired SKU is deactivated, not deleted', retired?.is_active === 0, retired);
    check('retired SKU is hidden from the catalogue', !(await request('/api/v1/products')).json.products.some((p) => p.sku === 'DXN-RGGL-90'));
    const upgradedCoffee = r.json.products.find((p) => p.sku === 'DXN-LZC-3IN1-20');
    check('matching starter stock is preserved by upgrade', upgradedCoffee?.stock_qty === 120, upgradedCoffee?.stock_qty);
    check('price refresh survives the upgrade', upgradedCoffee?.retail_price === 2460 && upgradedCoffee?.member_price === 2050, upgradedCoffee);

    r = await request('/api/v1/orders', {
      method: 'POST',
      body: {
        client_uuid: 'offline-temporary-id-sku-replay',
        customer_name: 'Offline SKU Replay',
        is_member: true,
        items: [{ product_id: -1001, product_sku: 'DXN-LZC-3IN1-20', quantity: 1 }],
      },
    });
    check('offline temporary product ID resolves by SKU', r.status === 201 && r.json?.order?.items?.[0]?.product_id === coffeeId && r.json?.order?.items?.[0]?.sku === 'DXN-LZC-3IN1-20', r.json);

    console.log('\nHTTP behaviour');
    r = await request('/api/v1/nope');
    check('unknown route returns 404 JSON', r.status === 404 && r.json?.success === false, r.json);

    const preflight = await fetch(`${base}/api/v1/products`, {
      method: 'OPTIONS',
      headers: { Origin: 'https://abraar05.github.io', 'Access-Control-Request-Method': 'GET' },
    });
    check('CORS preflight is answered', preflight.status === 204, preflight.status);
    check('CORS header present', preflight.headers.get('access-control-allow-origin') !== null, preflight.headers.get('access-control-allow-origin'));

    const path404 = await fetch(`${base}/api/v1/products/99999`);
    check('missing product returns 404', path404.status === 404, path404.status);
  } finally {
    console.log(`\n${'-'.repeat(52)}`);
    if (failed === 0) {
      console.log(`PASS  ${passed} checks`);
    } else {
      console.log(`FAIL  ${failed} of ${passed + failed} checks`);
      for (const f of failures) console.log(`  - ${f}`);
      if (serverLog) console.log(`\nServer log:\n${serverLog.slice(-2500)}`);
    }
    console.log(`${'-'.repeat(52)}\n`);
    shutdown();
    process.exit(failed === 0 ? 0 : 1);
  }
}

main().catch((err) => {
  console.error('\nTest harness crashed:', err.message);
  process.exit(1);
});
