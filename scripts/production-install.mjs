#!/usr/bin/env node
/**
 * One-shot production installer/verifier for the InfinityFree host.
 *
 * InfinityFree puts a JavaScript challenge in front of every URL, so ordinary
 * curl requests never reach PHP. This script solves the AES puzzle, keeps the
 * __test cookie, runs install.php once, and then checks health, login, products
 * and sync over the same authenticated session.
 *
 * Required env:
 *   DXN_INSTALL_KEY   the install_key from api/config/config.php
 * Optional env:
 *   DXN_ORIGIN        default https://dxn.10001mb.com
 *   DXN_SHOP_PIN      default 2468
 *   DXN_BRANCH_NAME   default Mohammadpur Stock Point
 *   DXN_WHATSAPP      default 8801939994578
 *   DXN_CURRENCY      default BDT
 */

import crypto from 'node:crypto';

const origin = (process.env.DXN_ORIGIN || 'https://dxn.10001mb.com').replace(/\/+$/, '');
const installKey = process.env.DXN_INSTALL_KEY || '';
const pin = process.env.DXN_SHOP_PIN || '2468';
const branch = process.env.DXN_BRANCH_NAME || 'Mohammadpur Stock Point';
const whatsapp = process.env.DXN_WHATSAPP || '8801939994578';
const currency = process.env.DXN_CURRENCY || 'BDT';

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const jar = new Map();

function cookieHeader() {
  return [...jar.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
}

function absorbCookies(response) {
  const list = typeof response.headers.getSetCookie === 'function'
    ? response.headers.getSetCookie()
    : [];
  for (const raw of list) {
    const pair = raw.split(';', 1)[0];
    const at = pair.indexOf('=');
    if (at > 0) jar.set(pair.slice(0, at).trim(), pair.slice(at + 1).trim());
  }
}

async function fetchRaw(url, options = {}) {
  const headers = new Headers(options.headers || {});
  headers.set('User-Agent', UA);
  headers.set(
    'Accept',
    headers.get('Accept') ||
      'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8'
  );
  headers.set('Accept-Language', 'en-US,en;q=0.9');
  const cookies = cookieHeader();
  if (cookies) headers.set('Cookie', cookies);

  const response = await fetch(url, { ...options, headers, redirect: 'manual' });
  absorbCookies(response);
  return response;
}

function solveChallenge(html) {
  const match = html.match(
    /toNumbers\("([0-9a-fA-F]+)"\),b=toNumbers\("([0-9a-fA-F]+)"\),c=toNumbers\("([0-9a-fA-F]+)"\)/
  );
  if (!match) return null;
  try {
    const key = Buffer.from(match[1], 'hex');
    const iv = Buffer.from(match[2], 'hex');
    const cipherText = Buffer.from(match[3], 'hex');
    const decipher = crypto.createDecipheriv('aes-128-cbc', key, iv);
    decipher.setAutoPadding(false);
    return Buffer.concat([decipher.update(cipherText), decipher.final()]).toString('hex');
  } catch {
    return null;
  }
}

async function request(path, options = {}) {
  let url = path.startsWith('http') ? path : origin + path;

  for (let attempt = 0; attempt < 6; attempt++) {
    const response = await fetchRaw(url, options);
    const type = (response.headers.get('content-type') || '').toLowerCase();

    if (type.includes('text/html')) {
      const text = await response.text();
      if (text.includes('toNumbers(') && text.includes('__test')) {
        const solved = solveChallenge(text);
        if (!solved) throw new Error('challenge HTML found but puzzle could not be parsed');
        jar.set('__test', solved);
        continue;
      }
      return { response, text, json: null };
    }

    if (type.includes('json')) {
      const text = await response.text();
      let json = null;
      try {
        json = JSON.parse(text);
      } catch {
        /* leave null so callers can show the raw body */
      }
      if (json && json.success === false && response.status === 403 && /challenge/i.test(text)) {
        continue;
      }
      return { response, text, json };
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get('location');
      if (location) {
        url = new URL(location, url).toString();
        continue;
      }
    }

    const text = await response.text();
    return { response, text, json: null };
  }

  throw new Error('the InfinityFree challenge did not clear after 6 attempts');
}

async function waitForDeploy() {
  let last = '';
  for (let attempt = 1; attempt <= 30; attempt++) {
    try {
      const result = await request('/api/v1/health');
      if (result.json) return result.json;
      last = `HTTP ${result.response.status}, ${result.text.slice(0, 120)}`;
    } catch (error) {
      last = error.message;
    }
    if (attempt < 30) {
      console.log(`  waiting for FTP propagation (${attempt}/30): ${last}`);
      await new Promise((resolve) => setTimeout(resolve, 10000));
    }
  }
  throw new Error(`API did not appear at ${origin}/api/v1/health — ${last}`);
}

function requireSuccess(label, result) {
  if (!result.json || result.json.success !== true) {
    throw new Error(`${label} failed: HTTP ${result.response.status} ${result.text.slice(0, 500)}`);
  }
  return result.json;
}

async function main() {
  if (!installKey) throw new Error('DXN_INSTALL_KEY is not set');

  console.log(`Origin: ${origin}`);
  let health = await waitForDeploy();
  console.log(`Health: ${health.status}, driver ${health.driver}, installed ${health.installed}`);

  if (health.installed !== true) {
    console.log('Running install.php…');
    const body = new URLSearchParams({
      key: installKey,
      pin,
      branch_name: branch,
      whatsapp_number: whatsapp,
      currency,
    });
    const installed = await request(
      `/api/install.php?key=${encodeURIComponent(installKey)}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'text/html' },
        body: body.toString(),
      }
    );

    if (!/Installation complete/i.test(installed.text)) {
      if (/already installed/i.test(installed.text)) {
        console.log('Installer reported the database is already populated.');
      } else {
        throw new Error(`install.php did not confirm success: ${installed.text.slice(0, 1200)}`);
      }
    } else {
      console.log('Database created and catalogue seeded.');
    }

    health = await waitForDeploy();
    console.log(`Health after install: ${health.status}, installed ${health.installed}`);
  }

  if (health.installed !== true) throw new Error('installer finished but health still reports not installed');

  const products = requireSuccess('catalogue', await request('/api/v1/products'));
  const rows = products.products || [];
  console.log(`Catalogue: ${rows.length} products`);
  if (rows.length < 50) throw new Error(`expected the seeded catalogue, got ${rows.length} products`);

  const login = requireSuccess(
    'login',
    await request('/api/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ pin }),
    })
  );
  if (!login.token) throw new Error('login succeeded but no token was returned');
  console.log(`Login: success, role ${login.role || 'admin'}`);

  const me = requireSuccess(
    'auth/me',
    await request('/api/v1/auth/me', {
      headers: { Accept: 'application/json', Authorization: `Bearer ${login.token}` },
    })
  );
  console.log(`Token check: role ${me.role}`);

  const sync = requireSuccess('sync', await request('/api/v1/sync?since=0'));
  console.log(`Sync: server revision ${sync.server_rev}, ${(sync.products || []).length} products`);

  console.log('Production install and verification passed.');
}

main().catch((error) => {
  console.error(`FAILED: ${error.message}`);
  process.exit(1);
});
