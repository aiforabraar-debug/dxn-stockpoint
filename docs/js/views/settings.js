/**
 * Settings: connect the shop server, edit the shop profile, change the PIN and
 * manage what this device keeps offline.
 */

import { esc, money, num, int, relTime, downloadFile, digits } from '../util.js';
import { icon, toast, confirmAction, openModal, closeModal } from '../ui.js';
import api, { ApiError, getBase, setBase, hasBase, getTokenMeta } from '../api.js';
import * as store from '../store.js';

let lastProbe = null;

function connectionCard() {
  const { syncState, lastSyncAt, rev } = store.state;
  const connected = hasBase();
  return `
    <div class="card card--pad" style="margin-bottom:18px" id="connectionCard">
      <div class="section-head" style="margin-bottom:12px">
        <div>
          <h2 style="font-size:15px">Shop server</h2>
          <p>${connected ? 'The API that keeps the web and Android apps in sync.' : 'One address powers both the web app and the Android app.'}</p>
        </div>
        <span class="badge badge--${connected ? (syncState === 'online' ? 'ok' : 'warn') : 'danger'}">
          ${connected ? (syncState === 'online' ? 'Connected' : 'Not answering') : 'Not connected'}
        </span>
      </div>

      <label class="field"><span>API base URL</span>
        <input class="input" id="apiBaseInput" type="url" inputmode="url" spellcheck="false"
          placeholder="https://dxnstock.byethost7.com"
          value="${esc(getBase())}"></label>

      <div style="display:flex;gap:10px;flex-wrap:wrap">
        <button class="btn btn--ghost" type="button" id="probeBtn">${icon('cloud', 16)} Test connection</button>
        <button class="btn btn--primary" type="button" id="saveBaseBtn">${icon('check', 16)} Save &amp; sync</button>
      </div>

      <div id="probeResult" style="margin-top:14px;font-size:12.5px;color:var(--muted);line-height:1.7">
        ${connected
          ? `Last sync ${lastSyncAt ? relTime(new Date(lastSyncAt).toISOString()) : 'never'} · revision ${int(rev)}`
          : 'The catalogue below is the built-in demo data. Connect your own API to go live.'}
      </div>

      <details style="margin-top:14px">
        <summary style="cursor:pointer;font-size:12.5px;font-weight:700;color:var(--muted)">How do I get an API address?</summary>
        <ol style="font-size:12.5px;color:var(--muted);line-height:1.8;padding-left:18px;margin-top:8px">
          <li>Create a free ByetHost account and a MySQL database.</li>
          <li>Upload the <code>api/</code> folder from the GitHub repo into <code>htdocs</code>.</li>
          <li>Copy <code>api/config/config.sample.php</code> to <code>api/config/config.php</code> and paste the database values.</li>
          <li>Open <code>/api/install.php?key=YOUR_INSTALL_KEY</code> and set the shop PIN.</li>
          <li>Paste that address here — the Android app uses the same one.</li>
        </ol>
      </details>
    </div>
  `;
}

function profileCard() {
  const settings = store.state.settings;
  const disabled = store.state.isAdmin ? '' : 'disabled';
  return `
    <div class="card card--pad" style="margin-bottom:18px">
      <div class="section-head" style="margin-bottom:12px">
        <div><h2 style="font-size:15px">Shop profile</h2><p>Printed on receipts and sent with WhatsApp orders.</p></div>
        ${store.state.isAdmin ? '' : '<span class="badge badge--muted">Sign in to edit</span>'}
      </div>

      <div class="form-2">
        <label class="field" style="grid-column:1/-1"><span>Stockpoint name</span>
          <input class="input" id="setBranch" value="${esc(settings.branch_name || '')}" ${disabled} maxlength="120"></label>

        <label class="field"><span>WhatsApp number</span>
          <input class="input" id="setWa" inputmode="tel" value="${esc(settings.whatsapp_number || '')}" ${disabled}
            placeholder="8801987851131"></label>

        <label class="field"><span>Currency code</span>
          <input class="input" id="setCurrency" value="${esc(settings.currency || 'BDT')}" ${disabled} maxlength="8"></label>

        <label class="field"><span>Business phone</span>
          <input class="input" id="setPhone" value="${esc(settings.business_phone || '')}" ${disabled} maxlength="40"></label>

        <label class="field"><span>Low stock alert at</span>
          <input class="input" id="setThreshold" type="number" min="0" step="1"
            value="${esc(settings.low_stock_threshold ?? 5)}" ${disabled}></label>

        <label class="field" style="grid-column:1/-1"><span>Business address</span>
          <input class="input" id="setAddress" value="${esc(settings.business_address || '')}" ${disabled} maxlength="200"></label>

        <label class="field" style="grid-column:1/-1"><span>Receipt footer</span>
          <textarea class="textarea" id="setFooter" ${disabled} maxlength="300">${esc(settings.receipt_footer || '')}</textarea></label>
      </div>

      <label style="display:flex;align-items:center;gap:12px;margin-bottom:16px">
        <span class="switch">
          <input type="checkbox" id="setPublicOrders" ${Number(settings.allow_public_orders ?? 1) ? 'checked' : ''} ${disabled}>
          <span class="switch__track"></span>
        </span>
        <span style="font-size:13px"><strong>Accept orders without a PIN</strong>
          <small style="display:block;color:var(--muted);font-size:11.5px">Turn off to make the catalogue read-only for customers.</small></span>
      </label>

      <button class="btn btn--primary" type="button" id="saveProfileBtn" ${disabled}>
        ${icon('check', 16)} Save shop profile
      </button>
    </div>
  `;
}

