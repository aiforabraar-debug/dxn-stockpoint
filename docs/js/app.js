/**
 * Application bootstrap: hash router, header chrome, sign-in, cart drawer and
 * service-worker registration.
 */

import { $, esc, int } from './util.js';
import { icon, hydrateIcons, toast, openModal, closeModal, syncLabel } from './ui.js';
import api, { hasBase, getBase, ApiError } from './api.js';
import * as store from './store.js';
import { renderCatalog } from './views/catalog.js';
import { renderOrders } from './views/orders.js';
import { renderAdmin } from './views/admin.js';
import { renderSettings } from './views/settings.js';
import { openCart, closeCart, isCartOpen, renderCart } from './views/cart.js';

const ROUTES = {
  catalog: renderCatalog,
  orders: renderOrders,
  admin: renderAdmin,
  settings: renderSettings,
};

let lastKey = '';
let lastPushSeen = 0;
let booted = false;

function currentRoute() {
  const raw = (location.hash || '').replace(/^#\/?/, '');
  const route = raw.split('?')[0].split('/')[0];
  return ROUTES[route] ? route : 'catalog';
}

// ── Chrome ──────────────────────────────────────────────────────────────────

function updateChrome() {
  const { syncState, settings, isAdmin, outbox } = store.state;
  const route = currentRoute();

  const branch = $('#branchName');
  if (branch) branch.textContent = settings.branch_name || 'Mohammadpur Stock Point';

  const tag = $('#branchTag');
  if (tag) {
    tag.textContent = isAdmin
      ? 'Admin · live'
      : hasBase()
        ? 'Live catalogue'
        : 'Demo data';
  }

  document.querySelectorAll('[data-route]').forEach((link) => {
    link.classList.toggle('is-active', link.dataset.route === route);
  });

  const pill = $('#syncPill');
  if (pill) {
    pill.dataset.state = syncState === 'error' ? 'offline' : syncState;
    const text = $('#syncText');
    if (text) text.textContent = syncLabel(syncState);
    pill.title = hasBase()
      ? `Revision ${int(store.state.rev)} · tap to sync now`
      : 'Not connected — tap to set the API address';
  }

  const badge = $('#cartCount');
  const count = store.cartCount();
  if (badge) {
    badge.textContent = String(count);
    badge.hidden = count === 0;
  }

  const bar = $('#offlineBar');
  if (bar) bar.classList.toggle('is-visible', !navigator.onLine || syncState === 'offline');

  document.title = `${settings.branch_name || 'Mohammadpur Stock Point'} — ${outbox.length ? `(${outbox.length} queued) ` : ''}POS`;

  if (isCartOpen()) renderCart($('#cartBody'), $('#cartFoot'));
}

function render({ force = false } = {}) {
  const root = $('#view');
  if (!root) return;
  const route = currentRoute();
  const key = `${route}|${store.state.isAdmin}|${store.state.tier}`;

  if (!force && key === lastKey && route === 'settings') {
    updateChrome();
    return;
  }
  lastKey = key;

  const active = document.activeElement;
  const focusId = active && root.contains(active) ? active.id : null;
  const caret = focusId && typeof active.selectionStart === 'number' ? active.selectionStart : null;

  try {
    ROUTES[route](root);
  } catch (error) {
    console.error(error);
    root.innerHTML = `<div class="card card--pad"><h2 style="font-size:16px;font-weight:800;margin-bottom:6px">Something went wrong rendering this screen</h2>
      <p style="font-size:13px;color:var(--muted)">${esc(error.message)}</p></div>`;
  }

  hydrateIcons(root);
  updateChrome();

  if (focusId) {
    const el = document.getElementById(focusId);
    if (el) {
      el.focus({ preventScroll: true });
      if (caret !== null && typeof el.setSelectionRange === 'function') {
        try {
          el.setSelectionRange(caret, caret);
        } catch { /* not a text input */ }
      }
    }
  }
}

// ── Sign in ─────────────────────────────────────────────────────────────────

function openLogin() {
  if (!hasBase()) {
    openModal({
      title: 'Connect the shop server first',
      body: `
        <p style="font-size:13.5px;line-height:1.7;color:var(--muted)">
          The admin panel signs in against your own API. Add the address once — the Android app uses
          the same one — and the PIN will work on every device.
        </p>
      `,
      footer: `
        <button class="btn btn--ghost" type="button" data-close>Later</button>
        <button class="btn btn--primary" type="button" id="goSettings">${icon('settings', 16)} Open settings</button>
      `,
      onMount(panel, close) {
        panel.querySelector('#goSettings').addEventListener('click', () => {
          close();
          location.hash = '#/settings';
        });
      },
    });
    return;
  }

  openModal({
    title: 'Shop sign-in',
    body: `
      <img class="about-logo" src="icons/logo-full.png" alt="Mohammadpur Stock Point" width="320" height="320">
      <form id="loginForm" autocomplete="off">
        <label class="field"><span>Shop PIN</span>
          <input class="input" id="pinInput" type="password" inputmode="numeric" autocomplete="current-password"
            placeholder="••••" required minlength="4" style="font-size:20px;letter-spacing:8px;text-align:center"></label>
        <p style="font-size:12px;color:var(--muted);text-align:center">
          ${esc(getBase() || '')}
        </p>
      </form>
    `,
    footer: `
      <button class="btn btn--ghost" type="button" data-close>Cancel</button>
      <button class="btn btn--primary" type="submit" form="loginForm" id="loginBtn">${icon('user', 16)} Unlock</button>
    `,
    onMount(panel) {
      const form = panel.querySelector('#loginForm');
      const button = panel.querySelector('#loginBtn');
      form.addEventListener('submit', async (event) => {
        event.preventDefault();
        const pin = panel.querySelector('#pinInput').value.trim();
        if (!pin) return;
        button.disabled = true;
        button.innerHTML = '<span class="spinner"></span> Checking…';
        try {
          await api.login(pin);
          store.setAdmin(true);
          await store.verifySession();
          store.syncNow();
          closeModal();
          toast('Welcome back — admin unlocked.', 'ok');
          render({ force: true });
        } catch (error) {
          const message = error instanceof ApiError
            ? (error.status === 401 ? 'Wrong PIN. Try again.' : error.message)
            : 'Could not sign in.';
          toast(message, 'error');
          button.disabled = false;
          button.innerHTML = `${icon('user', 16)} Unlock`;
          panel.querySelector('#pinInput').select();
        }
      });
    },
  });
}

function openAccount() {
  const { isAdmin, settings } = store.state;
  openModal({
    title: isAdmin ? 'Shop account' : 'Account',
    body: `
      <img class="about-logo" src="icons/logo-full.png" alt="Mohammadpur Stock Point" width="320" height="320">
      <div class="list">
        <div class="list__row">
          <div class="list__main">
            <div class="list__title">${esc(settings.branch_name || 'Mohammadpur Stock Point')}</div>
            <div class="list__sub">${isAdmin ? 'Admin unlocked on this device' : 'Browsing as a customer'}</div>
          </div>
          <span class="badge badge--${isAdmin ? 'ok' : 'muted'}">${isAdmin ? 'Admin' : 'Viewer'}</span>
        </div>
        <div class="list__row">
          <div class="list__main">
            <div class="list__title">Shop server</div>
            <div class="list__sub">${hasBase() ? esc(getBase()) : 'Not connected'}</div>
          </div>
          <a class="btn btn--sm btn--ghost" href="#/settings" data-close>Change</a>
        </div>
        <div class="list__row">
          <div class="list__main">
            <div class="list__title">Offline cache</div>
            <div class="list__sub">${int(store.state.products.length)} products · ${int(store.state.orders.length)} orders</div>
          </div>
          <span class="badge badge--muted">${int(store.state.outbox.length)} queued</span>
        </div>
      </div>
    `,
    footer: isAdmin
      ? `<button class="btn btn--ghost" type="button" data-close>Close</button>
         <button class="btn btn--danger" type="button" id="signOut">${icon('logout', 16)} Sign out</button>`
      : `<button class="btn btn--ghost" type="button" data-close>Close</button>
         <button class="btn btn--primary" type="button" id="signIn">${icon('user', 16)} Sign in</button>`,
    onMount(panel, close) {
      panel.querySelector('#signIn')?.addEventListener('click', () => {
        close();
        openLogin();
      });
      panel.querySelector('#signOut')?.addEventListener('click', () => {
        store.setAdmin(false);
        close();
        toast('Signed out.');
        render({ force: true });
      });
    },
  });
}

// ── Wiring ──────────────────────────────────────────────────────────────────

function wireChrome() {
  $('#cartBtn')?.addEventListener('click', () => {
    if (isCartOpen()) closeCart();
    else openCart();
  });
  $('#cartClose')?.addEventListener('click', () => closeCart());
  $('#overlay')?.addEventListener('click', () => closeCart());
  $('#accountBtn')?.addEventListener('click', () => openAccount());

  $('#syncPill')?.addEventListener('click', () => {
    if (!hasBase()) {
      location.hash = '#/settings';
      toast('Add your API address to go live.');
      return;
    }
    store.syncNow();
    toast('Syncing with the shop server…');
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && isCartOpen()) closeCart();
  });

  window.addEventListener('dxn:login', () => openLogin());

  window.addEventListener('hashchange', () => {
    render({ force: true });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  });

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    window.__dxnInstallPrompt = event;
  });

  window.addEventListener('online', () => {
    toast('Back online — syncing.', 'ok');
    store.syncNow();
  });

  window.addEventListener('offline', () => {
    toast('Offline. Sales will be queued on this device.', 'error');
  });
}

function scheduleRender() {
  // Frame-aligned so a burst of state changes paints once.
  if (scheduleRender.pending) return;
  scheduleRender.pending = true;
  requestAnimationFrame(() => {
    scheduleRender.pending = false;
    render();
  });
}

function boot() {
  if (booted) return;
  booted = true;

  store.hydrate();
  hydrateIcons(document);
  wireChrome();

  store.subscribe(() => {
    if (store.state.lastPush !== lastPushSeen) {
      lastPushSeen = store.state.lastPush;
      toast('Sale synced to every device.', 'ok');
    }
    scheduleRender();
  });

  store.startSyncLoop();
  render({ force: true });

  // A PWA that never updates is a bug factory; check for a new build hourly.
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      navigator.serviceWorker.register('sw.js').catch(() => {
        /* Pages served over http:// on a LAN has no SW — fine. */
      });
    });
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