function deviceCard() {
  const { outbox, orders, products, rev } = store.state;
  return `
    <div class="card card--pad" style="margin-bottom:18px">
      <div class="section-head" style="margin-bottom:12px">
        <div><h2 style="font-size:15px">This device</h2><p>Offline cache, queued sales and backups.</p></div>
      </div>

      <div class="list" style="margin-bottom:14px">
        <div class="list__row">
          <div class="list__main"><div class="list__title">Cached data</div>
            <div class="list__sub">${int(products.length)} products · ${int(orders.length)} orders · revision ${int(rev)}</div></div>
          <button class="btn btn--sm btn--ghost" type="button" id="syncNowBtn">${icon('refresh', 14)} Sync now</button>
        </div>
        <div class="list__row">
          <div class="list__main"><div class="list__title">Queued sales</div>
            <div class="list__sub">${outbox.length ? `${int(outbox.length)} waiting for the server` : 'Everything is pushed'}</div></div>
          ${outbox.length ? '<button class="btn btn--sm btn--ghost" type="button" id="retryQueueBtn">Retry</button>' : ''}
        </div>
        <div class="list__row">
          <div class="list__main"><div class="list__title">Backup</div>
            <div class="list__sub">Download the cache as JSON before resetting anything</div></div>
          <button class="btn btn--sm btn--ghost" type="button" id="backupBtn">${icon('download', 14)} Export</button>
        </div>
        <div class="list__row">
          <div class="list__main"><div class="list__title">Install as an app</div>
            <div class="list__sub">Adds an icon and works offline like a native app</div></div>
          <button class="btn btn--sm btn--ghost" type="button" id="installBtn">Install</button>
        </div>
      </div>

      <button class="btn btn--danger" type="button" id="resetBtn">${icon('trash', 16)} Reset this device</button>
    </div>
  `;
}

function accountCard() {
  const meta = getTokenMeta();
  return `
    <div class="card card--pad" style="margin-bottom:18px">
      <div class="section-head" style="margin-bottom:12px">
        <div><h2 style="font-size:15px">Shop access</h2>
          <p>${store.state.isAdmin
            ? `Signed in${meta?.expires_at ? ` until ${new Date(meta.expires_at).toLocaleDateString()}` : ''}`
            : 'Anyone can browse; the PIN unlocks sales history and admin.'}</p></div>
        <span class="badge badge--${store.state.isAdmin ? 'ok' : 'muted'}">${store.state.isAdmin ? 'Admin' : 'Viewer'}</span>
      </div>

      ${store.state.isAdmin ? `
        <div class="form-2">
          <label class="field"><span>New shop PIN</span>
            <input class="input" id="newPin" type="password" inputmode="numeric" minlength="4" placeholder="At least 4 characters"></label>
          <label class="field"><span>Repeat PIN</span>
            <input class="input" id="newPin2" type="password" inputmode="numeric" minlength="4" placeholder="Repeat"></label>
        </div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn--ghost" type="button" id="changePinBtn">${icon('check', 16)} Change PIN</button>
          <button class="btn btn--danger" type="button" id="signOutBtn">${icon('logout', 16)} Sign out</button>
        </div>
      ` : `
        <button class="btn btn--primary" type="button" id="signInBtn">${icon('user', 16)} Sign in with shop PIN</button>
      `}
    </div>
  `;
}

function aboutCard() {
  return `
    <div class="card card--pad">
      <div class="section-head" style="margin-bottom:12px">
        <div><h2 style="font-size:15px">About</h2><p>Mohammadpur Stock Point 2.1 — one codebase, two clients.</p></div>
      </div>
      <div class="list">
        <div class="list__row"><div class="list__main">
          <div class="list__title">Web app</div>
          <div class="list__sub">Static PWA hosted on GitHub Pages</div></div>
          <a class="btn btn--sm btn--ghost" href="https://github.com/aiforabraar-debug/dxn-stockpoint" target="_blank" rel="noopener">Repo</a></div>
        <div class="list__row"><div class="list__main">
          <div class="list__title">Android app</div>
          <div class="list__sub">Kotlin + Compose, same API, offline cache</div></div>
          <a class="btn btn--sm btn--ghost" href="https://github.com/aiforabraar-debug/dxn-stockpoint/releases" target="_blank" rel="noopener">APK</a></div>
        <div class="list__row"><div class="list__main">
          <div class="list__title">Backend</div>
          <div class="list__sub">PHP 8 + MySQL on ByetHost (free forever)</div></div>
          <a class="btn btn--sm btn--ghost" href="${esc(getBase())}/api/v1/health" target="_blank" rel="noopener">Health</a></div>
        <div class="list__row"><div class="list__main">
          <div class="list__title">Privacy</div>
          <div class="list__sub">What is stored, where it goes, how to delete it</div></div>
          <a class="btn btn--sm btn--ghost" href="privacy.html" target="_blank" rel="noopener">Read</a></div>
      </div>
      <p style="font-size:11.5px;color:var(--faint);margin-top:12px">
        Built to run on free tiers: GitHub Pages for the web, GitHub Releases for the APK,
        ByetHost for the API. No paid services required.
      </p>
    </div>
  `;
}


function courierCard() {
  const disabled = store.state.isAdmin ? '' : 'disabled';
  const base = 'https://dxnstock.byethost7.com';
  const webhookUrl = `${getBase() || base}/api/v1/courier/webhook`;
  return `
    <div class="card card--pad" style="margin-bottom:18px" id="courierCard">
      <div class="section-head" style="margin-bottom:12px">
        <div><h2 style="font-size:15px">SteadFast courier</h2>
          <p>Ship orders to customers via SteadFast. Credentials are stored on the shop server.</p></div>
        <span class="badge badge--muted" id="sfStatusBadge">Not configured</span>
      </div>

      <div class="form-2">
        <label class="field" style="grid-column:1/-1"><span>Base URL</span>
          <input class="input" id="sfBase" value="https://portal.packzy.com/api/v1" ${disabled} spellcheck="false"></label>
        <label class="field"><span>API Key</span>
          <input class="input" id="sfApiKey" ${disabled} spellcheck="false" placeholder="jsyjsj…"></label>
        <label class="field"><span>Secret Key</span>
          <input class="input" id="sfSecret" type="password" ${disabled} spellcheck="false"></label>
        <label class="field" style="grid-column:1/-1"><span>Webhook token (optional)</span>
          <input class="input" id="sfWebhook" ${disabled} spellcheck="false" placeholder="leave blank to use the API key"></label>
      </div>

      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:12px">
        <button class="btn btn--primary" type="button" id="sfSaveBtn" ${disabled}>${icon('check',16)} Save credentials</button>
        <button class="btn btn--ghost" type="button" id="sfBalanceBtn" ${disabled}>${icon('wallet',16)} Check balance</button>
      </div>

      <div id="sfBalanceResult" style="margin-top:10px;font-size:12.5px;color:var(--muted)"></div>

      <details style="margin-top:14px">
        <summary style="cursor:pointer;font-size:12.5px;font-weight:700;color:var(--muted)">Webhook setup</summary>
        <p style="font-size:12.5px;color:var(--muted);line-height:1.7;margin-top:8px">
          In your SteadFast merchant panel set the callback URL to<br>
          <code style="word-break:break-all">${esc(webhookUrl)}</code><br>
          and the bearer token to your API key. SteadFast will then push delivery status updates
          to this shop automatically.
        </p>
      </details>
    </div>
  `;
}

export function renderSettings(root) {
  root.innerHTML = `
    <div class="section-head">
      <div><h2>Settings</h2><p>Connection, shop profile and what this device keeps.</p></div>
    </div>
    ${connectionCard()}
    ${accountCard()}
    ${profileCard()}
    ${courierCard()}
    ${deviceCard()}
    ${aboutCard()}
  `;
  bind(root);
}

function bind(root) {
  const baseInput = root.querySelector('#apiBaseInput');

  root.querySelector('#probeBtn')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const target = root.querySelector('#probeResult');
    button.disabled = true;
    const label = button.innerHTML;
    button.innerHTML = '<span class="spinner"></span> Testing…';
    try {
      const { base, health } = await api.probe(baseInput.value);
      lastProbe = health;
      const counts = health?.database?.counts || {};
      target.innerHTML = `
        <div style="color:var(--success);font-weight:700">Reachable: ${esc(base)}</div>
        <div>Version ${esc(health?.version || '?')} · driver ${esc(health?.driver || '?')} · status ${esc(health?.status || '?')}</div>
        <div>${int(counts.products || 0)} products · ${int(counts.orders || 0)} orders · revision ${int(health?.server_rev || 0)}</div>
        ${health?.installed === false ? '<div style="color:var(--warning)">Tables are not installed yet — open install.php on the server.</div>' : ''}
      `;
    } catch (error) {
      lastProbe = null;
      target.innerHTML = `<div style="color:var(--danger);font-weight:700">${esc(error.message)}</div>`;
    } finally {
      button.disabled = false;
      button.innerHTML = label;
    }
  });

  root.querySelector('#saveBaseBtn')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const value = baseInput.value.trim();
    if (!value) {
      toast('Enter the API address first.', 'error');
      return;
    }
    button.disabled = true;
    const label = button.innerHTML;
    button.innerHTML = '<span class="spinner"></span> Connecting…';
    setBase(value);
    baseInput.value = getBase();
    try {
      await api.probe(getBase());
      await store.syncNow();
      toast('Connected — your catalogue is syncing.', 'ok');
      location.reload();
    } catch (error) {
      toast(error.message, 'error');
      button.disabled = false;
      button.innerHTML = label;
    }
  });

  root.querySelector('#signInBtn')?.addEventListener('click', () => {
    window.dispatchEvent(new CustomEvent('dxn:login'));
  });

  root.querySelector('#signOutBtn')?.addEventListener('click', () => {
    store.setAdmin(false);
    toast('Signed out of the admin panel.');
  });

  root.querySelector('#changePinBtn')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const pin = root.querySelector('#newPin').value.trim();
    const pin2 = root.querySelector('#newPin2').value.trim();
    if (pin.length < 4) {
      toast('Use at least 4 characters.', 'error');
      return;
    }
    if (pin !== pin2) {
      toast('The PINs do not match.', 'error');
      return;
    }
    button.disabled = true;
    try {
      await api.changePin(pin);
      toast('PIN changed. New sign-ins use the new PIN.', 'ok');
      root.querySelector('#newPin').value = '';
      root.querySelector('#newPin2').value = '';
    } catch (error) {
      toast(error.message || 'Could not change the PIN.', 'error');
    } finally {
      button.disabled = false;
    }
  });

  root.querySelector('#saveProfileBtn')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const patch = {
      branch_name: root.querySelector('#setBranch').value.trim() || 'Mohammadpur Stock Point',
      whatsapp_number: digits(root.querySelector('#setWa').value),
      currency: (root.querySelector('#setCurrency').value || 'BDT').trim().toUpperCase().slice(0, 8),
      business_phone: root.querySelector('#setPhone').value.trim(),
      low_stock_threshold: Math.max(0, Math.round(num(root.querySelector('#setThreshold').value, 5))),
      business_address: root.querySelector('#setAddress').value.trim(),
      receipt_footer: root.querySelector('#setFooter').value.trim(),
      allow_public_orders: root.querySelector('#setPublicOrders').checked,
    };

    button.disabled = true;
    const label = button.innerHTML;
    button.innerHTML = '<span class="spinner"></span> Saving…';
    try {
      if (hasBase()) {
        const result = await api.saveSettings(patch);
        const { admin_pin_hash, ...safe } = result?.settings || {};
        store.state.settings = { ...store.state.settings, ...safe, ...(result?.public || {}) };
      } else {
        store.state.settings = { ...store.state.settings, ...patch };
      }
      store.persistCache();
      store.notify();
      toast('Shop profile saved.', 'ok');
    } catch (error) {
      toast(error instanceof ApiError ? error.message : 'Could not save the profile.', 'error');
    } finally {
      button.disabled = false;
      button.innerHTML = label;
    }
  });

  const sfBadge = root.querySelector('#sfStatusBadge');
  if (hasBase() && store.state.isAdmin) {
    api.courierSettings().then((res) => {
      const sf = res?.settings || {};
      root.querySelector('#sfBase').value = sf.base_url || 'https://portal.packzy.com/api/v1';
      root.querySelector('#sfApiKey').value = sf.api_key || '';
      root.querySelector('#sfWebhook').value = sf.webhook_token || '';
      if (sf.configured) {
        sfBadge.textContent = 'Configured';
        sfBadge.className = 'badge badge--ok';
      }
    }).catch(() => {});
  }

  root.querySelector('#sfSaveBtn')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    button.disabled = true;
    const label = button.innerHTML;
    button.innerHTML = '<span class="spinner"></span> Saving…';
    const body = {
      base_url: root.querySelector('#sfBase').value.trim(),
      api_key: root.querySelector('#sfApiKey').value.trim(),
      webhook_token: root.querySelector('#sfWebhook').value.trim(),
    };
    const secret = root.querySelector('#sfSecret').value.trim();
    if (secret) body.secret_key = secret;
    try {
      if (!hasBase()) throw new Error('Connect the shop server first.');
      await api.saveCourierSettings(body);
      toast('SteadFast credentials saved.', 'ok');
      sfBadge.textContent = 'Configured';
      sfBadge.className = 'badge badge--ok';
      root.querySelector('#sfSecret').value = '';
    } catch (error) {
      toast(error instanceof ApiError ? error.message : 'Could not save SteadFast settings.', 'error');
    } finally {
      button.disabled = false;
      button.innerHTML = label;
    }
  });

  root.querySelector('#sfBalanceBtn')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const target = root.querySelector('#sfBalanceResult');
    button.disabled = true;
    try {
      if (!hasBase()) throw new Error('Connect the shop server first.');
      const res = await api.courierBalance();
      const bal = res?.balance?.current_balance;
      target.innerHTML = `<span style="color:var(--success);font-weight:700">Current balance: ${money(bal ?? 0)} BDT</span>`;
    } catch (error) {
      target.innerHTML = `<span style="color:var(--danger)">${esc(error.message || 'Could not fetch balance.')}</span>`;
    } finally {
      button.disabled = false;
    }
  });

  root.querySelector('#syncNowBtn')?.addEventListener('click', () => {
    if (!hasBase()) {
      toast('Connect the shop server first.', 'error');
      return;
    }
    store.syncNow();
    toast('Syncing…');
  });

  root.querySelector('#retryQueueBtn')?.addEventListener('click', () => {
    store.retryAll();
    toast('Retrying queued sales…');
  });

  root.querySelector('#backupBtn')?.addEventListener('click', () => {
    const payload = {
      exported_at: new Date().toISOString(),
      settings: store.state.settings,
      rev: store.state.rev,
      products: store.state.products,
      orders: store.state.orders,
      customers: store.state.customers,
      outbox: store.state.outbox,
    };
    downloadFile(`dxn-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(payload, null, 2), 'application/json');
    toast('Backup downloaded.');
  });

  root.querySelector('#installBtn')?.addEventListener('click', async () => {
    const prompt = window.__dxnInstallPrompt;
    if (!prompt) {
      openModal({
        title: 'Install on this device',
        body: `<p style="font-size:13.5px;line-height:1.7;color:var(--muted)">
          This browser has not offered an install prompt yet. On Android Chrome open the menu and choose
          <strong>Add to Home screen</strong>. On desktop Chrome use the install icon in the address bar.
          The Android APK is also on the GitHub releases page.</p>`,
        footer: '<button class="btn btn--primary" type="button" data-close>Got it</button>',
      });
      return;
    }
    prompt.prompt();
    const choice = await prompt.userChoice;
    if (choice?.outcome === 'accepted') toast('Installing…', 'ok');
    window.__dxnInstallPrompt = null;
  });

  root.querySelector('#resetBtn')?.addEventListener('click', async () => {
    const queued = store.state.outbox.length;
    const ok = await confirmAction({
      title: 'Reset this device?',
      message: `This clears the cached catalogue, order history and any queued sales${queued ? ` (${queued} unsent!)` : ''}. Export a backup first if you are unsure.`,
      confirmLabel: 'Reset now',
      danger: true,
    });
    if (!ok) return;
    const keep = ['dxn.apiBase.v2'];
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith('dxn.') && !keep.includes(key)) localStorage.removeItem(key);
    }
    location.reload();
  });
}
